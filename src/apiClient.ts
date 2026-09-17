import axios, { AxiosInstance } from "axios";
import axiosRetry from "axios-retry";
import {
  Fixture,
  TeamStatistics,
  HeadToHeadMatch,
  LeagueAverages,
  TeamGoalPriors,
  TeamGoalPriorsResult,
} from "./types";

const BASE_URL = "https://v3.football.api-sports.io";

function client(): AxiosInstance {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    throw new Error("Na serveri chýba premenná prostredia API_FOOTBALL_KEY.");
  }
  const instance = axios.create({
    baseURL: BASE_URL,
    headers: { "x-apisports-key": key },
    timeout: 15000,
  });

  // Automaticky zopakuje požiadavku pri krátkodobom výpadku siete alebo
  // limite požiadaviek (HTTP 429) - zabraňuje tomu, aby jedna náhodne zlyhaná
  // požiadavka spôsobila nekonzistentné výsledky medzi opakovanými analýzami.
  axiosRetry(instance, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) =>
      axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response?.status === 429,
  });

  return instance;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Spracuje položky POSTUPNE (nie všetky naraz), s malým odstupom medzi nimi.
 * Bráni tomu, aby appka vystrelila príliš veľa súbežných požiadaviek naraz
 * a narazila na krátkodobý limit API, ktorý by spôsobil nekonzistentné výsledky.
 */
async function mapSequential<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  delayMs: number = 150
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i++) {
    results.push(await fn(items[i], i));
    if (i < items.length - 1) await delay(delayMs);
  }
  return results;
}

function checkApiErrors(data: any): void {
  const errors = data?.errors;
  if (!errors) return;
  const messages: string[] = Array.isArray(errors) ? errors : Object.values(errors).map((v) => String(v));
  if (messages.length > 0) throw new Error(messages.join(" | "));
}

function mapFixture(item: any): Fixture {
  return {
    fixtureId: item.fixture.id,
    date: item.fixture.date,
    timestamp: item.fixture.timestamp,
    venue: item.fixture.venue?.name,
    league: {
      id: item.league.id,
      name: item.league.name,
      season: item.league.season,
      round: item.league.round,
    },
    homeTeam: { id: item.teams.home.id, name: item.teams.home.name, logo: item.teams.home.logo },
    awayTeam: { id: item.teams.away.id, name: item.teams.away.name, logo: item.teams.away.logo },
    status: item.fixture.status?.short ?? "NS",
  };
}

/** Načíta zápasy danej ligy/sezóny na konkrétny deň (alebo všetky, ak deň nie je zadaný). */
export async function getFixturesByLeague(
  leagueId: number,
  season: number,
  limitCount: number = 20,
  date?: string
): Promise<Fixture[]> {
  const params: Record<string, any> = { league: leagueId, season };
  if (date) params.date = date;

  const res = await client().get("/fixtures", { params });
  checkApiErrors(res.data);

  const all = (res.data?.response ?? []).map((item: any) => mapFixture(item));
  return all.sort((a: Fixture, b: Fixture) => a.timestamp - b.timestamp).slice(0, limitCount);
}

/** Načíta agregované štatistiky tímu v danej lige a sezóne. */
export async function getTeamStatistics(
  leagueId: number,
  season: number,
  teamId: number
): Promise<TeamStatistics> {
  const res = await client().get("/teams/statistics", {
    params: { league: leagueId, season, team: teamId },
  });
  checkApiErrors(res.data);

  const d = res.data?.response;
  if (!d || !d.team) {
    throw new Error(`Štatistiky pre tím ${teamId} neboli nájdené (liga ${leagueId}, sezóna ${season}).`);
  }

  // Karty prichádzajú rozdelené po 15-minútových intervaloch (žlté aj červené) -
  // spočítame ich všetky a vydelíme počtom zápasov, aby sme dostali priemer na zápas.
  const sumCardBuckets = (buckets: any): number => {
    if (!buckets) return 0;
    return Object.values(buckets).reduce((sum: number, bucket: any) => sum + (bucket?.total ?? 0), 0);
  };
  const totalYellow = sumCardBuckets(d.cards?.yellow);
  const totalRed = sumCardBuckets(d.cards?.red);
  const totalGames = d.fixtures?.played?.total ?? 0;
  const cardsPerGame = totalGames > 0 ? (totalYellow + totalRed) / totalGames : 0;

  return {
    team: { id: d.team.id, name: d.team.name, logo: d.team.logo },
    form: d.form ?? "",
    fixtures: {
      played: d.fixtures.played,
      wins: d.fixtures.wins,
      draws: d.fixtures.draws,
      loses: d.fixtures.loses,
    },
    goals: {
      for: {
        total: d.goals.for.total,
        average: {
          home: parseFloat(d.goals.for.average.home) || 0,
          away: parseFloat(d.goals.for.average.away) || 0,
          total: parseFloat(d.goals.for.average.total) || 0,
        },
      },
      against: {
        total: d.goals.against.total,
        average: {
          home: parseFloat(d.goals.against.average.home) || 0,
          away: parseFloat(d.goals.against.average.away) || 0,
          total: parseFloat(d.goals.against.average.total) || 0,
        },
      },
    },
    cardsPerGame,
  };
}

/**
 * Dopočíta priemerný počet rohov tímu za zápas z jeho posledných `lastN`
 * odohraných zápasov (API-Football nemá priemer rohov v /teams/statistics,
 * treba ho poskladať zo štatistík jednotlivých zápasov).
 */
