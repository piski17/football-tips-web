import { SavedTip } from "./types";
import { ShadowEntry } from "./shadowStore";
import { marketCategory, MarketAdjustments } from "./predictor";

// Zdravie trhov (21. 10. 2026, Michalovo rozhodnutie – body 3 a 4 z návrhu):
//  - Vypnutie slabého trhu: keď má trh aspoň 30 vyhodnotených tipov a za posledných
//    najviac 50 je bez zisku a bez lepšieho uzatváracieho kurzu, prestane sa odporúčať.
//    Jeho tipy sa ďalej potichu zapisujú (tichá evidencia, kód „market_disabled“) a keď
//    sa trhu znova darí, zapne sa sám. Michal dostane o zmene správu na Telegram.
//  - Oprava presnosti: od 50 vyhodnotených tipov trhu sa percentá trhu opravia podľa
//    toho, ako často tipy naozaj vyšli: p' = 50 + k × (p − 50). Dovtedy sa k len ukazuje.
// Na tipy, ktoré už boli odoslané, to nemá vplyv.

export const DISABLE_MIN_TIPS = 30;
export const DISABLE_WINDOW = 50;
export const CALIBRATION_MIN_TIPS = 50;
const CALIBRATION_WINDOW = 100;
/** Kým nie je dosť tipov, odhad sa ťahá k tomu, čo model sľuboval (váha 50 tipov). */
const CALIBRATION_PRIOR = 50;
const CALIBRATION_MIN_K = 0.75;
const CALIBRATION_MAX_K = 1.05; // nahor opatrne – vyššie percentá by pustili viac tipov
/** Uzatvárací kurz sa posudzuje až od 10 tipov so zisteným kurzom pred výkopom. */
const CLV_MIN_COUNT = 10;

export const CATEGORY_LABEL: Record<string, string> = {
  goly: "Góly",
  goly_timu: "Góly tímu",
  rohy: "Rohy",
  rohy_timu: "Rohy tímu",
  karty: "Karty",
  karty_timu: "Karty tímu",
  strely: "Strely na bránu",
  strely_timu: "Strely na bránu tímu",
  fauly: "Fauly",
  fauly_timu: "Fauly tímu",
  goly_1p: "Góly v 1. polčase",
  goly_2p: "Góly v 2. polčase",
  karty_1p: "Karty v 1. polčase",
  karty_2p: "Karty v 2. polčase",
  drzanie_lopty: "Držanie lopty",
};

/**
 * CLV jedného tipu v % (20. 10. 2026). Ak sú pri uložení aj pred výkopom kurzy oboch
 * strán, porovnávajú sa pravdepodobnosti bez marže (zmena marže sa neráta ako pohyb
 * trhu): (pravdepodobnosť pred výkopom / pri uložení − 1) × 100. Inak ako doteraz kurzy:
 * (kurz pri uložení / kurz pred výkopom − 1) × 100. Kladné = trh sa posunul k nášmu tipu.
 */
export const CLV_TIE = 0.5; // |CLV| pod 0,5 % = bez zmeny
export function clvOf(x: {
  open: number | null | undefined;
  closingOdds?: number | null;
  marketProb?: number | null;
  marketProbDevig?: boolean;
  closingMarketProb?: number | null;
  closingDevig?: boolean;
}): { clv: number; method: "prob" | "price" } | null {
  if (
    x.marketProbDevig &&
    x.closingDevig &&
    typeof x.marketProb === "number" &&
    x.marketProb > 0 &&
    typeof x.closingMarketProb === "number" &&
    x.closingMarketProb > 0
  )
    return { clv: (x.closingMarketProb / x.marketProb - 1) * 100, method: "prob" };
  if (typeof x.open === "number" && x.open > 1 && typeof x.closingOdds === "number" && x.closingOdds > 1)
    return { clv: (x.open / x.closingOdds - 1) * 100, method: "price" };
  return null;
}

/** Jeden vyhodnotený záznam trhu – odoslaný tip alebo tip vypnutého trhu z tichej evidencie. */
interface MarketRecord {
  time: number;
  won: boolean;
  odds: number | null;
  clv: number | null;
  /** Pravdepodobnosť pred opravou presnosti (len odoslané tipy so známou dôverou). */
  rawProb: number | null;
  sent: boolean;
}

