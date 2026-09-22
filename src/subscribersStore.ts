import axios from "axios";
import axiosRetry from "axios-retry";
import { Subscriber } from "./types";

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

const SUBSCRIBERS_KEY = "tipradar_subscribers";

function upstashClient() {
  const instance = axios.create({ timeout: 20000 });
  axiosRetry(instance, {
    retries: 2,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) =>
      axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response?.status === 429,
  });
  return instance;
}

async function readAllRemote(): Promise<Subscriber[]> {
  const res = await upstashClient().get(`${UPSTASH_URL}/get/${SUBSCRIBERS_KEY}`, {
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

async function writeAllRemote(subscribers: Subscriber[]): Promise<void> {
  await upstashClient().post(`${UPSTASH_URL}/set/${SUBSCRIBERS_KEY}`, JSON.stringify(subscribers), {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "text/plain" },
  });
}

// Lokálne úložisko (záloha, ak Upstash nie je nastavený - napr. pri lokálnom vývoji)
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE_PATH = path.join(DATA_DIR, "subscribers.json");

function readAllLocal(): Subscriber[] {
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function writeAllLocal(subscribers: Subscriber[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE_PATH, JSON.stringify(subscribers, null, 2), "utf-8");
}

async function readAll(): Promise<Subscriber[]> {
  return useUpstash ? readAllRemote() : readAllLocal();
}

async function writeAll(subscribers: Subscriber[]): Promise<void> {
  if (useUpstash) {
    await writeAllRemote(subscribers);
  } else {
    writeAllLocal(subscribers);
  }
}

// Rovnaká poistka proti súbežným zápisom ako pri tipoch.
let writeQueue: Promise<unknown> = Promise.resolve();
function withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(operation, operation);
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function listSubscribers(): Promise<Subscriber[]> {
  return readAll();
}

export async function addSubscriber(subscriber: Subscriber): Promise<void> {
  await withWriteLock(async () => {
    const subscribers = await readAll();
    subscribers.unshift(subscriber);
    await writeAll(subscribers);
  });
}

export async function updateSubscriber(id: string, updates: Partial<Subscriber>): Promise<void> {
  await withWriteLock(async () => {
    const subscribers = await readAll();
    const idx = subscribers.findIndex((s) => s.id === id);
    if (idx >= 0) {
      subscribers[idx] = { ...subscribers[idx], ...updates };
      await writeAll(subscribers);
    }
  });
}

export async function deleteSubscriber(id: string): Promise<void> {
  await withWriteLock(async () => {
    const subscribers = await readAll();
    await writeAll(subscribers.filter((s) => s.id !== id));
  });
}
