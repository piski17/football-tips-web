import { recordLead, listLeads, updateLead, Lead } from "./leadsStore";
import { addSubscriber, listSubscribers, updateSubscriber } from "./subscribersStore";
import { paymentsEnabled, savePayment, getPayment, confirmBankPayment, cancelPayment, paidUntil, PAY_TERMS, PUBLIC_URL, Payment, Term, SellableTerm, SELLABLE_TERMS, termLabel, tierName, isTerm, memberBank, memberBankMax, memberSaving, MEMBER_STAKE_PCT } from "./payments";
import axios from "axios";
import { sendAdminEmail } from "./mailer";
import { newPeriodUpdates } from "./guarantee";
import { SavedTip } from "./types";
import { MIN_ODDS } from "./oddsMatcher";
import { STRICT_CHECK_ON } from "./predictor";

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

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
// Súkromný (členský) kanál TipRadar pre všetkých členov – Štart, Gold aj Platinum
// (starší názov premennej TELEGRAM_CHAT_ID_PREMIUM stále funguje).
const TELEGRAM_CHAT_ID_PREMIUM = process.env.TELEGRAM_CHAT_ID_PLATINUM || process.env.TELEGRAM_CHAT_ID_PREMIUM;
const TELEGRAM_CHAT_ID_VIP = process.env.TELEGRAM_CHAT_ID_VIP;
// VIP chat (skupina pre všetkých členov). Bot v nej musí byť administrátor s právom pozývať.
const TELEGRAM_CHAT_ID_VIPCHAT = process.env.TELEGRAM_CHAT_ID_VIPCHAT;
// Bezplatný kanál: TELEGRAM_CHAT_ID_FREE (napr. -100… alebo @nazovkanala). Ak chýba a kanál je verejný,
// použije sa názov z TELEGRAM_FREE_CHANNEL_URL (https://t.me/nazovkanala → @nazovkanala).
const TELEGRAM_CHAT_ID_FREE = process.env.TELEGRAM_CHAT_ID_FREE || freeChatFromUrl(process.env.TELEGRAM_FREE_CHANNEL_URL);

/**
 * Odkaz na kanál v akomkoľvek tvare z Renderu („https://t.me/tipradar“, „t.me/tipradar“, „@tipradar“, „tipradar“)
 * → „https://t.me/tipradar“. Inak undefined.
 */
