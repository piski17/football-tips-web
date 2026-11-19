import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { settleFixtureBets } from "./tipEvaluator";
import { cachedRedis } from "./upstashCache";

// Vyhodnocovanie VŠETKÝCH trhov (4. 11. 2026, Michal: „nech sa dajú vyhodnocovať všetky tipy stávok, čo mám nastavené“).
// Pri automatickej analýze zápasu (asi hodinu pred výkopom) sa z každého trhu (góly, góly tímu, rohy, rohy tímu,
// karty, karty tímu, strely, fauly, fauly tímu, držanie lopty…) zapíše jedna predpoveď modelu – hranica s najvyššou
// šancou do 80 % – BEZ ohľadu na pravidlá pre klientov (pásmo 70 – 80 %, kurz, 60/40). Po zápase sa vyhodnotí
// a pripočíta do súhrnu podľa trhov. Klientom nejde, do štatistík tipov sa neráta.
// Úložisko: Upstash – čakajúce zápasy (hash) + súhrn (jeden kľúč, malý). Bez Upstash data/markets.json.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);
const PENDING_KEY = "tipradar_mkt_pending";
const STATS_KEY = "tipradar_mkt_stats";
const FILE = path.join(__dirname, "..", "data", "markets.json");
const MAX_PROB = 80;
const SKIP_MARKETS = ["Strelec gólov"];
const RECENT_MAX = 300;

export interface MarketPrediction { market: string; selection: string; probability: number }
export interface TopPick extends MarketPrediction { odds: number }
interface PendingFixture {
  fixtureId: number; matchDate: string; homeTeam: string; awayTeam: string; league: string;
  picks: MarketPrediction[];
  /** Najsilnejší tip zápasu (9. 11. 2026) – pozri pickTop. */
  top?: TopPick;
  /** Skúška „kurz od 2,00“ (16. 11. 2026) – pozri pickOdds2. */
  odds2?: TopPick;
  /** Skúška „kurz od 1,70“ (16. 11. 2026). */
  odds17?: TopPick;
  /** Skúška „Ako v októbri“ (19. 11. 2026) – pozri pickOctober; z každého typu najviac 1. */
  oct?: TopPick[];
  /** Skúška „Kurz od 1,60“ (19. 11. 2026): súčasná dôvera (model + stávkovky), pásmo 68 – 80 % / 70 – 80 %. */
  k160a?: TopPick[];
  k160b?: TopPick[];
}
export interface BandStats { n: number; won: number; sumP: number }
export interface MarketStats { n: number; won: number; lost: number; void: number; sumP: number; bands: Record<string, BandStats> }
export interface RecentResult { fixtureId: number; matchDate: string; match: string; league: string; market: string; selection: string; probability: number; status: "won" | "lost" | "void" }
export interface TopResult { fixtureId: number; matchDate: string; match: string; league: string; market: string; selection: string; probability: number; odds: number; status: "won" | "lost" | "void" }
export interface TopStats { since: string; n: number; won: number; lost: number; void: number; sumP: number; profit: number; leagues: Record<string, { n: number; won: number; profit: number }>; recent: TopResult[] }
export interface MarketSummary { since: string; fixtures: number; markets: Record<string, MarketStats>; recent: RecentResult[]; top?: TopStats; odds2?: TopStats; odds17?: TopStats; oct?: TopStats; k160a?: TopStats; k160b?: TopStats }

const BANDS: [string, number, number][] = [["pod 60 %", 0, 60], ["60 – 69 %", 60, 70], ["70 – 80 %", 70, 80.01]];
const bandOf = (p: number) => (BANDS.find(([, lo, hi]) => p >= lo && p < hi) ?? BANDS[0])[0];

async function redis(command: (string | number)[]): Promise<any> {
  return cachedRedis(command, redisRaw); // 8. 11. 2026: šetrí prenos dát z Upstash
}
async function redisRaw(command: (string | number)[]): Promise<any> {
  const res = await axios.post(UPSTASH_URL!, command, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }, timeout: 20000 });
  return res.data?.result;
}
interface FileData { pending: Record<string, PendingFixture>; stats: MarketSummary | null }
function readFile(): FileData {
  try { const d = JSON.parse(fs.readFileSync(FILE, "utf8")); return { pending: d.pending ?? {}, stats: d.stats ?? null }; }
  catch { return { pending: {}, stats: null }; }
}
function writeFile(d: FileData): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(d));
}
const emptySummary = (): MarketSummary => ({ since: new Date().toISOString(), fixtures: 0, markets: {}, recent: [] });

