import * as fs from "fs";
import * as path from "path";
import axios from "axios";

// Tiché sledovanie „tiketu dňa“ (skúška, nič sa neposiela členom).
// Pri každej analýze zápasu si zapíšeme tipy, ktoré by mohli ísť na tiket:
//   dôvera 70 – 75 %, kurz aspoň 1,50, hodnota aspoň +5 % (a nie podozrivo vysoká),
//   bez rozporu so stávkovkami. Patria sem aj tipy vyradené len pre „kurz pod minimom“ (MIN_ODDS).
// Z nich sa každý deň poskladá najviac jeden tiket z 2 rôznych zápasov:
//   spolu kurz aspoň 2,00 a hodnota aspoň +10 %. Po zápasoch sa tiket ticho vyhodnotí.
// Úložisko: Upstash (hash id -> JSON), bez Upstash súbor data/ticket-legs.json.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);
const KEY = "tipradar_ticket_legs";
const FILE = path.join(__dirname, "..", "data", "ticket-legs.json");

export const TICKET_RULES = {
  legMinOdds: 1.5,
  legMinProb: 70,
  legMaxProb: 75,
  legMinValue: 1.05, // +5 %
  legMaxValue: 1.25, // nad +25 % je to skôr chyba modelu
  ticketMinOdds: 2.0,
  ticketMinValue: 1.1, // +10 %
};

export type LegStatus = "pending" | "won" | "lost" | "void";

export interface TicketLegCandidate {
  id: string; // fixtureId|trh|voľba
  fixtureId: number;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  market: string;
  selection: string;
  playerId?: number;
  probability: number; // 0 – 100
  odds: number;
  recordedAt: string;
  status: LegStatus;
}

async function redis(command: (string | number)[]): Promise<any> {
  const res = await axios.post(UPSTASH_URL!, command, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }, timeout: 20000 });
  return res.data?.result;
}
function readFile(): Record<string, TicketLegCandidate> {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; }
}
function writeFile(all: Record<string, TicketLegCandidate>): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all));
}

/** Zapíše nové kandidátske tipy (rovnaký tip pre zápas zostane v pôvodnej podobe). */
export async function recordLegs(entries: TicketLegCandidate[]): Promise<void> {
  if (!entries.length) return;
  if (!useUpstash) {
    const all = readFile();
    for (const e of entries) if (!all[e.id]) all[e.id] = e;
    writeFile(all);
    return;
  }
  for (const e of entries) await redis(["HSETNX", KEY, e.id, JSON.stringify(e)]);
}

export async function listLegs(): Promise<TicketLegCandidate[]> {
  if (!useUpstash) return Object.values(readFile());
  const flat: string[] = (await redis(["HGETALL", KEY])) ?? [];
  const out: TicketLegCandidate[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    try { out.push(JSON.parse(flat[i + 1])); } catch { /* poškodený záznam */ }
  }
  return out;
}

export async function updateLeg(entry: TicketLegCandidate): Promise<void> {
  if (!useUpstash) {
    const all = readFile();
    all[entry.id] = entry;
    writeFile(all);
    return;
  }
  await redis(["HSET", KEY, entry.id, JSON.stringify(entry)]);
}

/** Spĺňa tip pravidlá pre tiket? (pravdepodobnosť v %, kurz) */
export function legQualifies(probability: number, odds: number | null | undefined): boolean {
  const r = TICKET_RULES;
  if (typeof odds !== "number" || !(odds >= r.legMinOdds)) return false;
  if (!(probability >= r.legMinProb && probability <= r.legMaxProb)) return false;
  const value = (probability / 100) * odds;
  return value >= r.legMinValue && value <= r.legMaxValue;
}

