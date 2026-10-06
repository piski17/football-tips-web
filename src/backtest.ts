/**
 * Spätný test modelu: pre odohrané zápasy vypočíta tipy IBA z údajov známych
 * pred výkopom a porovná ich so skutočným výsledkom. Výsledkom je prehľad,
 * ako presne model odhaduje jednotlivé trhy (rohy, góly, karty…).
 *
 * Beží na pozadí (môže trvať niekoľko minút); stav sa zisťuje cez jobId.
 * Kurzy stávkoviek sa v teste nepoužívajú (API ich pre staré zápasy neuchováva),
 * takže test meria presnosť percent modelu, nie zisk.
 */
import {
  getFinishedFixtures,
  getTeamStatistics,
  getHeadToHead,
  getLeagueAverages,
  getHistoricalGoalPriors,
  getTeamExtendedStatsAverages,
  getRecentFormAnyCompetition,
  getHeadToHeadStats,
  getFixtureResult,
  getFixtureCornersAndCards,
} from "./apiClient";
import { predictMatch, DEFAULT_WEIGHTS, LEGACY_WEIGHTS } from "./predictor";
import { evaluateTip, STATS_MARKETS } from "./tipEvaluator";
import { Fixture, MarketPick } from "./types";

export interface BacktestParams {
  leagueIds: number[];
  season: number;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  maxFixtures: number;
}

export interface Sample {
  market: string;
  category: string;
  probability: number;
  /** Pravdepodobnosť pred kalibráciou. */
  raw: number;
  /** Menší z počtov odohraných zápasov oboch tímov v sezóne. */
  games: number;
  outcome: "won" | "lost";
}

interface MarketRow {
  market: string;
  count: number;
  avgPredicted: number;
  hitRate: number;
  brier: number;
  inBand: { count: number; hitRate: number | null };
}

interface BucketRow {
  label: string;
  count: number;
  avgPredicted: number | null;
  hitRate: number | null;
}

export interface BacktestReport {
  fixturesAnalyzed: number;
  fixturesFailed: number;
  samples: number;
  markets: MarketRow[];
  buckets: BucketRow[];
  bandOverall: { count: number; hitRate: number | null; avgPredicted: number | null };
  /** Hľadanie najlepšieho nastavenia (kalibrácia, pásmo, min. zápasov). */
  optimizer?: OptimizerReport;
}

interface CalibrationRow {
  category: string;
  markets: string[];
  count: number;
  /** Koeficient, ktorý model používa teraz (pri priemernom počte zápasov v teste). */
  currentK: number;
  brierNow: number;
  bestK: number;
  brierBest: number;
  /** Pri najlepšom k: priemer modelu a realita. */
  avgPredictedBest: number;
  hitRate: number;
}

interface SettingRow {
  lo: number;
  hi: number;
  minGames: number;
  count: number;
  hitRate: number | null;
  avgPredicted: number | null;
  current: boolean;
  best: boolean;
}

interface BandMarketRow {
  market: string;
  count: number;
  hitRate: number;
}

export interface OptimizerReport {
  calibration: CalibrationRow[];
  settings: SettingRow[];
  /** Úspešnosť trhov v najlepšom nastavení (s najlepšou kalibráciou). */
  marketsInBest: BandMarketRow[];
}

export interface BacktestJob {
  id: string;
  status: "running" | "done" | "error";
  params: BacktestParams;
  progress: { done: number; total: number };
  startedAt: string;
  finishedAt?: string;
  error?: string;
  report?: BacktestReport;
  /** Ten istý test s pôvodným modelom (do 5. 10. 2026) – na porovnanie. */
  reportLegacy?: BacktestReport;
}

const jobs = new Map<string, BacktestJob>();

function mixStat(own: number | null | undefined, opponentAllows: number | null | undefined): number | null {
  if (own == null) return opponentAllows ?? null;
  if (opponentAllows == null) return own;
  return (own + opponentAllows) / 2;
}

