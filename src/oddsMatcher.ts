/**
 * Priradenie skutočných kurzov stávkových kancelárií (z API-Football) k tipom
 * TipRadaru. Kurz je MEDIÁN všetkých stávkoviek, ktoré daný trh ponúkajú -
 * realistická hodnota, akú bežne nájdeš (nie najvyšší kurz na trhu).
 */

export interface MarketOdds {
  /** Názov stávky tak, ako ho vracia API, napr. "Goals Over/Under". */
  bet: string;
  /** Voľba, napr. "Over 2.5", "Home", "Yes". */
  value: string;
  /** Medián kurzu naprieč stávkovkami. */
  odd: number;
  /** Počet stávkoviek, z ktorých medián vznikol. */
  bookmakers: number;
}

export interface OddsMatch {
  odd: number;
  bookmakers: number;
}

/** Minimálna očakávaná hodnota tipu: pravdepodobnosť × kurz. 1,05 = +5 %. */
/** Názov trhu "oba tímy skórujú" - nový aj starší (v uložených tipoch). */
const BTTS_MARKETS = ["Oba tímy skórujú", "Obaja tímy skórujú"];

export const MIN_EXPECTED_VALUE = 1.05;

/**
 * Minimálny kurz odporúčaného tipu: 1,50 (25. 10. 2026, Michalovo rozhodnutie; predtým 1,55, ráno 25. 10. nakrátko žiadny).
 * Príliš nízky kurz aj tak vyradí kontrola hodnoty (+5 %): pri dôvere 80 % treba kurz aspoň 1,31,
 * pri 68 % aspoň 1,54.
 * Na webe sa dá zmeniť premennou MIN_ODDS v Renderi (napr. 1.70 alebo 1,70).
 */
function parseMinOdds(raw: string | undefined): number {
  const n = Number(String(raw ?? "").trim().replace(",", "."));
  return raw && Number.isFinite(n) && n >= 1.01 && n <= 10 ? n : 1.5;
}
export const MIN_ODDS = parseMinOdds(typeof process !== "undefined" ? process.env.MIN_ODDS : undefined);

/**
 * Hodnota nad touto hranicou (+25 %) je podozrivá - model sa s trhom rozchádza
 * viac, než je v praxi bežné, a chyba je spravidla v modeli.
 */
export const SUSPICIOUS_EXPECTED_VALUE = 1.25;

/** Pod týmto počtom odohraných zápasov v sezóne (pri ktoromkoľvek tíme) má model málo dát. */
export const MIN_GAMES_FOR_TRUST = 5;
/**
 * Spoľahlivosť (6. 10. 2026): kým jeden z tímov neodohral v sezóne aspoň
 * MIN_GAMES_TO_RECOMMEND zápasy (typicky reprezentácie v Lige národov),
 * model o ňom vie príliš málo a tip sa neodporučí.
 */
export const MIN_GAMES_TO_RECOMMEND = 3;
/**
 * Pásmo dôvery odporúčaných tipov. Od 6. 10. 2026 68 – 80 % (predtým 65 – 75 %):
 * po novej kalibrácii vyšli v oboch spätných testoch (aug. – okt. 2024
 * a mar. – máj 2025, po 300 zápasov) tipy 68 – 80 % na 73 – 74 %, kým
 * 65 – 75 % len na 69 – 71 %.
 */
// 21. 10. 2026 (Michalovo rozhodnutie): spodná hranica 65 % namiesto 68 %, aby bolo viac tipov
// aj cez týždeň. Minimálny kurz ostáva 1,55; tip s dôverou 65 % prejde len pri kurze aspoň
// ~1,62 (hodnota +5 %). Po 2 – 3 týždňoch overiť, ako vychádzajú tipy 65 – 68 %.
// (22. 10. 2026 nakrátko späť na 68 %, 23. 10. 2026 Michalovo rozhodnutie: opäť 65 – 80 %.)
// 24. 10. 2026 ráno späť na 68 – 80 %; v ten deň opäť 65 – 80 % (65 – 67 % len sledovať).
// 25. 10. 2026 (Michalovo rozhodnutie): tipy 65 – 67 % vyšli 1 z 5 – definitívne 68 – 80 %
// a minimálny kurz 1,50 (MIN_ODDS).
export const MIN_PROBABILITY = 68;
/**
 * Skúšobné pásmo (21. 10. 2026, Michalovo rozhodnutie): tipy s dôverou pod touto hranicou
 * (65 – 68 %) sa ukladajú len na sledovanie – vyhodnotia sa, ale neposielajú sa členom
 * a nerátajú sa do štatistík. Keď sa ukážu ako dobré, stačí hranicu znížiť na MIN_PROBABILITY.
 */
