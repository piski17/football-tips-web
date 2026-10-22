import { MarketOdds } from "./oddsMatcher";
import axios, { AxiosInstance } from "axios";
import axiosRetry from "axios-retry";
import {
  Fixture,
  TeamStatistics,
  HeadToHeadMatch,
  LeagueAverages,
  TeamGoalPriorsResult,
  SquadPlayer,
  PlayerSeasonStats,
  RawPlayerStat, H2HStats, MissingPlayer, RefereeProfile } from "./types";

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
  // API-Football pri prekročení limitu požiadaviek odpovie "úspešne" (HTTP 200),
  // ale s chybou "Too many requests" v tele odpovede. Takú odpoveď premeníme
  // na chybu 429, aby sa požiadavka po chvíli zopakovala - inak by appka
  // považovala chýbajúce dáta (kurzy, štatistiky) za skutočne prázdne.
  instance.interceptors.response.use((res: any) => {
    const errors = res.data?.errors;
    const messages: string[] = !errors
      ? []
      : Array.isArray(errors)
      ? errors.map(String)
      : Object.entries(errors).map(([k, v]) => `${k}: ${String(v)}`);
    if (messages.some((m) => /rate|too many|limit/i.test(m))) {
      const err: any = new Error("Prekročený limit požiadaviek API: " + messages.join(" | "));
      err.config = res.config;
      err.response = { ...res, status: 429 };
      err.isAxiosError = true;
      return Promise.reject(err);
    }
    return res;
  });

  axiosRetry(instance, {
    retries: 6,
    // Pri limite požiadaviek čakáme dlhšie (1,5 s, 3 s, 4,5 s …), inak krátko.
    retryDelay: (retryCount: number, error: any) =>
      error?.response?.status === 429 ? retryCount * 1500 + Math.random() * 500 : axiosRetry.exponentialDelay(retryCount),
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

const TTL_HISTORICAL_PRIORS = 24 * 60 * 60 * 1000; // 24 hodín - minulé sezóny sa nikdy nemenia, netreba to počítať často znova
const TTL_LEAGUE_AVERAGES = 60 * 60 * 1000; // 1 hodina
const TTL_CORNERS_AVERAGE = 30 * 60 * 1000; // 30 minút - môže sa meniť s novo odohranými zápasmi
const TTL_SQUAD = 6 * 60 * 60 * 1000; // 6 hodín - súpiska sa počas dňa prakticky nemení
const TTL_PLAYER_STATS = 3 * 60 * 60 * 1000; // 3 hodiny
const TTL_ODDS = 30 * 60 * 1000; // 30 minút - kurzy sa pred zápasom priebežne menia

function checkApiErrors(data: any): void {
  const errors = data?.errors;
  if (!errors) return;
  const messages: string[] = Array.isArray(errors) ? errors : Object.values(errors).map((v) => String(v));
  if (messages.length > 0) throw new Error(messages.join(" | "));
}

/** Deň pred dátumom (YYYY-MM-DD) – pre spätný test: údaje len spred výkopu. */
function dayBefore(iso: string): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
/** Ponechá len zápasy odohrané pred daným časom (pre spätný test). */
function beforeDate(fixtures: any[], asOf?: string): any[] {
  if (!asOf) return fixtures;
  const t = new Date(asOf).getTime();
  return fixtures.filter((f: any) => new Date(f?.fixture?.date).getTime() < t);
}

/** Zápasy zoradené od najnovšieho (API bez „last“ ich vracia od najstaršieho). */
function newestFirst(fixtures: any[]): any[] {
  return [...fixtures].sort((a: any, b: any) => new Date(b?.fixture?.date).getTime() - new Date(a?.fixture?.date).getTime());
}

/** Odohrané zápasy ligy v období (pre spätný test). */
export async function getFinishedFixtures(leagueId: number, season: number, from: string, to: string): Promise<Fixture[]> {
  const res = await client().get("/fixtures", { params: { league: leagueId, season, from, to, status: "FT-AET-PEN" } });
  checkApiErrors(res.data);
  return (res.data?.response ?? []).map((item: any) => mapFixture(item));
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
      logo: item.league.logo,
    },
    homeTeam: { id: item.teams.home.id, name: item.teams.home.name, logo: item.teams.home.logo },
    awayTeam: { id: item.teams.away.id, name: item.teams.away.name, logo: item.teams.away.logo },
    status: item.fixture.status?.short ?? "NS",
    elapsed: item.fixture.status?.elapsed ?? null,
    goalsHome: item.goals?.home ?? null,
    goalsAway: item.goals?.away ?? null,
    referee: item.fixture.referee ?? null,
  };
}

/** Načíta zápasy danej ligy/sezóny na konkrétny deň (alebo všetky, ak deň nie je zadaný). */
// Stavy zápasu, ktoré považujeme za "skončené" - takéto zápasy sa v zozname
// dnešných zápasov už nezobrazujú (FT = koniec, AET = po predĺžení, PEN = po penaltách).
const FINISHED_STATUSES = ["FT", "AET", "PEN"];
// Nedohrané zápasy tiež zmiznú: ABD = prerušený a nedohraný (napr. pre výtržnosti),
// CANC = zrušený, PST = odložený, AWD = kontumácia, WO = súper nenastúpil.
const NOT_PLAYED_STATUSES = ["ABD", "CANC", "PST", "AWD", "WO"];

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
    .filter((f: Fixture) => !FINISHED_STATUSES.includes(f.status) && !NOT_PLAYED_STATUSES.includes(f.status));

  return all.sort((a: Fixture, b: Fixture) => a.timestamp - b.timestamp).slice(0, limitCount);
}

