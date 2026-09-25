import axios from "axios";
import { SavedTip } from "./types";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID_PREMIUM = process.env.TELEGRAM_CHAT_ID_PREMIUM;
const TELEGRAM_CHAT_ID_VIP = process.env.TELEGRAM_CHAT_ID_VIP;

// ---- Preklad názvov reprezentácií do slovenčiny (kluby zostávajú v pôvodnom tvare) ----
const COUNTRY_NAME_SK: Record<string, string> = {
  Albania: "Albánsko",
  Andorra: "Andorra",
  Armenia: "Arménsko",
  Austria: "Rakúsko",
  Azerbaijan: "Azerbajdžan",
  Belarus: "Bielorusko",
  Belgium: "Belgicko",
  "Bosnia and Herzegovina": "Bosna a Hercegovina",
  Bulgaria: "Bulharsko",
  Croatia: "Chorvátsko",
  Cyprus: "Cyprus",
  "Czech Republic": "Česko",
  Denmark: "Dánsko",
  England: "Anglicko",
  Estonia: "Estónsko",
  "Faroe Islands": "Faerské ostrovy",
  Finland: "Fínsko",
  France: "Francúzsko",
  Georgia: "Gruzínsko",
  Germany: "Nemecko",
  Gibraltar: "Gibraltár",
  Greece: "Grécko",
  Hungary: "Maďarsko",
  Iceland: "Island",
  Israel: "Izrael",
  Italy: "Taliansko",
  Kazakhstan: "Kazachstan",
  Kosovo: "Kosovo",
  Latvia: "Lotyšsko",
  Liechtenstein: "Lichtenštajnsko",
  Lithuania: "Litva",
  Luxembourg: "Luxembursko",
  Malta: "Malta",
  Moldova: "Moldavsko",
  Montenegro: "Čierna Hora",
  Netherlands: "Holandsko",
  "North Macedonia": "Severné Macedónsko",
  "Northern Ireland": "Severné Írsko",
  Norway: "Nórsko",
  Poland: "Poľsko",
  Portugal: "Portugalsko",
  "Republic of Ireland": "Írsko",
  Romania: "Rumunsko",
  Russia: "Rusko",
  "San Marino": "San Maríno",
  Scotland: "Škótsko",
  Serbia: "Srbsko",
  Slovakia: "Slovensko",
  Slovenia: "Slovinsko",
  Spain: "Španielsko",
  Sweden: "Švédsko",
  Switzerland: "Švajčiarsko",
  Turkey: "Turecko",
  Ukraine: "Ukrajina",
  Wales: "Wales",
  // Alternatívne názvy z API a reprezentácie mimo Európy
  Czechia: "Česko",
  "FYR Macedonia": "Severné Macedónsko",
  Macedonia: "Severné Macedónsko",
  "Türkiye": "Turecko",
  Turkiye: "Turecko",
  "Bosnia & Herzegovina": "Bosna a Hercegovina",
  Ireland: "Írsko",
  Holland: "Holandsko",
  Kyrgyzstan: "Kirgizsko",
  Argentina: "Argentína",
  Brazil: "Brazília",
  Uruguay: "Uruguaj",
  Colombia: "Kolumbia",
  Chile: "Čile",
  Paraguay: "Paraguaj",
  Peru: "Peru",
  Ecuador: "Ekvádor",
  Bolivia: "Bolívia",
  Venezuela: "Venezuela",
  USA: "USA",
  "United States": "USA",
  Mexico: "Mexiko",
  Canada: "Kanada",
  "Costa Rica": "Kostarika",
  Panama: "Panama",
  Jamaica: "Jamajka",
  Honduras: "Honduras",
  Haiti: "Haiti",
  Curacao: "Curaçao",
  Morocco: "Maroko",
  Algeria: "Alžírsko",
  Tunisia: "Tunisko",
  Egypt: "Egypt",
  Senegal: "Senegal",
  Nigeria: "Nigéria",
  Ghana: "Ghana",
  Cameroon: "Kamerun",
  "Ivory Coast": "Pobrežie Slonoviny",
  "Cote D'Ivoire": "Pobrežie Slonoviny",
  "South Africa": "Južná Afrika",
  Mali: "Mali",
  "Cape Verde Islands": "Kapverdy",
  Japan: "Japonsko",
  "South Korea": "Južná Kórea",
  "Korea Republic": "Južná Kórea",
  Australia: "Austrália",
  Iran: "Irán",
  "Saudi Arabia": "Saudská Arábia",
  Qatar: "Katar",
  Iraq: "Irak",
  Jordan: "Jordánsko",
  "United Arab Emirates": "Spojené arabské emiráty",
  Uzbekistan: "Uzbekistan",
  China: "Čína",
  "China PR": "Čína",
  "New Zealand": "Nový Zéland",
};

function translateTeamName(name: string): string {
  return COUNTRY_NAME_SK[name] ?? name;
}

/** Preloží mená tímov vložené priamo vo vete (napr. "Dvojšanca: Liechtenstein alebo remíza") - len na zobrazenie. */
function translateNamesInText(text: string | undefined, homeOriginal: string, awayOriginal: string): string {
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
  return result;
}

