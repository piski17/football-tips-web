import { SEATS_M1, SEATS_M3, SEATS_SEASON } from "./seatLimits";
import { MIN_ODDS, MAX_PROBABILITY, MIN_PROBABILITY, MIN_EXPECTED_VALUE, SUSPICIOUS_EXPECTED_VALUE, findOdds, marketProbabilityDetail, STRONG_TIP_MIN_PROBABILITY, WATCH_BELOW_PROBABILITY } from "./oddsMatcher";
import { listLeads, deleteLead, recordLead } from "./leadsStore";
import { getMeta, setMeta } from "./metaStore";
import * as crypto from "crypto";
import { recordShadow, listShadow, updateShadow, shadowEntriesFrom, shadowReasonCode, ShadowEntry } from "./shadowStore";
import { recordBlend, listBlend, updateBlend, blendEntryFrom, blendSummary, newModelSummary } from "./blendStore";
import { recordLegs, listLegs, updateLeg, legCandidatesFrom, legQualifies, buildTickets, TicketLegCandidate, TICKET_RULES } from "./ticketWatchStore";
import { startBacktest, getBacktest } from "./backtest";
import { applyCupGoals } from "./cupAdjust";
import { getDay, getAllDays, setDay } from "./dailyStore";
import { saveSlip, deleteSlip, listSlipIds, getSlipImage, MAX_SLIP_CHARS } from "./slipStore";
import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import path from "path";
import {
  getFixturesByLeague,
  getFixtureReferee,
  getRefereeProfile,
  getTeamStatistics,
  getHeadToHead,
  getLeagueAverages,
  getHistoricalGoalPriors,
  getTeamExtendedStatsAverages,
  getTeamSquad,
  getPlayerSeasonStats,
  getTeamPlayersWithStats,
  getFixtureLineupPlayerIds,
  getFixtureById,
  getFixtureLineupsDebug,
  getFixtureMissingPlayers,
  getFixtureOdds,
  getRecentFormAnyCompetition,
  getSeasonGamesAnyCompetition,
  getHeadToHeadStats,
  getRestInfo,
} from "./apiClient";
import { predictMatch, predictPlayerGoal, DEFAULT_WEIGHTS, MODEL_VERSION, MarketAdjustments, marketCategory } from "./predictor";
import { newModelInputs } from "./newModel";
import { computeMarketHealth, marketChangesText, clvOf, CLV_TIE } from "./marketHealth";
import { LeaguePreset, SavedTip } from "./types";
import { saveTip, listTips, updateTip, deleteTip, clearAllTips, splitMarketText } from "./tipsStore";
import { computeTicketStatus, settleBet, settleFixtureBets, tipHasStartedMatch, MATCH_STARTED_MESSAGE, buildTipEdit } from "./tipEvaluator";
import {
  sendTipToTelegram,
  deleteTelegramMessages,
  isTelegramEnabled,
  availableTelegramTargets,
  TelegramTarget,
  isFreeChat,
  handleTelegramUpdate,
  setTelegramWebhook,
  notifyAdminExpiringSubscribers,
  sendCustomMessage,
  sendRenewalReminder,
  sendTipResultToTelegram, notifyAdmin, buildDailyResultsText, translateTeamName, translateNamesInText, refreshTelegramWebhookSecret, redeemPayment, sendSalesOpenToWaitlist, confirmBankPaymentAndInvite, sendMemberMessage } from "./telegram";
import { paymentsEnabled, isTerm, isSellableTerm, PAY_TERMS, BANK, bankNote, createBankPayment, getPayment, listPayments, cancelPayment, deletePayment, Payment, termLabel, tierName, addActiveMonths, SUMMER_PAUSE } from "./payments";
import { payBySquareString } from "./payBySquare";
import QRCode from "qrcode";
import { sendAdminEmail } from "./mailer";
import { listSubscribers, addSubscriber, updateSubscriber, deleteSubscriber } from "./subscribersStore";
import { recordHit, readStats, sourceFrom } from "./statsStore";
import { Subscriber } from "./types";
import { memberPeriods, memberTerm, newPeriodUpdates, currentPeriodStart } from "./guarantee";

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
  // Tipy „Len sledovať“ (napr. Liga majstrov na skúšku) sa vyhodnocujú, ale nerátajú sa
  // do štatistík, na web ani do vyhodnotení pre členov.
  return tips.filter((t) => !EXCLUDED_STATS_MARKETS.includes(t.market) && !t.watchOnly);
}

/** Súhrn tipov pri rovnakom vklade 1 jednotka na tip (zisk a ROI len z tipov s kurzom). */
function summarizeTips(list: SavedTip[]) {
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
}

/**
 * Výsledky po mesiacoch (podľa dňa zápasu v slovenskom čase), najstarší prvý. Rovnaké čísla ukazuje
 * web (stránka Výsledky) aj garancia „mesiac v strate = mesiac zadarmo“.
 */
function monthlyResults(tips: SavedTip[]) {
  const resolvedAll = statsTips(tips).filter((t) => t.status === "won" || t.status === "lost");
  const monthGroups = new Map<string, SavedTip[]>();
  for (const t of resolvedAll) {
    const mk = (tipDayKey(t) ?? "").slice(0, 7);
    if (!mk) continue;
    if (!monthGroups.has(mk)) monthGroups.set(mk, []);
    monthGroups.get(mk)!.push(t);
  }
  return Array.from(monthGroups.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, list]) => ({ key, ...summarizeTips(list) }));
}

/** Pohárové súťaže: tímy v nich hrajú málo zápasov, ale v domácej lige majú dosť dát. */
const CUP_LEAGUE_IDS = [2, 3]; // Liga majstrov, Európska liga

const LEAGUE_PRESETS: LeaguePreset[] = [
  { id: 39, name: "Premier League", country: "Anglicko" },
  { id: 140, name: "La Liga", country: "Španielsko" },
  { id: 135, name: "Serie A", country: "Taliansko" },
  { id: 78, name: "Bundesliga", country: "Nemecko" },
  { id: 61, name: "Ligue 1", country: "Francúzsko" },
  { id: 2, name: "UEFA Champions League", country: "Európa" },
  // 21. 10. 2026 (Michalovo rozhodnutie): viac zápasov aj cez týždeň.
  { id: 3, name: "UEFA Europa League", country: "Európa" },
  { id: 88, name: "Eredivisie", country: "Holandsko" },
  { id: 94, name: "Primeira Liga", country: "Portugalsko" },
  // 25. 10. 2026 (Michalovo rozhodnutie): viac líg.
  { id: 144, name: "Jupiler Pro League", country: "Belgicko" },
  { id: 203, name: "Süper Lig", country: "Turecko" },
  { id: 106, name: "Ekstraklasa", country: "Poľsko" },
  // Liga národov (id 5) odstránená 6. 10. 2026 - reprezentácie majú málo zápasov, tipy nespoľahlivé.
];

/**
 * Voliteľná ochrana heslom (HTTP Basic Auth). Ak nenastavíš APP_USER a
 * APP_PASSWORD, appka beží bez hesla.
 */
