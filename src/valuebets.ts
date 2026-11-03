import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { scannedFixtures, lastScanAt, setOnScan, pairsOf, marketName, sideLabel, FixtureOdds, BookOdd } from "./surebets";
import { getFixtureCornersAndCards } from "./apiClient";

// Valuebety – hodnotné stávky (3. 11. 2026, Michalov vedľajší projekt popri surebetoch, SKÚŠKA).
// Z tých istých kurzov ako surebety (API-Football, 17 súťaží TipRadaru, 7 dní dopredu, každú hodinu)
// sa pre každý dvojcestný trh vypočíta „férová“ šanca bez marže stávkovky:
//   – ak trh ponúka Pinnacle (najpresnejšia stávkovka), berie sa jeho kurz bez marže,
//   – inak medián všetkých stávkoviek bez marže (aspoň 4 stávkovky).
// Valuebet = niektorá stávkovka dáva vyšší kurz, než zodpovedá férovej šanci, aspoň o +3 %.
// Na rozdiel od surebetu nie je zisk istý – oplatí sa až z dlhodobého hľadiska (veľa stávok).
// Každý valuebet sa zapíše pri prvom objavení (kurz, stávkovka, hodnota) a po zápase sa sám
// vyhodnotí (1 jednotka na stávku). Nedotýka sa tipov TipRadaru, štatistík ani klientov.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);
const LOG_KEY = "tipradar_valuebets";
const FILE = path.join(__dirname, "..", "data", "valuebets.json");
const KEEP_DAYS = 120;

/** Najmenšia hodnota valuebetu (+3 %). */
export const MIN_VALUE = 0.03;
/** Hodnota nad +15 % je takmer vždy chyba v kurze alebo iné pravidlá trhu – nezapisuje sa. */
export const SUSPICIOUS_VALUE = 0.15;
/** Pásmo kurzov – pri veľmi nízkych a vysokých kurzoch je odhad férovej šance nespoľahlivý. */
export const MIN_ODD = 1.4;
export const MAX_ODD = 4.0;
/** Bez Pinnaclu treba aspoň toľko stávkoviek s oboma stranami trhu. */
const MIN_BOOKS = 4;

/** Trhy, ktoré vie server po zápase sám vyhodnotiť (názov stávky v API-Football, malými). */
const SETTLEABLE = new Set([
  "goals over/under",
  "goals over/under first half",
  "goals over/under - second half",
  "both teams score",
  "both teams score - first half",
  "both teams score - second half",
  "home/away",
  "odd/even",
  "total - home",
  "total - away",
  "corners over under",
  "cards over/under",
]);

