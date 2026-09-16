import {
  Fixture,
  TeamStatistics,
  HeadToHeadSummary,
  PredictionWeights,
  OutcomeProbabilities,
  PredictionResult,
} from "./types";

// Predvolené váhy jednotlivých faktorov v celkovom modeli.
// Súčet by mal byť 1.0. Poisson (gólový) model nesie najväčšiu váhu,
// forma a vzájomné zápasy ho jemne dolaďujú.
export const DEFAULT_WEIGHTS: PredictionWeights = {
  poisson: 0.65,
  form: 0.22,
  h2h: 0.13,
};

// Priemerný počet gólov doma/vonku naprieč ligou, použitý ako základ
// pre výpočet sily útoku/obrany. Toto je zjednodušenie - presnejší
// model by počítal skutočný ligový priemer z /fixtures danej sezóny.
const LEAGUE_AVG_HOME_GOALS = 1.5;
const LEAGUE_AVG_AWAY_GOALS = 1.15;

const MAX_GOALS = 6; // horná hranica pri sčítavaní Poissonovej matice

// Koľko "váhy" má ligový priemer oproti tímovým dátam na začiatku sezóny.
// Napr. hodnota 5 znamená, že tímov vlastný priemer sa berie doslovne až
// vtedy, keď má za sebou zhruba 5x viac odohraných zápasov než je táto
// konštanta - kým ich má menej, priemer sa "ťahá" bližšie k ligovému
// priemeru, aby pár extrémnych výsledkov na začiatku sezóny neskreslilo
// predikciu.
const SHRINKAGE_PRIOR_GAMES = 5;

/**
 * Vyhladí (shrinkne) pozorovaný priemer smerom k ligovému priemeru podľa
 * počtu odohraných zápasov - čím menej zápasov, tým väčší posun k priemeru.
 */
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