export function normalizeTelegramUrl(raw?: string): string | undefined {
  const v = (raw || "").trim().replace(/^["']|["']$/g, "");
  const m = /^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(.+?)\/?$/i.exec(v) || /^@?([A-Za-z][A-Za-z0-9_]{3,})$/.exec(v);
  if (!m) return undefined;
  return "https://t.me/" + m[1];
}

function freeChatFromUrl(url?: string): string | undefined {
  const m = /^https?:\/\/(?:www\.)?t\.me\/([A-Za-z][A-Za-z0-9_]{3,})\/?$/.exec(normalizeTelegramUrl(url) || "");
  if (!m || /bot$/i.test(m[1])) return undefined;
  return "@" + m[1];
}

import { translateTeamName } from "./teamNamesSk";
export { translateTeamName };


/** Preloží mená tímov vložené priamo vo vete (napr. "Dvojšanca: Liechtenstein alebo remíza") - len na zobrazenie. */
export function translateNamesInText(text: string | undefined, homeOriginal: string, awayOriginal: string): string {
  if (!text) return "";
  let result = text;
  const homeSk = translateTeamName(homeOriginal);
  const awaySk = translateTeamName(awayOriginal);
  if (homeSk !== homeOriginal) result = result.split(homeOriginal).join(homeSk);
  if (awaySk !== awayOriginal) result = result.split(awayOriginal).join(awaySk);
  // "Over 2.5" / "Under 2.5" -> "Nad 2,5" / "Pod 2,5" (len na zobrazenie,
  // uložené dáta ostávajú bez zmeny kvôli vyhodnocovaniu).
  result = result.replace(/\bOver (\d+(?:\.\d+)?)/g, (_m, n) => "Nad " + n.replace(".", ","));
  result = result.replace(/\bUnder (\d+(?:\.\d+)?)/g, (_m, n) => "Pod " + n.replace(".", ","));
  // Desatinné čísla po slovensky (1.8 -> 1,8) - vysvetlenia tipov a varovania.
  result = result.replace(/(\d)\.(\d)/g, "$1,$2");
  return result;
}

export type TelegramTarget = "premium" | "vip" | "both" | "free";

/** Je to správa v bezplatnom kanáli? (aj pre tipy poslané skôr, než sa začal ukladať príznak sentFree) */
export function isFreeChat(chatId: string | number): boolean {
  return !!TELEGRAM_CHAT_ID_FREE && String(chatId) === String(TELEGRAM_CHAT_ID_FREE);
}

/** Súkromný členský kanál (alebo starý VIP kanál) – tipy poslané sem sa rátajú členom do členstva (aj do garancie). */
export function isMemberChannel(chatId: string | number): boolean {
  const id = String(chatId);
  return (!!TELEGRAM_CHAT_ID_PREMIUM && id === String(TELEGRAM_CHAT_ID_PREMIUM)) || (!!TELEGRAM_CHAT_ID_VIP && id === String(TELEGRAM_CHAT_ID_VIP));
}
export function memberChannelConfigured(): boolean {
  return !!(TELEGRAM_CHAT_ID_PREMIUM || TELEGRAM_CHAT_ID_VIP);
}

export function isTelegramEnabled(): boolean {
  return Boolean(TELEGRAM_BOT_TOKEN && (TELEGRAM_CHAT_ID_PREMIUM || TELEGRAM_CHAT_ID_VIP || TELEGRAM_CHAT_ID_FREE));
}

/** Ktoré kanály sú reálne nastavené (na zobrazenie voľby vo formulári). */
export function availableTelegramTargets(): ("premium" | "vip" | "free")[] {
  const targets: ("premium" | "vip" | "free")[] = [];
  if (TELEGRAM_CHAT_ID_PREMIUM) targets.push("premium");
  if (TELEGRAM_CHAT_ID_VIP) targets.push("vip");
  if (TELEGRAM_CHAT_ID_FREE) targets.push("free");
  return targets;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Rovnaká logika ako v bankroll simulátore - vyššia dôvera = vyššia odporúčaná sadzba. */
function stakeTierPercent(probability: number): number {
  if (probability >= 70) return 3;
  if (probability >= 60) return 2;
  return 1;
}

function impliedOdds(probability: number): string {
  return probability > 0 ? (100 / probability).toFixed(2) : "-";
}

/** vip = správa ide do VIP kanála – len tam má silný tip dňa hviezdičku. strong = tip je silný tip dňa (určuje server). */
function buildMessageText(tip: SavedTip, headerOverride?: string, vip = false, strong = false): string {
  const odds = impliedOdds(tip.probability);
  const stakePct = stakeTierPercent(tip.probability);
  // Skutočný kurz stávkoviek (ak bol pri uložení k dispozícii), inak odhad z modelu.
  const hasRealOdds = typeof tip.odds === "number" && tip.odds > 1;
  const oddsLine = hasRealOdds
    ? `💰 Kurz: <b>${fmtNum(tip.odds!, 2)}</b>\n`
    : `💰 Odhadovaný kurz: <b>~${String(odds).replace(".", ",")}</b>\n`;
  const oddsNote = hasRealOdds
    ? `<i>ℹ️ Priemerný kurz stávkových kancelárií v čase odoslania – vo vašej stávkovke sa môže mierne líšiť.</i>`
    : `<i>ℹ️ Odhad na základe modelu, nie garantovaný kurz stávkovej kancelárie.</i>`;

  if (tip.legs && tip.legs.length > 0) {
    const legsText = tip.legs
      .map(
        (leg) =>
          `⚽ ${escapeHtml(translateTeamName(leg.homeTeam))} – ${escapeHtml(translateTeamName(leg.awayTeam))}\n   ${escapeHtml(leg.market)}: <b>${escapeHtml(
            translateNamesInText(leg.selection, leg.homeTeam, leg.awayTeam)
          )}</b> (${leg.probability.toFixed(0)} %)`
      )
      .join("\n\n");

    return (
      `${headerOverride ?? `🎫 <b>Nový tiket</b>`} (${plural(tip.legs.length, "tip", "tipy", "tipov")})\n\n${legsText}\n\n` +
      `📈 Kombinovaná pravdepodobnosť: <b>${fmtNum(tip.probability, 1)} %</b>\n` +
      oddsLine +
      `💵 Odporúčaná sadzba: <b>${stakePct} % bankrollu</b>\n\n` +
      oddsNote
    );
  }

  return (
    `${headerOverride ?? (vip && strong ? `⭐ <b>SILNÝ TIP DŇA</b>` : `🎯 <b>Nový tip</b>`)}\n\n` +
    `⚽ ${escapeHtml(translateTeamName(tip.homeTeam))} – ${escapeHtml(translateTeamName(tip.awayTeam))}\n` +
    `📊 ${escapeHtml(tip.market)}: <b>${escapeHtml(translateNamesInText(tip.selection, tip.homeTeam, tip.awayTeam))}</b>\n` +
    `📈 Dôvera: <b>${tip.probability.toFixed(0)} %</b>${vip && strong ? " · ⭐ <b>Najsilnejší tip dňa</b>" : ""}\n` +
    oddsLine +
    minOddsLine(tip) +
    `💵 Odporúčaná sadzba: <b>${stakePct} % bankrollu</b>\n\n` +
    oddsNote
  );
}

/**
 * Minimálny kurz pre klienta (31. 10. 2026, Michal): tip ide s kurzom z API bez prepisovania,
 * klient si ho podá len pri kurze aspoň X – vždy aspoň 1,60 a hodnota +5 % (pri zapnutej kontrole 60 / 40 aj pri nej; od 6. 11. 2026 vypnutá).
 */
function minOddsLine(tip: SavedTip): string {
  const need = (p: number | undefined) => (typeof p === "number" && p > 0 ? 1.05 / (p / 100) : 0);
  const min = Math.ceil(Math.max(1.5, need(tip.probability), STRICT_CHECK_ON ? need(tip.strictProbability) : 0) * 100) / 100;
  return `✅ Minimálny kurz, pri ktorom tip odporúčam hrať: <b>${fmtNum(min, 2)}</b>\n`;
}

async function sendToChat(chatId: string, text: string): Promise<number | null> {
  try {
    const res = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      // protect_content: členovia nemôžu tipy preposielať, kopírovať ani ukladať (vo free kanáli môžu – nech sa šíri).
      // link_preview_options: bez veľkého náhľadu stránky pod správou.
      {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        protect_content: chatId !== TELEGRAM_CHAT_ID_FREE,
        link_preview_options: { is_disabled: true },
      },
      { timeout: 10000 }
    );
    const messageId = res.data?.result?.message_id;
    return typeof messageId === "number" ? messageId : null;
  } catch (err: any) {
    console.error("Odoslanie do Telegramu zlyhalo:", err?.response?.data ?? err?.message ?? err);
    return null;
  }
}

/**
 * Pošle tip (jednotlivý alebo tiket) do zvoleného Telegram kanálu/kanálov
 * ("premium", "vip", alebo "both" - obidva naraz). Vráti zoznam presne
 * odoslaných správ (kanál + ID správy) na prípadné neskoršie zmazanie.
 */
function resolveChatIds(target: TelegramTarget): string[] {
  const chatIds: string[] = [];
  if ((target === "premium" || target === "both") && TELEGRAM_CHAT_ID_PREMIUM) chatIds.push(TELEGRAM_CHAT_ID_PREMIUM);
  if ((target === "vip" || target === "both") && TELEGRAM_CHAT_ID_VIP) chatIds.push(TELEGRAM_CHAT_ID_VIP);
  if (target === "free" && TELEGRAM_CHAT_ID_FREE) chatIds.push(TELEGRAM_CHAT_ID_FREE);
  return chatIds;
}

export async function sendTipToTelegram(
  tip: SavedTip,
  target: TelegramTarget,
  headerOverride?: string,
  strong = false,
  freeSeatsLine?: string
): Promise<{ chatId: string; messageId: number }[]> {
  const chatIds = resolveChatIds(target);
  if (chatIds.length === 0) return [];

  const sent: { chatId: string; messageId: number }[] = [];

  for (const chatId of chatIds) {
    let text = buildMessageText(tip, headerOverride, chatId === TELEGRAM_CHAT_ID_VIP, strong);
    if (chatId === TELEGRAM_CHAT_ID_FREE) {
      text += `\n\n${freeSeatsLine ? freeSeatsLine + "\n" : ""}👉 Členstvo: <a href="https://tipradar.eu/clenstvo?utm_source=telegram">tipradar.eu</a>`;
    }
    const messageId = await sendToChat(chatId, text);
    if (messageId) sent.push({ chatId, messageId });
  }

  return sent;
}

/** Pošle vlastný text (nie tip) do zvoleného kanála/kanálov - používa sa napr. pre "Dnes bez tipu" alebo týždenný report. */
/** Postaví a pošle správu s výsledkom už vyhodnoteného tipu/tiketu (víťazstvo/prehra), so zeleným/červeným zvýraznením. */
export async function sendTipResultToTelegram(
  tip: SavedTip,
  target: TelegramTarget
): Promise<{ chatId: string; messageId: number }[]> {
  const chatIds = resolveChatIds(target);
  if (chatIds.length === 0) return [];

  let text: string;

  if (tip.legs && tip.legs.length > 0) {
    const header = tip.status === "won" ? "✅ <b>VÝHRA TIKETU</b>" : "❌ <b>PREHRA TIKETU</b>";
    const legsText = tip.legs
      .map((leg) => {
        const icon = leg.status === "won" ? "✅" : leg.status === "lost" ? "❌" : "➖";
        return `${icon} ${escapeHtml(translateTeamName(leg.homeTeam))} – ${escapeHtml(translateTeamName(leg.awayTeam))}: ${escapeHtml(
          leg.market
        )}: ${escapeHtml(translateNamesInText(leg.selection, leg.homeTeam, leg.awayTeam))}`;
      })
      .join("\n");
    text = `${header} (${plural(tip.legs.length, "tip", "tipy", "tipov")})\n\n${legsText}`;
  } else {
    const header = tip.status === "won" ? "✅ <b>VÝHRA</b>" : "❌ <b>PREHRA</b>";
    text =
      `${header}\n\n` +
      `⚽ ${escapeHtml(translateTeamName(tip.homeTeam))} – ${escapeHtml(translateTeamName(tip.awayTeam))}\n` +
      `📊 ${escapeHtml(tip.market)}: <b>${escapeHtml(translateNamesInText(tip.selection, tip.homeTeam, tip.awayTeam))}</b>`;
  }

  const sent: { chatId: string; messageId: number }[] = [];
  for (const chatId of chatIds) {
    const messageId = await sendToChat(chatId, text);
    if (messageId) sent.push({ chatId, messageId });
  }
  return sent;
}

/** Je nastavený bezplatný kanál? */
export function freeChannelConfigured(): boolean {
  return Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID_FREE);
}

/** Bilancia v bezplatnom kanáli od začiatku zverejňovania (1 tip = vklad 1 jednotka). */
export interface FreeBalance {
  won: number;
  lost: number;
  units: number;
  from: string; // YYYY-MM-DD
}

function dayShort(day: string): string {
  const [, m, d] = day.split("-").map((n) => parseInt(n, 10));
  return `${d}. ${m}.`;
}

/** Zisk tipu v jednotkách pri vklade 1 j. (výhra = kurz − 1, prehra = −1, vrátený = 0). */
export function tipUnits(tip: SavedTip): number {
  if (tip.status === "won") return typeof tip.odds === "number" && tip.odds > 1 ? tip.odds - 1 : 0;
  if (tip.status === "lost") return -1;
  return 0;
}

function freeBalanceLine(b: FreeBalance): string {
  return `📈 Bilancia od ${dayShort(b.from)}: <b>${b.won} ✅ · ${b.lost} ❌ · ${signed(b.units, 2)} j.</b>`;
}

const FREE_FOOTER =
  `📊 Všetky výsledky: <a href="https://tipradar.eu/vysledky?utm_source=telegram">tipradar.eu/vysledky</a>\n` +
  `◆ Tipy pred zápasom dostávajú členovia: <a href="https://tipradar.eu/clenstvo?utm_source=telegram">tipradar.eu/clenstvo</a>`;

/**
 * Výsledok tipu do bezplatného kanála (1. 11. 2026, Michal: „budú tam všetky výsledky od dnes“).
 * Po zápase – výhra aj prehra, s kurzom, skóre a priebežnou bilanciou v jednotkách.
 */
export async function sendFreeResult(tip: SavedTip, balance: FreeBalance): Promise<{ chatId: string; messageId: number }[]> {
  if (!freeChannelConfigured()) return [];
  const units = tipUnits(tip);
  const head =
    tip.status === "won"
      ? `✅ <b>VÝHRA</b> · ${signed(units, 2)} j.`
      : tip.status === "lost"
        ? `❌ <b>PREHRA</b> · −1 j.`
        : `↩️ <b>VRÁTENÉ</b> · 0 j.`;
  const oddsTxt = typeof tip.odds === "number" && tip.odds > 1 ? `💰 Kurz <b>${fmtNum(tip.odds, 2)}</b> · dôvera modelu ${tip.probability.toFixed(0)} %` : `📈 Dôvera modelu ${tip.probability.toFixed(0)} %`;
  let body: string;
  if (tip.legs && tip.legs.length > 0) {
    const icon = (s: string) => (s === "won" ? "✅" : s === "lost" ? "❌" : "➖");
    body =
      `🎫 Tiket (${plural(tip.legs.length, "zápas", "zápasy", "zápasov")})\n` +
      tip.legs
        .map(
          (l) =>
            `${icon(l.status)} ${escapeHtml(translateTeamName(l.homeTeam))} – ${escapeHtml(translateTeamName(l.awayTeam))}` +
            (typeof l.actualHomeGoals === "number" && typeof l.actualAwayGoals === "number" ? ` · ${l.actualHomeGoals}:${l.actualAwayGoals}` : "") +
            `\n    ${escapeHtml(l.market)}: ${escapeHtml(translateNamesInText(l.selection, l.homeTeam, l.awayTeam))}`
        )
        .join("\n");
  } else {
    const score =
      typeof tip.actualHomeGoals === "number" && typeof tip.actualAwayGoals === "number" ? ` · <b>${tip.actualHomeGoals}:${tip.actualAwayGoals}</b>` : "";
    body =
      `⚽ ${escapeHtml(translateTeamName(tip.homeTeam))} – ${escapeHtml(translateTeamName(tip.awayTeam))}${score}\n` +
      (tip.leagueName ? `🏆 ${escapeHtml(tip.leagueName)}\n` : "") +
      `📊 ${escapeHtml(tip.market)}: <b>${escapeHtml(translateNamesInText(tip.selection, tip.homeTeam, tip.awayTeam))}</b>`;
  }
  const text = `${head}\n\n${body}\n${oddsTxt}\n\n${freeBalanceLine(balance)}\n\n${FREE_FOOTER}`;
  const messageId = await sendToChat(TELEGRAM_CHAT_ID_FREE!, text);
  return messageId ? [{ chatId: TELEGRAM_CHAT_ID_FREE!, messageId }] : [];
}

/** Vyhodnotenie celého dňa do bezplatného kanála – keď sú všetky tipy dňa dohrané. */
export async function sendFreeDaySummary(tips: SavedTip[], day: string, balance: FreeBalance): Promise<boolean> {
  if (!freeChannelConfigured()) return false;
  const text = buildDailyResultsText(tips, day)
    .replace(/ \(\d+ %\)\n/, "\n") // bez percent – na webe aj tu len počty a jednotky
    .replace(
    /\n<i>Poctivá história – vrátane prehratých tipov\.<\/i>$/,
    `${freeBalanceLine(balance)}\n\n<i>Poctivá história – vrátane prehratých tipov.</i>\n\n${FREE_FOOTER}`
  );
  return (await sendToChat(TELEGRAM_CHAT_ID_FREE!, text)) !== null;
}

export async function sendCustomMessage(
  text: string,
  target: TelegramTarget
): Promise<{ chatId: string; messageId: number }[]> {
  const chatIds = resolveChatIds(target);
  const sent: { chatId: string; messageId: number }[] = [];
  for (const chatId of chatIds) {
    const messageId = await sendToChat(chatId, text);
    if (messageId) sent.push({ chatId, messageId });
  }
  return sent;
}

/** Zmaže presne dané správy (každú v jej vlastnom kanáli) - napr. keď sa tip zmaže aj z histórie. */
export async function deleteTelegramMessages(messages: { chatId: string; messageId: number }[]): Promise<void> {
  for (const { chatId, messageId } of messages) {
    try {
      await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`,
        { chat_id: chatId, message_id: messageId },
        { timeout: 10000 }
      );
    } catch (err: any) {
      console.error("Zmazanie správy z Telegramu zlyhalo:", err?.response?.data ?? err?.message ?? err);
    }
  }
}

// ---- Automatický FAQ asistent (odpovedá, keď niekto napíše botovi súkromne) ----

const TELEGRAM_CONTACT_USERNAME = process.env.TELEGRAM_CONTACT_USERNAME || "im_mishko";

// ---- Členstvo TipRadar (od 31. 10. 2026 večer) – rovnaké texty ako na tipradar.eu ----
// Posuvník 50 – 250 tipov po 50, každý počet má vlastný názov a výhody (každé vyššie má všetko z nižšieho):
// Od 8. 11. 2026 23:15 (Michal): Štart 30 tipov 29 € (bez vernostnej zľavy), VIP 100 tipov 89 €.
// Od 4. 11. 2026 večer len 2: Štart 75 tipov 65 €, VIP 150 tipov 110 € (obe úvodný hovor 1 na 1, VIP navyše mentoring).
// Predtým (1. 11. 2026) 3: Štart 50 tipov 39 €, Premium 100 tipov 75 €, VIP 150 tipov 110 € (Premium a VIP úvodný hovor 1 na 1, VIP od 2. 11. aj mentoring 1 na 1 počas celého členstva). Gold a Platinum zrušené.
// Bez časovej platnosti, počet tipov denne sa neuvádza. Garancia: prvých 20 tipov bez rizika (inak peniaze späť) a členstvo v mínuse = 1 mesiac zadarmo.
const BENEFITS_BASE =
  `• <b>Denné tipy na Telegrame</b> v súkromnom kanáli, 1 – 2 hodiny pred výkopom – len tipy, ktoré prejdú všetkými pravidlami modelu (najviac 3 naraz, v slabý deň radšej žiadny)\n` +
  `• <b>Pri každom tipe</b> kurz, šanca podľa modelu, dôvod a odporúčaná sadzba\n` +
  `• <b>Súkromný chat členov</b>`;
/** Výhody navyše podľa členstva (od koľkých tipov platia). Rovnaké sú na webe (landing/index.html, #feats – zdroj zip nocny-zapas/zdroj). */
const TIER_PERKS: { min: number; max?: number; text: string }[] = [
  // 4. 11. 2026 (Michal): kurz Škola stávkovania do členstiev NEDÁVAŤ – je to samostatný produkt.
  // 11. 11. 2026 (Michal): jediné členstvo VIP Klub (100 tipov 75 €) má všetky výhody; vernostná zľava zrušená („hlúposť“).
  { min: 1, text: `📞 <b>Úvodný hovor 1 na 1</b> (30 min) – bank a vklad nastavíme presne pre vás` },
  { min: 1, text: `🎓 <b>Mentoring 1 na 1 počas celého členstva</b> – kedykoľvek sa ma opýtate na bank, vklad či konkrétny tip` },
  { min: 1, text: `⏳ <b>Tipy nevypršia</b> – platia, kým ich nedostanete, bez časového limitu` },
];
function perksFor(tips: number): string {
  return TIER_PERKS.filter((p) => tips >= p.min && (p.max == null || tips <= p.max)).map((p) => `• ${p.text}`).join("\n");
}
/** Garancia (od 2. 11. 2026): členstvo v mínuse = 1 mesiac zadarmo (vracanie peňazí po 20 tipoch zrušené). */
const GUARANTEE_LINE = `🛡 <b>Garancia:</b> ak vaše členstvo skončí v mínuse, dostanete 1 mesiac tipov zadarmo.`;
const eur2 = (n: number) => n.toFixed(2).replace(".", ",");
const TIER_ICON: Record<SellableTerm, string> = { p100: "⭐" };
/** Riadok cenníka: „⭐ VIP Klub · 100 tipov – 75 € (0,75 € za tip)“. */
function priceLine(t: SellableTerm): string {
  // 11. 11. 2026 (Michal): členstvo na mieru – dĺžku si s každým členom nastavíme osobne, od 50 tipov, 0,98 € za tip (12. 11.: 50 tipov za 49 €).
  return `${TIER_ICON[t]} VIP Klub · na mieru, od 50 tipov – 50 tipov 49 €, pri väčšom odbere zľava (100 tipov 95 €, 200 tipov 180 €)`;
}
/** Text zvoleného členstva (cena, odporúčaný bank a vklad, čo dostane). */
function planText(t: SellableTerm): string {
  const bank = memberBank(t), bankMax = memberBankMax(t);
  const sk = (n: number) => n.toLocaleString("sk-SK").replace(/\s/g, " ");
  const stake = (bank * MEMBER_STAKE_PCT) / 100, stakeMax = (bankMax * MEMBER_STAKE_PCT) / 100;
  const perks = perksFor(PAY_TERMS[t].tips || 30);
  return `<b>${priceLine(t)}</b>\n<i>Odporúčaný bank ${sk(bank)} – ${sk(bankMax)} € · vklad ${MEMBER_STAKE_PCT} % = ${eur2(stake)} – ${eur2(stakeMax)} € na tip</i>\n${BENEFITS_BASE}` + (perks ? `\n${perks}` : "");
}
// ---- Bot pre ľudí (od 12. 11. 2026, Michal): žiadne dlhé texty ani cenník v bote, len odkazy na web ----
// Ľudia vraveli, že v bote sú zbytočnosti. Bot preto pošle jednu krátku správu s odkazmi na web,
// kanál zadarmo a Michalov osobný Telegram. Všetko ostatné (tipy do kanálov, výsledky, upozornenia,
// pozvánky po platbe) robí bot ďalej na pozadí.
const LANDING_URL = "https://tipradar.eu";
const CONTACT_URL = `https://t.me/${TELEGRAM_CONTACT_USERNAME}`;
const WELCOME_TEXT =
  `👋 Ahoj, tu je <b>TipRadar</b> – futbalové tipy podložené štatistikou.\n\n` +
  `Všetko podstatné nájdete na webe. Tipy a výsledky zadarmo posielam do kanála. S otázkou mi pokojne napíšte osobne.`;
function mainMenuKeyboard() {
  const freeUrl = normalizeTelegramUrl(process.env.TELEGRAM_FREE_CHANNEL_URL);
  const rows: { text: string; url: string }[][] = [];
  if (freeUrl) rows.push([{ text: "📢 Tipy zadarmo (Telegram kanál)", url: freeUrl }]);
  rows.push([{ text: "📊 Výsledky tipov", url: `${LANDING_URL}/vysledky` }]);
  rows.push([{ text: "⭐ Členstvo", url: `${LANDING_URL}/clenstvo` }]);
  rows.push([{ text: "❓ Časté otázky", url: `${LANDING_URL}/otazky` }]);
  rows.push([{ text: "✍️ Napísať Michalovi", url: CONTACT_URL }]);
  return { inline_keyboard: rows };
}

async function callTelegramApi(method: string, body: Record<string, unknown>): Promise<void> {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, body, { timeout: 10000 });
  } catch (err: any) {
    console.error(`Telegram API (${method}) zlyhalo:`, err?.response?.data ?? err?.message ?? err);
  }
}

/** Spracuje jednu prichádzajúcu udalosť z Telegram webhooku (nová správa alebo stlačenie tlačidla). */
// ---- Záujemcovia o členstvo z tipradar.eu ----
/** Odkaz z bota (t.me/…?start=…) → členstvo. Web posiela c50 … c250 (posuvník). Staré odkazy: stat / start = Štart, seria = Premium,
 *  vip = VIP, gold = Gold, platinum / onyx / sampion = Platinum. */
// 11. 11. 2026: všetky odkazy (aj staré c30 / c100) vedú na jediné členstvo VIP Klub.
const PLAN_TERM: Record<string, SellableTerm> = Object.fromEntries(["stat", "start", "seria", "vip", "gold", "platinum", "onyx", "sampion", "klub", "c30", "c50", "c75", "c80", "c100", "c120", "c150", "c200", "c250"].map((k) => [k, "p100"])) as Record<string, SellableTerm>;
for (const t of SELLABLE_TERMS) PLAN_TERM["c" + PAY_TERMS[t].tips] = t;
/** Tlačidlá na zaplatenie (vedú na tipradar.eu/zaplatit → stránka s QR kódom). */
function payKeyboard(chatId: number | string, only?: SellableTerm) {
  const row = (t: SellableTerm, label: string) => [{ text: label, url: `${PUBLIC_URL}/zaplatit?term=${t}&c=${chatId}` }];
  const all: [SellableTerm, string][] = SELLABLE_TERMS.map((t) => [t, `${PAY_TERMS[t].name} · ${PAY_TERMS[t].price} € (${tierName(t)})`]);
  return { inline_keyboard: all.filter(([t]) => !only || t === only).map(([t, l]) => row(t, only ? `Zaplatiť ${PAY_TERMS[t].price} €` : l)) };
}
/** Predaj členstva je spustený (premenná SALES_OPEN=true na Renderi). Dovtedy len poradovník. */
function salesOpen(): boolean {
  return process.env.SALES_OPEN === "true";
}

const LEAD_LABEL: Record<string, string> = {
  premium: "členstvo (starý odkaz Premium)",
  clenstvo: "členstvo (zatiaľ nevybral)",
  otazka: "všeobecná otázka",
};
for (const [k, t] of Object.entries(PLAN_TERM)) LEAD_LABEL[k] = `${tierName(t)} ${PAY_TERMS[t].name}` + (/^c\d+$/.test(k) ? "" : " (starý odkaz)");
for (const k of Object.keys(LEAD_LABEL)) if (k !== "otazka") LEAD_LABEL[k + "_waitlist"] = LEAD_LABEL[k];

function escapeTg(v: string): string {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function personName(from: any): string {
  return [from?.first_name, from?.last_name].filter(Boolean).join(" ") || "Neznámy";
}

/** Upozorní ťa (administrátora), že niekto klikol na tlačidlo členstva na webe. */
async function notifyAdminLead(plan: string, from: any, chatId: number): Promise<void> {
  // Zápis do poradovníka príde aj na e-mail (ak je nastavený RESEND_API_KEY a ADMIN_EMAIL).
  await sendAdminEmail(`Nový záujemca o ${LEAD_LABEL[plan] ?? plan} – TipRadar`, [
    ["Členstvo", LEAD_LABEL[plan] ?? plan],
    ["Meno", personName(from)],
    ...(from?.username ? ([["Telegram", "@" + from.username]] as [string, string][]) : []),
    ["Telegram ID", String(chatId)],
    ["Stav", salesOpen() ? "predaj beží" : "poradovník – predaj ešte nebeží"],
  ]);
  const adminId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!adminId || String(adminId) === String(chatId)) return;
  await callTelegramApi("sendMessage", {
    chat_id: adminId,
    text:
      `🔔 <b>Nový záujemca o ${LEAD_LABEL[plan] ?? plan}</b>${salesOpen() ? "" : " (poradovník – predaj ešte nebeží)"}\n\n` +
      `Meno: <b>${escapeTg(personName(from))}</b>\n` +
      (from?.username ? `Telegram: @${escapeTg(from.username)}\n` : "") +
      `Telegram ID: <code>${chatId}</code>\n` +
      `<a href="tg://user?id=${chatId}">Otvoriť chat</a>`,
    parse_mode: "HTML",
  });
}

export async function handleTelegramUpdate(update: any): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;

  // Bota pridali do nového kanála alebo skupiny: pošli adminovi jej názov a ID (na nastavenie na Renderi).
  if (update.my_chat_member) {
    const chat = update.my_chat_member.chat ?? {};
    const status = update.my_chat_member.new_chat_member?.status;
    if (TELEGRAM_ADMIN_CHAT_ID && chat.type !== "private" && (status === "administrator" || status === "member")) {
      const kind = chat.type === "channel" ? "kanála" : "skupiny";
      await callTelegramApi("sendMessage", {
        chat_id: TELEGRAM_ADMIN_CHAT_ID,
        text: `🤖 Bot bol pridaný do ${kind} <b>${escapeTg(chat.title ?? "")}</b>\n\nID: <code>${chat.id}</code>\n\n<i>Toto číslo skopíruj na Render, ak ho tam treba.</i>`,
        parse_mode: "HTML",
      });
    }
    return;
  }

  if (update.callback_query) {
    const chatId = update.callback_query.message?.chat?.id;
    const data = update.callback_query.data;
    const payAction = /^pay(ok|no):([A-Za-z0-9]{8,32})$/.exec(String(data ?? ""));
    if (payAction) {
      await handleAdminPayAction(update.callback_query, payAction[1] as "ok" | "no", payAction[2]);
      return;
    }
    await callTelegramApi("answerCallbackQuery", { callback_query_id: update.callback_query.id });
    // Staré tlačidlá (Cenník, Ako to funguje …) v starších správach: ukážu nové krátke menu s odkazmi.
    if (chatId && update.callback_query.message?.chat?.type === "private") {
      await callTelegramApi("sendMessage", { chat_id: chatId, text: WELCOME_TEXT, parse_mode: "HTML", reply_markup: mainMenuKeyboard() });
    }
    return;
  }

  // Správy od súkromného používateľa (nie z kanálu).
  const chatId = update.message?.chat?.id;
  const chatType = update.message?.chat?.type;
  if (!chatId || chatType !== "private") return;
  const text: string = String(update.message?.text ?? "").trim();
  const from = update.message?.from ?? {};

  // Príchod z tlačidla na tipradar.eu (odkaz t.me/TipRadarAiBot?start=premium / vip / vip_waitlist).
  if (/^\/start paid_[A-Za-z0-9]+$/.test(text)) {
    await redeemPayment(text.slice(12), chatId, from);
    return;
  }
  const startParam = text.startsWith("/start ") ? text.slice(7).trim().toLowerCase() : "";
  // Odkaz na členstvo z webu (t.me/…?start=clenstvo, c50 …): zapíšeme záujemcu a dáme ti vedieť.
  const planKey = startParam.replace(/_waitlist$/, "");
  const plan = PLAN_TERM[planKey];
  if (plan || planKey === "clenstvo" || planKey === "premium") {
    if (paymentsEnabled()) {
      await callTelegramApi("sendMessage", {
        chat_id: chatId,
        text: `⭐ <b>Členstvo TipRadar</b>\n\nVšetko o členstve nájdete na <a href="${LANDING_URL}/clenstvo">tipradar.eu/clenstvo</a>. Zaplatiť môžete tu 👇 Po platbe vám sem pošlem pozvánku do súkromného kanála.`,
        parse_mode: "HTML",
        reply_markup: payKeyboard(chatId, plan),
      });
    } else {
      await callTelegramApi("sendMessage", { chat_id: chatId, text: WELCOME_TEXT, parse_mode: "HTML", reply_markup: mainMenuKeyboard() });
    }
    await recordLead({ chatId: String(chatId), plan: startParam, name: personName(from), username: from?.username }).catch(() => {});
    await notifyAdminLead(startParam, from, chatId);
    return;
  }

  // Bežná textová správa (nie príkaz): pošleme ju tebe, aby sa nestratila, a človeka nasmerujeme na tvoj Telegram.
  if (text && !text.startsWith("/") && TELEGRAM_ADMIN_CHAT_ID && String(chatId) !== String(TELEGRAM_ADMIN_CHAT_ID)) {
    await callTelegramApi("forwardMessage", { chat_id: TELEGRAM_ADMIN_CHAT_ID, from_chat_id: chatId, message_id: update.message.message_id });
    await callTelegramApi("sendMessage", {
      chat_id: TELEGRAM_ADMIN_CHAT_ID,
      text: `✉️ Správa od <b>${escapeTg(personName(from))}</b>${from.username ? ` (@${escapeTg(from.username)})` : ""} · ID <code>${chatId}</code> · <a href="tg://user?id=${chatId}">otvoriť chat</a>`,
      parse_mode: "HTML",
    });
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: `Ďakujem za správu 🙏 Najrýchlejšie vám odpoviem osobne na @${TELEGRAM_CONTACT_USERNAME}.`,
      reply_markup: mainMenuKeyboard(),
    });
    return;
  }

  await callTelegramApi("sendMessage", {
    chat_id: chatId,
    text:
      WELCOME_TEXT +
      // Telegram ID vidí len administrátor (alebo ktokoľvek po príkaze /id).
      (String(chatId) === String(TELEGRAM_ADMIN_CHAT_ID) || text === "/id" ? `\n\n<i>Tvoje Telegram ID: <code>${chatId}</code></i>` : ""),
    parse_mode: "HTML",
    reply_markup: mainMenuKeyboard(),
  });
}

