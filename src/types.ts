// Zdieľané typy pre dáta z API-Football a výsledky predikcie

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
    id: number;
    name: string;
    season: number;
    round?: string;
  };
  homeTeam: Team;
  awayTeam: Team;
  status: string;
  elapsed?: number | null; // odohraná minúta, ak zápas prebieha
  goalsHome?: number | null; // aktuálne skóre, ak zápas prebieha alebo skončil
  goalsAway?: number | null;
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
  /** Priemerný počet žltých + červených kariet tímu za zápas (celá sezóna). */
  cardsPerGame: number;
}

/** Jeden konkrétny odporúčaný tip naprieč trhmi, zoraditeľný podľa istoty. */
export interface MarketPick {
  market: string; // napr. "Výsledok zápasu", "Rohy", "Karty"
  selection: string; // napr. "Výhra Chelsea", "Over 9.5", "Under 3.5"
  probability: number; // 0-100
  category: string; // na skupinovanie podobných trhov, aby appka nedávala 2 podobné tipy naraz
  explanation?: string; // krátke vysvetlenie, prečo model tento tip odporúča
}

/** Odhad pre trh typu Over/Under (rohy, karty) založený na kombinovanom Poissonovom modeli. */
export interface OverUnderMarket {
  expected: number;
  line: number;
  over: number;
  under: number;
}

/** Jeden odohraný vzájomný zápas dvoch tímov. */
export interface HeadToHeadMatch {
  fixtureId: number;
  date: string;
  homeTeamId: number;
  awayTeamId: number;
  homeGoals: number | null;
  awayGoals: number | null;
}

/** Skutočný ligový priemer gólov doma/vonku, dopočítaný z celej tabuľky danej sezóny. */
export interface LeagueAverages {
  home: number;
  away: number;
}

/** Priemer gólov tímu z minulej sezóny - slúži ako informovanejší základ pre vyhladenie na začiatku sezóny. */
export interface TeamGoalPriors {
  forHome: number;
  forAway: number;
  againstHome: number;
  againstAway: number;
}

/** Priory tímu + koľko z kontrolovaných minulých sezón sa reálne podarilo nájsť a použiť. */
export interface TeamGoalPriorsResult {
  priors: TeamGoalPriors;
  seasonsUsed: number;
  seasonsChecked: number;
}

export interface PredictionWeights {
  poisson: number;
  form: number;
  h2h: number;
}

export interface OutcomeProbabilities {
  homeWin: number;
  draw: number;
  awayWin: number;
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
  headToHead: {
    matchesConsidered: number;
    homeWins: number;
    draws: number;
    awayWins: number;
  };
  corners?: OverUnderMarket;
  cards?: OverUnderMarket;
  shotsOnGoal?: OverUnderMarket;
  fouls?: OverUnderMarket;
  offsides?: OverUnderMarket;
  bestBets: MarketPick[];
  teamSeasonGoalsPerGame: {
    home: number;
    away: number;
  };
  topScorers: {
    home: PlayerGoalPrediction | null;
    away: PlayerGoalPrediction | null;
  };
  bestScorer: {
    team: string;
    prediction: PlayerGoalPrediction;
  } | null;
  lineupConfirmed: {
    home: boolean;
    away: boolean;
  };
  historicalDataInfo: {
    home: { seasonsUsed: number; seasonsChecked: number } | null;
    away: { seasonsUsed: number; seasonsChecked: number } | null;
  };
  tip: {
    outcome: "1" | "X" | "2";
    outcomeLabel: string;
    confidence: "nízka" | "stredná" | "vysoká";
    goalsMarket: "Over 2.5" | "Under 2.5";
  };
  sampleSizeWarning?: string;
  seasonGamesPlayed: {
    home: number;
    away: number;
  };
}

/** Jedna "noha" tiketu - samostatný tip v rámci kombinovanej stávky z viacerých zápasov. */
export interface TicketLeg {
  fixtureId: number;
  leagueId: number;
  season: number;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  market: string;
  selection: string;
  probability: number;
  status: "pending" | "won" | "lost" | "void";
  actualHomeGoals?: number | null;
  actualAwayGoals?: number | null;
}

/** Uložený tip na spätné vyhodnotenie (backtesting). */
export interface SavedTip {
  id: string;
  fixtureId: number;
  leagueId: number;
  season: number;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  matchDate: string; // ISO
  market: string; // napr. "Výsledok zápasu", "Góly", "Rohy"...
  selection: string; // napr. "Over 2.5", "Výhra Chelsea"
  probability: number;
  savedAt: string; // ISO
  status: "pending" | "won" | "lost" | "void";
  actualHomeGoals?: number | null;
  actualAwayGoals?: number | null;
  playerId?: number;
  playerName?: string;
  /** Ak je vyplnené, ide o "tiket" - kombinovanú stávku z viacerých zápasov.
   * V tom prípade market/selection/probability opisujú tiket ako celok a
   * status sa počíta z jednotlivých legs (ak čo i len jedna prehrá, prehráva
   * celý tiket - presne ako v skutočnej stávkovej kancelárii). */
  legs?: TicketLeg[];
  telegramMessageIds?: number[]; // ID správ v Telegrame (môže byť viac pri fotkách), na prípadné zmazanie
  homeTeamLogo?: string;
  awayTeamLogo?: string;
}

export interface LeaguePreset {
  id: number; // ID ligy v API-Football, napr. 39 pre Premier League
  name: string;
  country: string;
}

/** Hráč zo súpisky tímu. */
export interface SquadPlayer {
  id: number;
  name: string;
  position?: string;
  number?: number | null;
  photo?: string;
}

/** Sezónne štatistiky hráča potrebné na odhad pravdepodobnosti gólu. */
export interface PlayerSeasonStats {
  goals: number;
  appearances: number;
}

/** Sezónne góly a zápasy hráča, získané hromadne pre celý tím naraz. */
export interface RawPlayerStat {
  id: number;
  name: string;
  goals: number;
  appearances: number;
}

/** Výsledok odhadu pravdepodobnosti, že hráč v danom zápase skóruje. */
export interface PlayerGoalPrediction {
  player: { id: number; name: string };
  seasonGoals: number;
  appearances: number;
  goalsPerGame: number;
  probabilityToScore: number; // 0-100
}

/** Predplatiteľ služby (osobný alebo skupina/kanál na ďalší predaj). */
export interface Subscriber {
  id: string;
  name: string; // meno alebo názov skupiny/kanálu
  contact?: string; // email, telegram username a pod.
  tier: "individual" | "group";
  priceEur: number; // suma, ktorú platí (na prehľad mesačného príjmu)
  nextPaymentDue: string; // ISO dátum - kedy má zaplatiť najbližšiu platbu
  note?: string;
  createdAt: string; // ISO
}
