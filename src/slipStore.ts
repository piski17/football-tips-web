import * as fs from "fs";
import * as path from "path";
import axios from "axios";

// Podané tikety: snímky obrazovky tiketov, ktoré Michal sám podal na tipy z Histórie tipov.
// Na webe (tipradar.eu/vysledky) sa ukazujú až po vyhodnotení tipu, aby neprezradili čakajúci tip.
// Úložisko: Upstash (hash tipId -> JSON so zmenšeným JPEG obrázkom), bez Upstash data/slips.json.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);
const KEY = "tipradar_slips";
const FILE = path.join(__dirname, "..", "data", "slips.json");

/** Najväčší povolený obrázok (base64 data URL). Appka ho pred nahraním zmenší na ~1000 px. */
export const MAX_SLIP_CHARS = 900_000;

export interface Slip {
  tipId: string;
  image: string; // data:image/jpeg;base64,...
  stake: number | null; // vklad v €
  addedAt: string;
}

async function redis(command: (string | number)[]): Promise<any> {
  const res = await axios.post(UPSTASH_URL!, command, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }, timeout: 20000 });
  return res.data?.result;
}
function readFile(): Record<string, Slip> {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; }
}
function writeFile(all: Record<string, Slip>): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all));
}

// Zoznam tipov so snímkou (bez obrázkov) sa číta pri každom načítaní stránky Výsledky,
// obrázky sa držia v pamäti, aby sa Upstash nevolal pri každej návšteve.
let idsCache: { at: number; map: Map<string, number | null> } | null = null;
const imageCache = new Map<string, string>();
const IDS_TTL = 5 * 60 * 1000;

export async function saveSlip(tipId: string, image: string, stake: number | null): Promise<void> {
  const slip: Slip = { tipId, image, stake, addedAt: new Date().toISOString() };
  if (useUpstash) await redis(["HSET", KEY, tipId, JSON.stringify(slip)]);
  else { const all = readFile(); all[tipId] = slip; writeFile(all); }
  imageCache.set(tipId, image);
  idsCache = null;
}

export async function deleteSlip(tipId: string): Promise<void> {
  if (useUpstash) await redis(["HDEL", KEY, tipId]);
  else { const all = readFile(); delete all[tipId]; writeFile(all); }
  imageCache.delete(tipId);
  idsCache = null;
}

/** tipId -> vklad (bez obrázkov). */
export async function listSlipIds(): Promise<Map<string, number | null>> {
  if (idsCache && Date.now() - idsCache.at < IDS_TTL) return idsCache.map;
  const map = new Map<string, number | null>();
  if (useUpstash) {
    // HGETALL vráti aj obrázky; tiketov je málo, raz za 5 minút to nevadí a obrázky sa uložia do pamäte.
    const flat: string[] = (await redis(["HGETALL", KEY])) || [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      try { const s: Slip = JSON.parse(flat[i + 1]); map.set(flat[i], s.stake ?? null); imageCache.set(flat[i], s.image); } catch {}
    }
  } else {
    for (const [id, s] of Object.entries(readFile())) { map.set(id, s.stake ?? null); imageCache.set(id, s.image); }
  }
  idsCache = { at: Date.now(), map };
  return map;
}

export async function getSlipImage(tipId: string): Promise<string | null> {
  if (imageCache.has(tipId)) return imageCache.get(tipId)!;
  let slip: Slip | null = null;
  if (useUpstash) { const raw = await redis(["HGET", KEY, tipId]); slip = raw ? JSON.parse(raw) : null; }
  else slip = readFile()[tipId] ?? null;
  if (slip) imageCache.set(tipId, slip.image);
  return slip?.image ?? null;
}
