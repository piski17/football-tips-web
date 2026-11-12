import * as crypto from "crypto";
import { getMeta, setMeta } from "./metaStore";

// Osobné odkazy na výber dĺžky spolupráce (11. 11. 2026, Michal):
// Michal sa s klientom dohodne na Telegrame, v app.tipradar.eu (Nástroje → Spolupráca) vytvorí odkaz
// tipradar.eu/spolupraca/KÓD a pošle mu ho. Klient si na stránke sám vyberie počet tipov (od 50),
// Michalovi príde upozornenie na Telegram a v appke (Spolupráca → Odkazy pre klientov).

export const COOP_MIN_TIPS = 50;
export const COOP_TIP_PRICE = 0.98; // 50 tipov za 49 € (Michal 12. 11. 2026)
export const COOP_OPTIONS = [50, 100, 150, 200, 300];

export interface CoopChoice {
  tips: number;
  price: number;
  contact?: string;
  note?: string;
  at: string;
}
export interface CoopLink {
  token: string;
  name: string; // meno klienta (zadá Michal)
  perTip: number; // cena za tip pre tohto klienta
  createdAt: string;
  choice?: CoopChoice; // posledný výber klienta
  history?: CoopChoice[]; // predošlé výbery (ak si to klient zmenil)
  seen?: boolean; // Michal výber videl v appke
  done?: boolean; // zapísaný medzi členov
}

const KEY = "coop_links";

