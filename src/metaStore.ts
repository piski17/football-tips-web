import * as fs from "fs";
import * as path from "path";
import axios from "axios";

// Drobné trvalé hodnoty servera (napr. kedy naposledy prebehla kontrola platieb),
// aby prežili reštart servera na Renderi. Upstash, bez neho súbor data/meta.json.
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);
const KEY = "tipradar_meta";
const FILE = path.join(__dirname, "..", "data", "meta.json");

async function redis(command: (string | number)[]): Promise<any> {
  const res = await axios.post(UPSTASH_URL!, command, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }, timeout: 20000 });
  return res.data?.result;
}

export async function getMeta(name: string): Promise<string | null> {
  if (!useUpstash) {
    try { return JSON.parse(fs.readFileSync(FILE, "utf8"))[name] ?? null; } catch { return null; }
  }
  return (await redis(["HGET", KEY, name])) ?? null;
}

export async function setMeta(name: string, value: string): Promise<void> {
  if (!useUpstash) {
    let all: Record<string, string> = {};
    try { all = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { /* nový súbor */ }
    all[name] = value;
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(all));
    return;
  }
  await redis(["HSET", KEY, name, value]);
}
