import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import axios from "axios";

// Platby za členstvo TipRadar Platinum cez Stripe (platobná stránka Stripe Checkout).
// Zapne sa, keď sú na Renderi nastavené SALES_OPEN=true a STRIPE_SECRET_KEY (sk_live_… alebo sk_test_…).
// Údaje o karte nikdy neprechádzajú cez TipRadar – zadávajú sa priamo na stránke Stripe.

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
/** Adresa webu, kam sa človek vráti po platbe (predvolene https://tipradar.eu). */
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

export function paymentsEnabled(): boolean {
  return process.env.SALES_OPEN === "true" && Boolean(STRIPE_SECRET_KEY);
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
  sessionId: string; // Stripe Checkout Session
  term: Term;
  chatId?: string; // Telegram ID, ak prišiel z bota (správa pre poradovník)
  status: "pending" | "paid" | "redeemed";
  email?: string;
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

// ---- Stripe ----
function stripe() {
  return axios.create({
    baseURL: "https://api.stripe.com/v1",
    auth: { username: STRIPE_SECRET_KEY || "", password: "" },
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 20000,
  });
}

/** Vytvorí platobnú stránku Stripe a vráti jej adresu. */
export async function createCheckout(term: Term, chatId?: string): Promise<string> {
  const token = crypto.randomBytes(9).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 12).padEnd(12, "x");
  const t = PAY_TERMS[term];
  const form = new URLSearchParams({
    mode: "payment",
    locale: "sk",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(t.price * 100),
    "line_items[0][price_data][product_data][name]": `TipRadar Platinum · ${t.name}`,
    "line_items[0][price_data][product_data][description]":
      term === "season" ? `Členstvo do ${SEASON_END.split("-").reverse().map(Number).join(". ")}` : "Členstvo sa samo nepredlžuje",
    success_url: `${PUBLIC_URL}/platba-ok?t=${token}`,
    cancel_url: `${PUBLIC_URL}/clenstvo`,
    "metadata[token]": token,
    "metadata[term]": term,
  });
  if (chatId) {
    form.set("client_reference_id", chatId);
    form.set("metadata[telegram]", chatId);
  }
  const res = await stripe().post("/checkout/sessions", form.toString());
  await savePayment({ token, sessionId: res.data.id, term, chatId, status: "pending", createdAt: new Date().toISOString() });
  return res.data.url;
}

/** Overí v Stripe, či je platba zaplatená. Vráti aktuálny záznam (alebo null, ak kód neexistuje). */
export async function refreshPayment(token: string): Promise<Payment | null> {
  const p = await getPayment(token);
  if (!p || p.status !== "pending") return p;
  const res = await stripe().get(`/checkout/sessions/${encodeURIComponent(p.sessionId)}`);
  if (res.data?.payment_status === "paid") {
    p.status = "paid";
    p.paidAt = new Date().toISOString();
    p.email = res.data?.customer_details?.email ?? undefined;
    await savePayment(p);
  }
  return p;
}