/** Načíta agregované štatistiky tímu v danej lige a sezóne. */
export async function getTeamStatistics(
  leagueId: number,
  season: number,
  teamId: number,
  asOf?: string
): Promise<TeamStatistics> {
  const cacheKey = `teamStats:${leagueId}:${season}:${teamId}:${asOf ? dayBefore(asOf) : ""}`;
  const cached = getCached<TeamStatistics>(cacheKey);
  if (cached !== undefined) return cached;

  const fetchOnce = async (): Promise<TeamStatistics> => {
    const res = await client().get("/teams/statistics", {
      params: { league: leagueId, season, team: teamId, ...(asOf ? { date: dayBefore(asOf) } : {}) },
    });
    checkApiErrors(res.data);

    const d = res.data?.response;
    if (!d || !d.team) {
      throw new Error(`Štatistiky pre tím ${teamId} sa nenašli (liga ${leagueId}, sezóna ${season}).`);
    }

    // Karty prichádzajú rozdelené po 15-minútových intervaloch (žlté aj červené) -
    // spočítame ich všetky a vydelíme počtom zápasov, aby sme dostali priemer na zápas.
    const sumCardBuckets = (buckets: any): number => {
      if (!buckets) return 0;
      return Object.values(buckets).reduce((sum: number, bucket: any) => sum + (bucket?.total ?? 0), 0);
    };
    const totalYellow = sumCardBuckets(d.cards?.yellow);
    const totalGames = d.fixtures?.played?.total ?? 0;
    // Karty = len žlté (17. 10. 2026, Michalovo rozhodnutie) – červené stávkovky rátajú rôzne.
    const cardsPerGame = totalGames > 0 ? totalYellow / totalGames : 0;

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
  /** Priemerné držanie lopty tímu v % (0–100). */
  possession: number | null;
  /** To isté, ale čo tím DOVOĽUJE súperom (rohy, strely, fauly a ofsajdy súperov). */
  cornersAgainst?: number | null;
  shotsOnGoalAgainst?: number | null;
  foulsAgainst?: number | null;
  offsidesAgainst?: number | null;
  /** Karty tímu (len žlté) a karty jeho súperov, priemer na zápas. */
  cards?: number | null;
  cardsAgainst?: number | null;
  /** Góly tímu a jeho súperov v posledných zápasoch (novšie s väčšou váhou) – aktuálna forma. */
  goalsFor?: number | null;
  goalsAgainst?: number | null;
  /** Z koľkých zápasov sa forma gólov počítala. */
  goalsGames?: number;
  /**
   * Nový model (21. 10. 2026, beží zatiaľ potichu): pomer „60 % xG + 40 % góly“ ku gólom
   * v tých istých zápasoch – útok (For) a obrana (Against). 1 = bez zmeny, null = málo zápasov s xG.
   */
  xgRatioFor?: number | null;
  xgRatioAgainst?: number | null;
  xgGames?: number;
  /** Nový model: priemery len zo zápasov doma (venueHome) a len vonku (venueAway). */
  venueHome?: VenueStats;
  venueAway?: VenueStats;
}

/** Priemery štatistík len z domácich alebo len z vonkajších zápasov (nový model, 21. 10. 2026). */
export interface VenueStats {
  games: number;
  corners: number | null;
  cornersAgainst: number | null;
  shotsOnGoal: number | null;
  shotsOnGoalAgainst: number | null;
  fouls: number | null;
  foulsAgainst: number | null;
  cards: number | null;
  cardsAgainst: number | null;
}

/** Hodnota štatistiky z API - číslo, alebo percento ako text ("55%"). */
function parseStatValue(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseFloat(value.replace("%", ""));
    return isFinite(n) ? n : null;
  }
  return null;
}