const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

/** Pošle tebe (administrátorovi) súhrn členstiev, ktoré končia alebo práve skončili (staré balíčky: dochádzajú tipy). */
export async function notifyAdminExpiringSubscribers(
  expiring: { name: string; tier: string; length?: string; when: string }[]
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID || expiring.length === 0) return;

  const lines = expiring
    .map((s) => {
      const tierLabel = isTerm(s.length) ? termLabel(s.length).toUpperCase() : s.tier === "group" ? "PLATINUM · 6 MESIACOV" : "GOLD · 50 DNÍ";
      return `• ${s.name} (${tierLabel}) – ${s.when}`;
    })
    .join("\n");

  await callTelegramApi("sendMessage", {
    chat_id: TELEGRAM_ADMIN_CHAT_ID,
    text: `⚠️ <b>Členstvá, ktoré končia</b>\n\n${lines}\n\n<i>Kto nepokračuje, toho po skončení odober z kanála.</i>`,
    parse_mode: "HTML",
  });
}

/** Krátka správa len pre administrátora (napr. automaticky vypnutý trh, 21. 10. 2026). */
export async function notifyAdmin(text: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) return false;
  try {
    await callTelegramApi("sendMessage", { chat_id: TELEGRAM_ADMIN_CHAT_ID, text, parse_mode: "HTML" });
    return true;
  } catch {
    return false;
  }
}

