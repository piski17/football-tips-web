import * as fs from "fs";
import * as path from "path";
import axios from "axios";

// Záujemcovia o členstvo (poradovník) – zapisuje ich Telegram bot, keď niekto
// príde z tlačidla na tipradar.eu. Jeden záznam na človeka (Telegram ID).
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);
const KEY = "tipradar_leads";
const FILE = path.join(__dirname, "..", "data", "leads.json");

export interface Lead {
  chatId: string;
  plan: string; // premium | vip | vip_waitlist | clenstvo
  name: string;
  username?: string;
  email?: string; // zápis cez formulár na tipradar.eu
  note?: string;
  source?: "telegram" | "web";
  firstAt: string; // kedy sa zapísal prvýkrát (poradie v poradovníku)
  lastAt: string;
}

async function redis(command: (string | number)[]): Promise<any> {
  const res = await axios.post(UPSTASH_URL!, command, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }, timeout: 20000 });
  return res.data?.result;
}
function readFile(): Record<string, Lead> {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; }
}
function writeFile(all: Record<string, Lead>): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all));
}

export async function listLeads(): Promise<Lead[]> {
  let all: Lead[];
  if (!useUpstash) all = Object.values(readFile());
  else {
    const flat: string[] = (await redis(["HGETALL", KEY])) ?? [];
    all = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      try { all.push(JSON.parse(flat[i + 1])); } catch { /* poškodený záznam */ }
    }
  }
  return all.sort((a, b) => (a.firstAt < b.firstAt ? -1 : 1));
}

/** Zapíše záujemcu. Pri opakovanom kliknutí zachová pôvodný dátum (poradie) a VIP má prednosť pred ostatnými. */
export async function recordLead(input: { chatId: string; plan: string; name: string; username?: string; email?: string; note?: string; source?: "telegram" | "web" }): Promise<void> {
  const now = new Date().toISOString();
  const existing = (await listLeads()).find((l) => l.chatId === input.chatId);
  const isVip = (p: string) => p === "vip" || p === "vip_waitlist";
  const plan = existing && isVip(existing.plan) && !isVip(input.plan) ? existing.plan : input.plan;
  const lead: Lead = { ...input, plan, firstAt: existing?.firstAt ?? now, lastAt: now };
  if (!useUpstash) {
    const all = readFile();
    all[lead.chatId] = lead;
    writeFile(all);
    return;
  }
  await redis(["HSET", KEY, lead.chatId, JSON.stringify(lead)]);
}

export async function deleteLead(chatId: string): Promise<void> {
  if (!useUpstash) {
    const all = readFile();
    delete all[chatId];
    writeFile(all);
    return;
  }
  await redis(["HDEL", KEY, chatId]);
}
