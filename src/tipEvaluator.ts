import { TicketLeg } from "./types";

/** Spoločný tvar, ktorý potrebuje vyhodnotenie - vyhovuje mu SavedTip aj TicketLeg. */
interface EvaluatableBet {
  homeTeam: string;
  awayTeam: string;
  market: string;
  selection: string;
  playerId?: number;
}

/**
 * Porovná uložený tip (alebo jednu "nohu" tiketu) so skutočným výsledkom
 * zápasu a vráti, či bol tip správny. Pre trhy Rohy/Karty potrebuje aj
 * skutočný počet rohov/kariet (ak nie sú k dispozícii, vráti "void" - nedá
 * sa vyhodnotiť).
 */
export function evaluateTip(
  tip: EvaluatableBet,
  homeGoals: number,
  awayGoals: number,
  actualCorners: number | null,
  actualCards: number | null,
  actualScorerIds: number[] | null = null
): "won" | "lost" | "void" {
  switch (tip.market) {
    case "Strelec gólov": {
      if (actualScorerIds === null || tip.playerId == null) return "void";
      return actualScorerIds.includes(tip.playerId) ? "won" : "lost";
    }

    case "Výsledok zápasu": {
      let actual: string;
      if (homeGoals > awayGoals) actual = `Výhra ${tip.homeTeam}`;
      else if (homeGoals < awayGoals) actual = `Výhra ${tip.awayTeam}`;
      else actual = "Remíza";
      return actual === tip.selection ? "won" : "lost";
    }

    case "Góly": {
      const total = homeGoals + awayGoals;
      const line = extractLine(tip.selection);
      if (line === null) return "void";
      const isOver = tip.selection.startsWith("Over");
      return total > line === isOver ? "won" : "lost";
    }

    case "Obaja tímy skórujú": {
      const btts = homeGoals > 0 && awayGoals > 0;
      const predictedYes = tip.selection === "Áno";
      return btts === predictedYes ? "won" : "lost";
    }

    case "Rohy": {
      if (actualCorners === null) return "void";
      const line = extractLine(tip.selection);
      if (line === null) return "void";
      const isOver = tip.selection.startsWith("Over");
      return actualCorners > line === isOver ? "won" : "lost";
    }

    case "Karty": {
      if (actualCards === null) return "void";
      const line = extractLine(tip.selection);
      if (line === null) return "void";
      const isOver = tip.selection.startsWith("Over");
      return actualCards > line === isOver ? "won" : "lost";
    }

    case "Dvojšanca": {
      const homeNoLose = homeGoals >= awayGoals;
      const awayNoLose = awayGoals >= homeGoals;
      const notDraw = homeGoals !== awayGoals;
      if (tip.selection === `${tip.homeTeam} alebo remíza`) return homeNoLose ? "won" : "lost";
      if (tip.selection === `${tip.awayTeam} alebo remíza`) return awayNoLose ? "won" : "lost";
      if (tip.selection === `${tip.homeTeam} alebo ${tip.awayTeam}`) return notDraw ? "won" : "lost";
      return "void";
    }

    case "Presný výsledok": {
      const match = tip.selection.match(/^(\d+):(\d+)$/);
      if (!match) return "void";
      const [, h, a] = match;
      return parseInt(h, 10) === homeGoals && parseInt(a, 10) === awayGoals ? "won" : "lost";
    }

    case "Čisté konto": {
      if (tip.selection.startsWith(tip.homeTeam)) return awayGoals === 0 ? "won" : "lost";
      if (tip.selection.startsWith(tip.awayTeam)) return homeGoals === 0 ? "won" : "lost";
      return "void";
    }

    default:
      return "void";
  }
}

function extractLine(selection: string): number | null {
  const match = selection.match(/(\d+(\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Vyhodnotí tiket ako celok na základe stavu jeho jednotlivých "nôh" - presne
 * ako v skutočnej stávkovej kancelárii: ak čo i len jedna noha prehrá,
 * prehráva celý tiket. Ak nie je žiadna prehratá, ale aspoň jedna ešte čaká,
 * tiket ešte čaká. Ak sú všetky nohy neurčené (void), aj tiket je neurčený.
 */
export function computeTicketStatus(legs: TicketLeg[]): "won" | "lost" | "void" | "pending" {
  if (legs.some((l) => l.status === "lost")) return "lost";
  if (legs.some((l) => l.status === "pending")) return "pending";
  if (legs.every((l) => l.status === "void")) return "void";
  return "won";
}
