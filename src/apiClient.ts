import axios, { AxiosInstance } from "axios";
import axiosRetry from "axios-retry";
import {
  Fixture,
  TeamStatistics,
  HeadToHeadMatch,
  LeagueAverages,
  TeamGoalPriors,
  TeamGoalPriorsResult,
  SquadPlayer,
  PlayerSeasonStats,
  RawPlayerStat,
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
    retries: 5,
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
  delayMs: number = 200
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i++) {
    results.push(await fn(items[i], i));
    if (i < items.length - 1) await delay(delayMs);
  }
  return results;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// Jednoduchá pamäť (cache) s časovým limitom - šetrí API volania pre dáta,
// ktoré sa počas krátkeho času nemenia (história minulých sezón, ligový
// priemer, priemer rohov), a zároveň robí výsledky konzistentnejšie, keďže
// sa nemusia sťahovať znova zakaždým, keď klikneš na ten istý zápas.
const cache = new Map<string, CacheEntry<any>>();

function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T, ttlMs: number): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

const TTL_HISTORICAL_PRIORS = 6 * 60 * 60 * 1000; // 6 hodín - minulé sezóny sa nemenia
const TTL_LEAGUE_AVERAGES = 60 * 60 * 1000; // 1 hodina
const TTL_CORNERS_AVERAGE = 30 * 60 * 1000; // 30 minút - môže sa meniť s novo odohranými zápasmi
const TTL_SQUAD = 6 * 60 * 60 * 1000; // 6 hodín - súpiska sa počas dňa prakticky nemení
const TTL_PLAYER_STATS = 3 * 60 * 60 * 1000; // 3 hodiny

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
// Stavy zápasu, ktoré považujeme za "skončené" - takéto zápasy sa v zozname
// dnešných zápasov už nezobrazujú (FT = koniec, AET = po predĺžení, PEN = po penaltách).
const FINISHED_STATUSES = ["FT", "AET", "PEN"];

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

  const all = (res.data?.response ?? [])
    .map((item: any) => mapFixture(item))
    .filter((f: Fixture) => !FINISHED_STATUSES.includes(f.status));

  return all.sort((a: Fixture, b: Fixture) => a.timestamp - b.timestamp).slice(0, limitCount);
}

/** Načíta agregované štatistiky tímu v danej lige a sezóne. */
export async function getTeamStatistics(
  leagueId: number,
  season: number,
  teamId: number
): Promise<TeamStatistics> {
  const cacheKey = `teamStats:${leagueId}:${season}:${teamId}`;
  const cached = getCached<TeamStatistics>(cacheKey);
  if (cached !== undefined) return cached;

  const fetchOnce = async (): Promise<TeamStatistics> => {
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
  };

  const result = await fetchOnce();
  setCached(cacheKey, result, TTL_LEAGUE_AVERAGES);
  return result;
}

/**
 * Načíta priemer rohov, striel na bránu, faulov a ofsajdov z posledných N
 * odohratých zápasov tímu - všetko v jednom spoločnom cykle požiadaviek
 * (namiesto samostatného volania pre každú štatistiku zvlášť, čo by
 * viacnásobne zvýšilo počet požiadaviek na API-Football).
 */
export interface TeamExtendedStatsAverages {
  corners: number | null;
  shotsOnGoal: number | null;
  fouls: number | null;
  offsides: number | null;
}

