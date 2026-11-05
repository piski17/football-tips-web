import * as fs from "fs";
import * as path from "path";
import axios from "axios";

// Surebety (2. 11. 2026, Michalov vedľajší projekt – SKÚŠKA na 2 týždne).
// Server z kurzov API-Football hľadá zápasy, kde dve stávkovky ponúkajú opačné
// stávky (nad / pod, áno / nie, párny / nepárny, víťaz bez remízy) s takými kurzami,
// že vsadením na obe strany je zisk istý. Len dve stávkovky, len dvojcestné trhy.
// Nedotýka sa tipov, štatistík ani klientov. Každú hodinu prehľadá DNEŠNÉ zápasy 19 súťaží TipRadaru (od 3. 11. 2026 večer, predtým 7 dní dopredu)
// a nájdené surebety zapíše do evidencie (Upstash hash), aby sa po skúške dalo
// vyhodnotiť, koľko ich bolo a aký by bol zisk.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);
const LOG_KEY = "tipradar_surebets";
const BOOKS_META = "surebets_my_books";
const FILE = path.join(__dirname, "..", "data", "surebets.json");
const KEEP_DAYS = 45;
/** Najviac strán kurzov na jednu súťaž (1 strana = 10 zápasov = 1 požiadavka). */
const MAX_PAGES_PER_LEAGUE = 6;
/** Koľko dní dopredu sa surebety hľadajú (stávkovky vypisujú kurzy zvyčajne týždeň vopred). */
export const DAYS_AHEAD = 0; // 3. 11. 2026 (Michal): len zápasy DNEŠNÉHO dňa (predtým 7 dní dopredu)
/** Surebet s väčším ziskom je takmer vždy chyba v kurzoch (preklep, iné pravidlá trhu). */
export const SUSPICIOUS_MARGIN = 0.08;
/** Menší zisk nemá zmysel – zaokrúhlenie vkladov a zmena kurzu ho zjedia. */
export const MIN_MARGIN = 0.005;
const SCAN_EVERY_MS = 60 * 60 * 1000; // každú hodinu

export interface BookOdd { book: string; odd: number }
export interface FixtureOdds {
  fixtureId: number;
  league: string;
  country: string;
  date: string;
  home: string;
  away: string;
  /** betId -> { name, values: value -> kurzy jednotlivých stávkoviek } */
  bets: Record<string, { name: string; values: Record<string, BookOdd[]> }>;
}
export interface SurebetSide { label: string; book: string; odd: number }
export interface Surebet {
  key: string;
  fixtureId: number;
  league: string;
  country: string;
  date: string;
  home: string;
  away: string;
  market: string;
  sides: [SurebetSide, SurebetSide];
  /** Istý zisk ako podiel celého vkladu (0,02 = 2 %). */
  margin: number;
  suspicious: boolean;
}
export interface SurebetLogEntry extends Surebet {
  scope: "mine" | "all";
  firstSeen: string;
  lastSeen: string;
  seen: number;
  maxMargin: number;
}

let lastScan: { at: string; fixtures: FixtureOdds[]; requests: number; books: string[]; error?: string } | null = null;
let scanning = false;
/** Zápis valuebetov po každom prehľadaní (nastaví valuebets.ts). */
let onScan: (() => Promise<void>) | null = null;
export function setOnScan(fn: () => Promise<void>): void { onScan = fn; }
/** Zápasy a kurzy z posledného prehľadania (pre valuebety). */
export function scannedFixtures(): FixtureOdds[] { return lastScan?.fixtures ?? []; }
export function lastScanAt(): string | null { return lastScan?.at ?? null; }