/** Pošle členovi osobnú pripomienku, že mu v balíčku dochádzajú tipy (alebo končí platnosť), s výsledkom balíčka. */
export async function sendPackageLowReminder(
  chatId: string,
  st: { tier: string; left: number | null; total: number | null; validUntil: string; profit: number }
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) return false;
  const head =
    st.left !== null && st.total !== null
      ? `🔔 <b>V členstve ${escapeTg(st.tier)} vám ${st.left === 1 ? "ostáva posledný tip" : `ostávajú ${st.left} ${plural(st.left, "tip", "tipy", "tipov")}`}</b> (z ${st.total})`
      : `🔔 <b>Vaše členstvo TipRadar končí ${fmtDateSk(st.validUntil)}</b>`;
  const text =
    `${head}\n\nZatiaľ je výsledok členstva <b>${signed(st.profit, 1)} j.</b>` +
    (st.profit < 0 ? `\n🛡 Ak skončí v mínuse, dostanete podľa garancie 1 mesiac zadarmo.` : "") +
    (paymentsEnabled()
      ? `\n\nAk chcete pokračovať, vyberte si ďalšie členstvo 👇 Nové tipy sa začnú rátať, až keď sa minú tie súčasné. 🙌`
      : `\n\nAk chcete pokračovať, napíšte nám a pripravíme vám ďalšie členstvo. 🙌`);
  if (paymentsEnabled()) {
    try {
      await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        { chat_id: chatId, text, parse_mode: "HTML", reply_markup: payKeyboard(chatId) },
        { timeout: 10000 }
      );
      return true;
    } catch (err: any) {
      console.error("Pripomienka neodišla:", err?.response?.data ?? err?.message ?? err);
      return false;
    }
  }
  const messageId = await sendToChat(chatId, text);
  return messageId !== null;
}

