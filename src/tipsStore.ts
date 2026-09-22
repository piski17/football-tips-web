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

export async function listTips(): Promise<SavedTip[]> {
  return readAll();
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
export async function deleteTip(id: string): Promise<SavedTip | null> {
  return withWriteLock(async () => {
    const tips = await readAll();
    const target = tips.find((t) => t.id === id);
    if (!target || target.status !== "pending") return null;
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
