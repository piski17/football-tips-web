import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { MIN_PROBABILITY, MAX_PROBABILITY } from "./oddsMatcher";

// Tichá evidencia tipov vyradených pre rozpor so stávkovkami. Klientom sa neposielajú,
// len sa po zápase vyhodnotia – aby sa dalo overiť, či pravidlo pomáha.
// Od 20. 10. 2026 aj tipy vyradené z iných dôvodov (pásmo dôvery, nízka hodnota,
// minimálny kurz…) s kódom dôvodu, verziou modelu a odhadom stávkoviek – aby sa dal
// zmerať účinok každého filtra. Na odporúčané tipy to nemá žiadny vplyv.
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
  // Meranie (20. 10. 2026) – nepovinné, staršie záznamy ich nemajú:
  /** Strojový kód dôvodu vyradenia (rejectCode z predictor.ts, pri pásme "band_low" / "band_high"). */
  reasonCode?: string;
  /** Tip mal zároveň rozpor so stávkovkami (pôvodný druh tichej evidencie). */
  conflict?: boolean;
  /** Pravdepodobnosť stávkoviek v % – bez marže, ak boli kurzy oboch strán (marketProbDevig), inak 1 / kurz. */
  marketProb?: number | null;
  marketProbDevig?: boolean;
  bookmakers?: number;
  modelVersion?: string;
  hoursBeforeKickoff?: number;
  /** Uzatvárací kurz tesne pred výkopom (null = nepodarilo sa zistiť) a z neho pravdepodobnosť stávkoviek. */
  closingOdds?: number | null;
  closingMarketProb?: number | null;
  closingDevig?: boolean;
  closingOddsAt?: string;
}

/**
 * Horná hranica počtu záznamov (20. 10. 2026). Po jej dosiahnutí sa zapisujú už len
 * tipy s rozporom so stávkovkami (ako pred rozšírením), ostatné dôvody sa preskočia.
 * Jeden záznam má ~0,5 kB, 5000 záznamov ≈ 2,5 MB v jednom HGETALL.
 */
export const MAX_SHADOW_ENTRIES = 5000;
/** Rozšírená evidencia zapisuje vyradené tipy s kurzom v tomto rozsahu dôvery. */
const RECORD_MIN = 60;
const RECORD_MAX = 85;

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
  // Pri plnom úložisku sa zapíšu len tipy s rozporom (záznamy bez reasonCode sú pôvodného druhu).
  const keep = (e: ShadowEntry, count: number) => count < MAX_SHADOW_ENTRIES || e.conflict || !e.reasonCode;
  if (!useUpstash) {
    const all = readFile();
    let count = Object.keys(all).length;
    for (const e of entries) if (!all[e.id] && keep(e, count)) { all[e.id] = e; count++; }
    writeFile(all);
    return;
  }
  const count = Number(await redis(["HLEN", KEY])) || 0;
  for (const e of entries) if (keep(e, count)) await redis(["HSETNX", KEY, e.id, JSON.stringify(e)]);
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

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Kód dôvodu pre staršie záznamy (pred 20. 10. 2026 sa zapisoval len rozpor, ako text). */
export function shadowReasonCode(e: ShadowEntry): string {
  if (e.reasonCode) return e.reasonCode;
  const r = String(e.reason || "");
  if (r.startsWith("podozrivo vysoká hodnota (+")) return "ev_high";
  if (r.includes("výrazne rozchádzajú")) return "conflict";
  return "unknown";
}

type MarketDetail = (pick: { market: string; selection: string }) => { prob: number; devig: boolean } | null;

/**
 * Z vyradených tipov výsledku analýzy vyrobí záznamy pre evidenciu.
 * Bez `ctx` (starší POST /api/shadow/record) ako predtým: len tipy s rozporom.
 * S `ctx` (analýza na serveri, 20. 10. 2026): všetci neodporúčaní kandidáti s kurzom
 * a dôverou 60 – 85 % s dôvodom vyradenia. Aby úložisko nerástlo príliš rýchlo, z každého
 * trhu (kategórie) zápasu sa zapíše len kandidát s najväčšou hodnotou; tipy s rozporom
 * sa zapisujú všetky (ako doteraz). Duplicitu zápas + trh + voľba rieši recordShadow.
 */