export const WATCH_BELOW_PROBABILITY = 68;
export const MAX_PROBABILITY = 80;
/**
 * Od tejto dôvery je odporúčaný tip označený „★ Silný tip“. V troch spätných
 * testoch vyšli tipy 70 – 80 % o ~3 body častejšie ako celé pásmo 68 – 80 %.
 */
export const STRONG_TIP_MIN_PROBABILITY = 70;
/** Kurz pre odporúčaný tip musí ponúkať aspoň toľko stávkoviek. */
export const MIN_BOOKMAKERS = 2;

// Stávky na polčasy, jednotlivé tímy, handicapy a pod. - tie nechceme.
// „Multicorners“ = rohy v 1. polčase × rohy v 2. polčase (22. 10. 2026: appka ho brala ako rohy
// v zápase, odtiaľ falošné „Rohy pod 19,5“ s kurzom 1,83); „range“ = pásma, „between“ = časové úseky.
const EXCLUDED = /(1st|2nd|first|second|half|home|away|team|exact|asian|handicap|odd\/even|european|double|draw no|interval|minute|min\b|1x2|race|highest|player|&|\/ ?both|result\/|multi|range|between|3 way)/i;

const OU_PATTERNS: Record<string, RegExp> = {
  "Góly": /^goals? over\s*\/?\s*under$/i,
  "Rohy": /corner/i,
  "Karty": /card/i,
  "Strely na bránu": /shot.*(goal|target)|shotongoal/i,
  "Fauly": /foul/i,
  "Ofsajdy": /offside/i,
};

/** Trhy na jeden tím: názov trhu v TipRadare -> strana a druh štatistiky. */
type TeamKind = "goals" | "corners" | "cards" | "shots" | "fouls";
export const TEAM_OU_MARKETS: Record<string, { side: "home" | "away"; kind: TeamKind }> = {
  "Góly domácich": { side: "home", kind: "goals" },
  "Góly hostí": { side: "away", kind: "goals" },
  "Rohy domácich": { side: "home", kind: "corners" },
  "Rohy hostí": { side: "away", kind: "corners" },
  "Karty domácich": { side: "home", kind: "cards" },
  "Karty hostí": { side: "away", kind: "cards" },
  "Strely na bránu domácich": { side: "home", kind: "shots" },
  "Strely na bránu hostí": { side: "away", kind: "shots" },
  "Fauly domácich": { side: "home", kind: "fouls" },
  "Fauly hostí": { side: "away", kind: "fouls" },
};

/** Trhy na polčas (22. 10. 2026): názov v TipRadare -> polčas a druh štatistiky. */
export const HALF_OU_MARKETS: Record<string, { half: 1 | 2; kind: "goals" | "cards" }> = {
  "Góly v 1. polčase": { half: 1, kind: "goals" },
  "Góly v 2. polčase": { half: 2, kind: "goals" },
  "Karty v 1. polčase": { half: 1, kind: "cards" },
  "Karty v 2. polčase": { half: 2, kind: "cards" },
};

/**
 * Stávka na polčas, napr. „Goals Over/Under First Half“, „Goals Over/Under - Second Half“,
 * „Cards Over/Under 1st Half“. Názvy sa u API-Football líšia, preto voľnejšie porovnanie:
 * správny polčas, žiadny tím a pri góloch žiadna iná štatistika.
 */
function isHalfBet(bet: string, half: 1 | 2, kind: "goals" | "cards"): boolean {
  const b = bet.trim().toLowerCase();
  const first = /(1st|first)\s*half/.test(b);
  const second = /(2nd|second)\s*half/.test(b);
  if (half === 1 ? !first || second : !second || first) return false;
  if (/(home|away|team|player|asian|handicap|exact|odd\/even|european|race|interval|minute|both|result|winner|draw|&)/.test(b)) return false;
  if (kind === "cards") return /(card|yellow)/.test(b) && !/(red|point|booking)/.test(b);
  if (/(corner|card|booking|shot|foul|offside|throw|goal ?kick|tackle|save|possession)/.test(b)) return false;
  return /(goal|total|over)/.test(b);
}

// Pri trhoch jedného tímu nechceme polčasy, handicapy, preteky a kombinácie.
const TEAM_EXCLUDED = /(1st|2nd|first|second|half|asian|handicap|exact|odd\/even|european|race|interval|minute|min\b|player|&|both|result|winner|draw)/i;

