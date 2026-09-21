import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import axiosRetry from "axios-retry";
import { SavedTip } from "./types";

// ---- Trvalé úložisko cez JSONBin.io (odolné voči reštartu/redeploy appky) ----

const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY;
const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID;
const useJsonBin = Boolean(JSONBIN_API_KEY && JSONBIN_BIN_ID);

const JSONBIN_BASE = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;

function jsonBinClient() {
  const instance = axios.create({ timeout: 20000 });
  // Automaticky zopakuje požiadavku pri krátkodobom výpadku siete - menej
  // pokusov ako predtým, aby jedna pomalá požiadavka nenechala používateľa
  // čakať aj niekoľko minút (radšej rýchlejšie zlyhá a appka to ukáže ako chybu).
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
 *
 * Dáta sa čítajú v novom formáte { tips: [...] }, so spätnou kompatibilitou
 * pre starší formát (čistý zoznam), ak by v bin-e ešte zostal.
 */
async function readAllRemote(): Promise<SavedTip[]> {
  const res = await jsonBinClient().get(`${JSONBIN_BASE}/latest`, {
    headers: { "X-Master-Key": JSONBIN_API_KEY!, "X-Bin-Meta": "false" },
  });
  if (Array.isArray(res.data)) return res.data; // starší formát (spätná kompatibilita)
  if (res.data && Array.isArray(res.data.tips)) return res.data.tips;
  return [];
}

/**
 * Dáta sa ukladajú zabalené ako { tips: [...] }, nie ako čistý zoznam -
 * JSONBin.io totiž odmieta obsah, ktorý vyzerá "prázdny" (napr. samotné []),
 * čo by inak spôsobilo chybu presne pri vymazaní poslednej/všetkých položiek.
 */
async function writeAllRemote(tips: SavedTip[]): Promise<void> {
  await jsonBinClient().put(
    `${JSONBIN_BASE}`,
    { tips },
    {
      headers: { "X-Master-Key": JSONBIN_API_KEY!, "Content-Type": "application/json" },
    }
  );
}

// ---- Lokálne úložisko (záloha, ak JSONBin nie je nastavený - napr. pri lokálnom vývoji) ----

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

// ---- Spoločné funkcie - použijú JSONBin, ak je nastavený, inak lokálny súbor ----

async function readAll(): Promise<SavedTip[]> {
  return useJsonBin ? readAllRemote() : readAllLocal();
}

async function writeAll(tips: SavedTip[]): Promise<void> {
  if (useJsonBin) {
    await writeAllRemote(tips);
  } else {
    writeAllLocal(tips);
  }
}

/**
 * Poistka proti súbežným zápisom: ak by appka aj web (alebo dve rýchle
 * akcie po sebe) chceli zapisovať naraz, mohlo by dôjsť k tomu, že jeden
 * zápis prepíše ten druhý (lebo obaja si najprv prečítajú ten istý "starý"
 * stav). Táto fronta zaručí, že sa vždy vykoná najprv jedno kompletné
 * čítanie+zápis, až potom ďalšie - nikdy naraz.
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
export async function deleteTip(id: string): Promise<void> {
  await withWriteLock(async () => {
    const tips = await readAll();
    const target = tips.find((t) => t.id === id);
    if (!target || target.status !== "pending") return;
    await writeAll(tips.filter((t) => t.id !== id));
  });
}

/** Vymaže úplne všetky uložené tipy (aj vyhodnotené) - použiteľné na kompletný reštart histórie. */
export async function clearAllTips(): Promise<void> {
  await withWriteLock(async () => {
    await writeAll([]);
  });
}
