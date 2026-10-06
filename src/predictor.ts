import {
  MarketOdds,
  findOdds,
  marketProbability,
  offeredLines,
  MIN_EXPECTED_VALUE,
  MIN_ODDS,
  SUSPICIOUS_EXPECTED_VALUE,
  MIN_GAMES_FOR_TRUST,
} from "./oddsMatcher";
import {
  Fixture,
  TeamStatistics,
  HeadToHeadMatch,
  LeagueAverages,
  TeamGoalPriorsResult,
  PredictionWeights,
  OutcomeProbabilities,
  PredictionResult,
  MarketPick,
  OverUnderMarket,
  PlayerGoalPrediction,
  RawPlayerStat, H2HStats } from "./types";

// Predvolené váhy jednotlivých faktorov pri výsledku zápasu (1/X/2).
// Pokus z 5. 10. 2026 (len Poisson s korekciou remíz, bez formy a vzájomných
// zápasov) vyšiel v spätnom teste horšie (chyba 24,4 oproti 22,9) – model ešte
// viac preceňoval favoritov. Zmes s formou a vzájomnými zápasmi ostáva.
export const DEFAULT_WEIGHTS: PredictionWeights = {
  poisson: 0.65,
  form: 0.22,
  h2h: 0.13,
};

/** Pôvodné váhy – pre porovnanie v spätnom teste (rovnaké ako DEFAULT_WEIGHTS). */
export const LEGACY_WEIGHTS: PredictionWeights = DEFAULT_WEIGHTS;

// Kalibrácia podľa dvoch spätných testov (5. 10. 2026, po ~150 zápasoch): začiatok
// sezóny (aug. – okt. 2026) a koniec sezóny (mar. – máj 2025). Odchýlka percent
// od 50 % sa zmenší koeficientom k: p' = 50 + k × (p − 50).
//  - MARKET_CALIBRATION: trhy, kde model preceňoval istotu v OBOCH testoch
//    (fauly 69 → 64 %, strely 59 → 52 %, rohy 58 → 51 %) – platí celú sezónu.
//  - EARLY_SEASON_CALIBRATION: trhy, kde model preceňoval len na začiatku sezóny
//    (góly 71 → 64 %, karty, „oba tímy skórujú"), no na konci sezóny sedel
//    (góly 69 → 70 %). Platí naplno do 5 odohraných zápasov, potom slabne a od
//    15 zápasov sa nepoužije. Pri „oba tímy skórujú" je to navyše k BTTS_SHRINK.
const MARKET_CALIBRATION: Record<string, number> = {
  strely: 0.5,
  fauly: 0.72,
  rohy: 0.6,
  // Rohy jedného tímu: zatiaľ rovnako ako rohy v zápase, kým ich nepreverí spätný test.
  rohy_timu: 0.6,
};
const EARLY_SEASON_CALIBRATION: Record<string, number> = {
  goly: 0.67,
  goly_timu: 0.67,
  karty: 0.5,
  btts: 0.5,
};
/** Koeficient kalibrácie pre trh pri danom počte odohraných zápasov v sezóne. */
function calibrationFactor(category: string, gamesPlayed: number): number {
  const early = clamp((15 - gamesPlayed) / 10, 0, 1);
  const ke = EARLY_SEASON_CALIBRATION[category] ?? 1;
  return (MARKET_CALIBRATION[category] ?? 1) * (1 - (1 - ke) * early);
}

/** Forma podľa gólov v posledných zápasoch (vážený priemer, novšie zápasy viac). */
export interface RecentGoals {
  goalsFor: number | null;
  goalsAgainst: number | null;
  games: number;
}
// Forma posunie očakávané góly približne o štvrtinu svojej odchýlky od sezóny
// (tím, ktorý v posledných zápasoch dáva o 40 % viac, dostane približne +9 %).
const FORM_WEIGHT = 0.25;
const FORM_MIN_GAMES = 5;
/** Pomer aktuálnej formy k sezónnemu priemeru (ohraničený, aby jeden výkyv nerozhodol). */
function formRatio(recent: number | null | undefined, seasonAvg: number, seasonGames: number, recentGames: number): number {
  if (recent == null || !isFinite(recent) || recentGames < FORM_MIN_GAMES || seasonGames < FORM_MIN_GAMES) return 1;
  return clamp(recent / Math.max(seasonAvg || 0, 0.3), 0.67, 1.5);
}

// Záložné hodnoty, ak by sa ligový priemer nepodarilo dopočítať (napr. začiatok sezóny bez dát).
const FALLBACK_LEAGUE_AVG_HOME_GOALS = 1.5;
const FALLBACK_LEAGUE_AVG_AWAY_GOALS = 1.15;

const MAX_GOALS = 7;

// Bežné bookmakerské hranice pre rohy a karty - dajú sa v budúcnosti spraviť konfigurovateľné.
const CORNERS_LINE = 9.5;
const CARDS_LINE = 3.5;
const SHOTS_ON_GOAL_LINE = 8.5;
const FOULS_LINE = 21.5;
const OFFSIDES_LINE = 3.5;

// Hranice, ktoré model skúša, keď stávkovky k zápasu ešte nemajú kurzy (a v spätnom
// teste). Keď kurzy sú, model vyhodnotí presne tie hranice, ktoré stávkovky ponúkajú.
const DEFAULT_LINES: Record<string, number[]> = {
  "Góly": [1.5, 2.5, 3.5],
  "Góly domácich": [0.5, 1.5, 2.5],
  "Góly hostí": [0.5, 1.5, 2.5],
  "Rohy": [8.5, 9.5, 10.5],
  "Rohy domácich": [3.5, 4.5, 5.5, 6.5],
  "Rohy hostí": [3.5, 4.5, 5.5, 6.5],
  "Karty": [3.5, 4.5],
  "Strely na bránu": [7.5, 8.5, 9.5],
  "Fauly": [20.5, 21.5, 22.5],
};

// Koľko "váhy" má ligový priemer oproti tímovým dátam na začiatku sezóny.
const SHRINKAGE_PRIOR_GAMES = 5;

function shrinkAverage(observed: number, gamesPlayed: number, leagueAvg: number): number {
  if (gamesPlayed <= 0) return leagueAvg;
  const weightObserved = gamesPlayed;
  const weightPrior = SHRINKAGE_PRIOR_GAMES;
  return (observed * weightObserved + leagueAvg * weightPrior) / (weightObserved + weightPrior);
}

