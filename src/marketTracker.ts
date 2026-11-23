import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { settleFixtureBets } from "./tipEvaluator";
import { cachedRedis } from "./upstashCache";
import { clientMinProb, clientMinOdds, HCP_CORNERS_MARKET } from "./oddsMatcher";
import { openingMove, pinnacleNow } from "./oddsMove";

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
export interface TopPick extends MarketPrediction {
  odds: number;
  /** Učiaci sa model (23. 11. 2026): pôvodná šanca pred opravou z vlastných výsledkov. */
  orig?: number;
  /** Pohyb férovej šance Pinnacle od rána po výber tipu (body, + = kurz klesol). */
  move?: number | null;
  /** Férová šanca Pinnacle pri výbere tipu (%). */
  pin?: number | null;
  /** Skupiny na porovnanie (napr. „move:down“, „learn:ok“, „pin:ok“). */
  grps?: string[];
}
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
  /** 23. 11. 2026: tipy podľa pravidiel pre klientov (bestBets) – pohyb kurzov, učiaci sa model a Pinnacle ako v TIPREXE. */
  rules?: TopPick[];
  /** 23. 11. 2026: učiaci sa model – pravidlá pre klientov, ale šanca opravená podľa vlastných výsledkov. */
  learn?: TopPick[];
  /** 23. 11. 2026: tipy s pravidlami TIPREXU v súťažiach a druhoch stávok TipRadaru. */
  tx?: TopPick[];
}
export interface BandStats { n: number; won: number; sumP: number }
export interface MarketStats { n: number; won: number; lost: number; void: number; sumP: number; bands: Record<string, BandStats> }
export interface RecentResult { fixtureId: number; matchDate: string; match: string; league: string; market: string; selection: string; probability: number; status: "won" | "lost" | "void" }
export interface TopResult { fixtureId: number; matchDate: string; match: string; league: string; market: string; selection: string; probability: number; odds: number; status: "won" | "lost" | "void"; orig?: number; move?: number | null; pin?: number | null; grps?: string[] }
export interface GroupStats { n: number; won: number; profit: number; sumP: number }
export interface TopStats { since: string; n: number; won: number; lost: number; void: number; sumP: number; profit: number; leagues: Record<string, { n: number; won: number; profit: number }>; recent: TopResult[]; groups?: Record<string, GroupStats> }
export interface MarketSummary { since: string; fixtures: number; markets: Record<string, MarketStats>; recent: RecentResult[]; top?: TopStats; odds2?: TopStats; odds17?: TopStats; oct?: TopStats; k160a?: TopStats; k160b?: TopStats; rules?: TopStats; learn?: TopStats; tx?: TopStats; learnData?: { since: string; leagues: Record<string, BandStats> } }

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
const OCT_MIN_ODDS = 1.6, OCT_MIN_P = 68, OCT_MAX_P = 80; // 22. 11. 2026 1:26 (Michal): znova 68 % ako v októbri (19. 11. – 22. 11. bolo 70 %)
const OCT_SKIP = ["Ofsajdy", "Výsledok zápasu", "Oba tímy skórujú", "Obaja tímy skórujú", "Strelec gólov"];
function pickOctober(candidates: Cand[]): TopPick[] {
  const byType = new Map<string, TopPick>();
  for (const c of candidates ?? []) {
    if (!c.market || OCT_SKIP.includes(c.market) || c.market.startsWith("Ázijský handicap") || c.market.startsWith("Handicap")) continue;
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
function pick160(candidates: Cand[], minP: number, maxP = 80): TopPick[] {
  const byType = new Map<string, TopPick>();
  for (const c of candidates ?? []) {
    if (!c.market || OCT_SKIP.includes(c.market) || c.marketConflict || c.h2hAgainst) continue;
    const p = Number(c.probability), o = Number(c.odds);
    if (!isFinite(p) || !isFinite(o) || o < 1.6 || p < minP || p > maxP) continue;
    const ev = (p / 100) * o;
    if (ev < 1.05 || ev > 1.25) continue;
    const type = String(c.category || c.market).split("_")[0];
    const cur = byType.get(type);
    if (!cur || p > cur.probability || (p === cur.probability && o > cur.odds))
      byType.set(type, { market: c.market, selection: String(c.selection), probability: Math.round(p * 10) / 10, odds: Math.round(o * 100) / 100 });
  }
  return [...byType.values()];
}

// ---------- Učiaci sa model (23. 11. 2026, Michal: „bod 4 … daj to do tichého sledovania“) ----------
// Server už od 4. 11. vyhodnocuje predpoveď modelu v každom trhu (súhrn „Všetky trhy“). Z toho sa dá zistiť,
// kde model sústavne preceňuje alebo podceňuje: oprava = (koľko vyšlo − koľko model čakal) / (počet + K),
// teda pri málo dátach takmer nič, pri veľa dátach skoro celý rozdiel. Dve opravy sa sčítajú:
//   1. druh stávky v danom pásme dôvery (napr. „Rohy hostí“ 70 – 80 %),
//   2. súťaž (zo všetkých predpovedí v nej – zbiera sa od 23. 11. 2026).
// Opravená šanca potom prejde rovnakými pravidlami ako tipy pre klientov (72 – 80 %, kurz, hodnota +5 až +25 %,
// 1 tip z druhu). Opravy sa rátajú len z výsledkov PRED tipom, takže skúška je férová. Klientom nejde.
const LEARN_K_MARKET = 40, LEARN_K_LEAGUE = 150, LEARN_CAP = 8;
const LEARN_MARKETS = new Set(["Góly", "Handicap", HCP_CORNERS_MARKET, "Rohy", "Rohy domácich", "Rohy hostí", "Karty", "Karty domácich", "Karty hostí", "Strely na bránu"]);
// Dôvody vyradenia, ktoré nesúvisia so šancou (málo dát, chýba kurz, trh vyradený…) – tie platia aj po oprave.
const LEARN_STRUCTURAL = new Set(["few_games", "ev_high_few_games", "line_too_high", "manual_far_line", "market_disabled", "market_excluded", "no_market_odds", "no_odds", "one_bookmaker", "conflict", "neighbor_no_value"]);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
export function learnAdj(s: MarketSummary, market: string, league: string, p: number): { adj: number; mkt: number; lg: number } {
  const b = s.markets?.[market]?.bands?.[bandOf(p)];
  const mkt = b && b.n ? clamp((b.won * 100 - b.sumP) / (b.n + LEARN_K_MARKET), -LEARN_CAP, LEARN_CAP) : 0;
  const l = s.learnData?.leagues?.[league];
  const lg = l && l.n ? clamp((l.won * 100 - l.sumP) / (l.n + LEARN_K_LEAGUE), -LEARN_CAP, LEARN_CAP) : 0;
  return { adj: mkt + lg, mkt, lg };
}
const typeKey = (c: { category?: string; market: string }) => {
  const cat = String(c.category || c.market);
  return cat.startsWith("hcp_") ? cat : cat.split("_")[0];
};
const passesClientRules = (market: string, p: number, odds: number) => {
  if (!isFinite(p) || !isFinite(odds) || p < clientMinProb(market) || p > MAX_PROB || odds < clientMinOdds(market)) return false;
  const ev = (p / 100) * odds;
  return ev >= 1.05 && ev <= 1.25;
};
type LearnCand = Cand & { rejectCode?: string };
function pickLearn(candidates: LearnCand[], ruleKeys: Set<string>, league: string, s: MarketSummary): TopPick[] {
  const byType = new Map<string, TopPick>();
  for (const c of candidates ?? []) {
    if (!c.market || !LEARN_MARKETS.has(c.market) || c.marketConflict || c.h2hAgainst) continue;
    if (c.rejectCode && LEARN_STRUCTURAL.has(c.rejectCode)) continue;
    // Handicap rohov len v top súťažiach – tam, kde ho pravidlá pre klientov pustili.
    if (c.market === HCP_CORNERS_MARKET && !ruleKeys.has(`${c.market}|${c.selection}`)) continue;
    const p0 = Number(c.probability), o = Number(c.odds);
    if (!isFinite(p0) || !isFinite(o) || o <= 1) continue;
    const p = p0 + learnAdj(s, c.market, league, p0).adj;
    if (!passesClientRules(c.market, p, o)) continue;
    const type = typeKey(c);
    const cur = byType.get(type);
    if (!cur || p > cur.probability || (p === cur.probability && o > cur.odds))
      byType.set(type, { market: c.market, selection: String(c.selection), probability: r1(p), odds: Math.round(o * 100) / 100, orig: r1(p0) });
  }
  return [...byType.values()];
}
// Súhrn pre opravy – v pamäti 30 minút (šetrí prenos z Upstash pri každom zápase).
let learnCache: { at: number; s: MarketSummary } | null = null;
async function learnSummary(): Promise<MarketSummary> {
  if (learnCache && Date.now() - learnCache.at < 30 * 60 * 1000) return learnCache.s;
  const s = await readSummary();
  learnCache = { at: Date.now(), s };
  return s;
}

// ---------- Pohyb kurzov a „ako TIPREX“ (23. 11. 2026) ----------
// Tipy podľa pravidiel pre klientov (bestBets z automatickej analýzy) sa zapíšu so značkami:
//   move:down = férová šanca Pinnacle od rána stúpla aspoň o 1,5 b. (kurz klesol – trh súhlasí),
//   move:up   = klesla aspoň o 1,5 b. (trh proti), move:flat = bez väčšej zmeny, move:none = bez údajov,
//   learn:ok / learn:out = či by tip prešiel aj po oprave učiaceho sa modelu,
//   pin:ok / pin:out / pin:none = Pinnacle tip potvrdí ako v TIPREXE (rozdiel so šancou najviac 12 b.,
//   hodnota podľa Pinnacle aspoň +1 %) / nepotvrdí / Pinnacle tip neponúka.
const MOVE_MIN = 1.5, MOVE_MIN_HOURS = 2, PIN_MAX_GAP = 12, PIN_MIN_EV = 1.01;
async function pickRules(
  fixture: { fixtureId: number; matchDate: string; homeTeam: string; awayTeam: string; league: string },
  bestBets: Cand[], s: MarketSummary
): Promise<TopPick[]> {
  const out: TopPick[] = [];
  for (const b of bestBets ?? []) {
    const p = Number(b.probability), o = Number(b.odds);
    if (!b.market || !isFinite(p) || !isFinite(o) || o <= 1) continue;
    const pick = { market: b.market, selection: String(b.selection) };
    const mv = await openingMove(fixture, pick).catch(() => null);
    const grps: string[] = [];
    if (!mv || mv.openH < MOVE_MIN_HOURS) grps.push("move:none");
    else grps.push(mv.move >= MOVE_MIN ? "move:down" : mv.move <= -MOVE_MIN ? "move:up" : "move:flat");
    const pl = p + learnAdj(s, b.market, fixture.league, p).adj;
    grps.push(passesClientRules(b.market, pl, o) ? "learn:ok" : "learn:out");
    const pin = mv?.nowP ?? null;
    if (pin == null) grps.push("pin:none");
    else grps.push(Math.abs(p - pin) <= PIN_MAX_GAP && (pin / 100) * o >= PIN_MIN_EV ? "pin:ok" : "pin:out");
    out.push({ ...pick, probability: r1(p), odds: Math.round(o * 100) / 100, move: mv && mv.openH >= MOVE_MIN_HOURS ? mv.move : null, pin, grps });
  }
  return out;
}

// ---------- Tipy ako v TIPREXE (23. 11. 2026, Michal: „kľudne tam môžu byť také tipy ako v TIPREXE“) ----------
// Pravidlá TIPREXU (src/tiprex.ts) na zápasoch a druhoch stávok TipRadaru: šanca = 50 % model (bez stávkoviek)
// + 50 % Pinnacle bez marže, rozdiel najviac 12 b., kurz z API (ako pri TipRadare) aspoň 1,60 (bez hornej hranice), hodnota podľa modelu
// aspoň +5 %, podľa Pinnacle aspoň +1 %, spolu +3 až +20 %, 1 tip z druhu (najväčšia šanca). Klientom nejde.
const TX_MIN_ODDS = 1.6; // 23. 11. 2026 18:46 (Michal): bez hornej hranice, kurz aspoň 1,60
function pickTiprexLike(fixture: { fixtureId: number; matchDate: string; homeTeam: string; awayTeam: string }, candidates: LearnCand[], ruleKeys: Set<string>): TopPick[] {
  const byType = new Map<string, TopPick>();
  for (const c of candidates ?? []) {
    if (!c.market || !LEARN_MARKETS.has(c.market) || c.marketConflict || c.h2hAgainst) continue;
    if (c.rejectCode && LEARN_STRUCTURAL.has(c.rejectCode)) continue;
    if (c.market === HCP_CORNERS_MARKET && !ruleKeys.has(`${c.market}|${c.selection}`)) continue;
    const o = Number(c.odds);
    if (!isFinite(o) || o < TX_MIN_ODDS) continue;
    const modelP = Number(typeof c.blendModel === "number" ? c.blendModel : c.probability);
    if (!isFinite(modelP) || (modelP / 100) * o < 1.05) continue;
    const pin = pinnacleNow(fixture, c);
    if (pin == null || Math.abs(modelP - pin) > PIN_MAX_GAP || (pin / 100) * o < PIN_MIN_EV) continue;
    const p = (modelP + pin) / 2, ev = (p / 100) * o;
    if (ev < 1.03 || ev > 1.2) continue;
    const type = typeKey(c);
    const cur = byType.get(type);
    if (!cur || p > cur.probability) byType.set(type, { market: c.market, selection: String(c.selection), probability: r1(p), odds: Math.round(o * 100) / 100, orig: r1(modelP), pin: r1(pin) });
  }
  return [...byType.values()];
}

/** Z kandidátov modelu vyberie z každého trhu jednu predpoveď (najvyššia šanca do 80 %) a zapíše zápas. */
export async function recordMarketPredictions(
  fixture: { fixtureId: number; matchDate: string; homeTeam: string; awayTeam: string; league: string },
  candidates: Cand[],
  /** Ďalšie trhy z modelu gólov len na sledovanie (16. 11. 2026) – dvojšanca, handicap, presný počet gólov… */
  trackOnly: Cand[] = [],
  /** Tipy podľa pravidiel pre klientov (23. 11. 2026) – pohyb kurzov, učiaci sa model, Pinnacle. */
  bestBets: Cand[] = []
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
  // 23. 11. 2026 (Michal): pásmo 68 – 80 % ZRUŠENÉ – k160a teraz od 69,6 % („to je viac k 70 %“), appka ukazuje
  // k160a len od 69,6 % (aj staršie tipy); k160b (od 70 %) sa ďalej zapisuje, v appke sa už neukazuje.
  const k160a = pick160(candidates, 69.6, 80.5) /* 18:51 Michal: horná hranica 80,5 % */, k160b = pick160(candidates, 70);
  let rules: TopPick[] = [], learn: TopPick[] = [], tx: TopPick[] = [];
  try {
    const s = await learnSummary();
    rules = await pickRules(fixture, bestBets, s);
    const ruleKeys = new Set(rules.map((r) => `${r.market}|${r.selection}`));
    learn = pickLearn(candidates as LearnCand[], ruleKeys, fixture.league, s);
    tx = pickTiprexLike(fixture, candidates as LearnCand[], ruleKeys);
  } catch (err) { console.error("Pohyb kurzov / učiaci sa model zlyhal:", err); }
  if (!best.size && !top && !odds2 && !odds17 && !oct.length && !k160a.length && !k160b.length && !rules.length && !learn.length && !tx.length) return;
  const entry: PendingFixture = { ...fixture, picks: [...best.values()], ...(rules.length ? { rules } : {}), ...(learn.length ? { learn } : {}), ...(tx.length ? { tx } : {}), ...(top ? { top } : {}), ...(odds2 ? { odds2 } : {}), ...(odds17 ? { odds17 } : {}), ...(oct.length ? { oct } : {}), ...(k160a.length ? { k160a } : {}), ...(k160b.length ? { k160b } : {}) };
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
        const extra = [f.top, f.odds2, f.odds17, ...(f.oct ?? []), ...(f.k160a ?? []), ...(f.k160b ?? []), ...(f.rules ?? []), ...(f.learn ?? []), ...(f.tx ?? [])].filter((x): x is TopPick => !!x);
        const all = [...f.picks, ...extra];
        let outcomes = await settleFixtureBets(f, all);
        if (!outcomes) {
          if (Date.now() < new Date(f.matchDate).getTime() + 3 * 24 * 3600 * 1000) continue;
          outcomes = all.map(() => "void" as const);
        }
        const addTop = (key: "top" | "odds2" | "odds17" | "oct" | "k160a" | "k160b" | "rules" | "learn" | "tx", pick: TopPick, st: "won" | "lost" | "void") => {
          const t = (summary[key] ??= { since: new Date().toISOString(), n: 0, won: 0, lost: 0, void: 0, sumP: 0, profit: 0, leagues: {}, recent: [] });
          const gain = st === "won" ? pick.odds - 1 : st === "lost" ? -1 : 0;
          if (st === "void") t.void++;
          else {
            t.n++; t.sumP += pick.probability; t.profit = Math.round((t.profit + gain) * 100) / 100;
            if (st === "won") t.won++; else t.lost++;
            const lg = (t.leagues[f.league || "?"] ??= { n: 0, won: 0, profit: 0 });
            lg.n++; if (st === "won") lg.won++; lg.profit = Math.round((lg.profit + gain) * 100) / 100;
            for (const g of pick.grps ?? []) {
              const x = ((t.groups ??= {})[g] ??= { n: 0, won: 0, profit: 0, sumP: 0 });
              x.n++; x.sumP += pick.probability; if (st === "won") x.won++; x.profit = Math.round((x.profit + gain) * 100) / 100;
            }
          }
          t.recent.unshift({ fixtureId: f.fixtureId, matchDate: f.matchDate, match: `${f.homeTeam} – ${f.awayTeam}`, league: f.league, market: pick.market, selection: pick.selection, probability: pick.probability, odds: pick.odds, status: st,
            ...(pick.orig != null ? { orig: pick.orig } : {}), ...(pick.move !== undefined ? { move: pick.move } : {}), ...(pick.pin !== undefined ? { pin: pick.pin } : {}), ...(pick.grps ? { grps: pick.grps } : {}) });
          t.recent = t.recent.slice(0, TOP_RECENT_MAX);
        };
        let xi = f.picks.length;
        if (f.top) addTop("top", f.top, outcomes[xi++]);
        if (f.odds2) addTop("odds2", f.odds2, outcomes[xi++]);
        if (f.odds17) addTop("odds17", f.odds17, outcomes[xi++]);
        for (const o of f.oct ?? []) addTop("oct", o, outcomes[xi++]);
        for (const o of f.k160a ?? []) addTop("k160a", o, outcomes[xi++]);
        for (const o of f.k160b ?? []) addTop("k160b", o, outcomes[xi++]);
        for (const o of f.rules ?? []) addTop("rules", o, outcomes[xi++]);
        for (const o of f.learn ?? []) addTop("learn", o, outcomes[xi++]);
        for (const o of f.tx ?? []) addTop("tx", o, outcomes[xi++]);
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
            // Učiaci sa model (23. 11. 2026): presnosť modelu po súťažiach.
            const ld = (summary.learnData ??= { since: new Date().toISOString(), leagues: {} });
            const lb = (ld.leagues[f.league || "?"] ??= { n: 0, won: 0, sumP: 0 });
            lb.n++; lb.sumP += p.probability; if (st === "won") lb.won++;
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

export async function marketSummary(): Promise<MarketSummary & { pending: number; learnTable: { markets: { market: string; n: number; adj: number }[]; leagues: { league: string; n: number; adj: number }[] } }> {
  const [s, p] = await Promise.all([readSummary(), listPending()]);
  // Aktuálne opravy učiaceho sa modelu (pre tipy s dôverou okolo 75 %).
  const markets = [...LEARN_MARKETS].map((m) => ({ market: m, n: s.markets?.[m]?.bands?.[bandOf(75)]?.n ?? 0, adj: r1(learnAdj({ ...s, learnData: undefined }, m, "", 75).mkt) }));
  const leagues = Object.entries(s.learnData?.leagues ?? {}).map(([league, x]) => ({ league, n: x.n, adj: r1(learnAdj({ ...s, markets: {} }, "", league, 75).lg) })).sort((a, b) => b.n - a.n);
  return { ...s, pending: p.length, learnTable: { markets, leagues } };
}
