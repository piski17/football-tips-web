import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import axios from "axios";
import { ibanValid } from "./payBySquare";

// Platby za členstvo TipRadar Platinum: bankový prevod cez QR kód (PAY by square), bez poplatkov.
// Zapne sa, keď sú na Renderi nastavené SALES_OPEN=true, PAY_IBAN a PAY_NAME.
// Platbu potvrdíš jedným klikom v appke alebo v Telegrame, bot potom pošle pozvánku.

/** Účet na bankový prevod (IBAN a meno majiteľa zadáš na Renderi, v kóde nie sú). */
export const BANK = {
  iban: (process.env.PAY_IBAN || "").replace(/\s+/g, "").toUpperCase(),
  name: (process.env.PAY_NAME || "").trim(),
  bic: (process.env.PAY_BIC || "").replace(/\s+/g, "").toUpperCase(),
};
/** Adresa webu (predvolene https://tipradar.eu). */
export const PUBLIC_URL = (process.env.PUBLIC_URL || "https://tipradar.eu").replace(/\/+$/, "");
/** Koniec sezóny pre členstvo „Celá sezóna". */
export const SEASON_END = process.env.SEASON_END || "2027-05-31";

export type Term = "m1" | "m3" | "season";
export const PAY_TERMS: Record<Term, { price: number; name: string; months?: number }> = {
  m1: { price: 49, name: "1 mesiac", months: 1 },
  m3: { price: 129, name: "3 mesiace", months: 3 },
  season: { price: 299, name: "celá sezóna" },
};
export function isTerm(v: unknown): v is Term {
  return v === "m1" || v === "m3" || v === "season";
}

export function bankEnabled(): boolean {
  return ibanValid(BANK.iban) && BANK.name.length > 0;
}
if (BANK.iban && !ibanValid(BANK.iban)) console.error("PAY_IBAN na Renderi nie je platný IBAN (preklep?) – platby sú vypnuté.");
export function paymentsEnabled(): boolean {
  return process.env.SALES_OPEN === "true" && bankEnabled();
}

/** Do kedy platí členstvo zaplatené dnes. */
export function paidUntil(term: Term, from = new Date()): string {
  if (term === "season") return new Date(SEASON_END + "T23:59:59Z").toISOString();
  const d = new Date(from);
  d.setMonth(d.getMonth() + (PAY_TERMS[term].months ?? 1));
  return d.toISOString();
}

// ---- Evidencia platieb (Upstash, lokálne súbor) ----
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);
const KEY = "tipradar_payments";
const FILE = path.join(__dirname, "..", "data", "payments.json");

export interface Payment {
  token: string; // krátky kód v odkaze na Telegram bota (t.me/…?start=paid_KÓD)
  method: "bank";
  vs: string; // variabilný symbol
  term: Term;
  chatId?: string; // Telegram ID (prišiel z bota, alebo klikol „Zaplatil som")
  status: "pending" | "paid" | "redeemed" | "cancelled";
  claimedAt?: string; // kedy človek v Telegrame oznámil, že zaplatil prevodom
  name?: string; // meno z Telegramu
  username?: string; // @meno v Telegrame
  createdAt: string;
  paidAt?: string;
  redeemedAt?: string;
  redeemedBy?: string; // Telegram ID, ktorému bot poslal pozvánku
}

async function redis(command: (string | number)[]): Promise<any> {
  const res = await axios.post(UPSTASH_URL!, command, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }, timeout: 20000 });
  return res.data?.result;
}
function readFile(): Record<string, Payment> {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; }
}
export async function getPayment(token: string): Promise<Payment | null> {
  if (!/^[A-Za-z0-9]{8,32}$/.test(token)) return null;
  if (!useUpstash) return readFile()[token] ?? null;
  const raw = await redis(["HGET", KEY, token]);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export async function savePayment(p: Payment): Promise<void> {
  if (!useUpstash) {
    const all = readFile();
    all[p.token] = p;
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(all));
    return;
  }
  await redis(["HSET", KEY, p.token, JSON.stringify(p)]);
}

/** Všetky platby (najnovšie prvé). */
export async function listPayments(): Promise<Payment[]> {
  let all: Payment[] = [];
  if (!useUpstash) all = Object.values(readFile());
  else {
    const raw: string[] = (await redis(["HGETALL", KEY])) ?? [];
    for (let i = 1; i < raw.length; i += 2) {
      try { all.push(JSON.parse(raw[i])); } catch { /* poškodený záznam preskočíme */ }
    }
  }
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function newToken(): string {
  return crypto.randomBytes(9).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 12).padEnd(12, "x");
}

// ---- Bankový prevod (QR kód PAY by square) ----

/** Text v správe pre príjemcu – bez diakritiky a pomlčiek, aby ho zobrazila každá banka. */
export function bankNote(term: Term): string {
  return `TipRadar Platinum ${PAY_TERMS[term].name}`;
}

/** Založí čakajúcu platbu prevodom s vlastným variabilným symbolom. */
export async function createBankPayment(term: Term, chatId?: string): Promise<Payment> {
  // Variabilný symbol: 8 číslic, prvá nie je nula (banky nulu na začiatku niekedy zahodia).
  const used = new Set((await listPayments()).map((p) => p.vs).filter(Boolean));
  let vs = "";
  do vs = String(crypto.randomInt(10000000, 99999999)); while (used.has(vs));
  const p: Payment = { token: newToken(), method: "bank", vs, term, chatId, status: "pending", createdAt: new Date().toISOString() };
  await savePayment(p);
  return p;
}

/** Potvrdenie prijatej platby (z appky alebo z Telegramu). Vráti aktualizovaný záznam. */
export async function confirmBankPayment(token: string): Promise<Payment | null> {
  const p = await getPayment(token);
  if (!p) return null;
  if (p.status === "pending" || p.status === "cancelled") {
    p.status = "paid";
    p.paidAt = new Date().toISOString();
    await savePayment(p);
  }
  return p;
}

/** Úplné odstránenie záznamu o platbe (napr. skúšobnej). */
export async function deletePayment(token: string): Promise<void> {
  if (!useUpstash) {
    const all = readFile();
    delete all[token];
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(all));
    return;
  }
  await redis(["HDEL", KEY, token]);
}

export async function cancelPayment(token: string): Promise<Payment | null> {
  const p = await getPayment(token);
  if (!p) return null;
  if (p.status === "pending") {
    p.status = "cancelled";
    await savePayment(p);
  }
  return p;
}
