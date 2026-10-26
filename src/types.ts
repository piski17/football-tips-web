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
    logo?: string;
  };
  homeTeam: Team;
  awayTeam: Team;
  status: string;
  elapsed?: number | null; // odohraná minúta, ak zápas prebieha
  goalsHome?: number | null; // aktuálne skóre, ak zápas prebieha alebo skončil
  goalsAway?: number | null;
  /** Rozhodca zápasu, ak ho API už pozná (napr. "Michael Oliver, England"). */
  referee?: string | null;
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
  /** Priemerný počet žltých kariet tímu za zápas (celá sezóna). */
  cardsPerGame: number;
}

/** Jeden konkrétny odporúčaný tip naprieč trhmi, zoraditeľný podľa istoty. */
export interface MarketPick {
  market: string; // napr. "Výsledok zápasu", "Rohy", "Karty"
  selection: string; // napr. "Výhra Chelsea", "Over 9.5", "Under 3.5"
  probability: number; // 0-100
  category: string; // na skupinovanie podobných trhov, aby appka nedávala 2 podobné tipy naraz
  explanation?: string; // krátke vysvetlenie, prečo model tento tip odporúča
  /** Pravdepodobnosť pred kalibráciou (pre hľadanie najlepšieho nastavenia v spätnom teste). */
  rawProbability?: number;
  /** Menší z počtov odohraných zápasov oboch tímov v sezóne. */
  minGamesPlayed?: number;
  /** Skutočný kurz (medián stávkoviek z API-Football), ak je k dispozícii. */
  odds?: number | null;
  /**
   * Držanie lopty (17. 10. 2026): API naň kurzy nemá, preto model povie minimálny
   * kurz (hodnota +5 %, aspoň 1,50) a skutočný kurz Michal overí v stávkovke.
   */
  minOdds?: number;
  /** Z koľkých stávkoviek kurz pochádza. */
  oddsBookmakers?: number;
  /** Očakávaná hodnota: pravdepodobnosť × kurz (napr. 1,08 = +8 %). */
  expectedValue?: number | null;
  /** Upozornenie pri tipe, ktorý ostal v odporúčaniach (napr. podozrivo vysoká hodnota). */
  valueWarning?: string;
  /** Prešiel len vďaka zmierneniu filtra rozporu (22. 10. 2026) – ukladá sa len do sledovaných. */
  softConflict?: boolean;
  /** Pri softConflict: šanca modelu pred spojením so stávkovkami a pôvodná hranica rozporu. */
  conflictModel?: number;
  conflictLimit?: number;
  /** Dôvod, prečo bol tip vyradený (len pri lowValueBets). */
  rejectReason?: string;
  /**
   * Meranie (20. 10. 2026): strojový kód dôvodu vyradenia pre tichú evidenciu
   * (napr. "ev_low", "min_odds", "conflict", "category_lower_ev"). Na výber nemá vplyv.
   */
  rejectCode?: string;
  /** Oprava presnosti trhu (k), ak bola použitá – marketHealth.ts. */
  marketCalibration?: number;
  /** Pri málo dátach: model a stávkovky sa líšia o 15+ bodov (dôvod vyradenia). */
  marketConflict?: string;
  /** Pri rozpore: čistý odhad modelu a odhad stávkoviek (v %), pre tichú evidenciu. */
  modelProbability?: number;
  marketProbability?: number;
  /** Vždy, keď sú kurzy: čistý odhad modelu a odhad stávkoviek (v %) – pre sledovanie miešania. */
  blendModel?: number;
  blendMarket?: number;
}

/** Odhad pre trh typu Over/Under (rohy, karty) založený na kombinovanom Poissonovom modeli. */
export interface OverUnderMarket {
  expected: number;
  line: number;
  over: number;
  under: number;
}

