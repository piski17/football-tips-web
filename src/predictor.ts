import {
  MarketOdds,
  findOdds,
  marketProbability,
  offeredLines,
  MIN_EXPECTED_VALUE,
  MIN_ODDS,
  SUSPICIOUS_EXPECTED_VALUE,
  MIN_GAMES_FOR_TRUST,
  MIN_GAMES_TO_RECOMMEND,
  MIN_PROBABILITY,
  MAX_PROBABILITY,
  MIN_BOOKMAKERS,
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
  RawPlayerStat, H2HStats, MissingPlayer, RefereeProfile } from "./types";

/**
 * Verzia modelu (20. 10. 2026): zapisuje sa ku každému uloženému tipu a do tichej
 * evidencie, aby sa výsledky dali porovnávať len v rámci jednej verzie. Pri každej
 * zmene modelu, kalibrácie alebo filtrov ju zmeň (napr. na dátum zmeny).
 */
export const MODEL_VERSION = "2026-10-25b"; // pásmo 68 – 80 %, minimálny kurz 1,50
/** Verzia, ktorá sa zapíše, keď tipy vyberá nový model (xG, únava, doma/vonku). */
export const NEW_MODEL_VERSION = `${MODEL_VERSION}-novy`;

/**
 * Nový model (21. 10. 2026, Michalovo rozhodnutie): beží potichu vedľa súčasného, kým
 * porovnanie v reporte neukáže, ktorý je presnejší. Prepnúť sa dá jedným klikom.
 *  - xg: pomer „60 % xG + 40 % góly“ ku gólom (útok a obrana) z posledných zápasov,
 *  - rest: oddych tímov (dni od posledného zápasu, počet zápasov za 14 dní),
 *  - priemery rohov, kariet, striel a faulov len z domácich / vonkajších zápasov dodá
 *    server cez bežné parametre (extraStatsAvg, homeCornersAvg…).
 */
export interface ModelVariant {
  xg?: { homeFor: number | null; homeAgainst: number | null; awayFor: number | null; awayAgainst: number | null } | null;
  rest?: { home: { restDays: number | null; games14: number } | null; away: { restDays: number | null; games14: number } | null } | null;
}

/**
 * Úpravy trhov podľa ostrých výsledkov (21. 10. 2026), počíta ich server (marketHealth.ts):
 *  - disabled: trh sa dočasne neodporúča (po 30+ tipoch bez zisku a bez lepšieho kurzu),
 *  - calibration: oprava percent trhu p' = 50 + k × (p − 50) (po 50+ tipoch).
 */
export interface MarketAdjustments {
  disabled?: Record<string, string>;
  calibration?: Record<string, number>;
}

/** Kategória trhu podľa jeho názvu (rovnaká ako `category` pri tipoch modelu). */
export function marketCategory(market: string): string | null {
  const m = String(market || "");
  if (m === "Góly") return "goly";
  if (m === "Góly domácich" || m === "Góly hostí") return "goly_timu";
  if (m === "Rohy") return "rohy";
  if (m === "Rohy domácich" || m === "Rohy hostí") return "rohy_timu";
  if (m === "Karty") return "karty";
  if (m === "Karty domácich" || m === "Karty hostí") return "karty_timu";
  if (m === "Strely na bránu") return "strely";
  if (m === "Strely na bránu domácich" || m === "Strely na bránu hostí") return "strely_timu";
  if (m === "Fauly") return "fauly";
  if (m === "Fauly domácich" || m === "Fauly hostí") return "fauly_timu";
  if (m === "Góly v 1. polčase") return "goly_1p";
  if (m === "Góly v 2. polčase") return "goly_2p";
  if (m === "Karty v 1. polčase") return "karty_1p";
  if (m === "Karty v 2. polčase") return "karty_2p";
  if (m.startsWith("Držanie lopty")) return "drzanie_lopty";
  return null;
}

/**
 * Únava (nový model): po 2 dňoch voľna tím útočí o 6 % menej, po 3 dňoch o 3 %;
 * 4 a viac zápasov za 14 dní uberie ďalšie 2 %. Unavený tím aj o polovicu toho viac dostáva.
 */
function fatigueFactor(r: { restDays: number | null; games14: number } | null | undefined): number {
  if (!r) return 1;
  let f = 1;
  if (r.restDays != null) f *= r.restDays <= 2 ? 0.94 : r.restDays === 3 ? 0.97 : 1;
  if (r.games14 >= 4) f *= 0.98;
  return f;
}

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
// 6. 10. 2026 prepočítané podľa dvoch spätných testov po 300 zápasov
// (aug. – okt. 2024 a mar. – máj 2025, „Hľadanie najlepšieho nastavenia").
// Hodnoty, pri ktorých sa oba testy zhodli: rohy 0,70 – 0,75, rohy tímu 0,75,
// fauly 0,80, strely 0,85 – 0,95, karty 0,80 (koniec sezóny) / 0,60 (začiatok),
// góly a góly tímu 0,90 – 1,00. Pôvodná kalibrácia (strely 0,5, góly 0,67)
// bola príliš prísna – model potom podceňoval.
// 3. test (aug. – dec. 2023, 298 zápasov, mimo obdobia kalibrácie): pásmo 68 – 80 %
// model 73 % → realita 73 %. Strely tam v pásme vychádzali len na 65 % (najlepšie k
// 0,70), preto 0,8 = priemer troch testov (0,85 / 0,95 / 0,70).
// 17. 10. 2026 (po pridaní rozhodcov a väčšieho rozptylu faulov a rohov) dva spätné
// testy po 300 zápasov: aug. – okt. 2024 a aug. – okt. 2026. Model bol v oboch
// príliš opatrný (pásmo 68 – 80 %: model 73 % → realita 78 %). Zmenené len trhy,
// kde sa oba testy zhodli: fauly 0,95 / 0,90, rohy tímu 0,80 / 0,85, strely tímu
// 0,95 / 1,00, karty aj karty tímu 1,00 / 1,00 (oba testy sú zo začiatku sezóny,
// koniec sezóny overený nie je – preto karty 0,9 a bez zvláštnej úpravy na začiatku).
// Rohy (0,70 / 0,90) a strely (0,80 / 1,00) sa nezhodli – ostávajú.
const MARKET_CALIBRATION: Record<string, number> = {
  strely: 0.8,
  // Fauly 0,9: spätné testy z 20. 10. 2026 (mar. – máj 2025 a aug. – okt. 2025, po 300
  // zápasov) našli najlepšie 0,90 a 1,00, pokus s 0,8 bol príliš prísny.
  fauly: 0.9,
  rohy: 0.72,
  rohy_timu: 0.8,
  karty: 0.9,
  karty_timu: 0.9,
  strely_timu: 0.95,
  // Nové trhy (22. 10. 2026) – zatiaľ bez spätného testu, preto rovnako ako príbuzný trh.
  fauly_timu: 0.9,
  karty_1p: 0.9,
  karty_2p: 0.9,
};
/**
 * Podiel gólov a žltých kariet v 1. polčase (22. 10. 2026). V európskych ligách padá
 * v 1. polčase približne 45 % gólov a 38 % žltých kariet (zvyšok v 2. polčase).
 */
const FIRST_HALF_GOAL_SHARE = 0.45;
const FIRST_HALF_CARD_SHARE = 0.38;
// Góly „pod“ (zápas aj tím) – 20. 10. 2026 podľa rozboru 35 ostrých tipov: model sľuboval
// ~70 %, vyšlo 7 z 13 (54 %), kým tipy „nad“ vyšli 10 z 10. Šanca „pod“ sa preto zmenší
// k 50 % (navyše k ostatnej kalibrácii) a rozpor so stávkovkami sa toleruje najviac 12 bodov.
const GOALS_UNDER_CALIBRATION = 0.85;
/**
 * Spojenie so stávkovkami (20. 10. 2026, Michalovo rozhodnutie): keď sú k tipu kurzy,
 * výsledná šanca = 70 % model + 30 % stávkovky (bez marže). Stávkovky poznajú zranenia,
 * zostavy a motiváciu, ktoré model nevidí. Pri málo dátach v sezóne platí väčšia váha trhu.
 */