async function readAll(): Promise<Record<string, CoopLink>> {
  try {
    const raw = await getMeta(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
async function writeAll(all: Record<string, CoopLink>): Promise<void> {
  await setMeta(KEY, JSON.stringify(all));
}

export async function listCoopLinks(): Promise<CoopLink[]> {
  return Object.values(await readAll()).sort((a, b) => (b.choice?.at || b.createdAt).localeCompare(a.choice?.at || a.createdAt));
}
export async function getCoopLink(token: string): Promise<CoopLink | null> {
  return (await readAll())[token] ?? null;
}
export async function createCoopLink(name: string, perTip?: number): Promise<CoopLink> {
  const all = await readAll();
  let token = "";
  do token = crypto.randomBytes(5).toString("base64url").replace(/[-_]/g, "x"); while (all[token]);
  const link: CoopLink = {
    token,
    name: name.trim().slice(0, 80) || "Klient",
    perTip: perTip && perTip > 0 && perTip < 10 ? Math.round(perTip * 100) / 100 : COOP_TIP_PRICE,
    createdAt: new Date().toISOString(),
  };
  all[token] = link;
  await writeAll(all);
  return link;
}
export async function updateCoopLink(token: string, patch: Partial<CoopLink>): Promise<CoopLink | null> {
  const all = await readAll();
  if (!all[token]) return null;
  all[token] = { ...all[token], ...patch, token };
  await writeAll(all);
  return all[token];
}
export async function deleteCoopLink(token: string): Promise<void> {
  const all = await readAll();
  delete all[token];
  await writeAll(all);
}
export function coopPrice(link: CoopLink, tips: number): number {
  return Math.round(tips * link.perTip);
}
/** Klient si vybral dĺžku. Vráti uložený odkaz (alebo null, ak odkaz neexistuje / počet tipov je zlý). */
export async function chooseCoop(token: string, tips: number, contact?: string, note?: string): Promise<CoopLink | null> {
  const all = await readAll();
  const link = all[token];
  if (!link || link.done) return null;
  const n = Math.round(Number(tips));
  if (!(n >= COOP_MIN_TIPS && n <= 1000)) return null;
  const choice: CoopChoice = {
    tips: n,
    price: coopPrice(link, n),
    ...(contact ? { contact: contact.trim().slice(0, 120) } : {}),
    ...(note ? { note: note.trim().slice(0, 400) } : {}),
    at: new Date().toISOString(),
  };
  link.history = [...(link.history ?? []), ...(link.choice ? [link.choice] : [])].slice(-5);
  link.choice = choice;
  link.seen = false;
  await writeAll(all);
  return link;
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Stránka tipradar.eu/spolupraca/KÓD – klient si vyberie počet tipov. Farby Kameň ako web. */
export function coopPage(link: CoopLink | null): string {
  const head = `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Spolupráca · TipRadar</title><link rel="icon" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Urbanist:wght@300;500;600;700&family=Manrope:wght@400;500;600;700&display=swap">
<style>
:root{--bg:#0E0D0C;--card:#181715;--line:rgba(242,239,234,.1);--line2:rgba(242,239,234,.2);--text:#F2EFEA;--muted:#A39E96;--faint:#7A756E;--plat:linear-gradient(135deg,#F4EFE7,#D9D0C3 55%,#B9AC99)}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(900px 500px at 50% -10%,rgba(207,196,180,.12),transparent 70%),var(--bg);color:var(--text);font-family:Manrope,Arial,sans-serif;display:flex;justify-content:center;padding:40px 16px}
.box{width:100%;max-width:560px}.logo{font:700 18px/1 Urbanist,Arial,sans-serif;letter-spacing:.02em;text-align:center;color:var(--muted)}
.card{margin-top:22px;padding:34px 28px;border-radius:28px;background:var(--card);border:1px solid var(--line)}
.lab{font:600 11px/1 Urbanist,Arial,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:var(--faint)}
h1{font:300 40px/1.1 Urbanist,Arial,sans-serif;letter-spacing:-.02em;margin:14px 0 10px}h1 em{font-style:normal;background:var(--plat);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:500}
p{color:var(--muted);font-size:15.5px;line-height:1.6;margin:0}
.opts{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px;margin-top:24px}
.opt{padding:16px 10px;border-radius:18px;border:1px solid var(--line2);background:transparent;color:var(--text);cursor:pointer;text-align:center;font:inherit}
.opt b{display:block;font:500 28px/1 Urbanist,Arial,sans-serif}.opt span{display:block;margin-top:6px;font-size:12.5px;color:var(--muted)}
.opt.on{background:var(--plat);color:#0E0D0C;border-color:transparent}.opt.on span{color:#3A352E}
label{display:block;margin-top:18px;font-size:13px;color:var(--faint)}
input,textarea{width:100%;margin-top:6px;padding:13px 14px;border-radius:14px;border:1px solid var(--line2);background:#0E0D0C;color:var(--text);font:inherit;font-size:15px}
.sum{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-top:24px;padding:18px 20px;border-radius:18px;background:rgba(242,239,234,.04);border:1px solid var(--line)}
.sum small{color:var(--muted);font-size:13.5px}.sum b{font:600 30px/1 Urbanist,Arial,sans-serif}
button.go{width:100%;margin-top:20px;padding:17px;border:0;border-radius:999px;background:var(--plat);color:#0E0D0C;font:700 15px/1 Manrope,Arial,sans-serif;cursor:pointer}
button.go:disabled{opacity:.5}.msg{margin-top:12px;font-size:14px;color:#E0897A;min-height:1em}
.done{text-align:center}.done .ok{width:64px;height:64px;margin:0 auto 16px;border-radius:50%;background:var(--plat);display:grid;place-items:center;color:#0E0D0C;font-size:30px;font-weight:700}
.foot{margin-top:18px;text-align:center;font-size:12.5px;color:var(--faint);line-height:1.5}
</style></head><body><div class="box"><div class="logo">TipRadar</div>`;
  const tail = `<p class="foot">Zisk nie je zaručený. Stávkovanie je pre osoby staršie ako 18 rokov a nesie riziko straty.</p></div></body></html>`;
  if (!link) {
    return head + `<div class="card done"><div class="lab">Spolupráca</div><h1>Odkaz <em>neplatí</em></h1><p>Tento odkaz už nie je platný. Napíšte mi, prosím, na Telegram a pošlem vám nový.</p></div>` + tail;
  }
  if (link.done) {
    return head + `<div class="card done"><div class="ok">✓</div><div class="lab">Spolupráca</div><h1>Všetko je <em>nastavené</em></h1><p>Vašu spoluprácu (${link.choice?.tips ?? ""} tipov) už mám zapísanú. Ak chcete niečo zmeniť, napíšte mi na Telegram.</p></div>` + tail;
  }
  const first = esc(link.name.split(" ")[0] || "");
  const cur = link.choice?.tips ?? 100;
  const opts = COOP_OPTIONS.map((n) => `<button type="button" class="opt${n === cur ? " on" : ""}" data-t="${n}"><b>${n}</b><span>${coopPrice(link, n)} €</span></button>`).join("");
  return head + `<div class="card" id="form">
<div class="lab">Spolupráca TipRadar</div>
<h1>${first ? `${first}, vyberte si <em>dĺžku</em>` : `Vyberte si <em>dĺžku</em>`}</h1>
<p>Koľko tipov chcete dostávať? Spolupráca je od ${COOP_MIN_TIPS} tipov, tipy nevypršia a odpočítavajú sa, až keď ich dostanete. Po výbere sa vám ozvem s platobnými údajmi a nastavíme bank a vklad.</p>
<div class="opts">${opts}</div>
<label>Iný počet tipov (od ${COOP_MIN_TIPS})<input type="number" id="tips" min="${COOP_MIN_TIPS}" step="10" value="${cur}" inputmode="numeric"></label>
<label>Váš Telegram alebo e-mail (voliteľné)<input type="text" id="contact" maxlength="120" placeholder="@meno"></label>
<label>Poznámka (voliteľné)<textarea id="note" rows="2" maxlength="400"></textarea></label>
<div class="sum"><small><span id="sTips">${cur}</span> tipov · ${String(link.perTip.toFixed(2)).replace(".", ",")} € za tip</small><b id="sPrice">${coopPrice(link, cur)} €</b></div>
<button type="button" class="go" id="go">Potvrdiť výber</button><div class="msg" id="msg"></div>
</div>
<div class="card done" id="ok" hidden><div class="ok">✓</div><div class="lab">Hotovo</div><h1>Ďakujem, <em>mám to</em></h1><p id="okText"></p></div>
<script>
(function(){var per=${link.perTip},min=${COOP_MIN_TIPS},t=document.getElementById("tips");
function price(n){return Math.round(n*per)}
function draw(){var n=Math.round(+t.value||0);document.getElementById("sTips").textContent=n;document.getElementById("sPrice").textContent=(n>=min?price(n):"–")+" €";
document.querySelectorAll(".opt").forEach(function(b){b.classList.toggle("on",+b.dataset.t===n)})}
document.querySelectorAll(".opt").forEach(function(b){b.onclick=function(){t.value=b.dataset.t;draw()}});
t.oninput=draw;draw();
document.getElementById("go").onclick=function(){var n=Math.round(+t.value||0),m=document.getElementById("msg");
if(n<min){m.textContent="Spolupráca je najmenej od "+min+" tipov.";return}
this.disabled=true;m.textContent="";
fetch("/api/public/coop/${link.token}",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tips:n,contact:document.getElementById("contact").value,note:document.getElementById("note").value})})
.then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||"Nepodarilo sa to uložiť.");return d})})
.then(function(d){document.getElementById("form").hidden=true;document.getElementById("ok").hidden=false;
document.getElementById("okText").textContent="Vybrali ste si "+d.tips+" tipov ("+d.price+" €). Ozvem sa vám na Telegrame s platobnými údajmi a nastavíme bank a vklad.";})
.catch(function(e){m.textContent=e.message;document.getElementById("go").disabled=false})};
})();
</script>` + tail;
}