export async function getTeamExtendedStatsAverages(
  leagueId: number,
  season: number,
  teamId: number,
  lastN: number = 10
): Promise<TeamExtendedStatsAverages> {
  const cacheKey = `extStatsAvg:${leagueId}:${season}:${teamId}:${lastN}`;
  const cached = getCached<TeamExtendedStatsAverages>(cacheKey);
  if (cached !== undefined) return cached;

  const empty: TeamExtendedStatsAverages = { corners: null, shotsOnGoal: null, fouls: null, offsides: null };

  try {
    const fixturesRes = await client().get("/fixtures", {
      params: { team: teamId, league: leagueId, season, last: lastN, status: "FT" },
    });
    checkApiErrors(fixturesRes.data);
    const fixtures: any[] = fixturesRes.data?.response ?? [];
    if (fixtures.length === 0) {
      setCached(cacheKey, empty, TTL_CORNERS_AVERAGE);
      return empty;
    }

    const fieldMap: Record<string, string> = {
      corners: "Corner Kicks",
      shotsOnGoal: "Shots on Goal",
      fouls: "Fouls",
      offsides: "Offsides",
    };

    const fetchAllStats = () =>
      mapSequential(fixtures, async (f: any) => {
        try {
          const statsRes = await client().get("/fixtures/statistics", {
            params: { fixture: f.fixture.id, team: teamId },
          });
          const stats: any[] = statsRes.data?.response?.[0]?.statistics ?? [];
          const row: Record<string, number | null> = {};
          for (const [key, apiName] of Object.entries(fieldMap)) {
            const stat = stats.find((s: any) => s.type === apiName);
            row[key] = typeof stat?.value === "number" ? stat.value : null;
          }
          return row;
        } catch {
          return null;
        }
      });

    let valid: Record<string, number | null>[] = [];

    // Skús to až 3× odznova, kým sa nepodarí stiahnuť dáta pre všetky zápasy.
    for (let attempt = 0; attempt < 3 && valid.length < fixtures.length; attempt++) {
      const rows = await fetchAllStats();
      const currentValid = rows.filter((r): r is Record<string, number | null> => r !== null);
      if (currentValid.length > valid.length) {
        valid = currentValid;
      }
    }

    if (valid.length === 0) {
      setCached(cacheKey, empty, TTL_CORNERS_AVERAGE);
      return empty;
    }

    const average = (key: string): number | null => {
      const values = valid.map((r) => r[key]).filter((v): v is number => v !== null);
      return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
    };

    const result: TeamExtendedStatsAverages = {
      corners: average("corners"),
      shotsOnGoal: average("shotsOnGoal"),
      fouls: average("fouls"),
      offsides: average("offsides"),
    };

    setCached(cacheKey, result, TTL_CORNERS_AVERAGE);
    return result;
  } catch {
    return empty;
  }
}