/** Osobná správa členovi (napr. o mesiaci zadarmo podľa garancie). Bez nastaveného bota vráti false. */
export async function sendMemberMessage(chatId: string, text: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return false;
  return (await sendToChat(chatId, text)) !== null;
}

/** Zaregistruje na Telegram serveri adresu, kam má posielať prichádzajúce správy (spustiť raz po nasadení). */
export async function setTelegramWebhook(webhookUrl: string, secretToken?: string): Promise<void> {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
      url: webhookUrl,
      ...(secretToken ? { secret_token: secretToken } : {}),
    });
  } catch (err: any) {
    const reason = err?.response?.data?.description ?? err?.message ?? String(err);
    throw new Error(reason);
  }
}

/** Text denného vyhodnotenia - všetky tipy a tikety jedného dňa v jednej správe. */
export function buildDailyResultsText(tips: SavedTip[], day: string): string {
  const [y, m, d] = day.split("-").map((n) => parseInt(n, 10));
  const icon = (status: string) => (status === "won" ? "✅" : status === "lost" ? "❌" : status === "void" ? "↩️" : "⏳");
  const oddsTxt = (odds?: number | null) => (typeof odds === "number" && odds > 1 ? ` · kurz ${fmtNum(odds, 2)}` : "");

  const lines: string[] = [];
  for (const t of tips) {
    if (t.legs && t.legs.length > 0) {
      const n = t.legs.length;
      lines.push(`${icon(t.status)} 🎫 <b>Tiket</b> (${n} ${n >= 2 && n <= 4 ? "zápasy" : "zápasov"})${oddsTxt(t.odds)}`);
      for (const leg of t.legs) {
        lines.push(
          `    ${icon(leg.status)} ${escapeHtml(translateTeamName(leg.homeTeam))} – ${escapeHtml(translateTeamName(leg.awayTeam))}: ${escapeHtml(
            leg.market
          )}: ${escapeHtml(translateNamesInText(leg.selection, leg.homeTeam, leg.awayTeam))}`
        );
      }
    } else {
      lines.push(
        `${icon(t.status)} <b>${escapeHtml(translateTeamName(t.homeTeam))} – ${escapeHtml(translateTeamName(t.awayTeam))}</b>\n` +
          `    ${escapeHtml(t.market)}: ${escapeHtml(translateNamesInText(t.selection, t.homeTeam, t.awayTeam))}${oddsTxt(t.odds)}`
      );
    }
  }

  const decided = tips.filter((t) => t.status === "won" || t.status === "lost");
  const won = decided.filter((t) => t.status === "won").length;
  const pending = tips.filter((t) => t.status === "pending").length;
  const withOdds = decided.filter((t) => typeof t.odds === "number" && t.odds > 1);
  const profit = withOdds.reduce((sum, t) => sum + (t.status === "won" ? t.odds! - 1 : -1), 0);

  let summary = "";
  if (decided.length > 0) {
    summary += `Vyšlo: <b>${won} z ${decided.length}</b> (${Math.round((won / decided.length) * 100)} %)\n`;
    if (withOdds.length > 0) {
      summary += `Zisk: <b>${signed(profit, 1)} j.</b>${
        withOdds.length < decided.length ? ` (z ${plural(withOdds.length, "tipu", "tipov", "tipov")} so známym kurzom)` : ""
      }\n`;
    }
  }
  if (pending > 0) summary += `⏳ Ešte sa hrá: ${pending}\n`;

  return (
    `📋 <b>Vyhodnotenie dňa</b> · ${d}. ${m}. ${y}\n\n` +
    lines.join("\n") +
    `\n\n` +
    summary +
    `\n<i>Poctivá história – vrátane prehratých tipov.</i>`
  );
}