/** Porovnanie reťazcov v konštantnom čase (heslo sa nedá uhádnuť podľa rýchlosti odpovede). */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function basicAuth(req: Request, res: Response, next: NextFunction): void {
  // Telegram servery a verejná prezentačná stránka volajú tieto endpointy
  // priamo, bez znalosti hesla appky - musia zostať verejne prístupné.
  if (
    req.path === "/api/telegram/webhook" ||
    req.path === "/api/public/track-record" ||
    req.path === "/api/public/vip-seats" ||
    req.path === "/api/public/waitlist" ||
    req.path === "/api/public/hit" ||
    req.path.startsWith("/api/public/slip/") ||
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
  // Heslo môže obsahovať dvojbodku – delíme len podľa prvej.
  const sep = decoded.indexOf(":");
  const u = sep >= 0 ? decoded.slice(0, sep) : decoded;
  const p = sep >= 0 ? decoded.slice(sep + 1) : "";

  if (safeEqual(u, user) && safeEqual(p, pass)) {
    next();
    return;
  }

  res.set("WWW-Authenticate", 'Basic realm="TipRadar"');
  res.status(401).send("Autentifikácia zlyhala.");
}

// Vlastná doména: tipradar.eu (a www) zobrazuje priamo prezentačnú stránku bez hesla,
// appka s heslom beží na app.tipradar.eu (adresa .onrender.com na ňu presmeruje).
const LANDING_HOSTS = (process.env.LANDING_HOSTS || "tipradar.eu,www.tipradar.eu")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

// Stará adresa *.onrender.com: návštevníkov stránok trvalo (301) presmerujeme na
// vlastnú doménu – úvod a podstránky na tipradar.eu, všetko ostatné na app.tipradar.eu.
// API (vrátane Telegram webhooku a synchronizácie Mac appky), /health a POST
// požiadavky necháme bez zmeny, aby nič neprestalo fungovať.
app.use((req, res, next) => {
  const host = (req.hostname || "").toLowerCase();
  const isPage = (req.method === "GET" || req.method === "HEAD") && !req.path.startsWith("/api/") && req.path !== "/health";
  if (!host.endsWith(".onrender.com") || !isPage) {
    next();
    return;
  }
  const toLanding = ["/", "/video", "/video/", "/kurz", "/kurz/", "/metoda", "/metoda/", "/vysledky", "/vysledky/", "/otazky", "/otazky/", "/formular", "/formular/", "/o-mne", "/o-mne/", "/clenstvo", "/clenstvo/", "/zaplatit", "/platba"].includes(req.path);
  res.redirect(301, (toLanding ? "https://tipradar.eu" : "https://app.tipradar.eu") + req.originalUrl);
});

app.get("/", (req, res, next) => {
  if (LANDING_HOSTS.includes((req.hostname || "").toLowerCase())) {
    res.set("Cache-Control", "no-cache"); res.sendFile(path.join(__dirname, "..", "landing", "index.html"));
    return;
  }
  next();
});
// Video prezentácia bola zrušená – staré odkazy na /video presmeruje na úvod.
app.get(["/video", "/video/"], (_req, res) => {
  res.redirect(301, "/");
});
// Podstránky prezentácie (tipradar.eu/metoda, /vysledky, /otazky, /formular) – bez hesla.
// Je to ten istý súbor ako úvod, podľa adresy sa v ňom zobrazí iná časť.
// tipradar.eu/clenstvo = samostatná stránka Členstvo (aj odkazy z Instagramu a Telegramu).
app.get(["/metoda", "/metoda/", "/vysledky", "/vysledky/", "/otazky", "/otazky/", "/formular", "/formular/", "/o-mne", "/o-mne/", "/clenstvo", "/clenstvo/"], (_req, res) => {
  res.set("Cache-Control", "no-cache"); res.sendFile(path.join(__dirname, "..", "landing", "index.html"));
});
// ---- Platba za členstvo (prevod cez QR kód) – bez hesla ----
/** Koľko miest na 6 mesiacov je obsadených (aktívne členstvo „group", 7 dní tolerancia po splatnosti). */
async function seasonSeats(): Promise<{ taken: number; total: number; activeVip: Subscriber[] }> {
  const total = SEATS_SEASON;
  const graceMs = 7 * 24 * 60 * 60 * 1000;
  const activeVip = (await listSubscribers()).filter(
    (s) => s.tier === "group" && new Date(s.nextPaymentDue).getTime() + graceMs >= Date.now()
  );
  return { taken: activeVip.length, total, activeVip };
}
/** Aktívni členovia na 1 alebo 3 mesiace (7 dní tolerancia po splatnosti). Staršie záznamy bez dĺžky = 1 mesiac. */
async function shortSeats(length: "m1" | "m3"): Promise<{ taken: number; total: number | null; active: Subscriber[] }> {
  const graceMs = 7 * 24 * 60 * 60 * 1000;
  const active = (await listSubscribers()).filter(
    (s) => s.tier !== "group" && (s.length ?? "m1") === length && new Date(s.nextPaymentDue).getTime() + graceMs >= Date.now()
  );
  return { taken: active.length, total: length === "m3" ? SEATS_M3 : SEATS_M1, active };
}
/** total a left sú null, ak dĺžka členstva nemá obmedzený počet miest. */
type TermSeats = Record<"m1" | "m3" | "season", { occupied: number; total: number | null; left: number | null }>;
/**
 * Obsadené miesta pre každú dĺžku členstva (rovnako ako na webe): pred spustením predaja
 * sa rátajú členovia aj záujemcovia v poradovníku, počas predaja len aktívni členovia.
 */
async function termSeats(): Promise<TermSeats> {
  const [season, m3, m1] = await Promise.all([seasonSeats(), shortSeats("m3"), shortSeats("m1")]);
  let waitSeason = 0, waitM3 = 0, waitM1 = 0;
  if (process.env.SALES_OPEN !== "true") {
    const members = new Set([...season.activeVip, ...m3.active, ...m1.active].map((s) => String(s.telegramChatId || "")).filter(Boolean));
    const leads = (await listLeads().catch(() => [])).filter((l) => !members.has(String(l.chatId)));
    waitSeason = leads.filter((l) => ["vip", "vip_waitlist", "sampion", "sampion_waitlist"].includes(l.plan)).length;
    waitM3 = leads.filter((l) => l.plan === "seria").length;
    waitM1 = leads.filter((l) => l.plan === "start").length;
  }
  const row = (taken: number, total: number | null) => {
    if (total == null) return { occupied: taken, total: null, left: null };
    const occupied = Math.min(taken, total);
    return { occupied, total, left: total - occupied };
  };
  return { m1: row(m1.taken + waitM1, m1.total), m3: row(m3.taken + waitM3, m3.total), season: row(season.taken + waitSeason, season.total) };
}
/** Riadok s odpočtom miest pre tipy v bezplatnom kanáli. */
async function freeSeatsLine(): Promise<string | undefined> {
  try {
    const t = await termSeats();
    const s = t.m3;
    // Od 24. 10. 2026 je Platinum (3 mesiace) bez obmedzenia miest – riadok sa zobrazí, len ak by sa obmedzenie zaplo.
    if (s.total == null || s.left == null) return undefined;
    return s.left > 0
      ? `🔥 Platinum na 3 mesiace: voľných <b>${s.left} z ${s.total}</b> miest`
      : `🔥 Platinum na 3 mesiace: všetkých ${s.total} miest je obsadených`;
  } catch {
    return undefined;
  }
}
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || "TipRadarAiBot";

// tipradar.eu/zaplatit?term=m1|m3 (&c=Telegram ID z bota; starý odkaz term=season vedie na 3 mesiace) → založí platbu a presmeruje na stránku s QR kódom.
app.get("/zaplatit", async (req, res) => {
  const rawTerm = String(req.query.term ?? "");
  const term = rawTerm === "season" ? "m3" : rawTerm;
  const c = String(req.query.c ?? "");
  if (!paymentsEnabled() || !isSellableTerm(term)) {
    res.redirect(302, "/clenstvo");
    return;
  }
  try {
    {
      const { taken, total } = await shortSeats(term);
      if (total != null && taken >= total) {
        res.redirect(302, `https://t.me/${BOT_USERNAME}?start=${term === "m3" ? "seria" : "start"}_waitlist`);
        return;
      }
    }
    const chatId = /^\d{3,20}$/.test(c) ? c : undefined;
    const p = await createBankPayment(term, chatId);
    res.redirect(303, `/platba?t=${p.token}`);
  } catch (err: any) {
    console.error("Platbu sa nepodarilo pripraviť:", err?.response?.data ?? err?.message ?? err);
    res.status(502).send(paymentPage("Platba sa teraz nedá spustiť", "Skúste to, prosím, o chvíľu znova. Ak to nepôjde, napíšte mi na Telegram a vyriešime to.", `https://t.me/${BOT_USERNAME}`, "Napísať na Telegram"));
  }
});

// Platba prevodom: QR kód PAY by square + údaje na skopírovanie + tlačidlo „Zaplatil som" (do Telegramu).
app.get("/platba", async (req, res) => {
  const token = String(req.query.t ?? "");
  try {
    const p = await getPayment(token);
    if (!p || p.method !== "bank") {
      res.status(404).send(paymentPage("Platbu sme nenašli", "Vyberte si, prosím, členstvo znova.", "/clenstvo", "Späť na členstvo"));
      return;
    }
    if (p.status === "cancelled") {
      res.send(paymentPage("Platba bola zrušená", "Ak chcete členstvo, vyberte si ho, prosím, znova.", "/clenstvo", "Späť na členstvo"));
      return;
    }
    const tg = `https://t.me/${BOT_USERNAME}?start=paid_${p.token}`;
    if (p.status !== "pending") {
      res.send(paymentPage("Platba prijatá, ďakujem!", `Členstvo TipRadar ${termLabel(p.term)} je zaplatené. Pozvánku do súkromného kanála nájdete v Telegrame.`, tg, "Otvoriť Telegram"));
      return;
    }
    if (!BANK.iban || !BANK.name) {
      res.status(503).send(paymentPage("Platba sa teraz nedá spustiť", "Napíšte mi, prosím, na Telegram a vyriešime to.", `https://t.me/${BOT_USERNAME}`, "Napísať na Telegram"));
      return;
    }
    const price = PAY_TERMS[p.term].price;
    const qrText = payBySquareString({ iban: BANK.iban, bic: BANK.bic, amount: price, variableSymbol: p.vs || "", note: bankNote(p.term), beneficiaryName: BANK.name });
    const svg = await QRCode.toString(qrText, { type: "svg", errorCorrectionLevel: "M", margin: 0, color: { dark: "#0C0B0A", light: "#FFFFFF" } });
    const png = await QRCode.toDataURL(qrText, { errorCorrectionLevel: "M", margin: 3, width: 720, color: { dark: "#0C0B0A", light: "#FFFFFF" } });
    res.set("Cache-Control", "no-store");
    res.send(bankPage(p, price, svg, png, tg));
  } catch (err: any) {
    console.error("Stránka platby zlyhala:", err?.message ?? err);
    res.status(502).send(paymentPage("Platba sa teraz nedá zobraziť", "Skúste stránku obnoviť. Ak to nepôjde, napíšte mi na Telegram.", `https://t.me/${BOT_USERNAME}`, "Napísať na Telegram"));
  }
});

function bankPage(p: Payment, price: number, svg: string, png: string, tg: string): string {
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const ibanNice = BANK.iban.replace(/(.{4})/g, "$1 ").trim();
  const term = termLabel(p.term);
  const row = (label: string, value: string, copy: string) =>
    `<div class="row"><span class="k">${esc(label)}</span><span class="v">${esc(value)}</span><button type="button" class="cp" data-copy="${esc(copy)}">Kopírovať</button></div>`;
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Platba prevodom · TipRadar</title>
<link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@700;800&display=swap">
<style>html{font-size-adjust:.5}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:repeating-linear-gradient(90deg,rgba(217,192,138,.035) 0 1px,transparent 1px 64px),#120E0A;color:#F4EEE2;font-family:'Barlow',Arial,sans-serif;font-weight:500;padding:32px 16px}
.box{max-width:560px;margin:0 auto;border:1px solid rgba(217,192,138,.3);border-radius:20px;background:#1D1711;padding:40px 32px}
.lab{font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:#D9C08A;font-weight:600;text-align:center}
h1{font-family:'Barlow Condensed',Arial,sans-serif;font-weight:800;font-size:40px;letter-spacing:.01em;text-transform:uppercase;margin:12px 0 6px;line-height:1.15;text-align:center}
.price{font-family:'Barlow Condensed',Arial,sans-serif;font-weight:800;font-size:56px;text-align:center;margin:4px 0 22px;color:#D9C08A}
.step{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#D9C08A;font-weight:700;margin:26px 0 12px}
p{color:#BFB6A6;font-size:15px;line-height:1.6;margin:0 0 14px}
.qr{background:#fff;border-radius:14px;padding:18px;width:260px;max-width:100%;margin:0 auto 12px;border:1px solid #D9C08A}.qr svg{display:block;width:100%;height:auto}
.center{text-align:center}
.save{display:inline-block;color:#D9C08A;font-size:14px;font-weight:600;text-decoration:underline;text-underline-offset:3px}
.rows{border-top:1px solid rgba(217,192,138,.2)}
.row{display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid rgba(217,192,138,.2)}
.k{flex:0 0 118px;color:#8C8476;font-size:13px}.v{flex:1;font-weight:600;font-size:15px;word-break:break-word}
.cp{flex:0 0 auto;border-radius:999px;background:transparent;border:1px solid rgba(217,192,138,.5);color:#D9C08A;font:700 12px 'Barlow',Arial,sans-serif;padding:7px 10px;cursor:pointer}
.cp.ok{border-color:#7FBF9A;color:#7FBF9A}
a.btn{display:block;text-align:center;border-radius:999px;background:#D9C08A;color:#17130A;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:.12em;text-transform:uppercase;padding:17px 20px;margin-top:6px}
.small{font-size:13px;color:#8C8476}
a.back{display:block;text-align:center;margin-top:22px;color:#8C8476;font-size:14px}
.gar{margin:18px 0 0;padding:14px 16px;border-radius:14px;border:1px solid rgba(217,192,138,.45);background:rgba(217,192,138,.08);color:#F4EEE2;font-size:14px;text-align:center}.gar b{display:block;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#D9C08A;margin-bottom:4px}
@media(max-width:480px){.box{padding:30px 18px}.k{flex-basis:96px}h1{font-size:28px}}</style></head>
<body><div class="box">
<div class="lab">TipRadar ${esc(term)}</div>
<h1>Platba prevodom</h1>
<div class="price">${price} €</div>
<div class="step">1. Zaplaťte cez QR kód</div>
<p>Otvorte appku svojej banky, zvoľte platbu cez QR kód a naskenujte ho. Všetky údaje sa vyplnia samy.</p>
<div class="qr">${svg}</div>
<p class="center small">Platíte z tohto mobilu? <a class="save" href="${png}" download="tipradar-platba-${esc(p.vs || "")}.png">Uložte si QR kód</a> a v appke banky ho načítajte z galérie alebo údaje skopírujte:</p>
<div class="rows">
${row("Suma", `${price},00 €`, `${price},00`)}
${row("IBAN", ibanNice, BANK.iban)}
${row("Variabilný symbol", p.vs || "", p.vs || "")}
${row("Príjemca", BANK.name, BANK.name)}
${row("Správa", bankNote(p.term), bankNote(p.term))}
</div>
<p class="small" style="margin-top:12px">Variabilný symbol je len váš, podľa neho platbu spoznám.</p>
<div class="step">2. Dajte mi vedieť</div>
<p>Po zaplatení kliknite nižšie. Otvorí sa Telegram a hneď ako platba príde na účet, pošlem vám tam osobnú pozvánku do kanála.</p>
<a class="btn" href="${esc(tg)}">Zaplatil som · pokračovať v Telegrame</a>
<p class="small" style="margin-top:14px">Okamžitá platba príde do pár minút, bežný prevod zvyčajne do jedného pracovného dňa. Členstvo sa samo nepredlžuje.</p>
<p class="gar"><b>Garancia</b>Ak vaše členstvo (Gold alebo Platinum) skončí v strate, ďalší mesiac máte zadarmo.</p>
<a class="back" href="/clenstvo">Späť na členstvo</a>
</div>
<script>document.querySelectorAll(".cp").forEach(function(b){b.addEventListener("click",function(){var t=b.getAttribute("data-copy");var done=function(){b.textContent="Skopírované";b.classList.add("ok");setTimeout(function(){b.textContent="Kopírovať";b.classList.remove("ok")},1800)};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(done,function(){prompt("Skopírujte:",t)})}else{prompt("Skopírujte:",t)}})});</script>
</body></html>`;
}

function paymentPage(title: string, text: string, href: string, button: string, refresh = false): string {
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">${refresh ? '<meta http-equiv="refresh" content="4">' : ""}<title>${esc(title)} · TipRadar</title>
<link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@700;800&display=swap">
<style>html{font-size-adjust:.5}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:repeating-linear-gradient(90deg,rgba(217,192,138,.035) 0 1px,transparent 1px 64px),#120E0A;color:#F4EEE2;font-family:'Barlow',Arial,sans-serif;font-weight:500;padding:24px;box-sizing:border-box}
.box{max-width:520px;width:100%;border:1px solid rgba(217,192,138,.3);border-radius:20px;padding:48px 36px;text-align:center;background:#1D1711}
.lab{font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:#D9C08A;font-weight:600}
h1{font-family:'Barlow Condensed',Arial,sans-serif;font-weight:800;font-size:42px;text-transform:uppercase;letter-spacing:.01em;margin:14px 0 14px;line-height:1.15}
p{color:#BFB6A6;font-size:16px;line-height:1.6;margin:0 0 28px}
a.btn{display:inline-block;border-radius:999px;background:#D9C08A;color:#17130A;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:.14em;text-transform:uppercase;padding:16px 28px}
a.back{display:block;margin-top:22px;color:#8C8476;font-size:14px}</style></head>
<body><div class="box"><div class="lab">Členstvo TipRadar</div><h1>${esc(title)}</h1><p>${esc(text)}</p>
${href ? `<a class="btn" href="${esc(href)}">${esc(button)}</a>` : ""}<a class="back" href="/">Späť na tipradar.eu</a></div></body></html>`;
}

// Kurz Škola stávkovania (tipradar.eu/kurz) – samostatná stránka, bez hesla.
app.get(["/kurz", "/kurz/"], (_req, res) => {
  res.set("Cache-Control", "no-cache"); res.sendFile(path.join(__dirname, "..", "landing", "kurz.html"));
});
// Ikonka stránky a obrázok náhľadu pri zdieľaní musia byť dostupné aj bez hesla.
app.get(["/favicon.svg", "/favicon-32.png", "/favicon-256.png", "/og-image.png"], (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", req.path.slice(1)));
});

// Ukážky z kurzu Škola stávkovania na tipradar.eu – bez hesla.
app.use("/skola", express.static(path.join(__dirname, "..", "landing", "skola"), { maxAge: "30d" }));
// Obrázky prezentácie (zlaté svetlo v úvode) – bez hesla.
app.use("/obrazky", express.static(path.join(__dirname, "..", "landing", "obrazky"), { maxAge: "30d" }));

// Zásady ochrany osobných údajov (tipradar.eu/ochrana-udajov) – bez hesla.
app.get(["/ochrana-udajov", "/ochrana-udajov/"], (_req, res) => {
  res.set("Cache-Control", "no-cache"); res.sendFile(path.join(__dirname, "..", "landing", "ochrana-udajov.html"));
});

// Formulár „Máte otázku?" na tipradar.eu (bez hesla): meno, e-mail, téma a otázka.
// Uloží sa do zoznamu záujemcov ako „otázka z webu" (nepočíta sa do VIP miest) a admin dostane e-mail (odpoveď ide priamo pisateľovi).
const waitlistHits = new Map<string, number[]>();
// Návštevnosť verejných stránok (bez cookies) – stránka sem pošle zobrazenie alebo kliknutie.
const hitLimiter = new Map<string, { n: number; at: number }>();
app.post("/api/public/hit", express.text({ limit: "2kb", type: "*/*" }), async (req, res) => {
  res.status(204).end();
  try {
    const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim();
    const ua = String(req.headers["user-agent"] ?? "");
    if (/bot|crawl|spider|preview|headless|lighthouse/i.test(ua)) return;
    // Poistka proti zahlteniu: najviac 60 záznamov za minútu z jednej adresy.
    const now = Date.now();
    const lim = hitLimiter.get(ip);
    if (lim && now - lim.at < 60000) { if (++lim.n > 60) return; } else hitLimiter.set(ip, { n: 1, at: now });
    if (hitLimiter.size > 5000) hitLimiter.clear();
    const body = typeof req.body === "string" && req.body ? JSON.parse(req.body) : {};
    await recordHit({
      page: String(body.p ?? ""),
      source: sourceFrom(String(body.r ?? ""), String(body.u ?? "")),
      click: body.c ? String(body.c) : undefined,
      ip,
      ua,
    });
  } catch { /* návštevnosť nesmie nič pokaziť */ }
});

app.get("/api/stats/visits", async (req, res) => {
  try {
    res.json({ days: await readStats(Number(req.query.days) || 30) });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.post("/api/public/waitlist", express.json({ limit: "10kb" }), async (req, res) => {
  const ip = String(req.headers["x-forwarded-for"] ?? req.ip ?? "").split(",")[0].trim();
  const now = Date.now();
  const hits = (waitlistHits.get(ip) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  if (hits.length >= 10) {
    res.status(429).json({ error: "Príliš veľa pokusov. Skúste to, prosím, o hodinu." });
    return;
  }
  hits.push(now);
  waitlistHits.set(ip, hits);
  const b = req.body ?? {};
  const clean = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
  if (clean(b.web, 200)) {
    res.json({ ok: true }); // pasca na roboty – tichý úspech
    return;
  }
  const name = clean(b.name, 80);
  const email = clean(b.email, 120).toLowerCase();
  const note = clean(b.note, 500);
  const plan = ["clenstvo", "vip", "premium", "kurz", "otazka"].includes(b.plan) ? String(b.plan) : "";
  if (name.length < 2) { res.status(400).json({ error: "Napíšte, prosím, svoje meno." }); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { res.status(400).json({ error: "Skontrolujte, prosím, e-mail." }); return; }
  if (!plan) { res.status(400).json({ error: "Vyberte, prosím, čo vás zaujíma." }); return; }
  if (note.length < 3) { res.status(400).json({ error: "Napíšte, prosím, svoju otázku." }); return; }
  if (b.consent !== true) { res.status(400).json({ error: "Bez súhlasu so spracovaním údajov vás nemôžeme zapísať." }); return; }
  try {
    // Otázka z dotazníka sa nepočíta do poradovníka VIP – téma ide len do poznámky.
    const topic = plan === "clenstvo" || plan === "vip" || plan === "premium" ? "Členstvo: " : plan === "kurz" ? "Kurz stávkovania: " : "";
    await recordLead({ chatId: `web:${email}`, plan: "otazka", name, email, note: topic + note, source: "web" });
    const topicLabel = plan === "clenstvo" || plan === "vip" || plan === "premium" ? "Členstvo" : plan === "kurz" ? "Kurz stávkovania (99 €)" : "Všeobecná otázka";
    sendAdminEmail(`Nová správa z formulára na tipradar.eu – ${name}`, [
      ["Meno", name],
      ["E-mail", email],
      ["Téma", topicLabel],
      ["Správa", note],
    ], email).catch(() => {});
    res.json({ ok: true });
  } catch {
    res.status(502).json({ error: "Zápis sa nepodaril. Skúste to, prosím, o chvíľu znova." });
  }
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

// ---- Nový model a automatické úpravy trhov (21. 10. 2026) ----
/** Prepínač „tipy vyberá nový model“ (xG, únava, doma/vonku) – v appke jedným klikom. */
const NEW_MODEL_META = "newModelActive";
let newModelCache: { value: boolean; at: number } | null = null;
async function isNewModelActive(): Promise<boolean> {
  if (newModelCache && Date.now() - newModelCache.at < 60 * 1000) return newModelCache.value;
  const value = (await getMeta(NEW_MODEL_META).catch(() => null)) === "1";
  newModelCache = { value, at: Date.now() };
  return value;
}

/**
 * Vypnuté trhy a oprava presnosti podľa ostrých výsledkov (marketHealth.ts). Prepočíta sa
 * najviac raz za 30 minút; pri zmene oproti minulému stavu príde Michalovi správa na Telegram.
 */
const MARKET_STATE_META = "marketAdjustments";
let adjustCache: { value: MarketAdjustments; at: number } | null = null;
let adjustRefresh: Promise<MarketAdjustments> | null = null;
async function getMarketAdjustments(force = false): Promise<MarketAdjustments> {
  if (!force && adjustCache && Date.now() - adjustCache.at < 30 * 60 * 1000) return adjustCache.value;
  if (adjustRefresh) return adjustRefresh;
  adjustRefresh = (async () => {
    try {
      const health = computeMarketHealth(await listTips(), await listShadow().catch(() => []));
      const next = health.adjustments;
      let prev: MarketAdjustments | null = null;
      try { prev = JSON.parse((await getMeta(MARKET_STATE_META)) ?? "null"); } catch { prev = null; }
      const text = marketChangesText(prev, next, health.rows);
      if (text) {
        await setMeta(MARKET_STATE_META, JSON.stringify(next));
        void notifyAdmin(text);
      }
      adjustCache = { value: next, at: Date.now() };
      return next;
    } catch {
      // pri chybe ostane posledný známy stav (alebo žiadna úprava)
      return adjustCache?.value ?? {};
    } finally {
      adjustRefresh = null;
    }
  })();
  return adjustRefresh;
}

/**
 * Analýza jedného zápasu (rovnaká pre tlačidlo v appke aj kontrolu po zostavách).
 * record = false: nič sa nezapisuje do tichej evidencie ani sledovania (kontrola pred výkopom).
 */
async function analyzeFixture(fixture: any, leagueId: any, season: any, record = true) {

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

  // Liga majstrov a Európska liga (22. 10. 2026, Michalovo rozhodnutie): góly sa počítajú
  // ako v ostatných ligách – z posledných 10 zápasov tímu vo všetkých súťažiach (hlavne
  // domáca liga), prepočítané podľa sily domácich líg. Staré pohárové sezóny sa nepoužijú.
  let cupNote: string | null = null;
  if (CUP_LEAGUE_IDS.includes(Number(leagueId))) {
    const cup = await applyCupGoals(fixture.homeTeam.id, fixture.awayTeam.id, Number(season), leagueAvg, homeStats, awayStats, homeExtStats, awayExtStats);
    ({ homeStats, awayStats } = cup);
    homeExtStats = cup.homeExt;
    awayExtStats = cup.awayExt;
    if (cup.homeOk) homePriors = null;
    if (cup.awayOk) awayPriors = null;
    cupNote = cup.note;
  }

  // Druhá vlna - súpisky hráčov + potvrdená zostava (ak je k dispozícii),
  // spustené AŽ PO prvej vlne.
  const [homePlayers, awayPlayers, lineup, marketOdds] = await Promise.all([
    getTeamPlayersWithStats(fixture.homeTeam.id, season, leagueId),
    getTeamPlayersWithStats(fixture.awayTeam.id, season, leagueId),
    getFixtureLineupPlayerIds(fixture.fixtureId),
    getFixtureOdds(fixture.fixtureId),
  ]);
  const missingPlayers = await getFixtureMissingPlayers(fixture.fixtureId);
  // Rozhodca: z údajov zápasu, inak ho dočítame z API (pri chybe sa jednoducho nepoužije).
  const refereeName = fixture.referee ?? (await getFixtureReferee(fixture.fixtureId).catch(() => null));
  const referee = await getRefereeProfile(Number(leagueId), Number(season), refereeName).catch(() => null);

  // Štatistiky posledných vzájomných zápasov (rohy, karty…) – pri chybe sa jednoducho nepoužijú.
  const h2hStats = await getHeadToHeadStats(h2h, fixture.homeTeam.name).catch(() => []);
  // Liga majstrov: pravidlo „aspoň 3 zápasy v sezóne" podľa všetkých súťaží tímu.
  let seasonGamesAny: number | null = null;
  if (CUP_LEAGUE_IDS.includes(Number(leagueId))) {
    const [h, a] = await Promise.all([
      getSeasonGamesAnyCompetition(fixture.homeTeam.id, season),
      getSeasonGamesAnyCompetition(fixture.awayTeam.id, season),
    ]);
    if (h != null && a != null) seasonGamesAny = Math.min(h, a);
  }
  // Nový model (21. 10. 2026): oddych tímov – pri chybe sa únava jednoducho nepoužije.
  const [restHome, restAway, adjust, useNewModel] = await Promise.all([
    getRestInfo(fixture.homeTeam.id, season, fixture.date).catch(() => null),
    getRestInfo(fixture.awayTeam.id, season, fixture.date).catch(() => null),
    getMarketAdjustments(),
    isNewModelActive(),
  ]);
  const nm = newModelInputs(homeExtStats, awayExtStats, restHome, restAway);
  const extraNow = {
    homeShotsOnGoal: mixStat(homeExtStats.shotsOnGoal, awayExtStats.shotsOnGoalAgainst),
    awayShotsOnGoal: mixStat(awayExtStats.shotsOnGoal, homeExtStats.shotsOnGoalAgainst),
    homeFouls: mixStat(homeExtStats.fouls, awayExtStats.foulsAgainst),
    awayFouls: mixStat(awayExtStats.fouls, homeExtStats.foulsAgainst),
    homeOffsides: mixStat(homeExtStats.offsides, awayExtStats.offsidesAgainst),
    awayOffsides: mixStat(awayExtStats.offsides, homeExtStats.offsidesAgainst),
    homePossession: homeExtStats.possession,
    awayPossession: awayExtStats.possession,
    homeCards: mixStat(homeExtStats.cards, awayExtStats.cardsAgainst),
    awayCards: mixStat(awayExtStats.cards, homeExtStats.cardsAgainst),
  };
  // Súčasný a nový model z tých istých údajov; tipy vyberá ten, ktorý je zapnutý.
  const run = (isNew: boolean) => predictMatch(
    fixture,
    homeStats,
    awayStats,
    h2h,
    leagueAvg,
    DEFAULT_WEIGHTS,
    homePriors,
    awayPriors,
    isNew ? nm.homeCorners : mixStat(homeExtStats.corners, awayExtStats.cornersAgainst),
    isNew ? nm.awayCorners : mixStat(awayExtStats.corners, homeExtStats.cornersAgainst),
    homePlayers,
    awayPlayers,
    lineup.homeIds,
    lineup.awayIds,
    isNew ? nm.extra : extraNow,
    marketOdds,
    h2hStats,
    { home: { goalsFor: homeExtStats.goalsFor ?? null, goalsAgainst: homeExtStats.goalsAgainst ?? null, games: homeExtStats.goalsGames ?? 0 }, away: { goalsFor: awayExtStats.goalsFor ?? null, goalsAgainst: awayExtStats.goalsAgainst ?? null, games: awayExtStats.goalsGames ?? 0 } },
    false,
    missingPlayers,
    seasonGamesAny,
    referee,
    lineup,
    isNew ? nm.variant : null,
    adjust
  );
  const current = run(false);
  let novy: ReturnType<typeof predictMatch> | null = null;
  try {
    novy = run(true);
  } catch {
    novy = null; // nový model nesmie zablokovať analýzu
  }
  const result = useNewModel && novy ? novy : current;

  // Meranie (20. 10. 2026): pravdepodobnosť stávkoviek (bez marže, ak sú kurzy oboch strán)
  // pre odporúčané aj vyradené tipy – appka ju pri uložení tipu zapíše k nemu.
  const marketDetail = (p: { market: string; selection: string }) =>
    marketOdds && marketOdds.length ? marketProbabilityDetail(marketOdds, p, fixture.homeTeam.name, fixture.awayTeam.name) : null;
  const marketProbs: Record<string, { prob: number; devig: boolean }> = {};
  for (const p of [...((result as any).bestBets ?? []), ...((result as any).lowValueBets ?? [])]) {
    const d = marketDetail(p);
    if (d) marketProbs[`${p.market}|${p.selection}`] = { prob: Math.round(d.prob * 10) / 10, devig: d.devig };
  }
  if (record) {
    // Tichá evidencia vyradených tipov (na pozadí, nič neblokuje): od 20. 10. 2026 všetky
    // dôvody vyradenia (pásmo, hodnota, kurz, rozpor…) pre kandidátov 60 – 85 % s kurzom.
    void recordShadow(
      shadowEntriesFrom(fixture, (result as any).allCandidates ?? [], {
        bestBets: (result as any).bestBets ?? [],
        marketDetail,
        modelVersion: (result as any).modelVersion ?? MODEL_VERSION,
      })
    ).catch(() => {});
    // Tiché sledovanie miešania modelu so stávkovkami (na tipy nemá vplyv).
    // Od 21. 10. 2026 aj odhad nového modelu (xG, únava, doma/vonku) – porovnanie v reporte.
    void recordBlend(blendEntryFrom(fixture, (current as any).allCandidates ?? [], (novy as any)?.allCandidates ?? null)).catch(() => {});
    // Tiché sledovanie tiketu dňa: kandidáti z odporúčaných aj vyradených tipov (na pozadí).
    void recordLegs(
      legCandidatesFrom(fixture, [...((result as any).bestBets ?? []), ...((result as any).lowValueBets ?? [])])
    ).catch(() => {});
  }
  return { result, marketProbs, cupNote, lineup };
}

app.post("/api/analyze", async (req, res) => {
  try {
    const { fixture, leagueId, season } = req.body ?? {};
    if (!fixture || !leagueId || !season) {
      res.status(400).json({ error: "Chýbajú údaje zápasu, ligy alebo sezóny." });
      return;
    }
    const { result, marketProbs, cupNote } = await analyzeFixture(fixture, leagueId, season);
    res.json({ ...result, marketProbs, cupNote });
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

/**
 * Kurz pri uložení pre uzatvárací kurz: porovnávame kurz z API pri uložení s kurzom
 * z API pred výkopom (rovnaký zdroj). `odds` je od 17. 10. kurz Michalovej stávkovky.
 */
function clvOpen(t: SavedTip): number | null | undefined {
  return t.apiOdds ?? t.odds;
}

/**
 * Meranie (20. 10. 2026): k novému tipu doplní verziu modelu, čas uloženia pred výkopom
 * a pravdepodobnosť stávkoviek (appka ju posiela z analýzy; ak chýba, dopočíta sa
 * z kurzov v pamäti). Na tip samotný, kurz ani správy v Telegrame to nemá vplyv.
 */
async function addMeasurement(tip: SavedTip): Promise<void> {
  try {
    if (!tip.modelVersion) tip.modelVersion = MODEL_VERSION;
    // Oprava presnosti trhu, ktorá platila pri analýze – aby sa ďalšia oprava počítala z pôvodných percent.
    if (tip.marketCalibration === undefined && !(tip.legs && tip.legs.length)) {
      const cat = marketCategory(tip.market);
      const k = cat ? (await getMarketAdjustments()).calibration?.[cat] : undefined;
      if (typeof k === "number" && k !== 1) tip.marketCalibration = k;
    }
    const kickoff = new Date(tip.matchDate).getTime();
    if (tip.hoursBeforeKickoff === undefined && isFinite(kickoff) && kickoff > Date.now())
      tip.hoursBeforeKickoff = Math.round(((kickoff - Date.now()) / 3600000) * 10) / 10;
    const valid = typeof tip.marketProb === "number" && tip.marketProb > 0 && tip.marketProb < 100;
    if (!valid) {
      delete tip.marketProb;
      delete tip.marketProbDevig;
      if (!(tip.legs && tip.legs.length) && tip.fixtureId > 0 && typeof tip.apiOdds === "number") {
        const odds = await getFixtureOdds(tip.fixtureId);
        const d = odds.length ? marketProbabilityDetail(odds, tip, tip.homeTeam, tip.awayTeam) : null;
        if (d) {
          tip.marketProb = Math.round(d.prob * 10) / 10;
          tip.marketProbDevig = d.devig;
        }
      }
    } else if (typeof tip.marketProbDevig !== "boolean") {
      tip.marketProbDevig = false;
    }
  } catch {
    // meranie nesmie zablokovať uloženie tipu
  }
}

app.post("/api/tips", async (req, res) => {
  try {
    const tip: SavedTip = req.body;
    // Ručne doplnený odohraný tip (už s výsledkom) smie mať dátum v minulosti.
    const isManualResult = tip.manualEntry === true && ["won", "lost", "void"].includes(tip.status);
    if (!isManualResult && tipHasStartedMatch(tip)) {
      res.status(400).json({ error: MATCH_STARTED_MESSAGE });
      return;
    }
    // ⭐ Silný tip dňa z Tipov dňa: najviac jeden za deň – ak už v ten deň iný tip značku má, nový ju nedostane.
    if (tip.strongOfDay) {
      const day = dayKeySk(new Date(tip.matchDate));
      const taken = !!tip.legs?.length || (await listTips()).some((t) => t.id !== tip.id && t.strongOfDay && t.status !== "void" && dayKeySk(new Date(t.matchDate)) === day);
      tip.strongOfDay = taken ? undefined : true;
    }
    if (!isManualResult) await addMeasurement(tip);
    // Skúšobné pásmo 65 – 68 %: tip sa automaticky uloží len na sledovanie (bez Telegramu a štatistík).
    if (!(tip.legs && tip.legs.length) && !tip.manualEntry && typeof tip.probability === "number" && tip.probability < WATCH_BELOW_PROBABILITY) {
      tip.watchOnly = true;
      tip.strongOfDay = undefined;
    }
    // Rozpor so stávkovkami, ktorý prešiel len vďaka zmierneniu filtra (22. 10. 2026, Michalovo
    // rozhodnutie): tip sa uloží len na sledovanie, klientom nejde.
    if (tip.softConflict && !(tip.legs && tip.legs.length)) {
      tip.watchOnly = true;
      tip.strongOfDay = undefined;
    }
    // Ručne doplnený tip prejde rovnakou kontrolou ako tipy z modelu (dôvera, kurz, hodnota) –
    // ak by ho model nepustil, uloží sa len medzi sledované.
    if (tip.manualEntry && !(tip.legs && tip.legs.length) && !tip.probabilityEstimated && typeof tip.probability === "number" && typeof tip.odds === "number") {
      const ev = (tip.probability / 100) * tip.odds;
      if (tip.probability < WATCH_BELOW_PROBABILITY || tip.probability > MAX_PROBABILITY || tip.odds < MIN_ODDS || ev < 1.05 || ev > 1.25) {
        tip.watchOnly = true;
      }
    }
    await saveTip(tip);
    res.json({ ok: true, telegramAvailable: isTelegramEnabled(), watchOnly: tip.watchOnly === true });
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
    if (tip.watchOnly) {
      res.status(400).json({ error: "Tento tip je len na sledovanie, do Telegramu sa neposiela." });
      return;
    }
    if (!isTelegramEnabled()) {
      res.status(400).json({ error: "Telegram nie je na serveri nastavený." });
      return;
    }
    const target = parseTarget(req.body?.target);
    const sent = await sendSavedTip(tip, tips, target, req.body?.asStrongOfDay === true);
    res.json({ ok: sent > 0 });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

function parseTarget(v: unknown): TelegramTarget {
  return v === "premium" || v === "vip" || v === "both" || v === "free" ? v : "premium";
}

/** Pošle jeden uložený tip do Telegramu a zapamätá si odoslané správy. Vráti počet odoslaných správ. */
async function sendSavedTip(tip: SavedTip, tips: SavedTip[], target: TelegramTarget, forceStrong = false): Promise<number> {
  // Ručne zvolený „Silný tip dňa“ z histórie tipov: ide do VIP a nahradí automatický výber v ten deň.
  const isTicket = !!tip.legs && tip.legs.length > 0;
  const headerOverride = forceStrong && isTicket ? `⭐ <b>SILNÝ TIKET DŇA</b>` : undefined;
  const strong = forceStrong || isStrongTipOfDay(tip, tips);
  if (forceStrong) {
    const day = dayKeySk(new Date(tip.matchDate));
    for (const t of tips) {
      if (t.id !== tip.id && t.strongOfDay && dayKeySk(new Date(t.matchDate)) === day) await updateTip(t.id, { strongOfDay: false });
    }
  }
  const seatsLine = target === "free" && !forceStrong ? await freeSeatsLine() : undefined;
  const sent = await sendTipToTelegram(tip, forceStrong ? "vip" : target, headerOverride, strong, seatsLine);
  if (sent.length > 0) {
    const existing = tip.telegramMessages ?? [];
    await updateTip(tip.id, {
      telegramMessages: [...existing, ...sent],
      ...(strong ? { strongOfDay: true } : {}),
      ...(target === "free" ? { sentFree: true } : {}),
    });
  }
  return sent.length;
}

// Viac tipov naraz (napr. všetky tipy dňa z histórie): pošle ich jeden po druhom v poradí podľa času výkopu.
app.post("/api/telegram/send-tips", async (req, res) => {
  try {
    if (!isTelegramEnabled()) {
      res.status(400).json({ error: "Telegram nie je na serveri nastavený." });
      return;
    }
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 30) : [];
    const target = parseTarget(req.body?.target);
    const tips = await listTips();
    const chosen = ids
      .map((id) => tips.find((t) => t.id === id))
      .filter((t): t is SavedTip => !!t && !t.watchOnly)
      .sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());
    let sent = 0;
    let failed = 0;
    for (const tip of chosen) {
      if ((await sendSavedTip(tip, tips, target)) > 0) sent++;
      else failed++;
      await new Promise((r) => setTimeout(r, 400)); // nech správy v kanáli prídu v správnom poradí a bez limitu Telegramu
    }
    res.json({ sent, failed, missing: ids.length - chosen.length });
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
    if (tip.watchOnly) {
      res.status(400).json({ error: "Tento tip je len na sledovanie, do Telegramu sa neposiela." });
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
      req.body?.target === "premium" || req.body?.target === "vip" || req.body?.target === "both" || req.body?.target === "free"
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
    const summarize = summarizeTips;
    const all = statsTips(tips);
    // Podané tikety (snímky) – len pri vyhodnotených tipoch, čakajúci tip sa nesmie prezradiť.
    const slipIds = await listSlipIds().catch(() => new Map<string, number | null>());
    const settled = (t: SavedTip) => t.status === "won" || t.status === "lost" || t.status === "void";
    // Aktuálny mesiac (podľa slovenského času a dňa zápasu).
    const monthKey = dayKeySk(new Date()).slice(0, 7);
    const inMonth = all.filter((t) => (tipDayKey(t) ?? "").startsWith(monthKey));
    // Posledných 7 dní (dnes a 6 dní dozadu) – riadok pri členstve na webe.
    const weekAgoKey = dayKeySk(new Date(Date.now() - 6 * 24 * 3600 * 1000));
    const inLast7 = all.filter((t) => (tipDayKey(t) ?? "") >= weekAgoKey);
    // Posledné VYHODNOTENÉ tipy (po skončení zápasu) - na ukážku, z čoho čísla vznikli.
    // Čakajúce tipy sa nikdy nezverejňujú, tie patria len platiacim klientom.
    const recent = all
      .filter((t) => t.status === "won" || t.status === "lost" || t.status === "void")
      .map((t) => ({ t, day: tipDayKey(t) ?? "", kick: tipKickMs(t) }))
      // najnovší zápas hore: podľa času výkopu, pri rovnakom čase podľa uloženia
      .sort((a, b) => b.kick - a.kick || String(b.t.savedAt || "").localeCompare(String(a.t.savedAt || "")))
      .slice(0, 50)
      .map(({ t, day, kick }) => {
        const isTicket = Array.isArray(t.legs) && t.legs.length > 0;
        return {
          day,
          time: kick ? timeSk(new Date(kick)) : "",
          match: isTicket
            ? `Tiket (${plural(t.legs!.length, "zápas", "zápasy", "zápasov")})`
            : `${translateTeamName(t.homeTeam)} – ${translateTeamName(t.awayTeam)}`,
          bet: isTicket
            ? t.legs!.map((l) => `${translateTeamName(l.homeTeam)} – ${translateTeamName(l.awayTeam)}: ${translateNamesInText(l.selection, l.homeTeam, l.awayTeam)}`).join(" · ")
            : `${t.market}: ${translateNamesInText(t.selection, t.homeTeam, t.awayTeam)}`,
          odds: typeof t.odds === "number" && t.odds > 1 ? Math.round(t.odds * 100) / 100 : null,
          status: t.status,
          slip: slipIds.has(t.id) ? t.id : null,
        };
      });
    const slips = tips
      .filter((t) => slipIds.has(t.id) && settled(t) && !t.watchOnly)
      .map((t) => ({ t, day: tipDayKey(t) ?? "" }))
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
      .slice(0, 12)
      .map(({ t, day }) => {
        const isTicket = Array.isArray(t.legs) && t.legs.length > 0;
        return {
          id: t.id,
          day,
          match: isTicket
            ? `Tiket (${plural(t.legs!.length, "zápas", "zápasy", "zápasov")})`
            : `${translateTeamName(t.homeTeam)} – ${translateTeamName(t.awayTeam)}`,
          bet: isTicket
            ? t.legs!.map((l) => `${translateTeamName(l.homeTeam)} – ${translateTeamName(l.awayTeam)}`).join(" · ")
            : `${t.market}: ${translateNamesInText(t.selection, t.homeTeam, t.awayTeam)}`,
          odds: typeof t.odds === "number" && t.odds > 1 ? Math.round(t.odds * 100) / 100 : null,
          stake: slipIds.get(t.id) ?? null,
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
      .map(([key, list]) => {
        const sm = summarize(list);
        return { key, won: sm.won, total: sm.totalResolved, rate: sm.winRate, profit: sm.profit, withOdds: sm.withOdds };
      });
    // Prehľad po mesiacoch (stránka Výsledky): každý mesiac zvlášť, najstarší prvý.
    const months = monthlyResults(tips);
    // Uzatvárací kurz: o koľko bol kurz pri tipe vyšší než kurz tesne pred výkopom.
    const withClosing = all.filter(
      (t) => typeof clvOpen(t) === "number" && clvOpen(t)! > 1 && typeof t.closingOdds === "number" && t.closingOdds > 1
    );
    const clvAvg = withClosing.length
      ? withClosing.reduce((sum, t) => sum + (clvOpen(t)! / t.closingOdds! - 1) * 100, 0) / withClosing.length
      : null;
    // „Včerajší tip“ na úvod stránky: posledný deň s vyhodnotenými tipmi. Vyberá sa bez ohľadu
    // na výsledok (zápas s najneskorším výkopom), aby to nebolo vyberanie len výhier.
    let latest: any = null;
    const lastDay = resolvedAll.map((t) => tipDayKey(t) ?? "").filter(Boolean).sort().pop();
    if (lastDay) {
      const dayTips = resolvedAll.filter((t) => tipDayKey(t) === lastDay);
      // Posledný vyhodnotený tip = zápas s najneskorším výkopom (bez ohľadu na výsledok).
      const kick = (t: SavedTip) =>
        Math.max(...(t.legs && t.legs.length > 0 ? t.legs.map((l) => l.matchDate) : [t.matchDate]).map((d) => new Date(d).getTime() || 0));
      const pick = [...dayTips].sort((a, b) => kick(b) - kick(a))[0];
      const isTicket = Array.isArray(pick.legs) && pick.legs.length > 0;
      const hasScore = !isTicket && typeof pick.actualHomeGoals === "number" && typeof pick.actualAwayGoals === "number";
      latest = {
        day: lastDay,
        league: isTicket ? null : pick.leagueName,
        match: isTicket
          ? `Tiket (${plural(pick.legs!.length, "zápas", "zápasy", "zápasov")})`
          : `${translateTeamName(pick.homeTeam)} – ${translateTeamName(pick.awayTeam)}`,
        bet: isTicket
          ? pick.legs!.map((l) => `${translateTeamName(l.homeTeam)} – ${translateTeamName(l.awayTeam)}: ${translateNamesInText(l.selection, l.homeTeam, l.awayTeam)}`).join(" · ")
          : `${pick.market}: ${translateNamesInText(pick.selection, pick.homeTeam, pick.awayTeam)}`,
        probability: Math.round(pick.probability),
        odds: typeof pick.odds === "number" && pick.odds > 1 ? Math.round(pick.odds * 100) / 100 : null,
        score: hasScore ? `${pick.actualHomeGoals}:${pick.actualAwayGoals}` : null,
        status: pick.status,
        strong: !!pick.strongOfDay,
        dayWon: dayTips.filter((t) => t.status === "won").length,
        dayTotal: dayTips.length,
      };
    }
    // „Tip zadarmo“ na úvod stránky: posledný tip poslaný do free kanála, ak je zápas dnes alebo včera.
    let freeTip: any = null;
    const freeRecent = tips
      .filter((t) => !t.watchOnly && (t.sentFree || (t.telegramMessages ?? []).some((m) => isFreeChat(m.chatId))) && t.status !== "void" && Date.now() - new Date(t.matchDate).getTime() < 36 * 3600 * 1000)
      .sort((a, b) => new Date(b.matchDate).getTime() - new Date(a.matchDate).getTime())[0];
    if (freeRecent) {
      const isTicket = Array.isArray(freeRecent.legs) && freeRecent.legs.length > 0;
      freeTip = {
        day: dayKeySk(new Date(freeRecent.matchDate)),
        kickoff: freeRecent.matchDate,
        league: isTicket ? null : freeRecent.leagueName,
        match: isTicket
          ? `Tiket (${plural(freeRecent.legs!.length, "zápas", "zápasy", "zápasov")})`
          : `${translateTeamName(freeRecent.homeTeam)} – ${translateTeamName(freeRecent.awayTeam)}`,
        bet: isTicket
          ? freeRecent.legs!.map((l) => `${translateTeamName(l.homeTeam)} – ${translateTeamName(l.awayTeam)}: ${translateNamesInText(l.selection, l.homeTeam, l.awayTeam)}`).join(" · ")
          : `${freeRecent.market}: ${translateNamesInText(freeRecent.selection, freeRecent.homeTeam, freeRecent.awayTeam)}`,
        probability: Math.round(freeRecent.probability),
        odds: typeof freeRecent.odds === "number" && freeRecent.odds > 1 ? Math.round(freeRecent.odds * 100) / 100 : null,
        status: freeRecent.status,
        score:
          !isTicket && typeof freeRecent.actualHomeGoals === "number" && typeof freeRecent.actualAwayGoals === "number"
            ? `${freeRecent.actualHomeGoals}:${freeRecent.actualAwayGoals}`
            : null,
      };
    }
    // Kalkulačka na webe („Koľko by ste mali dnes?“): všetky vyhodnotené tipy s kurzom
    // v poradí podľa výkopu – len kurz a výsledok, nič, čo by prezradilo čakajúci tip.
    const kickTime = (t: SavedTip) =>
      Math.max(...(t.legs && t.legs.length > 0 ? t.legs.map((l) => l.matchDate) : [t.matchDate]).map((d) => new Date(d).getTime() || 0));
    const bank = resolvedAll
      .filter((t) => typeof t.odds === "number" && t.odds > 1)
      .sort((a, b) => kickTime(a) - kickTime(b))
      .map((t) => ({ day: tipDayKey(t) ?? "", odds: Math.round(t.odds! * 100) / 100, won: t.status === "won" }));
    // Presnosť modelu: v pásmach dôvery porovná priemernú šancu podľa modelu so skutočnosťou.
    // Len jednotlivé tipy (tiket má kombinovanú šancu), vrátené tipy sa nerátajú.
    const singles = resolvedAll.filter((t) => !(t.legs && t.legs.length > 0) && typeof t.probability === "number");
    const bands = [
      { label: "do 71 %", test: (p: number) => p < 72 },
      { label: "72 – 75 %", test: (p: number) => p >= 72 && p < 76 },
      { label: "76 % a viac", test: (p: number) => p >= 76 },
    ];
    const calibRow = (list: SavedTip[]) => ({
      n: list.length,
      predicted: list.length ? Math.round((list.reduce((s, t) => s + t.probability, 0) / list.length) * 10) / 10 : null,
      actual: list.length ? Math.round((list.filter((t) => t.status === "won").length / list.length) * 1000) / 10 : null,
    });
    const calibration = {
      overall: calibRow(singles),
      bands: bands.map((b) => ({ label: b.label, ...calibRow(singles.filter((t) => b.test(t.probability))) })),
    };
    res.json({
      ...summarize(all),
      calibration,
      month: { key: monthKey, ...summarize(inMonth) },
      last7: summarize(inLast7),
      latest,
      freeTip,
      clv: {
        total: withClosing.length,
        beat: withClosing.filter((t) => clvOpen(t)! > t.closingOdds!).length,
        avg: clvAvg === null ? null : Math.round(clvAvg * 10) / 10,
      },
      recent,
      slips,
      timeline: { unit: byWeek ? "week" : "day", points: timeline },
      months,
      bank,
    });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});


// ---- Podané tikety: snímky tiketov pri tipoch z Histórie tipov ----
// Verejne sa obrázok ukáže len pri vyhodnotenom tipe (čakajúci tip patrí len členom).
app.get("/api/public/slip/:id", async (req, res) => {
  try {
    const tip = (await listTips()).find((t) => t.id === req.params.id);
    if (!tip || tip.watchOnly || !(tip.status === "won" || tip.status === "lost" || tip.status === "void")) {
      res.status(404).send("Nenájdené.");
      return;
    }
    const img = await getSlipImage(tip.id);
    const m = img && /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(img);
    if (!m) {
      res.status(404).send("Nenájdené.");
      return;
    }
    res.set("Content-Type", m[1]);
    res.set("Cache-Control", "public, max-age=86400");
    res.set("Access-Control-Allow-Origin", "*");
    res.send(Buffer.from(m[2], "base64"));
  } catch (err: any) {
    res.status(502).send("Chyba.");
  }
});

app.get("/api/slips", async (_req, res) => {
  try {
    const ids = await listSlipIds();
    res.json(Object.fromEntries(ids));
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.get("/api/tips/:id/slip", async (req, res) => {
  const img = await getSlipImage(req.params.id).catch(() => null);
  const m = img && /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(img);
  if (!m) {
    res.status(404).send("Nenájdené.");
    return;
  }
  res.set("Content-Type", m[1]);
  res.set("Cache-Control", "no-store");
  res.send(Buffer.from(m[2], "base64"));
});

app.post("/api/tips/:id/slip", async (req, res) => {
  try {
    const image = String(req.body?.image ?? "");
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > MAX_SLIP_CHARS) {
      res.status(400).json({ error: "Obrázok sa nepodarilo načítať alebo je príliš veľký." });
      return;
    }
    const tip = (await listTips()).find((t) => t.id === req.params.id);
    if (!tip) {
      res.status(404).json({ error: "Tip sa nenašiel." });
      return;
    }
    const stakeNum = Number(String(req.body?.stake ?? "").replace(",", "."));
    const stake = isFinite(stakeNum) && stakeNum > 0 && stakeNum < 100000 ? Math.round(stakeNum * 100) / 100 : null;
    await saveSlip(tip.id, image, stake);
    res.json({ ok: true, stake });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.delete("/api/tips/:id/slip", async (req, res) => {
  try {
    await deleteSlip(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

// Verejné počítadlo VIP miest (len čísla, žiadne mená). Aktívny VIP = typ „group"
// s platbou nie viac ako 7 dní po splatnosti. Počet miest: 1 a 3 mesiace bez obmedzenia, 6 mesiacov SEATS_SEASON (30).
app.get("/api/public/vip-seats", async (_req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  try {
    const { taken, total, activeVip } = await seasonSeats();
    // Predaj členstiev: SALES_OPEN=true na Renderi (kým nie je živnosť, len poradovník).
    // Pred spustením predaja: koľko ľudí sa zapísalo do poradovníka o VIP (len počet).
    // Záujemca, ktorý už je VIP členom (rovnaké Telegram ID), sa nepočíta dvakrát.
    const memberChats = new Set(activeVip.map((s) => String(s.telegramChatId || "")).filter(Boolean));
    const waitlistVip = (await listLeads().catch(() => [])).filter(
      (l) => ["vip", "vip_waitlist", "sampion", "sampion_waitlist"].includes(l.plan) && !memberChats.has(String(l.chatId))
    ).length;
    // Odkaz na bezplatný Telegram kanál: premenná TELEGRAM_FREE_CHANNEL_URL na Renderi (napr. https://t.me/tipradar_free).
    const freeChannelUrl = process.env.TELEGRAM_FREE_CHANNEL_URL || "https://t.me/TipRadarAiBot?start=free";
    const terms = await termSeats();
    res.json({ taken: Math.min(taken, total), total, salesOpen: process.env.SALES_OPEN === "true", payOpen: paymentsEnabled(), waitlistVip, minOdds: MIN_ODDS, freeChannelUrl, terms });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

// Verejná prezentačná stránka (bez hesla). Zobrazuje len texty a súhrnné čísla.
app.get(["/prezentacia", "/prezentacia/"], (_req, res) => {
  res.set("Cache-Control", "no-cache"); res.sendFile(path.join(__dirname, "..", "landing", "index.html"));
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

// Kontrola zostavy z Histórie/analýzy: čo k zápasu vracia API-Football (17. 10. 2026).
app.get("/api/debug/lineups/:fixtureId", async (req, res) => {
  try {
    const fixtureId = parseInt(req.params.fixtureId, 10);
    res.json(await getFixtureLineupsDebug(fixtureId));
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.get("/api/telegram/targets", (_req, res) => {
  res.json({ targets: availableTelegramTargets() });
});

// Ohlásenie v kanáli: tipy prídu o pár minút (tlačidlo v Histórii tipov, 17. 10. 2026).
app.post("/api/telegram/tips-coming", async (req, res) => {
  try {
    if (!isTelegramEnabled()) {
      res.status(400).json({ error: "Telegram nie je na serveri nastavený." });
      return;
    }
    const target = parseTarget(req.body?.target ?? "both");
    const text =
      `⏳ <b>Dnešné tipy pridáme o pár minút</b>\n\n` +
      `Model práve prechádza zápasy a kurzy. Zapnite si upozornenia, nech vám nič neujde. 🔔`;
    const sent = await sendCustomMessage(text, target);
    res.json({ ok: sent.length > 0 });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.post("/api/telegram/no-tip-today", async (req, res) => {
  try {
    if (!isTelegramEnabled()) {
      res.status(400).json({ error: "Telegram nie je na serveri nastavený." });
      return;
    }
    const target =
      req.body?.target === "premium" || req.body?.target === "vip" || req.body?.target === "both" || req.body?.target === "free"
        ? req.body.target
        : "both";
    const text =
      `📭 <b>Dnes bez tipu</b>\n\n` +
      `Model dnes nenašiel žiadnu stávku s dostatočnou hodnotou. Radšej žiadny tip než zlý tip.\n\n` +
      `Uvidíme sa nabudúce! 👋`;
    const sent = await sendCustomMessage(text, target);
    res.json({ ok: sent.length > 0 });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

/**
 * Silný tip dňa: každý deň najviac jeden – tip s najvyššou dôverou (aspoň 70 %)
 * spomedzi uložených jednotlivých tipov s výkopom v ten istý deň (slovenský čas).
 * Pri rovnakej dôvere rozhodne vyšší kurz, potom skorší výkop.
 * Ak už bol v ten deň iný tip odoslaný ako silný, ďalší sa ním nestane.
 */
function isStrongTipOfDay(tip: SavedTip, all: SavedTip[]): boolean {
  if (tip.legs?.length || tip.probability < STRONG_TIP_MIN_PROBABILITY) return false;
  if (tip.strongOfDay) return true;
  const day = dayKeySk(new Date(tip.matchDate));
  const sameDay = all.filter((t) => !t.legs?.length && t.status !== "void" && dayKeySk(new Date(t.matchDate)) === day);
  if (sameDay.some((t) => t.id !== tip.id && t.strongOfDay)) return false;
  const rank = (t: SavedTip) => [t.probability, t.odds ?? 0, -new Date(t.matchDate).getTime()];
  const better = (a: SavedTip, b: SavedTip) => {
    const ra = rank(a), rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] > rb[i];
    return a.savedAt < b.savedAt;
  };
  return sameDay.every((t) => t.id === tip.id || !better(t, tip));
}

// ---- Denné vyhodnotenie: všetky tipy a tikety dňa v jednej správe ----
/** Deň (YYYY-MM-DD) podľa slovenského času. */
function dayKeySk(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava" }).format(date);
}

/** Čas výkopu v Bratislave, napríklad „20:45“. */
function timeSk(date: Date): string {
  return new Intl.DateTimeFormat("sk-SK", { timeZone: "Europe/Bratislava", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

/** Výkop tipu v ms; pri tikete výkop posledného zápasu. 0, ak dátum chýba. */
function tipKickMs(t: SavedTip): number {
  const dates = t.legs && t.legs.length > 0 ? t.legs.map((l) => l.matchDate) : [t.matchDate];
  const times = dates.map((d) => new Date(d).getTime()).filter((n) => !isNaN(n));
  return times.length ? Math.max(...times) : 0;
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
      req.body?.target === "premium" || req.body?.target === "vip" || req.body?.target === "both" || req.body?.target === "free"
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
      req.body?.target === "premium" || req.body?.target === "vip" || req.body?.target === "both" || req.body?.target === "free"
        ? req.body.target
        : "both";
    const sent = await sendCustomMessage(text, target);
    res.json({ ok: sent.length > 0 });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

// ---- Mesačný súhrn: všetky tipy daného mesiaca (podľa dátumu zápasu) ----
const MONTH_NAMES = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];

/** Mesiac vo formáte RRRR-MM; bez neho aktuálny mesiac (prvé 3 dni mesiaca ešte predošlý). */
function reportMonth(input: unknown): string {
  if (typeof input === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(input)) return input;
  const today = dayKeySk(new Date());
  if (Number(today.slice(8, 10)) > 3) return today.slice(0, 7);
  const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1));
  return d.toISOString().slice(0, 7);
}

function buildMonthlyReport(tips: SavedTip[], month: string) {
  const [y, m] = month.split("-").map(Number);
  const label = `${MONTH_NAMES[m - 1]} ${y}`;
  // Deň zápasu podľa slovenského času (tiket = deň posledného zápasu).
  const inMonth = (t: SavedTip) => (tipDayKey(t) ?? "").slice(0, 7) === month;
  const all = statsTips(tips).filter(inMonth);
  const resolved = all.filter((t) => t.status === "won" || t.status === "lost");
  const won = resolved.filter((t) => t.status === "won").length;
  const lost = resolved.length - won;
  const voided = all.filter((t) => t.status === "void").length;
  const pending = all.filter((t) => t.status === "pending").length;
  const rate = resolved.length > 0 ? (won / resolved.length) * 100 : null;
  const withOdds = resolved.filter((t) => typeof t.odds === "number" && t.odds > 1);
  const profit = withOdds.reduce((sum, t) => sum + (t.status === "won" ? t.odds! - 1 : -1), 0);
  const roi = withOdds.length > 0 ? (profit / withOdds.length) * 100 : null;
  const avgOdds = withOdds.length > 0 ? withOdds.reduce((s, t) => s + t.odds!, 0) / withOdds.length : null;

  // Pri každom trhu aj to, koľko model v priemere sľuboval (len tipy so známou dôverou) –
  // „model sľuboval / naozaj vyšlo“ (21. 10. 2026, len v appke, do Telegramu nejde).
  const byMarketMap: Record<string, { won: number; total: number; probSum: number; probN: number }> = {};
  for (const t of resolved) {
    const key = t.legs && t.legs.length > 1 ? "Tikety" : t.market;
    if (!byMarketMap[key]) byMarketMap[key] = { won: 0, total: 0, probSum: 0, probN: 0 };
    byMarketMap[key].total++;
    if (t.status === "won") byMarketMap[key].won++;
    if (!(t.legs && t.legs.length > 1) && typeof t.probability === "number" && !t.probabilityEstimated && !t.restoredFromDaily) {
      byMarketMap[key].probSum += t.probability;
      byMarketMap[key].probN++;
    }
  }
  const byMarket = Object.entries(byMarketMap)
    .map(([market, v]) => ({
      market, won: v.won, total: v.total, rate: (v.won / v.total) * 100,
      promised: v.probN ? v.probSum / v.probN : null, promisedCount: v.probN,
    }))
    .sort((a, b) => b.total - a.total || b.rate - a.rate);

  // Najlepší a najhorší deň (podľa zisku v jednotkách).
  const byDay: Record<string, number> = {};
  for (const t of withOdds) {
    const day = tipDayKey(t);
    if (!day) continue;
    byDay[day] = (byDay[day] ?? 0) + (t.status === "won" ? t.odds! - 1 : -1);
  }
  const days = Object.entries(byDay).sort((a, b) => b[1] - a[1]);
  const fmtDay = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;
  const bestDay = days.length > 0 && days[0][1] > 0 ? { day: fmtDay(days[0][0]), profit: days[0][1] } : null;

  // Najdlhšia séria výhier v mesiaci.
  let streak = 0, bestStreak = 0;
  for (const t of [...resolved].sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime())) {
    streak = t.status === "won" ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
  }

  const text =
    `🗓 <b>Mesačný súhrn – ${label}</b>\n\n` +
    (resolved.length > 0
      ? `✅ Vyšlo: <b>${won}</b>   ❌ Nevyšlo: <b>${lost}</b>\n` +
        `Úspešnosť: <b>${fmtNum(rate!, 0)} %</b> (${won} z ${resolved.length})\n` +
        (voided > 0 ? `↩ Vrátené: ${voided}\n` : "") +
        (roi !== null
          ? `Zisk: <b>${signed(profit, 1)} j.</b> (ROI ${signed(roi, 0)} %${
              withOdds.length < resolved.length ? `, z ${plural(withOdds.length, "tipu", "tipov", "tipov")} so známym kurzom` : ""
            })\n`
          : "") +
        (avgOdds !== null ? `Priemerný kurz: ${fmtNum(avgOdds, 2)}\n` : "") +
        (bestStreak >= 2 ? `Najdlhšia séria výhier: ${bestStreak}\n` : "") +
        (bestDay ? `Najlepší deň: ${bestDay.day} (${signed(bestDay.profit, 1)} j.)\n` : "") +
        (byMarket.length > 0
          ? `\n<b>Podľa trhov</b>\n` + byMarket.map((b) => `• ${b.market}: ${b.won} z ${b.total} (${fmtNum(b.rate, 0)} %)`).join("\n") + "\n"
          : "")
      : `V tomto mesiaci zatiaľ nie sú vyhodnotené žiadne tipy.\n`) +
    (pending > 0 ? `\n⏳ Ešte sa hrá: ${pending}\n` : "") +
    `\n<i>Poctivá história – vrátane prehratých tipov. 1 j. = 1 jednotka vkladu.</i>`;

  return {
    month, label, total: all.length, resolved: resolved.length, won, lost, voided, pending,
    rate, profit: withOdds.length > 0 ? profit : null, roi, avgOdds, oddsCount: withOdds.length,
    bestStreak, bestDay, byMarket, text,
  };
}

app.get("/api/reports/monthly", async (req, res) => {
  try {
    res.json(buildMonthlyReport(await listTips(), reportMonth(req.query.month)));
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.post("/api/telegram/monthly-report", async (req, res) => {
  try {
    if (!isTelegramEnabled()) {
      res.status(400).json({ error: "Telegram nie je na serveri nastavený." });
      return;
    }
    const report = buildMonthlyReport(await listTips(), reportMonth(req.body?.month));
    const target =
      req.body?.target === "premium" || req.body?.target === "vip" || req.body?.target === "both" || req.body?.target === "free"
        ? req.body.target
        : "both";
    const sent = await sendCustomMessage(report.text, target);
    res.json({ ok: sent.length > 0 });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

// Sem posiela Telegram prichádzajúce správy od používateľov (nová správa, stlačenie tlačidla).
/** Tajný kľúč webhooku odvodený od tokenu bota (bez ďalšieho nastavovania na Renderi). */
function telegramWebhookSecret(): string | undefined {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return undefined;
  return crypto.createHash("sha256").update("tipradar-webhook:" + token).digest("hex").slice(0, 48);
}

app.post("/api/telegram/webhook", async (req, res) => {
  // Správy prijímame len od Telegramu: pri nastavení webhooku dostal tajný kľúč,
  // ktorý posiela v hlavičke. Podvrhnuté požiadavky sa ticho ignorujú.
  const expected = telegramWebhookSecret();
  if (expected && req.get("X-Telegram-Bot-Api-Secret-Token") !== expected) {
    res.sendStatus(200);
    return;
  }
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
    await setTelegramWebhook(webhookUrl, telegramWebhookSecret());
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
    const patch = buildTipEdit(tip, req.body ?? {});
    // „Len sledovať“ sa dá zapnúť aj dodatočne (napr. tip z Ligy majstrov uložený ako bežný).
    if (typeof req.body?.watchOnly === "boolean") {
      if (req.body.watchOnly) patch.watchOnly = true;
      else patch.watchOnly = undefined;
      // Samotné presunutie medzi sledované nie je oprava výsledku – bez značky „upravené“.
      const sameStatus = patch.status === undefined || patch.status === tip.status;
      const sameOdds = patch.odds === undefined || patch.odds === (tip.odds ?? null);
      const sameLegs = patch.legs === undefined || JSON.stringify(patch.legs) === JSON.stringify(tip.legs);
      if (sameStatus && sameOdds && sameLegs && !tip.edited) delete patch.edited;
    }
    await updateTip(tip.id, patch);
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

// ---- Instagram (/instagram) – Reel „Model vs. kancelária“ a piatkový bezplatný tip ----
app.get(["/instagram", "/instagram/"], (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "instagram.html"));
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

// Obnova tipov do Histórie tipov z denného súhrnu (/suhrn) – napr. po zmazaní tipov
// pod 1,60 (18. 10. 2026). Berie len vyhodnotené tipy (výhra/prehra/vrátené) s kurzom
// pod maxOdds, ktoré v histórii ešte nie sú. dryRun: len spočíta, nič neuloží.
function bratislavaIso(day: string, time: string): string {
  const t = /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : "12:00";
  const guess = new Date(`${day}T${t}:00Z`);
  const local = new Date(guess.toLocaleString("en-US", { timeZone: "Europe/Bratislava" }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (local.getTime() - utc.getTime())).toISOString();
}

app.post("/api/tips/restore-from-daily", async (req, res) => {
  try {
    // maxOdds je voliteľné – bez neho vráti všetky chýbajúce tipy bez ohľadu na kurz
    // (zmazané mohli byť aj tipy, ktoré v histórii nemali kurz a mazalo sa podľa odhadu).
    const maxOdds = Number(req.body?.maxOdds) > 1 ? Number(req.body.maxOdds) : Infinity;
    const dryRun = req.body?.dryRun === true;
    const days = await getAllDays();
    const existing = await listTips();
    const ids = new Set(existing.map((t) => t.id));
    const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
    // Tip už v histórii je, ak sedí deň, začiatok mena domácich a kurz (alebo tip v histórii kurz nemá).
    const already = (day: string, home: string, odds: number) =>
      existing.some((t) => {
        if (dayKeySk(new Date(t.matchDate)) !== day) return false;
        const a = norm(t.homeTeam ?? ""), b = norm(home);
        if (!a || !b || !(a.startsWith(b.slice(0, 5)) || b.startsWith(a.slice(0, 5)))) return false;
        return typeof t.odds !== "number" || Math.abs(t.odds - odds) < 0.005;
      });
    const found: SavedTip[] = [];
    const skipped = { noResult: 0, badOdds: 0, overMax: 0, inHistory: 0 };
    for (const [day, entry] of Object.entries<any>(days)) {
      const list: any[] = entry?.state?.tips ?? [];
      list.forEach((d, i) => {
        if (!d?.match || !d?.tip) return;
        const odds = Number(String(d?.odds ?? "").replace(",", ".").replace(/[^0-9.]/g, ""));
        if (!(odds > 1)) { skipped.badOdds++; return; }
        if (!["won", "lost", "void"].includes(d.result)) { skipped.noResult++; return; }
        if (odds >= maxOdds) { skipped.overMax++; return; }
        const id = `restored-${day}-${i}`;
        const parts = String(d.match).split(/\s+(?:—|–|-|vs\.?)\s+/i);
        const home = (parts[0] ?? d.match).trim();
        const away = (parts[1] ?? "").trim();
        if (ids.has(id) || already(day, home, odds)) { skipped.inHistory++; return; }
        const text = String(d.tip).trim();
        const pct = text.match(/(\d{2})\s*%/);
        const colon = text.indexOf(":");
        const clean = text.replace(/·?\s*\d{2}\s*%/, "").trim();
        const split = colon > 0 ? null : splitMarketText(clean);
        const market = colon > 0 ? text.slice(0, colon).trim() : split ? split.market : "Obnovený tip";
        const selection = colon > 0 ? clean.slice(clean.indexOf(":") + 1).trim() : split ? split.selection : clean;
        const matchDate = bratislavaIso(day, String(d.time ?? ""));
        found.push({
          id,
          fixtureId: 0,
          leagueId: 0,
          season: Number(day.slice(0, 4)),
          leagueName: "",
          homeTeam: home,
          awayTeam: away,
          matchDate,
          market,
          selection,
          probability: pct ? Number(pct[1]) : Math.round(100 / odds),
          probabilityEstimated: !pct,
          odds: Math.round(odds * 100) / 100,
          manualEntry: true,
          restoredFromDaily: true,
          savedAt: matchDate,
          status: d.result,
        } as SavedTip);
      });
    }
    if (!dryRun) for (const t of found) await saveTip(t);
    res.json({
      skipped,
      count: found.length,
      won: found.filter((t) => t.status === "won").length,
      lost: found.filter((t) => t.status === "lost").length,
      tips: found.map((t) => ({ day: dayKeySk(new Date(t.matchDate)), match: `${t.homeTeam} – ${t.awayTeam}`, tip: `${t.market}: ${t.selection}`, odds: t.odds, status: t.status })),
    });
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


// ---- Spätný test modelu (za heslom) ----
app.post("/api/backtest", (req, res) => {
  const b = req.body ?? {};
  const leagueIds = Array.isArray(b.leagueIds) ? b.leagueIds.map(Number).filter((n: number) => Number.isFinite(n)) : [];
  const season = Number(b.season);
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!leagueIds.length || !Number.isFinite(season) || !re.test(b.from ?? "") || !re.test(b.to ?? "")) {
    res.status(400).json({ error: "Vyber ligy, sezónu a obdobie." });
    return;
  }
  const maxFixtures = Math.max(5, Math.min(300, Number(b.maxFixtures) || 60));
  const job = startBacktest({ leagueIds, season, from: b.from, to: b.to, maxFixtures });
  res.json(job);
});

app.get("/api/backtest/:id", (req, res) => {
  const job = getBacktest(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Test sa nenašiel (server sa medzitým mohol reštartovať)." });
    return;
  }
  res.json(job);
});


// ---- Tichá evidencia vyradených tipov ----
app.post("/api/shadow/record", async (req, res) => {
  try {
    const { fixture, picks, bestBets } = req.body ?? {};
    if (fixture && fixture.fixtureId) {
      await recordShadow(shadowEntriesFrom(fixture, picks ?? []));
      // Appka posiela vyradené tipy (a po úprave aj odporúčané) – kandidáti na tiket dňa.
      await recordLegs(legCandidatesFrom(fixture, [...(bestBets ?? []), ...(picks ?? [])])).catch(() => {});
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

// ---- Model: zdravie trhov, porovnanie nového modelu a prepínač (21. 10. 2026) ----
app.get("/api/model/health", async (_req, res) => {
  try {
    const health = computeMarketHealth(await listTips(), await listShadow().catch(() => []));
    res.json({
      ...health,
      newModel: { active: await isNewModelActive(), ...newModelSummary(await listBlend()) },
    });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.post("/api/model/new-model", async (req, res) => {
  try {
    const active = req.body?.active === true;
    await setMeta(NEW_MODEL_META, active ? "1" : "0");
    newModelCache = { value: active, at: Date.now() };
    res.json({ ok: true, active });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.get("/api/blend/summary", async (_req, res) => {
  try {
    res.json(blendSummary(await listBlend()));
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

// Poradie dôvodov vyradenia v prehľade (podľa poradia filtrov v predictor.ts).
const SHADOW_REASON_ORDER = [
  "conflict", "ev_high", "ev_high_few_games", "ev_low", "min_odds", "one_bookmaker", "band_low", "band_high",
  "category_lower_ev", "match_lower_ev", "market_disabled", "market_excluded", "few_games", "no_market_odds", "no_odds", "unknown",
];
const SHADOW_GAP_ORDER = ["< 0", "0 – 5", "5 – 10", "10 – 15", "15+", "unknown"];

/** Rozdiel model − stávkovky v bodoch; stávkovky podľa marketProb, pri starších záznamoch marketProbability. */
function shadowGap(e: ShadowEntry): number | null {
  const model = typeof e.modelProbability === "number" ? e.modelProbability : e.probability;
  const market = typeof e.marketProb === "number" ? e.marketProb : typeof e.marketProbability === "number" ? e.marketProbability : null;
  return typeof model === "number" && market !== null ? model - market : null;
}
function shadowGapBucket(e: ShadowEntry): string {
  const g = shadowGap(e);
  if (g === null) return "unknown";
  return g < 0 ? "< 0" : g < 5 ? "0 – 5" : g < 10 ? "5 – 10" : g < 15 ? "10 – 15" : "15+";
}

/** Prehľad skupín evidencie: počet, vyhodnotené, výhry, úspešnosť, priemer modelu a stávkoviek, zisk pri 1 j. */
function shadowBreakdown(all: ShadowEntry[], keyOf: (e: ShadowEntry) => string, order: string[]) {
  const avg = (xs: (number | null | undefined)[]) => {
    const v = xs.filter((x): x is number => typeof x === "number");
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const groups = new Map<string, ShadowEntry[]>();
  for (const e of all) {
    const k = keyOf(e);
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return Array.from(groups.entries())
    .map(([key, list]) => {
      const settled = list.filter((e) => e.status === "won" || e.status === "lost");
      const won = settled.filter((e) => e.status === "won").length;
      const withOdds = settled.filter((e) => typeof e.odds === "number" && e.odds! > 1);
      const profit = withOdds.reduce((sum, e) => sum + (e.status === "won" ? e.odds! - 1 : -1), 0);
      return {
        key,
        count: list.length,
        settled: settled.length,
        won,
        hitRate: settled.length ? (won / settled.length) * 100 : null,
        avgModel: avg(settled.map((e) => (typeof e.modelProbability === "number" ? e.modelProbability : e.probability))),
        avgMarket: avg(settled.map((e) => (typeof e.marketProb === "number" ? e.marketProb : e.marketProbability))),
        withOdds: withOdds.length,
        profit,
      };
    })
    .sort((a, b) => {
      const ia = order.indexOf(a.key), ib = order.indexOf(b.key);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || b.count - a.count;
    });
}

app.get("/api/shadow/summary", async (_req, res) => {
  try {
    const all = await listShadow();
    // Hlavný riadok ostáva len pre tipy s rozporom so stávkovkami (porovnateľný so staršími číslami);
    // ostatné dôvody vyradenia (od 20. 10. 2026) sú v byReason a byGap.
    const conflict = all.filter((e) => !e.reasonCode || e.conflict);
    const settled = conflict.filter((e) => e.status === "won" || e.status === "lost");
    const won = settled.filter((e) => e.status === "won").length;
    const avg = (xs: (number | null)[]) => {
      const v = xs.filter((x): x is number => typeof x === "number");
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const withOdds = settled.filter((e) => typeof e.odds === "number" && e.odds! > 1);
    const profit = withOdds.reduce((sum, e) => sum + (e.status === "won" ? e.odds! - 1 : -1), 0);
    res.json({
      total: conflict.length,
      pending: conflict.filter((e) => e.status === "pending").length,
      settled: settled.length,
      won,
      hitRate: settled.length ? (won / settled.length) * 100 : null,
      avgModel: avg(settled.map((e) => e.modelProbability)),
      avgMarket: avg(settled.map((e) => e.marketProbability)),
      withOdds: withOdds.length,
      profit,
      roi: withOdds.length ? (profit / withOdds.length) * 100 : null,
      all: {
        total: all.length,
        pending: all.filter((e) => e.status === "pending").length,
        settled: all.filter((e) => e.status === "won" || e.status === "lost").length,
      },
      byReason: shadowBreakdown(all, shadowReasonCode, SHADOW_REASON_ORDER),
      byGap: shadowBreakdown(all, shadowGapBucket, SHADOW_GAP_ORDER),
    });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

// ---- Uzatvárací kurz (CLV) ----
// Tesne pred výkopom sa ku každému uloženému tipu zistí kurz ešte raz. Ak bol kurz
// pri zverejnení tipu vyšší ako tesne pred zápasom, trh sa posunul smerom k nášmu
// tipu – to je najspoľahlivejší znak, že model naozaj predbieha stávkovky, aj keď
// je tipov zatiaľ málo a výsledky kolíšu.
const CLOSING_BEFORE_KICKOFF_MS = 15 * 60 * 1000; // zisťuje sa najskôr 15 minút pred výkopom
const CLOSING_GIVE_UP_MS = 3 * 24 * 60 * 60 * 1000; // ak server pred výkopom spal, skúša sa ešte 3 dni po zápase
const CLOSING_RETRY_AFTER_KICKOFF_MS = 6 * 60 * 60 * 1000; // po výkope najviac raz za 6 hodín (šetrí API)
let closingOddsRunning = false;
const closingLastTry = new Map<number, number>();

/** Tip čaká na uzatvárací kurz (staršie tipy spred zavedenia sa nedopĺňajú). */
function needsClosingOdds(t: SavedTip, now = Date.now()): boolean {
  return (
    !(t.legs && t.legs.length) &&
    !t.manualEntry &&
    typeof t.odds === "number" &&
    t.odds > 1 &&
    t.closingOdds === undefined &&
    now - new Date(t.matchDate).getTime() <= CLOSING_GIVE_UP_MS
  );
}

/**
 * Vyradený tip z tichej evidencie čaká na uzatvárací kurz (20. 10. 2026). Skúša sa len
 * raz, od 15 minút pred výkopom do 3 dní po ňom; staršie záznamy bez kurzu sa nedopĺňajú.
 */
function shadowNeedsClosingOdds(e: ShadowEntry, now = Date.now()): boolean {
  const kickoff = new Date(e.matchDate).getTime();
  return (
    !!e.reasonCode &&
    typeof e.odds === "number" &&
    e.odds > 1 &&
    e.closingOdds === undefined &&
    kickoff - now <= CLOSING_BEFORE_KICKOFF_MS &&
    now - kickoff <= CLOSING_GIVE_UP_MS
  );
}

async function captureClosingOdds(): Promise<void> {
  if (closingOddsRunning) return;
  closingOddsRunning = true;
  try {
    const now = Date.now();
    const due = (await listTips()).filter((t) => {
      const kickoff = new Date(t.matchDate).getTime();
      if (!needsClosingOdds(t, now) || kickoff - now > CLOSING_BEFORE_KICKOFF_MS) return false;
      const last = closingLastTry.get(t.fixtureId);
      return !(now > kickoff && last && now - last < CLOSING_RETRY_AFTER_KICKOFF_MS);
    });
    const byFixture = new Map<number, SavedTip[]>();
    for (const t of due) byFixture.set(t.fixtureId, [...(byFixture.get(t.fixtureId) ?? []), t]);
    // Vyradené tipy z tichej evidencie: rovnaký čerstvý kurz zápasu (jedno volanie API na zápas).
    let shadowDue: ShadowEntry[] = [];
    try {
      shadowDue = (await listShadow()).filter((e) => shadowNeedsClosingOdds(e, now));
    } catch {
      // evidencia nesmie zastaviť uzatvárací kurz skutočných tipov
    }
    const shadowByFixture = new Map<number, ShadowEntry[]>();
    for (const e of shadowDue) shadowByFixture.set(e.fixtureId, [...(shadowByFixture.get(e.fixtureId) ?? []), e]);
    const fixtureIds = new Set<number>([...byFixture.keys(), ...shadowByFixture.keys()]);
    for (const fixtureId of fixtureIds) {
      const tips = byFixture.get(fixtureId) ?? [];
      if (tips.length) closingLastTry.set(fixtureId, now);
      const odds = await getFixtureOdds(fixtureId, true);
      for (const t of tips) {
        const match = odds.length ? findOdds(odds, t, t.homeTeam, t.awayTeam) : null;
        if (match) {
          // Meranie (20. 10. 2026): aj pravdepodobnosť stávkoviek pred výkopom – CLV bez vplyvu marže.
          const d = marketProbabilityDetail(odds, t, t.homeTeam, t.awayTeam);
          await updateTip(t.id, {
            closingOdds: match.odd,
            closingOddsAt: new Date().toISOString(),
            ...(d ? { closingMarketProb: Math.round(d.prob * 10) / 10, closingDevig: d.devig } : {}),
          });
        }
      }
      for (const e of shadowByFixture.get(fixtureId) ?? []) {
        try {
          const match = odds.length ? findOdds(odds, e, e.homeTeam, e.awayTeam) : null;
          const d = match ? marketProbabilityDetail(odds, e, e.homeTeam, e.awayTeam) : null;
          await updateShadow({
            ...e,
            closingOdds: match ? match.odd : null,
            closingOddsAt: new Date().toISOString(),
            ...(d ? { closingMarketProb: Math.round(d.prob * 10) / 10, closingDevig: d.devig } : {}),
          });
        } catch {
          // jeden záznam evidencie nesmie zastaviť ostatné
        }
      }
    }
  } catch (err) {
    console.error("Uzatvárací kurz sa nepodarilo zistiť:", err);
  } finally {
    closingOddsRunning = false;
  }
}

setInterval(() => void captureClosingOdds(), 10 * 60 * 1000); // kontrola každých 10 minút
// Stav trhov (vypnutie / oprava presnosti) sa prepočíta aj bez analýzy – správa príde včas.
setInterval(() => void getMarketAdjustments(true).catch(() => {}), 60 * 60 * 1000);
setTimeout(() => void getMarketAdjustments(true).catch(() => {}), 2 * 60 * 1000);
void captureClosingOdds();

function clvStats(list: { clv: number; method: "prob" | "price" }[]) {
  const avg = list.length ? list.reduce((a, b) => a + b.clv, 0) / list.length : null;
  return {
    total: list.length,
    avgClv: avg,
    beat: list.filter((c) => c.clv >= CLV_TIE).length,
    tie: list.filter((c) => Math.abs(c.clv) < CLV_TIE).length,
    worse: list.filter((c) => c.clv <= -CLV_TIE).length,
    byProbability: list.filter((c) => c.method === "prob").length,
  };
}

app.get("/api/clv/summary", async (_req, res) => {
  try {
    const tips = await listTips();
    const done = tips.filter(
      (t) => typeof clvOpen(t) === "number" && clvOpen(t)! > 1 && typeof t.closingOdds === "number" && t.closingOdds > 1
    );
    const clvRes = (t: SavedTip) => clvOf({ ...t, open: clvOpen(t) })!;
    const clv = (t: SavedTip) => clvRes(t).clv;
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const markets = Array.from(new Set(done.map((t) => t.market)));
    // Vyradené tipy z tichej evidencie (od 20. 10. 2026) – podľa dôvodu vyradenia.
    let shadow: any = null;
    try {
      const entries = (await listShadow()).filter((e) => e.reasonCode);
      const withClv = entries
        .map((e) => ({ e, c: clvOf({ ...e, open: e.odds }) }))
        .filter((x): x is { e: ShadowEntry; c: { clv: number; method: "prob" | "price" } } => x.c !== null);
      const reasons = Array.from(new Set(withClv.map((x) => x.e.reasonCode!)));
      shadow = {
        ...clvStats(withClv.map((x) => x.c)),
        pending: entries.filter((e) => shadowNeedsClosingOdds(e) || (e.closingOdds === undefined && new Date(e.matchDate).getTime() > Date.now())).length,
        byReason: reasons
          .map((r) => ({ reason: r, ...clvStats(withClv.filter((x) => x.e.reasonCode === r).map((x) => x.c)) }))
          .sort((a, b) => b.total - a.total),
      };
    } catch {
      shadow = null;
    }
    const stats = clvStats(done.map(clvRes));
    res.json({
      total: done.length,
      pending: tips.filter(needsClosingOdds).length,
      avgClv: stats.avgClv,
      beat: stats.beat,
      tie: stats.tie,
      worse: stats.worse,
      byProbability: stats.byProbability,
      tieThreshold: CLV_TIE,
      shadow,
      byMarket: markets
        .map((m) => {
          const list = done.filter((t) => t.market === m);
          return { market: m, total: list.length, avgClv: avg(list.map(clv)) };
        })
        .sort((a, b) => b.total - a.total),
    });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

// ---- Tiché sledovanie tiketu dňa (2 zápasy, kurz spolu aspoň 2,00) ----
/** Kandidáti na tiket: zapísaní pri analýzach + uložené samostatné tipy, ktoré spĺňajú pravidlá. */
async function allTicketLegs(): Promise<{ legs: TicketLegCandidate[]; fromStore: Set<string> }> {
  const map = new Map<string, TicketLegCandidate>();
  const fromStore = new Set<string>();
  for (const l of await listLegs()) { map.set(l.id, l); fromStore.add(l.id); }
  for (const t of await listTips()) {
    if ((t.legs && t.legs.length) || t.manualEntry || typeof t.odds !== "number") continue;
    if (!legQualifies(t.probability, t.odds)) continue;
    if (!(new Date(t.savedAt).getTime() < new Date(t.matchDate).getTime())) continue;
    const id = `${t.fixtureId}|${t.market}|${t.selection}`;
    const prev = map.get(id);
    const recordedAt = prev && prev.recordedAt < t.savedAt ? prev.recordedAt : t.savedAt;
    // Uložený tip sa vyhodnocuje bežne – jeho výsledok má prednosť.
    map.set(id, {
      id, fixtureId: t.fixtureId, matchDate: t.matchDate, homeTeam: t.homeTeam, awayTeam: t.awayTeam,
      market: t.market, selection: t.selection, ...(t.playerId ? { playerId: t.playerId } : {}),
      probability: t.probability, odds: t.odds, recordedAt,
      status: t.status !== "pending" ? t.status : prev?.status ?? "pending",
    });
    fromStore.delete(id);
  }
  return { legs: Array.from(map.values()), fromStore };
}

app.get("/api/ticket-watch/summary", async (_req, res) => {
  try {
    const { legs } = await allTicketLegs();
    const tickets = buildTickets(legs);
    const settled = tickets.filter((t) => t.status === "won" || t.status === "lost");
    const won = settled.filter((t) => t.status === "won").length;
    const profit = settled.reduce((sum, t) => sum + (t.profit ?? 0), 0);
    res.json({
      rules: TICKET_RULES,
      candidates: legs.length,
      total: tickets.length,
      pending: tickets.filter((t) => t.status === "pending").length,
      settled: settled.length,
      won,
      hitRate: settled.length ? (won / settled.length) * 100 : null,
      avgOdds: tickets.length ? tickets.reduce((a, t) => a + t.odds, 0) / tickets.length : null,
      profit,
      roi: settled.length ? (profit / settled.length) * 100 : null,
      tickets: tickets.slice(0, 60),
    });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

// ---- Poradovník záujemcov (za heslom) ----
app.get("/api/leads", async (_req, res) => {
  try {
    res.json(await listLeads());
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});
// „Otvoriť predaj": každý z poradovníka dostane od bota správu s tlačidlami na zaplatenie (každý len raz).
app.post("/api/leads/sales-open", async (_req, res) => {
  if (!paymentsEnabled()) {
    res.status(400).json({ error: "Platby ešte nie sú zapnuté. Na Renderi nastav SALES_OPEN=true, PAY_IBAN a PAY_NAME." });
    return;
  }
  try {
    res.json(await sendSalesOpenToWaitlist());
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});
// Platby prevodom: zoznam na potvrdenie v appke. Čakajúce (kto neoznámil „Zaplatil som", len 7 dní) + vybavené za 30 dní.
app.get("/api/payments", async (_req, res) => {
  try {
    const monthAgo = Date.now() - 30 * 24 * 3600 * 1000;
    const list = (await listPayments()).filter(
      (p) => (p.status === "pending" ? Boolean(p.claimedAt) || new Date(p.createdAt).getTime() >= Date.now() - 7 * 24 * 3600 * 1000 : new Date(p.paidAt ?? p.createdAt).getTime() >= monthAgo)
    );
    res.json(list.map((p) => ({ ...p, priceEur: PAY_TERMS[p.term].price, termName: PAY_TERMS[p.term].name })));
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});
app.post("/api/payments/:token/confirm", async (req, res) => {
  try {
    const r = await confirmBankPaymentAndInvite(String(req.params.token));
    if (!r) {
      res.status(404).json({ error: "Platba sa nenašla." });
      return;
    }
    res.json(r);
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});
app.post("/api/payments/:token/cancel", async (req, res) => {
  try {
    const p = await cancelPayment(String(req.params.token));
    if (!p) {
      res.status(404).json({ error: "Platba sa nenašla." });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});
app.delete("/api/payments/:token", async (req, res) => {
  try {
    await deletePayment(String(req.params.token));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});
app.delete("/api/leads/:chatId", async (req, res) => {
  try {
    await deleteLead(req.params.chatId);
    res.json({ ok: true });
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

/**
 * Vyhodnotí všetky čakajúce tipy a tikety, ktorých zápasy sa už skončili.
 * 24. 10. 2026: skutočné tipy sa vyhodnotia PRVÉ (predtým až po tichej evidencii
 * a sledovaní, ktoré minuli veľa požiadaviek na API a appka medzitým prestala čakať),
 * chyba pri jednom tipe nezastaví ostatné a dva behy naraz sa nespustia.
 */
let pendingCheck: Promise<void> | null = null;
let backgroundCheck: Promise<void> | null = null;
async function checkPendingResults(): Promise<void> {
  if (!pendingCheck) {
    pendingCheck = settlePendingTips().finally(() => {
      pendingCheck = null;
    });
  }
  await pendingCheck;
  // Tichá evidencia, sledovanie miešania a tikety dňa bežia až potom, na pozadí.
  if (!backgroundCheck) {
    backgroundCheck = settleBackgroundRecords()
      .catch((err) => console.error("Vyhodnotenie evidencie zlyhalo:", err))
      .finally(() => {
        backgroundCheck = null;
      });
  }
}

/** Skutočné tipy a tikety (to, čo vidia členovia a štatistiky). */
async function settlePendingTips(): Promise<void> {
  const tips = await listTips();
  // Len zápasy, ktoré už začali – budúce sa na API zbytočne nepýtame.
  const pending = tips.filter((t) => t.status === "pending" && tipHasStartedMatch(t));

  for (const tip of pending) {
    try {
      if (tip.legs && tip.legs.length > 0) {
        // Tiket - vyhodnotíme každú "nohu" zvlášť (každá môže patriť inému zápasu).
        let anyLegChanged = false;
        for (const leg of tip.legs) {
          if (leg.status !== "pending") continue;
          if (new Date(leg.matchDate).getTime() > Date.now()) continue; // zápas ešte nezačal
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
    } catch (err) {
      // jeden tip nesmie zastaviť vyhodnotenie ostatných
      console.error(`Tip ${tip.id} sa nepodarilo vyhodnotiť:`, err);
    }
  }
}

/** Tichá evidencia, sledovanie miešania a tiché sledovanie tiketu dňa. */
async function settleBackgroundRecords(): Promise<void> {
  // Ak server pred výkopom spal, uzatvárací kurz sa doplní aspoň teraz.
  await captureClosingOdds();
  // vyradené tipy z tichej evidencie vyhodnotíme rovnako ako bežné tipy
  try {
    // Po zápasoch (20. 10. 2026): budúce zápasy sa nepýtajú a výsledok aj štatistiky
    // zápasu sa načítajú raz pre všetky jeho vyradené tipy (evidencia je teraz väčšia).
    const byFixture = new Map<number, ShadowEntry[]>();
    for (const e of (await listShadow()).filter((x) => x.status === "pending" && new Date(x.matchDate).getTime() <= Date.now()))
      byFixture.set(e.fixtureId, [...(byFixture.get(e.fixtureId) ?? []), e]);
    for (const entries of byFixture.values()) {
      try {
        const outcomes = await settleFixtureBets(entries[0], entries);
        if (!outcomes) {
          // Zápas, ktorý sa ani po 3 dňoch nedá vyhodnotiť, sa v evidencii ráta ako vrátený,
          // aby sa naň API nepýtalo pri každej kontrole donekonečna.
          if (Date.now() > new Date(entries[0].matchDate).getTime() + 3 * 24 * 3600 * 1000)
            for (const e of entries) await updateShadow({ ...e, status: "void" } as ShadowEntry);
          continue;
        }
        for (let i = 0; i < entries.length; i++) await updateShadow({ ...entries[i], status: outcomes[i] } as ShadowEntry);
      } catch {
        // jeden zápas nesmie zastaviť ostatné
      }
    }
  } catch {
    // evidencia nesmie zastaviť ďalšie sledovanie
  }
  try {
    for (const f of (await listBlend()).filter((x) => x.status === "pending")) {
      if (new Date(f.matchDate).getTime() > Date.now()) continue;
      try {
        const outcomes = await settleFixtureBets(f, f.picks);
        if (outcomes) await updateBlend({ ...f, status: "settled", picks: f.picks.map((p, i) => ({ ...p, outcome: outcomes[i] })) });
      } catch {
        // jeden zápas nesmie zastaviť ostatné
      }
    }
  } catch {
    // sledovanie miešania nesmie zastaviť ďalšie sledovanie
  }

  // Tiché sledovanie tiketu dňa – vyhodnotíme len tipy, ktoré sú na niektorom tikete
  // (šetrí to požiadavky na API). Uložené tipy sa vyhodnotili už vyššie.
  try {
    const { legs, fromStore } = await allTicketLegs();
    const onTickets = buildTickets(legs).flatMap((t) => t.legs);
    for (const leg of onTickets) {
      if (leg.status !== "pending" || !fromStore.has(leg.id)) continue;
      if (Date.now() < new Date(leg.matchDate).getTime() + 100 * 60 * 1000) continue; // zápas ešte beží
      const settled = await settleBet(leg);
      if (settled) await updateLeg({ ...leg, status: settled.status });
      // Zápas, ktorý sa ani po 3 dňoch nedá vyhodnotiť (odložený, chýbajú štatistiky),
      // sa v tichom sledovaní ráta ako vrátený, aby tiket neostal visieť navždy.
      else if (Date.now() > new Date(leg.matchDate).getTime() + 3 * 24 * 3600 * 1000) await updateLeg({ ...leg, status: "void" });
    }
  } catch {
    // sledovanie nesmie zastaviť ďalšie kontroly
  }
}

/**
 * Kontrola po zostavách (25. 10. 2026): keď sú ~60 min pred výkopom zverejnené zostavy,
 * čakajúci tip sa prepočíta s nimi (zranenia, rotácia, náhradníci). Výsledok sa uloží k tipu
 * a appka ho ukáže v histórii tipov (bez správy na Telegram – Michalovo rozhodnutie).
 */
const LINEUP_CHECK_FROM_MIN = 75; // najskôr 75 min pred výkopom (zostavy bývajú zverejnené ~60 min pred)
let lineupCheckRunning = false;
async function checkLineups(): Promise<void> {
  if (lineupCheckRunning) return;
  lineupCheckRunning = true;
  try {
    const now = Date.now();
    const due = (await listTips()).filter((t) => {
      if (t.status !== "pending" || t.lineupCheck || (t.legs && t.legs.length) || !(t.fixtureId > 0)) return false;
      const kick = new Date(t.matchDate).getTime();
      return isFinite(kick) && kick > now && kick - now <= LINEUP_CHECK_FROM_MIN * 60 * 1000;
    });
    for (const tip of due) {
      try {
        const lineup = await getFixtureLineupPlayerIds(tip.fixtureId);
        if (!lineup.homeStartIds || !lineup.awayStartIds) continue; // zostavy ešte nie sú – skúsi sa o 10 minút
        const fixture = await getFixtureById(tip.fixtureId);
        if (!fixture) continue;
        const { result } = await analyzeFixture(fixture, tip.leagueId, tip.season, false);
        const all: any[] = (result as any).allCandidates ?? [];
        const c = all.find((x) => x.market === tip.market && x.selection === tip.selection);
        let ok = true;
        let reason: string | undefined;
        const prob: number | null = c ? Math.round(c.probability * 10) / 10 : null;
        const odds = typeof tip.odds === "number" && tip.odds > 1 ? tip.odds : c?.odds ?? null;
        if (!c) {
          ok = false;
          reason = "model tento tip po zostavách už neponúka";
        } else if (c.probability < MIN_PROBABILITY || c.probability > MAX_PROBABILITY) {
          ok = false;
          reason = `dôvera ${c.probability.toFixed(0)} % je mimo pásma ${MIN_PROBABILITY} – ${MAX_PROBABILITY} %`;
        } else if (c.marketConflict) {
          ok = false;
          reason = c.marketConflict;
        } else if (odds != null) {
          const ev = (c.probability / 100) * odds;
          if (ev < MIN_EXPECTED_VALUE) {
            ok = false;
            reason = `hodnota klesla na ${((ev - 1) * 100).toFixed(0)} %`;
          } else if (ev > SUSPICIOUS_EXPECTED_VALUE) {
            ok = false;
            reason = `podozrivo vysoká hodnota (+${((ev - 1) * 100).toFixed(0)} %)`;
          }
        }
        await updateTip(tip.id, { lineupCheck: { at: new Date().toISOString(), probability: prob, ok, ...(reason ? { reason } : {}) } });
      } catch (err) {
        console.error(`Kontrola zostáv pre tip ${tip.id} zlyhala:`, err);
      }
    }
  } finally {
    lineupCheckRunning = false;
  }
}
setInterval(() => void checkLineups().catch(() => {}), 10 * 60 * 1000);

// Výsledky sa kontrolujú aj samy, každých 15 minút – netreba čakať na tlačidlo.
setInterval(() => void checkPendingResults().catch((err) => console.error("Automatická kontrola výsledkov zlyhala:", err)), 15 * 60 * 1000);

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
    // Prvé obdobie začína dňom začiatku členstva (od neho sa počíta garancia).
    if (!subscriber.periodStart && subscriber.startDate) subscriber.periodStart = subscriber.startDate;
    await addSubscriber(subscriber);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

app.patch("/api/subscribers/:id", async (req, res) => {
  try {
    const body: Partial<Subscriber> = { ...req.body };
    // Predĺženie z appky (nové obdobie): doterajšie obdobie sa odloží, aby sa dalo vyhodnotiť pre garanciu.
    if (typeof body.periodStart === "string" && typeof body.nextPaymentDue === "string") {
      const sub = (await listSubscribers()).find((x) => x.id === req.params.id);
      if (sub && currentPeriodStart(sub) !== body.periodStart) {
        Object.assign(body, newPeriodUpdates(sub, body.periodStart, body.nextPaymentDue));
      }
    }
    await updateSubscriber(req.params.id, body);
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

// ---- Garancia: ak obdobie členstva (Gold 1, Platinum 3 mesiace; staršie 6 mesiacov) skončí v strate, člen dostane 1 mesiac zadarmo ----

function fmtDaySk(day: string): string {
  return `${Number(day.slice(8, 10))}. ${Number(day.slice(5, 7))}. ${day.slice(0, 4)}`;
}

/** Ako dlho po skončení obdobia ho ešte ukazujeme v appke. */
const GUARANTEE_WINDOW_MS = 60 * 24 * 3600 * 1000;

/** Výsledok všetkých období členov: bežiace (priebežne) a skončené za posledných 60 dní. */
async function guaranteeRows() {
  const tips = statsTips(await listTips());
  const now = Date.now();
  const rows = [];
  for (const s of await listSubscribers()) {
    const term = memberTerm(s);
    for (const p of memberPeriods(s)) {
      const startMs = new Date(p.start).getTime();
      const endMs = new Date(p.end).getTime();
      if (isNaN(startMs) || isNaN(endMs) || startMs > now) continue; // obdobie ešte nezačalo
      const ended = endMs < now;
      if (ended && endMs < now - GUARANTEE_WINDOW_MS) continue;
      // Tipy podľa dňa zápasu (slovenský čas) od prvého po posledný deň obdobia vrátane.
      // Letná prestávka (jún – júl) sa nepočíta, členstvo je vtedy pozastavené.
      const from = dayKeySk(new Date(startMs));
      const to = dayKeySk(new Date(endMs));
      const inPeriod = tips.filter((t) => {
        const d = tipDayKey(t);
        if (d === null || d < from || d > to) return false;
        const m = Number(d.slice(5, 7));
        return m < SUMMER_PAUSE.fromMonth || m > SUMMER_PAUSE.toMonth;
      });
      const sm = summarizeTips(inPeriod);
      const free = Boolean(p.free);
      const applied = (s.guarantees ?? []).some((g) => g.periodStart === p.start);
      const inLoss = sm.profit < 0;
      rows.push({
        id: s.id,
        name: s.name,
        term,
        tier: tierName(term),
        periodStart: p.start,
        periodEnd: p.end,
        profit: sm.profit,
        resolved: sm.totalResolved,
        pending: inPeriod.filter((t) => t.status === "pending").length,
        ended,
        free,
        inLoss,
        eligible: ended && inLoss && !free && !applied,
        applied,
      });
    }
  }
  return rows;
}

app.get("/api/guarantee", async (_req, res) => {
  try {
    res.json(await guaranteeRows());
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  }
});

const guaranteeRunning = new Set<string>();
app.post("/api/guarantee/apply", async (req, res) => {
  const id = typeof req.body?.id === "string" ? req.body.id : "";
  if (!id) {
    res.status(400).json({ error: "Chýba člen." });
    return;
  }
  if (guaranteeRunning.has(id)) {
    res.status(409).json({ error: "Garancia pre tohto člena sa práve pridáva." });
    return;
  }
  guaranteeRunning.add(id);
  try {
    const rows = (await guaranteeRows()).filter((r) => r.id === id);
    const wanted = typeof req.body?.periodStart === "string" ? req.body.periodStart : null;
    const row = rows.find((r) => r.eligible && (!wanted || r.periodStart === wanted));
    if (!row) {
      const done = rows.find((r) => r.applied && (!wanted || r.periodStart === wanted));
      if (done) res.status(409).json({ error: "Garancia za toto obdobie už bola pridaná." });
      else res.status(400).json({ error: "Člen teraz nemá nárok na mesiac zadarmo." });
      return;
    }
    const sub = (await listSubscribers()).find((s) => s.id === id);
    if (!sub) {
      res.status(404).json({ error: "Člen sa nenašiel." });
      return;
    }
    // Mesiac zadarmo nadväzuje na koniec členstva; ak už skončilo, začína dnes.
    const now = new Date();
    const oldEnd = new Date(sub.nextPaymentDue);
    const freeStart = oldEnd.getTime() > now.getTime() ? oldEnd : now;
    const freeUntil = addActiveMonths(freeStart, 1).toISOString();
    const appliedAt = now.toISOString();
    await updateSubscriber(id, {
      ...newPeriodUpdates(sub, freeStart.toISOString(), freeUntil, true),
      guarantees: [...(sub.guarantees ?? []), { periodStart: row.periodStart, periodEnd: row.periodEnd, profit: row.profit, appliedAt, freeUntil }],
      note: `${sub.note ? sub.note + " · " : ""}Garancia (${fmtDaySk(dayKeySk(new Date(row.periodStart)))} – ${fmtDaySk(dayKeySk(new Date(row.periodEnd)))}, ${signed(row.profit, 1)} j.): mesiac zadarmo`,
    });
    let notified = false;
    if (req.body?.notify === true && sub.telegramChatId) {
      const text =
        `🛡 <b>Garancia TipRadar</b>\n\nTvoje členstvo ${row.tier} skončilo v strate (${signed(row.profit, 1)} j.), preto máš podľa garancie mesiac zadarmo. ` +
        `Platí do <b>${fmtDaySk(dayKeySk(new Date(freeUntil)))}</b>.`;
      notified = await sendMemberMessage(String(sub.telegramChatId), text).catch(() => false);
    }
    res.json({ ok: true, id, freeUntil, notified });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? String(err) });
  } finally {
    guaranteeRunning.delete(id);
  }
});

// ---- Pravidelná kontrola blížiacich sa/vypršaných platieb predplatiteľov ----

async function checkExpiringSubscribers(): Promise<void> {
  // Deň podľa slovenského času. Uložené natrvalo, aby reštart servera (nasadenie,
  // prebudenie na Renderi) neposlal pripomienky znova v ten istý deň.
  const today = dayKeySk(new Date());
  try {
    if ((await getMeta("lastExpiryCheckDate")) === today) return;
  } catch {
    return; // bez prístupu k úložisku radšej nič neposielať (hrozili by duplicity)
  }

  try {
    const subs = await listSubscribers();
    const withDaysLeft = subs.map((s) => ({
      ...s,
      daysLeft: Math.ceil((new Date(s.nextPaymentDue).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    }));

    // Len členstvá, ktoré končia do 3 dní alebo skončili najviac pred 3 dňami (staré skončené už neotravujú).
    const expiring = withDaysLeft.filter((s) => s.daysLeft <= 3 && s.daysLeft >= -3);
    if (expiring.length > 0) {
      await notifyAdminExpiringSubscribers(expiring.map((s) => ({ name: s.name, tier: s.tier, length: s.length, daysLeft: s.daysLeft })));
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

    await setMeta("lastExpiryCheckDate", today);
  } catch (err) {
    console.error("Kontrola vypršania predplatných zlyhala:", err);
  }
}

setInterval(checkExpiringSubscribers, 6 * 60 * 60 * 1000); // kontrola každých 6 hodín
checkExpiringSubscribers(); // aj hneď po štarte appky

app.listen(PORT, () => {
  console.log(`TipRadar beží na porte ${PORT}`);
  void refreshTelegramWebhookSecret(telegramWebhookSecret());
});