const MARKET_BLEND = 0.3;
const GOALS_UNDER_CONFLICT_LIMIT = 12;
const isGoalsUnder = (c: { category: string; selection: string }) =>
  (c.category === "goly" || c.category === "goly_timu" || c.category === "goly_1p" || c.category === "goly_2p") && c.selection.startsWith("Under");
/**
 * Poradie tipov pri výbere hranice a tipu zápasu (20. 10. 2026): hodnota sa počíta zo
 * šance napoly modelu a napoly stávkoviek. Model tak nevyberá automaticky hranicu,
 * kde sa so stávkovkami najviac rozchádza (napr. „pod 4,5“), ale tú, kde je hodnota istejšia.
 */
function rankValue(b: MarketPick): number {
  if (typeof b.blendMarket === "number" && typeof b.odds === "number" && b.odds > 1)
    return ((b.probability + b.blendMarket) / 200) * b.odds;
  return b.expectedValue ?? 0;
}
const EARLY_SEASON_CALIBRATION: Record<string, number> = {
  goly: 0.9,
  goly_timu: 0.9,
  goly_1p: 0.9,
  goly_2p: 0.9,
  btts: 0.5,
};
/**
 * Góly v Lige majstrov a Európskej lige (22. 10. 2026): dva spätné testy len z LM a EL
 * (sept. 2024 – jan. 2025 a sept. 2025 – jan. 2026, po 100 zápasov, už so silou líg) –
 * model preceňoval góly (zápas 72 → 66 % a 71 → 67 %, góly domácich 75 → 70 %,
 * 1. polčas 69 → 61 %). Najlepšie k v oboch testoch 0,80 a menej – preto navyše × 0,85.
 * Góly v 2. polčase sedeli, tie ostávajú.
 */
