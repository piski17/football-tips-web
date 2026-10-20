import { addActiveMonths, PAY_TERMS, Term, isTerm } from "./payments";
import { MemberPeriod, Subscriber } from "./types";

// Garancia: ak obdobie členstva (Silver 1, Gold 3, Platinum 6 mesiacov) skončí v strate,
// člen dostane 1 mesiac zadarmo. Mesiac zadarmo sa už do garancie nepočíta.

/** Koľko predošlých období si pri členovi pamätáme (stačí na vyhodnotenie za posledných 60 dní). */
const KEEP_PAST = 6;

/** Dĺžka členstva člena (staršie záznamy bez dĺžky: group = 6 mesiacov, inak 1 mesiac). */
export function memberTerm(s: Subscriber): Term {
  if (isTerm(s.length)) return s.length;
  return s.tier === "group" ? "season" : "m1";
}

/**
 * Začiatok obdobia, ktoré končí `end` a trvá `months` aktívnych mesiacov (opak addActiveMonths,
 * jún a júl sa nepočítajú). Hľadá najneskorší deň, od ktorého obdobie siaha aspoň po `end`.
 */
export function periodStartBefore(end: Date, months: number): Date {
  const DAY = 24 * 3600 * 1000;
  let cand = new Date(end.getTime() - (months * 31 + 62) * DAY);
  for (let guard = 0; guard < 400; guard++) {
    const next = new Date(cand.getTime() + DAY);
    if (addActiveMonths(next, months).getTime() > end.getTime()) break;
    cand = next;
  }
  return cand;
}

/** Začiatok aktuálneho obdobia: uložený, inak dátum začiatku (ak sedí s koncom), inak dopočítaný od konca. */
export function currentPeriodStart(s: Subscriber): string {
  if (s.periodStart) return s.periodStart;
  const months = PAY_TERMS[memberTerm(s)].months ?? 1;
  const end = new Date(s.nextPaymentDue);
  if (s.startDate) {
    const fromStart = addActiveMonths(new Date(s.startDate), months);
    if (Math.abs(fromStart.getTime() - end.getTime()) <= 2 * 24 * 3600 * 1000) return s.startDate;
  }
  return periodStartBefore(end, months).toISOString();
}

/** Všetky známe obdobia člena (predošlé aj aktuálne), najstaršie prvé. */
export function memberPeriods(s: Subscriber): MemberPeriod[] {
  const current: MemberPeriod = { start: currentPeriodStart(s), end: s.nextPaymentDue, ...(s.freePeriod ? { free: true } : {}) };
  return [...(s.pastPeriods ?? []), current];
}

/**
 * Úpravy člena pri novom období (predĺženie, platba, mesiac zadarmo): doterajšie obdobie sa presunie
 * medzi predošlé, aby sa dalo vyhodnotiť aj neskôr, a začne nové.
 */
export function newPeriodUpdates(s: Subscriber, periodStart: string, periodEnd: string, free = false): Partial<Subscriber> {
  const prev: MemberPeriod = { start: currentPeriodStart(s), end: s.nextPaymentDue, ...(s.freePeriod ? { free: true } : {}) };
  const past = [...(s.pastPeriods ?? []).filter((p) => p.start !== prev.start), prev].slice(-KEEP_PAST);
  return { pastPeriods: past, periodStart, nextPaymentDue: periodEnd, freePeriod: free };
}