export interface Valuebet {
  key: string;
  fixtureId: number;
  league: string;
  date: string;
  home: string;
  away: string;
  betName: string;
  market: string;
  value: string;
  label: string;
  book: string;
  odd: number;
  /** Férový kurz (bez marže). */
  fairOdd: number;
  /** Férová šanca 0 – 1. */
  fairProb: number;
  /** Hodnota: kurz × férová šanca − 1 (0,05 = +5 %). */
  ev: number;
  /** Odkiaľ je férová šanca: Pinnacle alebo medián N stávkoviek. */
  source: string;
  suspicious: boolean;
}
export interface ValuebetLogEntry extends Valuebet {
  firstSeen: string;
  lastSeen: string;
  seen: number;
  /** Najvyšší kurz, aký sa neskôr objavil (len na info – vyhodnocuje sa prvý kurz). */
  maxOdd: number;
  status: "pending" | "won" | "lost" | "void";
  /** Zisk v jednotkách pri vklade 1 j. */
  profit?: number;
  result?: string;
  settledAt?: string;
  /** Michalova skutočná stávka (3. 11. 2026): vklad v €, kurz, ktorý naozaj dostal, a kedy. */
  myStake?: number;
  myOdd?: number;
  myAt?: string;
  /** Zadané ručne cez „Overiť kurz“ (kurz z mojej stávkovky) – nerátá sa do výsledkov skúšky. */
  manual?: boolean;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Férová šanca strany A v dvojcestnom trhu (alebo null, keď je málo dát). */
function fairProbability(a: BookOdd[], b: BookOdd[]): { p: number; source: string } | null {
  const both: { book: string; pa: number }[] = [];
  for (const x of a) {
    const y = b.find((o) => o.book === x.book);
    if (!y) continue;
    const ia = 1 / x.odd, ib = 1 / y.odd;
    if (ia + ib < 1) continue; // kurz bez marže = chyba v dátach
    both.push({ book: x.book, pa: ia / (ia + ib) });
  }
  const pin = both.find((x) => /pinnacle/i.test(x.book));
  if (pin) return { p: pin.pa, source: "Pinnacle" };
  if (both.length < MIN_BOOKS) return null;
  return { p: median(both.map((x) => x.pa)), source: `priemer ${both.length} stávkoviek` };
}

function valuebetsOf(f: FixtureOdds, includeSuspicious: boolean): Valuebet[] {
  const out: Valuebet[] = [];
  for (const [betId, bet] of Object.entries(f.bets)) {
    if (!SETTLEABLE.has(bet.name.trim().toLowerCase())) continue;
    for (const [va, vb] of pairsOf(bet.name, bet.values)) {
      const fair = fairProbability(bet.values[va], bet.values[vb]);
      if (!fair) continue;
      for (const [side, p] of [[va, fair.p], [vb, 1 - fair.p]] as [string, number][]) {
        // Najvyšší kurz na túto stranu (Pinnacle sám seba neporazí – ten sa vynecháva, keď je zdrojom).
        let bestO: BookOdd | null = null;
        for (const o of bet.values[side]) {
          if (fair.source === "Pinnacle" && /pinnacle/i.test(o.book)) continue;
          if (!bestO || o.odd > bestO.odd) bestO = o;
        }
        if (!bestO || bestO.odd < MIN_ODD || bestO.odd > MAX_ODD) continue;
        const ev = bestO.odd * p - 1;
        if (ev < MIN_VALUE) continue;
        const suspicious = ev > SUSPICIOUS_VALUE;
        if (suspicious && !includeSuspicious) continue;
        out.push({
          key: `${f.fixtureId}|${betId}|${side}`,
          fixtureId: Number(f.fixtureId),
          league: f.league,
          date: f.date,
          home: f.home,
          away: f.away,
          betName: bet.name,
          market: marketName(bet.name),
          value: side,
          label: sideLabel(side, f),
          book: bestO.book,
          odd: bestO.odd,
          fairOdd: Math.round((1 / p) * 100) / 100,
          fairProb: Math.round(p * 10000) / 10000,
          ev: Math.round(ev * 10000) / 10000,
          source: fair.source,
          suspicious,
        });
      }
    }
  }
  return out;
}

/** Férové kurzy všetkých trhov (pre „Overiť kurz“): zápas → trhy → dve strany s férovým kurzom. */
export interface FairMarket { betId: string; market: string; sides: { value: string; label: string; fairOdd: number; best: number; bestBook: string }[]; source: string }
export interface FairFixture { fixtureId: number; league: string; date: string; home: string; away: string; markets: FairMarket[] }
export function fairOdds(): FairFixture[] {
  const now = Date.now();
  const out: FairFixture[] = [];
  for (const f of scannedFixtures()) {
    if (new Date(f.date).getTime() <= now) continue;
    const markets: FairMarket[] = [];
    for (const [betId, bet] of Object.entries(f.bets)) {
      if (!SETTLEABLE.has(bet.name.trim().toLowerCase())) continue;
      for (const [va, vb] of pairsOf(bet.name, bet.values)) {
        const fair = fairProbability(bet.values[va], bet.values[vb]);
        if (!fair) continue;
        const side = (v: string, p: number) => {
          const b = bet.values[v].reduce((m, o) => (o.odd > m.odd ? o : m), bet.values[v][0]);
          return { value: v, label: sideLabel(v, f), fairOdd: Math.round((1 / p) * 100) / 100, best: b.odd, bestBook: b.book };
        };
        markets.push({ betId, market: marketName(bet.name), sides: [side(va, fair.p), side(vb, 1 - fair.p)], source: fair.source });
      }
    }
    if (markets.length) out.push({ fixtureId: Number(f.fixtureId), league: f.league, date: f.date, home: f.home, away: f.away, markets });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Ručne zadaná stávka z vlastnej stávkovky („Overiť kurz“ → Zahral som). Vyhodnotí sa ako ostatné. */
export async function addManualBet(fixtureId: number, betId: string, value: string, odd: number, stake: number, book: string): Promise<ValuebetLogEntry> {
  const f = scannedFixtures().find((x) => Number(x.fixtureId) === fixtureId);
  const bet = f?.bets[betId];
  if (!f || !bet || !bet.values[value]) throw new Error("Zápas alebo trh sa nenašiel – obnovte stránku.");
  const pair = pairsOf(bet.name, bet.values).find((pr) => pr.includes(value));
  const fair = pair ? fairProbability(bet.values[pair[0]], bet.values[pair[1]]) : null;
  if (!pair || !fair) throw new Error("Pre tento trh nie je férový kurz.");
  const p = pair[0] === value ? fair.p : 1 - fair.p;
  if (!(odd > 1 && odd < 100) || !(stake > 0)) throw new Error("Zadajte vklad aj kurz.");
  const key = `${f.fixtureId}|${betId}|${value}|ručne`;
  const at = new Date().toISOString();
  const e: ValuebetLogEntry = {
    key, fixtureId: Number(f.fixtureId), league: f.league, date: f.date, home: f.home, away: f.away,
    betName: bet.name, market: marketName(bet.name), value, label: sideLabel(value, f),
    book: book.trim().slice(0, 40) || "Moja stávkovka", odd, fairOdd: Math.round((1 / p) * 100) / 100, fairProb: Math.round(p * 10000) / 10000,
    ev: Math.round((odd * p - 1) * 10000) / 10000, source: fair.source, suspicious: false,
    firstSeen: at, lastSeen: at, seen: 1, maxOdd: odd, status: "pending",
    myStake: Math.round(stake * 100) / 100, myOdd: Math.round(odd * 100) / 100, myAt: at, manual: true,
  };
  await hsetMany({ [key]: JSON.stringify(e) });
  return e;
}

/** Aktuálne valuebety z posledného prehľadania (len zápasy, ktoré sa ešte nezačali). */
export function computeValuebets(allowedBooks: string[] | null): Valuebet[] {
  const allowed = allowedBooks && allowedBooks.length ? new Set(allowedBooks) : null;
  const now = Date.now();
  const out: Valuebet[] = [];
  for (const f of scannedFixtures()) {
    if (new Date(f.date).getTime() <= now) continue;
    for (const v of valuebetsOf(f, true)) if (!allowed || allowed.has(v.book)) out.push(v);
  }
  return out.sort((a, b) => b.ev - a.ev);
}

// ---------- Evidencia ----------

async function redis(command: (string | number)[]): Promise<any> {
  const res = await axios.post(UPSTASH_URL!, command, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }, timeout: 20000 });
  return res.data?.result;
}
function readFile(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; }
}
async function hgetall(): Promise<Record<string, string>> {
  if (!useUpstash) return readFile();
  const flat: string[] = (await redis(["HGETALL", LOG_KEY])) ?? [];
  const o: Record<string, string> = {};
  for (let i = 0; i + 1 < flat.length; i += 2) o[flat[i]] = flat[i + 1];
  return o;
}
async function hsetMany(pairs: Record<string, string>): Promise<void> {
  const entries = Object.entries(pairs);
  if (!entries.length) return;
  if (!useUpstash) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ ...readFile(), ...pairs }));
    return;
  }
  for (let i = 0; i < entries.length; i += 50) await redis(["HSET", LOG_KEY, ...entries.slice(i, i + 50).flat()]);
}
async function hdel(keys: string[]): Promise<void> {
  if (!keys.length) return;
  if (!useUpstash) {
    const all = readFile();
    for (const k of keys) delete all[k];
    fs.writeFileSync(FILE, JSON.stringify(all));
    return;
  }
  await redis(["HDEL", LOG_KEY, ...keys]);
}
function parseAll(all: Record<string, string>): ValuebetLogEntry[] {
  const out: ValuebetLogEntry[] = [];
  for (const v of Object.values(all)) {
    try { out.push(JSON.parse(v)); } catch { /* poškodený záznam */ }
  }
  return out;
}

