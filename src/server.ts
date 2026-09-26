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
  getFixtureLineupPlayerIds,
} from "./apiClient";
import { predictMatch, predictPlayerGoal, DEFAULT_WEIGHTS } from "./predictor";
import { LeaguePreset, SavedTip } from "./types";
import { saveTip, listTips, updateTip, deleteTip, clearAllTips } from "./tipsStore";
import { computeTicketStatus, settleBet } from "./tipEvaluator";
import {
  sendTipToTelegram,
  deleteTelegramMessages,
  isTelegramEnabled,
  availableTelegramTargets,
  handleTelegramUpdate,
  setTelegramWebhook,
  notifyAdminExpiringSubscribers,
  sendCustomMessage,
  sendRenewalReminder,
  sendTipResultToTelegram,
} from "./telegram";
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
// Trhy, ktoré appka už neponúka - staré uložené tipy na ne sa nerátajú do
// úspešnosti, reportov ani pripomienok (v histórii ostávajú viditeľné).
const EXCLUDED_STATS_MARKETS = ["Dvojšanca", "Presný výsledok", "Čisté konto"];
function statsTips(tips: SavedTip[]): SavedTip[] {
  return tips.filter((t) => !EXCLUDED_STATS_MARKETS.includes(t.market));
}

const LEAGUE_PRESETS: LeaguePreset[] = [
  { id: 39, name: "Premier League", country: "Anglicko" },
  { id: 140, name: "La Liga", country: "Španielsko" },
  { id: 135, name: "Serie A", country: "Taliansko" },
  { id: 78, name: "Bundesliga", country: "Nemecko" },
  { id: 61, name: "Ligue 1", country: "Francúzsko" },
  { id: 2, name: "UEFA Champions League", country: "Európa" },
  { id: 5, name: "UEFA Nations League", country: "Európa" },
];

/**
 * Voliteľná ochrana heslom (HTTP Basic Auth). Ak nenastavíš APP_USER a
 * APP_PASSWORD, appka beží bez hesla.
 */
