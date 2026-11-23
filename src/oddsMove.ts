import axios from "axios";
import { scannedFixtures, FixtureOdds } from "./surebets";
import { MarketOdds, marketProbabilityDetail } from "./oddsMatcher";

// Pohyb kurzov (23. 11. 2026, Michal: „bod 1 … daj to do tichého sledovania na TipRadare“).
// Pri prvom prehľadaní kurzov dňa (sken surebetov, každú hodinu, len dnešné zápasy) sa ku každému zápasu
// odloží „ranný“ kurz Pinnacle – najostrejšej stávkovky. Keď server asi hodinu pred výkopom vyberie tip,
// porovná férovú šancu Pinnacle (bez marže) ráno a teraz. Keď šanca stúpla (kurz klesol), na tip stavili
// aj veľkí hráči – „trh súhlasí“. Len tiché sledovanie – na výber tipov pre klientov to nemá vplyv.
// Úložisko: Upstash hash tipradar_open_pin:<deň zápasu> (vyprší po 4 dňoch), bez Upstash v pamäti.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);
const keyOf = (matchDate: string) => `tipradar_open_pin:${String(matchDate).slice(0, 10)}`;

interface OpenSnap { at: string; odds: MarketOdds[] }
const saved = new Set<number>();
const mem = new Map<number, OpenSnap>();

async function redis(command: (string | number)[]): Promise<any> {
  const res = await axios.post(UPSTASH_URL!, command, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }, timeout: 20000 });
  return res.data?.result;
}

const isPinnacle = (book: string) => /^pinnacle$/i.test(String(book).trim());

/** Kurzy Pinnacle k zápasu vo formáte pre findOdds. */
function pinOdds(f: FixtureOdds): MarketOdds[] {
  const out: MarketOdds[] = [];
  for (const bet of Object.values(f.bets ?? {})) {
    for (const [value, list] of Object.entries(bet.values ?? {})) {
      const o = (list ?? []).find((x) => isPinnacle(x.book));
      if (o && o.odd > 1) out.push({ bet: bet.name, value, odd: o.odd, bookmakers: 1 });
    }
  }
  return out;
}

/** Po každom prehľadaní kurzov: k zápasom, ktoré ešte nemajú ranný kurz Pinnacle, ho odloží (prvý zápis vyhráva). */
export async function snapshotOpeningOdds(): Promise<void> {
  const now = Date.now();
  for (const f of scannedFixtures()) {
    if (f.extra || saved.has(f.fixtureId)) continue;
    if (!(new Date(f.date).getTime() > now)) continue;
    const odds = pinOdds(f);
    if (!odds.length) continue;
    saved.add(f.fixtureId);
    const snap: OpenSnap = { at: new Date().toISOString(), odds };
    if (!useUpstash) { if (!mem.has(f.fixtureId)) mem.set(f.fixtureId, snap); continue; }
    try {
      const key = keyOf(f.date);
      const added = await redis(["HSETNX", key, String(f.fixtureId), JSON.stringify(snap)]);
      if (Number(added) === 1) await redis(["EXPIRE", key, 4 * 24 * 3600]);
    } catch { saved.delete(f.fixtureId); }
  }
}

async function readSnap(fixtureId: number, matchDate: string): Promise<OpenSnap | null> {
  if (!useUpstash) return mem.get(fixtureId) ?? null;
  try {
    const raw = await redis(["HGET", keyOf(matchDate), String(fixtureId)]);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

type Fx = { fixtureId: number; matchDate: string; homeTeam: string; awayTeam: string };
type Pick = { market: string; selection: string };

/** Férová šanca Pinnacle (%, bez marže) teraz – z posledného prehľadania kurzov. */
export function pinnacleNow(fx: Fx, pick: Pick): number | null {
  const f = scannedFixtures().find((x) => x.fixtureId === fx.fixtureId);
  if (!f) return null;
  const d = marketProbabilityDetail(pinOdds(f), pick, fx.homeTeam, fx.awayTeam);
  return d?.devig ? d.prob : null;
}

/**
 * Pohyb férovej šance Pinnacle od rána po teraz (v bodoch; + = šanca stúpla, kurz klesol).
 * openH = koľko hodín pred týmto okamihom sa ranný kurz odložil.
 */
export async function openingMove(fx: Fx, pick: Pick): Promise<{ move: number; openH: number; nowP: number } | null> {
  const nowP = pinnacleNow(fx, pick);
  if (nowP == null) return null;
  const snap = await readSnap(fx.fixtureId, fx.matchDate);
  if (!snap) return null;
  const d = marketProbabilityDetail(snap.odds, pick, fx.homeTeam, fx.awayTeam);
  if (!d?.devig) return null;
  return {
    move: Math.round((nowP - d.prob) * 10) / 10,
    openH: Math.round(((Date.now() - new Date(snap.at).getTime()) / 3.6e6) * 10) / 10,
    nowP: Math.round(nowP * 10) / 10,
  };
}
