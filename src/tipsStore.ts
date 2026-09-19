import * as fs from "fs";
import * as path from "path";
import { SavedTip } from "./types";

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE_PATH = path.join(DATA_DIR, "tips.json");

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readAll(): SavedTip[] {
  try {
    const raw = fs.readFileSync(FILE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeAll(tips: SavedTip[]): void {
  ensureDataDir();
  fs.writeFileSync(FILE_PATH, JSON.stringify(tips, null, 2), "utf-8");
}

export function saveTip(tip: SavedTip): void {
  const tips = readAll();
  tips.unshift(tip);
  writeAll(tips);
}

export function listTips(): SavedTip[] {
  return readAll();
}

export function updateTip(id: string, updates: Partial<SavedTip>): void {
  const tips = readAll();
  const idx = tips.findIndex((t) => t.id === id);
  if (idx >= 0) {
    tips[idx] = { ...tips[idx], ...updates };
    writeAll(tips);
  }
}

/** Zmaže tip len ak je ešte "pending" - už vyhodnotené tipy (won/lost/void) sa nedajú zmazať, aby zostala história presná. */
export function deleteTip(id: string): void {
  const tips = readAll();
  const target = tips.find((t) => t.id === id);
  if (!target || target.status !== "pending") return;
  writeAll(tips.filter((t) => t.id !== id));
}

/** Vymaže úplne všetky uložené tipy (aj vyhodnotené) - použiteľné na kompletný reštart histórie. */
export function clearAllTips(): void {
  writeAll([]);
}