/** Po každom prehľadaní: nové valuebety zapíše (prvý kurz platí), staré len označí ako znova videné. */
async function logValuebets(): Promise<void> {
  const now = Date.now();
  const found: Valuebet[] = [];
  for (const f of scannedFixtures()) {
    if (new Date(f.date).getTime() <= now) continue;
    found.push(...valuebetsOf(f, false));
  }
  if (!found.length) return;
  const existing = await hgetall();
  const at = new Date().toISOString();
  const updates: Record<string, string> = {};
  for (const v of found) {
    let prev: ValuebetLogEntry | null = null;
    try { prev = existing[v.key] ? JSON.parse(existing[v.key]) : null; } catch { prev = null; }
    const entry: ValuebetLogEntry = prev
      ? { ...prev, lastSeen: at, seen: prev.seen + 1, maxOdd: Math.max(prev.maxOdd, v.odd) }
      : { ...v, firstSeen: at, lastSeen: at, seen: 1, maxOdd: v.odd, status: "pending" };
    updates[v.key] = JSON.stringify(entry);
  }
  await hsetMany(updates);
}

/** Zapíše (alebo pri vklade 0 zruší) vlastnú stávku k valuebetu. Vyhodnotí sa spolu s ním. */
export async function setMyBet(key: string, stake: number, odd: number): Promise<ValuebetLogEntry> {
  let raw: string | null;
  if (!useUpstash) raw = readFile()[key] ?? null;
  else raw = (await redis(["HGET", LOG_KEY, key])) ?? null;
  if (!raw) throw new Error("Tento valuebet sa nenašiel v zázname.");
  const e = JSON.parse(raw) as ValuebetLogEntry;
  if (stake > 0) {
    if (!(odd > 1 && odd < 100)) throw new Error("Zadajte kurz, napr. 2,10.");
    e.myStake = Math.round(stake * 100) / 100;
    e.myOdd = Math.round(odd * 100) / 100;
    e.myAt = new Date().toISOString();
  } else if (e.manual) {
    await hdel([key]); // ručne zadaná stávka sa pri zrušení zmaže celá
    return e;
  } else {
    delete e.myStake; delete e.myOdd; delete e.myAt;
  }
  await hsetMany({ [key]: JSON.stringify(e) });
  return e;
}