/**
 * Stávka jedného tímu, napr. „Total - Home“ (góly domácich), „Home Corners Over/Under“.
 * Názvy sa u API-Football líšia, preto je porovnanie voľnejšie: musí obsahovať
 * stranu (home/away, nie obe) a pri rohoch slovo corner, pri góloch žiadnu inú štatistiku.
 */
function isTeamBet(bet: string, side: "home" | "away", kind: TeamKind): boolean {
  const b = bet.trim().toLowerCase();
  const other = side === "home" ? "away" : "home";
  if (!b.includes(side) || b.includes(other) || TEAM_EXCLUDED.test(b)) return false;
  if (kind === "corners") return /corner/.test(b);
  // Karty tímu: len žlté alebo všeobecné karty, nie červené ani body za karty.
  if (kind === "cards") return /(card|yellow)/.test(b) && !/(red|point|booking)/.test(b);
  if (kind === "shots") return /shot/.test(b) && /(target|goal)/.test(b);
  if (kind === "fouls") return /foul/.test(b);
  if (/(corner|card|booking|shot|foul|offside|throw|goal ?kick|tackle|save|possession)/.test(b)) return false;
  return /^total\s*-\s*(home|away)$/.test(b) || /(goal|total|over)/.test(b);
}

/**
 * Karty počítame len žlté (17. 10. 2026). Ak stávkovky ponúkajú trh so žltými
 * kartami, berieme kurzy len z neho; inak všeobecný trh kariet (nie červené ani body).
 */
function cardOdds(odds: MarketOdds[]): MarketOdds[] {
  const yellow = odds.filter((o) => /yellow/i.test(o.bet) && !/red|point|1st|2nd|first|second|half|home|away|team|player/i.test(o.bet));
  if (yellow.length) return yellow;
  return odds.filter((o) => isOverUnderBet(o.bet, "Karty") && !/red|point|booking/i.test(o.bet));
}

/** Patrí stávka z API k trhu nad/pod v TipRadare (bez ohľadu na hranicu)? */
function isOverUnderBet(bet: string, market: string): boolean {
  const team = TEAM_OU_MARKETS[market];
  if (team) return isTeamBet(bet, team.side, team.kind);
  const half = HALF_OU_MARKETS[market];
  if (half) return isHalfBet(bet, half.half, half.kind);
  const pattern = OU_PATTERNS[market];
  if (!pattern || !pattern.test(bet) || EXCLUDED.test(bet)) return false;
  if (market === "Góly" && !/^goals? over\s*\/?\s*under$/i.test(bet.trim())) return false;
  return true;
}

/**
 * Hranice (napr. 8,5 / 9,5 / 10,5), ktoré stávkovky pre daný trh nad/pod ponúkajú.
 * Model potom vyhodnotí každú z nich a vyberie tú s najväčšou hodnotou.
 */
export function offeredLines(odds: MarketOdds[] | undefined, market: string): number[] {
  if (!odds || odds.length === 0) return [];
  const lines = new Set<number>();
  if (market === "Karty") odds = cardOdds(odds);
  for (const o of odds) {
    if (market !== "Karty" && !isOverUnderBet(o.bet, market)) continue;
    const v = parseOverUnder(o.value);
    // len polovičné hranice (x,5) – pri celých číslach (napr. 10) sa stávka môže vracať
    if (v && Math.abs((v.line % 1) - 0.5) < 0.001) lines.add(v.line);
  }
  return Array.from(lines).sort((a, b) => a - b);
}

function parseOverUnder(text: string): { dir: "over" | "under"; line: number } | null {
  const m = String(text).trim().match(/^(over|under)\s*([\d]+(?:[.,]\d+)?)$/i);
  if (!m) return null;
  return { dir: m[1].toLowerCase() as "over" | "under", line: parseFloat(m[2].replace(",", ".")) };
}

function best(candidates: MarketOdds[]): OddsMatch | null {
  if (candidates.length === 0) return null;
  const top = [...candidates].sort((a, b) => b.bookmakers - a.bookmakers)[0];
  return { odd: top.odd, bookmakers: top.bookmakers };
}

/**
 * Nájde kurz pre tip (trh + voľba). Vráti null, ak stávkovky daný trh
 * alebo presne túto hranicu (napr. rohy 9,5) neponúkajú.
 */
