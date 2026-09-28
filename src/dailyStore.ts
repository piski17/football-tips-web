import * as fs from "fs";
import * as path from "path";
import axios from "axios";

// Denný súhrn (stránka /suhrn): pre každý deň zoznam tipov zapísaných ručne.
// Ukladá sa do toho istého Upstash Redis ako história tipov (hash: deň -> JSON),
// bez Upstash (lokálny vývoj) do súboru data/daily.json.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);
const DAILY_KEY = "tipradar_daily";
const FILE = path.join(__dirname, "..", "data", "daily.json");

export interface DailyEntry {
  state: { tips: unknown[] };
  rev: number;
}

async function redis(command: (string | number)[]): Promise<any> {
  const res = await axios.post(UPSTASH_URL!, command, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    timeout: 20000,
  });
  return res.data?.result;
}

function readFile(): Record<string, DailyEntry> {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}
function writeFile(all: Record<string, DailyEntry>): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all));
}

function parse(raw: unknown): DailyEntry | null {
  if (typeof raw !== "string") return null;
  try {
    const v = JSON.parse(raw);
    return v && v.state && Array.isArray(v.state.tips) ? { state: v.state, rev: Number(v.rev) || 0 } : null;
  } catch {
    return null;
  }
}

export async function getDay(day: string): Promise<DailyEntry | null> {
  if (!useUpstash) return readFile()[day] ?? null;
  return parse(await redis(["HGET", DAILY_KEY, day]));
}

export async function getAllDays(): Promise<Record<string, DailyEntry>> {
  if (!useUpstash) return readFile();
  const flat: string[] = (await redis(["HGETALL", DAILY_KEY])) ?? [];
  const out: Record<string, DailyEntry> = {};
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const e = parse(flat[i + 1]);
    if (e) out[flat[i]] = e;
  }
  return out;
}

export async function setDay(day: string, entry: DailyEntry): Promise<void> {
  if (!useUpstash) {
    const all = readFile();
    all[day] = entry;
    writeFile(all);
    return;
  }
  await redis(["HSET", DAILY_KEY, day, JSON.stringify(entry)]);
}
