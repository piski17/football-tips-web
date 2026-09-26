import { TicketLeg } from "./types";
import { getFixtureResult, getFixtureCornersAndCards, getFixtureGoalscorerIds } from "./apiClient";

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
  actualScorerIds: number[] | null = null,
  actualShotsOnGoal: number | null = null,
  actualFouls: number | null = null,
  actualOffsides: number | null = null,
  actualPossession: { team: string; value: number }[] | null = null
): "won" | "lost" | "void" {
  switch (tip.market) {
    case "Vyššie držanie lopty": {
      if (actualPossession === null) return "void";
      const picked = actualPossession.find((p) => p.team === tip.selection);
      const other = actualPossession.find((p) => p.team !== tip.selection);
      if (!picked || !other) return "void";
      if (picked.value === other.value) return "void"; // 50:50 - stávka sa vracia
      return picked.value > other.value ? "won" : "lost";
    }

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

    case "Strely na bránu": {
      if (actualShotsOnGoal === null) return "void";
      const line = extractLine(tip.selection);
      if (line === null) return "void";
      const isOver = tip.selection.startsWith("Over");
      return actualShotsOnGoal > line === isOver ? "won" : "lost";
    }

    case "Fauly": {
      if (actualFouls === null) return "void";
      const line = extractLine(tip.selection);
      if (line === null) return "void";
      const isOver = tip.selection.startsWith("Over");
      return actualFouls > line === isOver ? "won" : "lost";
    }

    case "Ofsajdy": {
      if (actualOffsides === null) return "void";
      const line = extractLine(tip.selection);
      if (line === null) return "void";
      const isOver = tip.selection.startsWith("Over");
      return actualOffsides > line === isOver ? "won" : "lost";
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

/** Zápas sa skončil (v riadnom čase, po predĺžení alebo po penaltách). */
const FINISHED_STATUSES = ["FT", "AET", "PEN"];
/** Zápas sa nedohrá - stávka sa vracia (ako v stávkovej kancelárii). */
const VOID_STATUSES = ["CANC", "ABD", "AWD", "WO"];
/** Odložený / prerušený zápas - ak sa neodohrá do 3 dní, stávka sa vracia. */
const DELAYED_STATUSES = ["PST", "TBD", "SUSP", "INT"];
const DELAYED_VOID_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
const STATS_MARKETS = ["Rohy", "Karty", "Strely na bránu", "Fauly", "Ofsajdy", "Vyššie držanie lopty"];

export interface SettledBet {
  status: "won" | "lost" | "void";
  homeGoals: number | null;
  awayGoals: number | null;
}

/**
 * Zistí výsledok zápasu cez API a vyhodnotí jeden tip (alebo nohu tiketu).
 * Vráti null, ak sa zápas ešte neskončil (tip ostáva "pending").
 * Spoločná logika pre webový server aj Electron appku.
 */
export async function settleBet(
  bet: EvaluatableBet & { fixtureId: number; matchDate?: string }
): Promise<SettledBet | null> {
  const result = await getFixtureResult(bet.fixtureId);
  if (!result) return null;

  if (VOID_STATUSES.includes(result.status)) {
    return { status: "void", homeGoals: null, awayGoals: null };
  }

  if (DELAYED_STATUSES.includes(result.status)) {
    const kickoff = bet.matchDate ? new Date(bet.matchDate).getTime() : NaN;
    if (!isNaN(kickoff) && Date.now() - kickoff > DELAYED_VOID_AFTER_MS) {
      return { status: "void", homeGoals: null, awayGoals: null };
    }
    return null;
  }

  if (!FINISHED_STATUSES.includes(result.status) || result.homeGoals == null || result.awayGoals == null) {
    return null;
  }

  const wentToExtraTime = result.status !== "FT";

  let corners: number | null = null;
  let cards: number | null = null;
  let shotsOnGoal: number | null = null;
  let fouls: number | null = null;
  let offsides: number | null = null;
  let possession: { team: string; value: number }[] | null = null;
  // Štatistiky z API zahŕňajú aj predĺženie - pri takom zápase sa nedá určiť
  // stav po 90 minútach, preto takýto tip vraciame (void).
  if (STATS_MARKETS.includes(bet.market) && !wentToExtraTime) {
    const stats = await getFixtureCornersAndCards(bet.fixtureId);
    corners = stats.corners;
    cards = stats.cards;
    shotsOnGoal = stats.shotsOnGoal;
    fouls = stats.fouls;
    offsides = stats.offsides;
    possession = stats.possession;
  }

  let scorerIds: number[] | null = null;
  // Strelci z API zahŕňajú aj góly z predĺženia - rovnaký dôvod ako vyššie.
  if (bet.market === "Strelec gólov" && !wentToExtraTime) {
    scorerIds = await getFixtureGoalscorerIds(bet.fixtureId);
  }

  const status = evaluateTip(
    bet,
    result.homeGoals,
    result.awayGoals,
    corners,
    cards,
    scorerIds,
    shotsOnGoal,
    fouls,
    offsides,
    possession
  );
  return { status, homeGoals: result.homeGoals, awayGoals: result.awayGoals };
}
