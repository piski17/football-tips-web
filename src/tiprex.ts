import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { cachedRedis } from "./upstashCache";
import { scannedFixtures, isTopBook, FixtureOdds, fetchFixtureOdds } from "./surebets";
import { findOdds, marketProbabilityDetail, MarketOdds } from "./oddsMatcher";
import { settleFixtureBets } from "./tipEvaluator";

// TIPREX (18. 11. 2026, Michal: „nový projekt vyhodnocovania stávok pre zahraničný trh, nie to isté ako TipRadar,
// špeciálny model, kurzy od 1,70, viac tipov denne“). Samostatný model (názov TIPREX = tip + rex, kráľ tipov, Michal 18. 11.; pracovne VERDIQ).
//
// Tip vznikne len vtedy, keď ho NEZÁVISLE potvrdia dvaja „sudcovia“:
//   1. sudca = štatistický model (šanca z predictor.ts, bez miešania so stávkovkami),
//   2. sudca = najostrejší trh – Pinnacle bez marže (od 19. 11. 2026 povinne; bez Pinnacle tip nevznikne).
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
const MAX_PER_FIXTURE = 99; // 19. 11. 2026 1:53 (Michal): späť – viac tipov zo zápasu, z každého druhu 1 (najväčšia dôvera)
/** Tip musia ponúkať aspoň 3 známe zahraničné stávkovky (Bet365, Unibet, Betano…). */
const MIN_TOP_BOOKS = 2; // 19. 11. 2026 20:22 (Michal): Pinnacle + ďalšie 2 stávkovky stačia (predtým 3)
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
  /** 19. 11. 2026: kontrola tipu podľa pravidiel platných od 19. 11. 20:25 (Pinnacle povinný, priemer Pinnacle + 2) – z posledného prehľadania kurzov. */
  recheck?: { pass: boolean; odds?: number; reason?: string; at: string };
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
/** 18. 11. 2026 23:30 (Michal): ženské súťaže (ženská Liga majstrov) do TIPREXU nepatria – tipy sa nezapisujú ani nerátajú (v databáze ostávajú). */
/** Minimálny počet odohraných zápasov v sezóne pri oboch tímoch (TipRadar má 3 / 5). */
const TIPREX_MIN_GAMES = 8;
const isWomenLeague = (league: string) => /women|ženy|\(ž\.\)/i.test(league || "");
async function listPicks(b: Bucket): Promise<TiprexPick[]> {
  // 19. 11. 2026 22:36 (Michal): tipy spred nových pravidiel, ktoré by podľa nich neprešli, sa vymažú zo zoznamu aj štatistík
  // (v databáze ostávajú – recheck.pass === false). Nové tipy recheck nemajú, tých sa to netýka.
  const all = (await listPicksRaw(b)).filter((p) => !isWomenLeague(p.league) && !(p.recheck && !p.recheck.pass && p.recordedAt < "2026-11-19T19:35:00Z"));
  // 19. 11. 2026 (Michal): aj spätne z každého druhu trhu v zápase len 1 tip – ten s najväčšou dôverou (ostatné v databáze ostávajú).
  const best = new Map<string, TiprexPick>();
  for (const p of all) {
    const k = `${p.fixtureId}|${typeOf(p.market)}`;
    const cur = best.get(k);
    if (!cur || p.p > cur.p || (p.p === cur.p && p.ev > cur.ev)) best.set(k, p);
  }
  return [...best.values()];
}
async function listPicksRaw(b: Bucket): Promise<TiprexPick[]> {
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

interface PriceView { best: number; book: string; median: number; sharpP: number; sharpSource: "Pinnacle" | "trh"; avg3?: number; avgBooks?: string }
/** 19. 11. 2026 20:23 (Michal): kurz tipu = priemer z 3 stávkoviek – Pinnacle + 2 ďalšie (2 najvyššie kurzy zo známych zahraničných). */
function avgOf3(prices: { book: string; odd: number }[], top: { book: string; odd: number }[]): { avg3?: number; avgBooks?: string } {
  const pin = prices.find((p) => /^pinnacle$/i.test(p.book.trim()));
  if (!pin || top.length < 2) return {};
  const two = [...top].sort((a, b) => b.odd - a.odd).slice(0, 2);
  return { avg3: (pin.odd + two[0].odd + two[1].odd) / 3, avgBooks: `priemer: Pinnacle ${pin.odd.toFixed(2)}, ${two.map((x) => `${x.book} ${x.odd.toFixed(2)}`).join(", ")}` };
}

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
  const bestTop = [...top].sort((a, b) => b.odd - a.odd)[0];
  return { best: bestTop.odd, book: bestTop.book, median: median(prices.map((p) => p.odd)), sharpP, sharpSource, ...avgOf3(prices, top) };
}

