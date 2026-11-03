import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { scannedFixtures, FixtureOdds, BookOdd } from "./surebets";
import { fairOdds, settleOne, MIN_VALUE } from "./valuebets";
import { getFixtureCornersAndCards } from "./apiClient";

// Superkurzy / boosty (3. 11. 2026, Michal): slovenské stávkovky (Tipsport, Fortuna, Niké…) dávajú denne
// „zvýšené kurzy“. Tu sa superkurz porovná s férovým kurzom (Pinnacle bez marže, inak medián stávkoviek)
// – hrať sa oplatí len ten, ktorý je nad férovým kurzom. Zapísané superkurzy sa po zápase samy vyhodnotia.
// Len dnešné zápasy 17 súťaží TipRadaru (tie isté kurzy ako surebety a valuebety).
// Kombinované superkurzy (výhra + góly, strelec…) sa overiť nedajú – API na ne nemá férový kurz.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);
const LOG_KEY = "tipradar_superkurzy";
const FILE = path.join(__dirname, "..", "data", "superkurzy.json");
const MIN_BOOKS = 4;

export interface BoostSide { value: string; label: string; fairOdd: number; best: number; bestBook: string }
export interface BoostMarket { betId: string; betName: string; market: string; sides: BoostSide[]; source: string }
export interface BoostFixture { fixtureId: number; league: string; date: string; home: string; away: string; markets: BoostMarket[] }

export interface BoostEntry {
  id: string;
  fixtureId: number; league: string; date: string; home: string; away: string;
  betId: string; betName: string; market: string; value: string; label: string;
  /** Superkurz zo stávkovky. */
  odd: number;
  book: string;
  fairOdd: number; fairProb: number;
  /** Hodnota: superkurz × férová šanca − 1. */
  ev: number;
  source: string;
  /** Vklad v € (0 = len zapísané, nehral som). */
  stake: number;
  at: string;
  status: "pending" | "won" | "lost" | "void";
  /** Výsledok v € (pri vklade 0 sa ráta pri 1 €, aby sa dalo porovnať). */
  profit?: number;
  result?: string;
  settledAt?: string;
}

function skDay(d: string | number | Date): string {
  return new Date(d).toLocaleDateString("sv-SE", { timeZone: "Europe/Bratislava" });
}
const isToday = (date: string) => skDay(date) === skDay(Date.now());
const r2 = (n: number) => Math.round(n * 100) / 100;
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const find = (values: Record<string, BookOdd[]>, k: string) => {
  const key = Object.keys(values).find((x) => x.trim().toLowerCase() === k);
  return key ? values[key] : null;
};

/** Férové šance 1 / X / 2 (bez marže) – Pinnacle, inak medián aspoň 4 stávkoviek. */
function fair1x2(f: FixtureOdds): { p: [number, number, number]; source: string; best: BookOdd[] } | null {
  const bet = Object.values(f.bets).find((b) => /^match winner$/i.test(b.name.trim()));
  if (!bet) return null;
  const h = find(bet.values, "home"), d = find(bet.values, "draw"), a = find(bet.values, "away");
  if (!h || !d || !a) return null;
  const rows: { book: string; p: [number, number, number] }[] = [];
  for (const x of h) {
    const y = d.find((o) => o.book === x.book), z = a.find((o) => o.book === x.book);
    if (!y || !z) continue;
    const s = 1 / x.odd + 1 / y.odd + 1 / z.odd;
    if (s < 1) continue;
    rows.push({ book: x.book, p: [1 / x.odd / s, 1 / y.odd / s, 1 / z.odd / s] });
  }
  const top = (l: BookOdd[]) => l.reduce((m, o) => (o.odd > m.odd ? o : m), l[0]);
  const best = [top(h), top(d), top(a)];
  const pin = rows.find((r) => /pinnacle/i.test(r.book));
  if (pin) return { p: pin.p, source: "Pinnacle", best };
  if (rows.length < MIN_BOOKS) return null;
  const m = [0, 1, 2].map((i) => median(rows.map((r) => r.p[i])));
  const s = m[0] + m[1] + m[2];
  return { p: [m[0] / s, m[1] / s, m[2] / s], source: `priemer ${rows.length} stávkoviek`, best };
}