/** Tipy pre zápas výhradne z údajov spred výkopu – nový aj pôvodný model z rovnakých údajov. */
async function predictAsOf(fixture: Fixture, leagueId: number, season: number): Promise<{ current: MarketPick[]; legacy: MarketPick[] }> {
  const asOf = fixture.date;
  let [homeStats, awayStats, h2hAll, leagueAvg, homePriors, awayPriors, homeExt, awayExt] = await Promise.all([
    getTeamStatistics(leagueId, season, fixture.homeTeam.id, asOf),
    getTeamStatistics(leagueId, season, fixture.awayTeam.id, asOf),
    getHeadToHead(fixture.homeTeam.id, fixture.awayTeam.id, 10),
    getLeagueAverages(leagueId, season),
    getHistoricalGoalPriors(leagueId, season, fixture.homeTeam.id),
    getHistoricalGoalPriors(leagueId, season, fixture.awayTeam.id),
    getTeamExtendedStatsAverages(leagueId, season, fixture.homeTeam.id, 10, asOf),
    getTeamExtendedStatsAverages(leagueId, season, fixture.awayTeam.id, 10, asOf),
  ]);
  // vzájomné zápasy len spred výkopu (bez samotného testovaného zápasu)
  const kickoff = new Date(asOf).getTime();
  const h2h = h2hAll.filter((m) => new Date(m.date).getTime() < kickoff);

  if (!homeStats.form) {
    const form = await getRecentFormAnyCompetition(fixture.homeTeam.id, 5, asOf);
    if (form) homeStats = { ...homeStats, form };
  }
  if (!awayStats.form) {
    const form = await getRecentFormAnyCompetition(fixture.awayTeam.id, 5, asOf);
    if (form) awayStats = { ...awayStats, form };
  }
  const h2hStats = await getHeadToHeadStats(h2h, fixture.homeTeam.name).catch(() => []);

  const run = (legacy: boolean) => predictMatch(
    fixture,
    homeStats,
    awayStats,
    h2h,
    leagueAvg,
    legacy ? LEGACY_WEIGHTS : DEFAULT_WEIGHTS,
    homePriors,
    awayPriors,
    mixStat(homeExt.corners, awayExt.cornersAgainst),
    mixStat(awayExt.corners, homeExt.cornersAgainst),
    [],
    [],
    null,
    null,
    {
      homeShotsOnGoal: mixStat(homeExt.shotsOnGoal, awayExt.shotsOnGoalAgainst),
      awayShotsOnGoal: mixStat(awayExt.shotsOnGoal, homeExt.shotsOnGoalAgainst),
      homeFouls: mixStat(homeExt.fouls, awayExt.foulsAgainst),
      awayFouls: mixStat(awayExt.fouls, homeExt.foulsAgainst),
      homeOffsides: mixStat(homeExt.offsides, awayExt.offsidesAgainst),
      awayOffsides: mixStat(awayExt.offsides, homeExt.offsidesAgainst),
      homePossession: homeExt.possession,
      awayPossession: awayExt.possession,
      homeCards: mixStat(homeExt.cards, awayExt.cardsAgainst),
      awayCards: mixStat(awayExt.cards, homeExt.cardsAgainst),
    },
    undefined,
    h2hStats,
    { home: { goalsFor: homeExt.goalsFor ?? null, goalsAgainst: homeExt.goalsAgainst ?? null, games: homeExt.goalsGames ?? 0 }, away: { goalsFor: awayExt.goalsFor ?? null, goalsAgainst: awayExt.goalsAgainst ?? null, games: awayExt.goalsGames ?? 0 } },
    legacy
  );
  const picks = (legacy: boolean) => (run(legacy).allCandidates ?? []).filter((c) => c.market !== "Strelec gólov");
  return { current: picks(false), legacy: picks(true) };
}