async function readSummary(): Promise<MarketSummary> {
  if (!useUpstash) return readFile().stats ?? emptySummary();
  const raw = await redis(["GET", STATS_KEY]);
  try { return raw ? JSON.parse(raw) : emptySummary(); } catch { return emptySummary(); }
}
async function writeSummary(s: MarketSummary): Promise<void> {
  if (!useUpstash) { const d = readFile(); d.stats = s; writeFile(d); return; }
  await redis(["SET", STATS_KEY, JSON.stringify(s)]);
}
async function listPending(): Promise<PendingFixture[]> {
  if (!useUpstash) return Object.values(readFile().pending);
  const flat: string[] = (await redis(["HGETALL", PENDING_KEY])) ?? [];
  const out: PendingFixture[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) { try { out.push(JSON.parse(flat[i + 1])); } catch { /* poškodený */ } }
  return out;
}
async function removePending(fixtureId: number): Promise<void> {
  if (!useUpstash) { const d = readFile(); delete d.pending[String(fixtureId)]; writeFile(d); return; }
  await redis(["HDEL", PENDING_KEY, String(fixtureId)]);
}

// Najsilnejší tip z každého zápasu (9. 11. 2026, Michal: „z každého zápasu v každej súťaži vždy najsilnejší tip
// a poslať ho do histórie“). Najsilnejší = najvyššia šanca modelu do 80 % spomedzi tipov, na ktoré stávkovky
// dávajú kurz aspoň 1,50 (inak by vyhral napr. „Over 0,5 gólu“ pri kurze 1,05). Pri zhode vyšší kurz.
// Pravidlá pre klientov (hodnota, 60/40, rozpor, typy) sa NEuplatňujú – je to čistý test „najistejšieho“ tipu.
// Zisk v jednotkách: výhra = kurz − 1, prehra = −1. Klientom nejde, do štatistík sa neráta.
const TOP_MIN_ODDS = 1.5;
const TOP_RECENT_MAX = 300;
function pickTop(candidates: { market: string; selection: string; probability: number; odds?: number | null }[]): TopPick | undefined {
  let best: TopPick | undefined;
  for (const c of candidates ?? []) {
    const p = Number(c.probability), o = Number(c.odds);
    if (!c.market || SKIP_MARKETS.includes(c.market) || !isFinite(p) || p > MAX_PROB || !isFinite(o) || o < TOP_MIN_ODDS) continue;
    if (!best || p > best.probability || (p === best.probability && o > best.odds))
      best = { market: c.market, selection: String(c.selection), probability: Math.round(p * 10) / 10, odds: Math.round(o * 100) / 100 };
  }
  return best;
}

// Skúška „kurz od 2,00“ (16. 11. 2026, Michal: „čo keby model vyhodnocoval kurzy od 2,00“). Z každého zápasu
// najviac jeden tip s kurzom stávkoviek aspoň 2,00 a hodnotou +5 až +25 % (pri kurze 2,00 = šanca 52,5 – 62,5 %),
// v odporúčaných trhoch, bez rozporu so stávkovkami a bez nesúhlasu vzájomných zápasov. Prednosť má vyššia šanca.
// Len tiché sledovanie – klientom nejde, do štatistík sa neráta.
const ODDS2_MIN = 2.0;
const ODDS2_MARKETS_SKIP = ["Ofsajdy", "Výsledok zápasu", "Oba tímy skórujú", "Obaja tímy skórujú", "Strelec gólov"];
type Cand = { market: string; selection: string; probability: number; odds?: number | null; expectedValue?: number | null; marketConflict?: string; h2hAgainst?: string; blendModel?: number; category?: string };
function pickOdds2(candidates: Cand[], minOdds = ODDS2_MIN): TopPick | undefined {
  let best: TopPick | undefined;
  for (const c of candidates ?? []) {
    const p = Number(c.probability), o = Number(c.odds);
    if (!c.market || ODDS2_MARKETS_SKIP.includes(c.market) || !isFinite(p) || !isFinite(o) || o < minOdds) continue;
    if (c.marketConflict || c.h2hAgainst) continue;
    const ev = (p / 100) * o;
    if (ev < 1.05 || ev > 1.25) continue;
    if (!best || p > best.probability || (p === best.probability && o > best.odds))
      best = { market: c.market, selection: String(c.selection), probability: Math.round(p * 10) / 10, odds: Math.round(o * 100) / 100 };
  }
  return best;
}