function factorial(n: number): number {
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

/** Všeobecný Over/Under odhad z Poissonovho rozdelenia - použiteľný pre rohy aj karty. */
function poissonOverUnder(lambda: number, line: number, maxCount: number = 30): { over: number; under: number } {
  let underCumulative = 0;
  for (let k = 0; k <= Math.floor(line); k++) {
    underCumulative += poissonPmf(k, lambda);
  }
  const cappedUnder = Math.min(1, underCumulative);
  return { over: (1 - cappedUnder) * 100, under: cappedUnder * 100 };
}

/**
 * Nad/pod pre štatistiky, ktoré kolíšu viac, ako predpokladá Poissonovo
 * rozdelenie (karty, strely, ofsajdy). Negatívne binomické rozdelenie
 * s rozptylom = priemer × varRatio. Spätný test ukázal, že pri týchto trhoch
 * Poisson preceňoval istotu.
 */
function overdispersedOverUnder(mean: number, line: number, varRatio: number): { over: number; under: number } {
  if (!(mean > 0) || varRatio <= 1.0001) return poissonOverUnder(Math.max(mean, 0.01), line);
  const r = mean / (varRatio - 1);
  const p = r / (r + mean);
  let pmf = Math.pow(p, r);
  let under = 0;
  const maxK = Math.floor(line);
  for (let k = 0; k <= maxK; k++) {
    under += pmf;
    pmf = pmf * ((k + r) / (k + 1)) * (1 - p);
  }
  under = Math.min(1, Math.max(0, under)) * 100;
  return { over: 100 - under, under };
}
// Pomer rozptylu k priemeru (z väčšej nestability týchto štatistík).
const VAR_RATIO = { cards: 1.4, shotsOnGoal: 1.35, offsides: 1.3 };

/** Očakávané góly domáceho a hosťujúceho tímu na základe sily útoku/obrany a skutočného ligového priemeru. */
export function expectedGoals(
  home: TeamStatistics,
  away: TeamStatistics,
  leagueAvg: LeagueAverages,
  homePriorsResult?: TeamGoalPriorsResult | null,
  awayPriorsResult?: TeamGoalPriorsResult | null
): { home: number; away: number } {
  const avgHome = leagueAvg.home || FALLBACK_LEAGUE_AVG_HOME_GOALS;
  const avgAway = leagueAvg.away || FALLBACK_LEAGUE_AVG_AWAY_GOALS;

  const homePriors = homePriorsResult?.priors;
  const awayPriors = awayPriorsResult?.priors;

  const homeForBase = homePriors?.forHome ?? avgHome;
  const homeAgainstBase = homePriors?.againstHome ?? avgAway;
  const awayForBase = awayPriors?.forAway ?? avgAway;
  const awayAgainstBase = awayPriors?.againstAway ?? avgHome;

  const homeGoalsForAvg = shrinkAverage(home.goals.for.average.home, home.fixtures.played.home, homeForBase);
  const homeGoalsAgainstAvg = shrinkAverage(
    home.goals.against.average.home,
    home.fixtures.played.home,
    homeAgainstBase
  );
  const awayGoalsForAvg = shrinkAverage(away.goals.for.average.away, away.fixtures.played.away, awayForBase);
  const awayGoalsAgainstAvg = shrinkAverage(
    away.goals.against.average.away,
    away.fixtures.played.away,
    awayAgainstBase
  );

  const homeAttack = safeDiv(homeGoalsForAvg, avgHome);
  const awayDefense = safeDiv(awayGoalsAgainstAvg, avgAway);
  const awayAttack = safeDiv(awayGoalsForAvg, avgAway);
  const homeDefense = safeDiv(homeGoalsAgainstAvg, avgHome);

  const homeExpected = homeAttack * awayDefense * avgHome;
  const awayExpected = awayAttack * homeDefense * avgAway;

  return {
    home: clamp(homeExpected, 0.15, 5),
    away: clamp(awayExpected, 0.15, 5),
  };
}

function safeDiv(a: number, b: number): number {
  if (!b || Number.isNaN(a) || Number.isNaN(b)) return 1;
  return a / b;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function poissonOutcomes(
  homeExpected: number,
  awayExpected: number
): {
  probs: OutcomeProbabilities;
  over25: number;
  under25: number;
  over15: number;
  under15: number;
  over35: number;
  under35: number;
  bttsYes: number;
  bttsNo: number;
  homeCleanSheet: number;
  awayCleanSheet: number;
  correctScore: { home: number; away: number; probability: number };
  doubleChance: { oneX: number; xTwo: number; oneTwo: number };
} {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;
  let bttsYes = 0;
  let homeCleanSheet = 0; // súper (away) nedal gól
  let awayCleanSheet = 0; // súper (home) nedal gól
  let bestScoreProb = -1;
  let bestScoreHome = 0;
  let bestScoreAway = 0;

  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = poissonPmf(h, homeExpected) * poissonPmf(a, awayExpected);
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;

      if (h + a > 1) over15 += p;
      if (h + a > 2) over25 += p;
      if (h + a > 3) over35 += p;
      if (h > 0 && a > 0) bttsYes += p;
      if (a === 0) homeCleanSheet += p;
      if (h === 0) awayCleanSheet += p;

      if (p > bestScoreProb) {
        bestScoreProb = p;
        bestScoreHome = h;
        bestScoreAway = a;
      }
    }
  }

  const total = homeWin + draw + awayWin || 1;
  const probs: OutcomeProbabilities = {
    homeWin: (homeWin / total) * 100,
    draw: (draw / total) * 100,
    awayWin: (awayWin / total) * 100,
  };

  return {
    probs,
    over25: over25 * 100,
    under25: (1 - over25) * 100,
    over15: over15 * 100,
    under15: (1 - over15) * 100,
    over35: over35 * 100,
    under35: (1 - over35) * 100,
    bttsYes: bttsYes * 100,
    bttsNo: (1 - bttsYes) * 100,
    homeCleanSheet: homeCleanSheet * 100,
    awayCleanSheet: awayCleanSheet * 100,
    correctScore: { home: bestScoreHome, away: bestScoreAway, probability: bestScoreProb * 100 },
    doubleChance: {
      oneX: probs.homeWin + probs.draw,
      xTwo: probs.draw + probs.awayWin,
      oneTwo: probs.homeWin + probs.awayWin,
    },
  };
}

export function formToScore(form: string): number {
  if (!form) return 1.3;

  const matches = form.slice(-5).split("");
  const weights = [1, 1.5, 2, 2.5, 3].slice(-matches.length);
  let weightedSum = 0;
  let weightTotal = 0;

  matches.forEach((result, idx) => {
    const points = result === "W" ? 3 : result === "D" ? 1 : 0;
    const w = weights[idx];
    weightedSum += points * w;
    weightTotal += w;
  });

  return weightTotal > 0 ? weightedSum / weightTotal : 1.3;
}

function formOutcomes(homeScore: number, awayScore: number): OutcomeProbabilities {
  const diff = homeScore - awayScore;
  const shift = (2 / (1 + Math.exp(-diff)) - 1) * 25;

  let homeWin = 40 + shift;
  let awayWin = 32 - shift;
  let draw = 100 - homeWin - awayWin;

  return normalizeProbs({ homeWin, draw, awayWin });
}