/** Skutočný výsledok každého kandidáta (vyšiel / nevyšiel), vrátené a neznáme vynechá. */
async function outcomes(fixture: Fixture, pickSets: MarketPick[][]): Promise<Sample[][]> {
  const result = await getFixtureResult(fixture.fixtureId);
  if (!result || result.homeGoals == null || result.awayGoals == null) return pickSets.map(() => []);
  const extraTime = result.status !== "FT";
  const stats = await getFixtureCornersAndCards(fixture.fixtureId);
  const homeGoals = result.homeGoals;
  const awayGoals = result.awayGoals;
  return pickSets.map((picks) => {
    const out: Sample[] = [];
    for (const p of picks) {
      const bet = { homeTeam: fixture.homeTeam.name, awayTeam: fixture.awayTeam.name, market: p.market, selection: p.selection };
      const isStat = STATS_MARKETS.includes(p.market);
      if (isStat && extraTime) continue; // štatistiky s predĺžením nie sú porovnateľné
      const status = evaluateTip(
        bet,
        homeGoals,
        awayGoals,
        stats.corners,
        stats.cards,
        null,
        stats.shotsOnGoal,
        stats.fouls,
        stats.offsides,
        stats.possession,
        stats.cornersByTeam ?? null
      );
      if (status === "won" || status === "lost")
        out.push({
          market: p.market,
          category: p.category,
          probability: p.probability,
          raw: p.rawProbability ?? p.probability,
          games: p.minGamesPlayed ?? 99,
          outcome: status,
        });
    }
    return out;
  });
}

// Trhy, ktoré sa neodporúčajú (rovnaký zoznam ako v predictor.ts) – do hľadania nastavenia nevstupujú.
const NOT_RECOMMENDED = ["Ofsajdy", "Výsledok zápasu", "Oba tímy skórujú", "Obaja tímy skórujú"];
const MIN_SAMPLES_FOR_K = 30;

const brier = (list: { p: number; won: boolean }[]) =>
  list.reduce((a, x) => a + Math.pow(x.p / 100 - (x.won ? 1 : 0), 2), 0) / list.length;
const calibrate = (raw: number, k: number) => 50 + k * (raw - 50);

/**
 * Hľadanie najlepšieho nastavenia na odohraných zápasoch testu:
 *  1. pre každý trh koeficient kalibrácie k (0,30 – 1,00), pri ktorom sú percentá
 *     modelu najbližšie realite (najnižšie Brierovo skóre),
 *  2. s týmito k všetky kombinácie pásma dôvery a minimálneho počtu zápasov –
 *     koľko tipov by prešlo a koľko by ich vyšlo.
 * Kurzy test nepozná, preto „najlepšie" = najvyššia úspešnosť pri aspoň polovici
 * tipov oproti terajšiemu nastaveniu (inak by vyhralo pásmo s 5 tipmi).
 */
