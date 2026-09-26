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
export const MIN_EXPECTED_VALUE = 1.05;

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

  if (pick.market === "Obaja tímy skórujú") {
    const want = pick.selection === "Áno" ? "yes" : pick.selection === "Nie" ? "no" : null;
    if (!want) return null;
    return best(
      odds.filter((o) => /^both teams (to )?score$/i.test(o.bet.trim()) && o.value.trim().toLowerCase() === want)
    );
  }

  const pattern = OU_PATTERNS[pick.market];
  if (pattern) {
    const target = parseOverUnder(pick.selection);
    if (!target) return null;
    return best(
      odds.filter((o) => {
        if (!pattern.test(o.bet) || EXCLUDED.test(o.bet)) return false;
        if (pick.market === "Góly" && !/^goals? over\s*\/?\s*under$/i.test(o.bet.trim())) return false;
        const v = parseOverUnder(o.value);
        return !!v && v.dir === target.dir && Math.abs(v.line - target.line) < 0.001;
      })
    );
  }

  // Držanie lopty, strelci a staré trhy - stávkovky ich cez API spravidla neponúkajú.
  return null;
}