/**
 * Pri štarte servera: ak je webhook už nastavený, zaregistruje ho znova s tajným
 * kľúčom (rovnaká adresa). Tak overovanie správ funguje hneď po nasadení
 * bez ručného otvárania /api/telegram/setup-webhook.
 */
export async function refreshTelegramWebhookSecret(secretToken: string | undefined): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !secretToken) return;
  try {
    const info = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`);
    const url: string | undefined = info.data?.result?.url;
    if (url) await setTelegramWebhook(url, secretToken);
  } catch (err: any) {
    console.error("Obnovenie Telegram webhooku zlyhalo:", err?.message ?? err);
  }
}


// ---- Potvrdená platba → pozvánka do kanála a zápis člena ----

/** Jednorazová pozvánka (platí pre 1 človeka, 7 dní). Bot musí byť v kanáli/skupine administrátor s právom pozývať. */
async function createInviteLink(chatId: string | undefined, name: string): Promise<string | null> {
  if (!chatId || !TELEGRAM_BOT_TOKEN) return null;
  try {
    const res = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/createChatInviteLink`,
      { chat_id: chatId, member_limit: 1, expire_date: Math.floor(Date.now() / 1000) + 7 * 24 * 3600, name: name.slice(0, 32) },
      { timeout: 10000 }
    );
    return res.data?.result?.invite_link ?? null;
  } catch (err: any) {
    console.error("Pozvánku sa nepodarilo vytvoriť:", err?.response?.data ?? err?.message ?? err);
    return null;
  }
}

