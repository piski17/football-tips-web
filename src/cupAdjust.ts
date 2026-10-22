import { getLeagueAverages, getRecentGoalsAnyCompetition, TeamExtendedStatsAverages } from "./apiClient";
import { LeagueAverages, TeamStatistics } from "./types";

/**
 * Sila domácich líg pre Ligu majstrov a Európsku ligu (22. 10. 2026, Michalovo rozhodnutie).
 * Približné koeficienty UEFA (Anglicko = 100), kľúč = ID ligy v API-Football.
 * Tím, ktorý strieľa veľa gólov v slabšej lige, ich proti tímu zo silnejšej ligy strelí menej.
 */
export const LEAGUE_STRENGTH: Record<number, number> = {
  39: 100, // Anglicko
  135: 96, // Taliansko
  140: 93, // Španielsko
  78: 88, // Nemecko
  61: 73, // Francúzsko
  88: 64, // Holandsko
  94: 62, // Portugalsko
  144: 55, // Belgicko
  203: 46, // Turecko
  345: 44, // Česko
  197: 41, // Grécko
  103: 40, // Nórsko
  218: 37, // Rakúsko
  106: 37, // Poľsko
  119: 35, // Dánsko
  207: 35, // Švajčiarsko
  179: 34, // Škótsko
  210: 32, // Chorvátsko
  383: 30, // Izrael
  318: 30, // Cyprus
  113: 30, // Švédsko
  286: 30, // Srbsko
  271: 26, // Maďarsko
  333: 26, // Ukrajina
  283: 25, // Rumunsko
  373: 23, // Slovinsko
  332: 22, // Slovensko
  172: 21, // Bulharsko
};
/** Liga mimo tabuľky (menšie krajiny) – berie sa ako slabšia. */
const UNKNOWN_LEAGUE_STRENGTH = 18;
/** Koľko rozdiel síl líg mení góly: útok aj obrana po 0,225 → očakávané góly o (pomer síl)^0,45. */
const STRENGTH_EXPONENT = 0.225;

export function leagueStrength(leagueId: number | null): number | null {
  if (leagueId == null) return null;
  return LEAGUE_STRENGTH[leagueId] ?? UNKNOWN_LEAGUE_STRENGTH;
}

/** Liga majstrov, Európska liga */
export const CUP_LEAGUE_IDS = [2, 3];

type Goals = NonNullable<Awaited<ReturnType<typeof getRecentGoalsAnyCompetition>>>;

export interface CupGoalsResult {
  homeStats: TeamStatistics;
  awayStats: TeamStatistics;
  homeExt: TeamExtendedStatsAverages;
  awayExt: TeamExtendedStatsAverages;
  homeOk: boolean;
  awayOk: boolean;
  /** Krátke vysvetlenie pre analýzu (null, ak sa sila líg nepoužila). */
  note: string | null;
}

/**
 * Góly v LM a EL: posledných 10 zápasov tímu vo všetkých súťažiach (hlavne domáca liga),
 * prepočítané na úroveň pohára – najprv voči priemeru vlastnej ligy, potom podľa sily líg.
 * Rovnaký výpočet používa analýza aj spätný test.
 */
export async function applyCupGoals(
  homeId: number,
  awayId: number,
  season: number,
  cupAvg: LeagueAverages,
  homeStats: TeamStatistics,
  awayStats: TeamStatistics,
  homeExt: TeamExtendedStatsAverages,
  awayExt: TeamExtendedStatsAverages,
  asOf?: string
): Promise<CupGoalsResult> {
  const [hg, ag] = await Promise.all([
    getRecentGoalsAnyCompetition(homeId, 10, asOf),
    getRecentGoalsAnyCompetition(awayId, 10, asOf),
  ]);
  const domAvg = async (g: Goals | null): Promise<LeagueAverages | null> => {
    if (!g?.domesticLeagueId) return null;
    const a = await getLeagueAverages(g.domesticLeagueId, season).catch(() => null);
    return a && a.home > 0 && a.away > 0 ? a : null;
  };
  const [hAvg, aAvg] = await Promise.all([domAvg(hg), domAvg(ag)]);

  // Sila líg: len keď poznáme domácu ligu oboch tímov.
  const sh = leagueStrength(hg?.domesticLeagueId ?? null);
  const sa = leagueStrength(ag?.domesticLeagueId ?? null);
  const f = sh != null && sa != null ? Math.pow(sh / sa, STRENGTH_EXPONENT) : 1;

  // Prepočet z úrovne domácej ligy na úroveň pohára (ak priemer ligy nie je, bez prepočtu).
  const cupH = cupAvg.home || 0;
  const cupA = cupAvg.away || 0;
  const level = (cup: number, dom: number | undefined) => (cup > 0 && dom && dom > 0 ? cup / dom : 1);

  const build = (st: TeamStatistics, g: Goals, dom: LeagueAverages | null, strength: number) => {
    // góly za tím doma sú „domáce“ góly ligy, inkasované doma sú „hosťujúce“ a naopak
    const kFor = { home: level(cupH, dom?.home) * strength, away: level(cupA, dom?.away) * strength };
    const kAg = { home: level(cupA, dom?.away) / strength, away: level(cupH, dom?.home) / strength };
    const avg = (sum: number, n: number) => (n > 0 ? sum / n : 0);
    const forH = avg(g.for.home, g.played.home) * kFor.home;
    const forA = avg(g.for.away, g.played.away) * kFor.away;
    const agH = avg(g.against.home, g.played.home) * kAg.home;
    const agA = avg(g.against.away, g.played.away) * kAg.away;
    const tot = (h: number, a: number) => (g.played.total > 0 ? (h * g.played.home + a * g.played.away) / g.played.total : 0);
    const forT = tot(forH, forA);
    const agT = tot(agH, agA);
    const stats: TeamStatistics = {
      ...st,
      fixtures: { ...st.fixtures, played: g.played },
      goals: {
        for: { total: g.for, average: { home: forH, away: forA, total: forT } },
        against: { total: g.against, average: { home: agH, away: agA, total: agT } },
      },
    };
    return { stats, forT, agT };
  };

  let { homeStats: hs, awayStats: as } = { homeStats, awayStats };
  let he = homeExt;
  let ae = awayExt;
  // Forma podľa gólov z tých istých (prepočítaných) zápasov – inak by ju dvíhali gólové pohárové zápasy.
  if (hg) {
    const b = build(homeStats, hg, hAvg, f);
    hs = b.stats;
    he = { ...homeExt, goalsFor: b.forT, goalsAgainst: b.agT, goalsGames: hg.played.total };
  }
  if (ag) {
    const b = build(awayStats, ag, aAvg, 1 / f);
    as = b.stats;
    ae = { ...awayExt, goalsFor: b.forT, goalsAgainst: b.agT, goalsGames: ag.played.total };
  }
  const pct = (x: number) => `${x >= 1 ? "+" : "−"}${Math.abs(Math.round((x - 1) * 100))} %`;
  const note = hg && ag && f !== 1
    ? `Sila líg: domáci ${sh}, hostia ${sa} (Anglicko = 100) – góly domácich ${pct(f * f)}, hostí ${pct(1 / (f * f))}.`
    : null;
  return { homeStats: hs, awayStats: as, homeExt: he, awayExt: ae, homeOk: !!hg, awayOk: !!ag, note };
}
