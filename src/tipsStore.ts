import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import axiosRetry from "axios-retry";
import { SavedTip } from "./types";

// ---- Trvalé úložisko cez Upstash Redis (odolné voči reštartu/redeploy appky) ----
//
// Predtým appka používala JSONBin.io, ktorého bezplatný plán ale poskytuje len
// 10 000 požiadaviek JEDNORAZOVO (nie mesačne) - pri bežnom používaní appky sa
// to rýchlo minie. Upstash Redis má bezplatný plán 500 000 požiadaviek KAŽDÝ
// MESIAC, čo je pre tento účel oveľa udržateľnejšie.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

const TIPS_KEY = "tipradar_tips";

function upstashClient() {
  const instance = axios.create({ timeout: 20000 });
  // Automaticky zopakuje požiadavku pri krátkodobom výpadku siete - menej
  // pokusov, aby jedna pomalá požiadavka nenechala používateľa čakať dlho.
  axiosRetry(instance, {
    retries: 2,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) =>
      axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response?.status === 429,
  });
  return instance;
}

/**
 * DÔLEŽITÉ: pri zlyhaní siete táto funkcia musí chybu nahlásiť ďalej (throw),
 * nie potichu vrátiť prázdny zoznam - inak by pri ukladaní nového tipu mohla
 * appka omylom prepísať celú existujúcu históriu prázdnym/neúplným zoznamom.
 */