function fmtDateSk(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
}

/**
 * Zaplatené členstvo: pošle členovi pozvánky, zapíše ho medzi predplatiteľov,
 * vyradí ho z poradovníka a upozorní teba. Každá platba sa dá uplatniť len raz.
 */
export async function redeemPayment(token: string, chatId: number | string, from: any = {}): Promise<"ok" | "pending" | "used" | "unknown"> {
  let p: Payment | null = null;
  try { p = await getPayment(token); } catch (err: any) { console.error("Overenie platby zlyhalo:", err?.message ?? err); }
  const say = (text: string, extra: Record<string, unknown> = {}) =>
    callTelegramApi("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...extra });
  if (!p) {
    await say("Túto platbu sa nepodarilo nájsť. Napíšte mi sem, prosím, čo sa stalo, a hneď to vyriešim.");
    return "unknown";
  }
  if (p.status === "cancelled") {
    await say("Táto platba bola zrušená. Ak ste zaplatili, napíšte mi sem, prosím, a hneď to vyriešim.");
    return "unknown";
  }
  if (p.status === "pending") {
    await claimBankPayment(p, chatId, from);
    return "pending";
  }
  if (p.status === "redeemed") {
    if (String(p.redeemedBy) !== String(chatId)) {
      await say("Táto platba už bola použitá na inom účte. Ak je to chyba, napíšte mi sem.");
      return "used";
    }
  }
  const first = p.status === "paid";
  if (first) {
    p.status = "redeemed";
    p.redeemedAt = new Date().toISOString();
    p.redeemedBy = String(chatId);
    await savePayment(p);
  }

  const term = p.term;
  if (!from?.first_name && p.name) from = { first_name: p.name, username: p.username };
  const tg = String(chatId);
  // Ďalšie členstvo: zapíše sa k doterajšiemu členovi (aj keď mu členstvo už skončilo). Ak mu časové členstvo
  // ešte beží, nové nadviaže na jeho koniec; inak začína dňom platby. (Starý balíček tipov: nové obdobie začína
  // dňom platby, tipy idú najprv do balíčka, kým sa nemiňú – počíta server, periodUsage.)
  const current = (await listSubscribers())
    .filter((s) => String(s.telegramChatId) === tg && s.id !== "pay_" + p!.token)
    .sort((a, b) => b.nextPaymentDue.localeCompare(a.nextPaymentDue))[0];
  const paidAt = new Date(p.paidAt ?? Date.now());
  const runningEnd = current && !current.tips && !(isTerm(current.length) && PAY_TERMS[current.length].tips) ? new Date(current.nextPaymentDue) : null;
  const start = runningEnd && runningEnd.getTime() > paidAt.getTime() ? runningEnd : paidAt;
  const until = paidUntil(term, start);
  const tips = PAY_TERMS[term].tips;
  const name = personName(from);
  const channel = await createInviteLink(TELEGRAM_CHAT_ID_PREMIUM, name);
  const chat = await createInviteLink(TELEGRAM_CHAT_ID_VIPCHAT, name); // VIP chat majú všetci členovia
  const buttons = [
    ...(channel ? [[{ text: "◆ Vstúpiť do členského kanála", url: channel }]] : []),
    ...(chat ? [[{ text: "💬 Vstúpiť do chatu členov", url: chat }]] : []),
  ];
  await say(
    `✅ <b>Platba prijatá, vitajte v TipRadare!</b>\n\n` +
      `Členstvo: <b>${termLabel(term)}</b>\n` +
      (tips ? `Tipy sa vám rátajú odo dneška${current ? " (najprv sa minú tie, ktoré vám ostali)" : ""}. Keď vám budú dochádzať, dám vám vedieť.\n` : `Platí do <b>${fmtDateSk(until)}</b>.\n`) +
      `${GUARANTEE_LINE}\n\n` +
      (buttons.length
        ? `Tu je vaša osobná pozvánka${chat ? " do súkromného kanála a do chatu členov" : " do súkromného kanála"} 👇 Platí 7 dní a len pre vás.`
        : `Pozvánku vám pošlem osobne v najbližších hodinách.`),
    buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}
  );
  if (!first) return "ok";

  const how = `Prevodom, VS ${p.vs}`;
  if (current) {
    await updateSubscriber(current.id, {
      ...newPeriodUpdates(current, start.toISOString(), until, false, tips), // nové zaplatené členstvo (garancia platí znova)
      length: term,
      tier: "individual" as const,
      priceEur: PAY_TERMS[term].price,
      note: `${current.note ? current.note + " · " : ""}Nové členstvo ${termLabel(term)} ${fmtDateSk(new Date().toISOString())} (${how})`,
    });
  } else if (!(await listSubscribers()).some((s) => String(s.telegramChatId) === tg && s.nextPaymentDue === until)) {
    await addSubscriber({
      id: "pay_" + p.token,
      name,
      contact: from?.username ? "@" + from.username : undefined,
      telegramChatId: tg,
      tier: "individual",
      priceEur: PAY_TERMS[term].price,
      nextPaymentDue: until,
      periodStart: start.toISOString(),
      length: term,
      ...(tips ? { tips } : {}),
      startDate: new Date().toISOString(),
      note: how,
      createdAt: new Date().toISOString(),
    });
  }
  const lead = (await listLeads().catch(() => [] as Lead[])).find((l) => l.chatId === tg);
  if (lead) await updateLead(tg, { paidAt: new Date().toISOString() }).catch(() => {});

  const missing = !channel ? " ⚠️ Pozvánka do kanála sa nevytvorila – pridaj ho ručne." : !chat ? " ⚠️ Do chatu členov ho pridaj ručne." : "";
  if (TELEGRAM_ADMIN_CHAT_ID) {
    await callTelegramApi("sendMessage", {
      chat_id: TELEGRAM_ADMIN_CHAT_ID,
      text:
        `💶 <b>${current ? "Ďalšie členstvo" : "Nová platba"}: ${termLabel(term)} (${PAY_TERMS[term].price} €)</b>\n\n` +
        `Meno: <b>${escapeTg(name)}</b>\n` +
        (from?.username ? `Telegram: @${escapeTg(from.username)}\n` : "") +
        (p.vs ? `Variabilný symbol: ${p.vs}\n` : "") +
        `\nČlen je zapísaný v appke, tipy sa mu rátajú odo dneška.${missing}`,
      parse_mode: "HTML",
    });
  }
  await sendAdminEmail(`Nová platba – ${termLabel(term)} (${PAY_TERMS[term].price} €)`, [
    ["Meno", name],
    ["Variabilný symbol", p.vs],
    ["Telegram ID", tg],
  ]).catch(() => {});
  return "ok";
}

