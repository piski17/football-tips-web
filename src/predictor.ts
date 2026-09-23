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
  PlayerGoalPrediction,
  RawPlayerStat,
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

const MAX_GOALS = 7;

// Bežné bookmakerské hranice pre rohy a karty - dajú sa v budúcnosti spraviť konfigurovateľné.
const CORNERS_LINE = 9.5;
const CARDS_LINE = 3.5;
const SHOTS_ON_GOAL_LINE = 8.5;
const FOULS_LINE = 21.5;
const OFFSIDES_LINE = 3.5;

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
  }
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

  // ---- Strely na bránu (ak sú dáta k dispozícii) ----
  let shotsOnGoal: OverUnderMarket | undefined;
  if (extraStatsAvg?.homeShotsOnGoal != null && extraStatsAvg?.awayShotsOnGoal != null) {
    const expected = extraStatsAvg.homeShotsOnGoal + extraStatsAvg.awayShotsOnGoal;
    const { over, under } = poissonOverUnder(expected, SHOTS_ON_GOAL_LINE);
    shotsOnGoal = { expected, line: SHOTS_ON_GOAL_LINE, over, under };
  }

  // ---- Fauly (ak sú dáta k dispozícii) ----
  let fouls: OverUnderMarket | undefined;
  if (extraStatsAvg?.homeFouls != null && extraStatsAvg?.awayFouls != null) {
    const expected = extraStatsAvg.homeFouls + extraStatsAvg.awayFouls;
    const { over, under } = poissonOverUnder(expected, FOULS_LINE);
    fouls = { expected, line: FOULS_LINE, over, under };
  }

  // ---- Ofsajdy (ak sú dáta k dispozícii) ----
  let offsides: OverUnderMarket | undefined;
  if (extraStatsAvg?.homeOffsides != null && extraStatsAvg?.awayOffsides != null) {
    const expected = extraStatsAvg.homeOffsides + extraStatsAvg.awayOffsides;
    const { over, under } = poissonOverUnder(expected, OFFSIDES_LINE);
    offsides = { expected, line: OFFSIDES_LINE, over, under };
  }

  // ---- Vysvetlenia ("prečo tento tip") pre jednotlivé skupiny trhov ----
  const homeFormText = homeStats.form ? `forma: ${homeStats.form} (skóre ${homeFormScore.toFixed(1)})` : "forma zatiaľ neznáma (odohraných 0 zápasov, použitý priemerný odhad)";
  const awayFormText = awayStats.form ? `forma: ${awayStats.form} (skóre ${awayFormScore.toFixed(1)})` : "forma zatiaľ neznáma (odohraných 0 zápasov, použitý priemerný odhad)";

  const resultExplanation = `${fixture.homeTeam.name} ${homeFormText}, ${
    fixture.awayTeam.name
  } ${awayFormText}. Posledných ${h2hResult.homeWins + h2hResult.draws + h2hResult.awayWins} vzájomných zápasov: ${
    h2hResult.homeWins
  }-${h2hResult.draws}-${h2hResult.awayWins} (výhry domáci-remízy-výhry hostia). Očakávané góly ${xg.home.toFixed(
    1
  )}:${xg.away.toFixed(1)}.`;

  const golyExplanation = `Očakávaný súčet gólov v zápase je ${(xg.home + xg.away).toFixed(1)} (${
    fixture.homeTeam.name
  } ${xg.home.toFixed(1)}, ${fixture.awayTeam.name} ${xg.away.toFixed(1)}).`;

  const bttsExplanation = `Očakávané góly: ${fixture.homeTeam.name} ${xg.home.toFixed(1)}, ${
    fixture.awayTeam.name
  } ${xg.away.toFixed(1)} - oba tímy majú reálnu šancu skórovať.`;

  const statExplanation = (expected: number, line: number): string =>
    `Priemer oboch tímov v tejto štatistike za posledné zápasy je ${expected.toFixed(
      1
    )}, oproti hranici ${line} ide o jasný rozdiel.`;


  // Každý kandidát má aj "kategóriu" - tipy z rovnakej kategórie sú si
  // navzájom podobné/prekrývajúce sa (napr. Dvojšanca a Výsledok zápasu),
  // takže appka pri výbere viacerých tipov na zápas berie max. 1 z každej
  // kategórie, aby dostal rôznorodý, nie opakujúci sa výber.
  const candidates: MarketPick[] = [];

  candidates.push({ market: "Výsledok zápasu", selection: outcomeLabel, probability: sorted[0], category: "vysledok", explanation: resultExplanation });

  if (poisson.over25 >= poisson.under25) {
    candidates.push({ market: "Góly", selection: "Over 2.5", probability: poisson.over25, category: "goly", explanation: golyExplanation });
  } else {
    candidates.push({ market: "Góly", selection: "Under 2.5", probability: poisson.under25, category: "goly", explanation: golyExplanation });
  }

  if (poisson.over15 >= poisson.under15) {
    candidates.push({ market: "Góly", selection: "Over 1.5", probability: poisson.over15, category: "goly", explanation: golyExplanation });
  } else {
    candidates.push({ market: "Góly", selection: "Under 1.5", probability: poisson.under15, category: "goly", explanation: golyExplanation });
  }

  if (poisson.over35 >= poisson.under35) {
    candidates.push({ market: "Góly", selection: "Over 3.5", probability: poisson.over35, category: "goly", explanation: golyExplanation });
  } else {
    candidates.push({ market: "Góly", selection: "Under 3.5", probability: poisson.under35, category: "goly", explanation: golyExplanation });
  }

  if (poisson.bttsYes >= poisson.bttsNo) {
    candidates.push({ market: "Obaja tímy skórujú", selection: "Áno", probability: poisson.bttsYes, category: "btts", explanation: bttsExplanation });
  } else {
    candidates.push({ market: "Obaja tímy skórujú", selection: "Nie", probability: poisson.bttsNo, category: "btts", explanation: bttsExplanation });
  }

  if (corners) {
    if (corners.over >= corners.under) {
      candidates.push({ market: "Rohy", selection: `Over ${CORNERS_LINE}`, probability: corners.over, category: "rohy", explanation: statExplanation(corners.expected, CORNERS_LINE) });
    } else {
      candidates.push({ market: "Rohy", selection: `Under ${CORNERS_LINE}`, probability: corners.under, category: "rohy", explanation: statExplanation(corners.expected, CORNERS_LINE) });
    }
  }

  if (cards.over >= cards.under) {
    candidates.push({ market: "Karty", selection: `Over ${CARDS_LINE}`, probability: cards.over, category: "karty", explanation: statExplanation(cards.expected, CARDS_LINE) });
  } else {
    candidates.push({ market: "Karty", selection: `Under ${CARDS_LINE}`, probability: cards.under, category: "karty", explanation: statExplanation(cards.expected, CARDS_LINE) });
  }

  if (shotsOnGoal) {
    if (shotsOnGoal.over >= shotsOnGoal.under) {
      candidates.push({
        market: "Strely na bránu",
        selection: `Over ${SHOTS_ON_GOAL_LINE}`,
        probability: shotsOnGoal.over,
        category: "strely",
        explanation: statExplanation(shotsOnGoal.expected, SHOTS_ON_GOAL_LINE),
      });
    } else {
      candidates.push({
        market: "Strely na bránu",
        selection: `Under ${SHOTS_ON_GOAL_LINE}`,
        probability: shotsOnGoal.under,
        category: "strely",
        explanation: statExplanation(shotsOnGoal.expected, SHOTS_ON_GOAL_LINE),
      });
    }
  }

  if (fouls) {
    if (fouls.over >= fouls.under) {
      candidates.push({ market: "Fauly", selection: `Over ${FOULS_LINE}`, probability: fouls.over, category: "fauly", explanation: statExplanation(fouls.expected, FOULS_LINE) });
    } else {
      candidates.push({ market: "Fauly", selection: `Under ${FOULS_LINE}`, probability: fouls.under, category: "fauly", explanation: statExplanation(fouls.expected, FOULS_LINE) });
    }
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

  // Dvojšanca - najlepšia z troch kombinácií (1X, X2, 12)
  const doubleChanceOptions = [
    { selection: `${fixture.homeTeam.name} alebo remíza`, probability: poisson.doubleChance.oneX },
    { selection: `${fixture.awayTeam.name} alebo remíza`, probability: poisson.doubleChance.xTwo },
    { selection: `${fixture.homeTeam.name} alebo ${fixture.awayTeam.name}`, probability: poisson.doubleChance.oneTwo },
  ].sort((a, b) => b.probability - a.probability)[0];
  candidates.push({
    market: "Dvojšanca",
    selection: doubleChanceOptions.selection,
    probability: doubleChanceOptions.probability,
    category: "vysledok", // rovnaká kategória ako Výsledok zápasu - sú si obsahovo blízke
    explanation: resultExplanation,
  });

  // Presný výsledok - najpravdepodobnejšie skóre
  candidates.push({
    market: "Presný výsledok",
    selection: `${poisson.correctScore.home}:${poisson.correctScore.away}`,
    probability: poisson.correctScore.probability,
    category: "presny_vysledok",
    explanation: `Najpravdepodobnejšie skóre podľa modelu, vychádzajúce z očakávaných gólov ${xg.home.toFixed(
      1
    )}:${xg.away.toFixed(1)}.`,
  });

  // Čisté konto - ktorý tím s väčšou pravdepodobnosťou neinkasuje
  const cleanSheetOptions = [
    { selection: `${fixture.homeTeam.name} neinkasuje`, probability: poisson.homeCleanSheet },
    { selection: `${fixture.awayTeam.name} neinkasuje`, probability: poisson.awayCleanSheet },
  ].sort((a, b) => b.probability - a.probability)[0];
  const cleanSheetExplanation = cleanSheetOptions.selection.startsWith(fixture.homeTeam.name)
    ? `Očakávané góly ${fixture.awayTeam.name} sú len ${xg.away.toFixed(1)} - ${
        fixture.homeTeam.name
      } má slušnú šancu na čisté konto.`
    : `Očakávané góly ${fixture.homeTeam.name} sú len ${xg.home.toFixed(1)} - ${
        fixture.awayTeam.name
      } má slušnú šancu na čisté konto.`;
  candidates.push({
    market: "Čisté konto",
    selection: cleanSheetOptions.selection,
    probability: cleanSheetOptions.probability,
    category: "ciste_konto",
    explanation: cleanSheetExplanation,
  });

  const sortedBets = candidates.sort((a, b) => b.probability - a.probability);

  // Tipy s extrémne vysokou pravdepodobnosťou (napr. 95 %) majú v reálnej
  // stávkovej kancelárii spravidla mizerný kurz - preto appka pri výbere
  // hlavných odporúčaní uprednostňuje tipy POD touto hranicou (stále vysoká
  // istota, ale realistickejšie na stávkovanie).
  const VALUE_THRESHOLD = 75;
  const valueCandidates = sortedBets.filter((b) => b.probability < VALUE_THRESHOLD);
  const pickPool = valueCandidates.length > 0 ? valueCandidates : sortedBets;

  // Appka vyberie 2-3 NAJLEPŠIE tipy, ale vždy z RÔZNYCH kategórií, aby
  // nedávala dva podobné/prekrývajúce sa tipy naraz (napr. Dvojšanca +
  // Výsledok zápasu). Ak by kategórií nebolo dosť, jednoducho vráti menej.
  const usedCategories = new Set<string>();
  const diversifiedPicks: MarketPick[] = [];
  for (const bet of pickPool) {
    if (diversifiedPicks.length >= 3) break;
    if (usedCategories.has(bet.category)) continue;
    diversifiedPicks.push(bet);
    usedCategories.add(bet.category);
  }

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
    },
    corners,
    cards,
    shotsOnGoal,
    fouls,
    offsides,
    bestBets,
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
