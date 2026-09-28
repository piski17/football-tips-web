import { getDay, getAllDays, setDay } from "./dailyStore";
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
  getFixtureOdds,
  getRecentFormAnyCompetition,
  getHeadToHeadStats,
} from "./apiClient";
import { predictMatch, predictPlayerGoal, DEFAULT_WEIGHTS } from "./predictor";
import { LeaguePreset, SavedTip } from "./types";
import { saveTip, listTips, updateTip, deleteTip, clearAllTips } from "./tipsStore";
import { computeTicketStatus, settleBet, tipHasStartedMatch, MATCH_STARTED_MESSAGE, buildTipEdit } from "./tipEvaluator";
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
  sendTipResultToTelegram, buildDailyResultsText, translateTeamName, translateNamesInText } from "./telegram";
import { listSubscribers, addSubscriber, updateSubscriber, deleteSubscriber } from "./subscribersStore";
import { Subscriber } from "./types";

/** Slovenský tvar podľa počtu: plural(3, "tip", "tipy", "tipov") -> "3 tipy". */
/** Číslo so slovenskou desatinnou čiarkou: fmtNum(1.845, 2) -> "1,85". */
function fmtNum(n: number, digits: number): string {
  return Number(n).toFixed(digits).replace(".", ",");
}

/** Číslo so znamienkom: +1,5 / −0,8 (typografické mínus). */
function signed(n: number, digits: number): string {
  return (n > 0 ? "+" : n < 0 ? "−" : "") + fmtNum(Math.abs(n), digits);
}

function plural(n: number, one: string, few: string, many: string): string {
  return n + " " + (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
}

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
  if (
    req.path === "/api/telegram/webhook" ||
    req.path === "/api/public/track-record" ||
    req.path === "/prezentacia" ||
    req.path === "/prezentacia/"
  ) {
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

// Vlastná doména: tipradar.eu (a www) zobrazuje priamo prezentačnú stránku bez hesla,
// appka s heslom beží na app.tipradar.eu (a naďalej aj na adrese .onrender.com).
const LANDING_HOSTS = (process.env.LANDING_HOSTS || "tipradar.eu,www.tipradar.eu")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);
app.get("/", (req, res, next) => {
  if (LANDING_HOSTS.includes((req.hostname || "").toLowerCase())) {
    res.sendFile(path.join(__dirname, "..", "landing", "index.html"));
    return;
  }
  next();
});
// Verejná video prezentácia (tipradar.eu/video) – bez hesla, na každej adrese.
app.get(["/video", "/video/"], (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "landing", "video.html"));
});
// Ikonka stránky musí byť dostupná aj bez hesla (používa ju verejná prezentácia).
app.get(["/favicon.svg", "/favicon-32.png", "/favicon-256.png"], (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", req.path.slice(1)));
});

app.use(basicAuth);
app.use(express.json({ limit: "2mb" }));
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

/**
 * Očakávaná hodnota štatistiky tímu v zápase: priemer toho, čo tím sám robí
 * (napr. koľko rohov získava), a toho, čo súper dovoľuje (koľko rohov púšťa).
 * Ak údaj o súperovi chýba, použije sa len vlastný priemer tímu.
 */
function mixStat(own: number | null | undefined, opponentAllows: number | null | undefined): number | null {
  if (own == null) return opponentAllows ?? null;
  if (opponentAllows == null) return own;
  return (own + opponentAllows) / 2;
}

