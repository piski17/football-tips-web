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
import { predictMatch, DEFAULT_WEIGHTS } from "./predictor";
import { evaluateTip } from "./tipEvaluator";
import { Fixture, MarketPick } from "./types";

export interface BacktestParams {
  leagueIds: number[];
  season: number;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  maxFixtures: number;
}

interface Sample {
  market: string;
  probability: number;
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
}

const jobs = new Map<string, BacktestJob>();

function mixStat(own: number | null | undefined, opponentAllows: number | null | undefined): number | null {
  if (own == null) return opponentAllows ?? null;
  if (opponentAllows == null) return own;
  return (own + opponentAllows) / 2;
}

/** Tipy pre zápas výhradne z údajov spred výkopu. */
async function predictAsOf(fixture: Fixture, leagueId: number, season: number): Promise<MarketPick[]> {
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

  const result = predictMatch(
    fixture,
    homeStats,
    awayStats,
    h2h,
    leagueAvg,
    DEFAULT_WEIGHTS,
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
    { home: { goalsFor: homeExt.goalsFor ?? null, goalsAgainst: homeExt.goalsAgainst ?? null, games: homeExt.goalsGames ?? 0 }, away: { goalsFor: awayExt.goalsFor ?? null, goalsAgainst: awayExt.goalsAgainst ?? null, games: awayExt.goalsGames ?? 0 } }
  );
  return (result.allCandidates ?? []).filter((c) => c.market !== "Strelec gólov");
}

/** Skutočný výsledok každého kandidáta (vyšiel / nevyšiel), vrátené a neznáme vynechá. */
async function outcomes(fixture: Fixture, picks: MarketPick[]): Promise<Sample[]> {
  const result = await getFixtureResult(fixture.fixtureId);
  if (!result || result.homeGoals == null || result.awayGoals == null) return [];
  const extraTime = result.status !== "FT";
  const stats = await getFixtureCornersAndCards(fixture.fixtureId);
  const out: Sample[] = [];
  for (const p of picks) {
    const bet = { homeTeam: fixture.homeTeam.name, awayTeam: fixture.awayTeam.name, market: p.market, selection: p.selection };
    const isStat = ["Rohy", "Karty", "Strely na bránu", "Fauly", "Ofsajdy", "Vyššie držanie lopty"].includes(p.market);
    if (isStat && extraTime) continue; // štatistiky s predĺžením nie sú porovnateľné
    const status = evaluateTip(
      bet,
      result.homeGoals,
      result.awayGoals,
      stats.corners,
      stats.cards,
      null,
      stats.shotsOnGoal,
      stats.fouls,
      stats.offsides,
      stats.possession
    );
    if (status === "won" || status === "lost") out.push({ market: p.market, probability: p.probability, outcome: status });
  }
  return out;
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
    for (const leagueId of leagueIds) {
      try {
        for (const f of await getFinishedFixtures(leagueId, season, from, to)) fixtures.push({ f, leagueId });
      } catch {
        // liga bez zápasov v období
      }
    }
    fixtures.sort((a, b) => new Date(b.f.date).getTime() - new Date(a.f.date).getTime());
    const selected = fixtures.slice(0, maxFixtures);
    job.progress = { done: 0, total: selected.length };

    const samples: Sample[] = [];
    let analyzed = 0, failed = 0;
    for (const { f, leagueId } of selected) {
      try {
        const picks = await predictAsOf(f, leagueId, season);
        samples.push(...(await outcomes(f, picks)));
        analyzed++;
      } catch {
        failed++;
      }
      job.progress.done++;
      // priebežný výsledok, aby sa dal zobraziť už počas behu
      job.report = buildReport(samples, analyzed, failed);
    }
    job.report = buildReport(samples, analyzed, failed);
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
