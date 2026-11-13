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
// 8. 11. 2026: zoznam tipov sa drží v pamäti (ako text) – predtým sa celý sťahoval z Upstash pri každej
// akcii a minul sa mesačný prenos dát. Zapisuje len tento server, takže pri zápise sa pamäť obnoví.
let rawCache: { at: number; raw: string | null } | null = null;
const RAW_TTL = 30 * 60 * 1000;
async function readAllRemote(): Promise<SavedTip[]> {
  let raw: string | null;
  if (rawCache && Date.now() - rawCache.at < RAW_TTL) raw = rawCache.raw;
  else {
    const res = await upstashClient().get(`${UPSTASH_URL}/get/${TIPS_KEY}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    raw = res.data?.result ?? null;
    rawCache = { at: Date.now(), raw };
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAllRemote(tips: SavedTip[]): Promise<void> {
  const raw = JSON.stringify(tips);
  rawCache = null;
  await upstashClient().post(`${UPSTASH_URL}/set/${TIPS_KEY}`, raw, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "text/plain" },
  });
  rawCache = { at: Date.now(), raw };
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

/**
 * 5. 11. 2026 (Michal): návrat – tipy, ktoré 4. 11. presunul moveLateAddsOnce (lateMoved), sa raz vrátia do štatistík,
 * ale LEN ak by prešli klientom podľa dnešných pravidiel (pass). Ostatné ostávajú v sledovaných. Nič sa nemaže.
 */
const LATE_RESTORE_KEY = "tipradar_migr_late_restore_done";
export async function restoreLateMovedOnce(pass: (t: SavedTip) => boolean): Promise<{ restored: number; kept: number }> {
  if (!useUpstash) return { restored: 0, kept: 0 };
  const auth = { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } };
  const done = (await upstashClient().get(`${UPSTASH_URL}/get/${LATE_RESTORE_KEY}`, auth)).data?.result;
  if (done) return { restored: 0, kept: 0 };
  return withWriteLock(async () => {
    const tips = await readAll();
    let restored = 0;
    let kept = 0;
    for (const t of tips) {
      if (!t.lateMoved || !t.lateAdd || !t.watchOnly) continue;
      if (pass(t)) {
        t.watchOnly = undefined;
        t.lateMoved = undefined;
        t.lateRestored = true;
        restored++;
      } else kept++;
    }
    if (restored) await writeAll(tips);
    await upstashClient().post(`${UPSTASH_URL}/set/${LATE_RESTORE_KEY}`, new Date().toISOString(), {
      headers: { ...auth.headers, "Content-Type": "text/plain" },
    });
    return { restored, kept };
  });
}
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

/**
 * 6. 11. 2026 (Michal): klientom stačí 70 / 30, kontrola 60 / 40 sa len zapisuje. Beží raz pri štarte:
 * tipy v sledovaných, ktoré tam boli LEN kvôli 60 / 40 (strictFail / retroStrict, nie pásmo 65 – 69 %) a podľa
 * dnešných pravidiel by prešli klientom (pass), sa vrátia do štatistík. Ostanú označené strictWouldFail
 * (porovnanie 1. 12.) a strictReturned. Nič sa nemaže. Návrat: tipom so strictReturned dať watchOnly + strictFail.
 */
// 13. 11. 2026 (Michal): 60 / 40 vypnutá druhýkrát (aj spätne) – nový príznak, aby migrácia znova prebehla.
const STRICT_OFF_KEY = "tipradar_migr_strict_off_done_v3";
export async function returnStrictFailedOnce(
  pass: (t: SavedTip) => boolean,
  typeOf?: (market: string) => string | null,
): Promise<{ returned: number; kept: number }> {
  if (!useUpstash) return { returned: 0, kept: 0 };
  const auth = { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } };
  const done = (await upstashClient().get(`${UPSTASH_URL}/get/${STRICT_OFF_KEY}`, auth)).data?.result;
  if (done) return { returned: 0, kept: 0 };
  return withWriteLock(async () => {
    const tips = await readAll();
    let returned = 0;
    let kept = 0;
    // Najviac 1 tip z typu na zápas (8. 11. 2026) – vrátený tip nesmie pridať druhý tip rovnakého typu.
    const taken = new Set<string>();
    const keyOf = (t: SavedTip) => { const ty = typeOf && t.fixtureId ? typeOf(t.market) : null; return ty ? `${t.fixtureId}|${ty}` : ""; };
    for (const t of tips) if (!t.watchOnly && !(t.legs && t.legs.length)) { const k = keyOf(t); if (k) taken.add(k); }
    const cands = tips
      .filter((t) => t.watchOnly && (t.strictFail || t.retroStrict) && !t.watchBand && !t.manualEntry && !(t.legs && t.legs.length))
      .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0));
    for (const t of cands) {
      const k = keyOf(t);
      if (pass(t) && !(k && taken.has(k))) {
        if (k) taken.add(k);
        t.watchOnly = undefined;
        t.strictFail = undefined;
        t.retroStrict = undefined;
        t.lateMoved = undefined;
        t.strictWouldFail = true;
        t.strictReturned = true;
        returned++;
      } else kept++;
    }
    if (returned) await writeAll(tips);
    await upstashClient().post(`${UPSTASH_URL}/set/${STRICT_OFF_KEY}`, new Date().toISOString(), {
      headers: { ...auth.headers, "Content-Type": "text/plain" },
    });
    return { returned, kept };
  });
}

/**
 * 6. 11. 2026 18:23 (Michal): kontrola 60 / 40 znova zapnutá. Beží raz pri štarte: tipy vrátené pri jej vypnutí
 * (strictReturned) a zverejnené tipy uložené počas vypnutia, ktoré by 60 / 40 neprešli (strictWouldFail),
 * idú späť do sledovaných (skupina 60 / 40). Nič sa nemaže.
 */
const STRICT_ON_KEY = "tipradar_migr_strict_on_done_v3"; // 13. 11. 2026: nový príznak pre prípadné opätovné zapnutie
export async function moveStrictFailedBackOnce(): Promise<number> {
  if (!useUpstash) return 0;
  const auth = { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } };
  const done = (await upstashClient().get(`${UPSTASH_URL}/get/${STRICT_ON_KEY}`, auth)).data?.result;
  if (done) return 0;
  return withWriteLock(async () => {
    const tips = await readAll();
    let moved = 0;
    for (const t of tips) {
      if ((t.legs && t.legs.length) || t.watchOnly) continue;
      if (!t.strictReturned && !t.strictWouldFail) continue;
      t.watchOnly = true;
      t.strictFail = true;
      t.strictReturned = undefined;
      t.strictWouldFail = undefined;
      t.strongOfDay = undefined;
      moved++;
    }
    if (moved) await writeAll(tips);
    await upstashClient().post(`${UPSTASH_URL}/set/${STRICT_ON_KEY}`, new Date().toISOString(), {
      headers: { ...auth.headers, "Content-Type": "text/plain" },
    });
    return moved;
  });
}

/**
 * 12. 11. 2026 (Michal, skúška pásma 65 – 80 %): pri zapnutej skúške raz vráti sledované tipy z pásma 65 – 69 %
 * (watchBand) do štatistík – len tie, ktoré prejdú všetkými pravidlami vrátane kontroly 60 / 40 (ok) a zápas
 * ešte nemá v štatistikách tip rovnakého typu. Ostatné ostávajú v sledovaných. Značka band65Returned.
 * Pri vypnutej skúške presunie band65Returned aj nové band65Trial späť do sledovaných (watchBand). Nič sa nemaže.
 */
const BAND65_KEY = "tipradar_migr_band65_done";
export async function syncBand65Trial(
  on: boolean,
  ok: (t: SavedTip) => boolean,
  typeOf: (market: string) => string | null,
): Promise<{ returned: number; kept: number; movedBack: number }> {
  const res = { returned: 0, kept: 0, movedBack: 0 };
  if (!useUpstash) return res;
  const auth = { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } };
  const done = (await upstashClient().get(`${UPSTASH_URL}/get/${BAND65_KEY}`, auth)).data?.result;
  if (on && done) return res;
  return withWriteLock(async () => {
    const tips = await readAll();
    if (on) {
      const taken = new Set<string>();
      for (const t of tips) {
        if ((t.legs && t.legs.length) || t.watchOnly || !t.fixtureId) continue;
        const type = typeOf(t.market);
        if (type) taken.add(`${t.fixtureId}|${type}`);
      }
      const cands = tips
        .filter((t) => !(t.legs && t.legs.length) && t.watchOnly && t.watchBand && !t.manualEntry && !t.strictFail && !t.retroStrict && !t.lateMoved)
        .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0));
      for (const t of cands) {
        const type = t.fixtureId ? typeOf(t.market) : null;
        const key = type ? `${t.fixtureId}|${type}` : "";
        if (!ok(t) || (key && taken.has(key))) { res.kept++; continue; }
        if (key) taken.add(key);
        t.watchOnly = undefined;
        t.band65Returned = true;
        res.returned++;
      }
      if (res.returned) await writeAll(tips);
      await upstashClient().post(`${UPSTASH_URL}/set/${BAND65_KEY}`, new Date().toISOString(), {
        headers: { ...auth.headers, "Content-Type": "text/plain" },
      });
    } else {
      for (const t of tips) {
        if (!t.band65Returned && !t.band65Trial) continue;
        if (t.watchOnly) continue;
        t.watchOnly = true;
        t.watchBand = true;
        t.strongOfDay = undefined;
        res.movedBack++;
      }
      if (res.movedBack) await writeAll(tips);
      if (done) await upstashClient().get(`${UPSTASH_URL}/del/${BAND65_KEY}`, auth);
    }
    return res;
  });
}

/**
 * 8. 11. 2026 (Michal): späť na „najviac 1 tip z typu na zápas“ (karty + karty domácich + karty hostí = jeden typ).
 * Beží raz pri štarte: zo zverejnených tipov (nie sledované, nie tikety) jedného zápasu a jedného typu ostane
 * v štatistikách len tip s najvyššou dôverou (pri zhode vyššia hodnota, potom skôr uložený); ostatné idú do
 * sledovaných so značkou sameTypeMoved. Nič sa nemaže. Návrat: tipom so sameTypeMoved zrušiť watchOnly.
 */
const SAME_TYPE_KEY = "tipradar_migr_same_type_done";
export async function moveSameTypeOnce(typeOf: (market: string) => string | null): Promise<number> {
  if (!useUpstash) return 0;
  const auth = { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } };
  const done = (await upstashClient().get(`${UPSTASH_URL}/get/${SAME_TYPE_KEY}`, auth)).data?.result;
  if (done) return 0;
  return withWriteLock(async () => {
    const tips = await readAll();
    const groups = new Map<string, SavedTip[]>();
    for (const t of tips) {
      if ((t.legs && t.legs.length) || t.watchOnly || !t.fixtureId) continue;
      const type = typeOf(t.market);
      if (!type) continue;
      const key = `${t.fixtureId}|${type}`;
      const g = groups.get(key);
      if (g) g.push(t); else groups.set(key, [t]);
    }
    const ev = (t: SavedTip) => (typeof t.probability === "number" && typeof t.odds === "number" ? (t.probability / 100) * t.odds : 0);
    let moved = 0;
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      g.sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0) || ev(b) - ev(a) || String(a.savedAt).localeCompare(String(b.savedAt)));
      for (const t of g.slice(1)) {
        t.watchOnly = true;
        t.sameTypeMoved = true;
        t.strongOfDay = undefined;
        moved++;
      }
    }
    if (moved) await writeAll(tips);
    await upstashClient().post(`${UPSTASH_URL}/set/${SAME_TYPE_KEY}`, new Date().toISOString(), {
      headers: { ...auth.headers, "Content-Type": "text/plain" },
    });
    return moved;
  });
}

/**
 * 8. 11. 2026 (Michal): staré tipy na fauly (pred novým nastavením hraníc faulov podľa zápasu) sa nerátajú do štatistík –
 * raz pri štarte idú do sledovaných so značkou oldFoulsMoved. Týka sa len tipov so zápasom pred 8. 11. 2026. Nič sa nemaže.
 */
const OLD_FOULS_KEY = "tipradar_migr_old_fouls_done";
export async function moveOldFoulTipsOnce(): Promise<number> {
  if (!useUpstash) return 0;
  const auth = { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } };
  const done = (await upstashClient().get(`${UPSTASH_URL}/get/${OLD_FOULS_KEY}`, auth)).data?.result;
  if (done) return 0;
  return withWriteLock(async () => {
    const tips = await readAll();
    const cutoff = new Date("2026-11-08T00:00:00Z").getTime();
    let moved = 0;
    for (const t of tips) {
      if ((t.legs && t.legs.length) || t.watchOnly || !String(t.market || "").startsWith("Fauly")) continue;
      const d = new Date(t.matchDate).getTime();
      if (!(d < cutoff)) continue;
      t.watchOnly = true;
      t.oldFoulsMoved = true;
      t.strongOfDay = undefined;
      moved++;
    }
    if (moved) await writeAll(tips);
    await upstashClient().post(`${UPSTASH_URL}/set/${OLD_FOULS_KEY}`, new Date().toISOString(), {
      headers: { ...auth.headers, "Content-Type": "text/plain" },
    });
    return moved;
  });
}
