import * as crypto from "crypto";
import axios from "axios";

// Jednoduchá návštevnosť verejných stránok (tipradar.eu, /video) – bez cookies.
// Pre každý deň: počet zobrazení, počet rôznych návštevníkov, odkiaľ prišli
// a kliknutia na dôležité tlačidlá. Návštevník sa rozlišuje len podľa skráteného
// odtlačku (IP + prehliadač + dátum), ktorý sa na druhý deň zmení – nikoho nesledujeme.
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);
const KEEP_DAYS = 400;

async function redis(command: (string | number)[]): Promise<any> {
  const res = await axios.post(UPSTASH_URL!, command, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }, timeout: 20000 });
  return res.data?.result;
}

/** Deň RRRR-MM-DD podľa slovenského času. */
function skDay(date = new Date()): string {
  return date.toLocaleDateString("sv-SE", { timeZone: "Europe/Bratislava" });
}

// Záloha bez Upstash (lokálny vývoj): len v pamäti.
const memory: Record<string, Record<string, number>> = {};
const memoryVisitors: Record<string, Set<string>> = {};

/** Zdroj návštevy zo stránky, z ktorej človek prišiel (alebo z ?utm_source=). */
export function sourceFrom(referrer: string, utm: string): string {
  const u = utm.trim().toLowerCase();
  if (u) return u.replace(/[^a-z0-9_.-]/g, "").slice(0, 30) || "iné";
  let host = "";
  try { host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase(); } catch { /* bez odkazu */ }
  if (!host) return "priamo";
  if (host.endsWith("tipradar.eu") || host.endsWith("onrender.com")) return "";
  if (host.includes("instagram")) return "instagram";
  if (host.includes("facebook") || host === "fb.com" || host.includes("fb.me")) return "facebook";
  if (host === "t.me" || host.includes("telegram")) return "telegram";
  if (host.includes("google")) return "google";
  if (host.includes("tiktok")) return "tiktok";
  if (host.includes("youtube") || host === "youtu.be") return "youtube";
  return host.slice(0, 40);
}

const ALLOWED_PAGES = ["/", "/video"];
const ALLOWED_CLICKS = ["free", "premium", "vip", "telegram", "instagram", "email", "kurz", "formular"];

export async function recordHit(input: { page: string; source: string; click?: string; ip: string; ua: string }): Promise<void> {
  const day = skDay();
  const fields: string[] = [];
  if (input.click) {
    if (!ALLOWED_CLICKS.includes(input.click)) return;
    fields.push(`click:${input.click}`);
  } else {
    const page = ALLOWED_PAGES.includes(input.page) ? input.page : null;
    if (!page) return;
    fields.push(`view:${page}`, "views");
    if (input.source) fields.push(`src:${input.source}`);
  }
  const visitor = crypto.createHash("sha256").update(`${day}|${input.ip}|${input.ua}`).digest("hex").slice(0, 16);

  if (!useUpstash) {
    const d = (memory[day] ??= {});
    for (const f of fields) d[f] = (d[f] ?? 0) + 1;
    if (!input.click) (memoryVisitors[day] ??= new Set()).add(visitor);
    return;
  }
  const key = `tipradar_stats:${day}`;
  for (const f of fields) await redis(["HINCRBY", key, f, 1]);
  await redis(["EXPIRE", key, KEEP_DAYS * 86400]);
  if (!input.click) {
    await redis(["PFADD", `tipradar_uv:${day}`, visitor]);
    await redis(["EXPIRE", `tipradar_uv:${day}`, KEEP_DAYS * 86400]);
  }
}

export interface DayStats {
  day: string;
  views: number;
  visitors: number;
  pages: Record<string, number>;
  sources: Record<string, number>;
  clicks: Record<string, number>;
}

async function readDay(day: string): Promise<DayStats> {
  let flat: Record<string, number> = {};
  let visitors = 0;
  if (!useUpstash) {
    flat = memory[day] ?? {};
    visitors = memoryVisitors[day]?.size ?? 0;
  } else {
    const arr: string[] = (await redis(["HGETALL", `tipradar_stats:${day}`])) ?? [];
    for (let i = 0; i + 1 < arr.length; i += 2) flat[arr[i]] = Number(arr[i + 1]) || 0;
    visitors = Number(await redis(["PFCOUNT", `tipradar_uv:${day}`])) || 0;
  }
  const out: DayStats = { day, views: flat.views ?? 0, visitors, pages: {}, sources: {}, clicks: {} };
  for (const [k, v] of Object.entries(flat)) {
    if (k.startsWith("view:")) out.pages[k.slice(5)] = v;
    else if (k.startsWith("src:")) out.sources[k.slice(4)] = v;
    else if (k.startsWith("click:")) out.clicks[k.slice(6)] = v;
  }
  return out;
}

/** Návštevnosť za posledných `days` dní (najnovší deň prvý). */
export async function readStats(days: number): Promise<DayStats[]> {
  const n = Math.min(Math.max(1, days), 90);
  const list: string[] = [];
  const now = Date.now();
  for (let i = 0; i < n; i++) list.push(skDay(new Date(now - i * 86400000)));
  const unique = Array.from(new Set(list));
  return Promise.all(unique.map(readDay));
}
