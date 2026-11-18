import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { cachedRedis } from "./upstashCache";
import { scannedFixtures, isTopBook, FixtureOdds } from "./surebets";
import { findOdds, marketProbabilityDetail, MarketOdds } from "./oddsMatcher";
import { settleFixtureBets } from "./tipEvaluator";

// TIPREX (18. 11. 2026, Michal: „nový projekt vyhodnocovania stávok pre zahraničný trh, nie to isté ako TipRadar,
// špeciálny model, kurzy od 1,70, viac tipov denne“). Samostatný model (názov TIPREX = tip + rex, kráľ tipov, Michal 18. 11.; pracovne VERDIQ).
//
// Tip vznikne len vtedy, keď ho NEZÁVISLE potvrdia dvaja „sudcovia“:
//   1. sudca = štatistický model (šanca z predictor.ts, bez miešania so stávkovkami),
//   2. sudca = najostrejší trh – Pinnacle bez marže (ak Pinnacle chýba, medián aspoň 3 stávkoviek bez marže).
// Kurz sa berie NAJVYŠŠÍ zo známych zahraničných stávkoviek (TOP_BOOKS zo surebetov: Bet365, Unibet, Betano…).
// Rozdiel oproti TipRadaru: kurz 1,70 – 3,20 (šanca zhruba 35 – 62 %), výsledná šanca 50 % model + 50 % Pinnacle,
// hodnota sa musí ukázať u OBOCH sudcov, z jedného typu trhu v zápase len 1 tip (počet tipov na zápas neobmedzený), viac tipov denne.
// Meria sa aj CLV – či sa kurz do výkopu pohol k nám (najlepší znak, či model nachádza skutočnú hodnotu).
// Zatiaľ len skúška: tipy sa ukladajú a vyhodnocujú samé, nikomu sa neposielajú, TipRadar sa nemení.

export const VQ_MIN_ODDS = 1.7;
export const VQ_MAX_ODDS = 3.2;
/** Hodnota podľa štatistického modelu aspoň +5 %. */
const MIN_EV_MODEL = 1.05;
/** Hodnota podľa Pinnacle (bez marže) aspoň +1 % – ostrý trh musí cenu tiež potvrdiť. */
const MIN_EV_SHARP = 1.01;
/** Výsledná hodnota (50 / 50) – pod +3 % to nestojí za to, nad +20 % je to skôr chyba v kurzoch. */
const MIN_EV = 1.03;
const MAX_EV = 1.2;
/** Model a Pinnacle sa nesmú rozchádzať o viac ako 12 bodov – inak model nevidí niečo podstatné. */
const MAX_GAP = 12;
/** Najvyšší kurz najviac o 8 % nad mediánom stávkoviek – vyšší býva chyba alebo starý kurz. */
const MAX_OVER_MEDIAN = 1.08;
/** 18. 11. 2026 (Michal): zo zápasu toľko tipov, koľko prejde – len nie dva z toho istého typu trhu. */
const MAX_PER_FIXTURE = 99;
/** Tip musia ponúkať aspoň 3 známe zahraničné stávkovky (Bet365, Unibet, Betano…). */
const MIN_TOP_BOOKS = 3;
const SKIP_MARKETS = ["Strelec gólov", "Ofsajdy", "Vyššie držanie lopty", "Držanie lopty domácich", "Držanie lopty hostí"];

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);
/** Čakajúce tipy (malý hash – číta sa každých 15 min) a vyhodnotené (číta sa len pri otvorení stránky). */
const PENDING_KEY = "tiprex_pending";
const DONE_KEY = "tiprex_done";
const FILE = path.join(__dirname, "..", "data", "tiprex.json");

export interface TiprexPick {
  id: string;
  fixtureId: number;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  country: string;
  market: string;
  selection: string;
  /** Šanca štatistického modelu (%). */
  modelP: number;
  /** Šanca Pinnacle bez marže (%), prípadne medián stávkoviek. */
  sharpP: number;
  sharpSource: "Pinnacle" | "trh";
  /** Výsledná šanca 50 / 50 (%). */
  p: number;
  /** Najvyšší kurz zo známych stávkoviek a kde. */
  odds: number;
  book: string;
  medianOdds: number;
  /** Výsledná hodnota (p × kurz). */
  ev: number;
  recordedAt: string;
  /** Posledný férový kurz pred výkopom (Pinnacle / trh bez marže) – na CLV. */
  closingFair?: number;
  closingAt?: string;
  status: "pending" | "won" | "lost" | "void";
  settledAt?: string;
}