export interface MarketHealthRow {
  category: string;
  label: string;
  /** Odoslané vyhodnotené tipy (celkovo). */
  tips: number;
  won: number;
  /** Posledných ≤ 50 záznamov (aj tipy vypnutého trhu z tichej evidencie). */
  window: number;
  windowProfit: number;
  windowRoi: number | null;
  clvCount: number;
  avgClv: number | null;
  disabled: boolean;
  disabledReason: string | null;
  /** Oprava presnosti: model sľuboval → naozaj vyšlo (posledných ≤ 100 tipov so známou dôverou). */
  calTips: number;
  promised: number | null;
  actual: number | null;
  k: number | null;
  calibrationActive: boolean;
}

export interface MarketHealth {
  rows: MarketHealthRow[];
  adjustments: MarketAdjustments;
  thresholds: { disableMin: number; disableWindow: number; calibrationMin: number };
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const fmt = (x: number, d = 1) => x.toFixed(d).replace(".", ",");
const signed = (x: number, d = 1) => `${x >= 0 ? "+" : "−"}${fmt(Math.abs(x), d)}`;

/** Odoslané tipy, ktoré sa rátajú (bez tiketov, „len sledovať“ a starých trhov). */
function countedTip(t: SavedTip): boolean {
  return !t.watchOnly && !(t.legs && t.legs.length) && (t.status === "won" || t.status === "lost") && marketCategory(t.market) !== null;
}

export function computeMarketHealth(tips: SavedTip[], shadow: ShadowEntry[]): MarketHealth {
  const records = new Map<string, MarketRecord[]>();
  const push = (cat: string, r: MarketRecord) => records.set(cat, [...(records.get(cat) ?? []), r]);
  for (const t of tips) {
    if (!countedTip(t)) continue;
    const cat = marketCategory(t.market)!;
    const odds = typeof t.odds === "number" && t.odds > 1 ? t.odds : null;
    const c = clvOf({ ...t, open: t.apiOdds ?? t.odds });
    const known = typeof t.probability === "number" && !t.probabilityEstimated && !t.restoredFromDaily && !t.manualEntry;
    const k = typeof t.marketCalibration === "number" && t.marketCalibration > 0 ? t.marketCalibration : 1;
    push(cat, {
      time: new Date(t.matchDate).getTime() || 0,
      won: t.status === "won",
      odds,
      clv: c ? c.clv : null,
      rawProb: known ? 50 + (t.probability - 50) / k : null,
      sent: true,
    });
  }
  // Tipy vypnutého trhu z tichej evidencie – aby sa trh mohol sám znova zapnúť.
  for (const e of shadow) {
    if (e.reasonCode !== "market_disabled" || (e.status !== "won" && e.status !== "lost")) continue;
    const cat = marketCategory(e.market);
    if (!cat) continue;
    const c = clvOf({ ...e, open: e.odds });
    push(cat, {
      time: new Date(e.matchDate).getTime() || 0,
      won: e.status === "won",
      odds: typeof e.odds === "number" && e.odds > 1 ? e.odds : null,
      clv: c ? c.clv : null,
      rawProb: null,
      sent: false,
    });
  }

  const rows: MarketHealthRow[] = [];
  const disabled: Record<string, string> = {};
  const calibration: Record<string, number> = {};
  for (const [category, list] of records) {
    list.sort((a, b) => b.time - a.time);
    const sent = list.filter((r) => r.sent);
    const win = list.filter((r) => r.odds !== null).slice(0, DISABLE_WINDOW);
    const profit = win.reduce((a, r) => a + (r.won ? r.odds! - 1 : -1), 0);
    const clvs = win.map((r) => r.clv).filter((v): v is number => v !== null);
    const avgClv = clvs.length ? clvs.reduce((a, b) => a + b, 0) / clvs.length : null;
    const clvBad = clvs.length < CLV_MIN_COUNT || (avgClv ?? 0) <= 0;
    const isDisabled = win.length >= DISABLE_MIN_TIPS && profit <= 0 && clvBad;
    const reason = isDisabled
      ? `posledných ${win.length} tipov ${signed(profit)} j.` + (clvs.length >= CLV_MIN_COUNT ? `, uzatvárací kurz ${signed(avgClv!)} %` : "")
      : null;
    if (isDisabled) disabled[category] = reason!;

    const cal = sent.filter((r) => r.rawProb !== null).slice(0, CALIBRATION_WINDOW);
    const promised = cal.length ? cal.reduce((a, r) => a + r.rawProb!, 0) / cal.length : null;
    const actual = cal.length ? (cal.filter((r) => r.won).length / cal.length) * 100 : null;
    let k: number | null = null;
    if (promised !== null && actual !== null && promised - 50 >= 5) {
      const adj = (cal.length * actual + CALIBRATION_PRIOR * promised) / (cal.length + CALIBRATION_PRIOR);
      k = Math.round(Math.min(CALIBRATION_MAX_K, Math.max(CALIBRATION_MIN_K, (adj - 50) / (promised - 50))) * 100) / 100;
      if (Math.abs(k - 1) < 0.03) k = 1;
    }
    const calibrationActive = cal.length >= CALIBRATION_MIN_TIPS && k !== null && k !== 1;
    if (calibrationActive) calibration[category] = k!;

    rows.push({
      category,
      label: CATEGORY_LABEL[category] ?? category,
      tips: sent.length,
      won: sent.filter((r) => r.won).length,
      window: win.length,
      windowProfit: r1(profit),
      windowRoi: win.length ? r1((profit / win.length) * 100) : null,
      clvCount: clvs.length,
      avgClv: avgClv === null ? null : r1(avgClv),
      disabled: isDisabled,
      disabledReason: reason,
      calTips: cal.length,
      promised: promised === null ? null : r1(promised),
      actual: actual === null ? null : r1(actual),
      k,
      calibrationActive,
    });
  }
  rows.sort((a, b) => b.tips - a.tips || a.label.localeCompare(b.label));
  return {
    rows,
    adjustments: { disabled, calibration },
    thresholds: { disableMin: DISABLE_MIN_TIPS, disableWindow: DISABLE_WINDOW, calibrationMin: CALIBRATION_MIN_TIPS },
  };
}

/** Text správy pre administrátora o zmenách oproti minulému stavu (null = bez zmeny). */
export function marketChangesText(
  prev: MarketAdjustments | null,
  next: MarketAdjustments,
  rows: MarketHealthRow[]
): string | null {
  const label = (c: string) => CATEGORY_LABEL[c] ?? c;
  const lines: string[] = [];
  const pd = prev?.disabled ?? {}, nd = next.disabled ?? {};
  for (const c of Object.keys(nd)) if (!pd[c]) lines.push(`⛔ <b>${label(c)}</b> sa dočasne neodporúča: ${nd[c]}.`);
  for (const c of Object.keys(pd)) if (!nd[c]) lines.push(`✅ <b>${label(c)}</b> sa znova odporúča – trhu sa opäť darí.`);
  const pc = prev?.calibration ?? {}, nc = next.calibration ?? {};
  for (const c of Object.keys(nc)) {
    if (pc[c] === nc[c]) continue;
    const row = rows.find((r) => r.category === c);
    const info = row && row.promised !== null && row.actual !== null ? ` (model sľuboval ${fmt(row.promised, 0)} %, vyšlo ${fmt(row.actual, 0)} % z ${row.calTips} tipov)` : "";
    lines.push(
      pc[c] === undefined
        ? `🎯 <b>${label(c)}</b>: zapnutá oprava presnosti, koeficient ${fmt(nc[c], 2)}${info}.`
        : `🎯 <b>${label(c)}</b>: oprava presnosti ${fmt(pc[c], 2)} → ${fmt(nc[c], 2)}${info}.`
    );
  }
  for (const c of Object.keys(pc)) if (nc[c] === undefined) lines.push(`🎯 <b>${label(c)}</b>: oprava presnosti už netreba, percentá sedia.`);
  return lines.length ? `🛠 <b>Model – automatická úprava trhov</b>\n\n${lines.join("\n")}\n\n<i>Podrobnosti: appka → Mesačný súhrn → Model.</i>` : null;
}