/** Odhad pravdepodobností 1/X/2 z reálnej histórie vzájomných zápasov. */
function headToHeadOutcomes(
  h2h: HeadToHeadMatch[],
  homeTeamId: number
): { probs: OutcomeProbabilities; homeWins: number; draws: number; awayWins: number } {
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;

  for (const match of h2h) {
    if (match.homeGoals === null || match.awayGoals === null) continue;
    const homeTeamWasHome = match.homeTeamId === homeTeamId;
    const homeTeamGoals = homeTeamWasHome ? match.homeGoals : match.awayGoals;
    const awayTeamGoals = homeTeamWasHome ? match.awayGoals : match.homeGoals;

    if (homeTeamGoals > awayTeamGoals) homeWins++;
    else if (homeTeamGoals === awayTeamGoals) draws++;
    else awayWins++;
  }

  const consideredTotal = homeWins + draws + awayWins;
  if (consideredTotal === 0) {
    return { probs: { homeWin: 40, draw: 28, awayWin: 32 }, homeWins, draws, awayWins };
  }

  const smoothing = 1;
  const denom = consideredTotal + 3 * smoothing;
  return {
    probs: {
      homeWin: ((homeWins + smoothing) / denom) * 100,
      draw: ((draws + smoothing) / denom) * 100,
      awayWin: ((awayWins + smoothing) / denom) * 100,
    },
    homeWins,
    draws,
    awayWins,
  };
}

function normalizeProbs(p: OutcomeProbabilities): OutcomeProbabilities {
  const total = p.homeWin + p.draw + p.awayWin || 1;
  return {
    homeWin: (p.homeWin / total) * 100,
    draw: (p.draw / total) * 100,
    awayWin: (p.awayWin / total) * 100,
  };
}

function combineProbs(
  poisson: OutcomeProbabilities,
  form: OutcomeProbabilities,
  h2h: OutcomeProbabilities,
  weights: PredictionWeights
): OutcomeProbabilities {
  const combined: OutcomeProbabilities = {
    homeWin: poisson.homeWin * weights.poisson + form.homeWin * weights.form + h2h.homeWin * weights.h2h,
    draw: poisson.draw * weights.poisson + form.draw * weights.form + h2h.draw * weights.h2h,
    awayWin: poisson.awayWin * weights.poisson + form.awayWin * weights.form + h2h.awayWin * weights.h2h,
  };
  return normalizeProbs(combined);
}

function confidenceFromMargin(sorted: number[]): "nízka" | "stredná" | "vysoká" {
  const margin = sorted[0] - sorted[1];
  if (margin >= 20) return "vysoká";
  if (margin >= 10) return "stredná";
  return "nízka";
}

/** Distribučná funkcia normovaného normálneho rozdelenia (aproximácia, presnosť ~1e-7). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}


// ---- Vzájomné zápasy: doplnok k odhadu z dlhodobých priemerov ----
// Váha rastie s počtom zápasov (za posledných 10 rokov, najviac 5 najnovších):
// 3 zápasy = 15 %, 4 = 20 %, 5 = 25 %; menej ako 3 = nepoužijú sa.
// Novšie zápasy majú väčšiu váhu (každý starší × 0,85).
const H2H_MIN = 3;
function h2hWeight(n: number): number {
  return n >= 5 ? 0.25 : n === 4 ? 0.2 : n === 3 ? 0.15 : 0;
}
function recencyAverage(values: (number | null)[]): { avg: number; n: number } | null {
  let sum = 0, wsum = 0, n = 0;
  values.forEach((v, i) => {
    if (v === null || v === undefined || !isFinite(v)) return;
    const w = Math.pow(0.85, i);
    sum += v * w; wsum += w; n++;
  });
  return n >= H2H_MIN ? { avg: sum / wsum, n } : null;
}
interface H2HGoals { n: number; weight: number; home: number; away: number; total: number }
/** Vzájomné zápasy sa berú za posledných 10 rokov (reprezentácie sa stretávajú zriedka). */
const H2H_YEARS = 10;
function h2hRecent(h2h: HeadToHeadMatch[]): HeadToHeadMatch[] {
  const since = Date.now() - H2H_YEARS * 365 * 24 * 60 * 60 * 1000;
  return h2h
    .filter((m) => m.homeGoals !== null && m.awayGoals !== null && new Date(m.date).getTime() >= since)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);
}
function h2hGoals(h2h: HeadToHeadMatch[], homeTeamId: number): H2HGoals | null {
  const recent = h2hRecent(h2h)
  ;
  const home = recencyAverage(recent.map((m) => (m.homeTeamId === homeTeamId ? m.homeGoals : m.awayGoals)));
  const away = recencyAverage(recent.map((m) => (m.homeTeamId === homeTeamId ? m.awayGoals : m.homeGoals)));
  if (!home || !away) return null;
  return { n: home.n, weight: h2hWeight(home.n), home: home.avg, away: away.avg, total: home.avg + away.avg };
}
const fmt1 = (n: number) => n.toFixed(1).replace(".", ",");

/**
 * Rozdiel (v percentuálnych bodoch) medzi modelom a stávkovkami, od ktorého sa tip
 * pri málo dátach vyradí. Čím viac vzájomných zápasov model započítal, tým lepšie
 * pozná vzťah tímov a tým väčší rozdiel toleruje: bez nich 15, 3 – 4 zápasy 20, 5+ 25.
 */
/** Kategória tipu -> štatistika vzájomných zápasov, ktorú pre ňu model používa. */
const H2H_STAT_KEY: Record<string, keyof H2HStats> = {
  rohy: "corners",
  karty: "cards",
  strely: "shotsOnGoal",
  fauly: "fouls",
  ofsajdy: "offsides",
  drzanie_lopty: "homePossession",
};
function marketConflictLimit(h2hMatchesUsed: number): number {
  return h2hMatchesUsed >= 5 ? 25 : h2hMatchesUsed >= 3 ? 20 : 15;
}

