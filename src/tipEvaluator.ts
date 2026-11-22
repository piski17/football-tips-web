import { TicketLeg, SavedTip } from "./types";
import { getFixtureResult, getFixtureCornersAndCards, getFixtureGoalscorerIds, getFixtureYellowCardHalves } from "./apiClient";

/** Ďalšie údaje pre vyhodnotenie: štatistiky tímov a polčasy (22. 10. 2026 fauly tímu a polčasy). */
interface ExtraActuals {
  cards?: { team: string; value: number }[] | null;
  shots?: { team: string; value: number }[] | null;
  fouls?: { team: string; value: number }[] | null;
  halftime?: { home: number; away: number } | null;
  cardHalves?: { first: number; second: number } | null;
}

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
  actualPossession: { team: string; value: number }[] | null = null,
  actualCornersByTeam: { team: string; value: number }[] | null = null,
  actualTeamStats: ExtraActuals | null = null
): "won" | "lost" | "void" {
  const overUnder = (actual: number | null): "won" | "lost" | "void" => {
    if (actual === null) return "void";
    const line = extractLine(tip.selection);
    if (line === null) return "void";
    const isOver = tip.selection.startsWith("Over");
    return actual > line === isOver ? "won" : "lost";
  };
  // Rohy jedného tímu: podľa názvu tímu, inak podľa poradia (API vracia najprv domácich).
  const teamValue = (list: { team: string; value: number }[] | null | undefined, side: "home" | "away"): number | null => {
    if (!list || list.length !== 2) return null;
    const name = side === "home" ? tip.homeTeam : tip.awayTeam;
    const byName = list.find((c) => c.team === name);
    return (byName ?? list[side === "home" ? 0 : 1]).value;
  };
  const teamCorners = (side: "home" | "away"): number | null => teamValue(actualCornersByTeam, side);
  switch (tip.market) {
    case "Góly domácich":
      return overUnder(homeGoals);
    case "Góly hostí":
      return overUnder(awayGoals);
    case "Rohy domácich":
      return overUnder(teamCorners("home"));
    case "Rohy hostí":
      return overUnder(teamCorners("away"));
    case "Karty domácich":
      return overUnder(teamValue(actualTeamStats?.cards, "home"));
    case "Karty hostí":
      return overUnder(teamValue(actualTeamStats?.cards, "away"));
    case "Strely na bránu domácich":
      return overUnder(teamValue(actualTeamStats?.shots, "home"));
    case "Strely na bránu hostí":
      return overUnder(teamValue(actualTeamStats?.shots, "away"));
    case "Fauly domácich":
      return overUnder(teamValue(actualTeamStats?.fouls, "home"));
    case "Fauly hostí":
      return overUnder(teamValue(actualTeamStats?.fouls, "away"));
    // 21. 11. 2026: kto urobí viac faulov – tím z výberu musí mať viac faulov ako súper (rovnosť = prehra).
    case "Fauly – kto viac": {
      const h = teamValue(actualTeamStats?.fouls, "home"), a = teamValue(actualTeamStats?.fouls, "away");
      if (h == null || a == null) return "void";
      if (tip.selection === tip.homeTeam) return h > a ? "won" : "lost";
      if (tip.selection === tip.awayTeam) return a > h ? "won" : "lost";
      return "void";
    }
    case "Góly v 1. polčase": {
      const ht = actualTeamStats?.halftime;
      return overUnder(ht ? ht.home + ht.away : null);
    }
    case "Góly v 2. polčase": {
      const ht = actualTeamStats?.halftime;
      return overUnder(ht ? homeGoals + awayGoals - ht.home - ht.away : null);
    }
    case "Karty v 1. polčase":
      return overUnder(actualTeamStats?.cardHalves ? actualTeamStats.cardHalves.first : null);
    case "Karty v 2. polčase":
      return overUnder(actualTeamStats?.cardHalves ? actualTeamStats.cardHalves.second : null);
    // Držanie lopty tímu v % proti hranici zo stávkovky (napr. Over 55.5).
    case "Držanie lopty domácich":
      return overUnder(teamValue(actualPossession, "home"));
    case "Držanie lopty hostí":
      return overUnder(teamValue(actualPossession, "away"));

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

    case "Oba tímy skórujú":
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

    // Trhy z modelu gólov len pre tiché sledovanie (16. 11. 2026).
    case "Víťaz bez remízy": {
      if (homeGoals === awayGoals) return "void";
      if (tip.selection === tip.homeTeam) return homeGoals > awayGoals ? "won" : "lost";
      if (tip.selection === tip.awayTeam) return awayGoals > homeGoals ? "won" : "lost";
      return "void";
    }

    // TIPREX (18. 11. 2026): ázijský handicap na rohy, karty a strely na bránu – rozdiel štatistík tímov.
    case "Ázijský handicap – rohy":
    case "Ázijský handicap – karty":
    case "Ázijský handicap – strely na bránu":
    case "Handicap – rohy":
    case "Handicap – karty":
    case "Handicap – strely na bránu": {
      const m = tip.selection.match(/^(.*) ([+−-])(\d+(?:\.\d+)?)$/);
      if (!m) return "void";
      const line = (m[2] === "+" ? 1 : -1) * parseFloat(m[3]);
      const isHome = m[1] === tip.homeTeam;
      if (!isHome && m[1] !== tip.awayTeam) return "void";
      const list = tip.market.endsWith("rohy") ? actualCornersByTeam : tip.market.endsWith("karty") ? actualTeamStats?.cards : actualTeamStats?.shots;
      const h = teamValue(list, "home"), a = teamValue(list, "away");
      if (h == null || a == null) return "void";
      const diff = (isHome ? h - a : a - h) + line;
      // 22. 11. 2026 (Michal): v TipRadare aj celé hranice – presne na hranici = prehra; ázijský (TIPREX) = vrátené.
      if (diff === 0) return tip.market.startsWith("Ázijský") ? "void" : "lost";
      return diff > 0 ? "won" : "lost";
    }

    case "Ázijský handicap":
    case "Európsky handicap":
    case "Handicap": {
      const draw = tip.selection.match(/^Remíza \((.*) ([+−-])(\d+(?:\.\d+)?)\)$/);
      const m = draw ?? tip.selection.match(/^(.*) ([+−-])(\d+(?:\.\d+)?)$/);
      if (!m) return "void";
      const line = (m[2] === "+" ? 1 : -1) * parseFloat(m[3]);
      const isHome = m[1] === tip.homeTeam;
      if (!isHome && m[1] !== tip.awayTeam) return "void";
      const diff = (isHome ? homeGoals - awayGoals : awayGoals - homeGoals) + line;
      if (draw) return diff === 0 ? "won" : "lost";
      if (diff === 0) return tip.market === "Ázijský handicap" ? "void" : "lost";
      return diff > 0 ? "won" : "lost";
    }

    case "Presný počet gólov":
    case "Presný počet gólov domácich":
    case "Presný počet gólov hostí": {
      const actual = tip.market === "Presný počet gólov" ? homeGoals + awayGoals : tip.market === "Presný počet gólov domácich" ? homeGoals : awayGoals;
      const m = tip.selection.match(/^(\d+)(\+)?$/);
      if (!m) return "void";
      const k = parseInt(m[1], 10);
      return (m[2] ? actual >= k : actual === k) ? "won" : "lost";
    }

    case "Párny / nepárny počet gólov": {
      const even = (homeGoals + awayGoals) % 2 === 0;
      if (tip.selection === "Párny") return even ? "won" : "lost";
      if (tip.selection === "Nepárny") return even ? "lost" : "won";
      return "void";
    }

    case "Výsledok 1. polčasu": {
      const ht = actualTeamStats?.halftime;
      if (!ht) return "void";
      const actual = ht.home > ht.away ? `Výhra ${tip.homeTeam}` : ht.home < ht.away ? `Výhra ${tip.awayTeam}` : "Remíza";
      return actual === tip.selection ? "won" : "lost";
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
export const STATS_MARKETS = ["Rohy", "Rohy domácich", "Rohy hostí", "Karty", "Karty domácich", "Karty hostí", "Strely na bránu domácich", "Strely na bránu hostí", "Strely na bránu", "Fauly", "Ofsajdy", "Vyššie držanie lopty", "Držanie lopty domácich", "Držanie lopty hostí", "Fauly domácich", "Fauly hostí", "Fauly – kto viac", "Ázijský handicap – rohy", "Ázijský handicap – karty", "Ázijský handicap – strely na bránu", "Handicap – rohy", "Handicap – karty", "Handicap – strely na bránu"];
/** Karty v polčasoch – vyhodnotia sa z udalostí zápasu (pri predĺžení sa vracajú). */
const CARD_HALF_MARKETS = ["Karty v 1. polčase", "Karty v 2. polčase"];
const halftimeOf = (r: { htHome?: number | null; htAway?: number | null }) =>
  r.htHome != null && r.htAway != null ? { home: r.htHome, away: r.htAway } : null;

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
  let cornersByTeam: { team: string; value: number }[] | null = null;
  let teamStats: ExtraActuals | null = { halftime: halftimeOf(result) };
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
    cornersByTeam = stats.cornersByTeam ?? null;
    teamStats = { ...teamStats, cards: stats.cardsByTeam ?? null, shots: stats.shotsByTeam ?? null, fouls: stats.foulsByTeam ?? null };
  }
  if (CARD_HALF_MARKETS.includes(bet.market) && !wentToExtraTime) {
    teamStats = { ...teamStats, cardHalves: await getFixtureYellowCardHalves(bet.fixtureId) };
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
    possession,
    cornersByTeam,
    teamStats
  );
  // Štatistiky (rohy, karty, strely…) API zverejní často až niekoľko minút – hodín po zápase, alebo požiadavka
  // zlyhá. Kým od výkopu neuplynú 2 dni, chýbajúce štatistiky nie sú dôvod tip vrátiť – skúsi sa to znova
  // (2. 11. 2026 kontrola: predtým sa taký tip natrvalo vyhodnotil ako „vrátený“).
  if (status === "void" && statsMissingTooEarly(bet.market, wentToExtraTime, bet.matchDate)) return null;
  return { status, homeGoals: result.homeGoals, awayGoals: result.awayGoals };
}

const STATS_RETRY_MS = 2 * 24 * 60 * 60 * 1000;
function statsMissingTooEarly(market: string, wentToExtraTime: boolean, matchDate?: string): boolean {
  if (wentToExtraTime) return false; // pri predĺžení sa štatistiky tipy vracajú zámerne
  if (!STATS_MARKETS.includes(market) && !CARD_HALF_MARKETS.includes(market) && market !== "Góly v 1. polčase" && market !== "Góly v 2. polčase" && market !== "Výsledok 1. polčasu") return false;
  const kickoff = matchDate ? new Date(matchDate).getTime() : NaN;
  return !isNaN(kickoff) && Date.now() - kickoff < STATS_RETRY_MS;
}

/** Zápas (alebo niektorý zápas tiketu) už začal - tip sa nesmie uložiť. */
export function tipHasStartedMatch(tip: { matchDate: string; legs?: { matchDate: string }[] }): boolean {
  const dates = tip.legs && tip.legs.length > 0 ? tip.legs.map((l) => l.matchDate) : [tip.matchDate];
  const now = Date.now();
  return dates.some((d) => {
    const t = new Date(d).getTime();
    return !isNaN(t) && t <= now;
  });
}

export const MATCH_STARTED_MESSAGE = "Zápas už začal – tip ani tiket z neho sa nedá pridať.";

/** Ručná oprava tipu v histórii (výsledok, kurz, pri tikete výsledky jednotlivých zápasov). */
export interface TipEdit {
  status?: "won" | "lost" | "void" | "pending";
  odds?: number | null;
  legs?: { status: "won" | "lost" | "void" | "pending" }[];
  /** 22. 11. 2026 (Michal): vlastná hranica zo stávkovky (napr. „+0,5“, „2,5“) – nahradí číslo v tipe. */
  line?: string;
}

/** Posledné číslo v texte tipu (hranica), napr. „Inter +0,5“ → „+0,5“, „Viac ako 2,5“ → „2,5“. */
const LINE_RE = /([+\-−]?\d+(?:[.,]\d+)?)(?!.*\d)/;
export function selectionWithLine(selection: string, line: string): string | null {
  const raw = String(line || "").trim().replace("−", "-").replace(",", ".");
  if (!/^[+-]?\d+(\.\d+)?$/.test(raw)) return null;
  const m = String(selection || "").match(LINE_RE);
  if (!m) return null;
  const old = m[1];
  const n = parseFloat(raw);
  const signed = /^[+\-−]/.test(old) || /^[+-]/.test(raw);
  let txt = String(Math.abs(n));
  if (old.includes(",")) txt = txt.replace(".", ",");
  if (signed) txt = (n < 0 ? "-" : "+") + txt;
  else if (n < 0) return null;
  return selection.slice(0, m.index) + txt + selection.slice((m.index ?? 0) + old.length);
}

const EDIT_STATUSES = ["won", "lost", "void", "pending"];

/** Vráti zmeny, ktoré sa majú uložiť k tipu (nový stav tiketu sa vypočíta z jeho zápasov). */
export function buildTipEdit(tip: SavedTip, edit: TipEdit): Partial<SavedTip> {
  const patch: Partial<SavedTip> = { edited: true };
  if (tip.legs && tip.legs.length > 0 && Array.isArray(edit.legs)) {
    const legs = tip.legs.map((l, i) => {
      const st = edit.legs![i]?.status;
      return EDIT_STATUSES.includes(st as string) ? { ...l, status: st as TicketLeg["status"] } : l;
    });
    patch.legs = legs;
    patch.status = computeTicketStatus(legs);
  } else if (edit.status && EDIT_STATUSES.includes(edit.status)) {
    patch.status = edit.status;
  }
  if (!(tip.legs && tip.legs.length) && typeof edit.line === "string" && edit.line.trim()) {
    const sel = selectionWithLine(tip.selection, edit.line);
    if (sel && sel !== tip.selection) {
      patch.selection = sel;
      // nová hranica → vyhodnotiť znova (ak Michal výsledok sám nezmenil)
      if (!edit.status || edit.status === tip.status) patch.status = "pending";
    }
  }
  if (edit.odds === null) patch.odds = null;
  else if (typeof edit.odds === "number" && isFinite(edit.odds) && edit.odds > 1) patch.odds = Math.round(edit.odds * 100) / 100;
  return patch;
}

/**
 * Vyhodnotí naraz viac tipov z jedného zápasu – výsledok a štatistiky sa z API
 * načítajú len raz (šetrí API pri sledovaní miešania modelu so stávkovkami).
 * Vráti null, ak sa zápas ešte neskončil.
 */
export async function settleFixtureBets(
  fixture: { fixtureId: number; matchDate?: string; homeTeam: string; awayTeam: string },
  bets: { market: string; selection: string }[]
): Promise<("won" | "lost" | "void")[] | null> {
  const result = await getFixtureResult(fixture.fixtureId);
  if (!result) return null;
  if (VOID_STATUSES.includes(result.status)) return bets.map(() => "void");
  if (DELAYED_STATUSES.includes(result.status)) {
    const kickoff = fixture.matchDate ? new Date(fixture.matchDate).getTime() : NaN;
    return !isNaN(kickoff) && Date.now() - kickoff > DELAYED_VOID_AFTER_MS ? bets.map(() => "void") : null;
  }
  if (!FINISHED_STATUSES.includes(result.status) || result.homeGoals == null || result.awayGoals == null) return null;
  const wentToExtraTime = result.status !== "FT";
  const needStats = !wentToExtraTime && bets.some((b) => STATS_MARKETS.includes(b.market));
  const stats = needStats ? await getFixtureCornersAndCards(fixture.fixtureId) : null;
  const cardHalves = !wentToExtraTime && bets.some((b) => CARD_HALF_MARKETS.includes(b.market)) ? await getFixtureYellowCardHalves(fixture.fixtureId) : null;
  const halftime = halftimeOf(result);
  // Štatistiky ešte nie sú (alebo API zlyhalo) – do 2 dní od výkopu skúsiť neskôr, nevracať.
  if (needStats && stats && stats.corners == null && stats.cards == null && stats.fouls == null && statsMissingTooEarly("Rohy", false, fixture.matchDate)) return null;
  return bets.map((b) => {
    const s = STATS_MARKETS.includes(b.market) ? stats : null;
    return evaluateTip(
      { homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam, market: b.market, selection: b.selection },
      result.homeGoals!,
      result.awayGoals!,
      s?.corners ?? null,
      s?.cards ?? null,
      null,
      s?.shotsOnGoal ?? null,
      s?.fouls ?? null,
      s?.offsides ?? null,
      s?.possession ?? null,
      s?.cornersByTeam ?? null,
      { cards: s?.cardsByTeam ?? null, shots: s?.shotsByTeam ?? null, fouls: s?.foulsByTeam ?? null, halftime, cardHalves }
    );
  });
}