async function redis(command: (string | number)[]): Promise<any> {
  return cachedRedis(command, async (c) => {
    const res = await axios.post(UPSTASH_URL!, c, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }, timeout: 20000 });
    return res.data?.result;
  });
}
type Bucket = "pending" | "done";
const keyOf = (b: Bucket) => (b === "pending" ? PENDING_KEY : DONE_KEY);
function readFile(): Record<Bucket, Record<string, TiprexPick>> {
  try { const d = JSON.parse(fs.readFileSync(FILE, "utf8")); return { pending: d.pending ?? {}, done: d.done ?? {} }; }
  catch { return { pending: {}, done: {} }; }
}
function writeFile(d: Record<Bucket, Record<string, TiprexPick>>): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(d));
}
async function listPicks(b: Bucket): Promise<TiprexPick[]> {
  if (!useUpstash) return Object.values(readFile()[b]);
  const flat: string[] = (await redis(["HGETALL", keyOf(b)])) ?? [];
  const out: TiprexPick[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) { try { out.push(JSON.parse(flat[i + 1])); } catch { /* poškodený */ } }
  return out;
}
async function savePicks(b: Bucket, picks: TiprexPick[]): Promise<void> {
  if (!picks.length) return;
  if (!useUpstash) { const d = readFile(); for (const p of picks) d[b][p.id] = p; writeFile(d); return; }
  const args: string[] = [];
  for (const p of picks) args.push(p.id, JSON.stringify(p));
  await redis(["HSET", keyOf(b), ...args]);
}
async function removePending(ids: string[]): Promise<void> {
  if (!ids.length) return;
  if (!useUpstash) { const d = readFile(); for (const id of ids) delete d.pending[id]; writeFile(d); return; }
  await redis(["HDEL", PENDING_KEY, ...ids]);
}
/** Zápasy, z ktorých sa už tipy vyberali (aby sa pri opakovanej analýze nezapísali dvakrát). */
const doneFixtures = new Set<number>();
/** Stav analýzy dnešných zápasov pre stránku (18. 11. 2026): kedy sa analyzoval a koľko tipov z neho vyšlo. */
const analyzed = new Map<number, { at: string; picks: number; note?: string }>();

// ---------- Kurzy jednotlivých stávkoviek ----------

/** Kurzy zápasu rozdelené podľa stávkovky (pre findOdds: bookmakers = 1). */
function oddsByBook(f: FixtureOdds): Map<string, MarketOdds[]> {
  const out = new Map<string, MarketOdds[]>();
  for (const bet of Object.values(f.bets)) {
    for (const [value, list] of Object.entries(bet.values)) {
      for (const o of list) {
        const arr = out.get(o.book) ?? [];
        arr.push({ bet: bet.name, value, odd: o.odd, bookmakers: 1 });
        out.set(o.book, arr);
      }
    }
  }
  return out;
}
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

interface PriceView { best: number; book: string; median: number; sharpP: number; sharpSource: "Pinnacle" | "trh" }

function priceView(books: Map<string, MarketOdds[]>, pick: { market: string; selection: string }, home: string, away: string): PriceView | null {
  const prices: { book: string; odd: number }[] = [];
  const fairs: number[] = [];
  let pin: number | null = null;
  for (const [book, odds] of books) {
    const m = findOdds(odds, pick, home, away);
    if (!m) continue;
    prices.push({ book, odd: m.odd });
    const d = marketProbabilityDetail(odds, pick, home, away);
    if (d?.devig) {
      fairs.push(d.prob);
      if (/^pinnacle$/i.test(book.trim())) pin = d.prob;
    }
  }
  const top = prices.filter((p) => isTopBook(p.book) && !/^pinnacle$/i.test(p.book.trim()));
  // 18. 11. 2026 (Michal): len tipy, ktoré sa naozaj dajú podať v zahraničí – presne tento tip
  // musia ponúkať aspoň 3 známe zahraničné stávkovky (bez Pinnacle).
  if (top.length < MIN_TOP_BOOKS) return null;
  let sharpP: number, sharpSource: "Pinnacle" | "trh";
  if (pin != null) { sharpP = pin; sharpSource = "Pinnacle"; }
  else if (fairs.length >= 3) { sharpP = median(fairs); sharpSource = "trh"; }
  else return null;
  const bestTop = top.sort((a, b) => b.odd - a.odd)[0];
  return { best: bestTop.odd, book: bestTop.book, median: median(prices.map((p) => p.odd)), sharpP, sharpSource };
}