const CUP_GOAL_CALIBRATION: Record<string, number> = { goly: 0.85, goly_timu: 0.85, goly_1p: 0.85 };
const CUP_LEAGUE_IDS = [2, 3];
/** Koeficient kalibrácie pre trh pri danom počte odohraných zápasov v sezóne. */
function calibrationFactor(category: string, gamesPlayed: number, leagueId?: number): number {
  const early = clamp((15 - gamesPlayed) / 10, 0, 1);
  const ke = EARLY_SEASON_CALIBRATION[category] ?? 1;
  const cup = leagueId != null && CUP_LEAGUE_IDS.includes(leagueId) ? CUP_GOAL_CALIBRATION[category] ?? 1 : 1;
  return (MARKET_CALIBRATION[category] ?? 1) * (1 - (1 - ke) * early) * cup;
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
/** Hranice držania lopty (v %), ktoré model skúša pri tipoch (stávkovky ich cez API neponúkajú). */
const POSSESSION_LINES = [30.5, 35.5, 40.5, 45.5, 50.5, 55.5, 60.5, 65.5, 70.5];

// Hranice, ktoré model skúša, keď stávkovky k zápasu ešte nemajú kurzy (a v spätnom
// teste). Keď kurzy sú, model vyhodnotí presne tie hranice, ktoré stávkovky ponúkajú.
const DEFAULT_LINES: Record<string, number[]> = {
  "Góly": [1.5, 2.5, 3.5],
  "Góly domácich": [0.5, 1.5, 2.5],
  "Góly hostí": [0.5, 1.5, 2.5],
  "Rohy": [8.5, 9.5, 10.5],
  "Rohy domácich": [3.5, 4.5, 5.5, 6.5],
  "Rohy hostí": [3.5, 4.5, 5.5, 6.5],
  "Karty": [2.5, 3.5, 4.5],
  "Karty domácich": [0.5, 1.5, 2.5],
  "Karty hostí": [0.5, 1.5, 2.5],
  "Strely na bránu": [7.5, 8.5, 9.5],
  "Strely na bránu domácich": [2.5, 3.5, 4.5, 5.5],
  "Strely na bránu hostí": [2.5, 3.5, 4.5, 5.5],
  "Fauly": [20.5, 21.5, 22.5],
  "Fauly domácich": [9.5, 10.5, 11.5, 12.5],
  "Fauly hostí": [9.5, 10.5, 11.5, 12.5],
  "Góly v 1. polčase": [0.5, 1.5],
  "Góly v 2. polčase": [0.5, 1.5, 2.5],
  "Karty v 1. polčase": [0.5, 1.5, 2.5],
  "Karty v 2. polčase": [1.5, 2.5, 3.5],
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
// Fauly a rohy kolíšu viac, ako predpokladá čistý Poisson (raz 18, raz 32 faulov),
// preto aj pri nich počítame s väčším rozptylom – inak model tipy nadhodnocuje.
const VAR_RATIO = { cards: 1.4, shotsOnGoal: 1.35, offsides: 1.3, fouls: 1.3, corners: 1.2 };

// Vplyv chýbajúcich hráčov (6. 10. 2026). Útok: podiel chýbajúcich na góloch
// a asistenciách tímu (asistencia = pol gólu) × ATTACK_WEIGHT, najviac −15 %.
// Obrana: podiel chýbajúcich obrancov a brankára na ich odohraných minútach
// × DEFENSE_WEIGHT, súperovi najviac +10 %. Ak by hráči chýbali celú sezónu,
// ich góly v štatistikách tímu aj tak nie sú – preto sa rátajú len hráči,
// ktorí v sezóne naozaj hrali.
const ABSENCE_ATTACK_WEIGHT = 0.5;
const ABSENCE_ATTACK_MIN = 0.85;
const ABSENCE_DEFENSE_WEIGHT = 0.35;
const ABSENCE_DEFENSE_MAX = 1.1;

interface TeamAbsence { attack: number; defense: number; names: string[]; benched: string[] }

// Hráč z potvrdenej zostavy, ktorý začína na lavičke, sa počíta ako chýbajúci na polovicu
// (môže prísť na ihrisko). Hráči úplne mimo zostavy sa nepočítajú – mohli medzitým prestúpiť.
const BENCH_ABSENCE_SHARE = 0.5;

function teamAbsence(players: RawPlayerStat[] | undefined, missingIds: Set<number>, benchIds: Set<number> = new Set()): TeamAbsence {
  const none = { attack: 1, defense: 1, names: [] as string[], benched: [] as string[] };
  if (!players || players.length === 0 || (missingIds.size === 0 && benchIds.size === 0)) return none;
  const contrib = (p: RawPlayerStat) => (p.goals ?? 0) + 0.5 * (p.assists ?? 0);
  const share = (p: RawPlayerStat) => (missingIds.has(p.id) ? 1 : benchIds.has(p.id) ? BENCH_ABSENCE_SHARE : 0);
  const total = players.reduce((a, p) => a + contrib(p), 0);
  const missing = players.filter((p) => share(p) > 0 && (p.appearances ?? 0) > 0);
  if (missing.length === 0) return none;
  const attackShare = total > 0 ? missing.reduce((a, p) => a + share(p) * contrib(p), 0) / total : 0;
  const isDef = (p: RawPlayerStat) => p.position === "Defender" || p.position === "Goalkeeper";
  const defMinutes = players.filter(isDef).reduce((a, p) => a + (p.minutes ?? 0), 0);
  // pomer k jednej základnej zostave (4 obrancovia + brankár), nie k celému kádru
  const games = Math.max(1, ...players.map((p) => p.appearances ?? 0));
  const defLineupMinutes = Math.min(defMinutes, 5 * 90 * games);
  const defShare = defLineupMinutes > 0 ? missing.filter(isDef).reduce((a, p) => a + share(p) * (p.minutes ?? 0), 0) / defLineupMinutes : 0;
  const byImportance = (a: RawPlayerStat, b: RawPlayerStat) => contrib(b) - contrib(a) || (b.minutes ?? 0) - (a.minutes ?? 0);
  // Na lavičke vypíšeme len hráčov, ktorí niečo znamenajú (góly/asistencie alebo veľa minút).
  const notable = (p: RawPlayerStat) => contrib(p) >= 1 || (p.minutes ?? 0) >= 45 * games;
  return {
    attack: clamp(1 - ABSENCE_ATTACK_WEIGHT * attackShare, ABSENCE_ATTACK_MIN, 1),
    defense: clamp(1 + ABSENCE_DEFENSE_WEIGHT * defShare, 1, ABSENCE_DEFENSE_MAX),
    names: missing.filter((p) => missingIds.has(p.id)).sort(byImportance).map((p) => p.name),
    benched: missing.filter((p) => !missingIds.has(p.id) && notable(p)).sort(byImportance).map((p) => p.name),
  };
}

/** Model trhu nad/pod pre kalkulačku: priemer, rozptyl/priemer (1 = Poisson) a kalibrácia. */
export interface LineModel {
  market: string;
  category: string;
  mean: number;
  varRatio: number;
  calibration: number;
}

export interface LineupInfo {
  homeIds?: number[] | null;
  awayIds?: number[] | null;
  homeStartIds?: number[] | null;
  awayStartIds?: number[] | null;
}

function absenceEffects(
  fixture: Fixture,
  homePlayers: RawPlayerStat[] | undefined,
  awayPlayers: RawPlayerStat[] | undefined,
  missing: MissingPlayer[] | undefined,
  lineup?: LineupInfo | null
): { home: TeamAbsence; away: TeamAbsence; text: string } | null {
  const ids = (teamId: number) => new Set((missing ?? []).filter((m) => m.teamId === teamId).map((m) => m.playerId));
  // Lavička = hráči v zápisnici, ktorí nie sú v základnej jedenástke (len keď je zostava potvrdená).
  const bench = (all?: number[] | null, start?: number[] | null) =>
    new Set(all && start ? all.filter((id) => !start.includes(id)) : []);
  const home = teamAbsence(homePlayers, ids(fixture.homeTeam.id), bench(lineup?.homeIds, lineup?.homeStartIds));
  const away = teamAbsence(awayPlayers, ids(fixture.awayTeam.id), bench(lineup?.awayIds, lineup?.awayStartIds));
  if (!home.names.length && !away.names.length && !home.benched.length && !away.benched.length) return null;
  const list = (names: string[]) => names.slice(0, 3).join(", ") + (names.length > 3 ? ` a ďalší (${names.length - 3})` : "");
  const part = (name: string, t: TeamAbsence) => {
    if (!t.names.length && !t.benched.length) return null;
    const bits = [
      t.names.length ? `chýbajú ${list(t.names)}` : null,
      t.benched.length ? `na lavičke ${list(t.benched)}` : null,
    ].filter(Boolean);
    const eff = t.attack < 0.995 ? ` (útok −${Math.round((1 - t.attack) * 100)} %)` : "";
    return `${name}: ${bits.join(", ")}${eff}`;
  };
  const parts = [part(fixture.homeTeam.name, home), part(fixture.awayTeam.name, away)].filter(Boolean);
  return { home, away, text: `Zostavy – ${parts.join("; ")}.` };
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

/** Distribučná funkcia normovaného normálneho rozdelenia (aproximácia, presnosť ~1e-7). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}


// ---- Vzájomné zápasy: doplnok k odhadu z dlhodobých priemerov ----
// Váha rastie s počtom zápasov (za posledných 5 rokov, najviac 5 najnovších):
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
/** Vzájomné zápasy sa berú za posledných 5 rokov (5 sezón) – staršie už pre dnešné tímy veľa nehovoria (21. 10. 2026, Michalovo rozhodnutie). */
const H2H_YEARS = 5;
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
// 22. 10. 2026 (Michalovo rozhodnutie): zmiernené o 5 bodov (predtým 15 / 20 / 25) – tiché
// sledovanie: tipy vyradené pre rozpor vyšli 38 z 51 (75 %, stávkovky čakali 63 %, +7,1 j.).
function marketConflictLimit(h2hMatchesUsed: number): number {
  return h2hMatchesUsed >= 5 ? 30 : h2hMatchesUsed >= 3 ? 25 : 20;
}

/** Súťaže, v ktorých stávkovky neponúkajú držanie lopty: Liga majstrov (2), Európska liga (3). */
export const NO_POSSESSION_LEAGUE_IDS = [2, 3];

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
  legacy: boolean = false,
  /** Hráči, ktorí v zápase chýbajú (zranenia, tresty). */
  missingPlayers?: MissingPlayer[],
  /**
   * Pri pohárových súťažiach (Liga majstrov): menší z počtov zápasov oboch tímov
   * v tejto sezóne vo VŠETKÝCH súťažiach. Pravidlo „aspoň 3 zápasy" sa potom
   * posudzuje podľa neho, nie podľa 1 – 2 zápasov v skupine/ligovej fáze.
   */
  seasonGamesAnyCompetition?: number | null,
  /** Vplyv rozhodcu na fauly a karty (null = rozhodca neznámy alebo málo dát). */
  referee?: RefereeProfile | null,
  /** Potvrdená zostava so základnou jedenástkou (ak je už zverejnená). */
  lineup?: LineupInfo | null,
  /** Nový model (xG, únava) – bez neho súčasný model. */
  variant?: ModelVariant | null,
  /** Vypnuté trhy a oprava percent podľa ostrých výsledkov. */
  adjust?: MarketAdjustments | null
): PredictionResult {
  // Nový model – únava: menej rohov a striel unaveného tímu (zvyšok nižšie pri góloch).
  const tiredHome = fatigueFactor(variant?.rest?.home);
  const tiredAway = fatigueFactor(variant?.rest?.away);
  if (variant && (tiredHome < 1 || tiredAway < 1)) {
    if (homeCornersAvg != null) homeCornersAvg *= tiredHome;
    if (awayCornersAvg != null) awayCornersAvg *= tiredAway;
    if (extraStatsAvg) {
      extraStatsAvg = { ...extraStatsAvg };
      if (extraStatsAvg.homeShotsOnGoal != null) extraStatsAvg.homeShotsOnGoal *= tiredHome;
      if (extraStatsAvg.awayShotsOnGoal != null) extraStatsAvg.awayShotsOnGoal *= tiredAway;
    }
  }
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
  // Nový model – xG: góly sa doplnia o kvalitu šancí (60 % xG + 40 % góly) a únavu.
  if (variant) {
    const vx = variant.xg;
    const r = (x: number | null | undefined) => (x == null || !isFinite(x) ? 1 : x);
    const homeX = vx ? clamp(r(vx.homeFor) * r(vx.awayAgainst), 0.8, 1.25) : 1;
    const awayX = vx ? clamp(r(vx.awayFor) * r(vx.homeAgainst), 0.8, 1.25) : 1;
    xg.home = clamp(xg.home * homeX * tiredHome * (1 + (1 - tiredAway) / 2), 0.15, 5);
    xg.away = clamp(xg.away * awayX * tiredAway * (1 + (1 - tiredHome) / 2), 0.15, 5);
  }
  // Vzájomné zápasy spresnia očakávané góly (výsledok, góly, oba tímy skórujú…).
  const h2hG = h2hGoals(h2h, fixture.homeTeam.id);
  if (h2hG && h2hG.weight > 0) {
    xg.home = (1 - h2hG.weight) * xg.home + h2hG.weight * h2hG.home;
    xg.away = (1 - h2hG.weight) * xg.away + h2hG.weight * h2hG.away;
  }
  // Chýbajúci hráči (zranenia, tresty): útok tímu oslabí podiel chýbajúcich na
  // góloch a asistenciách, súperovi pridá výpadok obrancov a brankára.
  const absences = legacy ? null : absenceEffects(fixture, homePlayers, awayPlayers, missingPlayers, lineup);
  if (absences) {
    xg.home = clamp(xg.home * absences.home.attack * absences.away.defense, 0.15, 5);
    xg.away = clamp(xg.away * absences.away.attack * absences.home.defense, 0.15, 5);
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
    if (b.h2h) h2hNotes.rohy = `Vo vzájomných zápasoch (${b.h2h.n}) padlo v priemere ${fmt1(b.h2h.avg)} rohu.`;
    const { over, under } = overdispersedOverUnder(expected, CORNERS_LINE, VAR_RATIO.corners);
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
    const expectedCards = cardsBlend.value * (referee?.cardsFactor ?? 1);
    if (cardsBlend.h2h) h2hNotes.karty = `Vo vzájomných zápasoch (${cardsBlend.h2h.n}) padlo v priemere ${fmt1(cardsBlend.h2h.avg)} karty.`;
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
    const expected = b.value * (referee?.foulsFactor ?? 1);
    if (b.h2h) h2hNotes.fauly = `Vo vzájomných zápasoch (${b.h2h.n}) v priemere ${fmt1(b.h2h.avg)} faulov.`;
    const { over, under } = overdispersedOverUnder(expected, FOULS_LINE, VAR_RATIO.fouls);
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
  const recentGoalsText =
    (recentParts.length ? ` Góly v posledných zápasoch (priemer, dané:dostané): ${recentParts.join(", ")}.` : "") +
    (absences?.text ? ` ${absences.text}` : "");

  const resultExplanation = `${fixture.homeTeam.name} ${homeFormText}, ${
    fixture.awayTeam.name
  } ${awayFormText}. Posledných ${h2hResult.homeWins + h2hResult.draws + h2hResult.awayWins} vzájomných zápasov: ${
    h2hResult.homeWins
  }-${h2hResult.draws}-${h2hResult.awayWins} (výhry domácich – remízy – výhry hostí). Očakávané góly ${xg.home.toFixed(
    1
  )}:${xg.away.toFixed(1)}.${recentGoalsText}`;

  const golyExplanation = `Očakávaný súčet gólov v zápase je ${(xg.home + xg.away).toFixed(1)} (${
    fixture.homeTeam.name
  } ${xg.home.toFixed(1)}, ${fixture.awayTeam.name} ${xg.away.toFixed(1)}).${absences?.text ? ` ${absences.text}` : ""}`;

  const bttsExplanation = `Očakávané góly: ${fixture.homeTeam.name} ${xg.home.toFixed(1)}, ${
    fixture.awayTeam.name
  } ${xg.away.toFixed(1)} – oba tímy majú reálnu šancu skórovať.`;

  // Rozhodca (17. 10. 2026): pri faulov a kartách krátka poznámka, o koľko ich posunul.
  const refereeNote = (kind: "fouls" | "cards"): string => {
    if (!referee) return "";
    const f = kind === "fouls" ? referee.foulsFactor : referee.cardsFactor;
    const pct = Math.round((f - 1) * 100);
    const eff = pct === 0 ? "bez úpravy" : `${pct > 0 ? "+" : "−"}${Math.abs(pct)} %`;
    const avg = kind === "fouls" ? referee.avgFouls : referee.avgCards;
    const what = kind === "fouls" ? "faulu" : "žltej karty"; // desatinné číslo -> gen. sg. (23,4 faulu)
    return ` Rozhodca ${referee.name}: v posledných ${referee.games} zápasoch ligy v priemere ${avg != null ? fmt1(avg) : "?"} ${what} (${eff}).`;
  };
  const statExplanation = (expected: number, line: number): string =>
    `Priemer oboch tímov v tejto štatistike za posledné zápasy je ${expected.toFixed(
      1
    )}, oproti hranici ${line} ide o jasný rozdiel.`;


  // Každý kandidát má aj "kategóriu" - tipy z rovnakej kategórie sú si
  // navzájom podobné/prekrývajúce sa (napr. rôzne hranice gólov),
  // takže appka pri výbere viacerých tipov na zápas berie max. 1 z každej
  // kategórie, aby dostal rôznorodý, nie opakujúci sa výber.
  const candidates: MarketPick[] = [];

  // Výsledok zápasu, „oba tímy skórujú“ a ofsajdy model od 15. 10. 2026 vôbec neponúka (Michalovo rozhodnutie).

  // Nad/pod: pri každom trhu všetky hranice, ktoré stávkovky ponúkajú (bez kurzov
  // predvolené hranice). Pri každej hranici ide do úvahy strana, ktorú model vidí ako
  // pravdepodobnejšiu; z jednej kategórie sa nakoniec vyberie hranica s najväčšou hodnotou.
  const hasOdds = !!marketOdds && marketOdds.length > 0;
  const linesFor = (market: string): number[] => {
    // Keď stávkovky k zápasu kurzy majú, počítame LEN hranice, ktoré ponúkajú
    // (17. 10. 2026) – pevné hranice nižšie sú len pre analýzu bez kurzov a spätný test.
    if (hasOdds) return offeredLines(marketOdds, market);
    return DEFAULT_LINES[market] ?? [];
  };
  // Model každého trhu nad/pod (priemer a rozptyl) – appka z neho v kalkulačke počíta
  // šancu na hranicu, ktorú Michal zadá zo svojej stávkovky (17. 10. 2026).
  const lineModels: LineModel[] = [];
  const addOverUnder = (
    market: string,
    category: string,
    dist: (line: number) => { over: number; under: number },
    explain: (line: number) => string,
    model?: { mean: number; varRatio?: number }
  ) => {
    if (model && isFinite(model.mean)) lineModels.push({ market, category, mean: model.mean, varRatio: model.varRatio ?? 1, calibration: 1 });
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

  addOverUnder("Góly", "goly", (line) => poissonOverUnder(xg.home + xg.away, line), () => golyExplanation, { mean: xg.home + xg.away });
  // Góly jedného tímu: Poissonovo rozdelenie z očakávaných gólov tímu.
  // Z oboch tímov spolu najviac jeden tip (kategória „goly_timu“).
  addOverUnder("Góly domácich", "goly_timu", (line) => poissonOverUnder(xg.home, line), () =>
    `Očakávané góly ${fixture.homeTeam.name}: ${xg.home.toFixed(1)} (súper ${fixture.awayTeam.name} ${xg.away.toFixed(1)}).${absences?.text ? ` ${absences.text}` : ""}`,
    { mean: xg.home }
  );
  addOverUnder("Góly hostí", "goly_timu", (line) => poissonOverUnder(xg.away, line), () =>
    `Očakávané góly ${fixture.awayTeam.name}: ${xg.away.toFixed(1)} (súper ${fixture.homeTeam.name} ${xg.home.toFixed(1)}).${absences?.text ? ` ${absences.text}` : ""}`,
    { mean: xg.away }
  );

  if (corners) {
    const exp = corners.expected;
    addOverUnder("Rohy", "rohy", (line) => overdispersedOverUnder(exp, line, VAR_RATIO.corners), (line) => statExplanation(exp, line), { mean: exp, varRatio: VAR_RATIO.corners });
  }
  // Rohy jedného tímu: vlastné rohy tímu zmiešané s tým, koľko rohov dovolí súper.
  if (homeCornersAvg != null && awayCornersAvg != null) {
    const hc = homeCornersAvg, ac = awayCornersAvg;
    addOverUnder("Rohy domácich", "rohy_timu", (line) => overdispersedOverUnder(hc, line, VAR_RATIO.corners), (line) =>
      `${fixture.homeTeam.name} má v priemere ${fmt1(hc)} rohu na zápas (aj s ohľadom na súpera), hranica ${line}.`,
      { mean: hc, varRatio: VAR_RATIO.corners }
    );
    addOverUnder("Rohy hostí", "rohy_timu", (line) => overdispersedOverUnder(ac, line, VAR_RATIO.corners), (line) =>
      `${fixture.awayTeam.name} má v priemere ${fmt1(ac)} rohu na zápas (aj s ohľadom na súpera), hranica ${line}.`,
      { mean: ac, varRatio: VAR_RATIO.corners }
    );
  }

  // Góly v polčasoch (22. 10. 2026): rovnaké očakávané góly, rozdelené na 1. a 2. polčas.
  {
    const total = xg.home + xg.away;
    const g1 = total * FIRST_HALF_GOAL_SHARE, g2 = total * (1 - FIRST_HALF_GOAL_SHARE);
    addOverUnder("Góly v 1. polčase", "goly_1p", (line) => poissonOverUnder(g1, line), (line) =>
      `Očakávané góly v 1. polčase: ${fmt1(g1)} (z ${fmt1(total)} v celom zápase), hranica ${line}.`,
      { mean: g1 }
    );
    addOverUnder("Góly v 2. polčase", "goly_2p", (line) => poissonOverUnder(g2, line), (line) =>
      `Očakávané góly v 2. polčase: ${fmt1(g2)} (z ${fmt1(total)} v celom zápase), hranica ${line}.`,
      { mean: g2 }
    );
  }

  if (cards) {
    const exp = cards.expected;
    // Žlté karty v polčasoch (22. 10. 2026): v 1. polčase ich padá menej (asi 38 %).
    const c1 = exp * FIRST_HALF_CARD_SHARE, c2 = exp * (1 - FIRST_HALF_CARD_SHARE);
    addOverUnder("Karty v 1. polčase", "karty_1p", (line) => overdispersedOverUnder(c1, line, VAR_RATIO.cards), (line) =>
      `Očakávané žlté karty v 1. polčase: ${fmt1(c1)} (z ${fmt1(exp)} v celom zápase), hranica ${line}.${refereeNote("cards")}`,
      { mean: c1, varRatio: VAR_RATIO.cards }
    );
    addOverUnder("Karty v 2. polčase", "karty_2p", (line) => overdispersedOverUnder(c2, line, VAR_RATIO.cards), (line) =>
      `Očakávané žlté karty v 2. polčase: ${fmt1(c2)} (z ${fmt1(exp)} v celom zápase), hranica ${line}.${refereeNote("cards")}`,
      { mean: c2, varRatio: VAR_RATIO.cards }
    );
    addOverUnder("Karty", "karty", (line) => overdispersedOverUnder(exp, line, VAR_RATIO.cards), (line) =>
      `Očakávané žlté karty oboch tímov spolu: ${fmt1(exp)}, hranica ${line}.${refereeNote("cards")}`,
      { mean: exp, varRatio: VAR_RATIO.cards }
    );
  }

  if (shotsOnGoal) {
    const exp = shotsOnGoal.expected;
    addOverUnder("Strely na bránu", "strely", (line) => overdispersedOverUnder(exp, line, VAR_RATIO.shotsOnGoal), (line) => statExplanation(exp, line), { mean: exp, varRatio: VAR_RATIO.shotsOnGoal });
  }

  // Žlté karty a strely na bránu jedného tímu (17. 10. 2026): vlastný priemer tímu
  // zmiešaný s tým, koľko dovolí súper (ako pri rohoch tímu); karty aj s rozhodcom.
  if (extraStatsAvg?.homeCards != null && extraStatsAvg?.awayCards != null && cards) {
    const rf = referee?.cardsFactor ?? 1;
    const hk = extraStatsAvg.homeCards * rf, ak = extraStatsAvg.awayCards * rf;
    addOverUnder("Karty domácich", "karty_timu", (line) => overdispersedOverUnder(hk, line, VAR_RATIO.cards), (line) =>
      `${fixture.homeTeam.name}: očakávané žlté karty ${fmt1(hk)} (aj s ohľadom na súpera), hranica ${line}.${refereeNote("cards")}`,
      { mean: hk, varRatio: VAR_RATIO.cards }
    );
    addOverUnder("Karty hostí", "karty_timu", (line) => overdispersedOverUnder(ak, line, VAR_RATIO.cards), (line) =>
      `${fixture.awayTeam.name}: očakávané žlté karty ${fmt1(ak)} (aj s ohľadom na súpera), hranica ${line}.${refereeNote("cards")}`,
      { mean: ak, varRatio: VAR_RATIO.cards }
    );
  }
  if (extraStatsAvg?.homeShotsOnGoal != null && extraStatsAvg?.awayShotsOnGoal != null) {
    const hs = extraStatsAvg.homeShotsOnGoal, as = extraStatsAvg.awayShotsOnGoal;
    addOverUnder("Strely na bránu domácich", "strely_timu", (line) => overdispersedOverUnder(hs, line, VAR_RATIO.shotsOnGoal), (line) =>
      `${fixture.homeTeam.name} má v priemere ${fmt1(hs)} striel na bránu (aj s ohľadom na súpera), hranica ${line}.`,
      { mean: hs, varRatio: VAR_RATIO.shotsOnGoal }
    );
    addOverUnder("Strely na bránu hostí", "strely_timu", (line) => overdispersedOverUnder(as, line, VAR_RATIO.shotsOnGoal), (line) =>
      `${fixture.awayTeam.name} má v priemere ${fmt1(as)} striel na bránu (aj s ohľadom na súpera), hranica ${line}.`,
      { mean: as, varRatio: VAR_RATIO.shotsOnGoal }
    );
  }

  if (fouls) {
    const exp = fouls.expected;
    addOverUnder("Fauly", "fauly", (line) => overdispersedOverUnder(exp, line, VAR_RATIO.fouls), (line) => statExplanation(exp, line) + refereeNote("fouls"), { mean: exp, varRatio: VAR_RATIO.fouls });
    // Fauly jedného tímu (22. 10. 2026): vlastný priemer zmiešaný s tým, koľko faulov
    // súper vynúti (ako pri rohoch a kartách tímu), aj s vplyvom rozhodcu.
    const rf = referee?.foulsFactor ?? 1;
    const hf = extraStatsAvg!.homeFouls! * rf, af = extraStatsAvg!.awayFouls! * rf;
    addOverUnder("Fauly domácich", "fauly_timu", (line) => overdispersedOverUnder(hf, line, VAR_RATIO.fouls), (line) =>
      `${fixture.homeTeam.name}: očakávané fauly ${fmt1(hf)} (aj s ohľadom na súpera), hranica ${line}.${refereeNote("fouls")}`,
      { mean: hf, varRatio: VAR_RATIO.fouls }
    );
    addOverUnder("Fauly hostí", "fauly_timu", (line) => overdispersedOverUnder(af, line, VAR_RATIO.fouls), (line) =>
      `${fixture.awayTeam.name}: očakávané fauly ${fmt1(af)} (aj s ohľadom na súpera), hranica ${line}.${refereeNote("fouls")}`,
      { mean: af, varRatio: VAR_RATIO.fouls }
    );
  }

  // Očakávané držanie lopty domácich (v %) a rozptyl – appka z nich počíta šancu
  // na hranicu, ktorú zadá Michal zo stávkovky (napr. Arsenal 55,5 % a viac).
  let possessionInfo: { expectedHome: number; sd: number } | null = null;
  // Vyššie držanie lopty - odhad z priemerného držania lopty oboch tímov.
  // Odhad domácich = priemer (ich držanie, 100 - držanie súpera). Skutočné
  // držanie v zápase kolíše okolo odhadu približne o ±8 percentuálnych bodov
  // (smerodajná odchýlka), z toho sa počíta pravdepodobnosť cez normálne rozdelenie.
  if (extraStatsAvg?.homePossession != null && extraStatsAvg?.awayPossession != null) {
    const possBlend = blendH2H((extraStatsAvg.homePossession + (100 - extraStatsAvg.awayPossession)) / 2, "homePossession");
    const expectedHome = possBlend.value;
    if (possBlend.h2h) h2hNotes.drzanie_lopty = `Vo vzájomných zápasoch (${possBlend.h2h.n}) mali domáci loptu v priemere ${possBlend.h2h.avg.toFixed(0)} %.`;
    const POSSESSION_SD = 8;
    possessionInfo = { expectedHome, sd: POSSESSION_SD };
    // Od 20. 10. 2026 (Michalovo rozhodnutie) je držanie lopty aj medzi bežnými tipmi.
    // Stávkovky ho cez API neponúkajú, preto model skúša hranice po 5 % (30,5 – 70,5)
    // pre domácich aj hostí a kurz zadá Michal pri uložení tipu (minimálny kurz ukáže appka).
    const possTeams: [string, string, number][] = [
      ["Držanie lopty domácich", fixture.homeTeam.name, expectedHome],
      ["Držanie lopty hostí", fixture.awayTeam.name, 100 - expectedHome],
    ];
    // Len pri zápase, kde jeden tím jasne dominuje (odhad aspoň 58 %), inak by držanie
    // lopty vyšlo takmer pri každom zápase a zaplavilo Tipy dňa.
    // Liga majstrov a Európska liga (22. 10. 2026, Michalovo rozhodnutie): stávkovky tam
    // držanie lopty neponúkajú, preto sa v týchto súťažiach tipy na držanie lopty neponúkajú.
    const possOffered = !NO_POSSESSION_LEAGUE_IDS.includes(Number(fixture.league?.id));
    const possDominant = possOffered && Math.abs(expectedHome - 50) >= 8;
    for (const [market, team, exp] of possDominant ? possTeams : []) {
      for (const line of POSSESSION_LINES) {
        const over = (1 - normalCdf((line - exp) / POSSESSION_SD)) * 100;
        const isOver = over >= 50;
        candidates.push({
          market,
          selection: `${isOver ? "Over" : "Under"} ${line}`,
          probability: isOver ? over : 100 - over,
          category: "drzanie_lopty",
          explanation: `${team}: očakávané držanie lopty ${exp.toFixed(0)} %, hranica ${String(line).replace(".", ",")} %. Kurz zadajte zo stávkovky.`,
        });
      }
    }
  }

  for (const c of candidates) {
    c.rawProbability = c.probability;
    c.minGamesPlayed = minGamesPlayed;
  }
  if (!legacy) {
    for (const c of candidates) {
      const k = calibrationFactor(c.category, minGamesPlayed, Number(fixture.league?.id));
      if (k < 1) c.probability = 50 + k * (c.probability - 50);
      if (isGoalsUnder(c)) c.probability = 50 + GOALS_UNDER_CALIBRATION * (c.probability - 50);
    }
    for (const m of lineModels) m.calibration = Math.min(1, calibrationFactor(m.category, minGamesPlayed, Number(fixture.league?.id)));
  }

  const sortedBets = candidates.sort((a, b) => b.probability - a.probability);

  // Appka odporúča len tipy v pásme MIN_PROBABILITY – MAX_PROBABILITY:
  // - pod 68 % tipy vychádzajú príliš nepravidelne (dlhé série prehier),
  // - nad 80 % má tip v stávkovej kancelárii spravidla príliš nízky kurz
  //   (férový kurz pod 1,33 a po marži bookmakera ešte menej).
  // Ak žiadny tip zápasu nespadá do pásma, zápas ostane BEZ odporúčania -
  // appka radšej nič neodporučí, ako by ponúkla horší tip.
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

  // Odhad stávkoviek (bez marže) pre každý tip - pre kontrolu rozporu a tichú evidenciu.
  const marketPct = new Map<MarketPick, number>();
  for (const c of candidates) {
    const match = oddsAvailable ? findOdds(marketOdds!, c, fixture.homeTeam.name, fixture.awayTeam.name) : null;
    c.odds = match ? match.odd : null;
    c.oddsBookmakers = match ? match.bookmakers : 0;
    if (match) {
      const pMarket = marketProbability(marketOdds!, c, fixture.homeTeam.name, fixture.awayTeam.name);
      if (pMarket !== null) {
        const modelPct = c.probability;
        marketPct.set(c, pMarket * 100);
        c.blendModel = modelPct;
        c.blendMarket = pMarket * 100;
        // Rozpor so stávkovkami (pri KAŽDOM zápase, nielen pri málo dátach): rozdiel
        // 15+ bodov znamená, že model pravdepodobne nevidí niečo podstatné (zranenie,
        // zostava, sila súpera). Takýto tip sa neodporučí a ide do tichej evidencie.
        // Hranica podľa vzájomných zápasov, ktoré model naozaj použil PRE TENTO trh:
        // pri štatistikách (rohy, karty…) len tie, ku ktorým sú štatistiky k dispozícii.
        const statKey = H2H_STAT_KEY[c.category];
        const h2hUsed = statKey ? h2hStat(statKey)?.n ?? 0 : h2hG ? h2hG.n : 0;
        const conflictLimit = isGoalsUnder(c) ? GOALS_UNDER_CONFLICT_LIMIT : marketConflictLimit(h2hUsed);
        if (Math.abs(modelPct - pMarket * 100) >= conflictLimit) {
          c.marketConflict = `model a stávkovky sa výrazne rozchádzajú (model ${modelPct.toFixed(0)} %, stávkovky ${(pMarket * 100).toFixed(0)} %)`;
          c.modelProbability = modelPct;
          c.marketProbability = pMarket * 100;
        } else if (!isGoalsUnder(c) && Math.abs(modelPct - pMarket * 100) >= conflictLimit - 5) {
          // Prešiel len vďaka zmierneniu filtra (22. 10. 2026) – Michal ho dáva len do sledovaných.
          c.valueWarning = `Rozpor so stávkovkami ${Math.abs(modelPct - pMarket * 100).toFixed(0)} bodov (model ${modelPct.toFixed(0)} %, stávkovky ${(pMarket * 100).toFixed(0)} %) – pred zmiernením filtra by neprešiel. Po zadaní kurzu appka rozhodne, či prejde, inak sa uloží len do sledovaných.`;
          c.softConflict = true;
          c.conflictModel = modelPct;
          c.conflictLimit = conflictLimit - 5;
        }
        const blendW = legacy ? marketWeight : Math.max(marketWeight, MARKET_BLEND);
        if (blendW > 0) {
          c.probability = (1 - blendW) * modelPct + blendW * pMarket * 100;
          const lead = blendW > MARKET_BLEND ? "Málo dát v sezóne – odhad upravený podľa kurzov stávkoviek" : "Šanca spojená so stávkovkami";
          c.explanation =
            (c.explanation ? c.explanation + " " : "") +
            `(${lead}: model ${modelPct.toFixed(0)} %, stávkovky ${(pMarket * 100).toFixed(0)} %.)`;
        }
      }
    }
    // Oprava presnosti trhu podľa ostrých výsledkov (zapne sa sama po 50+ tipoch trhu).
    const k = adjust?.calibration?.[c.category];
    if (typeof k === "number" && isFinite(k) && k !== 1) {
      c.probability = 50 + k * (c.probability - 50);
      c.marketCalibration = k;
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
  //    odhadovaný kurz z dôvery 68 – 80 % by bol vždy len 1,25 – 1,47),
  //  - pod +5 %: tip nemá hodnotu -> vyradiť,
  //  - kurz pod MIN_ODDS (predvolene 1,55) -> vyradiť,
  //  - nad +25 % a málo odohraných zápasov v sezóne: model stojí na slabých
  //    dátach a rozdiel oproti trhu je takmer iste jeho chyba -> vyradiť,
  //  - nad +25 % a dát je dosť: tiež vyradiť (rozpor s trhom) -> tichá evidencia,
  //  - inak normálny tip. Keď sa kurzy objavia, pri ďalšej analýze tip prejde bežne.
  // Trhy mimo Michalovho zoznamu (6. 10. 2026): odporúčajú sa len góly zápasu a tímu,
  // držanie lopty, rohy zápasu a tímu, karty, strely na bránu a fauly.
  const NOT_RECOMMENDED_MARKETS = ["Ofsajdy", "Výsledok zápasu", "Oba tímy skórujú", "Obaja tímy skórujú"];
  const fewGames =
    Math.min(homeStats.fixtures.played.total ?? 0, awayStats.fixtures.played.total ?? 0) < MIN_GAMES_FOR_TRUST;
  // Liga majstrov: tímy majú v ligovej fáze 1 – 2 zápasy, ale v domácej lige ich
  // odohrali dosť a forma aj štatistiky sa doplnia zo všetkých súťaží (apiClient).
  const gamesForRecommend = Math.max(minGamesPlayed, seasonGamesAnyCompetition ?? 0);
  const pickPool: MarketPick[] = [];
  const lowValueBets: MarketPick[] = [];
  for (const b of inBand) {
    const ev = b.expectedValue;
    if (NOT_RECOMMENDED_MARKETS.includes(b.market)) {
      // Ofsajdy model v spätných testoch preceňoval (čakal 61 %, vyšlo 45 %); výsledok
      // zápasu a „oba tímy skórujú" nie sú v zozname trhov. V analýze ostávajú viditeľné,
      // ručne sa dajú uložiť.
      b.rejectReason = "tento trh neodporúčame";
      b.rejectCode = "market_excluded";
      lowValueBets.push(b);
    } else if (gamesForRecommend < MIN_GAMES_TO_RECOMMEND) {
      // Príliš málo zápasov v sezóne (napr. začiatok Ligy národov) - odhad stojí
      // hlavne na minulých sezónach a kurzoch, nie na aktuálnej forme.
      b.rejectReason = `málo odohraných zápasov v sezóne (${gamesForRecommend}, treba aspoň ${MIN_GAMES_TO_RECOMMEND})`;
      b.rejectCode = "few_games";
      lowValueBets.push(b);
    } else if (b.marketConflict) {
      b.rejectReason = b.marketConflict;
      b.rejectCode = "conflict";
      lowValueBets.push(b);
    } else if (ev == null && b.category === "drzanie_lopty" && adjust?.disabled?.[b.category]) {
      b.rejectReason = `trh je dočasne vypnutý (${adjust.disabled[b.category]})`;
      b.rejectCode = "market_disabled";
      lowValueBets.push(b);
    } else if (ev == null && b.category === "drzanie_lopty") {
      // Držanie lopty: kurz cez API nie je, tip ide do výberu s minimálnym kurzom,
      // ktorý Michal porovná so stávkovkou (hodnota +5 % a aspoň MIN_ODDS).
      b.minOdds = Math.max(MIN_ODDS, Math.ceil((MIN_EXPECTED_VALUE / (b.probability / 100)) * 100) / 100);
      pickPool.push(b);
    } else if (ev == null && oddsAvailable) {
      // Stávkovky k zápasu kurzy majú, ale tento trh (alebo túto hranicu) neponúkajú -
      // na tip sa reálne nedá staviť. Ručne ho stále možno pridať ("Uložiť aj tak").
      b.rejectReason = "stávkovky tento trh neponúkajú";
      b.rejectCode = "no_market_odds";
      lowValueBets.push(b);
    } else if (ev == null) {
      // Pre zápas zatiaľ nie sú žiadne kurzy - hodnotu ani minimálny kurz nevieme
      // overiť, preto tip neodporučíme. Ručne ho stále možno pridať ("Uložiť aj tak").
      b.rejectReason = "stávkovky zatiaľ neponúkajú kurz";
      b.rejectCode = "no_odds";
      lowValueBets.push(b);
    } else if (ev < MIN_EXPECTED_VALUE) {
      b.rejectReason = "nízky kurz, bez hodnoty";
      b.rejectCode = "ev_low";
      lowValueBets.push(b);
    } else if (b.odds != null && b.odds < MIN_ODDS) {
      // Kurz pod minimom (predvolene 1,50) - tip má hodnotu, ale zisk z výhry je malý.
      b.rejectReason = `kurz pod ${MIN_ODDS.toFixed(2).replace(".", ",")}`;
      b.rejectCode = "min_odds";
      lowValueBets.push(b);
    } else if ((b.oddsBookmakers ?? 0) < MIN_BOOKMAKERS) {
      // Kurz len od jednej stávkovky býva nespoľahlivý (často hranica, ktorú
      // naše stávkovky ani neponúkajú) - hodnota sa nedá overiť.
      b.rejectReason = "kurz len od jednej stávkovky";
      b.rejectCode = "one_bookmaker";
      lowValueBets.push(b);
    } else if (ev > SUSPICIOUS_EXPECTED_VALUE && fewGames) {
      b.rejectReason = "podozrivo vysoká hodnota pri malom množstve dát v sezóne";
      b.rejectCode = "ev_high_few_games";
      lowValueBets.push(b);
    } else if (ev > SUSPICIOUS_EXPECTED_VALUE) {
      // Hodnota nad +25 % znamená, že model vidí šancu oveľa vyššie ako stávkovky.
      // Predtým tip ostal s upozornením „over zostavy a správy"; teraz sa neodporučí
      // a ide do tichej evidencie ako každý iný rozpor (raz mesačne sa vyhodnotí).
      b.marketConflict = `podozrivo vysoká hodnota (+${((ev - 1) * 100).toFixed(0)} %) – model a stávkovky sa výrazne rozchádzajú`;
      b.modelProbability = b.probability;
      const mp = marketPct.get(b);
      if (mp != null) b.marketProbability = mp;
      b.rejectReason = b.marketConflict;
      b.rejectCode = "ev_high";
      lowValueBets.push(b);
    } else if (adjust?.disabled?.[b.category]) {
      // Trh vypnutý automaticky (21. 10. 2026: po 30+ tipoch bez zisku a bez lepšieho kurzu).
      // Až tu, aby „market_disabled“ dostali len tipy, ktoré by inak prešli všetkými filtrami –
      // tie sa zapisujú do tichej evidencie a keď sa trhu znova darí, zapne sa sám.
      b.rejectReason = `trh je dočasne vypnutý (${adjust.disabled[b.category]})`;
      b.rejectCode = "market_disabled";
      lowValueBets.push(b);
    } else {
      pickPool.push(b);
    }
  }

  // Appka ukáže VŠETKY tipy zápasu, ktoré spadajú do pásma - najviac jeden
  // z každej kategórie (trhu). Z viacerých hraníc toho istého trhu (napr. rohy
  // 8,5 / 9,5 / 10,5) vyberie tú s najväčšou hodnotou. Zoradené od najvyššej pravdepodobnosti.
  const bestInCategory = new Map<string, MarketPick>();
  for (const bet of pickPool) {
    const cur = bestInCategory.get(bet.category);
    const ev = rankValue(bet), curEv = cur ? rankValue(cur) : 0;
    // Držanie lopty (bez kurzu): hranica s dôverou najbližšie k spodku pásma má najväčšiu
    // šancu, že kurz v stávkovke dosiahne minimum.
    const better = bet.category === "drzanie_lopty" && ev === curEv ? bet.probability < (cur?.probability ?? 101) : bet.probability > (cur?.probability ?? -1);
    if (!cur || ev > curEv || (ev === curEv && better)) bestInCategory.set(bet.category, bet);
  }
  const diversifiedPicks = Array.from(bestInCategory.values()).sort((a, b) => b.probability - a.probability);
  // Meranie (20. 10. 2026): ostatné hranice toho istého trhu dostanú len kód dôvodu
  // pre tichú evidenciu (medzi neodporúčané sa nepresúvajú, výber sa nemení).
  for (const bet of pickPool) if (bestInCategory.get(bet.category) !== bet) bet.rejectCode = "category_lower_ev";

  // Najviac 1 odporúčaný tip na zápas (18. 10. 2026): tipy z jedného zápasu spolu súvisia
  // (napr. „menej gólov“ a „menej gólov domácich“ prehrajú naraz), preto ostane len ten
  // s najväčšou hodnotou. Ostatné sa presunú medzi neodporúčané s dôvodom.
  const topPick = diversifiedPicks.reduce<MarketPick | null>((best, b) => {
    if (!best) return b;
    const ev = rankValue(b), bestEv = rankValue(best);
    return ev > bestEv || (ev === bestEv && b.probability > best.probability) ? b : best;
  }, null);
  for (const b of diversifiedPicks) {
    if (b === topPick) continue;
    b.rejectReason = "iný tip z tohto zápasu má vyššiu hodnotu";
    b.rejectCode = "match_lower_ev";
    lowValueBets.push(b);
  }
  const bestBets = topPick ? [topPick] : [];

  const homeTopScorer = homePlayers
    ? predictTopScorer(filterByLineup(homePlayers, homeLineupIds), xg.home, homeStats.goals.for.average.total, homeLineupIds)
    : null;
  const awayTopScorer = awayPlayers
    ? predictTopScorer(filterByLineup(awayPlayers, awayLineupIds), xg.away, awayStats.goals.for.average.total, awayLineupIds)
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
    modelVersion: variant ? NEW_MODEL_VERSION : MODEL_VERSION,
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
    referee: referee ?? null,
    possession: possessionInfo,
    lineModels,
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

/** Typický počet gólov na 90 minút podľa pozície – s ním sa vyrovná malá vzorka zápasov. */
const SCORER_POSITION_PRIOR: Record<string, number> = { Attacker: 0.3, Midfielder: 0.1, Defender: 0.035, Goalkeeper: 0 };
/** Koľko „90-minútových zápasov“ váži odhad podľa pozície (čím viac odohral, tým menej). */
const SCORER_PRIOR_WEIGHT = 6;
/** Približne každá tretia strela na bránu skončí gólom. */
const SHOT_ON_CONVERSION = 0.32;
/** Penaltový exekútor má navyše asi 0,05 očakávaného gólu na zápas. */
const PENALTY_BONUS = 0.05;

/** Doplnkové údaje hráča pre presnejší odhad strelca (všetky nepovinné). */
export interface ScorerExtra {
  minutes?: number;
  position?: string;
  shotsOn?: number;
  penaltyScored?: number;
  inLineup?: boolean;
}

/**
 * Odhadne pravdepodobnosť, že konkrétny hráč v tomto zápase skóruje aspoň raz.
 * Nová logika (19. 10. 2026), bez pevného minima zápasov:
 * 1) góly na 90 minút, pri malej vzorke vyrovnané typickou hodnotou pre jeho pozíciu,
 * 2) skombinované so strelami na bránu (tie sú stabilnejšie než samotné góly),
 * 3) vynásobené tým, koľko minút asi odohrá (základ vs. striedajúci hráč),
 * 4) upravené podľa toho, koľko gólov má jeho tím dať práve v tomto zápase,
 * 5) bonus pre penaltového exekútora.
 */
export function predictPlayerGoal(
  playerName: string,
  playerId: number,
  seasonGoals: number,
  appearances: number,
  teamExpectedGoalsThisMatch: number,
  teamSeasonGoalsPerGame: number,
  extra: ScorerExtra = {}
): PlayerGoalPrediction {
  const goalsPerGame = appearances > 0 ? seasonGoals / appearances : 0;
  const minutes = extra.minutes && extra.minutes > 0 ? extra.minutes : appearances * 70;
  const n90 = minutes / 90;
  const prior = SCORER_POSITION_PRIOR[extra.position ?? ""] ?? 0.12;
  const k = SCORER_PRIOR_WEIGHT;
  const goalsPer90 = (seasonGoals + prior * k) / (n90 + k);
  const hasShots = typeof extra.shotsOn === "number" && extra.shotsOn > 0;
  const shotsOnPer90 = hasShots && n90 > 0 ? extra.shotsOn! / n90 : undefined;
  const shotRate = hasShots ? (extra.shotsOn! * SHOT_ON_CONVERSION + prior * k) / (n90 + k) : goalsPer90;
  const rate = hasShots ? 0.65 * goalsPer90 + 0.35 * shotRate : goalsPer90;

  const avgMinutes = appearances > 0 ? Math.min(90, minutes / appearances) : 60;
  const expectedMinutes = extra.inLineup ? Math.min(90, Math.max(avgMinutes, 78)) : avgMinutes;
  const matchFactor =
    teamSeasonGoalsPerGame > 0 && teamExpectedGoalsThisMatch > 0
      ? clamp(teamExpectedGoalsThisMatch / teamSeasonGoalsPerGame, 0.5, 1.8)
      : 1;
  const penaltyTaker = (extra.penaltyScored ?? 0) >= 1;
  const lambda = rate * (expectedMinutes / 90) * matchFactor + (penaltyTaker ? PENALTY_BONUS * matchFactor : 0);
  const probabilityToScore = (1 - poissonPmf(0, lambda)) * 100;

  return {
    player: { id: playerId, name: playerName },
    seasonGoals,
    appearances,
    goalsPerGame,
    probabilityToScore,
    minutes: extra.minutes && extra.minutes > 0 ? extra.minutes : undefined,
    goalsPer90: Math.round(goalsPer90 * 100) / 100,
    shotsOnPer90: shotsOnPer90 != null ? Math.round(shotsOnPer90 * 100) / 100 : undefined,
    penaltyTaker,
    expectedMinutes: Math.round(expectedMinutes),
    inLineup: Boolean(extra.inLineup),
  };
}

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

/**
 * Z celej súpisky tímu vyberie hráča s najvyššou pravdepodobnosťou gólu v tomto zápase.
 * Pevné minimum zápasov už nie je (19. 10. 2026) – malú vzorku vyrovná odhad podľa pozície.
 * Brankári a hráči bez jedinej odohranej minúty sa vynechajú.
 */
export function predictTopScorer(
  players: RawPlayerStat[],
  teamExpectedGoalsThisMatch: number,
  teamSeasonGoalsPerGame: number,
  lineupIds?: number[] | null
): PlayerGoalPrediction | null {
  const eligible = players.filter((p) => p.appearances >= 1 && p.position !== "Goalkeeper");
  if (eligible.length === 0) return null;

  const predictions = eligible.map((p) =>
    predictPlayerGoal(p.name, p.id, p.goals, p.appearances, teamExpectedGoalsThisMatch, teamSeasonGoalsPerGame, {
      minutes: p.minutes,
      position: p.position,
      shotsOn: p.shotsOn,
      penaltyScored: p.penaltyScored,
      inLineup: Boolean(lineupIds && lineupIds.includes(p.id)),
    })
  );

  predictions.sort((a, b) => b.probabilityToScore - a.probabilityToScore);
  return predictions[0];
}