async function readAllRemote(): Promise<SavedTip[]> {
  const res = await upstashClient().get(`${UPSTASH_URL}/get/${TIPS_KEY}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  const raw = res.data?.result;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAllRemote(tips: SavedTip[]): Promise<void> {
  await upstashClient().post(`${UPSTASH_URL}/set/${TIPS_KEY}`, JSON.stringify(tips), {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "text/plain" },
  });
}

// ---- Lokálne úložisko (záloha, ak Upstash nie je nastavený - napr. pri lokálnom vývoji) ----

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE_PATH = path.join(DATA_DIR, "tips.json");

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readAllLocal(): SavedTip[] {
  try {
    const raw = fs.readFileSync(FILE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeAllLocal(tips: SavedTip[]): void {
  ensureDataDir();
  fs.writeFileSync(FILE_PATH, JSON.stringify(tips, null, 2), "utf-8");
}

// ---- Spoločné funkcie - použijú Upstash, ak je nastavený, inak lokálny súbor ----

async function readAll(): Promise<SavedTip[]> {
  return useUpstash ? readAllRemote() : readAllLocal();
}

async function writeAll(tips: SavedTip[]): Promise<void> {
  if (useUpstash) {
    await writeAllRemote(tips);
  } else {
    writeAllLocal(tips);
  }
}

/**
 * Poistka proti súbežným zápisom: ak by appka aj web (alebo dve rýchle
 * akcie po sebe) chceli zapisovať naraz, mohlo by dôjsť k tomu, že jeden
 * zápis prepíše ten druhý. Táto fronta zaručí, že sa vždy vykoná najprv
 * jedno kompletné čítanie+zápis, až potom ďalšie - nikdy naraz.
 */
let writeQueue: Promise<unknown> = Promise.resolve();
function withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(operation, operation);
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function saveTip(tip: SavedTip): Promise<void> {
  await withWriteLock(async () => {
    const tips = await readAll();
    tips.unshift(tip);
    await writeAll(tips);
  });
}

// Trhy, podľa ktorých sa z voľného textu („Góly hostí pod 1,5“) oddelí trh a výber.
const KNOWN_MARKETS = [
  "Góly v 1. polčase", "Góly v 2. polčase", "Karty v 1. polčase", "Karty v 2. polčase", "Fauly domácich", "Fauly hostí",
  "Strely na bránu domácich", "Strely na bránu hostí", "Strely na bránu", "Držanie lopty domácich", "Držanie lopty hostí",
  "Vyššie držanie lopty", "Góly domácich", "Góly hostí", "Góly", "Rohy domácich", "Rohy hostí", "Rohy",
  "Karty domácich", "Karty hostí", "Karty", "Fauly", "Ofsajdy", "Oba tímy skórujú", "Výsledok zápasu",
  "Dvojšanca", "Strelec gólov",
];

/** Rozdelí voľný text tipu na trh a výber, ak sa začína známym trhom (inak null). */
export function splitMarketText(text: string): { market: string; selection: string } | null {
  const t = text.trim();
  const m = KNOWN_MARKETS.find((k) => t.toLowerCase().startsWith(k.toLowerCase() + " ") || t.toLowerCase().startsWith(k.toLowerCase() + ":"));
  if (!m) return null;
  const rest = t.slice(m.length).replace(/^[:\s]+/, "").trim();
  return rest ? { market: m, selection: rest.charAt(0).toUpperCase() + rest.slice(1) } : null;
}

/** Staršie tipy mali trh pomenovaný "Obaja tímy skórujú" - zobrazujeme správne "Oba tímy skórujú".
 *  Tipy obnovené z denného súhrnu bez trhu („Obnovený tip“) dostanú trh z textu výberu. */
function normalizeTip(t: SavedTip): SavedTip {
  if (t.market === "Obnovený tip") {
    const split = splitMarketText(t.selection);
    if (split) t = { ...t, ...split };
  }
  const fix = (m: string) => (m === "Obaja tímy skórujú" ? "Oba tímy skórujú" : m);
  const legs = t.legs ? t.legs.map((l) => ({ ...l, market: fix(l.market) })) : t.legs;
  return { ...t, market: fix(t.market), ...(legs ? { legs } : {}) };
}

export async function listTips(): Promise<SavedTip[]> {
  return (await readAll()).map(normalizeTip);
}

export async function updateTip(id: string, updates: Partial<SavedTip>): Promise<void> {
  await withWriteLock(async () => {
    const tips = await readAll();
    const idx = tips.findIndex((t) => t.id === id);
    if (idx >= 0) {
      tips[idx] = { ...tips[idx], ...updates };
      await writeAll(tips);
    }
  });
}

/** Zmaže tip len ak je ešte "pending" - už vyhodnotené tipy (won/lost/void) sa nedajú zmazať, aby zostala história presná. */
/** Zmaže tip/tiket bez ohľadu na jeho stav (aj vyhodnotené) - potvrdenie rieši rozhranie pred zavolaním. */
export async function deleteTip(id: string): Promise<SavedTip | null> {
  return withWriteLock(async () => {
    const tips = await readAll();
    const target = tips.find((t) => t.id === id);
    if (!target) return null;
    await writeAll(tips.filter((t) => t.id !== id));
    return target;
  });
}

/** Vymaže úplne všetky uložené tipy (aj vyhodnotené) a vráti, čo bolo predtým uložené (napr. kvôli zmazaniu súvisiacich správ z Telegramu). */
export async function clearAllTips(): Promise<SavedTip[]> {
  return withWriteLock(async () => {
    const previous = await readAll();
    await writeAll([]);
    return previous;
  });
}

/**
 * Kurz od 1,60 (2. 11. 2026, Michal): tipy s kurzom pod 1,60 sa odstránia z Histórie tipov, štatistík aj webu.
 * Nemažú sa natrvalo – presunú sa bokom do kľúča tipradar_tips_pod_160 (záloha), odkiaľ sa dajú vrátiť.
 * Beží raz (po nasadení pri štarte servera); ďalšie spustenie nájde príznak a nič nerobí.
 * Ostávajú: tikety, tipy bez kurzu, tipy „Len sledovať“ (do štatistík sa aj tak nerátajú).
 */
const BELOW_KEY = "tipradar_tips_pod_160";
const BELOW_DONE_KEY = "tipradar_migr_pod_160_done";
export async function moveTipsBelowOddsOnce(min = 1.6): Promise<number> {
  if (!useUpstash) return 0;
  const auth = { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } };
  const done = (await upstashClient().get(`${UPSTASH_URL}/get/${BELOW_DONE_KEY}`, auth)).data?.result;
  if (done) return 0;
  return withWriteLock(async () => {
    const tips = await readAll();
    const isBelow = (t: SavedTip) =>
      !(t.legs && t.legs.length) && !t.watchOnly && typeof t.odds === "number" && t.odds > 1 && t.odds < min - 1e-9;
    const below = tips.filter(isBelow);
    if (below.length) {
      // najprv záloha, až potom zápis bez nich – pri chybe zálohy sa nič neodstráni
      let prev: SavedTip[] = [];
      try {
        const raw = (await upstashClient().get(`${UPSTASH_URL}/get/${BELOW_KEY}`, auth)).data?.result;
        prev = raw ? JSON.parse(raw) : [];
      } catch { prev = []; }
      await upstashClient().post(`${UPSTASH_URL}/set/${BELOW_KEY}`, JSON.stringify([...prev, ...below]), {
        headers: { ...auth.headers, "Content-Type": "text/plain" },
      });
      await writeAll(tips.filter((t) => !isBelow(t)));
    }
    await upstashClient().post(`${UPSTASH_URL}/set/${BELOW_DONE_KEY}`, new Date().toISOString(), {
      headers: { ...auth.headers, "Content-Type": "text/plain" },
    });
    return below.length;
  });
}

/**
 * Pásmo 70 – 80 % a kurz od 1,50 (2. 11. 2026 20:50, Michalovo rozhodnutie, skúška). Beží raz pri štarte:
 * 1) tipy odložené bokom pri kurze 1,60 (tipradar_tips_pod_160) sa vrátia do Histórie tipov (bez duplicít podľa id;
 *    záloha v Redise ostáva),
 * 2) zverejnené tipy s dôverou pod 70 % (nie tikety) sa presunú do sledovaných – značka band70Moved,
 *    65 – 69 % aj watchBand; rovnako tipy, ktoré neprejdú kontrolou 60 / 40 od 70 % (aj strictFail). Nič sa nemaže.
 * Návrat k 1,60 / 68 – 80 %: tipom s band70Moved zrušiť watchOnly (+ watchBand, strictFail), MIN_PROBABILITY 68, MIN_ODDS 1,6.
 */
const BAND70_DONE_KEY = "tipradar_migr_70_150_done";
export async function restoreBelow160AndBand70Once(minProb = 70): Promise<{ restored: number; moved: number }> {
  if (!useUpstash) return { restored: 0, moved: 0 };
  const auth = { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } };
  const done = (await upstashClient().get(`${UPSTASH_URL}/get/${BAND70_DONE_KEY}`, auth)).data?.result;
  if (done) return { restored: 0, moved: 0 };
  return withWriteLock(async () => {
    const tips = await readAll();
    let below: SavedTip[] = [];
    try {
      const raw = (await upstashClient().get(`${UPSTASH_URL}/get/${BELOW_KEY}`, auth)).data?.result;
      below = raw ? JSON.parse(raw) : [];
    } catch { below = []; }
    const ids = new Set(tips.map((t) => t.id));
    const restore = (Array.isArray(below) ? below : []).filter((t) => t && t.id && !ids.has(t.id));
    const all = [...tips, ...restore];
    let moved = 0;
    for (const t of all) {
      if ((t.legs && t.legs.length) || t.watchOnly) continue;
      if (typeof t.probability === "number" && t.probability < minProb) {
        t.watchOnly = true;
        t.band70Moved = true;
        if (t.probability >= 65) t.watchBand = true;
        t.strongOfDay = undefined;
        moved++;
      } else if (
        typeof t.strictProbability === "number" && typeof t.odds === "number" && t.odds > 1 && !t.manualEntry &&
        !(t.strictProbability >= minProb && t.strictProbability <= 80 && (t.strictProbability / 100) * t.odds >= 1.05)
      ) {
        // kontrola 60 / 40 od 70 %: tip by pri nových pravidlách neprešiel – tiež do sledovaných (skupina 60 / 40)
        t.watchOnly = true;
        t.band70Moved = true;
        t.strictFail = true;
        t.strongOfDay = undefined;
        moved++;
      }
    }
    if (restore.length || moved) await writeAll(all);
    await upstashClient().post(`${UPSTASH_URL}/set/${BAND70_DONE_KEY}`, new Date().toISOString(), {
      headers: { ...auth.headers, "Content-Type": "text/plain" },
    });
    return { restored: restore.length, moved };
  });
}

/**
 * 4. 11. 2026 (Michal): tipy „doplnené po výkope“ (lateAdd) klient nemohol dostať – raz pri štarte sa presunú
 * do sledovaných (watchOnly + lateMoved), aby sa nerátali do štatistík. Nič sa nemaže.
 * Návrat: tipom s lateMoved zrušiť watchOnly.
 */
const LATE_DONE_KEY = "tipradar_migr_late_done";
export async function moveLateAddsOnce(): Promise<number> {
  if (!useUpstash) return 0;
  const auth = { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } };
  const done = (await upstashClient().get(`${UPSTASH_URL}/get/${LATE_DONE_KEY}`, auth)).data?.result;
  if (done) return 0;
  return withWriteLock(async () => {
    const tips = await readAll();
    let moved = 0;
    for (const t of tips) {
      if (!t.lateAdd || t.watchOnly) continue;
      t.watchOnly = true;
      t.lateMoved = true;
      t.strongOfDay = undefined;
      moved++;
    }
    if (moved) await writeAll(tips);
    await upstashClient().post(`${UPSTASH_URL}/set/${LATE_DONE_KEY}`, new Date().toISOString(), {
      headers: { ...auth.headers, "Content-Type": "text/plain" },
    });
    return moved;
  });
}