function api() {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error("Na serveri chýba API_FOOTBALL_KEY.");
  return axios.create({ baseURL: "https://v3.football.api-sports.io", headers: { "x-apisports-key": key }, timeout: 20000 });
}
function apiErrors(data: any): string {
  const e = data?.errors;
  if (!e) return "";
  const list = Array.isArray(e) ? e.map(String) : Object.values(e).map(String);
  return list.join(" | ");
}
/** Dátum YYYY-MM-DD v slovenskom čase, posunutý o `plus` dní. */
function skDate(plus: number): string {
  const d = new Date(Date.now() + plus * 86400000);
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Bratislava" });
}
/** Sezóna európskych súťaží: od júla nová (2026 = 2026/27). */
function currentSeason(): number {
  const now = new Date();
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

export interface SurebetLeague { id: number; name: string; country: string }
/** Súťaže TipRadaru (LEAGUE_PRESETS zo server.ts) – nastaví ich startSurebetScanner. */
let LEAGUES: SurebetLeague[] = [];

/** Jedna súťaž: najbližšie zápasy (mená tímov) + ich kurzy. Asi 2 – 4 požiadavky. */
async function scanLeague(lg: SurebetLeague, out: Map<number, FixtureOdds>, counter: { n: number }): Promise<void> {
  const http = api();
  const season = currentSeason();
  const names = new Map<number, { home: string; away: string; status: string }>();
  const fx = await http.get("/fixtures", { params: { league: lg.id, season, from: skDate(0), to: skDate(DAYS_AHEAD), timezone: "Europe/Bratislava" } });
  counter.n++;
  for (const f of fx.data?.response ?? []) {
    names.set(Number(f?.fixture?.id), { home: f?.teams?.home?.name ?? "?", away: f?.teams?.away?.name ?? "?", status: f?.fixture?.status?.short ?? "" });
  }
  if (!names.size) return; // súťaž v týchto dňoch nehrá – kurzy netreba
  let page = 1;
  let total = 1;
  do {
    const res = await http.get("/odds", { params: { league: lg.id, season, page, timezone: "Europe/Bratislava" } });
    counter.n++;
    const err = apiErrors(res.data);
    if (err) throw new Error(err);
    total = Number(res.data?.paging?.total) || 1;
    for (const item of res.data?.response ?? []) {
      const id = Number(item?.fixture?.id);
      const when = String(item?.fixture?.date ?? "");
      const nm = names.get(id);
      // Len zápasy najbližších dní, ktoré sa ešte nezačali.
      if (!id || !when || !nm || new Date(when).getTime() <= Date.now() || (nm.status !== "NS" && nm.status !== "TBD")) continue;
      const fo: FixtureOdds = out.get(id) ?? { fixtureId: id, league: lg.name, country: lg.country, date: when, home: nm.home, away: nm.away, bets: {} };
      for (const bk of item?.bookmakers ?? []) {
        const book = String(bk?.name ?? "").trim();
        if (!book) continue;
        for (const bet of bk?.bets ?? []) {
          const betKey = String(bet?.id ?? bet?.name);
          const slot = (fo.bets[betKey] ??= { name: String(bet?.name ?? ""), values: {} });
          for (const v of bet?.values ?? []) {
            const odd = parseFloat(String(v?.odd ?? "").replace(",", "."));
            if (!isFinite(odd) || odd <= 1) continue;
            (slot.values[String(v?.value ?? "").trim()] ??= []).push({ book, odd });
          }
        }
      }
      out.set(id, fo);
    }
    page++;
  } while (page <= total && page <= MAX_PAGES_PER_LEAGUE);
}

/** Prehľadá kurzy zápasov TipRadar súťaží na najbližších DAYS_AHEAD dní (asi 30 – 60 požiadaviek API). */
export async function scanSurebets(): Promise<void> {
  if (scanning || !LEAGUES.length) return;
  scanning = true;
  const counter = { n: 0 };
  const failed: string[] = [];
  try {
    const out = new Map<number, FixtureOdds>();
    for (const lg of LEAGUES) {
      try { await scanLeague(lg, out, counter); } catch (err: any) { failed.push(`${lg.name}: ${String(err?.message ?? err)}`); }
    }
    const books = new Set<string>();
    for (const f of out.values()) for (const b of Object.values(f.bets)) for (const list of Object.values(b.values)) for (const o of list) books.add(o.book);
    lastScan = { at: new Date().toISOString(), fixtures: [...out.values()], requests: counter.n, books: [...books].sort((a, b) => a.localeCompare(b)), ...(failed.length ? { error: failed.join(" · ").slice(0, 300) } : {}) };
    await logCurrent();
    if (onScan) await onScan().catch((err) => console.error("Valuebety – zápis zlyhal:", err));
  } catch (err: any) {
    lastScan = { at: new Date().toISOString(), fixtures: lastScan?.fixtures ?? [], requests: counter.n, books: lastScan?.books ?? [], error: String(err?.message ?? err) };
  } finally {
    scanning = false;
  }
}

// ---------- Výpočet ----------

const MARKET_SK: Record<string, string> = {
  "goals over/under": "Góly v zápase",
  "goals over/under first half": "Góly v 1. polčase",
  "goals over/under - second half": "Góly v 2. polčase",
  "home/away": "Víťaz bez remízy",
  "both teams score": "Oba tímy skórujú",
  "both teams score - first half": "Oba tímy skórujú v 1. polčase",
  "both teams score - second half": "Oba tímy skórujú v 2. polčase",
  "odd/even": "Párny / nepárny počet gólov",
  "corners over under": "Rohy v zápase",
  "cards over/under": "Karty v zápase",
  "total - home": "Góly domácich",
  "total - away": "Góly hostí",
  // 3. 11. 2026: ďalšie trhy, ktoré API vracia po anglicky
  "home corners over/under": "Rohy domácich",
  "away corners over/under": "Rohy hostí",
  "total corners (1st half)": "Rohy v 1. polčase",
  "total corners (2nd half)": "Rohy v 2. polčase",
  "home team total cards": "Karty domácich",
  "away team total cards": "Karty hostí",
  "cards over/under 1st half": "Karty v 1. polčase",
  "corners over under 1st half": "Rohy v 1. polčase",
  "home team total goals(1st half)": "Góly domácich v 1. polčase",
  "away team total goals(1st half)": "Góly hostí v 1. polčase",
};
export function marketName(raw: string): string {
  return MARKET_SK[raw.trim().toLowerCase()] ?? raw;
}
export function sideLabel(value: string, f: FixtureOdds): string {
  const v = value.trim();
  let m = /^over\s+([\d.]+)$/i.exec(v);
  if (m) return "Nad " + m[1].replace(".", ",");
  m = /^under\s+([\d.]+)$/i.exec(v);
  if (m) return "Pod " + m[1].replace(".", ",");
  const map: Record<string, string> = { yes: "Áno", no: "Nie", odd: "Nepárny", even: "Párny", home: f.home, away: f.away };
  return map[v.toLowerCase()] ?? v;
}
/** Trhy, kde sú hodnoty síce dvojcestné, ale nie navzájom opačné (vynechať). */
const SKIP_BET = /handicap|player|scorer|exact|correct|interval|race|minute|first\s*(team|goal|corner|card)|last|to qualify|method|which team|winning margin/i;

/** Dvojice opačných stávok v jednom trhu. */
export function pairsOf(name: string, values: Record<string, BookOdd[]>): [string, string][] {
  if (SKIP_BET.test(name)) return [];
  const keys = Object.keys(values);
  const has = (k: string) => keys.find((x) => x.toLowerCase() === k);
  const pairs: [string, string][] = [];
  if (/^home\/away$/i.test(name.trim()) && has("home") && has("away")) pairs.push([has("home")!, has("away")!]);
  if (has("yes") && has("no")) pairs.push([has("yes")!, has("no")!]);
  if (has("odd") && has("even")) pairs.push([has("odd")!, has("even")!]);
  for (const k of keys) {
    const m = /^over\s+(\d+)\.5$/i.exec(k); // len hranice x,5 – bez vrátenia vkladu a polovičných výhier
    if (!m) continue;
    const under = keys.find((x) => new RegExp("^under\\s+" + m[1] + "\\.5$", "i").test(x));
    if (under) pairs.push([k, under]);
  }
  return pairs;
}
function best(list: BookOdd[], allowed: Set<string> | null): BookOdd | null {
  let b: BookOdd | null = null;
  for (const o of list) if ((!allowed || allowed.has(o.book)) && (!b || o.odd > b.odd)) b = o;
  return b;
}
/** Najlepšia dvojica z dvoch RÔZNYCH stávkoviek (jedna stávkovka sama so sebou surebet nedáva). */
function bestPair(a: BookOdd[], b: BookOdd[], allowed: Set<string> | null): [BookOdd, BookOdd] | null {
  const fa = a.filter((o) => !allowed || allowed.has(o.book)).sort((x, y) => y.odd - x.odd);
  const fb = b.filter((o) => !allowed || allowed.has(o.book)).sort((x, y) => y.odd - x.odd);
  let res: [BookOdd, BookOdd] | null = null;
  let bestSum = Infinity;
  for (const x of fa.slice(0, 4)) for (const y of fb.slice(0, 4)) {
    if (x.book === y.book) continue;
    const s = 1 / x.odd + 1 / y.odd;
    if (s < bestSum) { bestSum = s; res = [x, y]; }
  }
  return res;
}

export function computeSurebets(allowedBooks: string[] | null, minMargin = MIN_MARGIN): Surebet[] {
  if (!lastScan) return [];
  const allowed = allowedBooks && allowedBooks.length ? new Set(allowedBooks) : null;
  const out: Surebet[] = [];
  const now = Date.now();
  for (const f of lastScan.fixtures) {
    if (new Date(f.date).getTime() <= now) continue;
    for (const [betId, bet] of Object.entries(f.bets)) {
      for (const [va, vb] of pairsOf(bet.name, bet.values)) {
        const pair = bestPair(bet.values[va], bet.values[vb], allowed);
        if (!pair) continue;
        const sum = 1 / pair[0].odd + 1 / pair[1].odd;
        if (sum >= 1) continue;
        const margin = 1 / sum - 1;
        if (margin < minMargin) continue;
        out.push({
          key: `${f.fixtureId}|${betId}|${va}`,
          fixtureId: f.fixtureId,
          league: f.league,
          country: f.country,
          date: f.date,
          home: f.home,
          away: f.away,
          market: marketName(bet.name),
          sides: [
            { label: sideLabel(va, f), book: pair[0].book, odd: pair[0].odd },
            { label: sideLabel(vb, f), book: pair[1].book, odd: pair[1].odd },
          ],
          margin: Math.round(margin * 10000) / 10000,
          suspicious: margin >= SUSPICIOUS_MARGIN,
        });
      }
    }
  }
  return out.sort((a, b) => b.margin - a.margin);
}

// ---------- Evidencia (na vyhodnotenie skúšky) ----------

async function redis(command: (string | number)[]): Promise<any> {
  const res = await axios.post(UPSTASH_URL!, command, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }, timeout: 20000 });
  return res.data?.result;
}
function readFile(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; }
}
function writeFile(all: Record<string, string>): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all));
}
async function hgetall(key: string): Promise<Record<string, string>> {
  if (!useUpstash) return readFile();
  const flat: string[] = (await redis(["HGETALL", key])) ?? [];
  const o: Record<string, string> = {};
  for (let i = 0; i + 1 < flat.length; i += 2) o[flat[i]] = flat[i + 1];
  return o;
}
async function hsetMany(key: string, pairs: Record<string, string>): Promise<void> {
  const entries = Object.entries(pairs);
  if (!entries.length) return;
  if (!useUpstash) { writeFile({ ...readFile(), ...pairs }); return; }
  for (let i = 0; i < entries.length; i += 50) await redis(["HSET", key, ...entries.slice(i, i + 50).flat()]);
}

