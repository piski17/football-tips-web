import { MarketPick } from "./types";
import { OddsSummary } from "./apiClient";

/**
 * Priradí priemerný kurz od stávkových spoločností ku konkrétnej stávke
 * (podľa trhu a výberu). Pre trhy, ktoré stávkové spoločnosti bežne
 * neponúkajú (rohy, karty, presný výsledok, čisté konto), vráti null.
 */
export function matchOddsForBet(
  bet: MarketPick,
  odds: OddsSummary | null,
  homeTeamName: string,
  awayTeamName: string
): number | null {
  if (!odds) return null;

  if (bet.market === "Výsledok zápasu" && odds.matchWinner) {
    if (bet.selection === "Remíza") return odds.matchWinner.draw;
    if (bet.selection.includes(homeTeamName)) return odds.matchWinner.home;
    if (bet.selection.includes(awayTeamName)) return odds.matchWinner.away;
    return null;
  }

  if (bet.market === "Dvojšanca" && odds.doubleChance) {
    const hasHome = bet.selection.includes(homeTeamName);
    const hasAway = bet.selection.includes(awayTeamName);
    const hasDraw = bet.selection.includes("remíza");
    if (hasHome && hasDraw) return odds.doubleChance.homeDraw;
    if (hasAway && hasDraw) return odds.doubleChance.drawAway;
    if (hasHome && hasAway) return odds.doubleChance.homeAway;
    return null;
  }

  if (bet.market === "Obaja tímy skórujú" && odds.bothTeamsScore) {
    return bet.selection === "Áno" ? odds.bothTeamsScore.yes : odds.bothTeamsScore.no;
  }

  if (bet.market === "Góly" && odds.goalsOverUnder) {
    const m = /^(Over|Under)\s+([\d.]+)$/.exec(bet.selection);
    if (!m) return null;
    const line = odds.goalsOverUnder[m[2]];
    if (!line) return null;
    return m[1] === "Over" ? line.over : line.under;
  }

  return null;
}
