import { SavedTip } from "./types";

/**
 * Porovná uložený tip so skutočným výsledkom zápasu a vráti, či bol tip
 * správny. Pre trhy Rohy/Karty potrebuje aj skutočný počet rohov/kariet
 * (ak nie sú k dispozícii, vráti "void" - nedá sa vyhodnotiť).
 */
export function evaluateTip(
  tip: SavedTip,
  homeGoals: number,
  awayGoals: number,
  actualCorners: number | null,
  actualCards: number | null
): "won" | "lost" | "void" {
  switch (tip.market) {
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

    default:
      return "void";
  }
}

function extractLine(selection: string): number | null {
  const match = selection.match(/(\d+(\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}
