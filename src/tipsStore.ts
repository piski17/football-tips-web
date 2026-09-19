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
  const instance = axios.create({ timeout: 15000 });
  // Automaticky zopakuje požiadavku pri krátkodobom výpadku siete, aby jeden
  // prechodný problém nespôsobil stratu alebo neúplné uloženie tipov.
  axiosRetry(instance, {
    retries: 4,
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
  const res = await jsonBinClient().get(`${JSONBIN_BASE}/latest`, {
    headers: { "X-Master-Key": JSONBIN_API_KEY!, "X-Bin-Meta": "false" },
  });
  return Array.isArray(res.data) ? res.data : [];
}

async function writeAllRemote(tips: SavedTip[]): Promise<void> {
  await jsonBinClient().put(`${JSONBIN_BASE}`, tips, {
    headers: { "X-Master-Key": JSONBIN_API_KEY!, "Content-Type": "application/json" },
  });
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

export async function saveTip(tip: SavedTip): Promise<void> {
  const tips = await readAll();
  tips.unshift(tip);
  await writeAll(tips);
}

export async function listTips(): Promise<SavedTip[]> {
  return readAll();
}

export async function updateTip(id: string, updates: Partial<SavedTip>): Promise<void> {
  const tips = await readAll();
  const idx = tips.findIndex((t) => t.id === id);
  if (idx >= 0) {
    tips[idx] = { ...tips[idx], ...updates };
    await writeAll(tips);
  }
}

/** Zmaže tip len ak je ešte "pending" - už vyhodnotené tipy (won/lost/void) sa nedajú zmazať, aby zostala história presná. */
export async function deleteTip(id: string): Promise<void> {
  const tips = await readAll();
  const target = tips.find((t) => t.id === id);
  if (!target || target.status !== "pending") return;
  await writeAll(tips.filter((t) => t.id !== id));
}

/** Vymaže úplne všetky uložené tipy (aj vyhodnotené) - použiteľné na kompletný reštart histórie. */
export async function clearAllTips(): Promise<void> {
  await writeAll([]);
}
