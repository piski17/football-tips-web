// Počet miest v členstve TipRadar podľa dĺžky (Gold 50 dní, Onyx 6 mesiacov; staré „season“).
// Od 17. 10. 2026 sú Gold aj Onyx bez obmedzenia (null = neobmedzene),
// obmedzených je len 6 mesiacov (kód "season"). Dá sa zmeniť na Renderi premennou SEATS_SEASON.
function envSeats(name: string, fallback: number): number {
  const n = Number(typeof process !== "undefined" ? process.env[name] : undefined);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}
export const SEATS_M1: number | null = null;
export const SEATS_M3: number | null = null;
export const SEATS_SEASON = envSeats("SEATS_SEASON", 30);