export async function getTeamCornersAverage(
  leagueId: number,
  season: number,
  teamId: number,
  lastN: number = 6
): Promise<number | null> {
  try {
    const fixturesRes = await client().get("/fixtures", {
      params: { team: teamId, league: leagueId, season, last: lastN, status: "FT" },
    });
    checkApiErrors(fixturesRes.data);
    const fixtures: any[] = fixturesRes.data?.response ?? [];
    if (fixtures.length === 0) return null;

    const cornerValues = await mapSequential(fixtures, async (f: any) => {
      try {
        const statsRes = await client().get("/fixtures/statistics", {
          params: { fixture: f.fixture.id, team: teamId },
        });
        const stats: any[] = statsRes.data?.response?.[0]?.statistics ?? [];
        const corner = stats.find((s: any) => s.type === "Corner Kicks");
        return typeof corner?.value === "number" ? corner.value : null;
      } catch {
        return null;
      }
    });

    const valid = cornerValues.filter((v): v is number => v !== null);
    if (valid.length === 0) return null;
    return valid.reduce((a, b) => a + b, 0) / valid.length;
  } catch {
    return null;
  }
}

/** Načíta posledných N vzájomných zápasov medzi dvoma tímami. */
export async function getHeadToHead(
  team1Id: number,
  team2Id: number,
  last: number = 10
): Promise<HeadToHeadMatch[]> {
  const res = await client().get("/fixtures/headtohead", {
    params: { h2h: `${team1Id}-${team2Id}`, last },
  });
  checkApiErrors(res.data);

  return (res.data?.response ?? []).map((item: any) => ({
    fixtureId: item.fixture.id,
    date: item.fixture.date,
    homeTeamId: item.teams.home.id,
    awayTeamId: item.teams.away.id,
    homeGoals: item.goals.home,
    awayGoals: item.goals.away,
  }));
}

/**
 * Načíta priemer gólov tímu z VIACERÝCH minulých sezón (rovnaká liga) a
 * skombinuje ich do jedného váženého priemeru - novšie sezóny majú väčšiu váhu.
 * Používa sa ako informovanejší základ na vyhladenie štatistík na začiatku
 * novej sezóny, namiesto obyčajného ligového priemeru. Sezóny, v ktorých tím
 * v tejto lige nehral (napr. bol postúpený/zostúpil), sa jednoducho preskočia.
 */
export async function getHistoricalGoalPriors(
  leagueId: number,
  season: number,
  teamId: number,
  seasonsBack: number = 3
): Promise<TeamGoalPriorsResult | null> {
  // Váhy pre najbližšiu, druhú a tretiu predošlú sezónu - novšie sezóny sa počítajú viac.
  const recencyWeights = [3, 2, 1];

  const pastSeasons = Array.from({ length: seasonsBack }, (_, i) => season - 1 - i);

  const seasonResults = await mapSequential(pastSeasons, async (pastSeason, idx) => {
    try {
      const res = await client().get("/teams/statistics", {
        params: { league: leagueId, season: pastSeason, team: teamId },
      });
      const d = res.data?.response;
      if (!d || !d.team || !d.fixtures?.played?.total) return null;

      return {
        weight: recencyWeights[idx] ?? 1,
        forHome: parseFloat(d.goals?.for?.average?.home) || 0,
        forAway: parseFloat(d.goals?.for?.average?.away) || 0,
        againstHome: parseFloat(d.goals?.against?.average?.home) || 0,
        againstAway: parseFloat(d.goals?.against?.average?.away) || 0,
      };
    } catch {
      return null;
    }
  });

  const valid = seasonResults.filter((r): r is NonNullable<typeof r> => r !== null);
  if (valid.length === 0) return null;

  const totalWeight = valid.reduce((sum, r) => sum + r.weight, 0);
  const weightedAvg = (key: "forHome" | "forAway" | "againstHome" | "againstAway") =>
    valid.reduce((sum, r) => sum + r[key] * r.weight, 0) / totalWeight;

  return {
    priors: {
      forHome: weightedAvg("forHome"),
      forAway: weightedAvg("forAway"),
      againstHome: weightedAvg("againstHome"),
      againstAway: weightedAvg("againstAway"),
    },
    seasonsUsed: valid.length,
    seasonsChecked: seasonsBack,
  };
}

/** Dopočíta skutočný ligový priemer gólov doma/vonku z celej tabuľky danej sezóny. */
export async function getLeagueAverages(leagueId: number, season: number): Promise<LeagueAverages> {
  const res = await client().get("/standings", { params: { league: leagueId, season } });
  checkApiErrors(res.data);

  const groups: any[] = res.data?.response?.[0]?.league?.standings ?? [];
  const table: any[] = groups.flat();

  let totalHomeGoals = 0;
  let totalHomeGames = 0;
  let totalAwayGoals = 0;
  let totalAwayGames = 0;

  for (const team of table) {
    totalHomeGoals += team.home?.goals?.for ?? 0;
    totalHomeGames += team.home?.played ?? 0;
    totalAwayGoals += team.away?.goals?.for ?? 0;
    totalAwayGames += team.away?.played ?? 0;
  }

  return {
    home: totalHomeGames > 0 ? totalHomeGoals / totalHomeGames : 1.5,
    away: totalAwayGames > 0 ? totalAwayGoals / totalAwayGames : 1.15,
  };
}
