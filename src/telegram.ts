import axios from "axios";
import { SavedTip } from "./types";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID_PREMIUM = process.env.TELEGRAM_CHAT_ID_PREMIUM;
const TELEGRAM_CHAT_ID_VIP = process.env.TELEGRAM_CHAT_ID_VIP;

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

function buildMessageText(tip: SavedTip): string {
  const odds = impliedOdds(tip.probability);
  const stakePct = stakeTierPercent(tip.probability);

  if (tip.legs && tip.legs.length > 0) {
    const legsText = tip.legs
      .map(
        (leg) =>
          `⚽ ${escapeHtml(leg.homeTeam)} — ${escapeHtml(leg.awayTeam)}\n   ${escapeHtml(leg.market)}: <b>${escapeHtml(
            leg.selection
          )}</b> (${leg.probability.toFixed(0)}%)`
      )
      .join("\n\n");

    return (
      `🎫 <b>Nový tiket</b> (${tip.legs.length} tipov)\n\n${legsText}\n\n` +
      `📈 Kombinovaná pravdepodobnosť: <b>${tip.probability.toFixed(1)}%</b>\n` +
      `💰 Odhadovaný kurz: <b>~${odds}</b>\n` +
      `💵 Odporúčaná sadzba: <b>${stakePct}% bankrollu</b>\n\n` +
      `<i>ℹ️ Odhad na základe modelu, nie garantovaný kurz stávkovej kancelárie.</i>`
    );
  }

  return (
    `🎯 <b>Nový tip</b>\n\n` +
    `⚽ ${escapeHtml(tip.homeTeam)} — ${escapeHtml(tip.awayTeam)}\n` +
    `📊 ${escapeHtml(tip.market)}: <b>${escapeHtml(tip.selection)}</b>\n` +
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
export async function sendTipToTelegram(
  tip: SavedTip,
  target: TelegramTarget
): Promise<{ chatId: string; messageId: number }[]> {
  const chatIds: string[] = [];
  if ((target === "premium" || target === "both") && TELEGRAM_CHAT_ID_PREMIUM) chatIds.push(TELEGRAM_CHAT_ID_PREMIUM);
  if ((target === "vip" || target === "both") && TELEGRAM_CHAT_ID_VIP) chatIds.push(TELEGRAM_CHAT_ID_VIP);
  if (chatIds.length === 0) return [];

  const text = buildMessageText(tip);
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