// Skúška „Ako v októbri“ (19. 11. 2026, Michal: „nastav do sledovaných, ako bolo na začiatku, na konci mesiaca pozrieme“).
// Pravidlá z 10. – 19. 10. 2026: dôvera LEN z modelu (bez zmiešania so stávkovkami), pásmo 68 – 80 %, kurz z API aspoň 1,60,
// hodnota +5 až +25 % (počítaná zo šance modelu), bez ofsajdov / 1X2 / oba skórujú / handicapov; zo zápasu najviac 1 tip z typu
// (góly, rohy, karty…), prednosť vyššia dôvera. Len tiché sledovanie – klientom nejde, do štatistík sa neráta.
const OCT_MIN_ODDS = 1.6, OCT_MIN_P = 70, OCT_MAX_P = 80; // 19. 11. 2026 (Michal): hranica 70 % namiesto 68 %
const OCT_SKIP = ["Ofsajdy", "Výsledok zápasu", "Oba tímy skórujú", "Obaja tímy skórujú", "Strelec gólov"];
function pickOctober(candidates: Cand[]): TopPick[] {
  const byType = new Map<string, TopPick>();
  for (const c of candidates ?? []) {
    if (!c.market || OCT_SKIP.includes(c.market) || c.market.startsWith("Ázijský handicap")) continue;
    const p = Number(typeof c.blendModel === "number" ? c.blendModel : c.probability), o = Number(c.odds);
    if (!isFinite(p) || !isFinite(o) || o < OCT_MIN_ODDS || p < OCT_MIN_P || p > OCT_MAX_P) continue;
    const ev = (p / 100) * o;
    if (ev < 1.05 || ev > 1.25) continue;
    const type = String(c.category || c.market).split("_")[0];
    const cur = byType.get(type);
    if (!cur || p > cur.probability || (p === cur.probability && o > cur.odds))
      byType.set(type, { market: c.market, selection: String(c.selection), probability: Math.round(p * 10) / 10, odds: Math.round(o * 100) / 100 });
  }
  return [...byType.values()];
}

// Skúška „Kurz od 1,60“ (19. 11. 2026, Michal: „daj to do sledovania“): rovnaká dôvera ako pri tipoch pre klientov
// (model + stávkovky), kurz z API aspoň 1,60, hodnota +5 až +25 %, bez rozporu a nesúhlasu vzájomných zápasov,
// zo zápasu 1 tip z typu. Dve pásma: 68 – 80 % (k160a) a 70 – 80 % (k160b). Klientom nejde.
function pick160(candidates: Cand[], minP: number): TopPick[] {
  const byType = new Map<string, TopPick>();
  for (const c of candidates ?? []) {
    if (!c.market || OCT_SKIP.includes(c.market) || c.marketConflict || c.h2hAgainst) continue;
    const p = Number(c.probability), o = Number(c.odds);
    if (!isFinite(p) || !isFinite(o) || o < 1.6 || p < minP || p > 80) continue;
    const ev = (p / 100) * o;
    if (ev < 1.05 || ev > 1.25) continue;
    const type = String(c.category || c.market).split("_")[0];
    const cur = byType.get(type);
    if (!cur || p > cur.probability || (p === cur.probability && o > cur.odds))
      byType.set(type, { market: c.market, selection: String(c.selection), probability: Math.round(p * 10) / 10, odds: Math.round(o * 100) / 100 });
  }
  return [...byType.values()];
}

/** Z kandidátov modelu vyberie z každého trhu jednu predpoveď (najvyššia šanca do 80 %) a zapíše zápas. */
export async function recordMarketPredictions(
  fixture: { fixtureId: number; matchDate: string; homeTeam: string; awayTeam: string; league: string },
  candidates: Cand[],
  /** Ďalšie trhy z modelu gólov len na sledovanie (16. 11. 2026) – dvojšanca, handicap, presný počet gólov… */
  trackOnly: Cand[] = []
): Promise<void> {
  const best = new Map<string, MarketPrediction>();
  for (const c of [...(candidates ?? []), ...(trackOnly ?? [])]) {
    const p = Number(c.probability);
    if (!c.market || SKIP_MARKETS.includes(c.market) || !isFinite(p) || p > MAX_PROB) continue;
    const cur = best.get(c.market);
    if (!cur || p > cur.probability) best.set(c.market, { market: c.market, selection: String(c.selection), probability: Math.round(p * 10) / 10 });
  }
  const top = pickTop(candidates);
  // Kurz od 2,00 (16. 11. 2026) – 18. 11. 2026 Michal skúšku ZRUŠIL: nové tipy sa už nevyberajú, staré čakajúce sa dovyhodnotia.
  const odds2: TopPick | undefined = undefined;
  // Kurz od 1,70 (16. 11. 2026) – 18. 11. 2026 Michal skúšku ZRUŠIL („katastrofa“): nové tipy sa už nevyberajú,
  // staré čakajúce sa ešte vyhodnotia (aby sedelo poradie výsledkov), v appke sa dlaždica neukazuje.
  const odds17: TopPick | undefined = undefined;
  const oct = pickOctober(candidates);
  const k160a = pick160(candidates, 68), k160b = pick160(candidates, 70);
  if (!best.size && !top && !odds2 && !odds17 && !oct.length && !k160a.length) return;
  const entry: PendingFixture = { ...fixture, picks: [...best.values()], ...(top ? { top } : {}), ...(odds2 ? { odds2 } : {}), ...(odds17 ? { odds17 } : {}), ...(oct.length ? { oct } : {}), ...(k160a.length ? { k160a } : {}), ...(k160b.length ? { k160b } : {}) };
  if (!useUpstash) { const d = readFile(); d.pending[String(fixture.fixtureId)] = entry; writeFile(d); return; }
  await redis(["HSET", PENDING_KEY, String(fixture.fixtureId), JSON.stringify(entry)]);
}

