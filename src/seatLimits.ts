// Počet miest v TipRadar Platinum podľa dĺžky členstva.
// Od 17. 10. 2026 je členstvo na 1 a 3 mesiace bez obmedzenia (null = neobmedzene),
// obmedzených je len 6 mesiacov (kód "season"). Dá sa zmeniť na Renderi premennou SEATS_SEASON.
function envSeats(name: string, fallback: number): number {
  const n = Number(typeof process !== "undefined" ? process.env[name] : undefined);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}
export const SEATS_M1: number | null = null;
export const SEATS_M3: number | null = null;
export const SEATS_SEASON = envSeats("SEATS_SEASON", 30);