export async function getMyBooks(): Promise<string[]> {
  try {
    const { getMeta } = await import("./metaStore");
    const raw = await getMeta(BOOKS_META);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map(String).slice(0, 12) : [];
  } catch { return []; }
}
export async function setMyBooks(books: string[]): Promise<void> {
  const { setMeta } = await import("./metaStore");
  await setMeta(BOOKS_META, JSON.stringify(books.map(String).slice(0, 12)));
}

async function logCurrent(): Promise<void> {
  const mine = await getMyBooks();
  const found: { scope: "mine" | "all"; s: Surebet }[] = computeSurebets(null).filter((s) => !s.suspicious).map((s) => ({ scope: "all" as const, s }));
  if (mine.length >= 2) for (const s of computeSurebets(mine).filter((x) => !x.suspicious)) found.push({ scope: "mine", s });
  if (!found.length) return;
  const existing = await hgetall(LOG_KEY);
  const now = new Date().toISOString();
  const updates: Record<string, string> = {};
  for (const { scope, s } of found) {
    const id = scope + "|" + s.key;
    let prev: SurebetLogEntry | null = null;
    try { prev = existing[id] ? JSON.parse(existing[id]) : null; } catch { prev = null; }
    const entry: SurebetLogEntry = prev
      ? { ...prev, lastSeen: now, seen: prev.seen + 1, ...(s.margin > prev.maxMargin ? { sides: s.sides, maxMargin: s.margin } : {}), margin: s.margin }
      : { ...s, scope, firstSeen: now, lastSeen: now, seen: 1, maxMargin: s.margin };
    updates[id] = JSON.stringify(entry);
  }
  await hsetMany(LOG_KEY, updates);
}