/** Všetky dnešné zápasy, ktoré sa ešte nezačali, s férovými kurzami (1X2, dvojitá šanca + dvojcestné trhy). */
export function boostMarkets(): BoostFixture[] {
  const now = Date.now();
  const two = new Map(fairOdds().map((f) => [f.fixtureId, f]));
  const out: BoostFixture[] = [];
  for (const f of scannedFixtures()) {
    if (new Date(f.date).getTime() <= now || !isToday(f.date)) continue;
    const markets: BoostMarket[] = [];
    const x = fair1x2(f);
    if (x) {
      const [p1, px, p2] = x.p;
      const side = (value: string, label: string, p: number, b?: BookOdd): BoostSide => ({ value, label, fairOdd: r2(1 / p), best: b?.odd ?? 0, bestBook: b?.book ?? "" });
      markets.push({ betId: "1x2", betName: "Match Winner", market: "Víťaz zápasu (1X2)", source: x.source, sides: [
        side("Home", `Výhra ${f.home}`, p1, x.best[0]), side("Draw", "Remíza", px, x.best[1]), side("Away", `Výhra ${f.away}`, p2, x.best[2]),
      ] });
      markets.push({ betId: "dc", betName: "Double Chance", market: "Dvojitá šanca", source: x.source, sides: [
        side("1X", `${f.home} alebo remíza (1X)`, p1 + px), side("12", `${f.home} alebo ${f.away} (12)`, p1 + p2), side("X2", `Remíza alebo ${f.away} (X2)`, px + p2),
      ] });
    }
    for (const m of two.get(Number(f.fixtureId))?.markets ?? []) {
      markets.push({ betId: m.betId, betName: f.bets[m.betId]?.name ?? "", market: m.market, source: m.source, sides: m.sides });
    }
    if (markets.length) out.push({ fixtureId: Number(f.fixtureId), league: f.league, date: f.date, home: f.home, away: f.away, markets });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
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
async function hset(pairs: Record<string, string>): Promise<void> {
  const entries = Object.entries(pairs);
  if (!entries.length) return;
  if (!useUpstash) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ ...readFile(), ...pairs }));
    return;
  }
  for (let i = 0; i < entries.length; i += 50) await redis(["HSET", LOG_KEY, ...entries.slice(i, i + 50).flat()]);
}
async function hdel(key: string): Promise<void> {
  if (!useUpstash) {
    const all = readFile();
    delete all[key];
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(all));
    return;
  }
  await redis(["HDEL", LOG_KEY, key]);
}