/** Jeden odohraný vzájomný zápas dvoch tímov. */
/** Štatistiky jedného vzájomného zápasu (držanie lopty z pohľadu dnešných domácich). */
export interface H2HStats {
  corners: number | null;
  cards: number | null;
  shotsOnGoal: number | null;
  fouls: number | null;
  offsides: number | null;
  homePossession: number | null;
}

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
  /** Verzia modelu (MODEL_VERSION), ktorá výsledok vypočítala. */
  modelVersion?: string;
  /** Rozhodca a jeho vplyv na fauly a karty (null = neznámy alebo málo dát). */
  referee?: RefereeProfile | null;
  /** Očakávané držanie lopty domácich v % a smerodajná odchýlka (pre výpočet hranice). */
  possession?: { expectedHome: number; sd: number } | null;
  /** Modely trhov nad/pod pre kalkulačku hranice zo stávkovky. */
  lineModels?: { market: string; category: string; mean: number; varRatio: number; calibration: number }[];
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
    /** Posledné vzájomné zápasy (najnovšie prvé) – góly z pohľadu dnešných domácich/hostí. */
    matches?: { date: string; homeGoals: number; awayGoals: number; homeWasHome: boolean; usedInModel: boolean }[];
    /** Koľko vzájomných zápasov model započítal do odhadu (0 = nepoužité). */
    usedInModel?: number;
  };
  corners?: OverUnderMarket;
  cards?: OverUnderMarket;
  shotsOnGoal?: OverUnderMarket;
  fouls?: OverUnderMarket;
  offsides?: OverUnderMarket;
  bestBets: MarketPick[];
  /** Tipy v pásme dôvery (68–80 %), ktoré vypadli pre príliš nízky skutočný kurz. */
  lowValueBets?: MarketPick[];
  /** Všetci kandidáti (najpravdepodobnejšia voľba pre každý trh) – pre spätný test. */
  allCandidates?: MarketPick[];
  /** Či boli pre zápas k dispozícii skutočné kurzy stávkoviek. */
  oddsAvailable?: boolean;
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
  /** Skutočný kurz v čase pridania do tiketu (ak bol k dispozícii). */
  odds?: number | null;
  /** Tip bol vyradený kontrolou kurzu, ale pridaný ručne ("mimo filtra"). */
  overrideFilter?: boolean;
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
  /** Skutočný kurz v čase uloženia (medián stávkoviek), ak bol k dispozícii. */
  odds?: number | null;
  /** Kurz z API (medián stávkoviek) v čase uloženia; `odds` je kurz Michalovej stávkovky. */
  apiOdds?: number | null;
  /** Uzatvárací kurz – kurz toho istého tipu tesne pred výkopom (null = nepodarilo sa zistiť). */
  closingOdds?: number | null;
  closingOddsAt?: string;
  /**
   * Meranie (20. 10. 2026) – všetko nepovinné, staršie tipy tieto polia nemajú:
   *  - modelVersion: verzia modelu v čase uloženia (MODEL_VERSION z predictor.ts),
   *  - marketProb: pravdepodobnosť stávkoviek pre tento tip v % (bez marže, ak boli
   *    kurzy oboch strán – marketProbDevig = true; inak 1 / kurz),
   *  - hoursBeforeKickoff: koľko hodín pred výkopom bol tip uložený,
   *  - closingMarketProb / closingDevig: to isté z kurzov tesne pred výkopom (CLV).
   */
  modelVersion?: string;
  marketProb?: number | null;
  marketProbDevig?: boolean;
  hoursBeforeKickoff?: number;
  closingMarketProb?: number | null;
  closingDevig?: boolean;
  /** Oprava presnosti trhu (k), ktorá platila pri uložení tipu (21. 10. 2026, marketHealth.ts). */
  marketCalibration?: number;
  /** Tip (alebo niektorý zápas tiketu) bol vyradený kontrolou kurzu, ale uložený ručne - "mimo filtra". */
  overrideFilter?: boolean;
  /** Tip doplnený ručne po zápase (s výsledkom) - neprechádza automatickým vyhodnotením. */
  manualEntry?: boolean;
  /** Tip obnovený z denného súhrnu (18. 10. 2026) – dôvera modelu nie je známa, ak nebola v texte tipu. */
  restoredFromDaily?: boolean;
  probabilityEstimated?: boolean;
  /** Len sledovať: tip sa vyhodnotí, ale neráta sa do štatistík, nie je na webe a neposiela sa členom. */
  watchOnly?: boolean;
  /** Tip s rozporom so stávkovkami, ktorý prešiel len vďaka zmierneniu filtra. */
  softConflict?: boolean;
  /** Tip skrytý z histórie tipov - naďalej sa ráta do štatistík a zobrazuje na prezentačnej stránke. */
  archived?: boolean;
  /** Výsledok alebo kurz bol ručne opravený v histórii. */
  edited?: boolean;
  /**
   * Kontrola po zverejnení zostáv (25. 10. 2026): tip sa ~60 min pred výkopom prepočíta
   * s potvrdenými zostavami. ok = tip stále spĺňa pravidlá (dôvera, hodnota, rozpor).
   */
  lineupCheck?: { at: string; probability: number | null; ok: boolean; reason?: string };
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
  telegramMessages?: { chatId: string; messageId: number }[]; // kam presne bola správa poslaná, na prípadné zmazanie
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  /** Tip bol vo VIP kanáli odoslaný ako „⭐ Silný tip dňa“ (najviac jeden za deň). */
  strongOfDay?: boolean;
  sentFree?: boolean; // tip bol poslaný do bezplatného kanála – ukáže sa na tipradar.eu ako „Tip zadarmo“
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
  /** Asistencie v sezóne (na odhad dôležitosti chýbajúceho hráča). */
  assists?: number;
  /** Odohrané minúty v sezóne. */
  minutes?: number;
  /** Pozícia: Goalkeeper / Defender / Midfielder / Attacker. */
  position?: string;
  /** Strely na bránu v sezóne. */
  shotsOn?: number;
  /** Premenené penalty v sezóne (penaltový exekútor). */
  penaltyScored?: number;
  /** Zápasy v základnej zostave. */
  starts?: number;
}