export type TelegramTarget = "premium" | "vip" | "both";

export function isTelegramEnabled(): boolean {
  return Boolean(TELEGRAM_BOT_TOKEN && (TELEGRAM_CHAT_ID_PREMIUM || TELEGRAM_CHAT_ID_VIP));
}

/** Ktoré kanály sú reálne nastavené (na zobrazenie voľby vo formulári). */
export function availableTelegramTargets(): ("premium" | "vip")[] {
  const targets: ("premium" | "vip")[] = [];
  if (TELEGRAM_CHAT_ID_PREMIUM) targets.push("premium");
  if (TELEGRAM_CHAT_ID_VIP) targets.push("vip");
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

function buildMessageText(tip: SavedTip, headerOverride?: string): string {
  const odds = impliedOdds(tip.probability);
  const stakePct = stakeTierPercent(tip.probability);

  if (tip.legs && tip.legs.length > 0) {
    const legsText = tip.legs
      .map(
        (leg) =>
          `⚽ ${escapeHtml(translateTeamName(leg.homeTeam))} — ${escapeHtml(translateTeamName(leg.awayTeam))}\n   ${escapeHtml(leg.market)}: <b>${escapeHtml(
            translateNamesInText(leg.selection, leg.homeTeam, leg.awayTeam)
          )}</b> (${leg.probability.toFixed(0)}%)`
      )
      .join("\n\n");

    return (
      `${headerOverride ?? `🎫 <b>Nový tiket</b>`} (${tip.legs.length} tipov)\n\n${legsText}\n\n` +
      `📈 Kombinovaná pravdepodobnosť: <b>${tip.probability.toFixed(1)}%</b>\n` +
      `💰 Odhadovaný kurz: <b>~${odds}</b>\n` +
      `💵 Odporúčaná sadzba: <b>${stakePct}% bankrollu</b>\n\n` +
      `<i>ℹ️ Odhad na základe modelu, nie garantovaný kurz stávkovej kancelárie.</i>`
    );
  }

  return (
    `${headerOverride ?? `🎯 <b>Nový tip</b>`}\n\n` +
    `⚽ ${escapeHtml(translateTeamName(tip.homeTeam))} — ${escapeHtml(translateTeamName(tip.awayTeam))}\n` +
    `📊 ${escapeHtml(tip.market)}: <b>${escapeHtml(translateNamesInText(tip.selection, tip.homeTeam, tip.awayTeam))}</b>\n` +
    `📈 Dôvera: <b>${tip.probability.toFixed(0)}%</b>\n` +
    `💰 Odhadovaný kurz: <b>~${odds}</b>\n` +
    `💵 Odporúčaná sadzba: <b>${stakePct}% bankrollu</b>\n\n` +
    `<i>ℹ️ Odhad na základe modelu, nie garantovaný kurz stávkovej kancelárie.</i>`
  );
}

async function sendToChat(chatId: string, text: string): Promise<number | null> {
  try {
    const res = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      { chat_id: chatId, text, parse_mode: "HTML" },
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
  return chatIds;
}

export async function sendTipToTelegram(
  tip: SavedTip,
  target: TelegramTarget,
  headerOverride?: string
): Promise<{ chatId: string; messageId: number }[]> {
  const chatIds = resolveChatIds(target);
  if (chatIds.length === 0) return [];

  const text = buildMessageText(tip, headerOverride);
  const sent: { chatId: string; messageId: number }[] = [];

  for (const chatId of chatIds) {
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
        return `${icon} ${escapeHtml(translateTeamName(leg.homeTeam))} — ${escapeHtml(translateTeamName(leg.awayTeam))}: ${escapeHtml(
          leg.market
        )}: ${escapeHtml(translateNamesInText(leg.selection, leg.homeTeam, leg.awayTeam))}`;
      })
      .join("\n");
    text = `${header} (${tip.legs.length} tipov)\n\n${legsText}`;
  } else {
    const header = tip.status === "won" ? "✅ <b>VÝHRA</b>" : "❌ <b>PREHRA</b>";
    text =
      `${header}\n\n` +
      `⚽ ${escapeHtml(translateTeamName(tip.homeTeam))} — ${escapeHtml(translateTeamName(tip.awayTeam))}\n` +
      `📊 ${escapeHtml(tip.market)}: <b>${escapeHtml(translateNamesInText(tip.selection, tip.homeTeam, tip.awayTeam))}</b>`;
  }

  const sent: { chatId: string; messageId: number }[] = [];
  for (const chatId of chatIds) {
    const messageId = await sendToChat(chatId, text);
    if (messageId) sent.push({ chatId, messageId });
  }
  return sent;
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

const FAQ_ANSWERS: Record<string, string> = {
  faq_price:
    `💰 <b>Cenník</b>\n\n` +
    `🟡 <b>PREMIUM</b> — 29 €/mesiac\nDenné tipy zo všetkých sledovaných líg, s vysvetlením a plnou históriou úspešnosti.\n\n` +
    `👑 <b>VIP</b> — 99 €/mesiac\nPre stávkové skupiny a kanály — neobmedzený počet vašich vlastných klientov.\n\n` +
    `Kedykoľvek zrušiteľné, žiadna viazanosť.`,
  faq_how:
    `❓ <b>Ako to funguje</b>\n\n` +
    `TipRadar denne prepočíta desiatky zápasov cez vlastný štatistický model (Poissonovo rozdelenie gólov, vážená forma, vzájomné zápasy, historické dáta) a vyberie 2-3 najhodnotnejšie tipy naprieč 12 trhmi — s vysvetlením, prečo.`,
  faq_sample:
    `📊 <b>Ukážka tipu</b>\n\n` +
    `🎯 Dvojšanca: domáci alebo remíza\n📈 Dôvera: 74%\n💰 Odhadovaný kurz: ~1.35\n💵 Odporúčaná sadzba: 3% bankrollu\n\n` +
    `💡 Domáci tím je vo forme (4 výhry z posledných 5), v posledných 8 vzájomných zápasoch prehral len raz.`,
};

const MAIN_MENU_KEYBOARD = {
  inline_keyboard: [
    [{ text: "💰 Cenník", callback_data: "faq_price" }],
    [{ text: "❓ Ako to funguje", callback_data: "faq_how" }],
    [{ text: "📊 Ukážka tipu", callback_data: "faq_sample" }],
    [{ text: "✍️ Napísať priamo", url: `https://t.me/${TELEGRAM_CONTACT_USERNAME}` }],
  ],
};

async function callTelegramApi(method: string, body: Record<string, unknown>): Promise<void> {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, body, { timeout: 10000 });
  } catch (err: any) {
    console.error(`Telegram API (${method}) zlyhalo:`, err?.response?.data ?? err?.message ?? err);
  }
}

