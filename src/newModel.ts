import { TeamExtendedStatsAverages, VenueStats, RestInfo } from "./apiClient";
import { ModelVariant } from "./predictor";

// Nový model (21. 10. 2026, Michalovo rozhodnutie): vstupy pre druhý, tichý výpočet.
// Body 1, 2 a 5 z návrhu – xG, únava a rotácia, priemery doma / vonku. Tipy ďalej vyberá
// súčasný model, kým sa nový v porovnaní (blendStore, spätný test) neukáže presnejší
// a nezapne sa prepínačom v appke.

/** Rovnaké ako mixStat v server.ts: vlastný priemer tímu a to, čo dovoľuje súper. */
export function mixStat(own: number | null | undefined, opponentAllows: number | null | undefined): number | null {
  if (own == null) return opponentAllows ?? null;
  if (opponentAllows == null) return own;
  return (own + opponentAllows) / 2;
}

/**
 * Nový model (25. 10. 2026): štatistika zápasu voči priemeru (ako pri góloch: sila × slabosť súpera),
 * nie len priemer dvoch čísel. Silný tím proti slabému tak dostane viac, slabší proti silnému menej.
 * Priemer „ligy" sa odhadne zo štyroch čísel oboch tímov; pomery sú ohraničené (0,6 – 1,6).
 */
function pairRel(
  homeOwn: number | null, awayAllows: number | null, awayOwn: number | null, homeAllows: number | null
): [number | null, number | null] {
  if (homeOwn == null || awayAllows == null || awayOwn == null || homeAllows == null)
    return [mixStat(homeOwn, awayAllows), mixStat(awayOwn, homeAllows)];
  const avg = (homeOwn + awayAllows + awayOwn + homeAllows) / 4;
  if (!(avg > 0)) return [mixStat(homeOwn, awayAllows), mixStat(awayOwn, homeAllows)];
  const r = (x: number) => Math.min(1.6, Math.max(0.6, x / avg));
  return [avg * r(homeOwn) * r(awayAllows), avg * r(awayOwn) * r(homeAllows)];
}

/**
 * Priemer len z domácich (alebo vonkajších) zápasov, vyrovnaný s celkovým priemerom –
 * z 10 zápasov je doma zvyčajne len ~5, celkový priemer preto váži ako 3 zápasy.
 */
const VENUE_PRIOR_GAMES = 3;
function venueAvg(v: VenueStats | undefined, key: keyof Omit<VenueStats, "games">, overall: number | null | undefined): number | null {
  const val = v?.[key];
  if (val == null || !v?.games) return overall ?? null;
  if (overall == null) return val;
  return (val * v.games + overall * VENUE_PRIOR_GAMES) / (v.games + VENUE_PRIOR_GAMES);
}

export interface NewModelInputs {
  homeCorners: number | null;
  awayCorners: number | null;
  extra: {
    homeShotsOnGoal: number | null;
    awayShotsOnGoal: number | null;
    homeFouls: number | null;
    awayFouls: number | null;
    homeOffsides: number | null;
    awayOffsides: number | null;
    homePossession: number | null;
    awayPossession: number | null;
    homeCards: number | null;
    awayCards: number | null;
  };
  variant: ModelVariant;
}

/** Vstupy nového modelu: domáci tím podľa svojich zápasov doma, hostia podľa zápasov vonku. */
export function newModelInputs(
  homeExt: TeamExtendedStatsAverages,
  awayExt: TeamExtendedStatsAverages,
  restHome: RestInfo | null,
  restAway: RestInfo | null
): NewModelInputs {
  const h = homeExt.venueHome, a = awayExt.venueAway;
  const hv = (key: keyof Omit<VenueStats, "games">) => venueAvg(h, key, (homeExt as any)[key]);
  const av = (key: keyof Omit<VenueStats, "games">) => venueAvg(a, key, (awayExt as any)[key]);
  const [homeCorners, awayCorners] = pairRel(hv("corners"), av("cornersAgainst"), av("corners"), hv("cornersAgainst"));
  const [homeShots, awayShots] = pairRel(hv("shotsOnGoal"), av("shotsOnGoalAgainst"), av("shotsOnGoal"), hv("shotsOnGoalAgainst"));
  const [homeFouls, awayFouls] = pairRel(hv("fouls"), av("foulsAgainst"), av("fouls"), hv("foulsAgainst"));
  const [homeCards, awayCards] = pairRel(hv("cards"), av("cardsAgainst"), av("cards"), hv("cardsAgainst"));
  return {
    homeCorners,
    awayCorners,
    extra: {
      homeShotsOnGoal: homeShots,
      awayShotsOnGoal: awayShots,
      homeFouls,
      awayFouls,
      homeOffsides: mixStat(homeExt.offsides, awayExt.offsidesAgainst),
      awayOffsides: mixStat(awayExt.offsides, homeExt.offsidesAgainst),
      homePossession: homeExt.possession,
      awayPossession: awayExt.possession,
      homeCards,
      awayCards,
    },
    variant: {
      xg: {
        homeFor: homeExt.xgRatioFor ?? null,
        homeAgainst: homeExt.xgRatioAgainst ?? null,
        awayFor: awayExt.xgRatioFor ?? null,
        awayAgainst: awayExt.xgRatioAgainst ?? null,
      },
      rest: { home: restHome, away: restAway },
    },
  };
}
