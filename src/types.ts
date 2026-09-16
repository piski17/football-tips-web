// Zdieľané typy pre dáta z football-data.org a výsledky predikcie

export interface Team {
  id: number;
  name: string;
  logo?: string;
}

export interface Fixture {
  fixtureId: number;
  date: string; // ISO string
  timestamp: number;
  venue?: string;
  league: {
    id: string; // kód súťaže, napr. "PL"
    name: string;
    season: number;
    round?: string;
  };
  homeTeam: Team;
  awayTeam: Team;
  status: string;
}

export interface TeamStatistics {
  team: Team;
  form: string; // napr. "WWDLW", najnovší zápas je posledný znak
  fixtures: {
    played: { home: number; away: number; total: number };
    wins: { home: number; away: number; total: number };
    draws: { home: number; away: number; total: number };
    loses: { home: number; away: number; total: number };
  };
  goals: {
    for: {
      total: { home: number; away: number; total: number };
      average: { home: number; away: number; total: number };
    };
    against: {
      total: { home: number; away: number; total: number };
      average: { home: number; away: number; total: number };
    };
  };
}

/** Súhrn vzájomných zápasov, už vyjadrený relatívne k domácemu/hosťujúcemu tímu aktuálneho zápasu. */
export interface HeadToHeadSummary {
  matchesConsidered: number;
  homeWins: number;
  draws: number;
  awayWins: number;
}

export interface PredictionWeights {
  poisson: number; // váha Poisson (gólového) modelu
  form: number; // váha aktuálnej formy
  h2h: number; // váha vzájomných zápasov
}

export interface OutcomeProbabilities {
  homeWin: number; // 0-100
  draw: number; // 0-100
  awayWin: number; // 0-100
}

export interface PredictionResult {
  fixture: Fixture;
  expectedGoals: {
    home: number;
    away: number;
  };
  probabilities: OutcomeProbabilities;
  overUnder25: {
    over: number;
    under: number;
  };
  btts: {
    yes: number;
    no: number;
  };
  form: {
    home: string;
    away: string;
    homeScore: number;
    awayScore: number;
  };
  headToHead: HeadToHeadSummary;
  tip: {
    outcome: "1" | "X" | "2";
    outcomeLabel: string;
    confidence: "nízka" | "stredná" | "vysoká";
    goalsMarket: "Over 2.5" | "Under 2.5";
  };
  sampleSizeWarning?: string;
}

export interface LeaguePreset {
  id: string; // kód súťaže vo football-data.org, napr. "PL"
  name: string;
  country: string;
}