/** Spracuje jednu prichádzajúcu udalosť z Telegram webhooku (nová správa alebo stlačenie tlačidla). */
export async function handleTelegramUpdate(update: any): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;

  if (update.callback_query) {
    const chatId = update.callback_query.message?.chat?.id;
    const data = update.callback_query.data;
    await callTelegramApi("answerCallbackQuery", { callback_query_id: update.callback_query.id });
    const answer = FAQ_ANSWERS[data];
    if (chatId && answer) {
      await callTelegramApi("sendMessage", { chat_id: chatId, text: answer, parse_mode: "HTML", reply_markup: MAIN_MENU_KEYBOARD });
    }
    return;
  }

  // Akákoľvek správa od súkromného používateľa (nie z kanálu) spustí uvítacie menu.
  const chatId = update.message?.chat?.id;
  const chatType = update.message?.chat?.type;
  if (!chatId || chatType !== "private") return;

  await callTelegramApi("sendMessage", {
    chat_id: chatId,
    text: `👋 Vitaj v <b>TipRadar</b>!\n\nVyber si, čo ťa zaujíma:\n\n<i>Tvoje Telegram ID: <code>${chatId}</code></i>`,
    parse_mode: "HTML",
    reply_markup: MAIN_MENU_KEYBOARD,
  });
}

const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

/** Pošle tebe (administrátorovi) súhrn predplatiteľov, ktorým čoskoro vyprší alebo už vypršala platnosť. */
export async function notifyAdminExpiringSubscribers(
  expiring: { name: string; tier: string; daysLeft: number }[]
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID || expiring.length === 0) return;

  const lines = expiring
    .map((s) => {
      const tierLabel = s.tier === "group" ? "VIP" : "PREMIUM";
      const when = s.daysLeft < 0 ? "už vypršal" : s.daysLeft === 0 ? "vyprší dnes" : `vyprší o ${s.daysLeft} d.`;
      return `• ${s.name} (${tierLabel}) — ${when}`;
    })
    .join("\n");

  await callTelegramApi("sendMessage", {
    chat_id: TELEGRAM_ADMIN_CHAT_ID,
    text: `⚠️ <b>Blížiace sa/vypršané platby</b>\n\n${lines}`,
    parse_mode: "HTML",
  });
}

/** Pošle predplatiteľovi osobnú pripomienku pred obnovením platby, s prehľadom celkovej úspešnosti. */
export async function sendRenewalReminder(
  chatId: string,
  stats: { totalResolved: number; winRate: number | null }
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) return false;
  const text =
    `🔔 <b>Tvoje predplatné čoskoro vyprší</b>\n\n` +
    `Za posledné obdobie sme vyhodnotili <b>${stats.totalResolved}</b> tipov` +
    (stats.winRate !== null ? ` s úspešnosťou <b>${stats.winRate}%</b>.` : ".") +
    `\n\nAk chceš pokračovať v predplatnom, napíš nám - radi ťa predĺžime. 🙌`;
  const messageId = await sendToChat(chatId, text);
  return messageId !== null;
}

/** Zaregistruje na Telegram serveri adresu, kam má posielať prichádzajúce správy (spustiť raz po nasadení). */
export async function setTelegramWebhook(webhookUrl: string): Promise<void> {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, { url: webhookUrl });
  } catch (err: any) {
    const reason = err?.response?.data?.description ?? err?.message ?? String(err);
    throw new Error(reason);
  }
}
