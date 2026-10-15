// Počet miest v TipRadar Platinum podľa dĺžky členstva.
// Dá sa zmeniť na Renderi premennými SEATS_M1, SEATS_M3 a SEATS_SEASON.
function envSeats(name: string, fallback: number): number {
  const n = Number(typeof process !== "undefined" ? process.env[name] : undefined);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}
export const SEATS_M1 = envSeats("SEATS_M1", 100);
export const SEATS_M3 = envSeats("SEATS_M3", 70);
export const SEATS_SEASON = envSeats("SEATS_SEASON", 30);