export function predictMatch(
  fixture: Fixture,
  homeStats: TeamStatistics,
  awayStats: TeamStatistics,
  h2h: HeadToHeadMatch[],
  leagueAvg: LeagueAverages,
  weights: PredictionWeights = DEFAULT_WEIGHTS,
  homePriorsResult?: TeamGoalPriorsResult | null,
  awayPriorsResult?: TeamGoalPriorsResult | null,
  homeCornersAvg?: number | null,
  awayCornersAvg?: number | null,
  homePlayers?: RawPlayerStat[],
  awayPlayers?: RawPlayerStat[],
  homeLineupIds?: number[] | null,
  awayLineupIds?: number[] | null,
  extraStatsAvg?: {
    homeShotsOnGoal?: number | null;
    awayShotsOnGoal?: number | null;
    homeFouls?: number | null;
    awayFouls?: number | null;
    homeOffsides?: number | null;
    awayOffsides?: number | null;
    homePossession?: number | null;
    awayPossession?: number | null;
    homeCards?: number | null;
    awayCards?: number | null;
  },
  marketOdds?: MarketOdds[],
  h2hStats?: H2HStats[],
  recentGoals?: { home?: RecentGoals | null; away?: RecentGoals | null },
  /** true = pôvodný model (bez formy z gólov a bez kalibrácie trhov) – len pre spätný test. */
  legacy: boolean = false
): PredictionResult {
  const xg = expectedGoals(homeStats, awayStats, leagueAvg, homePriorsResult, awayPriorsResult);
  // Aktuálna forma podľa gólov: útok tímu v posledných zápasoch oproti sezóne
  // a to, koľko v nich dostáva súper.
  const rh = legacy ? null : recentGoals?.home;
  const ra = legacy ? null : recentGoals?.away;
  const homeAttackForm = formRatio(rh?.goalsFor, homeStats.goals.for.average.total, homeStats.fixtures.played.total, rh?.games ?? 0);
  const homeDefenseForm = formRatio(rh?.goalsAgainst, homeStats.goals.against.average.total, homeStats.fixtures.played.total, rh?.games ?? 0);
  const awayAttackForm = formRatio(ra?.goalsFor, awayStats.goals.for.average.total, awayStats.fixtures.played.total, ra?.games ?? 0);
  const awayDefenseForm = formRatio(ra?.goalsAgainst, awayStats.goals.against.average.total, awayStats.fixtures.played.total, ra?.games ?? 0);
  xg.home = clamp(xg.home * Math.pow(homeAttackForm * awayDefenseForm, FORM_WEIGHT), 0.15, 5);
  xg.away = clamp(xg.away * Math.pow(awayAttackForm * homeDefenseForm, FORM_WEIGHT), 0.15, 5);
  // Vzájomné zápasy spresnia očakávané góly (výsledok, góly, oba tímy skórujú…).
  const h2hG = h2hGoals(h2h, fixture.homeTeam.id);
  if (h2hG && h2hG.weight > 0) {
    xg.home = (1 - h2hG.weight) * xg.home + h2hG.weight * h2hG.home;
    xg.away = (1 - h2hG.weight) * xg.away + h2hG.weight * h2hG.away;
  }
  // Štatistiky vzájomných zápasov spresnia rohy, karty, strely, fauly, ofsajdy a držanie lopty.
  const h2hStat = (key: keyof H2HStats) => recencyAverage((h2hStats ?? []).map((x) => x[key]));
  const blendH2H = (expected: number, key: keyof H2HStats): { value: number; h2h: { avg: number; n: number } | null } => {
    const h = h2hStat(key);
    if (!h) return { value: expected, h2h: null };
    const w = h2hWeight(h.n);
    return { value: (1 - w) * expected + w * h.avg, h2h: h };
  };
  const h2hNotes: Record<string, string> = {};
  const poisson = poissonOutcomes(xg.home, xg.away);

  const homeFormScore = formToScore(homeStats.form);
  const awayFormScore = formToScore(awayStats.form);
  const formProbs = formOutcomes(homeFormScore, awayFormScore);

  const h2hResult = headToHeadOutcomes(h2h, fixture.homeTeam.id);

  const finalProbs = combineProbs(poisson.probs, formProbs, h2hResult.probs, weights);

  const sorted = [finalProbs.homeWin, finalProbs.draw, finalProbs.awayWin].slice().sort((a, b) => b - a);
  const confidence = confidenceFromMargin(sorted);

  let outcome: "1" | "X" | "2" = "X";
  let outcomeLabel = "Remíza";
  if (finalProbs.homeWin === sorted[0]) {
    outcome = "1";
    outcomeLabel = `Výhra ${fixture.homeTeam.name}`;
  } else if (finalProbs.awayWin === sorted[0]) {
    outcome = "2";
    outcomeLabel = `Výhra ${fixture.awayTeam.name}`;
  }

  const minGamesPlayed = Math.min(homeStats.fixtures.played.total, awayStats.fixtures.played.total);

  const describeHistory = (
    label: string,
    r?: TeamGoalPriorsResult | null
  ): string =>
    r ? `${label}: ${r.seasonsUsed}/${r.seasonsChecked} minulých sezón` : `${label}: žiadne historické dáta`;

  const sampleSizeWarning =
    minGamesPlayed < 6
      ? `Pozor: v tejto sezóne je odohraných len málo zápasov (min. ${minGamesPlayed}). Použité historické dáta – ${describeHistory(
          fixture.homeTeam.name,
          homePriorsResult
        )}, ${describeHistory(fixture.awayTeam.name, awayPriorsResult)}.`
      : undefined;

  // ---- Rohy (ak sú dáta k dispozícii) ----
  let corners: OverUnderMarket | undefined;
  if (homeCornersAvg != null && awayCornersAvg != null) {
    const b = blendH2H(homeCornersAvg + awayCornersAvg, "corners");
    const expected = b.value;
    if (b.h2h) h2hNotes.rohy = `Vo vzájomných zápasoch (${b.h2h.n}) padlo v priemere ${fmt1(b.h2h.avg)} rohov.`;
    const { over, under } = poissonOverUnder(expected, CORNERS_LINE);
    corners = { expected, line: CORNERS_LINE, over, under };
  }

  // ---- Karty (priemer oboch tímov spolu) ----
  // Prednostne z posledných 10 zápasov (s doplnením z minulej sezóny / iných súťaží).
  // Súhrn sezóny sa použije len pri aspoň 3 odohraných zápasoch oboch tímov – inak
  // (napr. začiatok sezóny) sa tip na karty radšej neponúkne.
  let cards: OverUnderMarket | undefined;
  const baseCards =
    extraStatsAvg?.homeCards != null && extraStatsAvg?.awayCards != null
      ? extraStatsAvg.homeCards + extraStatsAvg.awayCards
      : (homeStats.fixtures.played.total ?? 0) >= 3 && (awayStats.fixtures.played.total ?? 0) >= 3
        ? homeStats.cardsPerGame + awayStats.cardsPerGame
        : null;
  if (baseCards !== null && baseCards > 0) {
    const cardsBlend = blendH2H(baseCards, "cards");
    const expectedCards = cardsBlend.value;
    if (cardsBlend.h2h) h2hNotes.karty = `Vo vzájomných zápasoch (${cardsBlend.h2h.n}) padlo v priemere ${fmt1(cardsBlend.h2h.avg)} kariet.`;
    const cardsOU = overdispersedOverUnder(expectedCards, CARDS_LINE, VAR_RATIO.cards);
    cards = { expected: expectedCards, line: CARDS_LINE, ...cardsOU };
  }

  // ---- Strely na bránu (ak sú dáta k dispozícii) ----
  let shotsOnGoal: OverUnderMarket | undefined;
  if (extraStatsAvg?.homeShotsOnGoal != null && extraStatsAvg?.awayShotsOnGoal != null) {
    const b = blendH2H(extraStatsAvg.homeShotsOnGoal + extraStatsAvg.awayShotsOnGoal, "shotsOnGoal");
    const expected = b.value;
    if (b.h2h) h2hNotes.strely = `Vo vzájomných zápasoch (${b.h2h.n}) v priemere ${fmt1(b.h2h.avg)} striel na bránu.`;
    const { over, under } = overdispersedOverUnder(expected, SHOTS_ON_GOAL_LINE, VAR_RATIO.shotsOnGoal);
    shotsOnGoal = { expected, line: SHOTS_ON_GOAL_LINE, over, under };
  }

  // ---- Fauly (ak sú dáta k dispozícii) ----
  let fouls: OverUnderMarket | undefined;
  if (extraStatsAvg?.homeFouls != null && extraStatsAvg?.awayFouls != null) {
    const b = blendH2H(extraStatsAvg.homeFouls + extraStatsAvg.awayFouls, "fouls");
    const expected = b.value;
    if (b.h2h) h2hNotes.fauly = `Vo vzájomných zápasoch (${b.h2h.n}) v priemere ${fmt1(b.h2h.avg)} faulov.`;
    const { over, under } = poissonOverUnder(expected, FOULS_LINE);
    fouls = { expected, line: FOULS_LINE, over, under };
  }

  // ---- Ofsajdy (ak sú dáta k dispozícii) ----
  let offsides: OverUnderMarket | undefined;
  if (extraStatsAvg?.homeOffsides != null && extraStatsAvg?.awayOffsides != null) {
    const b = blendH2H(extraStatsAvg.homeOffsides + extraStatsAvg.awayOffsides, "offsides");
    const expected = b.value;
    if (b.h2h) h2hNotes.ofsajdy = `Vo vzájomných zápasoch (${b.h2h.n}) v priemere ${fmt1(b.h2h.avg)} ofsajdov.`;
    const { over, under } = overdispersedOverUnder(expected, OFFSIDES_LINE, VAR_RATIO.offsides);
    offsides = { expected, line: OFFSIDES_LINE, over, under };
  }

  // ---- Vysvetlenia ("prečo tento tip") pre jednotlivé skupiny trhov ----
  const homeFormText = homeStats.form ? `forma: ${homeStats.form} (skóre ${homeFormScore.toFixed(1)})` : "forma zatiaľ neznáma (odohraných 0 zápasov, použitý priemerný odhad)";
  const awayFormText = awayStats.form ? `forma: ${awayStats.form} (skóre ${awayFormScore.toFixed(1)})` : "forma zatiaľ neznáma (odohraných 0 zápasov, použitý priemerný odhad)";

  const recentLine = (name: string, r?: RecentGoals | null) =>
    r && r.games >= FORM_MIN_GAMES && r.goalsFor != null && r.goalsAgainst != null
      ? `${name} ${fmt1(r.goalsFor)}:${fmt1(r.goalsAgainst)}`
      : null;
  const recentParts = [recentLine(fixture.homeTeam.name, rh), recentLine(fixture.awayTeam.name, ra)].filter(Boolean);
  const recentGoalsText = recentParts.length
    ? ` Góly v posledných zápasoch (priemer, dané:dostané): ${recentParts.join(", ")}.`
    : "";

  const resultExplanation = `${fixture.homeTeam.name} ${homeFormText}, ${
    fixture.awayTeam.name
  } ${awayFormText}. Posledných ${h2hResult.homeWins + h2hResult.draws + h2hResult.awayWins} vzájomných zápasov: ${
    h2hResult.homeWins
  }-${h2hResult.draws}-${h2hResult.awayWins} (výhry domáci-remízy-výhry hostia). Očakávané góly ${xg.home.toFixed(
    1
  )}:${xg.away.toFixed(1)}.${recentGoalsText}`;

  const golyExplanation = `Očakávaný súčet gólov v zápase je ${(xg.home + xg.away).toFixed(1)} (${
    fixture.homeTeam.name
  } ${xg.home.toFixed(1)}, ${fixture.awayTeam.name} ${xg.away.toFixed(1)}).`;

  const bttsExplanation = `Očakávané góly: ${fixture.homeTeam.name} ${xg.home.toFixed(1)}, ${
    fixture.awayTeam.name
  } ${xg.away.toFixed(1)} – oba tímy majú reálnu šancu skórovať.`;

  const statExplanation = (expected: number, line: number): string =>
    `Priemer oboch tímov v tejto štatistike za posledné zápasy je ${expected.toFixed(
      1
    )}, oproti hranici ${line} ide o jasný rozdiel.`;


  // Každý kandidát má aj "kategóriu" - tipy z rovnakej kategórie sú si
  // navzájom podobné/prekrývajúce sa (napr. rôzne hranice gólov),
  // takže appka pri výbere viacerých tipov na zápas berie max. 1 z každej
  // kategórie, aby dostal rôznorodý, nie opakujúci sa výber.
  const candidates: MarketPick[] = [];

  candidates.push({ market: "Výsledok zápasu", selection: outcomeLabel, probability: sorted[0], category: "vysledok", explanation: resultExplanation });

  // Nad/pod: pri každom trhu všetky hranice, ktoré stávkovky ponúkajú (bez kurzov
  // predvolené hranice). Pri každej hranici ide do úvahy strana, ktorú model vidí ako
  // pravdepodobnejšiu; z jednej kategórie sa nakoniec vyberie hranica s najväčšou hodnotou.
  const hasOdds = !!marketOdds && marketOdds.length > 0;
  const linesFor = (market: string): number[] => {
    const offered = hasOdds ? offeredLines(marketOdds, market) : [];
    return offered.length ? offered : DEFAULT_LINES[market] ?? [];
  };
  const addOverUnder = (
    market: string,
    category: string,
    dist: (line: number) => { over: number; under: number },
    explain: (line: number) => string
  ) => {
    for (const line of linesFor(market)) {
      const { over, under } = dist(line);
      const isOver = over >= under;
      candidates.push({
        market,
        selection: `${isOver ? "Over" : "Under"} ${line}`,
        probability: isOver ? over : under,
        category,
        explanation: explain(line),
      });
    }
  };

  addOverUnder("Góly", "goly", (line) => poissonOverUnder(xg.home + xg.away, line), () => golyExplanation);
  // Góly jedného tímu: Poissonovo rozdelenie z očakávaných gólov tímu.
  // Z oboch tímov spolu najviac jeden tip (kategória „goly_timu“).
  addOverUnder("Góly domácich", "goly_timu", (line) => poissonOverUnder(xg.home, line), () =>
    `Očakávané góly ${fixture.homeTeam.name}: ${xg.home.toFixed(1)} (súper ${fixture.awayTeam.name} ${xg.away.toFixed(1)}).`
  );
  addOverUnder("Góly hostí", "goly_timu", (line) => poissonOverUnder(xg.away, line), () =>
    `Očakávané góly ${fixture.awayTeam.name}: ${xg.away.toFixed(1)} (súper ${fixture.homeTeam.name} ${xg.home.toFixed(1)}).`
  );

  // Kalibrácia podľa spätného testu (~106 zápasov): Poisson pri „oba tímy skórujú"
  // preceňoval istotu (model 62 %, realita 50 %) – nevidí, že zápasy s nulou na
  // jednej strane (0:0, 1:0, 2:0…) sú častejšie. Odchýlku od 50 % preto zmenšíme.
  const BTTS_SHRINK = 0.6;
  const bttsYesCal = 50 + BTTS_SHRINK * (poisson.bttsYes - 50);
  if (bttsYesCal >= 50) {
    candidates.push({ market: "Oba tímy skórujú", selection: "Áno", probability: bttsYesCal, category: "btts", explanation: bttsExplanation });
  } else {
    candidates.push({ market: "Oba tímy skórujú", selection: "Nie", probability: 100 - bttsYesCal, category: "btts", explanation: bttsExplanation });
  }

  if (corners) {
    const exp = corners.expected;
    addOverUnder("Rohy", "rohy", (line) => poissonOverUnder(exp, line), (line) => statExplanation(exp, line));
  }
  // Rohy jedného tímu: vlastné rohy tímu zmiešané s tým, koľko rohov dovolí súper.
  if (homeCornersAvg != null && awayCornersAvg != null) {
    const hc = homeCornersAvg, ac = awayCornersAvg;
    addOverUnder("Rohy domácich", "rohy_timu", (line) => poissonOverUnder(hc, line), (line) =>
      `${fixture.homeTeam.name} má v priemere ${fmt1(hc)} rohov na zápas (aj s ohľadom na súpera), hranica ${line}.`
    );
    addOverUnder("Rohy hostí", "rohy_timu", (line) => poissonOverUnder(ac, line), (line) =>
      `${fixture.awayTeam.name} má v priemere ${fmt1(ac)} rohov na zápas (aj s ohľadom na súpera), hranica ${line}.`
    );
  }

  if (cards) {
    const exp = cards.expected;
    addOverUnder("Karty", "karty", (line) => overdispersedOverUnder(exp, line, VAR_RATIO.cards), (line) => statExplanation(exp, line));
  }

  if (shotsOnGoal) {
    const exp = shotsOnGoal.expected;
    addOverUnder("Strely na bránu", "strely", (line) => overdispersedOverUnder(exp, line, VAR_RATIO.shotsOnGoal), (line) => statExplanation(exp, line));
  }

  if (fouls) {
    const exp = fouls.expected;
    addOverUnder("Fauly", "fauly", (line) => poissonOverUnder(exp, line), (line) => statExplanation(exp, line));
  }

  if (offsides) {
    if (offsides.over >= offsides.under) {
      candidates.push({
        market: "Ofsajdy",
        selection: `Over ${OFFSIDES_LINE}`,
        probability: offsides.over,
        category: "ofsajdy",
        explanation: statExplanation(offsides.expected, OFFSIDES_LINE),
      });
    } else {
      candidates.push({
        market: "Ofsajdy",
        selection: `Under ${OFFSIDES_LINE}`,
        probability: offsides.under,
        category: "ofsajdy",
        explanation: statExplanation(offsides.expected, OFFSIDES_LINE),
      });
    }
  }

  // Vyššie držanie lopty - odhad z priemerného držania lopty oboch tímov.
  // Odhad domácich = priemer (ich držanie, 100 - držanie súpera). Skutočné
  // držanie v zápase kolíše okolo odhadu približne o ±8 percentuálnych bodov
  // (smerodajná odchýlka), z toho sa počíta pravdepodobnosť cez normálne rozdelenie.
  if (extraStatsAvg?.homePossession != null && extraStatsAvg?.awayPossession != null) {
    const possBlend = blendH2H((extraStatsAvg.homePossession + (100 - extraStatsAvg.awayPossession)) / 2, "homePossession");
    const expectedHome = possBlend.value;
    if (possBlend.h2h) h2hNotes.drzanie_lopty = `Vo vzájomných zápasoch (${possBlend.h2h.n}) mali domáci loptu v priemere ${possBlend.h2h.avg.toFixed(0)} %.`;
    const POSSESSION_SD = 8;
    const homeHigher = normalCdf((expectedHome - 50) / POSSESSION_SD) * 100;
    const homeFavoured = homeHigher >= 50;
    const team = homeFavoured ? fixture.homeTeam.name : fixture.awayTeam.name;
    candidates.push({
      market: "Vyššie držanie lopty",
      selection: team,
      probability: homeFavoured ? homeHigher : 100 - homeHigher,
      category: "drzanie_lopty",
      explanation: `Priemerné držanie lopty: ${fixture.homeTeam.name} ${extraStatsAvg.homePossession.toFixed(
        0
      )} %, ${fixture.awayTeam.name} ${extraStatsAvg.awayPossession.toFixed(0)} %. Odhad pre tento zápas ${expectedHome.toFixed(
        0
      )}:${(100 - expectedHome).toFixed(0)}.`,
    });
  }

  if (!legacy) {
    for (const c of candidates) {
      const k = calibrationFactor(c.category, minGamesPlayed);
      if (k < 1) c.probability = 50 + k * (c.probability - 50);
    }
  }

  const sortedBets = candidates.sort((a, b) => b.probability - a.probability);

  // Appka odporúča len tipy v pásme MIN_PROBABILITY – MAX_PROBABILITY:
  // - pod 65 % tipy vychádzajú príliš nepravidelne (dlhé série prehier),
  // - nad 75 % má tip v stávkovej kancelárii spravidla príliš nízky kurz
  //   (férový kurz pod 1,33 a po marži bookmakera ešte menej).
  // Ak žiadny tip zápasu nespadá do pásma, zápas ostane BEZ odporúčania -
  // appka radšej nič neodporučí, ako by ponúkla horší tip.
  const MIN_PROBABILITY = 65;
  const MAX_PROBABILITY = 75;
  // Skutočné kurzy stávkoviek: ku každému tipu priradíme kurz (ak ho stávkovky
  // ponúkajú) a očakávanú hodnotu = pravdepodobnosť × kurz. Tip s kurzom,
  // ktorý nedosahuje MIN_EXPECTED_VALUE, nemá hodnotu a do odporúčaní sa
  // nedostane. Tip BEZ dostupného kurzu ostáva (nevieme ho posúdiť) -
  // v appke je pri ňom len odhadovaný kurz.
  if (h2hG && h2hG.weight > 0) {
    const g = `V posledných ${h2hG.n} vzájomných zápasoch padlo v priemere ${fmt1(h2hG.total)} gólu.`;
    h2hNotes.goly = g;
    h2hNotes.btts = g;
    h2hNotes.vysledok = `Vzájomné zápasy (${h2hG.n}) sú započítané do odhadu gólov.`;
  }
  for (const c of candidates) {
    const note = h2hNotes[c.category];
    if (note) c.explanation = (c.explanation ? c.explanation + " " : "") + note;
  }

  const oddsAvailable = !!marketOdds && marketOdds.length > 0;

  // Málo dát v sezóne (napr. reprezentácie na začiatku Ligy národov): odhad
  // modelu zmiešame s odhadom stávkoviek. Stávkovky poznajú silu súperov,
  // ktorú model z malého množstva zápasov nevidí. Váha trhu klesá s počtom
  // odohraných zápasov: 0 zápasov = 50 % model / 50 % trh, 4 zápasy = 90 / 10,
  // od 5 zápasov sa odhad modelu nemení.
  // (minGamesPlayed = menší z počtov odohraných zápasov oboch tímov, vypočítaný vyššie)
  const marketWeight = minGamesPlayed >= MIN_GAMES_FOR_TRUST ? 0 : 0.5 * (1 - minGamesPlayed / MIN_GAMES_FOR_TRUST);

  for (const c of candidates) {
    const match = oddsAvailable ? findOdds(marketOdds!, c, fixture.homeTeam.name, fixture.awayTeam.name) : null;
    c.odds = match ? match.odd : null;
    c.oddsBookmakers = match ? match.bookmakers : 0;
    if (match && marketWeight > 0) {
      const pMarket = marketProbability(marketOdds!, c, fixture.homeTeam.name, fixture.awayTeam.name);
      if (pMarket !== null) {
        const modelPct = c.probability;
        // Rozpor so stávkovkami: pri málo dátach a rozdiele 15+ bodov model
        // pravdepodobne nevidí niečo podstatné (typicky rozdiel v sile súperov).
        // Hranica podľa vzájomných zápasov, ktoré model naozaj použil PRE TENTO trh:
        // pri štatistikách (rohy, karty…) len tie, ku ktorým sú štatistiky k dispozícii.
        const statKey = H2H_STAT_KEY[c.category];
        const h2hUsed = statKey ? h2hStat(statKey)?.n ?? 0 : h2hG ? h2hG.n : 0;
        if (Math.abs(modelPct - pMarket * 100) >= marketConflictLimit(h2hUsed)) {
          c.marketConflict = `model a stávkovky sa výrazne rozchádzajú (model ${modelPct.toFixed(0)} %, stávkovky ${(pMarket * 100).toFixed(0)} %)`;
          c.modelProbability = modelPct;
          c.marketProbability = pMarket * 100;
        }
        c.probability = (1 - marketWeight) * modelPct + marketWeight * pMarket * 100;
        c.explanation =
          (c.explanation ? c.explanation + " " : "") +
          `(Málo dát v sezóne – odhad upravený podľa kurzov stávkoviek: model ${modelPct.toFixed(0)} %, stávkovky ${(
            pMarket * 100
          ).toFixed(0)} %.)`;
      }
    }
    c.expectedValue = match ? (c.probability / 100) * match.odd : null;
  }
  // Po úprave podľa trhu sa poradie tipov mohlo zmeniť.
  sortedBets.sort((a, b) => b.probability - a.probability);

  const inBand = sortedBets.filter(
    (b) => b.probability >= MIN_PROBABILITY && b.probability <= MAX_PROBABILITY
  );
  // Posúdenie hodnoty podľa skutočného kurzu:
  //  - stávkovky k zápasu zatiaľ nemajú kurzy -> vyradiť (hodnota sa nedá overiť;
  //    odhadovaný kurz z dôvery 65 – 75 % by bol vždy len 1,33 – 1,54),
  //  - pod +5 %: tip nemá hodnotu -> vyradiť,
  //  - kurz pod MIN_ODDS (predvolene 1,50) -> vyradiť,
  //  - nad +25 % a málo odohraných zápasov v sezóne: model stojí na slabých
  //    dátach a rozdiel oproti trhu je takmer iste jeho chyba -> vyradiť,
  //  - nad +25 % a dát je dosť: tip ostáva, ale s upozornením,
  //  - inak normálny tip. Keď sa kurzy objavia, pri ďalšej analýze tip prejde bežne.
  const NOT_RECOMMENDED_MARKETS = ["Ofsajdy"];
  const fewGames =
    Math.min(homeStats.fixtures.played.total ?? 0, awayStats.fixtures.played.total ?? 0) < MIN_GAMES_FOR_TRUST;
  const pickPool: MarketPick[] = [];
  const lowValueBets: MarketPick[] = [];
  for (const b of inBand) {
    const ev = b.expectedValue;
    if (NOT_RECOMMENDED_MARKETS.includes(b.market)) {
      // Ofsajdy: v spätných testoch model ich šancu preceňoval (čakal 61 %, vyšlo 45 %),
      // preto sa neodporúčajú. V analýze zápasu ostávajú viditeľné, ručne sa dajú uložiť.
      b.rejectReason = "tento trh neodporúčame (model ho v testoch preceňoval)";
      lowValueBets.push(b);
    } else if (b.marketConflict) {
      b.rejectReason = b.marketConflict;
      lowValueBets.push(b);
    } else if (ev == null && oddsAvailable) {
      // Stávkovky k zápasu kurzy majú, ale tento trh (alebo túto hranicu) neponúkajú -
      // na tip sa reálne nedá staviť. Ručne ho stále možno pridať ("Uložiť aj tak").
      b.rejectReason = "stávkovky tento trh neponúkajú";
      lowValueBets.push(b);
    } else if (ev == null) {
      // Pre zápas zatiaľ nie sú žiadne kurzy - hodnotu ani minimálny kurz nevieme
      // overiť, preto tip neodporučíme. Ručne ho stále možno pridať ("Uložiť aj tak").
      b.rejectReason = "stávkovky zatiaľ neponúkajú kurz";
      lowValueBets.push(b);
    } else if (ev < MIN_EXPECTED_VALUE) {
      b.rejectReason = "nízky kurz, bez hodnoty";
      lowValueBets.push(b);
    } else if (b.odds != null && b.odds < MIN_ODDS) {
      // Kurz pod minimom (predvolene 1,50) - tip má hodnotu, ale zisk z výhry je malý.
      b.rejectReason = `kurz pod ${MIN_ODDS.toFixed(2).replace(".", ",")}`;
      lowValueBets.push(b);
    } else if (ev > SUSPICIOUS_EXPECTED_VALUE && fewGames) {
      b.rejectReason = "podozrivo vysoká hodnota pri málo dátach v sezóne";
      lowValueBets.push(b);
    } else {
      if (ev > SUSPICIOUS_EXPECTED_VALUE) {
        b.valueWarning = "Model a stávkovky sa výrazne rozchádzajú – pred stávkou over zostavy a správy.";
      }
      pickPool.push(b);
    }
  }

  // Appka ukáže VŠETKY tipy zápasu, ktoré spadajú do pásma - najviac jeden
  // z každej kategórie (trhu). Z viacerých hraníc toho istého trhu (napr. rohy
  // 8,5 / 9,5 / 10,5) vyberie tú s najväčšou hodnotou. Zoradené od najvyššej pravdepodobnosti.
  const bestInCategory = new Map<string, MarketPick>();
  for (const bet of pickPool) {
    const cur = bestInCategory.get(bet.category);
    const ev = bet.expectedValue ?? 0, curEv = cur?.expectedValue ?? 0;
    if (!cur || ev > curEv || (ev === curEv && bet.probability > cur.probability)) bestInCategory.set(bet.category, bet);
  }
  const diversifiedPicks = Array.from(bestInCategory.values()).sort((a, b) => b.probability - a.probability);

  const bestBets = diversifiedPicks;

  const homeTopScorer = homePlayers
    ? predictTopScorer(filterByLineup(homePlayers, homeLineupIds), xg.home, homeStats.goals.for.average.total)
    : null;
  const awayTopScorer = awayPlayers
    ? predictTopScorer(filterByLineup(awayPlayers, awayLineupIds), xg.away, awayStats.goals.for.average.total)
    : null;

  let bestScorer: { team: string; prediction: PlayerGoalPrediction } | null = null;
  if (homeTopScorer && awayTopScorer) {
    bestScorer =
      homeTopScorer.probabilityToScore >= awayTopScorer.probabilityToScore
        ? { team: fixture.homeTeam.name, prediction: homeTopScorer }
        : { team: fixture.awayTeam.name, prediction: awayTopScorer };
  } else if (homeTopScorer) {
    bestScorer = { team: fixture.homeTeam.name, prediction: homeTopScorer };
  } else if (awayTopScorer) {
    bestScorer = { team: fixture.awayTeam.name, prediction: awayTopScorer };
  }

  return {
    fixture,
    expectedGoals: xg,
    probabilities: finalProbs,
    overUnder25: { over: poisson.over25, under: poisson.under25 },
    btts: { yes: poisson.bttsYes, no: poisson.bttsNo },
    form: {
      home: homeStats.form,
      away: awayStats.form,
      homeScore: homeFormScore,
      awayScore: awayFormScore,
    },
    headToHead: {
      matchesConsidered: h2hResult.homeWins + h2hResult.draws + h2hResult.awayWins,
      homeWins: h2hResult.homeWins,
      draws: h2hResult.draws,
      awayWins: h2hResult.awayWins,
      matches: h2h
        .filter((m) => m.homeGoals !== null && m.awayGoals !== null)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 8)
        .map((m) => {
          const homeWasHome = m.homeTeamId === fixture.homeTeam.id;
          const used = h2hG !== null && h2hRecent(h2h).some((r) => r.fixtureId === m.fixtureId);
          return {
            date: m.date,
            homeGoals: (homeWasHome ? m.homeGoals : m.awayGoals) as number,
            awayGoals: (homeWasHome ? m.awayGoals : m.homeGoals) as number,
            homeWasHome,
            usedInModel: used,
          };
        }),
      usedInModel: h2hG ? h2hG.n : 0,
    },
    corners,
    cards,
    shotsOnGoal,
    fouls,
    offsides,
    bestBets,
    lowValueBets,
    oddsAvailable,
    allCandidates: candidates,
    teamSeasonGoalsPerGame: {
      home: homeStats.goals.for.average.total,
      away: awayStats.goals.for.average.total,
    },
    topScorers: {
      home: homeTopScorer,
      away: awayTopScorer,
    },
    bestScorer,
    lineupConfirmed: {
      home: Boolean(homeLineupIds && homeLineupIds.length > 0),
      away: Boolean(awayLineupIds && awayLineupIds.length > 0),
    },
    historicalDataInfo: {
      home: homePriorsResult
        ? { seasonsUsed: homePriorsResult.seasonsUsed, seasonsChecked: homePriorsResult.seasonsChecked }
        : null,
      away: awayPriorsResult
        ? { seasonsUsed: awayPriorsResult.seasonsUsed, seasonsChecked: awayPriorsResult.seasonsChecked }
        : null,
    },
    tip: {
      outcome,
      outcomeLabel,
      confidence,
      goalsMarket: poisson.over25 >= 50 ? "Over 2.5" : "Under 2.5",
    },
    sampleSizeWarning,
    seasonGamesPlayed: {
      home: homeStats.fixtures.played.total,
      away: awayStats.fixtures.played.total,
    },
  };
}

