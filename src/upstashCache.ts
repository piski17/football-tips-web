/**
 * Pamäť pre čítania z Upstash (8. 11. 2026). Upstash zablokoval zápisy, lebo sa minul mesačný prenos dát
 * (10 GB) – server pri každej akcii znova sťahoval celé zoznamy (tipy, tichá evidencia, automatické tipy…).
 * Do Upstash zapisuje LEN tento server, preto stačí výsledok čítania držať v pamäti a pri každom zápise
 * do toho istého kľúča ho zahodiť. Poistka: po 30 minútach sa číta znova.
 */
const TTL_MS = 30 * 60 * 1000;
const READ = new Set(["GET", "HGET", "HGETALL", "HLEN", "HKEYS", "HVALS", "HMGET", "EXISTS", "TTL"]);
const cache = new Map<string, { at: number; key: string; value: unknown }>();

function copy<T>(v: T): T {
  return Array.isArray(v) ? (v.slice() as unknown as T) : v;
}

/** Zahodí všetko z pamäte pre daný kľúč Redisu. */
export function invalidateKey(key: string): void {
  for (const [k, e] of cache) if (e.key === key) cache.delete(k);
}

/**
 * Vykoná príkaz Redisu cez `send`; čítania (GET, HGETALL…) vráti z pamäte, ak sú čerstvé,
 * a každý iný príkaz (zápis) zahodí pamäť pre svoj kľúč.
 */
export async function cachedRedis(command: (string | number)[], send: (c: (string | number)[]) => Promise<any>): Promise<any> {
  const op = String(command[0] ?? "").toUpperCase();
  const key = String(command[1] ?? "");
  if (!READ.has(op)) {
    invalidateKey(key);
    const res = await send(command);
    invalidateKey(key);
    return res;
  }
  const id = JSON.stringify(command);
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return copy(hit.value);
  const value = await send(command);
  cache.set(id, { at: Date.now(), key, value });
  return copy(value);
}
