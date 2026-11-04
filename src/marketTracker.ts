import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { settleFixtureBets } from "./tipEvaluator";

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
interface PendingFixture {
  fixtureId: number; matchDate: string; homeTeam: string; awayTeam: string; league: string;
  picks: MarketPrediction[];
}
export interface BandStats { n: number; won: number; sumP: number }
export interface MarketStats { n: number; won: number; lost: number; void: number; sumP: number; bands: Record<string, BandStats> }
export interface RecentResult { fixtureId: number; matchDate: string; match: string; league: string; market: string; selection: string; probability: number; status: "won" | "lost" | "void" }
export interface MarketSummary { since: string; fixtures: number; markets: Record<string, MarketStats>; recent: RecentResult[] }

const BANDS: [string, number, number][] = [["pod 60 %", 0, 60], ["60 – 69 %", 60, 70], ["70 – 80 %", 70, 80.01]];
const bandOf = (p: number) => (BANDS.find(([, lo, hi]) => p >= lo && p < hi) ?? BANDS[0])[0];

async function redis(command: (string | number)[]): Promise<any> {
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

/** Z kandidátov modelu vyberie z každého trhu jednu predpoveď (najvyššia šanca do 80 %) a zapíše zápas. */
export async function recordMarketPredictions(
  fixture: { fixtureId: number; matchDate: string; homeTeam: string; awayTeam: string; league: string },
  candidates: { market: string; selection: string; probability: number }[]
): Promise<void> {
  const best = new Map<string, MarketPrediction>();
  for (const c of candidates ?? []) {
    const p = Number(c.probability);
    if (!c.market || SKIP_MARKETS.includes(c.market) || !isFinite(p) || p > MAX_PROB) continue;
    const cur = best.get(c.market);
    if (!cur || p > cur.probability) best.set(c.market, { market: c.market, selection: String(c.selection), probability: Math.round(p * 10) / 10 });
  }
  if (!best.size) return;
  const entry: PendingFixture = { ...fixture, picks: [...best.values()] };
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
        let outcomes = await settleFixtureBets(f, f.picks);
        if (!outcomes) {
          if (Date.now() < new Date(f.matchDate).getTime() + 3 * 24 * 3600 * 1000) continue;
          outcomes = f.picks.map(() => "void" as const);
        }
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
