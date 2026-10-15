// Počet miest v TipRadar Platinum podľa dĺžky členstva.
// 1 mesiac je bez limitu. Dá sa zmeniť na Renderi premennými SEATS_M3 a SEATS_SEASON.
function envSeats(name: string, fallback: number): number {
  const n = Number(typeof process !== "undefined" ? process.env[name] : undefined);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}
export const SEATS_M3 = envSeats("SEATS_M3", 100);
export const SEATS_SEASON = envSeats("SEATS_SEASON", 50);