/** Hráč, ktorý v zápase chýba (zranenie, trest) – z API-Football /injuries. */
export interface MissingPlayer {
  playerId: number;
  name: string;
  teamId: number;
  reason: string;
}

/** Výsledok odhadu pravdepodobnosti, že hráč v danom zápase skóruje. */
export interface PlayerGoalPrediction {
  player: { id: number; name: string };
  seasonGoals: number;
  appearances: number;
  goalsPerGame: number;
  probabilityToScore: number; // 0-100
  /** Odohrané minúty v sezóne (ak sú známe). */
  minutes?: number;
  /** Góly na 90 minút po vyrovnaní malej vzorky (podľa pozície). */
  goalsPer90?: number;
  /** Strely na bránu na 90 minút. */
  shotsOnPer90?: number;
  /** Kopal a premenil v sezóne aspoň jednu penaltu. */
  penaltyTaker?: boolean;
  /** Koľko minút asi odohrá v tomto zápase. */
  expectedMinutes?: number;
  /** Je v potvrdenej základnej zostave. */
  inLineup?: boolean;
}

/** Jedno obdobie členstva (od – do). free = mesiac zadarmo podľa garancie. */
export interface MemberPeriod {
  start: string;
  end: string;
  free?: boolean;
}

/** Predplatiteľ služby (osobný alebo skupina/kanál na ďalší predaj) - používa len web appka. */
export interface Subscriber {
  id: string;
  name: string;
  contact?: string;
  telegramChatId?: string; // voliteľné - ak vyplnené, appka mu vie poslať osobnú pripomienku pred obnovením
  tier: "individual" | "group"; // individual = Gold (50 dní) / Onyx (6 mesiacov), group = staršie členstvo na 6 mesiacov (zrušené 24. 10. 2026)
  priceEur: number;
  nextPaymentDue: string; // ISO dátum – do kedy má členstvo zaplatené
  length?: "m1" | "m3" | "season"; // dĺžka členstva: m1 = Gold 50 dní, m3 = Onyx 6 mesiacov (staršie záznamy bez dĺžky = m1)
  startDate?: string; // ISO dátum začiatku členstva
  periodStart?: string; // ISO začiatok aktuálneho obdobia (zaplateného alebo mesiaca zadarmo), koniec = nextPaymentDue
  freePeriod?: boolean; // aktuálne obdobie je mesiac zadarmo podľa garancie (garancia sa naň nevzťahuje)
  pastPeriods?: MemberPeriod[]; // predošlé obdobia (posledných pár), aby sa dali vyhodnotiť aj po predĺžení
  guarantees?: { periodStart: string; periodEnd: string; profit: number; appliedAt: string; freeUntil: string }[]; // použité garancie
  founder?: boolean; // „Prví členovia“ – zamknutá cena
  cardSent?: boolean; // VIP kovová karta odoslaná
  note?: string;
  createdAt: string; // ISO
}

/** Ako rozhodca ovplyvňuje fauly a karty oproti priemeru ligy (1 = bez vplyvu). */
export interface RefereeProfile {
  name: string;
  games: number;
  foulsFactor: number;
  cardsFactor: number;
  avgFouls: number | null;
  avgCards: number | null;
}
