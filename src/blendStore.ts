import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { MIN_PROBABILITY, MAX_PROBABILITY, MIN_ODDS, MIN_EXPECTED_VALUE, SUSPICIOUS_EXPECTED_VALUE } from "./oddsMatcher";

/** Trhy, ktoré sa neodporúčajú (rovnaký zoznam ako v predictor.ts). */
const NOT_RECOMMENDED_MARKETS = ["Ofsajdy", "Výsledok zápasu", "Oba tímy skórujú", "Obaja tímy skórujú"];

// Tiché sledovanie miešania modelu so stávkovkami („druhý názor").
// Pri každej analýze zápasu, ku ktorému sú kurzy, sa zapíše čistý odhad modelu
// aj odhad stávkoviek pre tipy blízko odporúčaného pásma. Po zápase sa vyhodnotia
// a prehľad ukáže, ktorý pomer model/stávkovky by trafil najlepšie. Na tipy, ktoré
// sa posielajú, to nemá žiadny vplyv.
// Úložisko: Upstash (hash fixtureId -> JSON, 1 príkaz na zápas), bez Upstash data/blend.json.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);
const KEY = "tipradar_blend";
const FILE = path.join(__dirname, "..", "data", "blend.json");

/** Zapisujú sa len tipy, ktoré by po zmiešaní mohli skončiť v odporúčanom pásme. */
const RECORD_MIN = 55;
const RECORD_MAX = 92;

export interface BlendPick {
  market: string;
  selection: string;
  model: number; // %
  bookmakers: number; // % (bez marže)
  odds: number | null;
  /** Model a stávkovky sa rozchádzajú tak, že tip sa dnes vyradí (tichá evidencia). */
  conflict?: boolean;
  outcome?: "won" | "lost" | "void";
}

export interface BlendFixture {
  fixtureId: number;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  recordedAt: string;
  status: "pending" | "settled";
  picks: BlendPick[];
}

async function redis(command: (string | number)[]): Promise<any> {
  const res = await axios.post(UPSTASH_URL!, command, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }, timeout: 20000 });
  return res.data?.result;
}
function readFile(): Record<string, BlendFixture> {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; }
}
function writeFile(all: Record<string, BlendFixture>): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all));
}

/** Z výsledku analýzy vyrobí záznam (null, ak zápas už začal alebo nie sú kurzy). */
export function blendEntryFrom(
  fixture: { fixtureId: number; date: string; homeTeam: { name: string }; awayTeam: { name: string } },
  candidates: any[]
): BlendFixture | null {
  if (new Date(fixture.date).getTime() <= Date.now()) return null; // len odhady spred výkopu
  const picks: BlendPick[] = (candidates || [])
    .filter((c) => c && typeof c.blendModel === "number" && typeof c.blendMarket === "number")
    .filter((c) => {
      const hi = Math.max(c.blendModel, c.blendMarket);
      const lo = Math.min(c.blendModel, c.blendMarket);
      return hi >= RECORD_MIN && lo <= RECORD_MAX;
    })
    .map((c) => ({
      market: String(c.market),
      selection: String(c.selection),
      model: Math.round(c.blendModel * 10) / 10,
      bookmakers: Math.round(c.blendMarket * 10) / 10,
      odds: typeof c.odds === "number" ? c.odds : null,
      ...(c.marketConflict ? { conflict: true } : {}),
    }));
  if (!picks.length) return null;
  return {
    fixtureId: fixture.fixtureId,
    matchDate: fixture.date,
    homeTeam: fixture.homeTeam.name,
    awayTeam: fixture.awayTeam.name,
    recordedAt: new Date().toISOString(),
    status: "pending",
    picks,
  };
}

/** Zapíše zápas (ak už je zapísaný, nechá prvý – odhad najďalej od výkopu sa nemení). */
export async function recordBlend(entry: BlendFixture | null): Promise<void> {
  if (!entry) return;
  if (!useUpstash) {
    const all = readFile();
    if (!all[entry.fixtureId]) all[entry.fixtureId] = entry;
    writeFile(all);
    return;
  }
  await redis(["HSETNX", KEY, String(entry.fixtureId), JSON.stringify(entry)]);
}

export async function listBlend(): Promise<BlendFixture[]> {
  if (!useUpstash) return Object.values(readFile());
  const flat: string[] = (await redis(["HGETALL", KEY])) ?? [];
  const out: BlendFixture[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    try { out.push(JSON.parse(flat[i + 1])); } catch { /* poškodený záznam */ }
  }
  return out;
}

export async function updateBlend(entry: BlendFixture): Promise<void> {
  if (!useUpstash) {
    const all = readFile();
    all[entry.fixtureId] = entry;
    writeFile(all);
    return;
  }
  await redis(["HSET", KEY, String(entry.fixtureId), JSON.stringify(entry)]);
}

/** Podiel stávkoviek, ktoré prehľad porovnáva (0 = len model, ako dnes). */
export const BLEND_WEIGHTS = [0, 0.1, 0.2, 0.3, 0.4, 0.5];

export interface BlendRow {
  weight: number; // podiel stávkoviek v %
  brier: number | null; // čím nižšie, tým presnejšie percentá
  tips: number; // koľko tipov by sa odporučilo (pásmo 68 – 80 %, kurz ≥ minimum, hodnota +5 až +25 %)
  won: number;
  hitRate: number | null;
  profit: number; // jednotky pri stávke 1 j. na tip
  roi: number | null;
}

/** Prehľad: pre každý pomer presnosť percent a výsledok tipov, ktoré by prešli. */
export function blendSummary(all: BlendFixture[], minOdds = MIN_ODDS): {
  fixtures: number;
  pendingFixtures: number;
  settledPicks: number;
  rows: BlendRow[];
  bookmakersBrier: number | null;
} {
  const settled = all.flatMap((f) => (f.status === "settled" ? f.picks : [])).filter((p) => p.outcome === "won" || p.outcome === "lost");
  const brierOf = (ps: number[]) =>
    settled.length ? settled.reduce((a, p, i) => a + Math.pow(ps[i] / 100 - (p.outcome === "won" ? 1 : 0), 2), 0) / settled.length : null;
  const rows = BLEND_WEIGHTS.map((w) => {
    const probs = settled.map((p) => (1 - w) * p.model + w * p.bookmakers);
    const passing = settled.filter((p, i) => {
      const prob = probs[i];
      if (p.odds == null || p.conflict || NOT_RECOMMENDED_MARKETS.includes(p.market)) return false;
      const ev = (prob / 100) * p.odds;
      return p.odds >= minOdds && prob >= MIN_PROBABILITY && prob <= MAX_PROBABILITY && ev >= MIN_EXPECTED_VALUE && ev <= SUSPICIOUS_EXPECTED_VALUE;
    });
    const won = passing.filter((p) => p.outcome === "won").length;
    const profit = passing.reduce((a, p) => a + (p.outcome === "won" ? p.odds! - 1 : -1), 0);
    return {
      weight: Math.round(w * 100),
      brier: brierOf(probs),
      tips: passing.length,
      won,
      hitRate: passing.length ? (won / passing.length) * 100 : null,
      profit,
      roi: passing.length ? (profit / passing.length) * 100 : null,
    };
  });
  return {
    fixtures: all.length,
    pendingFixtures: all.filter((f) => f.status === "pending").length,
    settledPicks: settled.length,
    rows,
    bookmakersBrier: brierOf(settled.map((p) => p.bookmakers)),
  };
}