export function optimize(all: Sample[]): OptimizerReport {
  const samples = all.filter((s) => !NOT_RECOMMENDED.includes(s.market));
  const cats = Array.from(new Set(samples.map((s) => s.category)));
  const bestK = new Map<string, number>();
  const calibration: CalibrationRow[] = [];
  for (const category of cats) {
    const list = samples.filter((s) => s.category === category);
    const won = list.filter((s) => s.outcome === "won").length;
    let best = { k: 1, b: Infinity };
    for (let k = 0.3; k <= 1.0001; k += 0.05) {
      const b = brier(list.map((s) => ({ p: calibrate(s.raw, k), won: s.outcome === "won" })));
      if (b < best.b - 1e-9) best = { k: Math.round(k * 100) / 100, b };
    }
    // Pri málo tipoch by k „sedelo" na náhodu – necháme terajšiu kalibráciu.
    const enough = list.length >= MIN_SAMPLES_FOR_K;
    const avgRaw = list.reduce((a, s) => a + Math.abs(s.raw - 50), 0);
    const avgNow = list.reduce((a, s) => a + Math.abs(s.probability - 50), 0);
    calibration.push({
      category,
      markets: Array.from(new Set(list.map((s) => s.market))),
      count: list.length,
      currentK: avgRaw > 0 ? Math.round((avgNow / avgRaw) * 100) / 100 : 1,
      brierNow: brier(list.map((s) => ({ p: s.probability, won: s.outcome === "won" }))),
      bestK: enough ? best.k : NaN,
      brierBest: enough ? best.b : NaN,
      avgPredictedBest: enough ? list.reduce((a, s) => a + calibrate(s.raw, best.k), 0) / list.length : NaN,
      hitRate: (won / list.length) * 100,
    });
    if (enough) bestK.set(category, best.k);
  }
  calibration.sort((a, b) => b.count - a.count);

  // percentá s najlepšou kalibráciou (trhy s málo tipmi ostávajú ako teraz)
  const tuned = samples.map((s) => ({
    ...s,
    p: bestK.has(s.category) ? calibrate(s.raw, bestK.get(s.category)!) : s.probability,
  }));
  const evalSetting = (lo: number, hi: number, minGames: number, useTuned: boolean) => {
    const list = (useTuned ? tuned : samples.map((s) => ({ ...s, p: s.probability }))).filter(
      (s) => s.p >= lo && s.p <= hi && s.games >= minGames
    );
    const won = list.filter((s) => s.outcome === "won").length;
    return {
      count: list.length,
      hitRate: list.length ? (won / list.length) * 100 : null,
      avgPredicted: list.length ? list.reduce((a, s) => a + s.p, 0) / list.length : null,
    };
  };
  const now = evalSetting(65, 75, 3, false);
  const settings: SettingRow[] = [{ lo: 65, hi: 75, minGames: 3, ...now, current: true, best: false }];
  // Horná hranica najviac 80 %: nad ňou majú tipy kurz spravidla pod minimom 1,50.
  // Min. 3 zápasy platí od 6. 10. 2026 vždy, preto sa skúša len 3 a 5.
  const seen = new Set<string>();
  for (const lo of [60, 62, 65, 68, 70])
    for (const width of [10, 15])
      for (const minGames of [3, 5]) {
        const hi = Math.min(lo + width, 80), key = `${lo}-${hi}-${minGames}`;
        if (seen.has(key)) continue;
        seen.add(key);
        settings.push({ lo, hi, minGames, ...evalSetting(lo, hi, minGames, true), current: false, best: false });
      }
  const minCount = Math.max(20, Math.ceil(now.count / 2));
  const candidates = settings.filter((r) => !r.current && r.count >= minCount && r.hitRate != null);
  const top = candidates.sort((a, b) => b.hitRate! - a.hitRate! || b.count - a.count)[0];
  if (top) top.best = true;
  const ordered = [settings[0], ...settings.slice(1).filter((r) => r.count > 0).sort((a, b) => (b.hitRate ?? 0) - (a.hitRate ?? 0) || b.count - a.count)];

  const marketsInBest: BandMarketRow[] = [];
  if (top) {
    const inBest = tuned.filter((s) => s.p >= top.lo && s.p <= top.hi && s.games >= top.minGames);
    for (const market of Array.from(new Set(inBest.map((s) => s.market)))) {
      const list = inBest.filter((s) => s.market === market);
      marketsInBest.push({ market, count: list.length, hitRate: (list.filter((s) => s.outcome === "won").length / list.length) * 100 });
    }
    marketsInBest.sort((a, b) => b.hitRate - a.hitRate);
  }
  return { calibration, settings: ordered.slice(0, 16), marketsInBest };
}

