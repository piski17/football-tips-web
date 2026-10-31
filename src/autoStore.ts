import * as fs from "fs";
import * as path from "path";
import axios from "axios";

// Automatické vyhodnocovanie všetkých zápasov (29. 10. 2026, Michalovo želanie – „ako na začiatku“).
// Server sám prejde každý zápas zo všetkých súťaží asi hodinu pred výkopom a zapíše všetky
// tipy, ktoré by model odporučil (pásmo 68 – 80 %, rovnaké pravidlá). Po zápase sa vyhodnotia.
// Klientom nejdú, nie sú na webe a nerátajú sa do štatistík – len vlastná časť v Histórii tipov.
// Úložisko: Upstash (hash id -> JSON + hash prejdených zápasov), bez Upstash data/auto.json.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);
const KEY = "tipradar_auto";
const FIXTURES_KEY = "tipradar_auto_fixtures";
const FILE = path.join(__dirname, "..", "data", "auto.json");

/** Záznamy staršie ako 120 dní sa mažú (úložisko nerastie donekonečna). */
const KEEP_DAYS = 120;

export interface AutoEntry {
  id: string;
  fixtureId: number;
  leagueId: number;
  league: string;
  /** Sezóna a logá (od 31. 10. 2026 – na doplnenie tipu do Histórie tipov; staršie záznamy ich nemajú). */
  season?: number;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  market: string;
  selection: string;
  probability: number;
  /** Kurz stávkoviek v čase analýzy (null = trh bez kurzu, napr. držanie lopty). */
  odds: number | null;
  /** Tip by neprešiel kontrolou 60 / 40 – klientom by nešiel, len do sledovaných. */
  strictFail?: boolean;
  recordedAt: string;
  status: "pending" | "won" | "lost" | "void";
}

/** Prejdený zápas (aj keď model nenašiel žiadny tip) – aby sa neanalyzoval znova. */
export interface AutoFixture {
  fixtureId: number;
  matchDate: string;
  tips: number;
  /** Súťaž (od 30. 10. 2026 – pre rozdelenie podľa líg; staršie záznamy ju nemajú). */
  league?: string;
}

interface FileData {
  entries: Record<string, AutoEntry>;
  fixtures: Record<string, AutoFixture>;
}

async function redis(command: (string | number)[]): Promise<any> {
  const res = await axios.post(UPSTASH_URL!, command, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }, timeout: 20000 });
  return res.data?.result;
}
function readFile(): FileData {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return { entries: d.entries ?? {}, fixtures: d.fixtures ?? {} };
  } catch {
    return { entries: {}, fixtures: {} };
  }
}
function writeFile(all: FileData): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all));
}
function parseHash<T>(flat: string[] | null): T[] {
  const out: T[] = [];
  for (let i = 0; flat && i + 1 < flat.length; i += 2) {
    try { out.push(JSON.parse(flat[i + 1])); } catch { /* poškodený záznam */ }
  }
  return out;
}

/** Zapíše prejdený zápas a jeho tipy (ak už zápas bol prejdený, nič nemení). */
export async function recordAutoFixture(fixture: AutoFixture, entries: AutoEntry[]): Promise<void> {
  if (!useUpstash) {
    const all = readFile();
    if (all.fixtures[fixture.fixtureId]) return;
    all.fixtures[fixture.fixtureId] = fixture;
    for (const e of entries) if (!all.entries[e.id]) all.entries[e.id] = e;
    writeFile(all);
    return;
  }
  const added = Number(await redis(["HSETNX", FIXTURES_KEY, fixture.fixtureId, JSON.stringify(fixture)]));
  if (!added) return;
  for (const e of entries) await redis(["HSETNX", KEY, e.id, JSON.stringify(e)]);
}

export async function listAuto(): Promise<AutoEntry[]> {
  if (!useUpstash) return Object.values(readFile().entries);
  return parseHash<AutoEntry>(await redis(["HGETALL", KEY]));
}

export async function listAutoFixtures(): Promise<AutoFixture[]> {
  if (!useUpstash) return Object.values(readFile().fixtures);
  return parseHash<AutoFixture>(await redis(["HGETALL", FIXTURES_KEY]));
}

export async function autoFixtureDone(fixtureId: number): Promise<boolean> {
  if (!useUpstash) return Boolean(readFile().fixtures[fixtureId]);
  return Number(await redis(["HEXISTS", FIXTURES_KEY, fixtureId])) === 1;
}

export async function updateAuto(entry: AutoEntry): Promise<void> {
  if (!useUpstash) {
    const all = readFile();
    all.entries[entry.id] = entry;
    writeFile(all);
    return;
  }
  await redis(["HSET", KEY, entry.id, JSON.stringify(entry)]);
}

/** Zmaže záznamy a prejdené zápasy staršie ako KEEP_DAYS dní. */
export async function pruneAuto(): Promise<void> {
  const limit = Date.now() - KEEP_DAYS * 24 * 3600 * 1000;
  const old = (d: string) => new Date(d).getTime() < limit;
  if (!useUpstash) {
    const all = readFile();
    for (const [k, e] of Object.entries(all.entries)) if (old(e.matchDate)) delete all.entries[k];
    for (const [k, f] of Object.entries(all.fixtures)) if (old(f.matchDate)) delete all.fixtures[k];
    writeFile(all);
    return;
  }
  const entries = (await listAuto()).filter((e) => old(e.matchDate)).map((e) => e.id);
  const fixtures = (await listAutoFixtures()).filter((f) => old(f.matchDate)).map((f) => f.fixtureId);
  if (entries.length) await redis(["HDEL", KEY, ...entries]);
  if (fixtures.length) await redis(["HDEL", FIXTURES_KEY, ...fixtures]);
}