export async function valuebetLog(): Promise<ValuebetLogEntry[]> {
  const list = parseAll(await hgetall());
  const limit = Date.now() - KEEP_DAYS * 86400000;
  const old = list.filter((e) => new Date(e.date).getTime() < limit).map((e) => e.key);
  if (old.length) await hdel(old).catch(() => {});
  return list.filter((e) => new Date(e.date).getTime() >= limit);
}

// ---------- Vyhodnotenie ----------

interface MatchResult {
  status: string;
  ftH: number; ftA: number;
  htH: number | null; htA: number | null;
  corners?: number | null;
  cards?: number | null;
}

function overUnder(value: string, total: number): "won" | "lost" | "void" | null {
  const m = /^(over|under)\s+([\d.]+)$/i.exec(value.trim());
  if (!m) return null;
  const line = Number(m[2]);
  if (total === line) return "void";
  const over = total > line;
  return (m[1].toLowerCase() === "over") === over ? "won" : "lost";
}
function yesNo(value: string, yes: boolean): "won" | "lost" | null {
  const v = value.trim().toLowerCase();
  if (v !== "yes" && v !== "no") return null;
  return (v === "yes") === yes ? "won" : "lost";
}

/** Výsledok stávky alebo null, ak sa nedá vyhodnotiť (chýbajú dáta). */
export function settleOne(e: Pick<ValuebetLogEntry, "betName" | "value">, r: MatchResult): "won" | "lost" | "void" | null {
  const name = e.betName.trim().toLowerCase();
  const ft = r.ftH + r.ftA;
  const hasHt = r.htH !== null && r.htA !== null;
  switch (name) {
    case "goals over/under": return overUnder(e.value, ft);
    case "goals over/under first half": return hasHt ? overUnder(e.value, r.htH! + r.htA!) : null;
    case "goals over/under - second half": return hasHt ? overUnder(e.value, ft - r.htH! - r.htA!) : null;
    case "both teams score": return yesNo(e.value, r.ftH > 0 && r.ftA > 0);
    case "both teams score - first half": return hasHt ? yesNo(e.value, r.htH! > 0 && r.htA! > 0) : null;
    case "both teams score - second half": return hasHt ? yesNo(e.value, r.ftH - r.htH! > 0 && r.ftA - r.htA! > 0) : null;
    case "home/away": {
      if (r.ftH === r.ftA) return "void"; // remíza = vrátený vklad
      const v = e.value.trim().toLowerCase();
      if (v !== "home" && v !== "away") return null;
      return (v === "home") === r.ftH > r.ftA ? "won" : "lost";
    }
    case "odd/even": {
      const v = e.value.trim().toLowerCase();
      if (v !== "odd" && v !== "even") return null;
      return (v === "odd") === (ft % 2 === 1) ? "won" : "lost";
    }
    case "total - home": return overUnder(e.value, r.ftH);
    case "total - away": return overUnder(e.value, r.ftA);
    case "corners over under": return r.corners == null ? null : overUnder(e.value, r.corners);
    case "cards over/under": return r.cards == null ? null : overUnder(e.value, r.cards);
  }
  return null;
}