function basicAuth(req: Request, res: Response, next: NextFunction): void {
  // Telegram servery a verejná prezentačná stránka volajú tieto endpointy
  // priamo, bez znalosti hesla appky - musia zostať verejne prístupné.
  if (req.path === "/api/telegram/webhook" || req.path === "/api/public/track-record") {
    next();
    return;
  }

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
        homePossession: homeExtStats.possession,
        awayPossession: awayExtStats.possession,
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
    const target =
      req.body?.target === "premium" || req.body?.target === "vip" || req.body?.target === "both"
        ? req.body.target
        : "premium";
    const headerOverride = req.body?.asMatchOfWeek
      ? tip.legs && tip.legs.length > 0
        ? `🌟 <b>TIKET TÝŽDŇA</b>`
        : `🌟 <b>ZÁPAS TÝŽDŇA</b>`
      : undefined;
    const sent = await sendTipToTelegram(tip, target, headerOverride);
    if (sent.length > 0) {
      const existing = tip.telegramMessages ?? [];
      await updateTip(tip.id, { telegramMessages: [...existing, ...sent] });
    }
    res.json({ ok: sent.length > 0 });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.post("/api/tips/:id/telegram-result", async (req, res) => {
  try {
    const tips = await listTips();
    const tip = tips.find((t) => t.id === req.params.id);
    if (!tip) {
      res.status(404).json({ error: "Tip sa nenašiel." });
      return;
    }
    if (tip.status !== "won" && tip.status !== "lost") {
      res.status(400).json({ error: "Tento tip/tiket ešte nie je vyhodnotený." });
      return;
    }
    if (!isTelegramEnabled()) {
      res.status(400).json({ error: "Telegram nie je na serveri nastavený." });
      return;
    }
    const target =
      req.body?.target === "premium" || req.body?.target === "vip" || req.body?.target === "both"
        ? req.body.target
        : "both";
    const sent = await sendTipResultToTelegram(tip, target);
    if (sent.length > 0) {
      const existing = tip.telegramMessages ?? [];
      await updateTip(tip.id, { telegramMessages: [...existing, ...sent] });
    }
    res.json({ ok: sent.length > 0 });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

// Verejná (bez hesla) štatistika úspešnosti - používa ju prezentačná stránka,
// ktorá beží na inej doméne (claude.ai), preto povoľujeme CORS len pre tento
// jeden konkrétny endpoint. Neobsahuje žiadne citlivé dáta, len súhrnné čísla.
app.get("/api/public/track-record", async (_req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  try {
    const tips = await listTips();
    const resolved = statsTips(tips).filter((t) => t.status === "won" || t.status === "lost");
    const won = resolved.filter((t) => t.status === "won").length;
    const winRate = resolved.length > 0 ? Math.round((won / resolved.length) * 100) : null;
    res.json({ totalResolved: resolved.length, won, winRate });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.get("/api/telegram/targets", (_req, res) => {
  res.json({ targets: availableTelegramTargets() });
});

app.post("/api/telegram/no-tip-today", async (req, res) => {
  try {
    if (!isTelegramEnabled()) {
      res.status(400).json({ error: "Telegram nie je na serveri nastavený." });
      return;
    }
    const target =
      req.body?.target === "premium" || req.body?.target === "vip" || req.body?.target === "both"
        ? req.body.target
        : "both";
    const text =
      `📭 <b>Dnes bez tipu</b>\n\n` +
      `Model dnes nenašiel žiadnu stávku s dostatočnou hodnotou. Radšej žiadny tip, než zlý tip.\n\n` +
      `Uvidíme sa nabudúce! 👋`;
    const sent = await sendCustomMessage(text, target);
    res.json({ ok: sent.length > 0 });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.post("/api/telegram/weekly-report", async (req, res) => {
  try {
    if (!isTelegramEnabled()) {
      res.status(400).json({ error: "Telegram nie je na serveri nastavený." });
      return;
    }

    const tips = await listTips();
    const resolvedAll = statsTips(tips).filter((t) => t.status === "won" || t.status === "lost");

    // Týždeň = tipy na zápasy za posledných 7 dní (podľa dátumu zápasu).
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const inLastWeek = (t: SavedTip) => {
      const d = new Date(t.matchDate).getTime();
      return !isNaN(d) && d >= weekAgo;
    };
    const resolvedWeek = resolvedAll.filter(inLastWeek);
    const voidWeek = statsTips(tips).filter((t) => t.status === "void" && inLastWeek(t)).length;

    const wonWeek = resolvedWeek.filter((t) => t.status === "won").length;
    const lostWeek = resolvedWeek.length - wonWeek;
    const rateWeek = resolvedWeek.length > 0 ? ((wonWeek / resolvedWeek.length) * 100).toFixed(0) : null;

    const wonAll = resolvedAll.filter((t) => t.status === "won").length;
    const rateAll = resolvedAll.length > 0 ? ((wonAll / resolvedAll.length) * 100).toFixed(0) : null;

    // Najlepší trh týždňa (aspoň 3 vyhodnotené tipy, inak nemá porovnanie zmysel).
    const byMarket: Record<string, { won: number; total: number }> = {};
    for (const t of resolvedWeek) {
      if (!byMarket[t.market]) byMarket[t.market] = { won: 0, total: 0 };
      byMarket[t.market].total++;
      if (t.status === "won") byMarket[t.market].won++;
    }
    let bestMarket: string | null = null;
    let bestRate = -1;
    for (const [market, stats] of Object.entries(byMarket)) {
      if (stats.total < 3) continue;
      const rate = stats.won / stats.total;
      if (rate > bestRate) {
        bestRate = rate;
        bestMarket = market;
      }
    }

    const text =
      `📊 <b>Týždenný report</b> (posledných 7 dní)\n\n` +
      (resolvedWeek.length > 0
        ? `✅ Vyšlo: <b>${wonWeek}</b>   ❌ Nevyšlo: <b>${lostWeek}</b>\n` +
          `Úspešnosť týždňa: <b>${rateWeek}%</b>\n` +
          (voidWeek > 0 ? `↩ Vrátené: ${voidWeek}\n` : "") +
          (bestMarket ? `Najlepší trh: <b>${bestMarket}</b> (${(bestRate * 100).toFixed(0)}%)\n` : "")
        : `Tento týždeň zatiaľ nie sú vyhodnotené žiadne tipy.\n`) +
      (rateAll !== null ? `\nCelkovo od začiatku: <b>${rateAll}%</b> (${wonAll} z ${resolvedAll.length})\n` : "") +
      `\n<i>Poctivá história - vrátane prehratých tipov.</i>`;

    const target =
      req.body?.target === "premium" || req.body?.target === "vip" || req.body?.target === "both"
        ? req.body.target
        : "both";
    const sent = await sendCustomMessage(text, target);
    res.json({ ok: sent.length > 0 });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

// Sem posiela Telegram prichádzajúce správy od používateľov (nová správa, stlačenie tlačidla).
app.post("/api/telegram/webhook", async (req, res) => {
  try {
    await handleTelegramUpdate(req.body);
  } catch (err) {
    console.error("Spracovanie Telegram webhooku zlyhalo:", err);
  }
  res.sendStatus(200); // Telegram vyžaduje vždy 200, inak to bude skúšať doručiť znova
});

// Otvor túto adresu v prehliadači RAZ po nasadení appky, aby Telegram vedel, kam posielať správy.
app.get("/api/telegram/setup-webhook", async (req, res) => {
  try {
    // Render appke posiela požiadavky interne cez http, aj keď zvonka beží na
    // https - preto sa protokol nedá spoľahnúť na req.protocol a natvrdo
    // použijeme https (Telegram aj tak vyžaduje výhradne https adresu).
    const webhookUrl = `https://${req.get("host")}/api/telegram/webhook`;
    await setTelegramWebhook(webhookUrl);
    res.send(`Hotovo! Webhook nastavený na: ${webhookUrl}`);
  } catch (err: any) {
    res.status(502).send(`Nastavenie webhooku zlyhalo: ${err.message ?? String(err)}`);
  }
});

app.delete("/api/tips/:id", async (req, res) => {
  try {
    const deleted = await deleteTip(req.params.id);
    if (deleted?.telegramMessages?.length) {
      await deleteTelegramMessages(deleted.telegramMessages);
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
      if (tip.telegramMessages?.length) {
        await deleteTelegramMessages(tip.telegramMessages);
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
          const settled = await settleBet(leg);
          if (!settled) continue; // zápas sa ešte neskončil
          leg.status = settled.status;
          leg.actualHomeGoals = settled.homeGoals;
          leg.actualAwayGoals = settled.awayGoals;
          anyLegChanged = true;
        }
        if (anyLegChanged) {
          const overallStatus = computeTicketStatus(tip.legs);
          await updateTip(tip.id, { status: overallStatus, legs: tip.legs });
        }
        continue;
      }

      const settled = await settleBet(tip);
      if (!settled) continue; // zápas sa ešte neskončil
      await updateTip(tip.id, {
        status: settled.status,
        actualHomeGoals: settled.homeGoals,
        actualAwayGoals: settled.awayGoals,
      });
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

app.post("/api/subscribers/:id/test-reminder", async (req, res) => {
  try {
    const subs = await listSubscribers();
    const sub = subs.find((s) => s.id === req.params.id);
    if (!sub) {
      res.status(404).json({ error: "Predplatiteľ sa nenašiel." });
      return;
    }
    if (!sub.telegramChatId) {
      res.status(400).json({ error: "Tento predplatiteľ nemá vyplnené Telegram chat ID." });
      return;
    }
    const tips = await listTips();
    const resolved = statsTips(tips).filter((t) => t.status === "won" || t.status === "lost");
    const won = resolved.filter((t) => t.status === "won").length;
    const winRate = resolved.length > 0 ? Math.round((won / resolved.length) * 100) : null;
    const ok = await sendRenewalReminder(sub.telegramChatId, { totalResolved: resolved.length, winRate });
    res.json({ ok });
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

// ---- Pravidelná kontrola blížiacich sa/vypršaných platieb predplatiteľov ----

let lastExpiryCheckDate: string | null = null;

async function checkExpiringSubscribers(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (lastExpiryCheckDate === today) return; // dnes už bola kontrola spustená

  try {
    const subs = await listSubscribers();
    const withDaysLeft = subs.map((s) => ({
      ...s,
      daysLeft: Math.ceil((new Date(s.nextPaymentDue).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    }));

    const expiring = withDaysLeft.filter((s) => s.daysLeft <= 3);
    if (expiring.length > 0) {
      await notifyAdminExpiringSubscribers(expiring.map((s) => ({ name: s.name, tier: s.tier, daysLeft: s.daysLeft })));
    }

    // Osobná pripomienka predplatiteľom, ktorým vyprší platnosť presne o 3 dni
    // (a majú vyplnené svoje Telegram chat ID) - s prehľadom celkovej úspešnosti.
    const toRemind = withDaysLeft.filter((s) => s.daysLeft === 3 && s.telegramChatId);
    if (toRemind.length > 0) {
      const tips = await listTips();
      const resolved = statsTips(tips).filter((t) => t.status === "won" || t.status === "lost");
      const won = resolved.filter((t) => t.status === "won").length;
      const winRate = resolved.length > 0 ? Math.round((won / resolved.length) * 100) : null;
      for (const sub of toRemind) {
        await sendRenewalReminder(sub.telegramChatId!, { totalResolved: resolved.length, winRate });
      }
    }

    lastExpiryCheckDate = today;
  } catch (err) {
    console.error("Kontrola vypršania predplatných zlyhala:", err);
  }
}

setInterval(checkExpiringSubscribers, 6 * 60 * 60 * 1000); // kontrola každých 6 hodín
checkExpiringSubscribers(); // aj hneď po štarte appky

app.listen(PORT, () => {
  console.log(`TipRadar beží na porte ${PORT}`);
});
