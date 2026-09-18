import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import path from "path";
import {
  getFixturesByLeague,
  getTeamStatistics,
  getHeadToHead,
  getLeagueAverages,
  getHistoricalGoalPriors,
  getTeamCornersAverage,
  getTeamSquad,
  getPlayerSeasonStats,
} from "./apiClient";
import { predictMatch, predictPlayerGoal, DEFAULT_WEIGHTS } from "./predictor";
import { LeaguePreset } from "./types";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Top ligy dostupné s API-Football Pro plánom.
const LEAGUE_PRESETS: LeaguePreset[] = [
  { id: 39, name: "Premier League", country: "Anglicko" },
  { id: 140, name: "La Liga", country: "Španielsko" },
  { id: 135, name: "Serie A", country: "Taliansko" },
  { id: 78, name: "Bundesliga", country: "Nemecko" },
  { id: 61, name: "Ligue 1", country: "Francúzsko" },
  { id: 2, name: "UEFA Champions League", country: "Európa" },
];

/**
 * Voliteľná ochrana heslom (HTTP Basic Auth). Ak nenastavíš APP_USER a
 * APP_PASSWORD, appka beží bez hesla.
 */
function basicAuth(req: Request, res: Response, next: NextFunction): void {
  const user = process.env.APP_USER;
  const pass = process.env.APP_PASSWORD;
  if (!user || !pass) {
    next();
    return;
  }

  const header = req.headers.authorization ?? "";
  const token = header.split(" ")[1] ?? "";
  const decoded = Buffer.from(token, "base64").toString("utf-8");
  const [u, p] = decoded.split(":");

  if (u === user && p === pass) {
    next();
    return;
  }

  res.set("WWW-Authenticate", 'Basic realm="Futbal Tipy"');
  res.status(401).send("Autentifikácia zlyhala.");
}

app.use(basicAuth);
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/leagues", (_req, res) => {
  res.json(LEAGUE_PRESETS);
});

app.get("/api/fixtures", async (req, res) => {
  try {
    const league = parseInt(String(req.query.league ?? ""), 10);
    const season = parseInt(String(req.query.season ?? ""), 10);
    if (Number.isNaN(league) || Number.isNaN(season)) {
      res.status(400).json({ error: "Chýba parameter league alebo season." });
      return;
    }
    const date = String(req.query.date ?? "") || new Date().toISOString().slice(0, 10);
    const fixtures = await getFixturesByLeague(league, season, 30, date);
    res.json(fixtures);
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.post("/api/analyze", async (req, res) => {
  try {
    const { fixture, leagueId, season } = req.body ?? {};
    if (!fixture || !leagueId || !season) {
      res.status(400).json({ error: "Chýbajú údaje zápasu, ligy alebo sezóny." });
      return;
    }

    const [homeStats, awayStats, h2h, leagueAvg, homePriors, awayPriors, homeCorners, awayCorners] =
      await Promise.all([
        getTeamStatistics(leagueId, season, fixture.homeTeam.id),
        getTeamStatistics(leagueId, season, fixture.awayTeam.id),
        getHeadToHead(fixture.homeTeam.id, fixture.awayTeam.id, 10),
        getLeagueAverages(leagueId, season),
        getHistoricalGoalPriors(leagueId, season, fixture.homeTeam.id),
        getHistoricalGoalPriors(leagueId, season, fixture.awayTeam.id),
        getTeamCornersAverage(leagueId, season, fixture.homeTeam.id),
        getTeamCornersAverage(leagueId, season, fixture.awayTeam.id),
      ]);

    const result = predictMatch(
      fixture,
      homeStats,
      awayStats,
      h2h,
      leagueAvg,
      DEFAULT_WEIGHTS,
      homePriors,
      awayPriors,
      homeCorners,
      awayCorners
    );
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/squad", async (req, res) => {
  try {
    const teamId = parseInt(String(req.query.teamId ?? ""), 10);
    if (Number.isNaN(teamId)) {
      res.status(400).json({ error: "Chýba parameter teamId." });
      return;
    }
    const squad = await getTeamSquad(teamId);
    res.json(squad);
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.post("/api/player-goal", async (req, res) => {
  try {
    const { playerId, playerName, leagueId, season, teamExpectedGoalsThisMatch, teamSeasonGoalsPerGame } =
      req.body ?? {};
    if (!playerId || !leagueId || !season) {
      res.status(400).json({ error: "Chýbajú údaje hráča, ligy alebo sezóny." });
      return;
    }

    const stats = await getPlayerSeasonStats(playerId, season, leagueId);
    if (!stats) {
      res.status(404).json({
        error: `Pre hráča ${playerName ?? ""} sa nenašli sezónne štatistiky v tejto súťaži (možno málo minút/zápasov).`,
      });
      return;
    }

    const prediction = predictPlayerGoal(
      playerName ?? "",
      playerId,
      stats.goals,
      stats.appearances,
      teamExpectedGoalsThisMatch ?? 0,
      teamSeasonGoalsPerGame ?? 0
    );
    res.json(prediction);
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Futbal Tipy beží na porte ${PORT}`);
});