/** Skupina trhu – z jednej skupiny v zápase len 1 tip (handicap na rohy patrí k rohom, gólový handicap k výsledku). */
const typeOf = (market: string) => {
  const m = market.toLowerCase();
  if (m.includes("rohy")) return "Rohy";
  if (m.includes("karty")) return "Karty";
  if (m.includes("strely")) return "Strely";
  if (m === "ázijský handicap") return "Výsledok";
  return market.split(" ")[0];
};

// ---------- Ázijský handicap (18. 11. 2026, Michal: „handicapy by boli fajn – góly, rohy, karty, strely“) ----------
// Hodnota strany: „Home -1.5“ / „Away +1.5“ (API-Football). Len celé a polovičné hranice (štvrtinové sa delia na dve stávky).
type HcpKind = "goals" | "corners" | "cards" | "shots";
const HCP_MARKET: Record<HcpKind, string> = { goals: "Ázijský handicap", corners: "Ázijský handicap – rohy", cards: "Ázijský handicap – karty", shots: "Ázijský handicap – strely na bránu" };
function isHcpBet(name: string, kind: HcpKind): boolean {
  const b = name.toLowerCase();
  if (!/asian handicap|handicap asian/.test(b) || /(1st|2nd|first|second|half)/.test(b)) return false;
  if (kind === "corners") return /corner/.test(b);
  if (kind === "cards") return /card|booking/.test(b) && !/point/.test(b);
  if (kind === "shots") return /shot/.test(b) && /target|goal/.test(b);
  return !/(corner|card|booking|shot|foul|offside)/.test(b);
}
function parseHcp(v: string): { side: "home" | "away"; line: number } | null {
  const m = String(v).trim().match(/^(home|away)\s*([+-]?\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  const line = parseFloat(m[2]);
  if (!isFinite(line) || Math.abs((Math.abs(line) % 1) - 0.25) < 0.01 || Math.abs((Math.abs(line) % 1) - 0.75) < 0.01) return null;
  return { side: m[1].toLowerCase() as "home" | "away", line };
}
/** Kurzy jednej stávkovky pre stranu (side, line) a opačnú stranu (druhý tím, −line). */
function hcpOdds(f: FixtureOdds, kind: HcpKind, side: "home" | "away", line: number): Map<string, { own?: number; opp?: number }> {
  const out = new Map<string, { own?: number; opp?: number }>();
  for (const bet of Object.values(f.bets)) {
    if (!isHcpBet(bet.name, kind)) continue;
    for (const [value, list] of Object.entries(bet.values)) {
      const h = parseHcp(value);
      if (!h) continue;
      const isOwn = h.side === side && Math.abs(h.line - line) < 0.001;
      const isOpp = h.side !== side && Math.abs(h.line + line) < 0.001;
      if (!isOwn && !isOpp) continue;
      for (const o of list) {
        const e = out.get(o.book) ?? {};
        if (isOwn) e.own = Math.max(e.own ?? 0, o.odd); else e.opp = Math.max(e.opp ?? 0, o.odd);
        out.set(o.book, e);
      }
    }
  }
  return out;
}
function hcpPriceView(f: FixtureOdds, kind: HcpKind, side: "home" | "away", line: number): PriceView | null {
  const books = hcpOdds(f, kind, side, line);
  const prices: { book: string; odd: number }[] = [];
  const fairs: number[] = [];
  let pin: number | null = null;
  for (const [book, o] of books) {
    if (!o.own) continue;
    prices.push({ book, odd: o.own });
    if (o.opp) {
      const fair = (1 / o.own) / (1 / o.own + 1 / o.opp) * 100;
      fairs.push(fair);
      if (/^pinnacle$/i.test(book.trim())) pin = fair;
    }
  }
  const top = prices.filter((p) => isTopBook(p.book) && !/^pinnacle$/i.test(p.book.trim()));
  if (top.length < MIN_TOP_BOOKS) return null;
  let sharpP: number, sharpSource: "Pinnacle" | "trh";
  if (pin != null) { sharpP = pin; sharpSource = "Pinnacle"; }
  else if (fairs.length >= 3) { sharpP = median(fairs); sharpSource = "trh"; }
  else return null;
  const bestTop = [...top].sort((a, b) => b.odd - a.odd)[0];
  return { best: bestTop.odd, book: bestTop.book, median: median(prices.map((p) => p.odd)), sharpP, sharpSource, ...avgOf3(prices, top) };
}
const fmtHcp = (line: number) => `${line > 0 ? "+" : "−"}${Math.abs(line)}`;

/** Rozdelenie počtu (Poisson alebo negatívne binomické podľa rozptylu) – pmf[0..max]. */
function countPmf(mean: number, varRatio: number, max = 40): number[] {
  const out: number[] = [];
  if (!(varRatio > 1.02)) {
    let p = Math.exp(-mean);
    for (let k = 0; k <= max; k++) { out.push(p); p = (p * mean) / (k + 1); }
    return out;
  }
  const r = mean / (varRatio - 1), q = 1 / varRatio; // NB: priemer = r(1−q)/q
  let p = Math.pow(q, r);
  for (let k = 0; k <= max; k++) { out.push(p); p = p * ((k + r) / (k + 1)) * (1 - q); }
  return out;
}
interface LineModelLite { market: string; mean: number; varRatio: number; calibration: number }
/** Šanca (%) na handicap strany z modelov tímov – bez vrátených stávok (pri celej hranici). */
function teamHcpChance(home: LineModelLite, away: LineModelLite, side: "home" | "away", line: number): number | null {
  const ph = countPmf(home.mean, home.varRatio), pa = countPmf(away.mean, away.varRatio);
  let win = 0, push = 0, lose = 0;
  for (let h = 0; h < ph.length; h++) for (let a = 0; a < pa.length; a++) {
    const d = (side === "home" ? h - a : a - h) + line;
    const w = ph[h] * pa[a];
    if (Math.abs(d) < 1e-9) push += w; else if (d > 0) win += w; else lose += w;
  }
  if (win + lose <= 0) return null;
  const raw = (win / (win + lose)) * 100;
  const k = Math.min(1, home.calibration || 1, away.calibration || 1);
  return 50 + k * (raw - 50);
}
const TEAM_HCP: { kind: HcpKind; home: string; away: string }[] = [
  { kind: "corners", home: "Rohy domácich", away: "Rohy hostí" },
  { kind: "cards", home: "Karty domácich", away: "Karty hostí" },
  { kind: "shots", home: "Strely na bránu domácich", away: "Strely na bránu hostí" },
];
/** Hranice handicapu, ktoré stávkovky pri zápase naozaj ponúkajú (z pohľadu domácich). */
function offeredHcpLines(f: FixtureOdds, kind: HcpKind): number[] {
  const set = new Set<number>();
  for (const bet of Object.values(f.bets)) {
    if (!isHcpBet(bet.name, kind)) continue;
    for (const value of Object.keys(bet.values)) {
      const h = parseHcp(value);
      if (h) set.add(h.side === "home" ? h.line : -h.line);
    }
  }
  return [...set];
}

type Cand = { market: string; selection: string; probability: number; blendModel?: number };

/**
 * Pri automatickej analýze zápasu (~65 min pred výkopom) vyberie tipy TIPREX a uloží ich.
 * Kurzy berie z posledného prehľadania surebetov (každú hodinu, dnešné zápasy 17 súťaží).
 */
export async function recordTiprexPicks(
  fixture: { fixtureId: number; matchDate: string; homeTeam: string; awayTeam: string; league: string },
  candidates: Cand[],
  trackOnly: Cand[] = [],
  lineModels: LineModelLite[] = [],
  seasonGames?: { home?: number; away?: number }
): Promise<number> {
  if (isWomenLeague(fixture.league)) return 0;
  // 18. 11. 2026 23:35 (Michal): TIPREX len pri tímoch s dostatkom dát – oba tímy aspoň TIPREX_MIN_GAMES zápasov v sezóne.
  const minGames = Math.min(Number(seasonGames?.home ?? 0), Number(seasonGames?.away ?? 0));
  if (seasonGames && minGames < TIPREX_MIN_GAMES) {
    analyzed.set(fixture.fixtureId, { at: new Date().toISOString(), picks: 0, note: `málo dát – ${minGames} zápasov v sezóne (treba aspoň ${TIPREX_MIN_GAMES})` });
    return 0;
  }
  const f = scannedFixtures().find((x) => x.fixtureId === fixture.fixtureId);
  if (!f) { analyzed.set(fixture.fixtureId, { at: new Date().toISOString(), picks: 0, note: "bez kurzov zahraničných stávkoviek" }); return 0; }
  if (doneFixtures.has(fixture.fixtureId)) return 0;
  doneFixtures.add(fixture.fixtureId);
  const books = oddsByBook(f);
  const seen = new Set<string>();
  const found: TiprexPick[] = [];
  const now = new Date().toISOString();
  // Kandidáti: trhy modelu (s kurzami cez findOdds) + ázijské handicapy (góly z modelu gólov, rohy/karty/strely z modelov tímov).
  const priced: { market: string; selection: string; modelP: number; pv: PriceView }[] = [];
  for (const c of [...(candidates ?? []), ...(trackOnly ?? [])]) {
    if (!c?.market || SKIP_MARKETS.includes(c.market) || c.market.startsWith("Handicap")) continue; // 20. 11. 2026: TIPREX ostáva pri ázijských handicapoch
    const key = `${c.market}|${c.selection}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const modelP = typeof c.blendModel === "number" ? c.blendModel : Number(c.probability);
    if (!isFinite(modelP) || modelP <= 0 || modelP >= 100) continue;
    let pv: PriceView | null = null;
    if (c.market === "Ázijský handicap") {
      const m = String(c.selection).match(/^(.*) ([+−-])(\d+(?:\.\d+)?)$/);
      if (!m) continue;
      const side = m[1] === fixture.homeTeam ? "home" : m[1] === fixture.awayTeam ? "away" : null;
      if (!side) continue;
      pv = hcpPriceView(f, "goals", side, (m[2] === "+" ? 1 : -1) * parseFloat(m[3]));
    } else {
      pv = priceView(books, c, fixture.homeTeam, fixture.awayTeam);
    }
    if (pv) priced.push({ market: c.market, selection: String(c.selection), modelP, pv });
  }
  for (const t of TEAM_HCP) {
    const hm = lineModels.find((m) => m.market === t.home), am = lineModels.find((m) => m.market === t.away);
    if (!hm || !am || !(hm.mean > 0) || !(am.mean > 0)) continue;
    for (const homeLine of offeredHcpLines(f, t.kind)) {
      for (const side of ["home", "away"] as const) {
        const line = side === "home" ? homeLine : -homeLine;
        const modelP = teamHcpChance(hm, am, side, line);
        const pv = modelP == null ? null : hcpPriceView(f, t.kind, side, line);
        if (modelP == null || !pv) continue;
        priced.push({ market: HCP_MARKET[t.kind], selection: `${side === "home" ? fixture.homeTeam : fixture.awayTeam} ${fmtHcp(line)}`, modelP, pv });
      }
    }
  }
  for (const { market, selection, modelP, pv } of priced) {
    // 19. 11. 2026 20:21 (Michal): Pinnacle POVINNE – tip len z trhov, ktoré má Pinnacle; ten istý tip (rovnaká hranica)
    // musia mať aj aspoň 2 ďalšie zahraničné stávkovky (MIN_TOP_BOOKS). Medián „trh“ bez Pinnacle sa už na nové tipy nepoužíva (len na CLV starých).
    if (pv.sharpSource !== "Pinnacle" || pv.avg3 == null) continue;
    const odds = pv.avg3; // 19. 11. 2026 20:23 (Michal): priemer Pinnacle + 2 stávkovky, nie najvyšší kurz
    if (odds < VQ_MIN_ODDS || odds > VQ_MAX_ODDS) continue;
    if (odds > pv.median * MAX_OVER_MEDIAN) continue;
    if (Math.abs(modelP - pv.sharpP) > MAX_GAP) continue;
    if ((modelP / 100) * odds < MIN_EV_MODEL) continue;
    if ((pv.sharpP / 100) * odds < MIN_EV_SHARP) continue;
    const p = (modelP + pv.sharpP) / 2;
    const ev = (p / 100) * odds;
    if (ev < MIN_EV || ev > MAX_EV) continue;
    found.push({
      id: `${fixture.fixtureId}|${market}|${selection}`,
      fixtureId: fixture.fixtureId, matchDate: fixture.matchDate, homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam,
      league: fixture.league || f.league, country: f.country,
      market, selection,
      modelP: Math.round(modelP * 10) / 10, sharpP: Math.round(pv.sharpP * 10) / 10, sharpSource: pv.sharpSource,
      p: Math.round(p * 10) / 10, odds: Math.round(odds * 100) / 100, book: pv.avgBooks ?? pv.book, medianOdds: Math.round(pv.median * 100) / 100,
      ev: Math.round(ev * 1000) / 1000, recordedAt: now, status: "pending",
    });
  }
  // 19. 11. 2026 (Michal): z každého druhu trhu (góly, rohy, karty…) len 1 tip – ten s najväčšou dôverou (p), pri zhode vyššia hodnota.
  found.sort((a, b) => b.p - a.p || b.ev - a.ev);
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

/** Pravidlá výberu (od 19. 11. 2026 20:23): vráti dôvod vyradenia, alebo null keď tip prejde. */
function ruleFail(modelP: number, pv: PriceView): string | null {
  if (pv.sharpSource !== "Pinnacle") return "Pinnacle tip neponúka";
  if (pv.avg3 == null) return "chýba Pinnacle + 2 stávkovky";
  const odds = pv.avg3;
  if (odds < VQ_MIN_ODDS) return "priemerný kurz pod 1,70";
  if (odds > VQ_MAX_ODDS) return "priemerný kurz nad 3,20";
  if (Math.abs(modelP - pv.sharpP) > MAX_GAP) return "model a Pinnacle sa rozchádzajú";
  if ((modelP / 100) * odds < MIN_EV_MODEL) return "malá hodnota podľa modelu";
  if ((pv.sharpP / 100) * odds < MIN_EV_SHARP) return "malá hodnota podľa Pinnacle";
  const ev = (((modelP + pv.sharpP) / 2) / 100) * odds;
  if (ev < MIN_EV) return "malá hodnota";
  if (ev > MAX_EV) return "podozrivo vysoká hodnota";
  return null;
}

function closingView(f: FixtureOdds, p: TiprexPick): PriceView | null {
  const kind = (Object.keys(HCP_MARKET) as HcpKind[]).find((k) => HCP_MARKET[k] === p.market);
  if (!kind) return priceView(oddsByBook(f), p, p.homeTeam, p.awayTeam);
  const m = p.selection.match(/^(.*) ([+−-])(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const side = m[1] === p.homeTeam ? "home" : m[1] === p.awayTeam ? "away" : null;
  return side ? hcpPriceView(f, kind, side, (m[2] === "+" ? 1 : -1) * parseFloat(m[3])) : null;
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
    const pv = closingView(f, p);
    if (!pv) { p.recheck = { pass: false, reason: "tip už neponúkajú 2 stávkovky", at: new Date().toISOString() }; changed.push(p); continue; }
    const fail = ruleFail(p.modelP, pv);
    p.recheck = { pass: !fail, ...(pv.avg3 ? { odds: Math.round(pv.avg3 * 100) / 100 } : {}), ...(fail ? { reason: fail } : {}), at: new Date().toISOString() };
    if (!(pv.sharpP > 0)) { changed.push(p); continue; }
    p.closingFair = Math.round((100 / pv.sharpP) * 100) / 100;
    p.closingAt = new Date().toISOString();
    changed.push(p);
  }
  // 19. 11. 2026 (Michal: „nevieš zistiť, či by prešli“): tipy z doby pred novými pravidlami, ktorých zápas sa začal skôr,
  // než prebehla kontrola – dopočíta sa z posledných predzápasových kurzov priamo z API (každý zápas raz).
  const old = (await listPicks("pending")).concat(await listPicks("done").catch(() => [] as TiprexPick[]))
    .filter((p) => !p.recheck && p.recordedAt < "2026-11-19T19:35:00Z" && Date.now() - new Date(p.matchDate).getTime() < 3 * 24 * 3600 * 1000)
    .slice(0, 20);
  const byFx = new Map<number, FixtureOdds | null>();
  const late: TiprexPick[] = [];
  for (const p of old) {
    if (!byFx.has(p.fixtureId)) {
      byFx.set(p.fixtureId, await fetchFixtureOdds({ fixtureId: p.fixtureId, league: p.league, country: p.country, date: p.matchDate, home: p.homeTeam, away: p.awayTeam }).catch(() => null));
    }
    const f = byFx.get(p.fixtureId);
    const pv = f ? closingView(f, p) : null;
    const fail = pv ? ruleFail(p.modelP, pv) : "kurzy pred výkopom sa nedajú zistiť";
    p.recheck = { pass: !fail, ...(pv?.avg3 ? { odds: Math.round(pv.avg3 * 100) / 100 } : {}), ...(fail ? { reason: fail } : {}), at: new Date().toISOString() };
    late.push(p);
  }
  if (late.length) {
    await savePicks("pending", late.filter((p) => p.status === "pending"));
    const doneOnes = late.filter((p) => p.status !== "pending");
    if (doneOnes.length) await savePicks("done", doneOnes);
  }
}

let settling = false;
/** Vyhodnotí odohrané zápasy (každých 15 minút). */
/** 22. 11. 2026: raz prepočíta už vyhodnotené TIPREX tipy na karty – aj s druhými žltými (API ich ráta ako červené). */
// v2: prvý beh (s prvou verziou opravy) nastavil príznak skôr, než sa druhé žlté rátali správne.
const RESETTLE_CARDS_KEY = "tiprex_migr_second_yellow_1122_v2";
let resettledCards = false;
export async function resettleTiprexCardsOnce(): Promise<number> {
  if (resettledCards) return 0;
  resettledCards = true;
  if (useUpstash && (await redis(["GET", RESETTLE_CARDS_KEY]))) return 0;
  const done = (await listPicksRaw("done")).filter((p) => /karty|Karty/.test(p.market) && (p.status === "won" || p.status === "lost"));
  const byFixture = new Map<number, TiprexPick[]>();
  for (const p of done) byFixture.set(p.fixtureId, [...(byFixture.get(p.fixtureId) ?? []), p]);
  let changed = 0;
  for (const [, picks] of byFixture) {
    try {
      const out = await settleFixtureBets(picks[0], picks);
      if (!out) continue;
      const upd = picks.filter((p, i) => out[i] !== p.status && (p.status = out[i], true));
      if (upd.length) { await savePicks("done", upd); changed += upd.length; }
    } catch { /* ďalší zápas */ }
  }
  if (useUpstash) await redis(["SET", RESETTLE_CARDS_KEY, new Date().toISOString()]);
  return changed;
}

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

// ---------- Verejný web tiprex.eu (18. 11. 2026) ----------

/**
 * Verejné čísla pre tiprex.eu – LEN vyhodnotené tipy (čakajúce nie, tie budú pre platiacich členov).
 * Bez mena stávkovky a šancí modelu – návštevník vidí zápas, tip, kurz a výsledok.
 */
export async function tiprexPublicStats() {
  const done = (await listPicks("done")).filter((p) => p.status !== "pending").sort((a, b) => b.matchDate.localeCompare(a.matchDate));
  const total = agg();
  const byMonth = new Map<string, Agg>();
  for (const p of done) {
    add(total, p);
    const m = skDay(p.matchDate).slice(0, 7);
    const a = byMonth.get(m) ?? agg(); add(a, p); byMonth.set(m, a);
  }
  const t = fin(total);
  return {
    startedAt: "2026-11-18",
    total: { n: t.n, won: t.won, lost: t.lost, void: t.void, profit: t.profit, hit: t.hit, avgOdds: t.avgOdds, clvPlus: t.clvPlus, clvN: t.clvN },
    byMonth: [...byMonth].map(([k, a]) => ({ key: k, ...fin(a) })).sort((x, y) => y.key.localeCompare(x.key)).map((r) => ({ key: r.key, n: r.n, won: r.won, profit: r.profit })),
    recent: done.slice(0, 30).map((p) => ({
      date: p.matchDate, league: p.league, home: p.homeTeam, away: p.awayTeam, market: marketEn(p.market), selection: selectionEn(p.selection, p.homeTeam, p.awayTeam), odds: p.odds, status: p.status,
    })),
  };
}

const MARKET_EN: Record<string, string> = {
  "Góly": "Total goals", "Góly domácich": "Home team goals", "Góly hostí": "Away team goals",
  "Góly v 1. polčase": "1st half goals", "Góly v 2. polčase": "2nd half goals",
  "Rohy": "Total corners", "Rohy domácich": "Home team corners", "Rohy hostí": "Away team corners",
  "Karty": "Total cards", "Karty domácich": "Home team cards", "Karty hostí": "Away team cards",
  "Karty v 1. polčase": "1st half cards", "Karty v 2. polčase": "2nd half cards",
  "Strely na bránu": "Shots on target", "Strely na bránu domácich": "Home shots on target", "Strely na bránu hostí": "Away shots on target",
  "Fauly": "Total fouls", "Fauly domácich": "Home team fouls", "Fauly hostí": "Away team fouls",
  "Výsledok zápasu": "Match result", "Ázijský handicap": "Asian handicap", "Ázijský handicap – rohy": "Corners handicap",
  "Ázijský handicap – karty": "Cards handicap", "Ázijský handicap – strely na bránu": "Shots on target handicap", "Oba tímy skórujú": "Both teams to score", "Obaja tímy skórujú": "Both teams to score",
};
export function marketEn(m: string): string { return MARKET_EN[m] ?? m; }
export function selectionEn(sel: string, home: string, away: string): string {
  if (sel === "Remíza") return "Draw";
  if (sel === "Áno") return "Yes";
  if (sel === "Nie") return "No";
  if (sel.startsWith("Výhra ")) return `${sel.slice(6)} to win`;
  return sel.replace(/−/g, "-");
}

const WAITLIST_KEY = "tiprex_waitlist";
/** Poradovník záujemcov z tiprex.eu (e-mail + voliteľne Telegram). Vráti false, ak už bol zapísaný. */
export async function addTiprexWaitlist(email: string, telegram: string, country: string): Promise<boolean> {
  const id = email.trim().toLowerCase();
  const entry = JSON.stringify({ email: id, telegram: telegram.trim().slice(0, 64), country: country.trim().slice(0, 64), at: new Date().toISOString() });
  if (!useUpstash) {
    const f = path.join(__dirname, "..", "data", "tiprex-waitlist.json");
    let d: Record<string, string> = {};
    try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch { /* prázdny */ }
    if (d[id]) return false;
    d[id] = entry;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(d));
    return true;
  }
  const res = await redis(["HSETNX", WAITLIST_KEY, id, entry]);
  return Number(res) === 1;
}
export async function tiprexWaitlistCount(): Promise<number> {
  if (!useUpstash) {
    try { return Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "tiprex-waitlist.json"), "utf8"))).length; } catch { return 0; }
  }
  return Number(await redis(["HLEN", WAITLIST_KEY])) || 0;
}