const typeOf = (market: string) => market.split(" ")[0];

type Cand = { market: string; selection: string; probability: number; blendModel?: number };

/**
 * Pri automatickej analýze zápasu (~65 min pred výkopom) vyberie tipy TIPREX a uloží ich.
 * Kurzy berie z posledného prehľadania surebetov (každú hodinu, dnešné zápasy 18 súťaží).
 */
export async function recordTiprexPicks(
  fixture: { fixtureId: number; matchDate: string; homeTeam: string; awayTeam: string; league: string },
  candidates: Cand[],
  trackOnly: Cand[] = []
): Promise<number> {
  const f = scannedFixtures().find((x) => x.fixtureId === fixture.fixtureId);
  if (!f) { analyzed.set(fixture.fixtureId, { at: new Date().toISOString(), picks: 0, note: "bez kurzov zahraničných stávkoviek" }); return 0; }
  if (doneFixtures.has(fixture.fixtureId)) return 0;
  doneFixtures.add(fixture.fixtureId);
  const books = oddsByBook(f);
  const seen = new Set<string>();
  const found: TiprexPick[] = [];
  const now = new Date().toISOString();
  for (const c of [...(candidates ?? []), ...(trackOnly ?? [])]) {
    if (!c?.market || SKIP_MARKETS.includes(c.market)) continue;
    const key = `${c.market}|${c.selection}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const modelP = typeof c.blendModel === "number" ? c.blendModel : Number(c.probability);
    if (!isFinite(modelP) || modelP <= 0 || modelP >= 100) continue;
    const pv = priceView(books, c, fixture.homeTeam, fixture.awayTeam);
    if (!pv) continue;
    const odds = pv.best;
    if (odds < VQ_MIN_ODDS || odds > VQ_MAX_ODDS) continue;
    if (odds > pv.median * MAX_OVER_MEDIAN) continue;
    if (Math.abs(modelP - pv.sharpP) > MAX_GAP) continue;
    if ((modelP / 100) * odds < MIN_EV_MODEL) continue;
    if ((pv.sharpP / 100) * odds < MIN_EV_SHARP) continue;
    const p = (modelP + pv.sharpP) / 2;
    const ev = (p / 100) * odds;
    if (ev < MIN_EV || ev > MAX_EV) continue;
    found.push({
      id: `${fixture.fixtureId}|${c.market}|${c.selection}`,
      fixtureId: fixture.fixtureId, matchDate: fixture.matchDate, homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam,
      league: fixture.league || f.league, country: f.country,
      market: c.market, selection: String(c.selection),
      modelP: Math.round(modelP * 10) / 10, sharpP: Math.round(pv.sharpP * 10) / 10, sharpSource: pv.sharpSource,
      p: Math.round(p * 10) / 10, odds: Math.round(odds * 100) / 100, book: pv.book, medianOdds: Math.round(pv.median * 100) / 100,
      ev: Math.round(ev * 1000) / 1000, recordedAt: now, status: "pending",
    });
  }
  // Z jedného typu trhu (góly, rohy, karty…) len jeden tip – ten s najvyššou hodnotou; počet na zápas neobmedzený.
  found.sort((a, b) => b.ev - a.ev);
  const types = new Set<string>();
  const chosen: TiprexPick[] = [];
  for (const pk of found) {
    const t = typeOf(pk.market);
    if (types.has(t)) continue;
    types.add(t);
    chosen.push(pk);
    if (chosen.length >= MAX_PER_FIXTURE) break;
  }
  await savePicks("pending", chosen);
  analyzed.set(fixture.fixtureId, { at: now, picks: chosen.length });
  return chosen.length;
}

/** Po každom prehľadaní kurzov: posledný férový kurz pred výkopom (na CLV). */
export async function updateTiprexClosing(): Promise<void> {
  const fixtures = scannedFixtures();
  if (!fixtures.length) return;
  const pending = (await listPicks("pending")).filter((p) => new Date(p.matchDate).getTime() > Date.now());
  const changed: TiprexPick[] = [];
  for (const p of pending) {
    const f = fixtures.find((x) => x.fixtureId === p.fixtureId);
    if (!f) continue;
    const pv = priceView(oddsByBook(f), p, p.homeTeam, p.awayTeam);
    if (!pv || !(pv.sharpP > 0)) continue;
    p.closingFair = Math.round((100 / pv.sharpP) * 100) / 100;
    p.closingAt = new Date().toISOString();
    changed.push(p);
  }
  await savePicks("pending", changed);
}

let settling = false;
/** Vyhodnotí odohrané zápasy (každých 15 minút). */
export async function settleTiprex(): Promise<number> {
  if (settling) return 0;
  settling = true;
  let done = 0;
  try {
    const due = (await listPicks("pending")).filter((p) => Date.now() >= new Date(p.matchDate).getTime() + 110 * 60 * 1000);
    const byFixture = new Map<number, TiprexPick[]>();
    for (const p of due) byFixture.set(p.fixtureId, [...(byFixture.get(p.fixtureId) ?? []), p]);
    for (const [, picks] of [...byFixture].slice(0, 20)) {
      try {
        const first = picks[0];
        let out = await settleFixtureBets(first, picks);
        if (!out) {
          if (Date.now() < new Date(first.matchDate).getTime() + 3 * 24 * 3600 * 1000) continue;
          out = picks.map(() => "void" as const);
        }
        const at = new Date().toISOString();
        picks.forEach((p, i) => { p.status = out![i]; p.settledAt = at; });
        await savePicks("done", picks);
        await removePending(picks.map((p) => p.id));
        done += picks.length;
      } catch { /* skúsi sa znova o 15 minút */ }
    }
  } finally {
    settling = false;
  }
  return done;
}

// ---------- Súhrn pre stránku /tiprex ----------

interface Agg { n: number; won: number; lost: number; void: number; profit: number; sumOdds: number; sumP: number; clvN: number; clvSum: number; clvPlus: number }
const agg = (): Agg => ({ n: 0, won: 0, lost: 0, void: 0, profit: 0, sumOdds: 0, sumP: 0, clvN: 0, clvSum: 0, clvPlus: 0 });
function add(a: Agg, p: TiprexPick): void {
  if (p.closingFair && p.closingFair > 1) {
    const clv = p.odds / p.closingFair - 1;
    a.clvN++; a.clvSum += clv; if (clv > 0) a.clvPlus++;
  }
  if (p.status === "void") { a.void++; return; }
  if (p.status !== "won" && p.status !== "lost") return;
  a.n++; a.sumOdds += p.odds; a.sumP += p.p;
  if (p.status === "won") { a.won++; a.profit += p.odds - 1; } else { a.lost++; a.profit -= 1; }
}
function fin(a: Agg) {
  return {
    n: a.n, won: a.won, lost: a.lost, void: a.void,
    profit: Math.round(a.profit * 100) / 100,
    hit: a.n ? Math.round((a.won / a.n) * 1000) / 10 : null,
    expected: a.n ? Math.round((a.sumP / a.n) * 10) / 10 : null,
    avgOdds: a.n ? Math.round((a.sumOdds / a.n) * 100) / 100 : null,
    clv: a.clvN ? Math.round((a.clvSum / a.clvN) * 1000) / 10 : null,
    clvPlus: a.clvN ? Math.round((a.clvPlus / a.clvN) * 100) : null,
    clvN: a.clvN,
  };
}
const ODDS_BANDS: [string, number, number][] = [["1,70 – 1,99", 1.7, 2], ["2,00 – 2,49", 2, 2.5], ["2,50 – 3,20", 2.5, 9]];
const skDay = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Bratislava" });

/** Dnešné zápasy z posledného prehľadania kurzov: tímy, výkop, zahraničné stávkovky, stav analýzy. */
function todayFixtures() {
  return scannedFixtures()
    .map((f) => {
      const books = new Set<string>();
      for (const bet of Object.values(f.bets)) for (const list of Object.values(bet.values)) for (const o of list)
        if (isTopBook(o.book) && !/^pinnacle$/i.test(o.book.trim())) books.add(o.book);
      const a = analyzed.get(f.fixtureId);
      return {
        fixtureId: f.fixtureId, league: f.league, country: f.country, extra: !!f.extra, date: f.date, home: f.home, away: f.away,
        books: books.size, analyzedAt: a?.at ?? null, picks: a ? a.picks : null, note: a?.note ?? null,
        analyzeAt: new Date(new Date(f.date).getTime() - 65 * 60 * 1000).toISOString(),
      };
    })
    .sort((x, y) => x.date.localeCompare(y.date) || x.league.localeCompare(y.league));
}

/** Súťaže TipRadaru v poslednom prehľadaní kurzov: koľko známych zahraničných stávkoviek ich ponúka. */
function leagueCoverage() {
  const map = new Map<string, { league: string; country: string; fixtures: number; books: Set<string>; extra: boolean }>();
  for (const f of scannedFixtures()) {
    const e = map.get(f.league + "|" + f.country) ?? { league: f.league, country: f.country, fixtures: 0, books: new Set<string>(), extra: !!f.extra };
    e.fixtures++;
    for (const bet of Object.values(f.bets)) for (const list of Object.values(bet.values)) for (const o of list)
      if (isTopBook(o.book) && !/^pinnacle$/i.test(o.book.trim())) e.books.add(o.book);
    map.set(f.league + "|" + f.country, e);
  }
  return [...map.values()].map((e) => ({ league: e.league, country: e.country, extra: e.extra, fixtures: e.fixtures, books: [...e.books].sort() })).sort((a, b) => b.books.length - a.books.length);
}

export async function tiprexSummary() {
  const all = [...(await listPicks("done")), ...(await listPicks("pending"))].sort((a, b) => b.matchDate.localeCompare(a.matchDate));
  const total = agg();
  const byMarket = new Map<string, Agg>();
  const byBand = new Map<string, Agg>();
  const byDay = new Map<string, Agg>();
  for (const p of all) {
    add(total, p);
    const m = byMarket.get(p.market) ?? agg(); add(m, p); byMarket.set(p.market, m);
    const band = (ODDS_BANDS.find(([, lo, hi]) => p.odds >= lo && p.odds < hi) ?? ODDS_BANDS[2])[0];
    const b = byBand.get(band) ?? agg(); add(b, p); byBand.set(band, b);
    const d = skDay(p.matchDate);
    const dd = byDay.get(d) ?? agg(); add(dd, p); byDay.set(d, dd);
  }
  return {
    since: all.length ? all[all.length - 1].matchDate : null,
    rules: { minTopBooks: MIN_TOP_BOOKS, minOdds: VQ_MIN_ODDS, maxOdds: VQ_MAX_ODDS, minEvModel: MIN_EV_MODEL, minEvSharp: MIN_EV_SHARP, minEv: MIN_EV, maxEv: MAX_EV, maxGap: MAX_GAP, perFixture: MAX_PER_FIXTURE },
    total: fin(total),
    pending: all.filter((p) => p.status === "pending").length,
    byMarket: [...byMarket].map(([k, a]) => ({ key: k, ...fin(a) })).sort((x, y) => y.n - x.n),
    byBand: ODDS_BANDS.map(([k]) => ({ key: k, ...fin(byBand.get(k) ?? agg()) })),
    byDay: [...byDay].map(([k, a]) => ({ key: k, ...fin(a) })).sort((x, y) => y.key.localeCompare(x.key)),
    leagues: leagueCoverage(),
    fixtures: todayFixtures(),
    picks: all.slice(0, 400),
  };
}
