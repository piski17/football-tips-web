import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import path from "path";
import {
  getFixturesByLeague,
  getTeamStatistics,
  getHeadToHead,
  getLeagueAverages,
  getHistoricalGoalPriors,
  getTeamExtendedStatsAverages,
  getTeamSquad,
  getPlayerSeasonStats,
  getTeamPlayersWithStats,
  getFixtureResult,
  getFixtureCornersAndCards,
  getFixtureGoalscorerIds,
  getFixtureLineupPlayerIds,
} from "./apiClient";
import { predictMatch, predictPlayerGoal, DEFAULT_WEIGHTS } from "./predictor";
import { LeaguePreset, SavedTip } from "./types";
import { saveTip, listTips, updateTip, deleteTip, clearAllTips } from "./tipsStore";
import { evaluateTip, computeTicketStatus } from "./tipEvaluator";
import { sendTipToTelegram, deleteTelegramMessages, isTelegramEnabled } from "./telegram";
import { listSubscribers, addSubscriber, updateSubscriber, deleteSubscriber } from "./subscribersStore";
import { Subscriber } from "./types";

// Globálna poistka - nečakaná chyba (napr. výpadok siete pri volaní na
// JSONBin.io alebo API-Football) nesmie zhodiť celý server. Bez tohto by
// aj jedna nezachytená chyba reštartovala celú appku na Renderi.
process.on("unhandledRejection", (reason) => {
  console.error("Nezachytená chyba (unhandledRejection):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Nezachytená výnimka (uncaughtException):", err);
});

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

  res.set("WWW-Authenticate", 'Basic realm="TipRadar"');
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

    // Prvá vlna - rovnaké volania, ktoré boli predtým otestované ako stabilné.
    const [homeStats, awayStats, h2h, leagueAvg, homePriors, awayPriors, homeExtStats, awayExtStats] =
      await Promise.all([
        getTeamStatistics(leagueId, season, fixture.homeTeam.id),
        getTeamStatistics(leagueId, season, fixture.awayTeam.id),
        getHeadToHead(fixture.homeTeam.id, fixture.awayTeam.id, 10),
        getLeagueAverages(leagueId, season),
        getHistoricalGoalPriors(leagueId, season, fixture.homeTeam.id),
        getHistoricalGoalPriors(leagueId, season, fixture.awayTeam.id),
        getTeamExtendedStatsAverages(leagueId, season, fixture.homeTeam.id),
        getTeamExtendedStatsAverages(leagueId, season, fixture.awayTeam.id),
      ]);

    // Druhá vlna - súpisky hráčov + potvrdená zostava (ak je k dispozícii),
    // spustené AŽ PO prvej vlne.
    const [homePlayers, awayPlayers, lineup] = await Promise.all([
      getTeamPlayersWithStats(fixture.homeTeam.id, season, leagueId),
      getTeamPlayersWithStats(fixture.awayTeam.id, season, leagueId),
      getFixtureLineupPlayerIds(fixture.fixtureId),
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
      homeExtStats.corners,
      awayExtStats.corners,
      homePlayers,
      awayPlayers,
      lineup.homeIds,
      lineup.awayIds,
      {
        homeShotsOnGoal: homeExtStats.shotsOnGoal,
        awayShotsOnGoal: awayExtStats.shotsOnGoal,
        homeFouls: homeExtStats.fouls,
        awayFouls: awayExtStats.fouls,
        homeOffsides: homeExtStats.offsides,
        awayOffsides: awayExtStats.offsides,
      }
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

// ---- Uložené tipy (spätné vyhodnotenie) ----

app.post("/api/tips", async (req, res) => {
  try {
    const tip: SavedTip = req.body;
    await saveTip(tip);
    res.json({ ok: true, telegramAvailable: isTelegramEnabled() });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.get("/api/tips", async (_req, res) => {
  try {
    res.json(await listTips());
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

// Odošle už uložený tip do Telegramu (len na výslovné vyžiadanie, s potvrdením v UI)
// a uloží si ID tej správy, aby sa dala neskôr zmazať spolu s tipom.
app.post("/api/tips/:id/telegram", async (req, res) => {
  try {
    const tips = await listTips();
    const tip = tips.find((t) => t.id === req.params.id);
    if (!tip) {
      res.status(404).json({ error: "Tip sa nenašiel." });
      return;
    }
    if (!isTelegramEnabled()) {
      res.status(400).json({ error: "Telegram nie je na serveri nastavený." });
      return;
    }
    const messageIds = await sendTipToTelegram(tip);
    if (messageIds) {
      await updateTip(tip.id, { telegramMessageIds: messageIds });
    }
    res.json({ ok: Boolean(messageIds) });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.delete("/api/tips/:id", async (req, res) => {
  try {
    const deleted = await deleteTip(req.params.id);
    if (deleted?.telegramMessageIds?.length) {
      await deleteTelegramMessages(deleted.telegramMessageIds);
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.delete("/api/tips", async (_req, res) => {
  try {
    const previous = await clearAllTips();
    for (const tip of previous) {
      if (tip.telegramMessageIds?.length) {
        await deleteTelegramMessages(tip.telegramMessageIds);
      }
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.post("/api/tips/check-results", async (_req, res) => {
  try {
    const tips = await listTips();
    const pending = tips.filter((t) => t.status === "pending");

    for (const tip of pending) {
      if (tip.legs && tip.legs.length > 0) {
        // Tiket - vyhodnotíme každú "nohu" zvlášť (každá môže patriť inému zápasu).
        let anyLegChanged = false;

        for (const leg of tip.legs) {
          if (leg.status !== "pending") continue;

          const result = await getFixtureResult(leg.fixtureId);
          if (!result || result.status !== "FT" || result.homeGoals == null || result.awayGoals == null) {
            continue;
          }

          let corners: number | null = null;
          let cards: number | null = null;
          let shotsOnGoal: number | null = null;
          let fouls: number | null = null;
          let offsides: number | null = null;
          const statsMarkets = ["Rohy", "Karty", "Strely na bránu", "Fauly", "Ofsajdy"];
          if (statsMarkets.includes(leg.market)) {
            const stats = await getFixtureCornersAndCards(leg.fixtureId);
            corners = stats.corners;
            cards = stats.cards;
            shotsOnGoal = stats.shotsOnGoal;
            fouls = stats.fouls;
            offsides = stats.offsides;
          }

          let scorerIds: number[] | null = null;
          if (leg.market === "Strelec gólov") {
            scorerIds = await getFixtureGoalscorerIds(leg.fixtureId);
          }

          leg.status = evaluateTip(
            leg,
            result.homeGoals,
            result.awayGoals,
            corners,
            cards,
            scorerIds,
            shotsOnGoal,
            fouls,
            offsides
          );
          leg.actualHomeGoals = result.homeGoals;
          leg.actualAwayGoals = result.awayGoals;
          anyLegChanged = true;
        }

        if (anyLegChanged) {
          const overallStatus = computeTicketStatus(tip.legs);
          await updateTip(tip.id, { status: overallStatus, legs: tip.legs });
        }
        continue;
      }

      const result = await getFixtureResult(tip.fixtureId);
      if (!result || result.status !== "FT" || result.homeGoals == null || result.awayGoals == null) {
        continue;
      }

      let corners: number | null = null;
      let cards: number | null = null;
      if (tip.market === "Rohy" || tip.market === "Karty") {
        const stats = await getFixtureCornersAndCards(tip.fixtureId);
        corners = stats.corners;
        cards = stats.cards;
      }

      let scorerIds: number[] | null = null;
      if (tip.market === "Strelec gólov") {
        scorerIds = await getFixtureGoalscorerIds(tip.fixtureId);
      }

      const status = evaluateTip(tip, result.homeGoals, result.awayGoals, corners, cards, scorerIds);
      await updateTip(tip.id, { status, actualHomeGoals: result.homeGoals, actualAwayGoals: result.awayGoals });
    }

    res.json(await listTips());
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

// ---- Predplatitelia (sledovanie platieb, keďže platba beží mimo appky - napr. bankovým prevodom) ----

app.get("/api/subscribers", async (_req, res) => {
  try {
    res.json(await listSubscribers());
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.post("/api/subscribers", async (req, res) => {
  try {
    const subscriber: Subscriber = req.body;
    await addSubscriber(subscriber);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.patch("/api/subscribers/:id", async (req, res) => {
  try {
    await updateSubscriber(req.params.id, req.body);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.delete("/api/subscribers/:id", async (req, res) => {
  try {
    await deleteSubscriber(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`TipRadar beží na porte ${PORT}`);
});
