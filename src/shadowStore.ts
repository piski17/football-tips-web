import * as fs from "fs";
import * as path from "path";
import axios from "axios";

// Tichá evidencia tipov vyradených pre rozpor so stávkovkami. Klientom sa neposielajú,
// len sa po zápase vyhodnotia – aby sa dalo overiť, či pravidlo pomáha.
// Úložisko: Upstash (hash id -> JSON), bez Upstash súbor data/shadow.json.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);
const KEY = "tipradar_shadow";
const FILE = path.join(__dirname, "..", "data", "shadow.json");

export interface ShadowEntry {
  id: string;
  fixtureId: number;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  market: string;
  selection: string;
  probability: number; // po zmiešaní so stávkovkami
  modelProbability: number | null;
  marketProbability: number | null;
  odds: number | null;
  reason: string;
  recordedAt: string;
  status: "pending" | "won" | "lost" | "void";
}

async function redis(command: (string | number)[]): Promise<any> {
  const res = await axios.post(UPSTASH_URL!, command, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }, timeout: 20000 });
  return res.data?.result;
}
function readFile(): Record<string, ShadowEntry> {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; }
}
function writeFile(all: Record<string, ShadowEntry>): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all));
}

/** Zapíše nové vyradené tipy (ak už rovnaký tip pre zápas existuje, nechá pôvodný). */
export async function recordShadow(entries: ShadowEntry[]): Promise<void> {
  if (!entries.length) return;
  if (!useUpstash) {
    const all = readFile();
    for (const e of entries) if (!all[e.id]) all[e.id] = e;
    writeFile(all);
    return;
  }
  for (const e of entries) await redis(["HSETNX", KEY, e.id, JSON.stringify(e)]);
}

export async function listShadow(): Promise<ShadowEntry[]> {
  if (!useUpstash) return Object.values(readFile());
  const flat: string[] = (await redis(["HGETALL", KEY])) ?? [];
  const out: ShadowEntry[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    try { out.push(JSON.parse(flat[i + 1])); } catch { /* poškodený záznam */ }
  }
  return out;
}

export async function updateShadow(entry: ShadowEntry): Promise<void> {
  if (!useUpstash) {
    const all = readFile();
    all[entry.id] = entry;
    writeFile(all);
    return;
  }
  await redis(["HSET", KEY, entry.id, JSON.stringify(entry)]);
}

/** Z vyradených tipov výsledku analýzy vyrobí záznamy pre evidenciu. */
export function shadowEntriesFrom(
  fixture: { fixtureId: number; date: string; homeTeam: { name: string }; awayTeam: { name: string } },
  picks: any[]
): ShadowEntry[] {
  if (new Date(fixture.date).getTime() <= Date.now()) return []; // len tipy spred výkopu
  return (picks || [])
    .filter((p) => p && p.marketConflict)
    .map((p) => ({
      id: `${fixture.fixtureId}|${p.market}|${p.selection}`,
      fixtureId: fixture.fixtureId,
      matchDate: fixture.date,
      homeTeam: fixture.homeTeam.name,
      awayTeam: fixture.awayTeam.name,
      market: String(p.market),
      selection: String(p.selection),
      probability: Number(p.probability),
      modelProbability: typeof p.modelProbability === "number" ? p.modelProbability : null,
      marketProbability: typeof p.marketProbability === "number" ? p.marketProbability : null,
      odds: typeof p.odds === "number" ? p.odds : null,
      reason: String(p.marketConflict),
      recordedAt: new Date().toISOString(),
      status: "pending" as const,
    }));
}
