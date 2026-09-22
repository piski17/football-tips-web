import axios from "axios";
import { SavedTip } from "./types";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const enabled = Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);

export function isTelegramEnabled(): boolean {
  return enabled;
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

/**
 * Pošle tip (jednotlivý alebo tiket) ako správu do nastaveného Telegram
 * kanálu/skupiny. Vráti ID správy (na prípadné neskoršie zmazanie), alebo
 * null, ak Telegram nie je nastavený alebo odoslanie zlyhalo.
 */
export async function sendTipToTelegram(tip: SavedTip): Promise<number | null> {
  if (!enabled) return null;
  try {
    const res = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text: buildMessageText(tip),
        parse_mode: "HTML",
      },
      { timeout: 10000 }
    );
    return res.data?.result?.message_id ?? null;
  } catch (err: any) {
    console.error("Odoslanie do Telegramu zlyhalo:", err?.response?.data ?? err?.message ?? err);
    return null;
  }
}

/** Zmaže konkrétnu správu z Telegram kanálu/skupiny (napr. keď sa tip zmaže aj z histórie). */
export async function deleteTelegramMessage(messageId: number): Promise<void> {
  if (!enabled) return;
  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`,
      { chat_id: TELEGRAM_CHAT_ID, message_id: messageId },
      { timeout: 10000 }
    );
  } catch (err: any) {
    console.error("Zmazanie správy z Telegramu zlyhalo:", err?.response?.data ?? err?.message ?? err);
  }
}
