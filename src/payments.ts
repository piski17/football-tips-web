import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import axios from "axios";
import { ibanValid } from "./payBySquare";
import { cachedRedis } from "./upstashCache";

// Platby za členstvo TipRadar (od 11. 11. 2026 jediné: VIP Klub 80 tipov 59 €): bankový prevod cez QR kód (PAY by square), bez poplatkov.
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

// Od 11. 11. 2026 (Michal: „jedno špeciálne členstvo“): jediné členstvo VIP Klub p80 – 80 tipov 59 € (0,74 € za tip),
// všetky výhody (úvodný hovor, mentoring 1 na 1, chat členov, vernostná zľava −20 %, garancia). p30 / p100 odvtedy staré.
// Od 8. 11. 2026 23:15 (Michal): len 2 členstvá – Štart p30 30 tipov 29 €, VIP p100 100 tipov 89 €. Štart bez vernostnej zľavy.
// p75 / p150 (Štart 75 tipov 65 €, VIP 150 tipov 110 €) odvtedy staré.
// Od 4. 11. 2026 19:12 (Michal: „75 tipov za 59 a to druhé uprav podľa toho“): Štart p75 75 tipov 59 €, VIP p150 150 tipov 99 €;
// 19:15 Michal „ceny daj od 65 €“ → Štart 75 tipov 65 €, VIP 150 tipov 109 €; 19:16 „VIP daj za 110“ → VIP 110 €
// (VIP hovor + mentoring 1 na 1; kurz do členstiev nedávať). p50 / p100 odvtedy staré.
// Krátko (4. 11. 19:05): Štart 50 tipov 39 €, VIP 100 tipov 69 €.
// Predtým (2. 11. 2026 večer): Štart 50 tipov 29 €, VIP 100 tipov 55 €.
// Ceny tak, aby sa členstvo vrátilo pri bežnom zisku modelu už pri banku 500 € a vklade 3 %. (Komentár z 2. 11.; od 4. 11. sa p150 znova predáva ako VIP.)
// Predtým (1. 11. 2026): Štart 50 tipov 39 €, Premium 100 tipov 75 €, VIP 150 tipov 109 €.
// Gold (p200) a Platinum (p250) sa už nepredávajú, ostávajú len kvôli prípadným starším záznamom.
// Predtým (31. 10. 2026 večer): posuvník 50 – 250 tipov, vždy po 50, každý počet má vlastný názov a výhody:
// 50 = Štart 39 €, 100 = Premium 75 €, 150 = VIP 109 €, 200 = Gold 139 €, 250 = Platinum 169 € (Gold a Platinum navyše mentoring 1 na 1).
// Výhody členstiev sú v src/telegram.ts (TIER_PERKS) a na webe (landing/index.html, data-min-tips).
// Rovnaké ceny sú na webe (landing/index.html, MEMBER_STEPS), v app.tipradar.eu (public/app.js) a v Mac appke.
// Staré p75 (Štart 75 tipov), p300 (300 tipov, len pár minút 31. 10.) a balíčky t75 / t150 / t300, časové m1 / m3 / season ostávajú kvôli starším záznamom.
// Bez časovej platnosti: členstvo platí, kým sa neminú tipy (NO_EXPIRY_MONTHS je len technický dátum, nikde sa neukazuje).
// Garancia: prvých 20 tipov bez rizika; ak členstvo skončí v strate (v jednotkách), člen dostane 1 mesiac zadarmo.
export const NO_EXPIRY_MONTHS = 1200;
export type SellableTerm = "p80";
export type Term = SellableTerm | "p30" | "p100" | "p50" | "p75" | "p150" | "p200" | "p250" | "p300" | "t75" | "t150" | "t300" | "m1" | "m3" | "season";
export const SELLABLE_TERMS: SellableTerm[] = ["p80"];
const pk = (price: number, tips: number) => ({ price, name: `${tips} tipov`, tips, months: NO_EXPIRY_MONTHS });
export const PAY_TERMS: Record<Term, { price: number; name: string; months?: number; days?: number; tips?: number }> = {
  p80: pk(59, 80),
  p30: pk(29, 30),
  p50: pk(39, 50),
  p100: pk(89, 100),
  p150: pk(110, 150),
  p200: pk(139, 200),
  p250: pk(169, 250),
  p300: pk(199, 300),
  p75: pk(65, 75),
  t75: pk(89, 100),
  t150: pk(179, 250),
  t300: pk(299, 500),
  m1: { price: 69, name: "50 dní", days: 50 },
  m3: { price: 199, name: "6 mesiacov", months: 6 },
  season: { price: 219, name: "6 mesiacov", months: 6 },
};
/** Názov členstva: Štart / Gold / Platinum (staré balíčky a časové členstvá majú v názve „starý / staré“). */
export const TIER_NAMES: Record<Term, string> = {
  p80: "VIP Klub",
  p30: "Štart (staré, 30 tipov)",
  p50: "Štart (staré, 50 tipov)",
  p100: "VIP (staré, 100 tipov)",
  p150: "VIP (staré, 150 tipov)",
  p200: "Gold (staré, 200 tipov)",
  p250: "Platinum (staré, 250 tipov)",
  p300: "Platinum (staré, 300 tipov)",
  p75: "Štart (staré, 75 tipov)",
  t75: "Štart (starý balíček)",
  t150: "Gold (starý balíček)",
  t300: "Onyx (starý balíček)",
  m1: "Gold (50 dní, staré)",
  m3: "Onyx (6 mesiacov, staré)",
  season: "Platinum (6 mesiacov, staré)",
};
export function tierName(term: Term): string {
  return TIER_NAMES[term] ?? TIER_NAMES.p80;
}
/** Názov členstva s počtom tipov, napríklad „Platinum · 200 tipov“. */
export function termLabel(term: Term): string {
  return `${tierName(term)} · ${PAY_TERMS[term].name}`;
}
export function isTerm(v: unknown): v is Term {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PAY_TERMS, v);
}
/** Členstvá, ktoré sa dajú kúpiť (50 – 250 tipov po 50; staré balíčky a časové členstvá nie). */
export function isSellableTerm(v: unknown): v is SellableTerm {
  return typeof v === "string" && (SELLABLE_TERMS as string[]).includes(v);
}
/** Odporúčaný vklad na tip (3 % banku) a najvyššia návratnosť na tip, pri ktorej je členstvo „reálne“ (4,2 %). */
export const MEMBER_STAKE_PCT = 3;
const REAL_ROI = 0.042;
/** Odporúčaný bank pre členstvo: aby sa cena vrátila pri bežnom zisku modelu (zaokrúhlené hore na 50 €). Rovnaký výpočet je na webe. */
// Od 4. 11. 2026: odporúčaný bank od – do. „Od“ = pri bežnom zisku modelu (4,2 % na tip) a vklade 3 % zarobí člen
// aspoň 1,5× cenu členstva (cena sa vráti a ešte je v pluse). „Do“ = horná hranica, pri ktorej je vklad 3 % stále rozumný (75 – 90 €).
const BANK_MARGIN = 1.5;
const BANK_MAX: Partial<Record<Term, number>> = { p80: 3000, p30: 2500, p100: 3000, p75: 2500, p150: 3000 };
export function memberBank(term: Term): number {
  const t = PAY_TERMS[term];
  const tips = t.tips || 50;
  return Math.ceil((BANK_MARGIN * t.price) / tips / (MEMBER_STAKE_PCT / 100) / REAL_ROI / 50) * 50;
}
export function memberBankMax(term: Term): number {
  return BANK_MAX[term] ?? memberBank(term) * 3;
}
/** Od 11. 11. 2026 je len jedno členstvo, s ničím sa neporovnáva (nič neušetrí). */
export function memberSaving(_term: Term): number {
  return 0;
}
/** Od 11. 11. 2026 jediné členstvo VIP Klub (80 tipov). */
export function termForTips(_tips: number): SellableTerm {
  return "p80";
}
/** Staré odkazy vedú na nové členstvá: Štart 75 / 50 dní → Štart, Štart 100 → Premium, Gold 250 / Onyx 500 / 300 tipov / 6 mesiacov → Platinum. */
export function sellableTerm(v: unknown): SellableTerm | null {
  if (isSellableTerm(v)) return v;
  // Od 11. 11. 2026 vedú všetky staré odkazy (aj p30 / p100) na jediné členstvo VIP Klub.
  if (isTerm(v)) return "p80";
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
  return cachedRedis(command, redisRaw); // 8. 11. 2026: šetrí prenos dát z Upstash
}
async function redisRaw(command: (string | number)[]): Promise<any> {
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