/**
 * Odhadne pravdepodobnosť, že konkrétny hráč v tomto zápase skóruje aspoň raz.
 * Logika: z hráčovho pomeru gólov na zápas a celkového priemeru gólov tímu na
 * zápas odvodíme, akým podielom hráč typicky prispieva k gólom tímu. Tento
 * podiel potom aplikujeme na už vypočítaný očakávaný počet gólov tímu v tomto
 * konkrétnom zápase (z Poissonovho modelu) a spočítame Poissonovu
 * pravdepodobnosť aspoň jedného gólu.
 */
export function predictPlayerGoal(
  playerName: string,
  playerId: number,
  seasonGoals: number,
  appearances: number,
  teamExpectedGoalsThisMatch: number,
  teamSeasonGoalsPerGame: number
): PlayerGoalPrediction {
  const goalsPerGame = appearances > 0 ? seasonGoals / appearances : 0;
  const shareOfTeamGoals =
    teamSeasonGoalsPerGame > 0 ? clamp(goalsPerGame / teamSeasonGoalsPerGame, 0, 1) : 0;
  const lambda = shareOfTeamGoals * teamExpectedGoalsThisMatch;
  const probabilityToScore = (1 - poissonPmf(0, lambda)) * 100;

  return {
    player: { id: playerId, name: playerName },
    seasonGoals,
    appearances,
    goalsPerGame,
    probabilityToScore,
  };
}