export function findOdds(
  odds: MarketOdds[],
  pick: { market: string; selection: string },
  homeTeam: string,
  awayTeam: string
): OddsMatch | null {
  if (!odds || odds.length === 0) return null;

  if (pick.market === "Výsledok zápasu") {
    const want =
      pick.selection === "Remíza" ? "draw" : pick.selection === `Výhra ${homeTeam}` ? "home" : pick.selection === `Výhra ${awayTeam}` ? "away" : null;
    if (!want) return null;
    return best(odds.filter((o) => /^match winner$/i.test(o.bet.trim()) && o.value.trim().toLowerCase() === want));
  }

  if (BTTS_MARKETS.includes(pick.market)) {
    const want = pick.selection === "Áno" ? "yes" : pick.selection === "Nie" ? "no" : null;
    if (!want) return null;
    return best(
      odds.filter((o) => /^both teams (to )?score$/i.test(o.bet.trim()) && o.value.trim().toLowerCase() === want)
    );
  }

  if (OU_PATTERNS[pick.market] || TEAM_OU_MARKETS[pick.market] || HALF_OU_MARKETS[pick.market]) {
    const target = parseOverUnder(pick.selection);
    if (!target) return null;
    const pool = pick.market === "Karty" ? cardOdds(odds) : odds;
    return best(
      pool.filter((o) => {
        if (pick.market !== "Karty" && !isOverUnderBet(o.bet, pick.market)) return false;
        const v = parseOverUnder(o.value);
        return !!v && v.dir === target.dir && Math.abs(v.line - target.line) < 0.001;
      })
    );
  }

  // Držanie lopty, strelci a staré trhy - stávkovky ich cez API spravidla neponúkajú.
  return null;
}

/**
 * Pravdepodobnosť (0–1), ktorú tipu pripisujú stávkovky - z kurzov všetkých
 * možností daného trhu, s odrátanou maržou (napr. nad/pod 2,5 alebo 1/X/2).
 * Ak chýba kurz na niektorú z možností, marža sa odhadne na 5 %.
 */
export function marketProbability(
  odds: MarketOdds[],
  pick: { market: string; selection: string },
  homeTeam: string,
  awayTeam: string
): number | null {
  const own = findOdds(odds, pick, homeTeam, awayTeam);
  if (!own) return null;

  const others = opposingOdds(odds, pick, homeTeam, awayTeam);

  const ownImplied = 1 / own.odd;
  if (others.length > 0 && others.every((o) => o !== null)) {
    const total = ownImplied + others.reduce((sum, o) => sum + 1 / o!.odd, 0);
    return ownImplied / total;
  }
  return ownImplied / 1.05;
}

/** Kurzy ostatných možností toho istého trhu (pri nad/pod opačná strana, pri 1/X/2 zvyšné dve). */
function opposingOdds(
  odds: MarketOdds[],
  pick: { market: string; selection: string },
  homeTeam: string,
  awayTeam: string
): (OddsMatch | null)[] {
  let others: (OddsMatch | null)[] = [];
  if (pick.market === "Výsledok zápasu") {
    others = [`Výhra ${homeTeam}`, "Remíza", `Výhra ${awayTeam}`]
      .filter((sel) => sel !== pick.selection)
      .map((sel) => findOdds(odds, { market: pick.market, selection: sel }, homeTeam, awayTeam));
  } else if (BTTS_MARKETS.includes(pick.market)) {
    others = [findOdds(odds, { market: pick.market, selection: pick.selection === "Áno" ? "Nie" : "Áno" }, homeTeam, awayTeam)];
  } else {
    const ou = parseOverUnder(pick.selection);
    if (ou) {
      const opposite = `${ou.dir === "over" ? "Under" : "Over"} ${ou.line}`;
      others = [findOdds(odds, { market: pick.market, selection: opposite }, homeTeam, awayTeam)];
    }
  }
  return others;
}

/**
 * Meranie (20. 10. 2026): pravdepodobnosť stávkoviek v % pre zápis k tipom a do tichej
 * evidencie. Ak sú kurzy všetkých možností trhu, marža sa odráta (devig = true),
 * inak je to len 1 / kurz (devig = false) – bez odhadu marže, aby sa dalo neskôr
 * rozlíšiť, čo je presné. Na výber tipov nemá vplyv (ten používa marketProbability).
 */
export function marketProbabilityDetail(
  odds: MarketOdds[],
  pick: { market: string; selection: string },
  homeTeam: string,
  awayTeam: string
): { prob: number; devig: boolean } | null {
  if (!odds || odds.length === 0) return null;
  const own = findOdds(odds, pick, homeTeam, awayTeam);
  if (!own) return null;
  const others = opposingOdds(odds, pick, homeTeam, awayTeam);
  const ownImplied = 1 / own.odd;
  if (others.length > 0 && others.every((o) => o !== null)) {
    const total = ownImplied + others.reduce((sum, o) => sum + 1 / o!.odd, 0);
    return { prob: (ownImplied / total) * 100, devig: true };
  }
  return { prob: ownImplied * 100, devig: false };
}