/** Očakávané góly domáceho a hosťujúceho tímu na základe sily útoku/obrany. */
export function expectedGoals(
  home: TeamStatistics,
  away: TeamStatistics
): { home: number; away: number } {
  const homeGoalsForAvg = shrinkAverage(
    home.goals.for.average.home,
    home.fixtures.played.home,
    LEAGUE_AVG_HOME_GOALS
  );
  const homeGoalsAgainstAvg = shrinkAverage(
    home.goals.against.average.home,
    home.fixtures.played.home,
    LEAGUE_AVG_AWAY_GOALS // tím doma inkasuje v priemere toľko, koľko súperi dávajú vonku
  );
  const awayGoalsForAvg = shrinkAverage(
    away.goals.for.average.away,
    away.fixtures.played.away,
    LEAGUE_AVG_AWAY_GOALS
  );
  const awayGoalsAgainstAvg = shrinkAverage(
    away.goals.against.average.away,
    away.fixtures.played.away,
    LEAGUE_AVG_HOME_GOALS // tím vonku inkasuje v priemere toľko, koľko súperi dávajú doma
  );

  const homeAttack = safeDiv(homeGoalsForAvg, LEAGUE_AVG_HOME_GOALS);
  const awayDefense = safeDiv(awayGoalsAgainstAvg, LEAGUE_AVG_AWAY_GOALS);
  const awayAttack = safeDiv(awayGoalsForAvg, LEAGUE_AVG_AWAY_GOALS);
  const homeDefense = safeDiv(homeGoalsAgainstAvg, LEAGUE_AVG_HOME_GOALS);

  const homeExpected = homeAttack * awayDefense * LEAGUE_AVG_HOME_GOALS;
  const awayExpected = awayAttack * homeDefense * LEAGUE_AVG_AWAY_GOALS;

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

/** Poissonov model: pravdepodobnosti výsledku 1/X/2 a Over/Under 2.5. */
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

/**
 * Prevedie reťazec formy (napr. "WWDLW", najnovší zápas posledný)
 * na vážené skóre 0-3, kde novšie zápasy majú väčšiu váhu.
 */
export function formToScore(form: string): number {
  if (!form) return 1.3; // neutrálna hodnota bez dát

  const matches = form.slice(-5).split(""); // posledných max. 5 zápasov
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

/** Odhad pravdepodobností 1/X/2 na základe rozdielu vo forme oboch tímov. */
function formOutcomes(homeScore: number, awayScore: number): OutcomeProbabilities {
  const diff = homeScore - awayScore; // rozsah približne -3 až 3
  // Sigmoid mapovanie rozdielu na posun oproti základnej 40/28/32 (výhoda domácich).
  const shift = (2 / (1 + Math.exp(-diff)) - 1) * 25; // -25 až +25

  let homeWin = 40 + shift;
  let awayWin = 32 - shift;
  let draw = 100 - homeWin - awayWin;

  return normalizeProbs({ homeWin, draw, awayWin });
}

/** Odhad pravdepodobností 1/X/2 na základe súhrnu vzájomných zápasov. */
function headToHeadOutcomes(
  summary: HeadToHeadSummary
): { probs: OutcomeProbabilities; homeWins: number; draws: number; awayWins: number } {
  const { homeWins, draws, awayWins } = summary;
  const consideredTotal = homeWins + draws + awayWins;

  if (consideredTotal === 0) {
    // Bez histórie - neutrálny odhad rovný priemeru ligy.
    return {
      probs: { homeWin: 40, draw: 28, awayWin: 32 },
      homeWins,
      draws,
      awayWins,
    };
  }

  // Laplaceovo vyhladenie, aby jeden extrémny výsledok neposunul váhu na 100 %.
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
    homeWin:
      poisson.homeWin * weights.poisson +
      form.homeWin * weights.form +
      h2h.homeWin * weights.h2h,
    draw:
      poisson.draw * weights.poisson +
      form.draw * weights.form +
      h2h.draw * weights.h2h,
    awayWin:
      poisson.awayWin * weights.poisson +
      form.awayWin * weights.form +
      h2h.awayWin * weights.h2h,
  };
  return normalizeProbs(combined);
}

function confidenceFromMargin(sorted: number[]): "nízka" | "stredná" | "vysoká" {
  const margin = sorted[0] - sorted[1]; // rozdiel medzi najpravdepodobnejším a druhým výsledkom
  if (margin >= 20) return "vysoká";
  if (margin >= 10) return "stredná";
  return "nízka";
}

/** Hlavná funkcia: skombinuje všetky faktory do finálnej predikcie zápasu. */
export function predictMatch(
  fixture: Fixture,
  homeStats: TeamStatistics,
  awayStats: TeamStatistics,
  h2h: HeadToHeadSummary,
  weights: PredictionWeights = DEFAULT_WEIGHTS
): PredictionResult {
  const xg = expectedGoals(homeStats, awayStats);
  const poisson = poissonOutcomes(xg.home, xg.away);

  const homeFormScore = formToScore(homeStats.form);
  const awayFormScore = formToScore(awayStats.form);
  const formProbs = formOutcomes(homeFormScore, awayFormScore);

  const h2hResult = headToHeadOutcomes(h2h);

  const finalProbs = combineProbs(poisson.probs, formProbs, h2hResult.probs, weights);

  const sorted = [finalProbs.homeWin, finalProbs.draw, finalProbs.awayWin]
    .slice()
    .sort((a, b) => b - a);
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
  const sampleSizeWarning =
    minGamesPlayed < 6
      ? `Pozor: v tejto sezóne je odohraných len málo zápasov (min. ${minGamesPlayed}), predikcia je preto menej spoľahlivá.`
      : undefined;

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
    tip: {
      outcome,
      outcomeLabel,
      confidence,
      goalsMarket: poisson.over25 >= 50 ? "Over 2.5" : "Under 2.5",
    },
    sampleSizeWarning,
  };
}