let settling = false;
/** Vyhodnotí odohrané zápasy a pripočíta ich do súhrnu podľa trhov. */
export async function settleMarketPredictions(): Promise<number> {
  if (settling) return 0;
  settling = true;
  let done = 0;
  try {
    const due = (await listPending()).filter((f) => Date.now() >= new Date(f.matchDate).getTime() + 100 * 60 * 1000);
    if (!due.length) return 0;
    const summary = await readSummary();
    for (const f of due.slice(0, 25)) {
      try {
        const extra = [f.top, f.odds2, f.odds17, ...(f.oct ?? []), ...(f.k160a ?? []), ...(f.k160b ?? [])].filter((x): x is TopPick => !!x);
        const all = [...f.picks, ...extra];
        let outcomes = await settleFixtureBets(f, all);
        if (!outcomes) {
          if (Date.now() < new Date(f.matchDate).getTime() + 3 * 24 * 3600 * 1000) continue;
          outcomes = all.map(() => "void" as const);
        }
        const addTop = (key: "top" | "odds2" | "odds17" | "oct" | "k160a" | "k160b", pick: TopPick, st: "won" | "lost" | "void") => {
          const t = (summary[key] ??= { since: new Date().toISOString(), n: 0, won: 0, lost: 0, void: 0, sumP: 0, profit: 0, leagues: {}, recent: [] });
          const gain = st === "won" ? pick.odds - 1 : st === "lost" ? -1 : 0;
          if (st === "void") t.void++;
          else {
            t.n++; t.sumP += pick.probability; t.profit = Math.round((t.profit + gain) * 100) / 100;
            if (st === "won") t.won++; else t.lost++;
            const lg = (t.leagues[f.league || "?"] ??= { n: 0, won: 0, profit: 0 });
            lg.n++; if (st === "won") lg.won++; lg.profit = Math.round((lg.profit + gain) * 100) / 100;
          }
          t.recent.unshift({ fixtureId: f.fixtureId, matchDate: f.matchDate, match: `${f.homeTeam} – ${f.awayTeam}`, league: f.league, market: pick.market, selection: pick.selection, probability: pick.probability, odds: pick.odds, status: st });
          t.recent = t.recent.slice(0, TOP_RECENT_MAX);
        };
        let xi = f.picks.length;
        if (f.top) addTop("top", f.top, outcomes[xi++]);
        if (f.odds2) addTop("odds2", f.odds2, outcomes[xi++]);
        if (f.odds17) addTop("odds17", f.odds17, outcomes[xi++]);
        for (const o of f.oct ?? []) addTop("oct", o, outcomes[xi++]);
        for (const o of f.k160a ?? []) addTop("k160a", o, outcomes[xi++]);
        for (const o of f.k160b ?? []) addTop("k160b", o, outcomes[xi++]);
        summary.fixtures++;
        f.picks.forEach((p, i) => {
          const st = outcomes![i];
          const m = (summary.markets[p.market] ??= { n: 0, won: 0, lost: 0, void: 0, sumP: 0, bands: {} });
          if (st === "void") { m.void++; }
          else {
            m.n++; m.sumP += p.probability;
            if (st === "won") m.won++; else m.lost++;
            const b = (m.bands[bandOf(p.probability)] ??= { n: 0, won: 0, sumP: 0 });
            b.n++; b.sumP += p.probability; if (st === "won") b.won++;
          }
          summary.recent.unshift({ fixtureId: f.fixtureId, matchDate: f.matchDate, match: `${f.homeTeam} – ${f.awayTeam}`, league: f.league, market: p.market, selection: p.selection, probability: p.probability, status: st });
        });
        summary.recent = summary.recent.slice(0, RECENT_MAX);
        await writeSummary(summary);
        await removePending(f.fixtureId);
        done++;
      } catch { /* skúsi sa pri ďalšej kontrole */ }
    }
  } finally {
    settling = false;
  }
  return done;
}

export async function marketSummary(): Promise<MarketSummary & { pending: number }> {
  const [s, p] = await Promise.all([readSummary(), listPending()]);
  return { ...s, pending: p.length };
}
