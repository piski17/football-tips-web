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
 * Minimálny kurz odporúčaného tipu (predvolene 1,50 – rovnako na webe aj v appke). Tip s nižším kurzom
 * do odporúčaní nepustíme, aj keď má dôveru aj hodnotu v poriadku.
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

// Stávky na polčasy, jednotlivé tímy, handicapy a pod. - tie nechceme.
const EXCLUDED = /(1st|2nd|first|second|half|home|away|team|exact|asian|handicap|odd\/even|european|double|draw no|interval|minute|min\b|1x2|race|highest|player|&|\/ ?both|result\/)/i;

const OU_PATTERNS: Record<string, RegExp> = {
  "Góly": /^goals? over\s*\/?\s*under$/i,
  "Rohy": /corner/i,
  "Karty": /card/i,
  "Strely na bránu": /shot.*(goal|target)|shotongoal/i,
  "Fauly": /foul/i,
  "Ofsajdy": /offside/i,
};

/** Trhy na jeden tím: názov trhu v TipRadare -> strana a druh štatistiky. */
export const TEAM_OU_MARKETS: Record<string, { side: "home" | "away"; kind: "goals" | "corners" }> = {
  "Góly domácich": { side: "home", kind: "goals" },
  "Góly hostí": { side: "away", kind: "goals" },
  "Rohy domácich": { side: "home", kind: "corners" },
  "Rohy hostí": { side: "away", kind: "corners" },
};

// Pri trhoch jedného tímu nechceme polčasy, handicapy, preteky a kombinácie.
const TEAM_EXCLUDED = /(1st|2nd|first|second|half|asian|handicap|exact|odd\/even|european|race|interval|minute|min\b|player|&|both|result|winner|draw)/i;

/**
 * Stávka jedného tímu, napr. „Total - Home“ (góly domácich), „Home Corners Over/Under“.
 * Názvy sa u API-Football líšia, preto je porovnanie voľnejšie: musí obsahovať
 * stranu (home/away, nie obe) a pri rohoch slovo corner, pri góloch žiadnu inú štatistiku.
 */
function isTeamBet(bet: string, side: "home" | "away", kind: "goals" | "corners"): boolean {
  const b = bet.trim().toLowerCase();
  const other = side === "home" ? "away" : "home";
  if (!b.includes(side) || b.includes(other) || TEAM_EXCLUDED.test(b)) return false;
  if (kind === "corners") return /corner/.test(b);
  if (/(corner|card|booking|shot|foul|offside|throw|goal ?kick|tackle|save|possession)/.test(b)) return false;
  return /^total\s*-\s*(home|away)$/.test(b) || /(goal|total|over)/.test(b);
}

/** Patrí stávka z API k trhu nad/pod v TipRadare (bez ohľadu na hranicu)? */
function isOverUnderBet(bet: string, market: string): boolean {
  const team = TEAM_OU_MARKETS[market];
  if (team) return isTeamBet(bet, team.side, team.kind);
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
  for (const o of odds) {
    if (!isOverUnderBet(o.bet, market)) continue;
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

  if (OU_PATTERNS[pick.market] || TEAM_OU_MARKETS[pick.market]) {
    const target = parseOverUnder(pick.selection);
    if (!target) return null;
    return best(
      odds.filter((o) => {
        if (!isOverUnderBet(o.bet, pick.market)) return false;
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

  const ownImplied = 1 / own.odd;
  if (others.length > 0 && others.every((o) => o !== null)) {
    const total = ownImplied + others.reduce((sum, o) => sum + 1 / o!.odd, 0);
    return ownImplied / total;
  }
  return ownImplied / 1.05;
}