function buildReport(samples: Sample[], analyzed: number, failed: number): BacktestReport {
  const markets = Array.from(new Set(samples.map((s) => s.market)));
  const rows: MarketRow[] = markets
    .map((market) => {
      const list = samples.filter((s) => s.market === market);
      const won = list.filter((s) => s.outcome === "won").length;
      const band = list.filter((s) => s.probability >= 65 && s.probability <= 75);
      const bandWon = band.filter((s) => s.outcome === "won").length;
      return {
        market,
        count: list.length,
        avgPredicted: list.reduce((a, s) => a + s.probability, 0) / list.length,
        hitRate: (won / list.length) * 100,
        brier: list.reduce((a, s) => a + Math.pow(s.probability / 100 - (s.outcome === "won" ? 1 : 0), 2), 0) / list.length,
        inBand: { count: band.length, hitRate: band.length ? (bandWon / band.length) * 100 : null },
      };
    })
    .sort((a, b) => b.count - a.count);

  const edges = [50, 60, 65, 70, 75, 80, 90, 101];
  const buckets: BucketRow[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i], hi = edges[i + 1];
    const list = samples.filter((s) => s.probability >= lo && s.probability < hi);
    const won = list.filter((s) => s.outcome === "won").length;
    buckets.push({
      label: `${lo}–${Math.min(hi, 100)} %`,
      count: list.length,
      avgPredicted: list.length ? list.reduce((a, s) => a + s.probability, 0) / list.length : null,
      hitRate: list.length ? (won / list.length) * 100 : null,
    });
  }
  const band = samples.filter((s) => s.probability >= 65 && s.probability <= 75);
  const bandWon = band.filter((s) => s.outcome === "won").length;
  return {
    fixturesAnalyzed: analyzed,
    fixturesFailed: failed,
    samples: samples.length,
    markets: rows,
    buckets,
    bandOverall: {
      count: band.length,
      hitRate: band.length ? (bandWon / band.length) * 100 : null,
      avgPredicted: band.length ? band.reduce((a, s) => a + s.probability, 0) / band.length : null,
    },
  };
}

async function run(job: BacktestJob): Promise<void> {
  try {
    const { leagueIds, season, from, to, maxFixtures } = job.params;
    const fixtures: { f: Fixture; leagueId: number }[] = [];
    let lastError: string | null = null;
    for (const leagueId of leagueIds) {
      try {
        for (const f of await getFinishedFixtures(leagueId, season, from, to)) fixtures.push({ f, leagueId });
      } catch (err: any) {
        // liga bez zápasov v období – alebo chyba API (napr. vyčerpaný denný limit požiadaviek)
        lastError = err?.message ?? String(err);
      }
    }
    if (fixtures.length === 0 && lastError) {
      throw new Error(`API-Football odmietlo požiadavku: ${lastError}`);
    }
    fixtures.sort((a, b) => new Date(b.f.date).getTime() - new Date(a.f.date).getTime());
    const selected = fixtures.slice(0, maxFixtures);
    job.progress = { done: 0, total: selected.length };

    const samples: Sample[] = [];
    const samplesLegacy: Sample[] = [];
    let analyzed = 0, failed = 0;
    for (const { f, leagueId } of selected) {
      try {
        const picks = await predictAsOf(f, leagueId, season);
        const [cur, old] = await outcomes(f, [picks.current, picks.legacy]);
        samples.push(...cur);
        samplesLegacy.push(...old);
        analyzed++;
      } catch {
        failed++;
      }
      job.progress.done++;
      // priebežný výsledok, aby sa dal zobraziť už počas behu
      job.report = buildReport(samples, analyzed, failed);
      job.reportLegacy = buildReport(samplesLegacy, analyzed, failed);
    }
    job.report = buildReport(samples, analyzed, failed);
    job.report.optimizer = optimize(samples);
    job.reportLegacy = buildReport(samplesLegacy, analyzed, failed);
    job.status = "done";
  } catch (err: any) {
    job.status = "error";
    job.error = err?.message ?? String(err);
  } finally {
    job.finishedAt = new Date().toISOString();
  }
}

export function startBacktest(params: BacktestParams): BacktestJob {
  const running = Array.from(jobs.values()).find((j) => j.status === "running");
  if (running) return running; // naraz beží len jeden test
  const job: BacktestJob = {
    id: Math.random().toString(36).slice(2, 10),
    status: "running",
    params,
    progress: { done: 0, total: 0 },
    startedAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  void run(job);
  return job;
}

export function getBacktest(id: string): BacktestJob | undefined {
  return jobs.get(id);
}
