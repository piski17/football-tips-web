import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import axios from "axios";
import { ibanValid } from "./payBySquare";

// Platby za členstvo TipRadar (Štart 50 tipov 49 €, Gold 100 tipov 79 €, Platinum 200 tipov 139 €): bankový prevod cez QR kód (PAY by square), bez poplatkov.
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
/**
 * Letná prestávka: počas nej sa čas členstva nepočíta (všetky dĺžky).
 * Členstvo sa 1. 6. pozastaví a 1. 8. pokračuje, o čo príde, sa predĺži.
 */
export const SUMMER_PAUSE = { fromMonth: 6, toMonth: 7 }; // jún a júl

/**
 * Koniec členstva na `months` mesiacov (alebo `days` dní, ak sú zadané) od `from`, bez letnej prestávky.
 * Rovnaký výpočet je v appke (public/app.js, memberEnd).
 */
export function addActiveMonths(from: Date, months: number, days?: number): Date {
  const calEnd = new Date(from);
  if (days) {
    calEnd.setTime(calEnd.getTime() + days * 24 * 3600 * 1000);
  } else {
    const day = calEnd.getUTCDate();
    calEnd.setUTCMonth(calEnd.getUTCMonth() + months);
    if (calEnd.getUTCDate() < day) calEnd.setUTCDate(0); // 31. 1. + 1 mesiac = 28./29. 2.
  }
  let remaining = calEnd.getTime() - from.getTime();
  let cursor = new Date(from);
  for (let guard = 0; guard < 20; guard++) {
    const y = cursor.getUTCFullYear();
    const pauseStart = Date.UTC(y, SUMMER_PAUSE.fromMonth - 1, 1);
    const pauseEnd = Date.UTC(y, SUMMER_PAUSE.toMonth, 1); // 1. 8. 00:00
    const t = cursor.getTime();
    if (t >= pauseStart && t < pauseEnd) { cursor = new Date(pauseEnd); continue; }
    const nextPause = t < pauseStart ? pauseStart : Date.UTC(y + 1, SUMMER_PAUSE.fromMonth - 1, 1);
    if (t + remaining <= nextPause) return new Date(t + remaining);
    remaining -= nextPause - t;
    cursor = new Date(nextPause);
  }
  return calEnd;
}