const FINISHED = ["FT", "AET", "PEN"];
const NOT_PLAYED = ["ABD", "CANC", "PST", "AWD", "WO"];
let settling = false;

/** Vyhodnotí valuebety odohraných zápasov (výsledok sa načíta raz na zápas). */
export async function settleValuebets(): Promise<number> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key || settling) return 0;
  settling = true;
  let done = 0;
  try {
    const pending = parseAll(await hgetall()).filter((e) => e.status === "pending" && new Date(e.date).getTime() < Date.now() - 2.5 * 3600 * 1000);
    const byFixture = new Map<number, ValuebetLogEntry[]>();
    for (const e of pending) (byFixture.get(e.fixtureId) ?? byFixture.set(e.fixtureId, []).get(e.fixtureId)!).push(e);
    const http = axios.create({ baseURL: "https://v3.football.api-sports.io", headers: { "x-apisports-key": key }, timeout: 20000 });
    for (const [fixtureId, entries] of [...byFixture.entries()].slice(0, 40)) {
      try {
        const res = await http.get("/fixtures", { params: { id: fixtureId } });
        const it = res.data?.response?.[0];
        const status = String(it?.fixture?.status?.short ?? "");
        const updates: Record<string, string> = {};
        const at = new Date().toISOString();
        if (NOT_PLAYED.includes(status)) {
          for (const e of entries) updates[e.key] = JSON.stringify({ ...e, status: "void", profit: 0, result: "zápas sa nehral", settledAt: at });
        } else if (FINISHED.includes(status)) {
          // Stávky platia na riadny hrací čas (90 min) – pri predĺžení sa berie skóre po 90 minútach.
          const ftH = Number(it?.score?.fulltime?.home ?? it?.goals?.home);
          const ftA = Number(it?.score?.fulltime?.away ?? it?.goals?.away);
          const htH = it?.score?.halftime?.home;
          const htA = it?.score?.halftime?.away;
          const r: MatchResult = { status, ftH, ftA, htH: htH == null ? null : Number(htH), htA: htA == null ? null : Number(htA) };
          if (entries.some((e) => /corners|cards/i.test(e.betName))) {
            const st = await getFixtureCornersAndCards(fixtureId).catch(() => null);
            r.corners = st?.corners ?? null;
            r.cards = st?.cards ?? null;
          }
          for (const e of entries) {
            const s = settleOne(e, r);
            if (!s) continue;
            const profit = s === "won" ? Math.round((e.odd - 1) * 100) / 100 : s === "lost" ? -1 : 0;
            const extra = /corners/i.test(e.betName) ? ` · rohy ${r.corners}` : /cards/i.test(e.betName) ? ` · karty ${r.cards}` : "";
            updates[e.key] = JSON.stringify({ ...e, status: s, profit, result: `${ftH}:${ftA}${r.htH != null ? ` (${r.htH}:${r.htA})` : ""}${extra}`, settledAt: at });
          }
        }
        done += Object.keys(updates).length;
        await hsetMany(updates);
      } catch { /* skúsi sa pri ďalšej kontrole */ }
    }
  } finally {
    settling = false;
  }
  return done;
}

export function valuebetStatus() {
  return { at: lastScanAt(), minValue: MIN_VALUE, suspicious: SUSPICIOUS_VALUE, minOdd: MIN_ODD, maxOdd: MAX_ODD };
}

export function startValuebets(): void {
  setOnScan(logValuebets);
  setTimeout(() => void settleValuebets().catch(() => {}), 3 * 60 * 1000);
  setInterval(() => void settleValuebets().catch(() => {}), 30 * 60 * 1000);
}
