import { recordLead, listLeads, updateLead, Lead } from "./leadsStore";
import { addSubscriber, listSubscribers, updateSubscriber } from "./subscribersStore";
import { paymentsEnabled, savePayment, getPayment, confirmBankPayment, cancelPayment, paidUntil, PAY_TERMS, PUBLIC_URL, Payment, Term, SellableTerm, termLabel, isTerm } from "./payments";
import axios from "axios";
import { sendAdminEmail } from "./mailer";
import { newPeriodUpdates } from "./guarantee";
import { SavedTip } from "./types";

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

function freeChatFromUrl(url?: string): string | undefined {
  const m = /^https?:\/\/(?:www\.)?t\.me\/([A-Za-z][A-Za-z0-9_]{3,})\/?$/.exec((url || "").trim());
  if (!m || /bot$/i.test(m[1])) return undefined;
  return "@" + m[1];
}

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
  "Rep. Of Ireland": "Írsko",
  "Republic of Ireland": "Írsko",
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

export function translateTeamName(name: string): string {
  return COUNTRY_NAME_SK[name] ?? name;
}

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
 * klient si ho podá len pri kurze aspoň X – vždy aspoň 1,50 a hodnota +5 % (aj pri kontrole 60 / 40).
 */
function minOddsLine(tip: SavedTip): string {
  const need = (p: number | undefined) => (typeof p === "number" && p > 0 ? 1.05 / (p / 100) : 0);
  const min = Math.ceil(Math.max(1.5, need(tip.probability), need(tip.strictProbability)) * 100) / 100;
  return `✅ Hrajte len pri kurze aspoň <b>${fmtNum(min, 2)}</b>\n`;
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

// ---- Členstvo TipRadar (od 29. 10. 2026) – rovnaké texty ako na tipradar.eu ----
// Štart 50 tipov 49 €, Gold 100 tipov 79 €, Platinum 200 tipov 139 € (navyše mentoring 1 na 1). Bez časovej platnosti, počet tipov denne sa neuvádza.
// Garancia: prvých 30 tipov bez rizika (inak peniaze späť) a členstvo v mínuse = 1 mesiac zadarmo.
const BENEFITS_BASE =
  `• <b>Denné tipy na Telegrame</b> v súkromnom kanáli, 1 – 2 hodiny pred výkopom – najviac 3 najsilnejšie denne\n` +
  `• <b>Pri každom tipe</b> kurz, šanca podľa modelu, dôvod a odporúčaná sadzba`;
const BENEFIT_CHAT = `• <b>💬 Súkromný VIP chat</b> – na vaše otázky odpovedám priamo ja\n` +
  `• <b>📞 Úvodný hovor 1 na 1</b> (30 min) – nastavenie banku, vkladu a ako tipy hrať`;
const BENEFIT_MENTOR =
  `• <b>🤝 Mentoring 1 na 1 počas celého členstva</b> – osobné stretnutia alebo videohovory priamo so mnou\n` +
  `• <b>⚡ Prednostné odpovede v chate</b>`;
/** Garancia: prvých 30 tipov bez rizika (peniaze späť) + členstvo v mínuse = 1 mesiac zadarmo. */
const GUARANTEE_LINE = `🛡 <b>Prvých 30 tipov bez rizika:</b> ak bude vaše prvé členstvo po 30 tipoch v mínuse, vrátime vám celú sumu. A ak členstvo skončí v mínuse, dostanete 1 mesiac zadarmo.`;
const BANK_LINE = `💼 Odporúčame vklad 2 – 3 % banku na tip, nikdy nad 5 %.`;
const PLAN_START = `🥈 <b>Štart · 50 tipov</b> – 49 € (0,98 € za tip)\n<i>Odporúčaný bank aspoň 800 € pri vklade 3 %</i>\n${BENEFITS_BASE}\n${BENEFIT_CHAT}`;
const PLAN_GOLD = `🥇 <b>Gold · 100 tipov</b> – 79 € (0,79 € za tip, ušetríte 19 €)\n<i>Odporúčaný bank aspoň 650 € pri vklade 3 %</i>\n${BENEFITS_BASE}\n${BENEFIT_CHAT}`;
const PLAN_PLATINUM = `💎 <b>Platinum · 200 tipov</b> – 139 € (0,70 € za tip, ušetríte 57 €)\n<i>Odporúčaný bank aspoň 600 € pri vklade 3 %</i>\n${BENEFITS_BASE}\n${BENEFIT_CHAT}\n${BENEFIT_MENTOR}`;
const ALL_PLANS = `${PLAN_START}\n\n${PLAN_GOLD}\n\n${PLAN_PLATINUM}`;

const FAQ_ANSWERS: Record<string, string> = {
  faq_price:
    `💰 <b>Členstvo TipRadar</b>\n\nPosielam najviac 3 najsilnejšie tipy denne, niektoré dni žiadny – kvalita pred kvantitou. Všetci členovia dostávajú rovnaké tipy, súkromný VIP chat a úvodný hovor 1 na 1, Platinum navyše mentoring 1 na 1.\n\n` +
    `${ALL_PLANS}\n\n${GUARANTEE_LINE}\n${BANK_LINE}\n\n` +
    `Tipy sa vám rátajú odo dňa nákupu. Členstvo skončí po poslednom tipe a samo sa nepredlžuje.` +
    (process.env.SALES_OPEN === "true" ? "" : `\n\n🗓 <b>Predaj členstva spúšťame čoskoro.</b> Napíšte sem „Mám záujem“ a ozveme sa vám ako prvým.`),
  faq_how:
    `❓ <b>Ako to funguje</b>\n\n` +
    `TipRadar denne prepočíta desiatky zápasov cez vlastný štatistický model (Poissonovo rozdelenie gólov, vážená forma, vzájomné zápasy, historické dáta) a vyberie tipy s reálnou hodnotou naprieč trhmi góly, rohy, karty, strely na bránu, fauly a držanie lopty (v zápase aj pre každý tím) – s vysvetlením, prečo. Pri každom trhu vyskúša všetky hranice, ktoré stávkové kancelárie ponúkajú, a vyberie tú s najväčšou hodnotou.`,
  faq_time:
    `🕒 <b>Kedy prídu tipy</b>\n\n` +
    `Tipy posielame v deň zápasu, <b>1 – 2 hodiny pred výkopom</b> – vtedy sú kurzy aj dáta najpresnejšie a zostane dosť času na stávku.\n\n` +
    `📋 Večer, keď sa zápasy dohrajú, pošleme <b>vyhodnotenie dňa</b> – vrátane tipov, ktoré nevyšli.`,
  faq_sample:
    `📊 <b>Ukážka tipu</b>\n\n` +
    `🎯 Góly: Nad 2,5\n📈 Dôvera: 71 %\n💰 Kurz: 1,75\n💵 Odporúčaná sadzba: 3 % bankrollu\n\n` +
    `💡 Očakávané góly 1,6 : 1,3 – oba tímy strieľajú pravidelne a v posledných 5 vzájomných zápasoch padli v priemere 3 góly.`,
};

const MAIN_MENU_KEYBOARD = {
  inline_keyboard: [
    [{ text: "💰 Cenník", callback_data: "faq_price" }],
    [{ text: "❓ Ako to funguje", callback_data: "faq_how" }],
    [{ text: "📊 Ukážka tipu", callback_data: "faq_sample" }],
    [{ text: "🕒 Kedy prídu tipy", callback_data: "faq_time" }],
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
// ---- Záujemcovia o členstvo z tipradar.eu ----
const NEXT_STEP =
  `<b>Ako pokračovať:</b> napíšte sem krátku správu (napríklad „Mám záujem o Gold – 100 tipov“). Pošleme vám platobné údaje a po platbe vás pridáme do súkromného kanála TipRadar.\n\n` +
  `Ozveme sa vám zvyčajne do 24 hodín. Bez viazanosti, členstvo sa samo nepredlžuje.`;
const PAY_STEP =
  `Zaplatíte bankovým prevodom cez QR kód v appke vašej banky, bez poplatkov. Hneď ako platba príde na účet, pošlem vám sem pozvánku do súkromného kanála TipRadar.\n\n` +
  `Bez viazanosti, členstvo sa samo nepredlžuje.`;
const JOIN_MESSAGES: Record<string, string> = {
  stat: `✨ <b>Členstvo TipRadar</b>\n\n${PLAN_START}\n\n${GUARANTEE_LINE}\n\n${NEXT_STEP}`,
  gold: `✨ <b>Členstvo TipRadar</b>\n\n${PLAN_GOLD}\n\n${GUARANTEE_LINE}\n\n${NEXT_STEP}`,
  platinum: `✨ <b>Členstvo TipRadar</b>\n\n${PLAN_PLATINUM}\n\n${GUARANTEE_LINE}\n\n${NEXT_STEP}`,
  clenstvo: `✨ <b>Členstvo TipRadar</b>\n\n${ALL_PLANS}\n\n${GUARANTEE_LINE}\n${BANK_LINE}\n\n${NEXT_STEP}`,
};
// Staré odkazy ešte môžu kolovať: start = Štart, seria = Gold, onyx / sampion / vip = Platinum, premium = všetky.
JOIN_MESSAGES.onyx = JOIN_MESSAGES.platinum;
JOIN_MESSAGES.start = JOIN_MESSAGES.stat;
JOIN_MESSAGES.seria = JOIN_MESSAGES.gold;
JOIN_MESSAGES.sampion = JOIN_MESSAGES.platinum;
JOIN_MESSAGES.vip = JOIN_MESSAGES.platinum;
JOIN_MESSAGES.premium = JOIN_MESSAGES.clenstvo;
// Členstvá sú bez obmedzenia miest; staré odkazy „…_waitlist“ ukážu bežnú ponuku.
for (const k of ["gold", "platinum", "onyx", "stat", "start", "seria", "sampion", "vip"]) JOIN_MESSAGES[k + "_waitlist"] = JOIN_MESSAGES[k];
/** Tlačidlá na zaplatenie (vedú na tipradar.eu/zaplatit → stránka s QR kódom). */
function payKeyboard(chatId: number | string, only?: SellableTerm) {
  const row = (t: SellableTerm, label: string) => [{ text: label, url: `${PUBLIC_URL}/zaplatit?term=${t}&c=${chatId}` }];
  const all: [SellableTerm, string][] = [
    ["p50", "Štart · 50 tipov · 49 €"],
    ["p100", "Gold · 100 tipov · 79 €"],
    ["p200", "◆ Platinum · 200 tipov · 139 €"],
  ];
  return { inline_keyboard: all.filter(([t]) => !only || t === only).map(([t, l]) => row(t, only ? `Zaplatiť ${PAY_TERMS[t].price} €` : l)) };
}
const PLAN_TERM: Record<string, SellableTerm> = { stat: "p50", start: "p50", gold: "p100", seria: "p100", platinum: "p200", onyx: "p200", sampion: "p200", vip: "p200" };
/** Predaj členstva je spustený (premenná SALES_OPEN=true na Renderi). Dovtedy len poradovník. */
function salesOpen(): boolean {
  return process.env.SALES_OPEN === "true";
}
/** Odpoveď pred spustením predaja: zvolené členstvo (alebo všetky) + zápis do poradovníka. */
function PRELAUNCH_MESSAGE(plan: string): string {
  const t = PLAN_TERM[plan.replace(/_waitlist$/, "")];
  const benefits = t === "p50" ? PLAN_START : t === "p100" ? PLAN_GOLD : t === "p200" ? PLAN_PLATINUM : ALL_PLANS;
  return (
    `✨ <b>Ďakujeme za záujem o TipRadar!</b>\n\n${benefits}\n\n${GUARANTEE_LINE}\n\n` +
    `🗓 <b>Predaj členstva spúšťame čoskoro.</b> Váš záujem sme si zapísali – keď začneme, ozveme sa vám <b>ako prvým</b>.\n\n` +
    `Ak máte otázku, pokojne ju napíšte sem.`
  );
}

const LEAD_LABEL: Record<string, string> = {
  stat: "Štart 50 tipov",
  gold: "Gold 100 tipov",
  platinum: "Platinum 200 tipov",
  onyx: "Platinum 200 tipov (starý odkaz Onyx)",
  start: "Štart 50 tipov (starý odkaz)",
  seria: "Gold 100 tipov (starý odkaz)",
  sampion: "Platinum 200 tipov (starý odkaz)",
  vip: "Platinum 200 tipov (starý odkaz VIP)",
  premium: "členstvo (starý odkaz Premium)",
  clenstvo: "členstvo (zatiaľ nevybral)",
  otazka: "všeobecná otázka",
};
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
    const answer = FAQ_ANSWERS[data];
    if (chatId && answer) {
      await callTelegramApi("sendMessage", { chat_id: chatId, text: answer, parse_mode: "HTML", reply_markup: MAIN_MENU_KEYBOARD });
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
  if (startParam && JOIN_MESSAGES[startParam]) {
    const canPay = paymentsEnabled();
    const reply = canPay
      ? JOIN_MESSAGES[startParam].replace(NEXT_STEP, PAY_STEP)
      : salesOpen() ? JOIN_MESSAGES[startParam] : PRELAUNCH_MESSAGE(startParam);
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: reply,
      parse_mode: "HTML",
      reply_markup: canPay ? payKeyboard(chatId, PLAN_TERM[startParam.replace(/_waitlist$/, "")]) : MAIN_MENU_KEYBOARD,
    });
    await recordLead({ chatId: String(chatId), plan: startParam, name: personName(from), username: from?.username }).catch(() => {});
    await notifyAdminLead(startParam, from, chatId);
    return;
  }

  // Bežná textová správa (nie príkaz): pošleme ju tebe a záujemcovi potvrdíme prijatie.
  if (text && !text.startsWith("/") && TELEGRAM_ADMIN_CHAT_ID && String(chatId) !== String(TELEGRAM_ADMIN_CHAT_ID)) {
    await callTelegramApi("forwardMessage", { chat_id: TELEGRAM_ADMIN_CHAT_ID, from_chat_id: chatId, message_id: update.message.message_id });
    await callTelegramApi("sendMessage", {
      chat_id: TELEGRAM_ADMIN_CHAT_ID,
      text: `✉️ Správa od <b>${escapeTg(personName(from))}</b>${from.username ? ` (@${escapeTg(from.username)})` : ""} · ID <code>${chatId}</code> · <a href="tg://user?id=${chatId}">otvoriť chat</a>`,
      parse_mode: "HTML",
    });
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: "Ďakujeme za správu 🙏 Ozveme sa vám čo najskôr, zvyčajne do 24 hodín.",
      reply_markup: MAIN_MENU_KEYBOARD,
    });
    return;
  }

  await callTelegramApi("sendMessage", {
    chat_id: chatId,
    text:
      `👋 Vitajte v <b>TipRadare</b>!\n\nVyberte si, čo vás zaujíma:` +
      // Telegram ID vidí len administrátor (alebo ktokoľvek po príkaze /id).
      (String(chatId) === String(TELEGRAM_ADMIN_CHAT_ID) || text === "/id" ? `\n\n<i>Tvoje Telegram ID: <code>${chatId}</code></i>` : ""),
    parse_mode: "HTML",
    reply_markup: MAIN_MENU_KEYBOARD,
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
    ...(chat ? [[{ text: "💬 Vstúpiť do VIP chatu", url: chat }]] : []),
  ];
  await say(
    `✅ <b>Platba prijatá, vitajte v TipRadare!</b>\n\n` +
      `Členstvo: <b>${termLabel(term)}</b>\n` +
      (tips ? `Tipy sa vám rátajú odo dneška${current ? " (najprv sa minú tie, ktoré vám ostali)" : ""}. Keď vám budú dochádzať, dám vám vedieť.\n` : `Platí do <b>${fmtDateSk(until)}</b>.\n`) +
      `${GUARANTEE_LINE}\n\n` +
      (buttons.length
        ? `Tu je vaša osobná pozvánka${chat ? " do súkromného kanála a do VIP chatu" : " do súkromného kanála"} 👇 Platí 7 dní a len pre vás.`
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

  const missing = !channel ? " ⚠️ Pozvánka do kanála sa nevytvorila – pridaj ho ručne." : !chat ? " ⚠️ Do VIP chatu ho pridaj ručne." : "";
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
      `◆ najviac 3 najsilnejšie tipy denne, 1 – 2 hodiny pred výkopom\n◆ pri každom tipe kurz, šanca a sadzba\n◆ súkromný VIP chat a úvodný hovor 1 na 1\n\n` +
      `🥈 Štart · 50 tipov · 49 €\n🥇 Gold · 100 tipov · 79 €\n💎 Platinum · 200 tipov · 139 € (navyše mentoring 1 na 1)\n\n` +
      `${GUARANTEE_LINE}\n\nVyberte si 👇`;
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
