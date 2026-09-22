import axios from "axios";
import { SavedTip } from "./types";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const enabled = Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);

/**
 * Pošle textovú správu do nastaveného Telegram kanálu/skupiny cez Bot API.
 * Ak Telegram nie je nastavený (chýbajú premenné prostredia), potichu nič
 * neurobí - appka funguje normálne aj bez tejto funkcie.
 */
async function sendTelegramMessage(text: string): Promise<void> {
  if (!enabled) return;
  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
      },
      { timeout: 10000 }
    );
  } catch (err) {
    // Odoslanie do Telegramu nikdy nesmie zhodiť samotné uloženie tipu -
    // len to potichu zalogujeme na serveri.
    console.error("Odoslanie do Telegramu zlyhalo:", err);
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Naformátuje a pošle upozornenie na nový uložený tip (jednotlivý, alebo tiket). */
export async function notifyNewTip(tip: SavedTip): Promise<void> {
  if (!enabled) return;

  if (tip.legs && tip.legs.length > 0) {
    const legsText = tip.legs
      .map(
        (leg) =>
          `⚽ ${escapeHtml(leg.homeTeam)} — ${escapeHtml(leg.awayTeam)}\n   ${escapeHtml(leg.market)}: <b>${escapeHtml(
            leg.selection
          )}</b> (${leg.probability.toFixed(0)}%)`
      )
      .join("\n\n");

    const text = `🎫 <b>Nový tiket</b> (${tip.legs.length} tipov)\n\n${legsText}\n\n📈 Kombinovaná pravdepodobnosť: <b>${tip.probability.toFixed(
      1
    )}%</b>`;

    await sendTelegramMessage(text);
    return;
  }

  const text =
    `🎯 <b>Nový tip</b>\n\n` +
    `⚽ ${escapeHtml(tip.homeTeam)} — ${escapeHtml(tip.awayTeam)}\n` +
    `📊 ${escapeHtml(tip.market)}: <b>${escapeHtml(tip.selection)}</b>\n` +
    `📈 Dôvera: <b>${tip.probability.toFixed(0)}%</b>`;

  await sendTelegramMessage(text);
}
