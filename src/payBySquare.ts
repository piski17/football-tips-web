// QR kód PAY by square – slovenský štandard platobných QR kódov (podporujú ho všetky slovenské banky).
// Do kódu sa zapíše IBAN, suma, variabilný symbol, správa pre príjemcu a meno príjemcu.
// Postup podľa špecifikácie: údaje oddelené tabulátorom → CRC32 → LZMA → hlavička → base32hex.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const LZMA = require("lzma");

export interface BySquarePayment {
  iban: string;
  amount: number;
  variableSymbol: string;
  note: string;
  beneficiaryName: string;
  bic?: string;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ b) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

/** Odstráni diakritiku (banky ju v QR kóde nie vždy zobrazia správne). */
function deburr(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\t/g, " ");
}

function base32hex(bytes: Uint8Array): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUV";
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = ((buffer << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += chars[(buffer >> bits) & 31];
    }
  }
  if (bits > 0) out += chars[(buffer << (5 - bits)) & 31];
  return out;
}

/** Kontrolný súčet IBAN (mod 97) – odhalí preklep v čísle účtu. */
export function ibanValid(iban: string): boolean {
  const v = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return false;
  let rest = 0;
  for (const ch of v.slice(4) + v.slice(0, 4)) {
    const n = parseInt(ch, 36);
    rest = (n > 9 ? rest * 100 + n : rest * 10 + n) % 97;
  }
  return rest === 1;
}

/** Vráti text, ktorý sa zakóduje do QR kódu (PAY by square). */
export function payBySquareString(p: BySquarePayment): string {
  const fields = [
    "", // číslo faktúry
    "1", // počet platieb
    "1", // typ: platobný príkaz
    String(Number(p.amount.toFixed(2))),
    "EUR",
    "", // dátum splatnosti
    p.variableSymbol,
    "", // konštantný symbol
    "", // špecifický symbol
    "", // referencia platiteľa
    deburr(p.note),
    "1", // počet účtov
    p.iban.replace(/\s+/g, "").toUpperCase(),
    (p.bic || "").replace(/\s+/g, "").toUpperCase(),
    "0", // trvalý príkaz – nie
    "0", // inkaso – nie
    deburr(p.beneficiaryName),
    "", // ulica príjemcu
    "", // mesto príjemcu
  ];
  const payload = Buffer.from(fields.join("\t"), "utf8");
  const checked = Buffer.alloc(4 + payload.length);
  checked.writeUInt32LE(crc32(payload), 0);
  payload.copy(checked, 4);
  // LZMA bez 13-bajtovej hlavičky (čítačka si ju doplní sama).
  const compressed = Uint8Array.from((LZMA.compress(checked, 1) as number[]).slice(13).map((b) => b & 0xff));
  // Hlavička: typ 0 (platba), verzia 1.0.0, dokument 0. Verziu 1.0.0 prečítajú všetky bankové appky
  // (novšiu 1.2.0 niektoré odmietnu ako „nesprávne údaje"); meno príjemcu na konci staršie appky ignorujú.
  const header = [0x00, 0x00];
  const len = [checked.length & 0xff, (checked.length >> 8) & 0xff];
  return base32hex(Uint8Array.from([...header, ...len, ...compressed]));
}
