import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import path from "path";
import {
  getFixturesByLeague,
  getTeamStatistics,
  getHeadToHead,
} from "./apiClient";
import { predictMatch, DEFAULT_WEIGHTS } from "./predictor";
import { LeaguePreset } from "./types";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Niekoľko bežných líg dostupných na bezplatnom pláne football-data.org.
const LEAGUE_PRESETS: LeaguePreset[] = [
  { id: "PL", name: "Premier League", country: "Anglicko" },
  { id: "PD", name: "La Liga", country: "Španielsko" },
  { id: "SA", name: "Serie A", country: "Taliansko" },
  { id: "BL1", name: "Bundesliga", country: "Nemecko" },
  { id: "FL1", name: "Ligue 1", country: "Francúzsko" },
  { id: "CL", name: "UEFA Champions League", country: "Európa" },
];

/**
 * Voliteľná ochrana heslom (HTTP Basic Auth), aby si appku nemusel nechať
 * úplne verejnú (free plán football-data.org má limit 10 požiadaviek/min,
 * ktorý by cudzí návštevníci mohli vyčerpať). Ak nenastavíš APP_USER a
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

/** Vráti dátumy pondelka a nedele aktuálneho (kalendárneho) týždňa vo formáte YYYY-MM-DD. */
function getCurrentWeekRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const day = now.getDay(); // 0 = nedeľa, 1 = pondelok, ..., 6 = sobota
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const toIso = (d: Date) => d.toISOString().slice(0, 10);
  return { dateFrom: toIso(monday), dateTo: toIso(sunday) };
}

app.get("/api/fixtures", async (req, res) => {
  try {
    const league = String(req.query.league ?? "");
    const season = parseInt(String(req.query.season ?? ""), 10);
    if (!league || Number.isNaN(season)) {
      res.status(400).json({ error: "Chýba parameter league alebo season." });
      return;
    }
    const { dateFrom, dateTo } = getCurrentWeekRange();
    const fixtures = await getFixturesByLeague(league, season, 30, dateFrom, dateTo);
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

    const [homeStats, awayStats, h2h] = await Promise.all([
      getTeamStatistics(leagueId, season, fixture.homeTeam.id),
      getTeamStatistics(leagueId, season, fixture.awayTeam.id),
      getHeadToHead(fixture.fixtureId, 10),
    ]);

    const result = predictMatch(fixture, homeStats, awayStats, h2h, DEFAULT_WEIGHTS);
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Futbal Tipy beží na porte ${PORT}`);
});