// ---- Platba prevodom: „Zaplatil som" od člena a potvrdenie od teba ----

/** Člen klikol „Zaplatil som": zapamätáme si jeho Telegram a tebe pošleme správu s tlačidlom Potvrdiť. */
async function claimBankPayment(p: Payment, chatId: number | string, from: any): Promise<void> {
  const first = !p.claimedAt;
  if (p.chatId && String(p.chatId) !== String(chatId) && p.claimedAt) {
    await callTelegramApi("sendMessage", { chat_id: chatId, text: "Táto platba patrí inému účtu. Ak je to chyba, napíšte mi sem, prosím." });
    return;
  }
  p.chatId = String(chatId);
  if (from?.first_name) p.name = personName(from);
  if (from?.username) p.username = from.username;
  p.claimedAt = p.claimedAt ?? new Date().toISOString();
  await savePayment(p);
  await callTelegramApi("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      `🙏 <b>Ďakujem!</b>\n\nHneď ako platba <b>${PAY_TERMS[p.term].price} €</b> (variabilný symbol ${p.vs}) príde na účet, pošlem vám sem osobnú pozvánku do súkromného kanála TipRadar.\n\n` +
      `Okamžitá platba zvyčajne príde do pár minút, bežný prevod do jedného pracovného dňa.`,
  });
  if (first && TELEGRAM_ADMIN_CHAT_ID) {
    const name = p.name || personName(from);
    await callTelegramApi("sendMessage", {
      chat_id: TELEGRAM_ADMIN_CHAT_ID,
      parse_mode: "HTML",
      text:
        `🏦 <b>Čaká na potvrdenie: ${termLabel(p.term)} (${PAY_TERMS[p.term].price} €)</b>\n\n` +
        `Meno: <b>${escapeTg(name)}</b>\n` +
        (p.username ? `Telegram: @${escapeTg(p.username)}\n` : "") +
        `Variabilný symbol: <b>${p.vs}</b>\n\n` +
        `Keď platbu uvidíš na účte, klikni na <b>Potvrdiť</b> a bot mu pošle pozvánku.`,
      reply_markup: { inline_keyboard: [[{ text: "✅ Potvrdiť platbu", callback_data: `payok:${p.token}` }, { text: "✖ Zrušiť", callback_data: `payno:${p.token}` }]] },
    });
  }
}

/**
 * Potvrdenie platby prevodom (z appky alebo z Telegramu). Ak poznáme Telegram člena, hneď mu pošle pozvánku
 * a zapíše ho medzi predplatiteľov. Inak sa to stane, keď na stránke platby klikne „Zaplatil som".
 */
export async function confirmBankPaymentAndInvite(token: string): Promise<{ status: Payment["status"]; invited: boolean } | null> {
  const p = await confirmBankPayment(token);
  if (!p) return null;
  if (p.status === "paid" && p.chatId) {
    const r = await redeemPayment(token, p.chatId, p.name ? { first_name: p.name, username: p.username } : {});
    return { status: r === "ok" ? "redeemed" : p.status, invited: r === "ok" };
  }
  return { status: p.status, invited: false };
}

/** Tlačidlá Potvrdiť / Zrušiť v tvojej správe od bota. Funguje len v tvojom (admin) chate. */
async function handleAdminPayAction(cq: any, action: "ok" | "no", token: string): Promise<void> {
  const chatId = cq.message?.chat?.id;
  const answer = (text: string) => callTelegramApi("answerCallbackQuery", { callback_query_id: cq.id, text });
  if (!TELEGRAM_ADMIN_CHAT_ID || String(chatId) !== String(TELEGRAM_ADMIN_CHAT_ID)) {
    await answer("Toto tlačidlo môže použiť len administrátor.");
    return;
  }
  const before = await getPayment(token);
  if (!before) {
    await answer("Platba sa nenašla.");
    return;
  }
  let note: string;
  if (action === "no") {
    if (before.status !== "pending") {
      await answer("Platba už bola potvrdená, zrušiť sa nedá.");
      return;
    }
    await cancelPayment(token);
    note = "✖ Zrušené";
  } else {
    if (before.status === "redeemed") {
      await answer("Táto platba už bola potvrdená.");
      return;
    }
    const r = await confirmBankPaymentAndInvite(token);
    note = r?.invited ? "✅ Potvrdené, pozvánka odoslaná" : "✅ Potvrdené – pozvánku dostane, keď klikne „Zaplatil som“";
  }
  await answer(note);
  if (cq.message?.message_id) {
    await callTelegramApi("editMessageText", {
      chat_id: chatId,
      message_id: cq.message.message_id,
      parse_mode: "HTML",
      text: `${escapeTg(String(cq.message.text ?? ""))}\n\n<b>${note}</b>`,
    });
  }
}

/**
 * „Otvoriť predaj": každému z poradovníka (cez Telegram, ešte nie je členom, správu ešte nedostal)
 * pošle bot jednu správu s tlačidlami na zaplatenie. Vráti počty.
 */
export async function sendSalesOpenToWaitlist(): Promise<{ sent: number; skipped: number; failed: number }> {
  const leads = await listLeads();
  const now = Date.now();
  const members = new Set(
    (await listSubscribers()).filter((s) => new Date(s.nextPaymentDue).getTime() >= now).map((s) => String(s.telegramChatId || "")).filter(Boolean)
  );
  let sent = 0, skipped = 0, failed = 0;
  for (const l of leads) {
    if (l.email || l.source === "web" || l.plan === "otazka" || l.salesMsgAt || l.paidAt || members.has(String(l.chatId)) || !/^\d+$/.test(l.chatId)) {
      skipped++;
      continue;
    }
    const first = escapeTg((l.name || "").split(" ")[0] || "");
    const text =
      `Dobrý deň${first ? ", " + first : ""} 👋\n\n` +
      `Zapísali ste sa do poradovníka <b>TipRadaru</b>. Predaj členstva je práve otvorený a máte prednosť.\n\n` +
      `${planText("p100")}\n\n` +
      `${GUARANTEE_LINE}\n\nZaplatiť môžete tu 👇`;
    try {
      await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        { chat_id: l.chatId, text, parse_mode: "HTML", reply_markup: payKeyboard(l.chatId) },
        { timeout: 10000 }
      );
      await updateLead(l.chatId, { salesMsgAt: new Date().toISOString() });
      sent++;
    } catch (err: any) {
      console.error("Správa pre poradovník neodišla:", l.chatId, err?.response?.data ?? err?.message ?? err);
      failed++;
    }
    await new Promise((r) => setTimeout(r, 60)); // Telegram limit ~30 správ za sekundu
  }
  return { sent, skipped, failed };
}