// Od 29. 10. 2026 večer sa predávajú tri členstvá podľa počtu tipov (Michalovo rozhodnutie):
// p50 = Štart · 50 tipov · 49 €, p100 = Gold · 100 tipov · 79 €, p200 = Platinum · 200 tipov · 139 € (navyše mentoring 1 na 1).
// Predošlé p75 / p150 / p250 (Štart 75 / Gold 150 / Onyx 250 tipov, 29. 10. 2026 ráno) ostávajú kvôli starším záznamom.
// Bez časovej platnosti: členstvo platí, kým sa neminú tipy (NO_EXPIRY_MONTHS je len technický dátum, nikde sa neukazuje).
// Garancia: ak členstvo skončí v strate (v jednotkách), člen dostane 1 mesiac zadarmo (na ten sa garancia nevzťahuje).
// Staré balíčky t75 / t150 / t300 (Štart 100 / Gold 250 / Onyx 500 tipov, 27. – 28. 10. 2026) a ešte staršie časové
// členstvá m1 (Gold 50 dní), m3 / season (6 mesiacov) ostávajú len kvôli starším záznamom.
export const NO_EXPIRY_MONTHS = 1200;
export type Term = "p50" | "p100" | "p200" | "p75" | "p150" | "p250" | "t75" | "t150" | "t300" | "m1" | "m3" | "season";
export const PAY_TERMS: Record<Term, { price: number; name: string; months?: number; days?: number; tips?: number }> = {
  p50: { price: 49, name: "50 tipov", tips: 50, months: NO_EXPIRY_MONTHS },
  p100: { price: 79, name: "100 tipov", tips: 100, months: NO_EXPIRY_MONTHS },
  p200: { price: 139, name: "200 tipov", tips: 200, months: NO_EXPIRY_MONTHS },
  p75: { price: 49, name: "75 tipov", tips: 75, months: NO_EXPIRY_MONTHS },
  p150: { price: 89, name: "150 tipov", tips: 150, months: NO_EXPIRY_MONTHS },
  p250: { price: 139, name: "250 tipov", tips: 250, months: NO_EXPIRY_MONTHS },
  t75: { price: 89, name: "100 tipov", tips: 100, months: NO_EXPIRY_MONTHS },
  t150: { price: 179, name: "250 tipov", tips: 250, months: NO_EXPIRY_MONTHS },
  t300: { price: 299, name: "500 tipov", tips: 500, months: NO_EXPIRY_MONTHS },
  m1: { price: 69, name: "50 dní", days: 50 },
  m3: { price: 199, name: "6 mesiacov", months: 6 },
  season: { price: 219, name: "6 mesiacov", months: 6 },
};
/** Názov členstva: Štart / Gold / Platinum (staré balíčky a časové členstvá majú v názve „starý / staré“). */
export const TIER_NAMES: Record<Term, string> = {
  p50: "Štart",
  p100: "Gold",
  p200: "Platinum",
  p75: "Štart (staré, 75 tipov)",
  p150: "Gold (staré, 150 tipov)",
  p250: "Onyx (staré, 250 tipov)",
  t75: "Štart (starý balíček)",
  t150: "Gold (starý balíček)",
  t300: "Onyx (starý balíček)",
  m1: "Gold (50 dní, staré)",
  m3: "Onyx (6 mesiacov, staré)",
  season: "Platinum (6 mesiacov, staré)",
};
export function tierName(term: Term): string {
  return TIER_NAMES[term] ?? TIER_NAMES.p50;
}
/** Názov členstva s počtom tipov, napríklad „Platinum · 200 tipov“. */
export function termLabel(term: Term): string {
  return `${tierName(term)} · ${PAY_TERMS[term].name}`;
}
export function isTerm(v: unknown): v is Term {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PAY_TERMS, v);
}
export type SellableTerm = "p50" | "p100" | "p200";
export const SELLABLE_TERMS: SellableTerm[] = ["p50", "p100", "p200"];
/** Členstvá, ktoré sa dajú kúpiť (staré balíčky a časové členstvá nie). */
export function isSellableTerm(v: unknown): v is SellableTerm {
  return v === "p50" || v === "p100" || v === "p200";
}
/** Staré odkazy vedú na nové členstvá: Štart 75 / Štart 100 / 50 dní → Štart 50, Gold 150 / Gold 250 / 3 mesiace → Gold 100, Onyx / 6 mesiacov → Platinum 200. */
export function sellableTerm(v: unknown): SellableTerm | null {
  if (isSellableTerm(v)) return v;
  if (v === "p75" || v === "t75" || v === "m1") return "p50";
  if (v === "p150" || v === "t150" || v === "m3") return "p100";
  if (v === "p250" || v === "t300" || v === "season") return "p200";
  return null;
}

export function bankEnabled(): boolean {
  return ibanValid(BANK.iban) && BANK.name.length > 0;
}
if (BANK.iban && !ibanValid(BANK.iban)) console.error("PAY_IBAN na Renderi nie je platný IBAN (preklep?) – platby sú vypnuté.");
export function paymentsEnabled(): boolean {
  return process.env.SALES_OPEN === "true" && bankEnabled();
}

/** Do kedy najneskôr platí členstvo zaplatené dnes (jún a júl sa nepočítajú). */
export function paidUntil(term: Term, from = new Date()): string {
  return addActiveMonths(new Date(from), PAY_TERMS[term].months ?? 1, PAY_TERMS[term].days).toISOString();
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
  return `TipRadar ${tierName(term)} ${PAY_TERMS[term].name}`;
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