/** Z tipov jednej analýzy (odporúčané aj vyradené) vyberie kandidátov na tiket. */
export function legCandidatesFrom(
  fixture: { fixtureId: number; date: string; homeTeam: { name: string }; awayTeam: { name: string } },
  picks: any[]
): TicketLegCandidate[] {
  if (!fixture || !fixture.fixtureId) return [];
  if (new Date(fixture.date).getTime() <= Date.now()) return []; // len tipy spred výkopu
  const out: TicketLegCandidate[] = [];
  const seen = new Set<string>();
  for (const p of picks || []) {
    if (!p || p.marketConflict) continue;
    // Z vyradených berieme len tie, ktoré vypadli výlučne pre nízky kurz.
    if (p.rejectReason && !String(p.rejectReason).startsWith("kurz pod")) continue;
    const probability = Number(p.probability);
    if (!legQualifies(probability, p.odds)) continue;
    const id = `${fixture.fixtureId}|${p.market}|${p.selection}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      fixtureId: fixture.fixtureId,
      matchDate: fixture.date,
      homeTeam: fixture.homeTeam.name,
      awayTeam: fixture.awayTeam.name,
      market: String(p.market),
      selection: String(p.selection),
      ...(typeof p.playerId === "number" ? { playerId: p.playerId } : {}),
      probability,
      odds: Number(p.odds),
      recordedAt: new Date().toISOString(),
      status: "pending",
    });
  }
  return out;
}

/** Deň zápasu podľa slovenského času (RRRR-MM-DD). */
function dayKeySk(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava" }).format(new Date(iso));
}

export interface WatchedTicket {
  day: string;
  legs: TicketLegCandidate[];
  odds: number; // spolu
  probability: number; // spolu, v %
  value: number; // napr. 1,17 = +17 %
  status: LegStatus;
  profit: number | null; // v jednotkách (vklad 1), null kým nie je vyhodnotený
}

function ticketStatus(legs: TicketLegCandidate[]): LegStatus {
  if (legs.some((l) => l.status === "lost")) return "lost";
  if (legs.some((l) => l.status === "pending")) return "pending";
  if (legs.every((l) => l.status === "void")) return "void";
  return "won";
}

/**
 * Každý deň najviac jeden tiket: dva tipy z rôznych zápasov s najvyššou spoločnou hodnotou.
 * Dvojica platí, len ak boli oba tipy zapísané ešte pred výkopom skoršieho zápasu –
 * presne tak, ako by sa dal tiket reálne podať. Výsledky zápasov výber neovplyvňujú.
 */
export function buildTickets(legs: TicketLegCandidate[]): WatchedTicket[] {
  const r = TICKET_RULES;
  const byDay = new Map<string, TicketLegCandidate[]>();
  for (const l of legs) {
    if (!legQualifies(l.probability, l.odds)) continue;
    const day = dayKeySk(l.matchDate);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(l);
  }
  const tickets: WatchedTicket[] = [];
  for (const [day, list] of byDay) {
    let best: WatchedTicket | null = null;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.fixtureId === b.fixtureId) continue; // dva tipy z jedného zápasu spolu súvisia
        const firstKickoff = Math.min(new Date(a.matchDate).getTime(), new Date(b.matchDate).getTime());
        const lastRecorded = Math.max(new Date(a.recordedAt).getTime(), new Date(b.recordedAt).getTime());
        if (!(lastRecorded < firstKickoff)) continue;
        const odds = a.odds * b.odds;
        const probability = (a.probability / 100) * (b.probability / 100) * 100;
        const value = (probability / 100) * odds;
        if (odds < r.ticketMinOdds || value < r.ticketMinValue) continue;
        if (!best || value > best.value || (value === best.value && probability > best.probability)) {
          const pair = [a, b].sort((x, y) => new Date(x.matchDate).getTime() - new Date(y.matchDate).getTime());
          best = { day, legs: pair, odds, probability, value, status: "pending", profit: null };
        }
      }
    }
    if (!best) continue;
    best.status = ticketStatus(best.legs);
    if (best.status === "lost") best.profit = -1;
    else if (best.status === "won") {
      // Zrušený zápas (vrátený vklad) sa na tikete počíta s kurzom 1, ako v stávkovej kancelárii.
      best.profit = best.legs.reduce((m, l) => m * (l.status === "won" ? l.odds : 1), 1) - 1;
    } else if (best.status === "void") best.profit = 0;
    tickets.push(best);
  }
  return tickets.sort((x, y) => (x.day < y.day ? 1 : -1));
}