export async function surebetLog(): Promise<SurebetLogEntry[]> {
  const all = await hgetall(LOG_KEY);
  // Len súťaže TipRadaru (prvé hľadanie 2. 11. večer bralo všetky ligy sveta).
  const names = new Set(LEAGUES.map((l) => l.name));
  const out: SurebetLogEntry[] = [];
  const limit = Date.now() - KEEP_DAYS * 86400000;
  const old: string[] = [];
  for (const [k, v] of Object.entries(all)) {
    try {
      const e = JSON.parse(v) as SurebetLogEntry;
      // Záznamy zápasov ďalších dní (zapísané pred 3. 11. 2026 večer) sa mažú – rátajú sa len dnešné.
      const day = new Date(e.date).toLocaleDateString("sv-SE", { timeZone: "Europe/Bratislava" });
      if (new Date(e.date).getTime() < limit || day > skDate(0)) old.push(k);
      else if (!names.size || names.has(e.league)) out.push({ ...e, market: marketName(e.market) /* staré záznamy majú anglický názov */ });
    } catch { /* poškodený záznam */ }
  }
  if (old.length && useUpstash) await redis(["HDEL", LOG_KEY, ...old]).catch(() => {});
  return out;
}

export function surebetStatus() {
  return {
    at: lastScan?.at ?? null,
    scanning,
    requests: lastScan?.requests ?? 0,
    fixtures: lastScan?.fixtures.length ?? 0,
    books: lastScan?.books ?? [],
    leagues: LEAGUES.length,
    daysAhead: DAYS_AHEAD,
    error: lastScan?.error ?? null,
  };
}

export function startSurebetScanner(leagues: SurebetLeague[]): void {
  LEAGUES = leagues.map((l) => ({ id: l.id, name: l.name, country: l.country }));
  setTimeout(() => void scanSurebets(), 60 * 1000); // minútu po štarte servera
  setInterval(() => void scanSurebets(), SCAN_EVERY_MS);
}
