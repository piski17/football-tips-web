import { addActiveMonths, PAY_TERMS, Term, isTerm } from "./payments";
import { MemberPeriod, SavedTip, Subscriber } from "./types";

// Členstvo (od 28. 10. 2026): Gold 100 tipov, Onyx 250 tipov. Každému členovi sa počítajú tipy od dňa nákupu;
// členstvo skončí po poslednom tipe (bez časovej platnosti).
// Garancia: ak členstvo skončí v strate, člen dostane 1 mesiac zadarmo – všetky tipy počas mesiaca, bez počtu
// (na mesiac zadarmo sa garancia už nevzťahuje). Staré balíčky mali 30 tipov zadarmo.
// Staré balíčky (Štart / Gold / Onyx, 27. – 28. 10. 2026) sa počítajú rovnako, staršie časové členstvá
// (Gold 50 dní, Onyx 6 mesiacov) po dňoch.

/** Koľko predošlých období si pri členovi pamätáme (stačí na vyhodnotenie za posledných 60 dní). */
const KEEP_PAST = 6;

/** Dĺžka členstva / balíček člena (staršie záznamy bez dĺžky: group = 6 mesiacov, inak Gold 50 dní). */
export function memberTerm(s: Subscriber): Term {
  if (isTerm(s.length)) return s.length;
  return s.tier === "group" ? "season" : "m1";
}

/** Počet tipov v aktuálnom balíčku člena (null = staré časové členstvo bez počtu tipov). */
export function memberTips(s: Subscriber): number | null {
  if (typeof s.tips === "number" && s.tips > 0) return s.tips;
  return PAY_TERMS[memberTerm(s)].tips ?? null;
}

/**
 * Začiatok obdobia, ktoré končí `end` a trvá `months` aktívnych mesiacov (opak addActiveMonths,
 * jún a júl sa nepočítajú). Hľadá najneskorší deň, od ktorého obdobie siaha aspoň po `end`.
 */
export function periodStartBefore(end: Date, months: number, days?: number): Date {
  const DAY = 24 * 3600 * 1000;
  let cand = new Date(end.getTime() - ((days ?? months * 31) + 62) * DAY);
  for (let guard = 0; guard < 400; guard++) {
    const next = new Date(cand.getTime() + DAY);
    if (addActiveMonths(next, months, days).getTime() > end.getTime()) break;
    cand = next;
  }
  return cand;
}

/** Začiatok aktuálneho obdobia: uložený, inak dátum začiatku (ak sedí s koncom), inak dopočítaný od konca. */
export function currentPeriodStart(s: Subscriber): string {
  if (s.periodStart) return s.periodStart;
  const months = PAY_TERMS[memberTerm(s)].months ?? 1;
  const days = PAY_TERMS[memberTerm(s)].days;
  const end = new Date(s.nextPaymentDue);
  if (s.startDate) {
    const fromStart = addActiveMonths(new Date(s.startDate), months, days);
    if (Math.abs(fromStart.getTime() - end.getTime()) <= 2 * 24 * 3600 * 1000) return s.startDate;
  }
  return periodStartBefore(end, months, days).toISOString();
}

/** Všetky známe obdobia člena (predošlé aj aktuálne), najstaršie prvé. */
export function memberPeriods(s: Subscriber): MemberPeriod[] {
  return [...(s.pastPeriods ?? []), currentPeriod(s)];
}

function currentPeriod(s: Subscriber): MemberPeriod {
  const tips = s.freeMonth ? null : memberTips(s);
  return { start: currentPeriodStart(s), end: s.nextPaymentDue, ...(s.freePeriod ? { free: true } : {}), ...(tips ? { tips } : {}) };
}

/**
 * Úpravy člena pri novom období (predĺženie, platba, mesiac zadarmo): doterajšie obdobie sa presunie
 * medzi predošlé, aby sa dalo vyhodnotiť aj neskôr, a začne nové.
 */
export function newPeriodUpdates(s: Subscriber, periodStart: string, periodEnd: string, free = false, tips?: number): Partial<Subscriber> {
  const prev = currentPeriod(s);
  const past = [...(s.pastPeriods ?? []).filter((p) => p.start !== prev.start), prev].slice(-KEEP_PAST);
  return { pastPeriods: past, periodStart, nextPaymentDue: periodEnd, freePeriod: free, freeMonth: free && !tips, ...(tips ? { tips } : {}) };
}

// ---- Počítanie tipov v balíčkoch ----

/** Čas tipu = výkop zápasu (pri tikete posledný zápas). */
export function tipTime(t: SavedTip): number | null {
  const dates = t.legs && t.legs.length > 0 ? t.legs.map((l) => l.matchDate) : [t.matchDate];
  const times = dates.map((d) => new Date(d).getTime()).filter((n) => !isNaN(n));
  return times.length ? Math.max(...times) : null;
}

export interface PeriodUsage {
  period: MemberPeriod;
  /** Tipy, ktoré patria do tohto obdobia (pri balíčku najviac `period.tips`). */
  tips: SavedTip[];
  /** Počet tipov v balíčku (null = staré časové členstvo). */
  total: number | null;
  used: number;
  left: number | null;
  pending: number;
  /** Balíček je skončený: všetky tipy použité a vyhodnotené, alebo uplynula platnosť. */
  ended: boolean;
  /** Kedy balíček skončil (výkop posledného tipu alebo koniec platnosti). */
  endedAt: string | null;
}

/**
 * Rozdelí zverejnené tipy do období člena. Tip patrí do prvého obdobia, ktoré už začalo,
 * ešte neskončila jeho platnosť a nie je plné. Zrušené tipy (void) sa nerátajú.
 * `inLegacyWindow` rozhodne pri starých časových členstvách (bez počtu tipov), či tip patrí do obdobia.
 */
export function periodUsage(
  s: Subscriber,
  tips: SavedTip[],
  inLegacyWindow: (t: SavedTip, p: MemberPeriod) => boolean,
  now = Date.now()
): PeriodUsage[] {
  const periods = memberPeriods(s);
  const buckets: SavedTip[][] = periods.map(() => []);
  const sorted = tips
    .filter((t) => t.status !== "void")
    .map((t) => ({ t, at: tipTime(t) }))
    .filter((x): x is { t: SavedTip; at: number } => x.at !== null)
    .sort((a, b) => a.at - b.at);
  for (const { t, at } of sorted) {
    for (let i = 0; i < periods.length; i++) {
      const p = periods[i];
      if (p.tips) {
        if (at < new Date(p.start).getTime() || at > new Date(p.end).getTime() || buckets[i].length >= p.tips) continue;
      } else if (!inLegacyWindow(t, p)) continue;
      buckets[i].push(t);
      break;
    }
  }
  return periods.map((p, i) => {
    const list = buckets[i];
    const total = p.tips ?? null;
    const pending = list.filter((t) => t.status === "pending").length;
    const endMs = new Date(p.end).getTime();
    const full = total !== null && list.length >= total;
    const ended = endMs < now || (full && pending === 0);
    let endedAt: string | null = null;
    if (full && pending === 0) endedAt = new Date(tipTime(list[list.length - 1]) ?? endMs).toISOString();
    else if (endMs < now) endedAt = p.end;
    return { period: p, tips: list, total, used: list.length, left: total === null ? null : Math.max(0, total - list.length), pending, ended, endedAt };
  });
}
