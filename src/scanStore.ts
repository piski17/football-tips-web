import * as fs from "fs";
import * as path from "path";
import axios from "axios";

// Dnešný radar (19. 10. 2026): koľko zápasov a trhov model v daný deň prepočítal.
// Pre každý deň jeden hash zápas -> počet trhov, takže opakovaná analýza toho
// istého zápasu sa nezapočíta dvakrát. Upstash, bez neho súbor data/scan.json.
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);
const PREFIX = "tipradar_scan:";
const FILE = path.join(__dirname, "..", "data", "scan.json");
const KEEP_SECONDS = 40 * 24 * 3600;

async function redis(command: (string | number)[]): Promise<any> {
  const res = await axios.post(UPSTASH_URL!, command, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }, timeout: 20000 });
  return res.data?.result;
}

function readFile(): Record<string, Record<string, number>> {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; }
}

export async function recordScan(day: string, fixtureId: number, markets: number): Promise<void> {
  if (!day || !fixtureId) return;
  if (!useUpstash) {
    const all = readFile();
    (all[day] ??= {})[String(fixtureId)] = markets;
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(all));
    return;
  }
  await redis(["HSET", PREFIX + day, String(fixtureId), markets]);
  await redis(["EXPIRE", PREFIX + day, KEEP_SECONDS]);
}

export async function scanSummary(day: string): Promise<{ matches: number; markets: number }> {
  let values: number[];
  if (!useUpstash) values = Object.values(readFile()[day] ?? {});
  else values = ((await redis(["HVALS", PREFIX + day])) ?? []).map(Number);
  return { matches: values.length, markets: values.reduce((s, v) => s + (Number(v) || 0), 0) };
}
