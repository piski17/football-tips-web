import axios, { AxiosError, AxiosInstance } from "axios";
import { Fixture, TeamStatistics, HeadToHeadSummary } from "./types";

const BASE_URL = "https://api.football-data.org/v4";

function client(): AxiosInstance {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) {
    throw new Error(
      "Na serveri chýba premenná prostredia FOOTBALL_DATA_API_KEY."
    );
  }
  return axios.create({
    baseURL: BASE_URL,
    headers: { "X-Auth-Token": key },
    timeout: 15000,
  });
}

/** Premení chybu z axiosu na čitateľnú správu (football-data.org posiela { message: "..." }). */
function friendlyError(err: unknown): Error {
  const axErr = err as AxiosError<any>;
  const apiMessage = axErr?.response?.data?.message;
  if (apiMessage) return new Error(apiMessage);
  if (axErr?.message) return new Error(axErr.message);
  return new Error(String(err));
}

function mapFixture(m: any, season: number): Fixture {
  return {
    fixtureId: m.id,
    date: m.utcDate,
    timestamp: Math.floor(new Date(m.utcDate).getTime() / 1000),
    venue: m.venue,
    league: {
      id: m.competition?.code ?? "",
      name: m.competition?.name ?? "",
      season,
      round: m.matchday ? `Kolo ${m.matchday}` : undefined,
    },
    homeTeam: {
      id: m.homeTeam.id,
      name: m.homeTeam.name,
      logo: m.homeTeam.crest,
    },
    awayTeam: {
      id: m.awayTeam.id,
      name: m.awayTeam.name,
      logo: m.awayTeam.crest,
    },
    status: m.status,
  };
}

/** Načíta nadchádzajúce zápasy danej súťaže, voliteľne obmedzené na rozsah dátumov (napr. aktuálny týždeň). */
export async function getFixturesByLeague(
  competitionCode: string,
  season: number,
  limitCount: number = 20,
  dateFrom?: string,
  dateTo?: string
): Promise<Fixture[]> {
  try {
    const params: Record<string, any> = { status: "SCHEDULED" };
    if (dateFrom && dateTo) {
      params.dateFrom = dateFrom;
      params.dateTo = dateTo;
    } else {
      params.season = season;
    }

    const res = await client().get(`/competitions/${competitionCode}/matches`, {
      params,
    });

    const matches = res.data?.matches ?? [];
    return matches
      .map((m: any) => mapFixture(m, season))
      .sort((a: Fixture, b: Fixture) => a.timestamp - b.timestamp)
      .slice(0, limitCount);
  } catch (err) {
    throw friendlyError(err);
  }
}

async function getStandingsTables(
  competitionCode: string,
  season: number
): Promise<{ total: any[]; home: any[]; away: any[] }> {
  const res = await client().get(`/competitions/${competitionCode}/standings`, {
    params: { season },
  });

  const standings = res.data?.standings ?? [];
  const findTable = (type: string) =>
    standings.find((s: any) => s.type === type)?.table ?? [];

  return {
    total: findTable("TOTAL"),
    home: findTable("HOME"),
    away: findTable("AWAY"),
  };
}

function safeAvg(goals: number, played: number): number {
  return played > 0 ? goals / played : 0;
}

/** Odvodí agregované štatistiky tímu (forma, priemer gólov doma/vonku) z tabuľky súťaže. */
export async function getTeamStatistics(
  competitionCode: string,
  season: number,
  teamId: number
): Promise<TeamStatistics> {
  try {
    const { total, home, away } = await getStandingsTables(competitionCode, season);

    const totalEntry = total.find((t: any) => t.team.id === teamId);
    const homeEntry = home.find((t: any) => t.team.id === teamId);
    const awayEntry = away.find((t: any) => t.team.id === teamId);

    if (!totalEntry) {
      throw new Error(
        `Tím s ID ${teamId} sa nenašiel v tabuľke súťaže ${competitionCode} (sezóna ${season}).`
      );
    }

    const form = (totalEntry.form ?? "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean)
      .join("");

    return {
      team: {
        id: totalEntry.team.id,
        name: totalEntry.team.name,
        logo: totalEntry.team.crest,
      },
      form,
      fixtures: {
        played: {
          home: homeEntry?.playedGames ?? 0,
          away: awayEntry?.playedGames ?? 0,
          total: totalEntry.playedGames,
        },
        wins: {
          home: homeEntry?.won ?? 0,
          away: awayEntry?.won ?? 0,
          total: totalEntry.won,
        },
        draws: {
          home: homeEntry?.draw ?? 0,
          away: awayEntry?.draw ?? 0,
          total: totalEntry.draw,
        },
        loses: {
          home: homeEntry?.lost ?? 0,
          away: awayEntry?.lost ?? 0,
          total: totalEntry.lost,
        },
      },
      goals: {
        for: {
          total: {
            home: homeEntry?.goalsFor ?? 0,
            away: awayEntry?.goalsFor ?? 0,
            total: totalEntry.goalsFor,
          },
          average: {
            home: safeAvg(homeEntry?.goalsFor ?? 0, homeEntry?.playedGames ?? 0),
            away: safeAvg(awayEntry?.goalsFor ?? 0, awayEntry?.playedGames ?? 0),
            total: safeAvg(totalEntry.goalsFor, totalEntry.playedGames),
          },
        },
        against: {
          total: {
            home: homeEntry?.goalsAgainst ?? 0,
            away: awayEntry?.goalsAgainst ?? 0,
            total: totalEntry.goalsAgainst,
          },
          average: {
            home: safeAvg(homeEntry?.goalsAgainst ?? 0, homeEntry?.playedGames ?? 0),
            away: safeAvg(awayEntry?.goalsAgainst ?? 0, awayEntry?.playedGames ?? 0),
            total: safeAvg(totalEntry.goalsAgainst, totalEntry.playedGames),
          },
        },
      },
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes("sa nenašiel v tabuľke")) throw err;
    throw friendlyError(err);
  }
}

/** Načíta súhrn vzájomných zápasov pre konkrétny zápas (podľa ID zápasu). */
export async function getHeadToHead(
  fixtureId: number,
  limit: number = 10
): Promise<HeadToHeadSummary> {
  try {
    const res = await client().get(`/matches/${fixtureId}/head2head`, {
      params: { limit },
    });

    const agg = res.data?.aggregates;
    if (!agg) {
      return { matchesConsidered: 0, homeWins: 0, draws: 0, awayWins: 0 };
    }

    return {
      matchesConsidered: agg.numberOfMatches ?? 0,
      homeWins: agg.homeTeam?.wins ?? 0,
      draws: agg.homeTeam?.draws ?? 0,
      awayWins: agg.awayTeam?.wins ?? 0,
    };
  } catch (err) {
    throw friendlyError(err);
  }
}