export async function getTeamExtendedStatsAverages(
  leagueId: number,
  season: number,
  teamId: number,
  lastN: number = 10,
  asOf?: string
): Promise<TeamExtendedStatsAverages> {
  const cacheKey = `extStatsAvg5:${leagueId}:${season}:${teamId}:${lastN}:${asOf ?? ""}`;
  // Pri spätnom teste načítame viac zápasov a ponecháme len tie spred výkopu.
  const extra = asOf ? 15 : 0;
  const cached = getCached<TeamExtendedStatsAverages>(cacheKey);
  if (cached !== undefined) return cached;

  const empty: TeamExtendedStatsAverages = { corners: null, shotsOnGoal: null, fouls: null, offsides: null, possession: null };

  try {
    // Tieto štatistiky (na rozdiel od gólov) nemajú sezónny súhrn v API -
    // počítajú sa z jednotlivých zápasov. Ak ich aktuálna sezóna nemá dosť
    // (napr. na začiatku sezóny), doplníme zvyšok z tej predošlej, aby bol
    // priemer od začiatku spoľahlivý.
    // Spätný test (20. 10. 2026): „last“ vracia posledné zápasy CELEJ sezóny. Pri teste
    // minulej sezóny (napr. aug. – okt. 2024) sú to zápasy z jari, teda všetky po asOf –
    // filter ich vyhodil a priemer sa potom zobral z konca PREDOŠLEJ sezóny (mesiace starý).
    // S asOf sa preto načítajú všetky zápasy sezóny a ponechá sa posledných lastN spred výkopu.
    // Živá analýza (bez asOf) ostáva bez zmeny.
    const currentSeasonRes = await client().get("/fixtures", {
      params: asOf
        ? { team: teamId, league: leagueId, season, status: "FT" }
        : { team: teamId, league: leagueId, season, last: lastN + extra, status: "FT" },
    });
    checkApiErrors(currentSeasonRes.data);
    let fixtures: any[] = (asOf ? newestFirst(beforeDate(currentSeasonRes.data?.response ?? [], asOf)) : beforeDate(currentSeasonRes.data?.response ?? [], asOf)).slice(0, lastN);

    if (fixtures.length < lastN) {
      const remaining = lastN - fixtures.length;
      try {
        const [prevSeason] = await getPreviousSeasons(leagueId, season, 1);
        const prevSeasonRes = await client().get("/fixtures", {
          params: asOf
            ? { team: teamId, league: leagueId, season: prevSeason, status: "FT" }
            : { team: teamId, league: leagueId, season: prevSeason, last: remaining + extra, status: "FT" },
        });
        const prevRaw = beforeDate(prevSeasonRes.data?.response ?? [], asOf);
        const prevFixtures: any[] = (asOf ? newestFirst(prevRaw) : prevRaw).slice(0, remaining);
        fixtures = [...fixtures, ...prevFixtures];
      } catch {
        // predošlá sezóna nie je k dispozícii - pokračujeme len s tým, čo máme
      }
    }

    // Stále málo zápasov (typicky reprezentácie – Liga národov sa hrá zriedka):
    // doplníme posledné zápasy tímu zo VŠETKÝCH súťaží (kvalifikácie, turnaje, prípravné).
    if (fixtures.length < 6) {
      try {
        const allRes = await client().get("/fixtures", {
          params: { team: teamId, last: lastN + extra, status: "FT-AET-PEN" },
        });
        const seen = new Set(fixtures.map((f: any) => f.fixture?.id));
        for (const f of beforeDate(allRes.data?.response ?? [], asOf)) {
          if (fixtures.length >= lastN) break;
          if (!seen.has(f.fixture?.id)) fixtures.push(f);
        }
      } catch {
        // bez doplnenia
      }
    }

    if (fixtures.length === 0) {
      setCached(cacheKey, empty, TTL_CORNERS_AVERAGE);
      return empty;
    }

    const fieldMap: Record<string, string> = {
      corners: "Corner Kicks",
      shotsOnGoal: "Shots on Goal",
      fouls: "Fouls",
      offsides: "Offsides",
      possession: "Ball Possession",
    };

    const fetchAllStats = () =>
      mapSequential(fixtures, async (f: any) => {
        try {
          // Štatistiky oboch tímov naraz (jedna požiadavka) – vlastné aj súperove.
          const rawKey = `fxStatsRaw:${f.fixture.id}`;
          let teams = getCached<any[]>(rawKey);
          if (teams === undefined) {
            const statsRes = await client().get("/fixtures/statistics", {
              params: { fixture: f.fixture.id },
            });
            checkApiErrors(statsRes.data);
            teams = (statsRes.data?.response ?? []) as any[];
            if (teams.length) setCached(rawKey, teams, 7 * 24 * 60 * 60 * 1000);
          }
          const own: any[] = teams.find((t: any) => t?.team?.id === teamId)?.statistics ?? [];
          const opp: any[] = teams.find((t: any) => t?.team?.id !== teamId)?.statistics ?? [];
          if (own.length === 0) return null;
          const row: Record<string, number | null> = {};
          for (const [key, apiName] of Object.entries(fieldMap)) {
            row[key] = parseStatValue(own.find((s: any) => s.type === apiName)?.value);
            if (key !== "possession") {
              row[key + "Against"] = parseStatValue(opp.find((s: any) => s.type === apiName)?.value);
            }
          }
          // Karty = len žlté (od 17. 10. 2026). Chýbajúca hodnota v API znamená 0 kariet.
          const cardsOf = (list: any[]) =>
            parseStatValue(list.find((s: any) => s.type === "Yellow Cards")?.value) ?? 0;
          row.cards = cardsOf(own);
          row.cardsAgainst = opp.length ? cardsOf(opp) : null;
          // Nový model (21. 10. 2026): xG z tej istej odpovede (žiadna požiadavka navyše),
          // miesto zápasu a góly – pre pomer xG a priemery doma / vonku.
          row.xg = parseStatValue(own.find((s: any) => s.type === "expected_goals")?.value);
          row.xgAgainst = parseStatValue(opp.find((s: any) => s.type === "expected_goals")?.value);
          row.isHome = f.teams?.home?.id === teamId ? 1 : 0;
          const gh = f?.goals?.home, ga = f?.goals?.away;
          row.gf = gh == null || ga == null ? null : Number(row.isHome ? gh : ga);
          row.ga = gh == null || ga == null ? null : Number(row.isHome ? ga : gh);
          row.time = new Date(f.fixture?.date).getTime() || 0;
          return row;
        } catch {
          return null;
        }
      });

    let valid: Record<string, number | null>[] = [];

    // Skús to až 3× odznova, kým sa nepodarí stiahnuť dáta pre všetky zápasy.
    for (let attempt = 0; attempt < 5 && valid.length < fixtures.length; attempt++) {
      const rows = await fetchAllStats();
      const currentValid = rows.filter((r): r is Record<string, number | null> => r !== null);
      if (currentValid.length > valid.length) {
        valid = currentValid;
      }
    }

    if (valid.length === 0) {
      // Nič sa nepodarilo stiahnuť (napr. výpadok API) - NEukladáme si to,
      // aby sa pri ďalšej analýze skúsilo znova.
      return empty;
    }

    const average = (key: string): number | null => {
      const values = valid.map((r) => r[key]).filter((v): v is number => v !== null);
      return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
    };

    // Forma podľa gólov: posledné zápasy tímu, každý starší zápas má váhu × 0,9.
    const goalRows = fixtures
      .filter((f: any) => f?.goals?.home != null && f?.goals?.away != null)
      .sort((a: any, b: any) => new Date(b.fixture?.date).getTime() - new Date(a.fixture?.date).getTime())
      .map((f: any) => {
        const isHome = f.teams?.home?.id === teamId;
        return { gf: Number(isHome ? f.goals.home : f.goals.away), ga: Number(isHome ? f.goals.away : f.goals.home) };
      });
    let gw = 0, gfSum = 0, gaSum = 0;
    goalRows.forEach((r, i) => {
      const w = Math.pow(0.9, i);
      gw += w; gfSum += r.gf * w; gaSum += r.ga * w;
    });

    // Nový model: pomer xG – zápasy s xG aj gólmi, novšie s väčšou váhou (× 0,9 na zápas).
    const xgRows = valid
      .filter((r) => r.xg != null && r.xgAgainst != null && r.gf != null && r.ga != null)
      .sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
    let xw = 0, xgF = 0, xgA = 0, gF = 0, gA = 0;
    xgRows.forEach((r, i) => {
      const w = Math.pow(0.9, i);
      xw += w; xgF += r.xg! * w; xgA += r.xgAgainst! * w; gF += r.gf! * w; gA += r.ga! * w;
    });
    const xgRatio = (xgSum: number, goalSum: number): number | null => {
      if (xgRows.length < 5 || xw <= 0) return null;
      // Pri veľmi malom počte gólov by pomer „vybuchol“ – základ aspoň 0,5 gólu na zápas.
      const goals = Math.max(goalSum / xw, 0.5);
      const mixed = 0.6 * (xgSum / xw) + 0.4 * (goalSum / xw);
      return Math.min(1.2, Math.max(0.8, Math.max(mixed, 0.3) / goals));
    };
    const venue = (home: 1 | 0): VenueStats => {
      const list = valid.filter((r) => r.isHome === home);
      const avg = (key: string): number | null => {
        const values = list.map((r) => r[key]).filter((v): v is number => v != null);
        return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
      };
      return {
        games: list.length,
        corners: avg("corners"), cornersAgainst: avg("cornersAgainst"),
        shotsOnGoal: avg("shotsOnGoal"), shotsOnGoalAgainst: avg("shotsOnGoalAgainst"),
        fouls: avg("fouls"), foulsAgainst: avg("foulsAgainst"),
        cards: avg("cards"), cardsAgainst: avg("cardsAgainst"),
      };
    };

    const result: TeamExtendedStatsAverages = {
      xgRatioFor: xgRatio(xgF, gF),
      xgRatioAgainst: xgRatio(xgA, gA),
      xgGames: xgRows.length,
      venueHome: venue(1),
      venueAway: venue(0),
      goalsFor: gw > 0 ? gfSum / gw : null,
      goalsAgainst: gw > 0 ? gaSum / gw : null,
      goalsGames: goalRows.length,
      corners: average("corners"),
      shotsOnGoal: average("shotsOnGoal"),
      fouls: average("fouls"),
      offsides: average("offsides"),
      possession: average("possession"),
      cornersAgainst: average("cornersAgainst"),
      shotsOnGoalAgainst: average("shotsOnGoalAgainst"),
      foulsAgainst: average("foulsAgainst"),
      offsidesAgainst: average("offsidesAgainst"),
      cards: average("cards"),
      cardsAgainst: average("cardsAgainst"),
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

const TTL_LEAGUE_SEASONS = 24 * 60 * 60 * 1000; // 24 hodín

/**
 * Roky sezón, ktoré súťaž naozaj má (napr. Liga národov: 2018, 2020, 2022, 2024…).
 * Ligy sa hrajú každý rok, ale reprezentačné súťaže len každé 2 roky - preto
 * nestačí jednoducho odpočítať 1, 2, 3 roky.
 */
async function getLeagueSeasonYears(leagueId: number): Promise<number[]> {
  const cacheKey = `leagueSeasons:${leagueId}`;
  const cached = getCached<number[]>(cacheKey);
  if (cached !== undefined) return cached;
  try {
    const res = await client().get("/leagues", { params: { id: leagueId } });
    checkApiErrors(res.data);
    const years: number[] = (res.data?.response?.[0]?.seasons ?? [])
      .map((s: any) => Number(s?.year))
      .filter((y: number) => isFinite(y));
    const unique = Array.from(new Set(years)).sort((a, b) => b - a);
    setCached(cacheKey, unique, TTL_LEAGUE_SEASONS);
    return unique;
  } catch {
    return [];
  }
}

/** Posledných `count` sezón súťaže pred `season`. Ak API zlyhá, klasicky season-1, season-2, … */
export async function getPreviousSeasons(leagueId: number, season: number, count: number): Promise<number[]> {
  const years = (await getLeagueSeasonYears(leagueId)).filter((y) => y < season).slice(0, count);
  if (years.length > 0) return years;
  return Array.from({ length: count }, (_, i) => season - 1 - i);
}

/**
 * Forma tímu z posledných odohraných zápasov vo VŠETKÝCH súťažiach (napr. pri
 * reprezentácii kvalifikácie, turnaje aj prípravné zápasy). Vracia text ako
 * "WDLWW" - najstarší zápas vľavo, najnovší vpravo (rovnako ako API).
 * Použije sa, keď tím v aktuálnej sezóne súťaže ešte nehral.
 */
/** Koľko zápasov tím v sezóne odohral vo všetkých súťažiach (pre pohárové súťaže, napr. Ligu majstrov). */
export async function getSeasonGamesAnyCompetition(teamId: number, season: number): Promise<number | null> {
  const cacheKey = `seasonGamesAny:${teamId}:${season}`;
  const cached = getCached<number | null>(cacheKey);
  if (cached !== undefined) return cached;
  try {
    const res = await client().get("/fixtures", { params: { team: teamId, season, status: "FT-AET-PEN" } });
    checkApiErrors(res.data);
    const count = (res.data?.response ?? []).length;
    setCached(cacheKey, count, TTL_CORNERS_AVERAGE);
    return count;
  } catch {
    return null;
  }
}

/**
 * Góly tímu z posledných `count` odohraných zápasov vo VŠETKÝCH súťažiach (hlavne domáca liga),
 * zvlášť doma a vonku – pre Ligu majstrov a Európsku ligu, kde má tím v súťaži len pár zápasov
 * (22. 10. 2026, Michalovo rozhodnutie). Vráti null pri chybe alebo menej ako 6 zápasoch.
 */
export async function getRecentGoalsAnyCompetition(
  teamId: number,
  count: number = 10
): Promise<{ played: { home: number; away: number; total: number }; for: { home: number; away: number; total: number }; against: { home: number; away: number; total: number } } | null> {
  const cacheKey = `recentGoalsAny:${teamId}:${count}`;
  const cached = getCached<any>(cacheKey);
  if (cached !== undefined) return cached;
  try {
    const res = await client().get("/fixtures", { params: { team: teamId, last: count, status: "FT-AET-PEN" } });
    checkApiErrors(res.data);
    const played = { home: 0, away: 0, total: 0 };
    const gf = { home: 0, away: 0, total: 0 };
    const ga = { home: 0, away: 0, total: 0 };
    for (const f of res.data?.response ?? []) {
      const isHome = f?.teams?.home?.id === teamId;
      const scored = isHome ? f?.goals?.home : f?.goals?.away;
      const conceded = isHome ? f?.goals?.away : f?.goals?.home;
      if (scored == null || conceded == null) continue;
      const side = isHome ? "home" : "away";
      played[side]++; played.total++;
      gf[side] += scored; gf.total += scored;
      ga[side] += conceded; ga.total += conceded;
    }
    const result = played.total >= 6 ? { played, for: gf, against: ga } : null;
    setCached(cacheKey, result, TTL_CORNERS_AVERAGE);
    return result;
  } catch {
    return null;
  }
}

export async function getRecentFormAnyCompetition(teamId: number, count: number = 5, asOf?: string): Promise<string> {
  const cacheKey = `recentForm:${teamId}:${count}:${asOf ?? ""}`;
  const cached = getCached<string>(cacheKey);
  if (cached !== undefined) return cached;
  try {
    const res = await client().get("/fixtures", { params: { team: teamId, last: count + (asOf ? 15 : 0), status: "FT-AET-PEN" } });
    checkApiErrors(res.data);
    const fixtures: any[] = beforeDate(res.data?.response ?? [], asOf)
      .sort((a: any, b: any) => new Date(b?.fixture?.date).getTime() - new Date(a?.fixture?.date).getTime())
      .slice(0, count)
      .sort(
      (a: any, b: any) => new Date(a?.fixture?.date).getTime() - new Date(b?.fixture?.date).getTime()
    );
    const form = fixtures
      .map((f: any) => {
        const isHome = f?.teams?.home?.id === teamId;
        const gf = isHome ? f?.goals?.home : f?.goals?.away;
        const ga = isHome ? f?.goals?.away : f?.goals?.home;
        if (gf == null || ga == null) return "";
        return gf > ga ? "W" : gf < ga ? "L" : "D";
      })
      .join("");
    setCached(cacheKey, form, TTL_CORNERS_AVERAGE);
    return form;
  } catch {
    return "";
  }
}

/** Oddych tímu pred zápasom (nový model, 21. 10. 2026). */
export interface RestInfo {
  /** Dni od posledného zápasu (vo všetkých súťažiach), null = neznáme. */
  restDays: number | null;
  /** Počet zápasov za posledných 14 dní pred výkopom. */
  games14: number;
}

/**
 * Únava a rotácia: koľko dní mal tím voľna od posledného zápasu (aj pohár, Liga majstrov)
 * a koľko zápasov odohral za posledné 2 týždne. Jedna požiadavka na tím a sezónu (cache 6 h).
 */
export async function getRestInfo(teamId: number, season: number, kickoffIso: string): Promise<RestInfo> {
  const empty: RestInfo = { restDays: null, games14: 0 };
  const kickoff = new Date(kickoffIso).getTime();
  if (!isFinite(kickoff)) return empty;
  const cacheKey = `teamSeasonDates:${teamId}:${season}`;
  let dates = getCached<number[]>(cacheKey);
  if (dates === undefined) {
    try {
      const res = await client().get("/fixtures", { params: { team: teamId, season } });
      checkApiErrors(res.data);
      dates = (res.data?.response ?? [])
        .filter((f: any) => ["FT", "AET", "PEN"].includes(f?.fixture?.status?.short))
        .map((f: any) => new Date(f?.fixture?.date).getTime())
        .filter((t: number) => isFinite(t));
      setCached(cacheKey, dates, TTL_SQUAD);
    } catch {
      return empty;
    }
  }
  const before = (dates ?? []).filter((t) => t < kickoff - 3 * 60 * 60 * 1000).sort((a, b) => b - a);
  if (!before.length) return empty;
  const day = 24 * 60 * 60 * 1000;
  return {
    restDays: Math.floor((kickoff - before[0]) / day),
    games14: before.filter((t) => t >= kickoff - 14 * day).length,
  };
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
  // Skutočné predchádzajúce sezóny súťaže (pri Lige národov napr. 2024, 2022, 2020).
  const pastSeasons = await getPreviousSeasons(leagueId, season, seasonsBack);

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
  for (let attempt = 0; attempt < 5 && valid.length < seasonsBack; attempt++) {
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
        assists: entry.goals?.assists ?? 0,
        minutes: entry.games?.minutes ?? 0,
        position: entry.games?.position ?? undefined,
        shotsOn: entry.shots?.on ?? 0,
        penaltyScored: entry.penalty?.scored ?? 0,
        starts: entry.games?.lineups ?? 0,
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
): Promise<{ status: string; homeGoals: number | null; awayGoals: number | null; htHome?: number | null; htAway?: number | null } | null> {
  try {
    const res = await client().get("/fixtures", { params: { id: fixtureId } });
    checkApiErrors(res.data);
    const item = res.data?.response?.[0];
    if (!item) return null;

    // Stávkové kancelárie vyhodnocujú podľa riadneho hracieho času (90 min +
    // nadstavenie). Pri zápasoch s predĺžením/penaltami preto berieme skóre
    // "fulltime" (stav po 90 min), nie konečné skóre vrátane predĺženia.
    return {
      status: item.fixture?.status?.short ?? "NS",
      homeGoals: item.score?.fulltime?.home ?? item.goals?.home ?? null,
      awayGoals: item.score?.fulltime?.away ?? item.goals?.away ?? null,
      // Stav po 1. polčase – pre tipy na góly v polčasoch (22. 10. 2026).
      htHome: item.score?.halftime?.home ?? null,
      htAway: item.score?.halftime?.away ?? null,
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
  /** Držanie lopty v % podľa názvu tímu (tak, ako ho vracia API). */
  possession: { team: string; value: number }[] | null;
  /** Rohy jednotlivých tímov (v poradí domáci, hostia, tak ako ich vracia API). */
  cornersByTeam?: { team: string; value: number }[] | null;
  /** Žlté karty a strely na bránu jednotlivých tímov (domáci, hostia). */
  cardsByTeam?: { team: string; value: number }[] | null;
  shotsByTeam?: { team: string; value: number }[] | null;
  /** Fauly jednotlivých tímov (domáci, hostia). */
  foulsByTeam?: { team: string; value: number }[] | null;
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

    const possession: { team: string; value: number }[] = [];
    for (const t of teams) {
      const stat = (t.statistics ?? []).find((s: any) => s.type === "Ball Possession");
      const value = parseStatValue(stat?.value);
      if (value !== null && t.team?.name) possession.push({ team: t.team.name, value });
    }

    const cornersByTeam: { team: string; value: number }[] = [];
    for (const t of teams) {
      const stat = (t.statistics ?? []).find((s: any) => s.type === "Corner Kicks");
      // chýbajúci údaj pri jednom tíme API vracia ako null = 0 rohov, ak má druhý tím číslo
      const value = typeof stat?.value === "number" ? stat.value : stat && stat.value == null ? 0 : null;
      if (value !== null && t.team?.name) cornersByTeam.push({ team: t.team.name, value });
    }

    // Žlté karty tímu: chýbajúci údaj = 0, ak má API štatistiky oboch tímov.
    const byTeam = (type: string, missingIsZero: boolean): { team: string; value: number }[] | null => {
      const out: { team: string; value: number }[] = [];
      for (const t of teams) {
        const stat = (t.statistics ?? []).find((s: any) => s.type === type);
        const value = parseStatValue(stat?.value) ?? (missingIsZero && (t.statistics ?? []).length ? 0 : null);
        if (value !== null && t.team?.name) out.push({ team: t.team.name, value });
      }
      return out.length === 2 ? out : null;
    };

    return {
      cardsByTeam: byTeam("Yellow Cards", true),
      shotsByTeam: byTeam("Shots on Goal", false),
      foulsByTeam: byTeam("Fouls", false),
      corners: found.corners ? totals.corners : null,
      // Karty = len žlté (od 17. 10. 2026); bez žltých, no s červenou = 0 žltých.
      cards: found.cardsYellow || found.cardsRed ? totals.cardsYellow ?? 0 : null,
      shotsOnGoal: found.shotsOnGoal ? totals.shotsOnGoal : null,
      fouls: found.fouls ? totals.fouls : null,
      offsides: found.offsides ? totals.offsides : null,
      possession: possession.length === 2 ? possession : null,
      cornersByTeam: found.corners && cornersByTeam.length === 2 ? cornersByTeam : null,
    };
  } catch {
    return { corners: null, cards: null, shotsOnGoal: null, fouls: null, offsides: null, possession: null, cornersByTeam: null, cardsByTeam: null, shotsByTeam: null, foulsByTeam: null };
  }
}

/**
 * Žlté karty v 1. a 2. polčase (22. 10. 2026) z udalostí zápasu. Nadstavený čas 1. polčasu
 * (45+2) patrí do 1. polčasu, karty v predĺžení (po 90. minúte bez nadstavenia) sa nerátajú.
 * Vráti null, ak API udalosti nemá.
 */
export async function getFixtureYellowCardHalves(fixtureId: number): Promise<{ first: number; second: number } | null> {
  try {
    const res = await client().get("/fixtures/events", { params: { fixture: fixtureId } });
    checkApiErrors(res.data);
    const events: any[] = res.data?.response ?? [];
    if (!events.length) return null;
    let first = 0, second = 0;
    for (const e of events) {
      if (String(e?.type).toLowerCase() !== "card" || !/^yellow card$/i.test(String(e?.detail ?? "").trim())) continue;
      const min = Number(e?.time?.elapsed);
      if (!isFinite(min)) continue;
      if (min <= 45) first++;
      else if (min <= 90) second++;
    }
    return { first, second };
  } catch {
    return null;
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
): Promise<{ homeIds: number[] | null; awayIds: number[] | null; homeStartIds?: number[] | null; awayStartIds?: number[] | null }> {
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

    // Základná jedenástka zvlášť – hráč na lavičke sa v modeli počíta ako čiastočne chýbajúci.
    const startIds = (team: any): number[] | null => {
      const ids = (team?.startXI ?? []).map((p: any) => p.player?.id).filter((id: any): id is number => typeof id === "number");
      return ids.length > 0 ? ids : null;
    };
    return { homeIds: extractIds(teams[0]), awayIds: extractIds(teams[1]), homeStartIds: startIds(teams[0]), awayStartIds: startIds(teams[1]) };
  } catch {
    return { homeIds: null, awayIds: null };
  }
}

/** Kontrola zostavy: čo presne vráti API pre zápas (počet tímov, hráčov, chyby). */
export async function getFixtureLineupsDebug(fixtureId: number): Promise<{
  results: number;
  errors: string[];
  teams: { team: string; formation: string | null; startXI: number; substitutes: number }[];
}> {
  const res = await client().get("/fixtures/lineups", { params: { fixture: fixtureId } });
  const errors = res.data?.errors;
  const errorList: string[] = !errors ? [] : Array.isArray(errors) ? errors.map(String) : Object.entries(errors).map(([k, v]) => `${k}: ${String(v)}`);
  const teams: any[] = res.data?.response ?? [];
  return {
    results: Number(res.data?.results ?? teams.length),
    errors: errorList,
    teams: teams.map((t) => ({
      team: t?.team?.name ?? "?",
      formation: t?.formation ?? null,
      startXI: (t?.startXI ?? []).length,
      substitutes: (t?.substitutes ?? []).length,
    })),
  };
}

/**
 * Skutočné predzápasové kurzy stávkových kancelárií pre zápas (endpoint /odds).
 * Pre každú kombináciu stávka + voľba vráti medián naprieč stávkovkami.
 * Pri chybe alebo chýbajúcich kurzoch vráti prázdny zoznam - analýza zápasu
 * tým nikdy nezlyhá, len tipy nebudú mať skutočný kurz.
 */
export async function getFixtureOdds(fixtureId: number, fresh = false): Promise<MarketOdds[]> {
  const cacheKey = `odds:${fixtureId}`;
  // fresh = vždy čerstvé kurzy (uzatvárací kurz tesne pred výkopom), nie z pamäte.
  const cached = fresh ? undefined : getCached<MarketOdds[]>(cacheKey);
  if (cached !== undefined) return cached;
  try {
    const collected = new Map<string, { bet: string; value: string; odds: number[] }>();
    let page = 1;
    let totalPages = 1;
    do {
      const res = await client().get("/odds", { params: { fixture: fixtureId, page } });
      checkApiErrors(res.data);
      totalPages = Number(res.data?.paging?.total) || 1;
      for (const item of res.data?.response ?? []) {
        for (const bookmaker of item?.bookmakers ?? []) {
          for (const bet of bookmaker?.bets ?? []) {
            for (const v of bet?.values ?? []) {
              const odd = parseFloat(String(v?.odd ?? "").replace(",", "."));
              if (!isFinite(odd) || odd <= 1) continue;
              const betName = String(bet?.name ?? "");
              const value = String(v?.value ?? "");
              const key = betName + "|||" + value;
              if (!collected.has(key)) collected.set(key, { bet: betName, value, odds: [] });
              collected.get(key)!.odds.push(odd);
            }
          }
        }
      }
      page++;
    } while (page <= totalPages && page <= 3);

    const result: MarketOdds[] = [];
    for (const { bet, value, odds } of collected.values()) {
      const sorted = [...odds].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      result.push({ bet, value, odd: Math.round(median * 100) / 100, bookmakers: sorted.length });
    }
    setCached(cacheKey, result, TTL_ODDS);
    return result;
  } catch {
    return [];
  }
}

/**
 * Štatistiky posledných vzájomných zápasov (rohy, karty, strely, fauly, ofsajdy,
 * držanie lopty) – na spresnenie odhadu. Odohrané zápasy sa už nemenia, preto
 * sa ukladajú na 7 dní a pri ďalšom otvorení zápasu nestoja nič.
 * Berie len zápasy za posledných 5 rokov (5 sezón), najviac 5 najnovších.
 */
export async function getHeadToHeadStats(
  h2h: HeadToHeadMatch[],
  currentHomeTeamName: string
): Promise<H2HStats[]> {
  const since = Date.now() - 5 * 365 * 24 * 60 * 60 * 1000;
  const recent = h2h
    .filter((m) => m.homeGoals !== null && m.awayGoals !== null && new Date(m.date).getTime() >= since)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);
  const out: H2HStats[] = [];
  for (const m of recent) {
    const cacheKey = `h2hStats:${m.fixtureId}`;
    let stats = getCached<Awaited<ReturnType<typeof getFixtureCornersAndCards>>>(cacheKey);
    if (stats === undefined) {
      stats = await getFixtureCornersAndCards(m.fixtureId);
      setCached(cacheKey, stats, 7 * 24 * 60 * 60 * 1000);
    }
    const poss = stats.possession?.find((p) => p.team === currentHomeTeamName)?.value ?? null;
    out.push({
      corners: stats.corners,
      cards: stats.cards,
      shotsOnGoal: stats.shotsOnGoal,
      fouls: stats.fouls,
      offsides: stats.offsides,
      homePossession: poss,
    });
  }
  return out;
}

/**
 * Hráči, ktorí v zápase určite chýbajú (zranenie, trest). API-Football ich
 * zverejňuje zvyčajne 1 – 2 dni pred zápasom; typ „Questionable" (neistý
 * štart) sa nepočíta. Funguje aj pre odohrané zápasy (spätný test).
 */
export async function getFixtureMissingPlayers(fixtureId: number): Promise<MissingPlayer[]> {
  const cacheKey = `injuries:${fixtureId}`;
  const cached = getCached<MissingPlayer[]>(cacheKey);
  if (cached !== undefined) return cached;
  try {
    const res = await client().get("/injuries", { params: { fixture: fixtureId } });
    checkApiErrors(res.data);
    const out: MissingPlayer[] = (res.data?.response ?? [])
      .filter((x: any) => x?.player?.id && x?.team?.id && x?.player?.type === "Missing Fixture")
      .map((x: any) => ({ playerId: x.player.id, name: x.player.name ?? "", teamId: x.team.id, reason: x.player.reason ?? "" }));
    setCached(cacheKey, out, TTL_ODDS);
    return out;
  } catch {
    return [];
  }
}

// ---------- Rozhodca (17. 10. 2026) ----------
// Fauly a karty veľmi závisia od toho, kto píska. Porovnáme posledné zápasy
// rozhodcu v lige s priemerom ligy a očakávané fauly a karty tím mierne posunieme.
const REF_GAMES = 10; // koľko posledných zápasov rozhodcu
const REF_MIN_GAMES = 3; // pri menej zápasoch rozhodcu nepoužijeme
const REF_BASELINE_GAMES = 20; // vzorka zápasov ligy pre priemer
const REF_SHRINK = 6; // váha = n / (n + 6): pri 10 zápasoch 62 %, pri 3 zápasoch 33 %
const REF_FOULS_RANGE: [number, number] = [0.85, 1.15];
const REF_CARDS_RANGE: [number, number] = [0.8, 1.2];
const TTL_REFEREE = 12 * 60 * 60 * 1000;
const TTL_FX_STATS = 7 * 24 * 60 * 60 * 1000;

/** "Michael Oliver, England" a "M. Oliver" -> "m oliver" (API píše mená rôzne). */
export function refereeKey(name: string | null | undefined): string {
  if (!name) return "";
  const base = name.split(",")[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z\s.-]/g, " ").trim();
  const parts = base.split(/[\s.]+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return parts[0][0] + " " + parts[parts.length - 1];
}

/** Rozhodca zápasu podľa ID (keď ho klient neposlal). */
export async function getFixtureReferee(fixtureId: number): Promise<string | null> {
  const key = `fxReferee:${fixtureId}`;
  const cached = getCached<string | null>(key);
  if (cached !== undefined) return cached;
  try {
    const res = await client().get("/fixtures", { params: { id: fixtureId } });
    checkApiErrors(res.data);
    const ref: string | null = res.data?.response?.[0]?.fixture?.referee ?? null;
    setCached(key, ref, 60 * 60 * 1000);
    return ref;
  } catch {
    return null;
  }
}

/** Fauly a karty (oba tímy spolu) v odohranom zápase; null, ak API údaje nemá. */
async function fixtureFoulsCards(fixtureId: number): Promise<{ fouls: number | null; cards: number | null } | null> {
  const rawKey = `fxStatsRaw:${fixtureId}`;
  let teams = getCached<any[]>(rawKey);
  if (teams === undefined) {
    try {
      const res = await client().get("/fixtures/statistics", { params: { fixture: fixtureId } });
      checkApiErrors(res.data);
      teams = (res.data?.response ?? []) as any[];
      if (teams.length) setCached(rawKey, teams, TTL_FX_STATS);
    } catch {
      return null;
    }
  }
  if (!teams || teams.length !== 2) return null;
  const val = (t: any, type: string) => parseStatValue((t.statistics ?? []).find((s: any) => s.type === type)?.value);
  const foulsParts = teams.map((t) => val(t, "Fouls"));
  const fouls = foulsParts.every((v) => v !== null) ? (foulsParts as number[]).reduce((a, b) => a + b, 0) : null;
  // Karty = len žlté; chýbajúca hodnota znamená 0 (ako pri tímových štatistikách).
  const cards = teams.reduce((a, t) => a + (val(t, "Yellow Cards") ?? 0), 0);
  return { fouls, cards };
}

async function finishedLeagueFixtures(leagueId: number, season: number): Promise<any[]> {
  const key = `leagueFinished:${leagueId}:${season}`;
  const cached = getCached<any[]>(key);
  if (cached !== undefined) return cached;
  const res = await client().get("/fixtures", { params: { league: leagueId, season, status: "FT-AET-PEN" } });
  checkApiErrors(res.data);
  const list = ((res.data?.response ?? []) as any[]).sort(
    (a, b) => new Date(b.fixture?.date).getTime() - new Date(a.fixture?.date).getTime()
  );
  setCached(key, list, TTL_REFEREE);
  return list;
}

async function averageFoulsCards(fixtureIds: number[]): Promise<{ fouls: number | null; cards: number | null; n: number }> {
  const rows = (await mapSequential(fixtureIds, (id) => fixtureFoulsCards(id))).filter(
    (r): r is { fouls: number | null; cards: number | null } => r !== null
  );
  const avg = (vals: (number | null)[]) => {
    const v = vals.filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  return { fouls: avg(rows.map((r) => r.fouls)), cards: avg(rows.map((r) => r.cards)), n: rows.length };
}

/**
 * Vplyv rozhodcu na fauly a karty: priemer z jeho posledných zápasov v lige
 * (aktuálna + minulá sezóna) oproti priemeru ligy, zmenšený podľa počtu zápasov
 * a ohraničený. Pri neznámom rozhodcovi alebo málo dátach vráti null.
 */
export async function getRefereeProfile(
  leagueId: number,
  season: number,
  referee: string | null | undefined
): Promise<RefereeProfile | null> {
  const rk = refereeKey(referee);
  if (!rk) return null;
  const cacheKey = `refProfile:${leagueId}:${season}:${rk}`;
  const cached = getCached<RefereeProfile | null>(cacheKey);
  if (cached !== undefined) return cached;
  try {
    let fixtures = await finishedLeagueFixtures(leagueId, season);
    let refFixtures = fixtures.filter((f: any) => refereeKey(f.fixture?.referee) === rk);
    if (refFixtures.length < REF_GAMES) {
      try {
        const [prevSeason] = await getPreviousSeasons(leagueId, season, 1);
        if (prevSeason) {
          const prev = await finishedLeagueFixtures(leagueId, prevSeason);
          refFixtures = [...refFixtures, ...prev.filter((f: any) => refereeKey(f.fixture?.referee) === rk)];
          if (fixtures.length < REF_BASELINE_GAMES) fixtures = [...fixtures, ...prev];
        }
      } catch {
        // minulá sezóna nie je – pokračujeme s tým, čo máme
      }
    }
    refFixtures = refFixtures.slice(0, REF_GAMES);
    if (refFixtures.length < REF_MIN_GAMES) {
      setCached(cacheKey, null, TTL_REFEREE);
      return null;
    }
    const baselineKey = `refBaseline:${leagueId}:${season}`;
    let baseline = getCached<{ fouls: number | null; cards: number | null; n: number }>(baselineKey);
    if (baseline === undefined) {
      baseline = await averageFoulsCards(fixtures.slice(0, REF_BASELINE_GAMES).map((f: any) => f.fixture.id));
      if (baseline.n >= 10) setCached(baselineKey, baseline, TTL_REFEREE);
    }
    const ref = await averageFoulsCards(refFixtures.map((f: any) => f.fixture.id));
    if (ref.n < REF_MIN_GAMES || baseline.n < 10) return null;
    const w = ref.n / (ref.n + REF_SHRINK);
    const factor = (refAvg: number | null, baseAvg: number | null, [lo, hi]: [number, number]) =>
      refAvg !== null && baseAvg !== null && baseAvg > 0 ? Math.min(hi, Math.max(lo, 1 + w * (refAvg / baseAvg - 1))) : 1;
    const profile: RefereeProfile = {
      name: String(referee).split(",")[0].trim(),
      games: ref.n,
      foulsFactor: factor(ref.fouls, baseline.fouls, REF_FOULS_RANGE),
      cardsFactor: factor(ref.cards, baseline.cards, REF_CARDS_RANGE),
      avgFouls: ref.fouls,
      avgCards: ref.cards,
    };
    setCached(cacheKey, profile, TTL_REFEREE);
    return profile;
  } catch {
    return null;
  }
}
