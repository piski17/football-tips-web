import {
  Fixture,
  TeamStatistics,
  HeadToHeadMatch,
  LeagueAverages,
  TeamGoalPriors,
  TeamGoalPriorsResult,
  PredictionWeights,
  OutcomeProbabilities,
  PredictionResult,
  MarketPick,
  OverUnderMarket,
} from "./types";

// Predvolené váhy jednotlivých faktorov v celkovom modeli.
export const DEFAULT_WEIGHTS: PredictionWeights = {
  poisson: 0.65,
  form: 0.22,
  h2h: 0.13,
};

// Záložné hodnoty, ak by sa ligový priemer nepodarilo dopočítať (napr. začiatok sezóny bez dát).
const FALLBACK_LEAGUE_AVG_HOME_GOALS = 1.5;
const FALLBACK_LEAGUE_AVG_AWAY_GOALS = 1.15;

const MAX_GOALS = 6;

// Bežné bookmakerské hranice pre rohy a karty - dajú sa v budúcnosti spraviť konfigurovateľné.
const CORNERS_LINE = 9.5;
const CARDS_LINE = 3.5;

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
  bttsYes: number;
  bttsNo: number;
} {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let over25 = 0;
  let bttsYes = 0;

  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = poissonPmf(h, homeExpected) * poissonPmf(a, awayExpected);
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;

      if (h + a > 2) over25 += p;
      if (h > 0 && a > 0) bttsYes += p;
    }
  }

  const total = homeWin + draw + awayWin || 1;
  return {
    probs: {
      homeWin: (homeWin / total) * 100,
      draw: (draw / total) * 100,
      awayWin: (awayWin / total) * 100,
    },
    over25: over25 * 100,
    under25: (1 - over25) * 100,
    bttsYes: bttsYes * 100,
    bttsNo: (1 - bttsYes) * 100,
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
  awayCornersAvg?: number | null
): PredictionResult {
  const xg = expectedGoals(homeStats, awayStats, leagueAvg, homePriorsResult, awayPriorsResult);
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
      ? `Pozor: v tejto sezóne je odohraných len málo zápasov (min. ${minGamesPlayed}). Použité historické dáta - ${describeHistory(
          fixture.homeTeam.name,
          homePriorsResult
        )}, ${describeHistory(fixture.awayTeam.name, awayPriorsResult)}.`
      : undefined;

  // ---- Rohy (ak sú dáta k dispozícii) ----
  let corners: OverUnderMarket | undefined;
  if (homeCornersAvg != null && awayCornersAvg != null) {
    const expected = homeCornersAvg + awayCornersAvg;
    const { over, under } = poissonOverUnder(expected, CORNERS_LINE);
    corners = { expected, line: CORNERS_LINE, over, under };
  }

  // ---- Karty (priemer oboch tímov spolu) ----
  const expectedCards = homeStats.cardsPerGame + awayStats.cardsPerGame;
  const cardsOU = poissonOverUnder(expectedCards, CARDS_LINE);
  const cards: OverUnderMarket = { expected: expectedCards, line: CARDS_LINE, ...cardsOU };

  // ---- Rebríček najlepších tipov naprieč všetkými trhmi ----
  const candidates: MarketPick[] = [];

  candidates.push({ market: "Výsledok zápasu", selection: outcomeLabel, probability: sorted[0] });

  if (poisson.over25 >= poisson.under25) {
    candidates.push({ market: "Góly", selection: "Over 2.5", probability: poisson.over25 });
  } else {
    candidates.push({ market: "Góly", selection: "Under 2.5", probability: poisson.under25 });
  }

  if (poisson.bttsYes >= poisson.bttsNo) {
    candidates.push({ market: "Obaja tímy skórujú", selection: "Áno", probability: poisson.bttsYes });
  } else {
    candidates.push({ market: "Obaja tímy skórujú", selection: "Nie", probability: poisson.bttsNo });
  }

  if (corners) {
    if (corners.over >= corners.under) {
      candidates.push({ market: "Rohy", selection: `Over ${CORNERS_LINE}`, probability: corners.over });
    } else {
      candidates.push({ market: "Rohy", selection: `Under ${CORNERS_LINE}`, probability: corners.under });
    }
  }

  if (cards.over >= cards.under) {
    candidates.push({ market: "Karty", selection: `Over ${CARDS_LINE}`, probability: cards.over });
  } else {
    candidates.push({ market: "Karty", selection: `Under ${CARDS_LINE}`, probability: cards.under });
  }

  const bestBets = candidates.sort((a, b) => b.probability - a.probability).slice(0, 4);

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
    },
    corners,
    cards,
    bestBets,
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
  };
}