app.post("/api/analyze", async (req, res) => {
  try {
    const { fixture, leagueId, season } = req.body ?? {};
    if (!fixture || !leagueId || !season) {
      res.status(400).json({ error: "Chýbajú údaje zápasu, ligy alebo sezóny." });
      return;
    }

    // Prvá vlna - rovnaké volania, ktoré boli predtým otestované ako stabilné.
    let [homeStats, awayStats, h2h, leagueAvg, homePriors, awayPriors, homeExtStats, awayExtStats] =
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

    // Tím v tejto sezóne súťaže ešte nehral (typicky reprezentácie na začiatku
    // Ligy národov) -> forma z posledných zápasov vo všetkých súťažiach.
    if (!homeStats.form) {
      const form = await getRecentFormAnyCompetition(fixture.homeTeam.id);
      if (form) homeStats = { ...homeStats, form };
    }
    if (!awayStats.form) {
      const form = await getRecentFormAnyCompetition(fixture.awayTeam.id);
      if (form) awayStats = { ...awayStats, form };
    }

    // Druhá vlna - súpisky hráčov + potvrdená zostava (ak je k dispozícii),
    // spustené AŽ PO prvej vlne.
    const [homePlayers, awayPlayers, lineup, marketOdds] = await Promise.all([
      getTeamPlayersWithStats(fixture.homeTeam.id, season, leagueId),
      getTeamPlayersWithStats(fixture.awayTeam.id, season, leagueId),
      getFixtureLineupPlayerIds(fixture.fixtureId),
      getFixtureOdds(fixture.fixtureId),
    ]);

    // Štatistiky posledných vzájomných zápasov (rohy, karty…) – pri chybe sa jednoducho nepoužijú.
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
      mixStat(homeExtStats.corners, awayExtStats.cornersAgainst),
      mixStat(awayExtStats.corners, homeExtStats.cornersAgainst),
      homePlayers,
      awayPlayers,
      lineup.homeIds,
      lineup.awayIds,
      {
        homeShotsOnGoal: mixStat(homeExtStats.shotsOnGoal, awayExtStats.shotsOnGoalAgainst),
        awayShotsOnGoal: mixStat(awayExtStats.shotsOnGoal, homeExtStats.shotsOnGoalAgainst),
        homeFouls: mixStat(homeExtStats.fouls, awayExtStats.foulsAgainst),
        awayFouls: mixStat(awayExtStats.fouls, homeExtStats.foulsAgainst),
        homeOffsides: mixStat(homeExtStats.offsides, awayExtStats.offsidesAgainst),
        awayOffsides: mixStat(awayExtStats.offsides, homeExtStats.offsidesAgainst),
        homePossession: homeExtStats.possession,
        awayPossession: awayExtStats.possession,
      },
      marketOdds,
      h2hStats
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
    // Ručne doplnený odohraný tip (už s výsledkom) smie mať dátum v minulosti.
    const isManualResult = tip.manualEntry === true && ["won", "lost", "void"].includes(tip.status);
    if (!isManualResult && tipHasStartedMatch(tip)) {
      res.status(400).json({ error: MATCH_STARTED_MESSAGE });
      return;
    }
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
    const summarize = (list: SavedTip[]) => {
      const resolved = list.filter((t) => t.status === "won" || t.status === "lost");
      const won = resolved.filter((t) => t.status === "won").length;
      const withOdds = resolved.filter((t) => typeof t.odds === "number" && t.odds > 1);
      const profit = withOdds.reduce((sum, t) => sum + (t.status === "won" ? t.odds! - 1 : -1), 0);
      return {
        totalResolved: resolved.length,
        won,
        winRate: resolved.length > 0 ? Math.round((won / resolved.length) * 100) : null,
        withOdds: withOdds.length,
        profit: Math.round(profit * 100) / 100,
        roi: withOdds.length > 0 ? Math.round((profit / withOdds.length) * 1000) / 10 : null,
      };
    };
    const all = statsTips(tips);
    // Aktuálny mesiac (podľa slovenského času a dňa zápasu).
    const monthKey = dayKeySk(new Date()).slice(0, 7);
    const inMonth = all.filter((t) => (tipDayKey(t) ?? "").startsWith(monthKey));
    // Posledné VYHODNOTENÉ tipy (po skončení zápasu) - na ukážku, z čoho čísla vznikli.
    // Čakajúce tipy sa nikdy nezverejňujú, tie patria len platiacim klientom.
    const recent = all
      .filter((t) => t.status === "won" || t.status === "lost" || t.status === "void")
      .map((t) => ({ t, day: tipDayKey(t) ?? "" }))
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
      .slice(0, 50)
      .map(({ t, day }) => {
        const isTicket = Array.isArray(t.legs) && t.legs.length > 0;
        return {
          day,
          match: isTicket
            ? `Tiket (${plural(t.legs!.length, "zápas", "zápasy", "zápasov")})`
            : `${translateTeamName(t.homeTeam)} – ${translateTeamName(t.awayTeam)}`,
          bet: isTicket
            ? t.legs!.map((l) => `${translateTeamName(l.homeTeam)} – ${translateTeamName(l.awayTeam)}: ${translateNamesInText(l.selection, l.homeTeam, l.awayTeam)}`).join(" · ")
            : `${t.market}: ${translateNamesInText(t.selection, t.homeTeam, t.awayTeam)}`,
          odds: typeof t.odds === "number" && t.odds > 1 ? Math.round(t.odds * 100) / 100 : null,
          status: t.status,
        };
      });
    // Vývoj v čase: po dňoch (keď je dní s tipmi najviac 14), inak po týždňoch (od pondelka).
    const resolvedAll = all.filter((t) => t.status === "won" || t.status === "lost");
    const days = Array.from(new Set(resolvedAll.map((t) => tipDayKey(t) ?? "").filter(Boolean))).sort();
    const byWeek = days.length > 14;
    const weekStart = (day: string) => {
      const [y, m, d] = day.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      const dow = (dt.getUTCDay() + 6) % 7; // pondelok = 0
      dt.setUTCDate(dt.getUTCDate() - dow);
      return dt.toISOString().slice(0, 10);
    };
    const groups = new Map<string, SavedTip[]>();
    for (const t of resolvedAll) {
      const day = tipDayKey(t);
      if (!day) continue;
      const key = byWeek ? weekStart(day) : day;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
    const timeline = Array.from(groups.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-12)
      .map(([key, list]) => {
        const sm = summarize(list);
        return { key, won: sm.won, total: sm.totalResolved, rate: sm.winRate, profit: sm.profit, withOdds: sm.withOdds };
      });
    res.json({
      ...summarize(all),
      month: { key: monthKey, ...summarize(inMonth) },
      recent,
      timeline: { unit: byWeek ? "week" : "day", points: timeline },
    });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

// Verejná prezentačná stránka (bez hesla). Zobrazuje len texty a súhrnné čísla.
app.get(["/prezentacia", "/prezentacia/"], (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "landing", "index.html"));
});

// Diagnostika: aké kurzy vracia API-Football pre zápas (názvy stávok a volieb).
app.get("/api/debug/odds/:fixtureId", async (req, res) => {
  try {
    const fixtureId = parseInt(req.params.fixtureId, 10);
    const odds = await getFixtureOdds(fixtureId);
    res.json({ count: odds.length, bets: Array.from(new Set(odds.map((o) => o.bet))).sort(), odds });
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

// ---- Denné vyhodnotenie: všetky tipy a tikety dňa v jednej správe ----
/** Deň (YYYY-MM-DD) podľa slovenského času. */
function dayKeySk(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava" }).format(date);
}

/** Tip patrí k dňu výkopu; tiket k dňu posledného zápasu (vtedy sa dohrá). */
function tipDayKey(t: SavedTip): string | null {
  const dates = t.legs && t.legs.length > 0 ? t.legs.map((l) => l.matchDate) : [t.matchDate];
  const times = dates.map((d) => new Date(d).getTime()).filter((n) => !isNaN(n));
  if (times.length === 0) return null;
  return dayKeySk(new Date(Math.max(...times)));
}

app.post("/api/telegram/daily-results", async (req, res) => {
  try {
    if (!isTelegramEnabled()) {
      res.status(400).json({ error: "Telegram nie je na serveri nastavený." });
      return;
    }
    const day =
      typeof req.body?.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.day) ? req.body.day : dayKeySk(new Date());
    const force = req.body?.force === true;
    const target =
      req.body?.target === "premium" || req.body?.target === "vip" || req.body?.target === "both"
        ? req.body.target
        : "both";

    // Najprv vyhodnotíme, čo sa medzitým dohralo.
    await checkPendingResults();

    const tips = statsTips(await listTips()).filter((t) => tipDayKey(t) === day);
    if (tips.length === 0) {
      res.json({ ok: false, empty: true });
      return;
    }
    const pendingCount = tips.filter((t) => t.status === "pending").length;
    if (pendingCount > 0 && !force) {
      res.json({ ok: false, pendingCount });
      return;
    }

    const text = buildDailyResultsText(tips, day);
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

    // Zisk v jednotkách (1 jednotka na tip) - len z tipov, pri ktorých poznáme skutočný kurz.
    const withOdds = resolvedWeek.filter((t) => typeof t.odds === "number" && t.odds > 1);
    const profitWeek = withOdds.reduce((sum, t) => sum + (t.status === "won" ? t.odds! - 1 : -1), 0);
    const roiWeek = withOdds.length > 0 ? (profitWeek / withOdds.length) * 100 : null;

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
          `Úspešnosť týždňa: <b>${rateWeek} %</b>\n` +
          (voidWeek > 0 ? `↩ Vrátené: ${voidWeek}\n` : "") +
          (roiWeek !== null
            ? `Zisk: <b>${signed(profitWeek, 1)} j.</b> (ROI ${signed(roiWeek, 0)} %${
                withOdds.length < resolvedWeek.length ? `, z ${plural(withOdds.length, "tipu", "tipov", "tipov")} so známym kurzom` : ""
              })\n`
            : "") +
          (bestMarket ? `Najlepší trh: <b>${bestMarket}</b> (${(bestRate * 100).toFixed(0)} %)\n` : "")
        : `Tento týždeň zatiaľ nie sú vyhodnotené žiadne tipy.\n`) +
      (rateAll !== null ? `\nCelkovo od začiatku: <b>${rateAll} %</b> (${wonAll} z ${resolvedAll.length})\n` : "") +
      `\n<i>Poctivá história – vrátane prehratých tipov.</i>`;

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

// Ručná oprava tipu (výsledok, kurz, pri tikete výsledky zápasov).
app.post("/api/tips/:id/edit", async (req, res) => {
  try {
    const tip = (await listTips()).find((t) => t.id === req.params.id);
    if (!tip) {
      res.status(404).json({ error: "Tip sa nenašiel." });
      return;
    }
    await updateTip(tip.id, buildTipEdit(tip, req.body ?? {}));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});


// ---- Denný súhrn (/suhrn) – za heslom, dáta v tej istej databáze ako história tipov ----
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
function cleanTips(tips: unknown): unknown[] {
  if (!Array.isArray(tips)) return [];
  return tips.slice(0, 200).map((t: any) => ({
    time: String(t?.time ?? "").slice(0, 5),
    match: String(t?.match ?? "").slice(0, 120),
    tip: String(t?.tip ?? "").slice(0, 160),
    odds: String(t?.odds ?? "").slice(0, 12),
    result: ["won", "lost", "void"].includes(t?.result) ? t.result : "",
  }));
}

app.get(["/suhrn", "/suhrn/"], (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "suhrn.html"));
});

app.get("/api/daily", async (_req, res) => {
  try {
    res.json({ days: await getAllDays() });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.get("/api/daily/:day", async (req, res) => {
  if (!DAY_RE.test(req.params.day)) {
    res.status(400).json({ error: "Neplatný dátum." });
    return;
  }
  try {
    res.json((await getDay(req.params.day)) ?? { state: { tips: [] }, rev: 0 });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

// Uloženie dňa. Ak medzitým iné zariadenie uložilo novšiu verziu, vráti ju (409)
// a stránka ju prevezme – staršia verzia tak nikdy neprepíše novšiu.
app.put("/api/daily/:day", async (req, res) => {
  const day = req.params.day;
  if (!DAY_RE.test(day)) {
    res.status(400).json({ error: "Neplatný dátum." });
    return;
  }
  try {
    const current = await getDay(day);
    const baseRev = Number(req.body?.baseRev) || 0;
    if (current && current.rev > baseRev) {
      res.status(409).json(current);
      return;
    }
    const entry = { state: { tips: cleanTips(req.body?.state?.tips) }, rev: (current?.rev ?? 0) + 1 };
    await setDay(day, entry);
    res.json(entry);
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

// Jednorazový prenos zo starej verzie na claude.ai – nahrá len dni, ktoré tu ešte nie sú vyplnené.
app.post("/api/daily/import", async (req, res) => {
  try {
    const days = req.body?.days ?? {};
    const existing = await getAllDays();
    let imported = 0;
    for (const [day, v] of Object.entries<any>(days)) {
      if (!DAY_RE.test(day)) continue;
      const tips = cleanTips(v?.tips ?? v?.state?.tips);
      const filled = (list: any[]) => list.some((t) => t.match || t.tip || t.odds || t.result);
      if (!filled(tips)) continue;
      if (existing[day] && filled(existing[day].state.tips as any[])) continue;
      await setDay(day, { state: { tips }, rev: (existing[day]?.rev ?? 0) + 1 });
      imported++;
    }
    res.json({ imported });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

// Skrytie / vrátenie tipu v histórii (tip ostáva uložený, na prezentácii aj v štatistikách).
app.post("/api/tips/:id/archive", async (req, res) => {
  try {
    await updateTip(req.params.id, { archived: req.body?.archived !== false });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
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

/** Vyhodnotí všetky čakajúce tipy a tikety, ktorých zápasy sa už skončili. */
async function checkPendingResults(): Promise<void> {
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
}

app.post("/api/tips/check-results", async (_req, res) => {
  try {
    await checkPendingResults();
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