/** Priemer rohov - tenký obal nad getTeamExtendedStatsAverages (kvôli spätnej kompatibilite). */
export async function getTeamCornersAverage(
  leagueId: number,
  season: number,
  teamId: number,
  lastN: number = 10
): Promise<number | null> {
  const stats = await getTeamExtendedStatsAverages(leagueId, season, teamId, lastN);
  return stats.corners;
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
  const cacheKey = `priors:${leagueId}:${season}:${teamId}:${seasonsBack}`;
  const cached = getCached<TeamGoalPriorsResult | null>(cacheKey);
  if (cached !== undefined) return cached;

  // Váhy pre najbližšiu, druhú a tretiu predošlú sezónu - novšie sezóny sa počítajú viac.
  const recencyWeights = [3, 2, 1];
  const pastSeasons = Array.from({ length: seasonsBack }, (_, i) => season - 1 - i);

  const fetchAllSeasons = () =>
    mapSequential(pastSeasons, async (pastSeason, idx) => {
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

  let valid: NonNullable<Awaited<ReturnType<typeof fetchAllSeasons>>[number]>[] = [];

  // Skús to až 3× odznova, kým sa nepodarí nájsť všetky sezóny - mohlo ísť
  // len o krátkodobý výpadok pri konkrétnom volaní. Zakaždým si necháme ten
  // najlepší (najúplnejší) výsledok, aký sa doteraz podarilo získať.
  for (let attempt = 0; attempt < 3 && valid.length < seasonsBack; attempt++) {
    const results = await fetchAllSeasons();
    const currentValid = results.filter((r): r is NonNullable<typeof r> => r !== null);
    if (currentValid.length > valid.length) {
      valid = currentValid;
    }
  }

  if (valid.length === 0) {
    setCached(cacheKey, null, TTL_HISTORICAL_PRIORS);
    return null;
  }

  const totalWeight = valid.reduce((sum, r) => sum + r.weight, 0);
  const weightedAvg = (key: "forHome" | "forAway" | "againstHome" | "againstAway") =>
    valid.reduce((sum, r) => sum + r[key] * r.weight, 0) / totalWeight;

  const result: TeamGoalPriorsResult = {
    priors: {
      forHome: weightedAvg("forHome"),
      forAway: weightedAvg("forAway"),
      againstHome: weightedAvg("againstHome"),
      againstAway: weightedAvg("againstAway"),
    },
    seasonsUsed: valid.length,
    seasonsChecked: seasonsBack,
  };
  setCached(cacheKey, result, TTL_HISTORICAL_PRIORS);
  return result;
}

/** Dopočíta skutočný ligový priemer gólov doma/vonku z celej tabuľky danej sezóny. */
export async function getLeagueAverages(leagueId: number, season: number): Promise<LeagueAverages> {
  const cacheKey = `leagueAvg:${leagueId}:${season}`;
  const cached = getCached<LeagueAverages>(cacheKey);
  if (cached !== undefined) return cached;

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

  const result: LeagueAverages = {
    home: totalHomeGames > 0 ? totalHomeGoals / totalHomeGames : 1.5,
    away: totalAwayGames > 0 ? totalAwayGoals / totalAwayGames : 1.15,
  };
  setCached(cacheKey, result, TTL_LEAGUE_AVERAGES);
  return result;
}

/** Načíta aktuálnu súpisku tímu (hráči, pozícia, číslo dresu). */
export async function getTeamSquad(teamId: number): Promise<SquadPlayer[]> {
  const cacheKey = `squad:${teamId}`;
  const cached = getCached<SquadPlayer[]>(cacheKey);
  if (cached !== undefined) return cached;

  const res = await client().get("/players/squads", { params: { team: teamId } });
  checkApiErrors(res.data);

  const players: any[] = res.data?.response?.[0]?.players ?? [];
  const result: SquadPlayer[] = players.map((p: any) => ({
    id: p.id,
    name: p.name,
    position: p.position,
    number: p.number ?? null,
    photo: p.photo,
  }));

  setCached(cacheKey, result, TTL_SQUAD);
  return result;
}

/** Načíta sezónne góly a počet zápasov hráča v danej lige. */
export async function getPlayerSeasonStats(
  playerId: number,
  season: number,
  leagueId: number
): Promise<PlayerSeasonStats | null> {
  const cacheKey = `playerStats:${playerId}:${season}:${leagueId}`;
  const cached = getCached<PlayerSeasonStats | null>(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const res = await client().get("/players", {
      params: { id: playerId, season, league: leagueId },
    });
    checkApiErrors(res.data);

    const statsEntries: any[] = res.data?.response?.[0]?.statistics ?? [];
    // Vyber štatistiky za správnu ligu (jeden hráč môže mať v odpovedi viac súťaží).
    const entry = statsEntries.find((s: any) => s.league?.id === leagueId) ?? statsEntries[0];
    if (!entry) {
      setCached(cacheKey, null, TTL_PLAYER_STATS);
      return null;
    }

    const result: PlayerSeasonStats = {
      goals: entry.goals?.total ?? 0,
      appearances: entry.games?.appearences ?? 0,
    };
    setCached(cacheKey, result, TTL_PLAYER_STATS);
    return result;
  } catch {
    return null;
  }
}

/**
 * Načíta VŠETKÝCH hráčov tímu naraz aj s ich sezónnymi gólmi a zápasmi
 * (2-3 volania na celý tím podľa /players?team=..., namiesto jedného
 * volania na každého hráča zvlášť). Používa sa na automatický výber
 * najpravdepodobnejšieho strelca.
 */
export async function getTeamPlayersWithStats(
  teamId: number,
  season: number,
  leagueId: number,
  maxPages: number = 3
): Promise<RawPlayerStat[]> {
  const cacheKey = `teamPlayers:${teamId}:${season}:${leagueId}`;
  const cached = getCached<RawPlayerStat[]>(cacheKey);
  if (cached !== undefined) return cached;

  const allPlayers: RawPlayerStat[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const res = await client().get("/players", {
      params: { team: teamId, season, league: leagueId, page },
    });
    checkApiErrors(res.data);

    const response: any[] = res.data?.response ?? [];
    totalPages = res.data?.paging?.total ?? 1;

    for (const item of response) {
      const statsEntries: any[] = item.statistics ?? [];
      const entry = statsEntries.find((s: any) => s.league?.id === leagueId) ?? statsEntries[0];
      if (!entry || !item.player) continue;

      allPlayers.push({
        id: item.player.id,
        name: item.player.name,
        goals: entry.goals?.total ?? 0,
        appearances: entry.games?.appearences ?? 0,
      });
    }

    page++;
  } while (page <= totalPages && page <= maxPages);

  setCached(cacheKey, allPlayers, TTL_SQUAD);
  return allPlayers;
}

/** Načíta aktuálny stav a skóre konkrétneho zápasu (na overenie uložených tipov). */
export async function getFixtureResult(
  fixtureId: number
): Promise<{ status: string; homeGoals: number | null; awayGoals: number | null } | null> {
  try {
    const res = await client().get("/fixtures", { params: { id: fixtureId } });
    checkApiErrors(res.data);
    const item = res.data?.response?.[0];
    if (!item) return null;

    return {
      status: item.fixture?.status?.short ?? "NS",
      homeGoals: item.goals?.home ?? null,
      awayGoals: item.goals?.away ?? null,
    };
  } catch {
    return null;
  }
}

/** Načíta celkový počet rohov a kariet (oba tímy spolu) v už odohranom zápase. */
export async function getFixtureCornersAndCards(
  fixtureId: number
): Promise<{
  corners: number | null;
  cards: number | null;
  shotsOnGoal: number | null;
  fouls: number | null;
  offsides: number | null;
}> {
  try {
    const res = await client().get("/fixtures/statistics", { params: { fixture: fixtureId } });
    checkApiErrors(res.data);

    const teams: any[] = res.data?.response ?? [];
    const totals: Record<string, number> = {};
    const found: Record<string, boolean> = {};

    const fieldMap: Record<string, string> = {
      corners: "Corner Kicks",
      cardsYellow: "Yellow Cards",
      cardsRed: "Red Cards",
      shotsOnGoal: "Shots on Goal",
      fouls: "Fouls",
      offsides: "Offsides",
    };

    for (const t of teams) {
      const stats: any[] = t.statistics ?? [];
      for (const [key, apiName] of Object.entries(fieldMap)) {
        const stat = stats.find((s: any) => s.type === apiName);
        if (typeof stat?.value === "number") {
          totals[key] = (totals[key] ?? 0) + stat.value;
          found[key] = true;
        }
      }
    }

    return {
      corners: found.corners ? totals.corners : null,
      cards: found.cardsYellow || found.cardsRed ? (totals.cardsYellow ?? 0) + (totals.cardsRed ?? 0) : null,
      shotsOnGoal: found.shotsOnGoal ? totals.shotsOnGoal : null,
      fouls: found.fouls ? totals.fouls : null,
      offsides: found.offsides ? totals.offsides : null,
    };
  } catch {
    return { corners: null, cards: null, shotsOnGoal: null, fouls: null, offsides: null };
  }
}

/** Vráti ID hráčov, ktorí v tomto zápase reálne skórovali (vlastné góly sa nepočítajú). */
export async function getFixtureGoalscorerIds(fixtureId: number): Promise<number[]> {
  try {
    const res = await client().get("/fixtures/events", { params: { fixture: fixtureId } });
    checkApiErrors(res.data);

    const events: any[] = res.data?.response ?? [];
    return events
      .filter((e: any) => e.type === "Goal" && e.detail !== "Own Goal")
      .map((e: any) => e.player?.id)
      .filter((id: any): id is number => typeof id === "number");
  } catch {
    return [];
  }
}

/**
 * Načíta potvrdenú zostavu zápasu (základná jedenástka + náhradníci) pre oba
 * tímy. API-Football zvyčajne zverejňuje zostavy cca 1 hodinu pred výkopom -
 * pri zápasoch ďalej v budúcnosti vráti pre danú stranu null (zostava zatiaľ
 * nie je známa).
 */
export async function getFixtureLineupPlayerIds(
  fixtureId: number
): Promise<{ homeIds: number[] | null; awayIds: number[] | null }> {
  try {
    const res = await client().get("/fixtures/lineups", { params: { fixture: fixtureId } });
    checkApiErrors(res.data);

    const teams: any[] = res.data?.response ?? [];
    if (teams.length < 2) return { homeIds: null, awayIds: null };

    const extractIds = (team: any): number[] | null => {
      const startXI: any[] = team?.startXI ?? [];
      const subs: any[] = team?.substitutes ?? [];
      const ids = [...startXI, ...subs]
        .map((p: any) => p.player?.id)
        .filter((id: any): id is number => typeof id === "number");
      return ids.length > 0 ? ids : null;
    };

    return { homeIds: extractIds(teams[0]), awayIds: extractIds(teams[1]) };
  } catch {
    return { homeIds: null, awayIds: null };
  }
}