export function shadowEntriesFrom(
  fixture: { fixtureId: number; date: string; homeTeam: { name: string }; awayTeam: { name: string } },
  picks: any[],
  ctx?: { bestBets?: any[]; marketDetail?: MarketDetail; modelVersion?: string }
): ShadowEntry[] {
  const kickoff = new Date(fixture.date).getTime();
  if (kickoff <= Date.now()) return []; // len tipy spred výkopu
  const now = new Date();
  const hoursBeforeKickoff = r1((kickoff - now.getTime()) / 3600000);
  const base = (p: any, reason: string, reasonCode?: string): ShadowEntry => {
    const detail = ctx?.marketDetail ? ctx.marketDetail(p) : null;
    return {
      id: `${fixture.fixtureId}|${p.market}|${p.selection}`,
      fixtureId: fixture.fixtureId,
      matchDate: fixture.date,
      homeTeam: fixture.homeTeam.name,
      awayTeam: fixture.awayTeam.name,
      market: String(p.market),
      selection: String(p.selection),
      probability: ctx ? r1(Number(p.probability)) : Number(p.probability),
      modelProbability:
        typeof p.modelProbability === "number" ? p.modelProbability : ctx && typeof p.blendModel === "number" ? r1(p.blendModel) : null,
      marketProbability:
        typeof p.marketProbability === "number" ? p.marketProbability : ctx && typeof p.blendMarket === "number" ? r1(p.blendMarket) : null,
      odds: typeof p.odds === "number" ? p.odds : null,
      reason,
      recordedAt: now.toISOString(),
      status: "pending" as const,
      ...(ctx
        ? {
            reasonCode: reasonCode ?? "unknown",
            ...(p.marketConflict ? { conflict: true } : {}),
            marketProb: detail ? r1(detail.prob) : null,
            ...(detail ? { marketProbDevig: detail.devig } : {}),
            ...(typeof p.oddsBookmakers === "number" ? { bookmakers: p.oddsBookmakers } : {}),
            ...(ctx.modelVersion ? { modelVersion: ctx.modelVersion } : {}),
            hoursBeforeKickoff,
          }
        : {}),
    };
  };
  if (!ctx) {
    return (picks || []).filter((p) => p && p.marketConflict).map((p) => base(p, String(p.marketConflict)));
  }
  const key = (p: any) => `${p.market}|${p.selection}`;
  const recommended = new Set((ctx.bestBets || []).map(key));
  const candidates = (picks || []).filter(
    (p) =>
      p &&
      !recommended.has(key(p)) &&
      typeof p.odds === "number" &&
      p.odds > 1 &&
      typeof p.probability === "number" &&
      p.probability >= RECORD_MIN &&
      p.probability <= RECORD_MAX
  );
  const codeOf = (p: any): string =>
    p.rejectCode ?? (p.probability < MIN_PROBABILITY ? "band_low" : p.probability > MAX_PROBABILITY ? "band_high" : "unknown");
  const reasonOf = (p: any, code: string): string =>
    p.rejectReason ??
    (code === "band_low"
      ? `dôvera pod ${MIN_PROBABILITY} %`
      : code === "band_high"
      ? `dôvera nad ${MAX_PROBABILITY} %`
      : code === "category_lower_ev"
      ? "iná hranica tohto trhu má vyššiu hodnotu"
      : String(p.marketConflict ?? "neznámy dôvod"));
  const out: ShadowEntry[] = [];
  const bestPerCategory = new Map<string, any>();
  for (const p of candidates) {
    const code = codeOf(p);
    // Tipy s rozporom medzi neodporúčanými sa zapisujú všetky (ako pred 20. 10. 2026).
    if (p.marketConflict && p.rejectReason) {
      out.push(base(p, reasonOf(p, code), code));
      continue;
    }
    const cat = String(p.category ?? p.market);
    const cur = bestPerCategory.get(cat);
    const ev = p.expectedValue ?? 0, curEv = cur?.expectedValue ?? 0;
    if (!cur || ev > curEv || (ev === curEv && p.probability > cur.probability)) bestPerCategory.set(cat, p);
  }
  for (const p of bestPerCategory.values()) {
    const code = codeOf(p);
    out.push(base(p, reasonOf(p, code), code));
  }
  return out;
}