export async function boostLog(): Promise<BoostEntry[]> {
  const out: BoostEntry[] = [];
  for (const v of Object.values(await hgetall())) {
    try { out.push(JSON.parse(v)); } catch { /* poškodený záznam */ }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Zapíše superkurz. Vklad > 0 len pri superkurze s hodnotou (aspoň +3 %); bez vkladu sa zapíše len na sledovanie. */
export async function addBoost(fixtureId: number, betId: string, value: string, odd: number, stake: number, book: string): Promise<BoostEntry> {
  const f = boostMarkets().find((x) => x.fixtureId === fixtureId);
  if (!f) throw new Error("Zápas sa nenašiel alebo sa už začal – obnovte stránku.");
  const m = f.markets.find((x) => x.betId === betId);
  const s = m?.sides.find((x) => x.value === value);
  if (!m || !s) throw new Error("Stávka sa nenašla – obnovte stránku.");
  if (!(odd > 1 && odd < 100)) throw new Error("Zadajte superkurz, napr. 2,50.");
  if (!(stake >= 0 && stake < 100000)) throw new Error("Vklad nesedí.");
  const p = 1 / s.fairOdd;
  const ev = odd * p - 1;
  if (stake > 0 && ev < MIN_VALUE) throw new Error(`Tento superkurz nemá hodnotu (férový kurz ${s.fairOdd.toFixed(2).replace(".", ",")}) – nehrajte ho. Môžete ho uložiť bez vkladu.`);
  const at = new Date().toISOString();
  const e: BoostEntry = {
    id: `${fixtureId}|${betId}|${value}|${Date.now()}`,
    fixtureId, league: f.league, date: f.date, home: f.home, away: f.away,
    betId, betName: m.betName, market: m.market, value, label: s.label,
    odd: r2(odd), book: book.trim().slice(0, 40) || "Moja stávkovka",
    fairOdd: s.fairOdd, fairProb: Math.round(p * 10000) / 10000, ev: Math.round(ev * 10000) / 10000, source: m.source,
    stake: r2(stake), at, status: "pending",
  };
  await hset({ [e.id]: JSON.stringify(e) });
  return e;
}

export async function deleteBoost(id: string): Promise<void> {
  const all = await hgetall();
  if (!all[id]) throw new Error("Superkurz sa nenašiel.");
  const e = JSON.parse(all[id]) as BoostEntry;
  if (e.status !== "pending") throw new Error("Vyhodnotený superkurz sa už nedá zmazať.");
  await hdel(id);
}

// ---------- Vyhodnotenie ----------

function settleBoost(e: BoostEntry, ftH: number, ftA: number, r: Parameters<typeof settleOne>[1]): "won" | "lost" | "void" | null {
  const res = ftH > ftA ? "1" : ftH < ftA ? "2" : "X";
  if (e.betId === "1x2") return ({ Home: "1", Draw: "X", Away: "2" } as Record<string, string>)[e.value] === res ? "won" : "lost";
  if (e.betId === "dc") return e.value.includes(res) ? "won" : "lost";
  return settleOne(e, r);
}

const FINISHED = ["FT", "AET", "PEN"];
const NOT_PLAYED = ["ABD", "CANC", "PST", "AWD", "WO"];
let settling = false;

export async function settleBoosts(): Promise<number> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key || settling) return 0;
  settling = true;
  let done = 0;
  try {
    const pending = (await boostLog()).filter((e) => e.status === "pending" && new Date(e.date).getTime() < Date.now() - 2.5 * 3600 * 1000);
    const byFixture = new Map<number, BoostEntry[]>();
    for (const e of pending) (byFixture.get(e.fixtureId) ?? byFixture.set(e.fixtureId, []).get(e.fixtureId)!).push(e);
    const http = axios.create({ baseURL: "https://v3.football.api-sports.io", headers: { "x-apisports-key": key }, timeout: 20000 });
    for (const [fixtureId, entries] of [...byFixture.entries()].slice(0, 30)) {
      try {
        const res = await http.get("/fixtures", { params: { id: fixtureId } });
        const it = res.data?.response?.[0];
        const status = String(it?.fixture?.status?.short ?? "");
        const at = new Date().toISOString();
        const updates: Record<string, string> = {};
        if (NOT_PLAYED.includes(status)) {
          for (const e of entries) updates[e.id] = JSON.stringify({ ...e, status: "void", profit: 0, result: "zápas sa nehral", settledAt: at });
        } else if (FINISHED.includes(status)) {
          // Na riadny hrací čas (90 min).
          const ftH = Number(it?.score?.fulltime?.home ?? it?.goals?.home);
          const ftA = Number(it?.score?.fulltime?.away ?? it?.goals?.away);
          const htH = it?.score?.halftime?.home, htA = it?.score?.halftime?.away;
          const r: Parameters<typeof settleOne>[1] = { status, ftH, ftA, htH: htH == null ? null : Number(htH), htA: htA == null ? null : Number(htA) };
          if (entries.some((e) => /corners|cards/i.test(e.betName))) {
            const st = await getFixtureCornersAndCards(fixtureId).catch(() => null);
            r.corners = st?.corners ?? null;
            r.cards = st?.cards ?? null;
          }
          for (const e of entries) {
            const s = settleBoost(e, ftH, ftA, r);
            if (!s) continue;
            const stake = e.stake > 0 ? e.stake : 1;
            const profit = s === "won" ? r2(stake * (e.odd - 1)) : s === "lost" ? -stake : 0;
            const extra = /corners/i.test(e.betName) ? ` · rohy ${r.corners}` : /cards/i.test(e.betName) ? ` · karty ${r.cards}` : "";
            updates[e.id] = JSON.stringify({ ...e, status: s, profit, result: `${ftH}:${ftA}${r.htH != null ? ` (${r.htH}:${r.htA})` : ""}${extra}`, settledAt: at });
          }
        }
        done += Object.keys(updates).length;
        await hset(updates);
      } catch { /* skúsi sa znova pri ďalšej kontrole */ }
    }
  } finally {
    settling = false;
  }
  return done;
}

export function startSuperkurzy(): void {
  setTimeout(() => void settleBoosts().catch(() => {}), 4 * 60 * 1000);
  setInterval(() => void settleBoosts().catch(() => {}), 30 * 60 * 1000);
}
