import { SavedTip } from "./types";

/**
 * Virtuálny bank (24. 11. 2026, Michal): zadá počiatočný bank a percento vkladu, appka na každý tip
 * pre klientov „vsadí“ toto percento z aktuálneho banku a po vyhodnotení bank prepočíta.
 * Nič sa nestavia naozaj – Michal tipy podáva ručne podľa vypočítanej sumy.
 *
 * Vklad je PEVNÝ – % z počiatočného banku (24. 11. 2026 18:05, Michal: zisk sa do vkladu nepridáva).
 */
export interface VirtualBankSettings {
  /** Počiatočný bank v eurách. */
  start: number;
  /** Vklad na jeden tip v % z aktuálneho banku. */
  pct: number;
  /** Od ktorého dňa (YYYY-MM-DD, slovenský čas) sa tipy rátajú. */
  from: string;
  /** Kedy bolo nastavenie uložené. */
  savedAt?: string;
}

export const VIRTUAL_BANK_META = "virtual_bank";

export function defaultBankSettings(today: string): VirtualBankSettings {
  return { start: 1000, pct: 3, from: today };
}

export function parseBankSettings(raw: string | null, today: string): { settings: VirtualBankSettings; saved: boolean } {
  if (!raw) return { settings: defaultBankSettings(today), saved: false };
  try {
    const s = JSON.parse(raw);
    const v = validBankSettings(s);
    if (v) return { settings: { ...v, savedAt: typeof s.savedAt === "string" ? s.savedAt : undefined }, saved: true };
  } catch { /* poškodené – predvolené */ }
  return { settings: defaultBankSettings(today), saved: false };
}

export function validBankSettings(s: any): VirtualBankSettings | null {
  const start = Number(s?.start);
  const pct = Number(s?.pct);
  const from = String(s?.from ?? "");
  if (!(start >= 10 && start <= 1_000_000)) return null;
  if (!(pct >= 0.5 && pct <= 20)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;
  return { start: Math.round(start * 100) / 100, pct: Math.round(pct * 100) / 100, from };
}

/** Vklad zaokrúhlený na celé eurá (ručné podanie), aspoň 1 €. */
export function stakeFor(bank: number, pct: number): number {
  if (bank < 1) return 0;
  return Math.max(1, Math.round((bank * pct) / 100));
}

/** Pevný vklad: % z POČIATOČNÉHO banku; ak by bank klesol pod vklad, vsadí sa len to, čo ostalo. */
export function flatStake(bank: number, settings: VirtualBankSettings): number {
  return Math.min(stakeFor(settings.start, settings.pct), Math.floor(bank));
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface BankTipRow {
  id: string;
  time: number;
  match: string;
  bet: string;
  odds: number | null;
  status: SavedTip["status"];
  stake: number;
  /** Zisk / strata v eurách (null = čaká na výsledok alebo bez kurzu). */
  profit: number | null;
  noOdds?: boolean;
}

export interface BankDay {
  day: string;
  bankStart: number;
  stake: number;
  bankEnd: number;
  profit: number;
  won: number;
  lost: number;
  voided: number;
  pending: number;
  tips: BankTipRow[];
}

export function computeVirtualBank(
  tips: SavedTip[],
  settings: VirtualBankSettings,
  today: string,
  dayOf: (t: SavedTip) => string | null,
  kickOf: (t: SavedTip) => number,
  describe: (t: SavedTip) => { match: string; bet: string }
) {
  const inRange = tips
    .map((t) => ({ t, day: dayOf(t) ?? "" }))
    .filter((x) => x.day && x.day >= settings.from)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : kickOf(a.t) - kickOf(b.t)));
  const byDay = new Map<string, SavedTip[]>();
  for (const x of inRange) {
    if (!byDay.has(x.day)) byDay.set(x.day, []);
    byDay.get(x.day)!.push(x.t);
  }
  let bank = settings.start;
  let peak = bank;
  let maxDrop = 0; // najväčší pokles z vrcholu v eurách
  let staked = 0;
  let won = 0, lost = 0, voided = 0, pending = 0, noOdds = 0;
  let units = 0;
  const days: BankDay[] = [];
  const series: { day: string; bank: number }[] = [{ day: settings.from, bank: r2(bank) }];
  for (const [day, list] of byDay) {
    const bankStart = bank;
    // 24. 11. 2026 18:05 (Michal): vklad len z počiatočného banku – zisk sa do vkladu nepridáva (pevný vklad).
    const stake = flatStake(bankStart, settings);
    let profit = 0;
    const d: BankDay = { day, bankStart: r2(bankStart), stake, bankEnd: 0, profit: 0, won: 0, lost: 0, voided: 0, pending: 0, tips: [] };
    for (const t of list) {
      const odds = typeof t.odds === "number" && t.odds > 1 ? t.odds : null;
      const desc = describe(t);
      let p: number | null = null;
      if (!odds) {
        noOdds++;
      } else if (t.status === "won") {
        p = stake * (odds - 1);
        d.won++; won++; units += odds - 1;
      } else if (t.status === "lost") {
        p = -stake;
        d.lost++; lost++; units -= 1;
      } else if (t.status === "void") {
        p = 0;
        d.voided++; voided++;
      } else {
        d.pending++; pending++;
      }
      if (odds && (t.status === "won" || t.status === "lost")) staked += stake;
      if (p !== null) profit += p;
      d.tips.push({ id: t.id, time: kickOf(t), ...desc, odds, status: t.status, stake: odds ? stake : 0, profit: p === null ? null : r2(p), ...(odds ? {} : { noOdds: true }) });
    }
    bank = Math.max(0, bankStart + profit);
    d.profit = r2(profit);
    d.bankEnd = r2(bank);
    days.push(d);
    // Bod grafu len za dni, ktoré už majú aspoň jeden výsledok.
    if (d.won + d.lost + d.voided > 0) series.push({ day, bank: r2(bank) });
    peak = Math.max(peak, bank);
    maxDrop = Math.max(maxDrop, peak - bank);
  }
  const todayDay = days.find((d) => d.day === today);
  return {
    settings,
    today,
    bank: r2(bank),
    profit: r2(bank - settings.start),
    units: r2(units),
    staked: r2(staked),
    peak: r2(peak),
    maxDrop: r2(maxDrop),
    won, lost, voided, pending, noOdds,
    /** Vklad na jeden tip, ak by dnešné tipy ešte len prišli (z aktuálneho banku). */
    nextStake: todayDay ? todayDay.stake : flatStake(bank, settings),
    todayTips: todayDay ? todayDay.tips : [],
    series,
    days: days.slice().reverse(),
  };
}