/**
 * Z celej súpisky tímu automaticky vyberie hráča s najvyššou pravdepodobnosťou
 * gólu v tomto zápase. Hráčov s príliš málo odohranými zápasmi (menej ako
 * `minAppearances`) vynechá, aby jeden náhodný gól v 1 zápase neskreslil výber.
 */
/**
 * Ak je k dispozícii potvrdená zostava (lineupIds), obmedzí zoznam hráčov len
 * na tých, ktorí sú v nej - inak vráti celú súpisku bez zmeny (zostava zatiaľ
 * nie je známa, napr. zápas je ešte pár dní/týždňov dopredu).
 */
function filterByLineup(players: RawPlayerStat[], lineupIds?: number[] | null): RawPlayerStat[] {
  if (!lineupIds || lineupIds.length === 0) return players;
  const filtered = players.filter((p) => lineupIds.includes(p.id));
  return filtered.length > 0 ? filtered : players;
}

export function predictTopScorer(
  players: RawPlayerStat[],
  teamExpectedGoalsThisMatch: number,
  teamSeasonGoalsPerGame: number,
  minAppearances: number = 3
): PlayerGoalPrediction | null {
  const eligible = players.filter((p) => p.appearances >= minAppearances);
  if (eligible.length === 0) return null;

  const predictions = eligible.map((p) =>
    predictPlayerGoal(p.name, p.id, p.goals, p.appearances, teamExpectedGoalsThisMatch, teamSeasonGoalsPerGame)
  );

  predictions.sort((a, b) => b.probabilityToScore - a.probabilityToScore);
  return predictions[0];
}
