import { recordLead } from "./leadsStore";
import axios from "axios";
import { sendAdminEmail } from "./mailer";
import { SavedTip } from "./types";
import { STRONG_TIP_MIN_PROBABILITY } from "./oddsMatcher";

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

/** vip = správa ide do VIP kanála – len tam má silný tip (≥ 70 %) hviezdičku. */
function buildMessageText(tip: SavedTip, headerOverride?: string, vip = false): string {
  const odds = impliedOdds(tip.probability);
  const stakePct = stakeTierPercent(tip.probability);
  // Skutočný kurz stávkoviek (ak bol pri uložení k dispozícii), inak odhad z modelu.
  const hasRealOdds = typeof tip.odds === "number" && tip.odds > 1;
  const oddsLine = hasRealOdds
    ? `💰 Kurz: <b>${fmtNum(tip.odds!, 2)}</b>\n`
    : `💰 Odhadovaný kurz: <b>~${String(odds).replace(".", ",")}</b>\n`;
  const oddsNote = hasRealOdds
    ? `<i>ℹ️ Priemerný kurz stávkových kancelárií v čase odoslania – u tvojej stávkovky sa môže mierne líšiť.</i>`
    : `<i>ℹ️ Odhad na základe modelu, nie garantovaný kurz stávkovej kancelárie.</i>`;

  if (tip.legs && tip.legs.length > 0) {
    const legsText = tip.legs
      .map(
        (leg) =>
          `⚽ ${escapeHtml(translateTeamName(leg.homeTeam))} — ${escapeHtml(translateTeamName(leg.awayTeam))}\n   ${escapeHtml(leg.market)}: <b>${escapeHtml(
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
    `${headerOverride ?? `🎯 <b>Nový tip</b>`}\n\n` +
    `⚽ ${escapeHtml(translateTeamName(tip.homeTeam))} — ${escapeHtml(translateTeamName(tip.awayTeam))}\n` +
    `📊 ${escapeHtml(tip.market)}: <b>${escapeHtml(translateNamesInText(tip.selection, tip.homeTeam, tip.awayTeam))}</b>\n` +
    `📈 Dôvera: <b>${tip.probability.toFixed(0)} %</b>${vip && tip.probability >= STRONG_TIP_MIN_PROBABILITY ? " · ⭐ <b>Silný tip</b>" : ""}\n` +
    oddsLine +
    `💵 Odporúčaná sadzba: <b>${stakePct} % bankrollu</b>\n\n` +
    oddsNote
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

  const sent: { chatId: string; messageId: number }[] = [];

  for (const chatId of chatIds) {
    const text = buildMessageText(tip, headerOverride, chatId === TELEGRAM_CHAT_ID_VIP);
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
    text = `${header} (${plural(tip.legs.length, "tip", "tipy", "tipov")})\n\n${legsText}`;
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
    `🟡 <b>PREMIUM</b> – 29 € / mesiac · 69 € / 3 mesiace · 149 € / sezóna\n` +
    `• <b>Denné tipy v súkromnom kanáli</b> – všetky odporúčania modelu na daný deň priamo v Telegrame\n` +
    `• <b>Transparentné odôvodnenie</b> – pri každom tipe kurz, miera dôvery a dôvod, prečo vznikol\n` +
    `• <b>Včasné doručenie</b> – tipy 2 – 3 hodiny pred výkopom, večer prehľad výsledkov dňa\n` +
    `• <b>Týždenný prehľad výkonnosti</b> – úspešnosť, zisk a ROI za uplynulý týždeň\n\n` +
    `👑 <b>VIP</b> – 59 € / mesiac · 139 € / 3 mesiace · 299 € / sezóna · <b>len 30 miest</b>\n` +
    `• <b>Kompletné členstvo Premium</b> – všetky denné tipy, odôvodnenia aj reporty\n` +
  `• <b>⭐ Silné tipy</b> – tipy s dôverou 70 % a viac označené hviezdičkou, len vo VIP kanáli\n` +
    `• <b>Tip týždňa</b> – najsilnejší tip týždňa s podrobnou analýzou, výhradne pre VIP\n` +
    `• <b>Osobné konzultácie</b> – videohovory so zakladateľom TipRadaru podľa dohody\n` +
    `• <b>Kovová členská karta</b> – personalizovaná vaším menom, číslom členstva a dátumom vstupu\n` +
    `• <b>Priama linka na zakladateľa</b> – súkromný VIP chat pre vaše otázky\n\n` +
    `Sezóna = do 31. 5. 2027. Členstvo sa samo nepredlžuje, žiadna viazanosť. Prví členovia majú cenu zamknutú, kým členstvo neprerušia.` +
    (process.env.SALES_OPEN === "true" ? "" : `\n\n🗓 <b>Predaj členstiev spúšťame čoskoro.</b> Napíšte sem „Mám záujem" a ozveme sa vám ako prvým.`),
  faq_how:
    `❓ <b>Ako to funguje</b>\n\n` +
    `TipRadar denne prepočíta desiatky zápasov cez vlastný štatistický model (Poissonovo rozdelenie gólov, vážená forma, vzájomné zápasy, historické dáta) a vyberie tipy s reálnou hodnotou naprieč 8 trhmi (góly v zápase, góly tímu, rohy v zápase, rohy tímu, karty, strely na bránu, fauly, držanie lopty) — s vysvetlením, prečo. Pri každom trhu vyskúša všetky hranice, ktoré stávkové kancelárie ponúkajú, a vyberie tú s najväčšou hodnotou.`,
  faq_time:
    `🕒 <b>Kedy prídu tipy</b>\n\n` +
    `Tipy posielame v deň zápasu, <b>2 – 3 hodiny pred výkopom</b> – vtedy sú kurzy aj dáta najpresnejšie a zostane dosť času na stávku.\n\n` +
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
const PREMIUM_BENEFITS =
  `• <b>Denné tipy v súkromnom kanáli</b> – všetky odporúčania modelu na daný deň priamo v Telegrame\n` +
  `• <b>Transparentné odôvodnenie</b> – pri každom tipe kurz, miera dôvery a dôvod, prečo vznikol\n` +
  `• <b>Včasné doručenie</b> – tipy 2 – 3 hodiny pred výkopom, večer prehľad výsledkov dňa\n` +
  `• <b>Týždenný prehľad výkonnosti</b> – úspešnosť, zisk a ROI za uplynulý týždeň`;
const VIP_BENEFITS =
  `• <b>Kompletné členstvo Premium</b> – všetky denné tipy, odôvodnenia aj reporty\n` +
  `• <b>⭐ Silné tipy</b> – tipy s dôverou 70 % a viac označené hviezdičkou, len vo VIP kanáli\n` +
  `• <b>Tip týždňa</b> – najsilnejší tip týždňa s podrobnou analýzou, výhradne pre VIP\n` +
  `• <b>Osobné konzultácie</b> – videohovory so zakladateľom TipRadaru podľa dohody\n` +
  `• <b>Kovová členská karta</b> – personalizovaná vaším menom, číslom členstva a dátumom vstupu\n` +
  `• <b>Priama linka na zakladateľa</b> – súkromný VIP chat pre vaše otázky`;
const JOIN_MESSAGES: Record<string, string> = {
  premium:
    `🟡 <b>Členstvo Premium</b> – 29 € / mesiac · 69 € / 3 mesiace · 149 € / sezóna\n\n${PREMIUM_BENEFITS}\n\n` +
    `<b>Ako pokračovať:</b> napíšte sem krátku správu (napríklad „Mám záujem o Premium"). Pošleme vám platobné údaje a po platbe vás pridáme do súkromného kanála.\n\n` +
    `Ozveme sa vám zvyčajne do 24 hodín. Bez viazanosti, členstvo sa samo nepredlžuje.`,
  vip:
    `👑 <b>Členstvo VIP</b> – 59 € / mesiac · 139 € / 3 mesiace · 299 € / sezóna · <b>len 30 miest</b>\n\n${VIP_BENEFITS}\n\n` +
    `<b>Ako pokračovať:</b> napíšte sem krátku správu (napríklad „Mám záujem o VIP"). Pošleme vám platobné údaje a miesto vám rezervujeme po potvrdení platby.\n\n` +
    `Ozveme sa vám zvyčajne do 24 hodín. Bez viazanosti, členstvo sa samo nepredlžuje.`,
  clenstvo:
    `✨ <b>Členstvo TipRadar</b>\n\n` +
    `🟡 <b>Premium</b> – 29 € / mesiac · 69 € / 3 mesiace · 149 € / sezóna\n${PREMIUM_BENEFITS}\n\n` +
    `👑 <b>VIP</b> – 59 € / mesiac · 139 € / 3 mesiace · 299 € / sezóna · <b>len 30 miest</b>\n${VIP_BENEFITS}\n\n` +
    `<b>Ako pokračovať:</b> napíšte sem, ktoré členstvo vás zaujíma (napríklad „Mám záujem o VIP"). Pošleme vám platobné údaje a ďalší postup.\n\n` +
    `Ozveme sa vám zvyčajne do 24 hodín. Bez viazanosti, členstvo sa samo nepredlžuje.`,
  vip_waitlist:
    `👑 <b>VIP – poradovník</b>\n\nVšetkých 30 miest je momentálne obsadených. Váš záujem sme si zapísali – keď sa miesto uvoľní, ozveme sa vám ako prvým.\n\n` +
    `Dovtedy môžete začať s členstvom <b>Premium</b> (29 € mesačne) – stačí sem napísať „Mám záujem o Premium".`,
};
/** Predaj členstiev je spustený (premenná SALES_OPEN=true na Renderi). Dovtedy len poradovník. */
function salesOpen(): boolean {
  return process.env.SALES_OPEN === "true";
}
/** Odpoveď pred spustením predaja: výhody zvoleného členstva + zápis do poradovníka. */
function PRELAUNCH_MESSAGE(plan: string): string {
  const benefits =
    plan === "premium"
      ? `🟡 <b>Premium</b> – 29 € / mesiac · 69 € / 3 mesiace · 149 € / sezóna\n${PREMIUM_BENEFITS}`
      : plan === "clenstvo"
        ? `🟡 <b>Premium</b> – 29 € / mesiac · 69 € / 3 mesiace · 149 € / sezóna\n${PREMIUM_BENEFITS}\n\n👑 <b>VIP</b> – 59 € / mesiac · 139 € / 3 mesiace · 299 € / sezóna · <b>len 30 miest</b>\n${VIP_BENEFITS}`
        : `👑 <b>VIP</b> – 59 € / mesiac · 139 € / 3 mesiace · 299 € / sezóna · <b>len 30 miest</b>\n${VIP_BENEFITS}`;
  return (
    `✨ <b>Ďakujeme za záujem o TipRadar!</b>\n\n${benefits}\n\n` +
    `🗓 <b>Predaj členstiev spúšťame čoskoro.</b> Váš záujem sme si zapísali – keď začneme, ozveme sa vám <b>ako prvým</b>.\n\n` +
    `Ak máte otázku, pokojne ju napíšte sem.`
  );
}

const LEAD_LABEL: Record<string, string> = { premium: "Premium", vip: "VIP", vip_waitlist: "VIP – poradovník", clenstvo: "členstvo (zatiaľ nevybral)", otazka: "všeobecná otázka" };

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

  // Správy od súkromného používateľa (nie z kanálu).
  const chatId = update.message?.chat?.id;
  const chatType = update.message?.chat?.type;
  if (!chatId || chatType !== "private") return;
  const text: string = String(update.message?.text ?? "").trim();
  const from = update.message?.from ?? {};

  // Príchod z tlačidla na tipradar.eu (odkaz t.me/TipRadarAiBot?start=premium / vip / vip_waitlist).
  const startParam = text.startsWith("/start ") ? text.slice(7).trim().toLowerCase() : "";
  if (startParam && JOIN_MESSAGES[startParam]) {
    const reply = salesOpen() ? JOIN_MESSAGES[startParam] : PRELAUNCH_MESSAGE(startParam);
    await callTelegramApi("sendMessage", { chat_id: chatId, text: reply, parse_mode: "HTML", reply_markup: MAIN_MENU_KEYBOARD });
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
      `👋 Vitaj v <b>TipRadar</b>!\n\nVyber si, čo ťa zaujíma:` +
      // Telegram ID vidí len administrátor (alebo ktokoľvek po príkaze /id).
      (String(chatId) === String(TELEGRAM_ADMIN_CHAT_ID) || text === "/id" ? `\n\n<i>Tvoje Telegram ID: <code>${chatId}</code></i>` : ""),
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
    `Za posledné obdobie sme vyhodnotili <b>${stats.totalResolved}</b> ${stats.totalResolved === 1 ? "tip" : stats.totalResolved <= 4 ? "tipy" : "tipov"}` +
    (stats.winRate !== null ? ` s úspešnosťou <b>${stats.winRate} %</b>.` : ".") +
    `\n\nAk chceš pokračovať v predplatnom, napíš nám – radi ťa predĺžime. 🙌`;
  const messageId = await sendToChat(chatId, text);
  return messageId !== null;
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
          `    ${icon(leg.status)} ${escapeHtml(translateTeamName(leg.homeTeam))} — ${escapeHtml(translateTeamName(leg.awayTeam))}: ${escapeHtml(
            leg.market
          )}: ${escapeHtml(translateNamesInText(leg.selection, leg.homeTeam, leg.awayTeam))}`
        );
      }
    } else {
      lines.push(
        `${icon(t.status)} <b>${escapeHtml(translateTeamName(t.homeTeam))} — ${escapeHtml(translateTeamName(t.awayTeam))}</b>\n` +
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
