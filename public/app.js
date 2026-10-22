// TipRadar – appka (nový vzhľad 19. 10. 2026). Čistý JavaScript bez knižníc,
// server (src/server.ts) a jeho API sa nemenili.
"use strict";

// ---- Preklad názvov reprezentácií do slovenčiny (kluby zostávajú v pôvodnom tvare) ----
const COUNTRY_NAME_SK = {
  Albania: "Albánsko", Andorra: "Andorra", Armenia: "Arménsko", Austria: "Rakúsko", Azerbaijan: "Azerbajdžan",
  Belarus: "Bielorusko", Belgium: "Belgicko", "Bosnia and Herzegovina": "Bosna a Hercegovina", Bulgaria: "Bulharsko",
  Croatia: "Chorvátsko", Cyprus: "Cyprus", "Czech Republic": "Česko", Denmark: "Dánsko", England: "Anglicko",
  Estonia: "Estónsko", "Faroe Islands": "Faerské ostrovy", Finland: "Fínsko", France: "Francúzsko", Georgia: "Gruzínsko",
  Germany: "Nemecko", Gibraltar: "Gibraltár", Greece: "Grécko", Hungary: "Maďarsko", Iceland: "Island", Israel: "Izrael",
  Italy: "Taliansko", Kazakhstan: "Kazachstan", Kosovo: "Kosovo", Latvia: "Lotyšsko", Liechtenstein: "Lichtenštajnsko",
  Lithuania: "Litva", Luxembourg: "Luxembursko", Malta: "Malta", Moldova: "Moldavsko", Montenegro: "Čierna Hora",
  Netherlands: "Holandsko", "North Macedonia": "Severné Macedónsko", "Northern Ireland": "Severné Írsko", Norway: "Nórsko",
  Poland: "Poľsko", Portugal: "Portugalsko", Romania: "Rumunsko", Russia: "Rusko", "San Marino": "San Maríno",
  Scotland: "Škótsko", Serbia: "Srbsko", Slovakia: "Slovensko", Slovenia: "Slovinsko", Spain: "Španielsko",
  Sweden: "Švédsko", Switzerland: "Švajčiarsko", Turkey: "Turecko", Ukraine: "Ukrajina", Wales: "Wales",
  // Alternatívne názvy z API a reprezentácie mimo Európy
  Czechia: "Česko", "Rep. Of Ireland": "Írsko", "Republic of Ireland": "Írsko", "FYR Macedonia": "Severné Macedónsko",
  Macedonia: "Severné Macedónsko", "Türkiye": "Turecko", Turkiye: "Turecko", "Bosnia & Herzegovina": "Bosna a Hercegovina",
  Ireland: "Írsko", Holland: "Holandsko", Kyrgyzstan: "Kirgizsko", Argentina: "Argentína", Brazil: "Brazília",
  Uruguay: "Uruguaj", Colombia: "Kolumbia", Chile: "Čile", Paraguay: "Paraguaj", Peru: "Peru", Ecuador: "Ekvádor",
  Bolivia: "Bolívia", Venezuela: "Venezuela", USA: "USA", "United States": "USA", Mexico: "Mexiko", Canada: "Kanada",
  "Costa Rica": "Kostarika", Panama: "Panama", Jamaica: "Jamajka", Honduras: "Honduras", Haiti: "Haiti",
  Curacao: "Curaçao", Morocco: "Maroko", Algeria: "Alžírsko", Tunisia: "Tunisko", Egypt: "Egypt", Senegal: "Senegal",
  Nigeria: "Nigéria", Ghana: "Ghana", Cameroon: "Kamerun", "Ivory Coast": "Pobrežie Slonoviny",
  "Cote D'Ivoire": "Pobrežie Slonoviny", "South Africa": "Južná Afrika", Mali: "Mali", "Cape Verde Islands": "Kapverdy",
  Japan: "Japonsko", "South Korea": "Južná Kórea", "Korea Republic": "Južná Kórea", Australia: "Austrália", Iran: "Irán",
  "Saudi Arabia": "Saudská Arábia", Qatar: "Katar", Iraq: "Irak", Jordan: "Jordánsko",
  "United Arab Emirates": "Spojené arabské emiráty", Uzbekistan: "Uzbekistan", China: "Čína", "China PR": "Čína",
  "New Zealand": "Nový Zéland",
};

function translateTeamName(name) {
  return COUNTRY_NAME_SK[name] ?? name;
}

// ---- Preklad názvov súťaží (ligy s vlastným názvom ostávajú v pôvodnom tvare) ----
const LEAGUE_NAME_SK = {
  "UEFA Nations League": "Liga národov UEFA",
  "UEFA Champions League": "Liga majstrov UEFA",
  "UEFA Europa League": "Európska liga UEFA",
  "UEFA Europa Conference League": "Konferenčná liga UEFA",
  "UEFA Conference League": "Konferenčná liga UEFA",
  "World Cup": "Majstrovstvá sveta",
  "World Cup - Qualification Europe": "Kvalifikácia MS – Európa",
  "Euro Championship": "Majstrovstvá Európy",
  "Euro Championship - Qualification": "Kvalifikácia ME",
  "Friendlies": "Prípravné zápasy",
};

function translateLeagueName(name) {
  return LEAGUE_NAME_SK[name] ?? name;
}

/** Forma tímu z API (W/D/L) -> slovenské písmená (V/R/P). */
function translateFormLetter(letter) {
  return ({ W: "V", D: "R", L: "P" })[letter] ?? letter;
}

/**
 * Preloží mená tímov vložené priamo vo vete a „Over/Under 2.5“ na „Nad/Pod 2,5“ –
 * len na zobrazenie. Uložené dáta ostávajú v pôvodnom tvare (vyhodnocovanie
 * výsledkov porovnáva presne s nimi).
 */
function translateNamesInText(text, homeOriginal, awayOriginal) {
  if (!text) return "";
  let result = String(text);
  const homeSk = translateTeamName(homeOriginal);
  const awaySk = translateTeamName(awayOriginal);
  if (homeOriginal && homeSk !== homeOriginal) result = result.split(homeOriginal).join(homeSk);
  if (awayOriginal && awaySk !== awayOriginal) result = result.split(awayOriginal).join(awaySk);
  result = result.replace(/\bOver (\d+(?:\.\d+)?)/g, (_m, n) => "Nad " + n.replace(".", ","));
  result = result.replace(/\bUnder (\d+(?:\.\d+)?)/g, (_m, n) => "Pod " + n.replace(".", ","));
  result = result.replace(/(\d)\.(\d)/g, "$1,$2");
  return result;
}

// ---- Čísla po slovensky ----
const NB = " "; // nezlomiteľná medzera pred %
/** Číslo so slovenskou desatinnou čiarkou: fmtNum(1.845, 2) -> "1,85". */
function fmtNum(n, digits) {
  return Number(n).toFixed(digits).replace(".", ",");
}
/** Číslo so znamienkom: +1,5 / −0,8 (typografické mínus). */
function signed(n, digits) {
  return (n > 0 ? "+" : n < 0 ? "−" : "") + fmtNum(Math.abs(n), digits);
}
/** Slovenský tvar podľa počtu: plural(3, "tip", "tipy", "tipov") -> "3 tipy". */
function plural(n, one, few, many) {
  return n + " " + (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
}
function impliedOdds(probability) {
  return probability > 0 ? (100 / probability).toFixed(2) : "-";
}
/** Kurz v slovenskom zápise (1,72). */
function fmtOdds(n) {
  return Number(n).toFixed(2).replace(".", ",");
}
/** Skutočný kurz tipu, ak je známy – inak odhad z pravdepodobnosti (~1,43). */
function tipOddsLabel(t) {
  return typeof t.odds === "number" && t.odds > 1 ? fmtOdds(t.odds) : "~" + impliedOdds(t.probability).replace(".", ",");
}
function pctTxt(v, digits = 0) {
  return v == null || Number.isNaN(v) ? "–" : `${fmtNum(v, digits)}${NB}%`;
}
function clampPercent(v) {
  return Math.max(0, Math.min(100, Number(v) || 0));
}
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function pad2(n) {
  return String(n).padStart(2, "0");
}
function isoDay(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
/** Dnešný dátum podľa miestneho času (YYYY-MM-DD). toISOString() by po polnoci vrátil ešte včerajšok. */
function localToday() {
  return isoDay(new Date());
}
function todayIso() {
  return localToday();
}
function shortDate(d) {
  return `${d.getDate()}. ${d.getMonth() + 1}.`;
}
function longDate(d) {
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
}
function timeHm(d) {
  return d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
}
function dayKeyLabel(key) {
  const [y, m, d] = String(key || "").split("-").map(Number);
  return y ? `${d}. ${m}. ${y}` : "";
}
const MONTH_NAMES = ["Január", "Február", "Marec", "Apríl", "Máj", "Jún", "Júl", "August", "September", "Október", "November", "December"];

// ---- Pravidlá tipov ----
const STRONG_TIP_MIN_PROBABILITY = 70; // STRONG_TIP_MIN_PROBABILITY v oddsMatcher.ts
let MIN_ODDS = 1.55; // predvolené; ak server pošle MIN_ODDS (/api/public/vip-seats), použije sa ten
const EXCLUDED_STATS_MARKETS = ["Dvojšanca", "Presný výsledok", "Čisté konto"];
const MATCH_STARTED_TEXT = "Zápas už začal – tip z neho sa nedá pridať.";
const LIVE_STATUSES = ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT"];
const FINISHED_STATUSES = ["FT", "AET", "PEN"];

/** Zápas už začal (alebo je odložený/zrušený) – tip z neho sa nedá pridať. */
function matchHasStarted(fixture) {
  const status = fixture?.status ?? "NS";
  if (!["NS", "TBD"].includes(status)) return true;
  const t = new Date(fixture?.date).getTime();
  return !isNaN(t) && t <= Date.now();
}
function isOverrideTip(t) {
  return !!t.overrideFilter || (Array.isArray(t.legs) && t.legs.some((l) => l.overrideFilter));
}
/** Minimálny kurz tipu: hodnota aspoň +5 % pri dôvere modelu a zároveň aspoň MIN_ODDS. */
function minOddsFor(bet) {
  if (typeof bet.minOdds === "number") return bet.minOdds;
  const p = (bet.probability ?? 0) / 100;
  return p > 0 ? Math.max(MIN_ODDS, Math.ceil((1.05 / p) * 100) / 100) : MIN_ODDS;
}
function evPct(ev) {
  const p = Math.round((ev - 1) * 100);
  return `${p >= 0 ? "+" : "−"}${Math.abs(p)}${NB}%`;
}
function strongTipBadge(p) {
  if (typeof p === "number" && p < 68)
    return ` <span class="badge-strong" style="opacity:.75" title="Skúšobné pásmo 65 – 67 %: tip sa uloží len na sledovanie – vyhodnotí sa, ale neposiela sa členom a nerátá sa do štatistík.">len sledovať</span>`;
  return typeof p === "number" && p >= STRONG_TIP_MIN_PROBABILITY
    ? ` <span class="badge-strong" title="Dôvera 70 % a viac.">★ 70${NB}%+</span>`
    : "";
}
/** Kurz a hodnota tipu (rovnaké pravidlá ako predtým betOddsHtml). */
function betOddsHtml(bet) {
  if (typeof bet.odds === "number" && bet.odds > 1) {
    const ev = Math.round(((bet.expectedValue ?? 0) - 1) * 100);
    const bk = bet.oddsBookmakers ? ` <span class="faint">· ${bet.oddsBookmakers} stáv.</span>` : "";
    return `<span>Kurz <b>${fmtOdds(bet.odds)}</b>${bk}</span><span>Hodnota <b class="g">${signed(ev, 0)}${NB}%</b></span>`;
  }
  if (typeof bet.minOdds === "number") {
    return `<span><b>Hraj len pri kurze aspoň ${fmtOdds(bet.minOdds)}</b> <span class="faint">(kurz over v stávkovke)</span></span>`;
  }
  return `<span>Kurz ~${impliedOdds(bet.probability).replace(".", ",")} <span class="faint">(odhad – stávkovky kurz neponúkajú)</span></span>`;
}

// ---- Ikony ----
const ICON = {
  zapasy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 5h-5L8 10z"/></svg>',
  tipy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  historia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6"/></svg>',
  clenovia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 010 7M18 14.6c2 .7 3.2 2.5 3.6 5.4"/></svg>',
  nastroje: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>',
  send: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13.1 1.3 11.6c-1-.3-1.1-1 .2-1.5L20.6 2.8c.9-.3 1.6.2 1.3 1.5z"/></svg>',
  result: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M5 4l15 8-15 8 3-8z"/></svg>',
  archive: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M3 5h18v4H3zM5 9v10h14V9M10 13h4"/></svg>',
  unarchive: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M3 5h18v4H3zM5 9v10h14V9M12 17v-5M9.5 14.5 12 12l2.5 2.5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
};

/** Kruh s dôverou okolo percenta. */
function ring(p, size = 64) {
  const v = clampPercent(p);
  const C = 2 * Math.PI * 26;
  return `<div class="ring" style="width:${size}px;height:${size}px" aria-label="Dôvera ${Math.round(v)} %"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="5"/><circle cx="32" cy="32" r="26" fill="none" stroke="url(#ringGrad)" stroke-width="5" stroke-linecap="round" stroke-dasharray="${((C * v) / 100).toFixed(1)} 999"/></svg><b>${Math.round(v)}</b></div>`;
}
function crest(logo, cls = "crest") {
  return logo ? `<img class="${cls}" src="${escapeHtml(logo)}" alt="" loading="lazy" />` : `<span class="${cls}"></span>`;
}
function skeletonHtml(rows = 3) {
  return `<div class="skel-wrap">${Array.from({ length: rows }).map(() => `<div class="skeleton"></div>`).join("")}</div>`;
}

// ---- Toast, fetch ----
function showToast(message) {
  const isError = /zlyhal|chyba|nepodarilo|neplatn|pod minimom|nevyzerá/i.test(message);
  document.querySelectorAll(".toast").forEach((t) => t.remove()); // naraz len jedno hlásenie
  const toast = document.createElement("div");
  toast.className = `toast ${isError ? "toast-error" : "toast-success"}`;
  toast.setAttribute("role", "status");
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-visible"));
  setTimeout(() => {
    toast.classList.remove("toast-visible");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Chyba servera (${res.status})`);
  }
  return data;
}
function postJson(url, body) {
  return fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

// ---- Okná (modály): Escape a klik mimo okna ich zatvoria ----
const modalStack = [];
function openModal(innerHtml, { wide = false, cls = "", onClose } = {}) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal${wide ? " modal-wide" : ""}${cls ? " " + cls : ""}" role="dialog" aria-modal="true">${innerHtml}</div>`;
  document.body.appendChild(overlay);
  document.body.classList.add("modal-open");
  const entry = { overlay, el: overlay.firstElementChild, closed: false };
  entry.close = (result) => {
    if (entry.closed) return;
    entry.closed = true;
    overlay.remove();
    const i = modalStack.indexOf(entry);
    if (i >= 0) modalStack.splice(i, 1);
    if (!modalStack.length) document.body.classList.remove("modal-open");
    if (onClose) onClose(result);
  };
  let downOnBackdrop = false;
  overlay.addEventListener("mousedown", (e) => { downOnBackdrop = e.target === overlay; });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay && downOnBackdrop) entry.close();
  });
  overlay.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => entry.close()));
  modalStack.push(entry);
  return entry;
}

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (modalStack.length) {
    e.preventDefault();
    modalStack[modalStack.length - 1].close();
    return;
  }
  // bez otvoreného okna: na mobile Escape zatvorí analýzu zápasu
  if (document.getElementById("viewZapasy").classList.contains("an-open")) closeMobileAnalysis();
});

/**
 * Okno na zadanie textu v štýle appky (namiesto window.prompt, ktorý Mac appka
 * nepodporuje). Vráti zadaný text, alebo null pri zrušení.
 */
function promptModal(label, value = "") {
  return new Promise((resolve) => {
    const m = openModal(`
      <h3 class="modal-title-sm">${escapeHtml(label)}</h3>
      <input type="text" inputmode="decimal" class="prompt-input" />
      <div class="modal-actions">
        <button type="button" class="btn ghost" data-cancel>Zrušiť</button>
        <button type="button" class="btn" data-ok>OK</button>
      </div>`, { cls: "modal-sm", onClose: (r) => resolve(r == null ? null : r) });
    const input = m.el.querySelector(".prompt-input");
    input.value = value;
    m.el.querySelector("[data-ok]").onclick = () => m.close(input.value);
    m.el.querySelector("[data-cancel]").onclick = () => m.close(null);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); m.close(input.value); }
    });
    setTimeout(() => { input.focus(); input.select(); }, 0);
  });
}

/**
 * Pri každom uložení tipu sa appka spýta na kurz stávkovky (Fortuna, Tipsport,
 * Niké – v API nie sú). Predvyplnený je kurz z API, ak je. Vráti kurz,
 * alebo null = tip neukladať (zrušené alebo kurz pod minimom).
 */
async function askRealOdds(bet) {
  const min = minOddsFor(bet);
  const pre = typeof bet.odds === "number" && bet.odds > 1 ? fmtOdds(bet.odds) : "";
  const raw = await promptModal(`KURZ tvojej stávkovky, napr. 1,85 (minimum ${fmtOdds(min)})`, pre);
  if (raw == null) return null;
  const odd = parseFloat(String(raw).replace(",", "."));
  if (!(odd > 1)) { showToast("Neplatný kurz – tip sa neuložil."); return null; }
  // Poistka: kurz nad 20 pri tipe s dôverou 65 – 80 % je takmer iste preklep (napr. hranica namiesto kurzu).
  if (odd > 20) { showToast(`${fmtOdds(odd)} nevyzerá ako kurz – tip sa neuložil. Zadaj kurz, napr. 1,85.`); return null; }
  if (odd < min) { showToast(`Kurz ${fmtOdds(odd)} je pod minimom ${fmtOdds(min)} – tip sa neuložil, radšej ho vynechaj.`); return null; }
  return Math.round(odd * 100) / 100;
}

/** Výber Telegram kanála: "premium", "free", alebo null = neposielať. */
function askTelegramTarget() {
  return new Promise((resolve) => {
    const m = openModal(`
      <h3>Odoslať do Telegramu?</h3>
      <div class="tg-choices">
        <button type="button" class="btn" id="tgChoicePremium">◆ Členský kanál</button>
        <button type="button" class="btn" id="tgChoiceFree">★ FREE kanál</button>
        <button type="button" class="btn ghost" id="tgChoiceNone">Neposielať</button>
      </div>`, { cls: "modal-sm", onClose: (r) => resolve(r || null) });
    m.el.querySelector("#tgChoicePremium").onclick = () => m.close("premium");
    m.el.querySelector("#tgChoiceFree").onclick = () => m.close("free");
    m.el.querySelector("#tgChoiceNone").onclick = () => m.close(null);
  });
}

/** Skúšobné pásmo (21. 10. 2026): tipy pod 68 % sa ukladajú len na sledovanie (rovnako ako server). */
const WATCH_BELOW = 68;
const isWatchTip = (tip) => !(tip.legs && tip.legs.length) && !tip.manualEntry && typeof tip.probability === "number" && tip.probability < WATCH_BELOW;

async function maybeOfferTelegram(tipId, tip) {
  if (tip && isWatchTip(tip)) {
    showToast(`Tip s dôverou pod ${WATCH_BELOW}${NB}% je uložený len na sledovanie – neposiela sa a nerátá do štatistík.`);
    return;
  }
  const target = await askTelegramTarget();
  if (!target) return;
  try {
    await postJson(`/api/tips/${tipId}/telegram`, { target });
    showToast("Tip odoslaný do kanála na Telegrame.");
  } catch (err) {
    showToast(`Odoslanie do Telegramu zlyhalo: ${err.message}`);
  }
}

// ---- Navigácia (obrazovky) ----
const VIEWS = [
  { id: "zapasy", label: "Zápasy", short: "Zápasy" },
  { id: "tipy", label: "Tipy dňa", short: "Tipy dňa" },
  { id: "historia", label: "História tipov", short: "História" },
  { id: "clenovia", label: "Členovia", short: "Členovia" },
  { id: "nastroje", label: "Nástroje", short: "Nástroje" },
];
let currentView = "zapasy";

function renderNav() {
  const count = fixtureTotalCount ? `<span class="cnt">${fixtureTotalCount}</span>` : "";
  document.getElementById("sideNav").innerHTML = VIEWS.map(
    (v) => `<a href="#${v.id}" data-nav="${v.id}" class="${v.id === currentView ? "on" : ""}">${ICON[v.id]}<span>${v.label}</span>${v.id === "zapasy" ? count : ""}</a>`
  ).join("");
  document.getElementById("tabBar").innerHTML = VIEWS.map(
    (v) => `<a href="#${v.id}" data-nav="${v.id}" class="${v.id === currentView ? "on" : ""}">${ICON[v.id]}<span>${v.short}</span></a>`
  ).join("");
}

function showView(id) {
  if (!VIEWS.some((v) => v.id === id)) id = "zapasy";
  const changed = id !== currentView;
  currentView = id;
  document.querySelectorAll(".view").forEach((s) => { s.hidden = s.dataset.view !== id; });
  renderNav();
  if (changed) window.scrollTo(0, 0);
  if (id === "historia") openTipsHistory();
  if (id === "clenovia") openSubscribers();
  if (id === "tipy") renderDayTipsView();
}
window.addEventListener("hashchange", () => showView(location.hash.slice(1)));
function goTo(id) {
  if (location.hash.slice(1) === id) showView(id);
  else location.hash = id;
}

// ---- Miesta podľa dĺžky členstva: Silver, Gold, Platinum (rovnaké čísla ako na tipradar.eu) ----
function seatsHtml(t) {
  const row = (key, label) => {
    const r = t && t[key];
    let val = "–", full = false, bar = "";
    if (r) {
      // 1 a 3 mesiace sú bez obmedzenia miest (total = null)
      val = r.total == null ? `${r.occupied} čl.` : `${r.occupied} / ${r.total}`;
      full = r.total != null && r.left <= 0;
      if (r.total) bar = `<div class="bar"><i style="width:${Math.min(100, Math.round((r.occupied / r.total) * 100))}%"></i></div>`;
    } else if (key === "season") {
      bar = `<div class="bar"><i style="width:0"></i></div>`;
    }
    return `<div class="r${full ? " full" : ""}">${label}<b>${val}</b></div>${bar}`;
  };
  return `<small>Členstvo</small>${row("m1", "Silver · 1 m.")}${row("m3", "Gold · 3 m.")}${row("season", "Platinum · 6 m.")}`;
}
function renderSeats(terms) {
  document.getElementById("seatBox").innerHTML = seatsHtml(terms);
  document.getElementById("seatBoxMobile").innerHTML = seatsHtml(terms);
}
async function loadSeats() {
  renderSeats(null);
  try {
    const res = await fetch("/api/public/vip-seats", { cache: "no-store" });
    if (!res.ok) throw new Error();
    const d = await res.json();
    if (typeof d.minOdds === "number" && d.minOdds > 1 && d.minOdds < 5) MIN_ODDS = d.minOdds;
    const t = d.terms;
    if (!t || !t.m1 || !t.m3 || !t.season) return;
    renderSeats(t);
  } catch {
    /* pri chybe ostane „–“ */
  }
}
document.getElementById("seatBox").addEventListener("click", () => goTo("clenovia"));

// =====================================================================
// ZÁPASY
// =====================================================================
let selectedLeagueIds = new Set();
let currentFixtures = [];
let lastFixtureResults = [];
let fixtureTotalCount = 0;
let selectedFixtureId = null;
let fixturesLoading = false;
let fixturesPromise = null;
const collapsedLeagues = new Set(); // ligy schované kliknutím, zostáva aj po automatickom obnovení

const matchDateInput = document.getElementById("matchDateInput");
const fixtureListEl = document.getElementById("fixtureList");
const fixtureSearchEl = document.getElementById("fixtureSearch");
const analysisPaneEl = document.getElementById("analysisPane");
const viewZapasyEl = document.getElementById("viewZapasy");

/**
 * Odhadne sezónu (rok jej začiatku) podľa zvoleného dátumu: júl – december patrí
 * do sezóny toho istého roka, január – jún do sezóny predošlého roka.
 */
function guessSeasonFromDate(dateStr) {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  return month >= 7 ? d.getFullYear() : d.getFullYear() - 1;
}
function currentSeason() {
  return guessSeasonFromDate(matchDateInput.value || localToday());
}
function shiftDay(key, delta) {
  const [y, m, d] = key.split("-").map(Number);
  return isoDay(new Date(y, m - 1, d + delta));
}
function syncDayChips() {
  const today = localToday();
  const val = matchDateInput.value || today;
  let matched = false;
  document.querySelectorAll("#dayChips [data-day]").forEach((c) => {
    const on = shiftDay(today, Number(c.dataset.day)) === val;
    c.classList.toggle("on", on);
    if (on) matched = true;
  });
  const chip = document.getElementById("dateChip");
  chip.classList.toggle("on", !matched);
  const [y, m, d] = val.split("-").map(Number);
  document.getElementById("dateChipText").textContent = matched ? "" : `${d}. ${m}.${y !== new Date().getFullYear() ? " " + y : ""}`;
}
function setMatchDate(key) {
  if (!key) return;
  matchDateInput.value = key;
  syncDayChips();
  loadFixtures();
}
document.getElementById("dayChips").addEventListener("click", (e) => {
  const c = e.target.closest("[data-day]");
  if (c) setMatchDate(shiftDay(localToday(), Number(c.dataset.day)));
});
document.getElementById("dateChip").addEventListener("click", () => {
  try {
    matchDateInput.showPicker();
  } catch {
    matchDateInput.focus();
    matchDateInput.click();
  }
});
matchDateInput.addEventListener("change", () => setMatchDate(matchDateInput.value));

async function init() {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F8EDD3"/><stop offset="1" stop-color="#B8995E"/></linearGradient></defs></svg>`
  );
  matchDateInput.value = localToday();
  syncDayChips();
  syncMemberPrice();
  document.getElementById("subStart").value = todayIso();
  updateSubEndPreview();
  showView(location.hash.slice(1) || "zapasy");
  loadSeats();
  try {
    const leagues = await fetchJson("/api/leagues");
    leagues.forEach((league) => selectedLeagueIds.add(league.id)); // všetky ligy sú vždy zahrnuté
  } catch (err) {
    fixtureListEl.innerHTML = `<p class="empty">Ligy sa nepodarilo načítať: ${escapeHtml(err.message)}</p>`;
    return;
  }
  // Appka rovno pri otvorení sama načíta dnešné zápasy – netreba na nič klikať.
  loadFixtures();
}

// Počítadlo načítaní: zoznam smie vykresliť len posledné spustené načítanie
// (inak by pomalšia staršia odpoveď prepísala zvolený deň).
let fixturesRequestId = 0;

function loadFixtures(silent = false) {
  fixturesPromise = doLoadFixtures(silent);
  return fixturesPromise;
}

async function doLoadFixtures(silent) {
  const requestId = ++fixturesRequestId;
  const date = matchDateInput.value || localToday();
  const season = guessSeasonFromDate(date);
  const leagueIds = Array.from(selectedLeagueIds);
  if (!leagueIds.length) return;
  if (!silent) {
    fixturesLoading = true;
    fixtureListEl.innerHTML = skeletonHtml(6);
    updateDayTipsPromo();
  }
  try {
    const results = await Promise.all(
      leagueIds.map(async (leagueId) => {
        try {
          const fixtures = await fetchJson(`/api/fixtures?league=${encodeURIComponent(leagueId)}&season=${season}&date=${date}`);
          return { leagueId, fixtures: Array.isArray(fixtures) ? fixtures : [] };
        } catch (err) {
          return { leagueId, fixtures: [], error: String(err?.message ?? err) };
        }
      })
    );
    if (requestId !== fixturesRequestId) return; // medzitým sa spustilo novšie načítanie
    const failed = results.filter((r) => r.error);
    // Chyby API (napr. vyčerpaný denný limit) nezamlčíme – inak by to vyzeralo ako deň bez zápasov.
    if (failed.length === results.length && failed.length > 0) {
      if (!silent) {
        currentFixtures = [];
        lastFixtureResults = [];
        fixtureTotalCount = 0;
        renderNav();
        fixtureListEl.innerHTML = `<p class="empty">Zápasy sa nepodarilo načítať: ${escapeHtml(failed[0].error)}<br><span class="muted small">Skús to o chvíľu znova. Ak ide o denný limit API, obnoví sa o polnoci.</span></p>`;
      }
      return;
    }
    currentFixtures = results.flatMap((r) => r.fixtures);
    lastFixtureResults = results;
    fixtureTotalCount = currentFixtures.length;
    renderNav();
    renderFixtureList();
  } catch (err) {
    if (!silent && requestId === fixturesRequestId) fixtureListEl.innerHTML = `<p class="empty">Chyba pri načítaní: ${escapeHtml(err.message)}</p>`;
  } finally {
    if (requestId === fixturesRequestId) {
      fixturesLoading = false;
      updateDayTipsPromo();
    }
  }
}

// Appka si sama každé 3 minúty potichu znova natiahne zoznam zápasov,
// aby dohraté zápasy a živé skóre boli aktuálne bez klikania.
setInterval(() => {
  if (selectedLeagueIds.size) loadFixtures(true);
}, 3 * 60 * 1000);

function normText(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function fixtureRowHtml(f) {
  const d = new Date(f.date);
  const isLive = LIVE_STATUSES.includes(f.status);
  const isDone = FINISHED_STATUSES.includes(f.status);
  const liveLabel = f.status === "HT" ? "Polčas" : f.status === "BT" ? "Prestávka" : `${f.elapsed ?? "?"}′`;
  const timeHtml = isLive
    ? `<span class="fx-time live">${liveLabel}</span>`
    : `<span class="fx-time"><time>${escapeHtml(timeHm(d))}</time>${isoDay(d) !== matchDateInput.value ? `<small>${shortDate(d)}</small>` : ""}</span>`;
  const right = isLive
    ? `<span class="live-score"><i class="live-dot"></i>${f.goalsHome ?? 0}:${f.goalsAway ?? 0}</span>`
    : isDone
      ? `<span class="done-score" title="Koniec zápasu">${f.goalsHome ?? 0}:${f.goalsAway ?? 0}</span>`
      : "";
  return `<div class="fx${f.fixtureId === selectedFixtureId ? " on" : ""}" role="button" tabindex="0" data-fid="${f.fixtureId}">
    ${timeHtml}
    <div class="t">
      <div>${crest(f.homeTeam.logo)}<span>${escapeHtml(translateTeamName(f.homeTeam.name))}</span></div>
      <div>${crest(f.awayTeam.logo)}<span>${escapeHtml(translateTeamName(f.awayTeam.name))}</span></div>
    </div>
    ${right}
  </div>`;
}

function renderFixtureList() {
  const results = lastFixtureResults;
  const failed = results.filter((r) => r.error);
  const q = normText(fixtureSearchEl.value.trim());
  const groups = results
    .filter((r) => r.fixtures.length > 0)
    .map((r) => {
      const league = r.fixtures[0].league || {};
      const leagueMatch = q && (normText(league.name).includes(q) || normText(translateLeagueName(league.name)).includes(q));
      const fixtures = !q || leagueMatch
        ? r.fixtures
        : r.fixtures.filter((f) =>
            [f.homeTeam.name, f.awayTeam.name, translateTeamName(f.homeTeam.name), translateTeamName(f.awayTeam.name)].some((n) => normText(n).includes(q))
          );
      return { league, fixtures };
    })
    .filter((g) => g.fixtures.length > 0);

  let html = "";
  if (failed.length) {
    html += `<p class="list-note">Pri ${failed.length} ${failed.length === 1 ? "lige" : "ligách"} sa zápasy nepodarilo načítať: ${escapeHtml(failed[0].error)}</p>`;
  }
  if (!results.some((r) => r.fixtures.length)) {
    html += `<p class="empty">Pre vybrané ligy sa v tento deň nekonajú žiadne zápasy.</p>`;
  } else if (!groups.length) {
    html += `<p class="empty">Pre „${escapeHtml(fixtureSearchEl.value.trim())}“ sa nič nenašlo.</p>`;
  }
  html += groups
    .map(({ league, fixtures }) => {
      const name = league.name ?? "Liga";
      const collapsed = collapsedLeagues.has(name) && !q;
      return `<div class="league-group">
        <button type="button" class="lg" data-league="${escapeHtml(name)}" aria-expanded="${!collapsed}">
          ${league.logo ? `<img class="lg-logo" src="${escapeHtml(league.logo)}" alt="" loading="lazy" />` : ""}
          <span>${escapeHtml(translateLeagueName(name))}</span>
          <em>${plural(fixtures.length, "zápas", "zápasy", "zápasov")}</em>
          <span class="chev">${collapsed ? "▸" : "▾"}</span>
        </button>
        <div class="lg-rows"${collapsed ? " hidden" : ""}>${fixtures.map(fixtureRowHtml).join("")}</div>
      </div>`;
    })
    .join("");
  fixtureListEl.innerHTML = html;
}

fixtureSearchEl.addEventListener("input", () => renderFixtureList());

fixtureListEl.addEventListener("click", (e) => {
  const lg = e.target.closest(".lg");
  if (lg) {
    const name = lg.dataset.league;
    if (collapsedLeagues.has(name)) collapsedLeagues.delete(name);
    else collapsedLeagues.add(name);
    const rows = lg.nextElementSibling;
    const collapsed = collapsedLeagues.has(name);
    rows.hidden = collapsed;
    lg.setAttribute("aria-expanded", String(!collapsed));
    lg.querySelector(".chev").textContent = collapsed ? "▸" : "▾";
    return;
  }
  const row = e.target.closest(".fx");
  if (row) openFixtureRow(row);
});
fixtureListEl.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const row = e.target.closest(".fx");
  if (row) { e.preventDefault(); openFixtureRow(row); }
});

function openFixtureRow(row) {
  const fixture = currentFixtures.find((f) => String(f.fixtureId) === row.dataset.fid);
  if (!fixture) return;
  fixtureListEl.querySelectorAll(".fx.on").forEach((n) => n.classList.remove("on"));
  row.classList.add("on");
  analyzeFixture(fixture);
}

const isMobile = () => window.matchMedia("(max-width: 899px)").matches;
let listScrollY = 0;
function openMobileAnalysis(title) {
  document.getElementById("anMobileTitle").textContent = title;
  if (!isMobile()) return;
  if (!viewZapasyEl.classList.contains("an-open")) listScrollY = window.scrollY;
  viewZapasyEl.classList.add("an-open");
  window.scrollTo(0, 0);
}
function closeMobileAnalysis() {
  viewZapasyEl.classList.remove("an-open");
  requestAnimationFrame(() => window.scrollTo(0, listScrollY));
}
document.getElementById("anBackBtn").addEventListener("click", closeMobileAnalysis);

// ---- Tipy dňa – karta v zozname zápasov ----
function updateDayTipsPromo() {
  const el = document.getElementById("dtPromoText");
  if (fixturesLoading) { el.textContent = "Načítavam zápasy…"; return; }
  const n = currentFixtures.filter((f) => !matchHasStarted(f)).length;
  el.textContent = n ? `Prejde ${plural(n, "zápas", "zápasy", "zápasov")} pred výkopom naraz` : "V tento deň už nie sú zápasy pred výkopom";
}
document.getElementById("dtPromoBtn").addEventListener("click", () => {
  goTo("tipy");
  showDayTips();
});

// =====================================================================
// ANALÝZA ZÁPASU
// =====================================================================
// Počítadlo zobrazení analýzy: vykresliť smie len posledná požiadavka –
// pomalšia staršia odpoveď nesmie prepísať novší výber.
let analysisViewId = 0;

async function analyzeFixture(fixture) {
  const viewId = ++analysisViewId;
  selectedFixtureId = fixture.fixtureId;
  openMobileAnalysis(`${translateTeamName(fixture.homeTeam.name)} – ${translateTeamName(fixture.awayTeam.name)}`);
  analysisPaneEl.innerHTML = skeletonHtml(5);
  if (!isMobile()) window.scrollTo({ top: 0, behavior: "smooth" });
  try {
    const result = await requestAnalysis(fixture);
    if (viewId !== analysisViewId) return; // medzitým bol vybraný iný zápas
    renderAnalysis(result, analysisPaneEl, { onRecalc: () => analyzeFixture(fixture) });
  } catch (err) {
    if (viewId !== analysisViewId) return;
    analysisPaneEl.innerHTML = `<div class="empty">Analýzu sa nepodarilo vypočítať: ${escapeHtml(err.message)}</div>`;
  }
}

function requestAnalysis(fixture) {
  return postJson("/api/analyze", { fixture, leagueId: fixture.league.id, season: fixture.league.season });
}

/** Najväčší počet stávkoviek, z ktorých pochádzajú kurzy tipov zápasu. */
function bookmakersCount(r) {
  const all = [...(r.bestBets || []), ...(r.lowValueBets || []), ...(r.allCandidates || [])];
  return all.reduce((mx, b) => Math.max(mx, Number(b.oddsBookmakers) || 0), 0);
}

function dayWord(d) {
  const key = isoDay(d), today = localToday();
  if (key === today) return "Dnes";
  if (key === shiftDay(today, 1)) return "Zajtra";
  if (key === shiftDay(today, -1)) return "Včera";
  return longDate(d);
}

function renderAnalysis(r, root, opts = {}) {
  const f = r.fixture;
  const home = translateTeamName(f.homeTeam.name);
  const away = translateTeamName(f.awayTeam.name);
  const tr = (text) => translateNamesInText(text, f.homeTeam.name, f.awayTeam.name);
  const started = matchHasStarted(f);
  const kick = new Date(f.date);
  const referee = f.referee || r.referee?.name || "";
  const topBets = r.bestBets || [];

  // --- hlavička ---
  const isLive = LIVE_STATUSES.includes(f.status);
  const isDone = FINISHED_STATUSES.includes(f.status);
  const midBig = (isLive || isDone) && f.goalsHome != null ? `${f.goalsHome}:${f.goalsAway}` : escapeHtml(isNaN(kick) ? "" : timeHm(kick));
  const midSub = [
    isNaN(kick) ? "" : dayWord(kick),
    isLive ? (f.status === "HT" ? "polčas" : `${f.elapsed ?? "?"}. minúta`) : isDone ? "koniec zápasu" : "",
    referee ? `rozhodca ${escapeHtml(referee.split(",")[0])}` : "",
  ].filter(Boolean).join(" · ");
  const header = `
    ${opts.back ? `<button type="button" class="btn ghost sm back-link" data-back>${escapeHtml(opts.back.label)}</button>` : ""}
    <div class="mh">
      <div class="team">${crest(f.homeTeam.logo, "crest crest-lg")}<span>${escapeHtml(home)}</span></div>
      <div class="mid">
        <small>${escapeHtml(translateLeagueName(f.league.name))}</small>
        <b>${midBig}</b>
        <span>${midSub}</span>
        <span class="season">sezóna ${escapeHtml(f.league.season)}</span>
      </div>
      <div class="team">${crest(f.awayTeam.logo, "crest crest-lg")}<span>${escapeHtml(away)}</span></div>
    </div>`;

  // --- stav: zostava, odpočet, odohraté zápasy, kurzy ---
  // Zostavy API zverejňuje zvyčajne asi hodinu pred výkopom. Prepočet načíta analýzu
  // znova – s aktuálnou zostavou (hráč na lavičke = čiastočne chýba) aj aktuálnymi kurzami.
  const lc = r.lineupConfirmed || {};
  const both = lc.home && lc.away;
  const chips = [];
  // Rozhodcu služba často zverejní až deň pred zápasom – dovtedy model ráta karty a fauly bez neho.
  if (referee && !r.referee && !isDone) chips.push(`<span class="st" title="Rozhodca pískal v tejto súťaži menej ako 3 zápasy, preto o ňom nie je dosť štatistík.">Rozhodca má málo zápasov v dátach · karty a fauly bez neho</span>`);
  if (!referee && !isDone) chips.push(`<span class="st" title="Rozhodcu zvyčajne zverejnia deň pred zápasom alebo v deň zápasu. Potom stačí kliknúť na „Prepočítať“.">Rozhodca zatiaľ nie je známy · karty a fauly bez neho</span>`);
  if (!started) {
    chips.push(both ? `<span class="st g">✓ Potvrdená zostava</span>` : `<span class="st">Zostava ešte nie je zverejnená</span>`);
    const mins = Math.round((kick.getTime() - Date.now()) / 60000);
    if (mins > 0 && mins < 24 * 60) chips.push(`<span class="st">Výkop o <b>${mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`}</b></span>`);
  }
  if (r.seasonGamesPlayed) {
    chips.push(`<span class="st" title="Odohratých zápasov v tejto sezóne: ${escapeHtml(home)} ${r.seasonGamesPlayed.home}, ${escapeHtml(away)} ${r.seasonGamesPlayed.away}">Odohraté zápasy: ${escapeHtml(home)} <b>${r.seasonGamesPlayed.home}</b> · ${escapeHtml(away)} <b>${r.seasonGamesPlayed.away}</b></span>`);
  }
  const bk = bookmakersCount(r);
  if (bk > 0) chips.push(`<span class="st">Kurzy z <b>${bk}</b> ${bk === 1 ? "stávkovky" : "stávkoviek"}</span>`);
  else if (r.oddsAvailable === false) chips.push(`<span class="st">Bez kurzov stávkoviek</span>`);
  const lineupBtns = started
    ? ""
    : `${both ? "" : `<button type="button" class="btn ghost xs" data-lineup-check title="Ukáže, čo k zostave vracia API">Skontrolovať API</button>`}
       <button type="button" class="btn ghost xs" data-lineup-recalc>↻ Prepočítať</button>`;
  const lineupNote = started
    ? ""
    : both
      ? "✓ Počítané s potvrdenou zostavou (hráči na lavičke sa rátajú ako čiastočne chýbajúci)."
      : "Zostava ešte nie je zverejnená – zvyčajne býva asi hodinu pred výkopom. Potom klikni na „Prepočítať“.";
  const statusHtml = `
    <div class="status">${chips.join("")}${lineupBtns}</div>
    ${lineupNote ? `<p class="note">${escapeHtml(lineupNote)}</p>` : ""}
    <p class="note" data-lineup-out></p>
    ${r.sampleSizeWarning ? `<div class="warn-box">⚠️ ${escapeHtml(tr(r.sampleSizeWarning))}</div>` : ""}
    ${started ? `<div class="locked">⏱ ${MATCH_STARTED_TEXT}</div>` : ""}`;

  // --- odporúčané tipy (server vracia pásmo 65 – 80 %, max. 1 na trh) ---
  const tipsHtml = topBets.length
    ? `<div class="tips">${topBets
        .map(
          (bet, idx) => `
        <div class="tip${idx === 0 ? " top" : ""}">
          ${ring(bet.probability)}
          <div class="tip-body">
            <div class="k">${idx === 0 ? "Najsilnejší tip · " : ""}${escapeHtml(bet.market)}</div>
            <div class="s">${escapeHtml(tr(bet.selection))}${strongTipBadge(bet.probability)}</div>
            <div class="m"><span>Dôvera <b>${bet.probability.toFixed(0)}${NB}%</b></span>${betOddsHtml(bet)}</div>
            ${bet.explanation ? `<div class="why">${escapeHtml(tr(bet.explanation))}</div>` : ""}
            ${bet.valueWarning ? `<div class="why warn">⚠️ ${escapeHtml(bet.valueWarning)}</div>` : ""}
          </div>
          <button type="button" class="btn${idx === 0 ? "" : " ghost"}" data-bet-idx="${idx}">Uložiť tip</button>
        </div>`
        )
        .join("")}</div>`
    : `<div class="empty-card">Pri tomto zápase nie je žiadny tip v pásme 65 – 80${NB}%${(r.lowValueBets || []).length > 0 ? ", ktorý by prešiel kontrolou kurzu" : ""}.</div>${rejectedBetsHtml(r)}`;

  // --- výsledok zápasu + forma ---
  const pr = r.probabilities || { homeWin: 0, draw: 0, awayWin: 0 };
  const pills = (form) =>
    (form || "").slice(-5).split("").map((x) => `<i class="${x === "W" ? "w" : x === "L" ? "l" : "d"}">${translateFormLetter(x)}</i>`).join("") ||
    `<span class="faint small">bez dát o forme</span>`;
  const outcomeCard = `
    <div class="card">
      <h4 class="ct">Výsledok zápasu</h4>
      <div class="pb">
        <div title="${escapeHtml(home)}"><small>Domáci</small><b>${pctTxt(clampPercent(pr.homeWin))}</b></div>
        <div><small>Remíza</small><b>${pctTxt(clampPercent(pr.draw))}</b></div>
        <div title="${escapeHtml(away)}"><small>Hostia</small><b>${pctTxt(clampPercent(pr.awayWin))}</b></div>
      </div>
      <h4 class="ct" style="margin-top:18px">Forma <span class="faint">posledných 5</span></h4>
      <div class="form-row">
        <div><span class="form-team">${escapeHtml(home)}</span><div class="form">${pills(r.form?.home)}</div></div>
        <div><span class="form-team">${escapeHtml(away)}</span><div class="form">${pills(r.form?.away)}</div></div>
      </div>
    </div>`;

  const calcHtml = lineCalcHtml(r);
  const gridHtml = `<div class="grid2${calcHtml ? "" : " one"}">${calcHtml}${outcomeCard}</div>`;

  // --- karty Štatistiky / Vzájomné zápasy / Tímy ---
  const tabsHtml = `
    <div class="tabs" role="tablist">
      <button type="button" class="on" data-tab="stats" role="tab">Štatistiky</button>
      <button type="button" data-tab="h2h" role="tab">Vzájomné zápasy</button>
      <button type="button" data-tab="teams" role="tab">Tímy</button>
    </div>
    <div data-panel="stats">${statsPanelHtml(r, home, away)}</div>
    <div data-panel="h2h" hidden>${h2hPanelHtml(r, f)}</div>
    <div data-panel="teams" hidden>
      <div class="grid2 even">
        ${teamStatCard(home, r.form?.home, r.form?.homeScore, r.expectedGoals?.home, r.historicalDataInfo && r.historicalDataInfo.home)}
        ${teamStatCard(away, r.form?.away, r.form?.awayScore, r.expectedGoals?.away, r.historicalDataInfo && r.historicalDataInfo.away)}
      </div>
    </div>`;

  root.innerHTML = `
    ${header}
    ${statusHtml}
    <h3 class="sh">Odporúčané tipy <small>pásmo 65 – 80${NB}%, len s hodnotou</small></h3>
    ${tipsHtml}
    <div class="save-msg" data-save-msg></div>
    ${gridHtml}
    ${tabsHtml}
    <p class="disclaimer">
      Toto je štatistický odhad založený na historických dátach (forma, vzájomné zápasy,
      priemer gólov), nie garancia výsledku. Športové stávkovanie nesie finančné riziko –
      stávkuj len sumy, ktoré si môžeš dovoliť stratiť.
    </p>`;

  // --- ovládanie ---
  const back = root.querySelector("[data-back]");
  if (back && opts.back) back.onclick = opts.back.onClick;
  wireLineupBar(r, root, opts.onRecalc);
  wireSaveTipButtons(r, root);
  wireLineCalc(r, root);
  root.querySelectorAll("[data-tab]").forEach((t) => {
    t.onclick = () => {
      root.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("on", x === t));
      root.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== t.dataset.tab; });
    };
  });
  const h2hToggle = root.querySelector("[data-h2h-toggle]");
  if (h2hToggle) {
    h2hToggle.onclick = () => {
      const open = h2hToggle.dataset.open === "1";
      root.querySelectorAll(".h2h-extra").forEach((row) => { row.hidden = open; });
      h2hToggle.dataset.open = open ? "0" : "1";
      h2hToggle.textContent = open ? `+ Zobraziť ďalšie (${h2hToggle.dataset.more})` : "− Skryť";
    };
  }
  if (started) {
    root.querySelectorAll("[data-bet-idx], [data-poss]").forEach((b) => {
      b.disabled = true;
      b.title = MATCH_STARTED_TEXT;
    });
  }
}

function wireLineupBar(r, root, onRecalc) {
  const btn = root.querySelector("[data-lineup-recalc]");
  if (btn) btn.onclick = () => (onRecalc ? onRecalc() : null);
  const check = root.querySelector("[data-lineup-check]");
  const out = root.querySelector("[data-lineup-out]");
  if (!check || !out) return;
  check.onclick = async () => {
    check.disabled = true;
    out.textContent = "Pýtam sa API…";
    try {
      const d = await fetchJson(`/api/debug/lineups/${r.fixture.fixtureId}`);
      if (d.errors?.length) out.textContent = `API vrátilo chybu: ${d.errors.join(" | ")}`;
      else if (!d.teams?.length) out.textContent = `API zostavu k tomuto zápasu zatiaľ nemá (0 tímov, čas kontroly ${timeHm(new Date())}).`;
      else
        out.textContent =
          "API zostavu má: " +
          d.teams.map((t) => `${translateTeamName(t.team)} ${t.startXI} + ${t.substitutes} náhradníkov${t.formation ? ` (${t.formation})` : ""}`).join(", ") +
          ". Klikni na „Prepočítať“.";
    } catch (err) {
      out.textContent = `Kontrola zlyhala: ${err.message}`;
    } finally {
      check.disabled = false;
    }
  };
}

/** Uloženie odporúčaného tipu: kurz zo stávkovky, POST /api/tips, potom Telegram. */
function wireSaveTipButtons(r, root) {
  const msgEl = root.querySelector("[data-save-msg]");
  root.querySelectorAll("[data-bet-idx]").forEach((btn) => {
    btn.onclick = async () => {
      if (matchHasStarted(r.fixture)) { showToast(MATCH_STARTED_TEXT); return; }
      const bet = (r.bestBets || [])[parseInt(btn.dataset.betIdx ?? "0", 10)];
      if (!bet) return;
      const realOdds = await askRealOdds(bet);
      if (realOdds == null) return;
      const tip = buildTip(r, bet, realOdds);
      btn.disabled = true;
      try {
        await postJson("/api/tips", tip);
        btn.textContent = "✓ Uložené";
        msgEl.innerHTML = `✓ Tip uložený (${escapeHtml(bet.market)}: ${escapeHtml(translateNamesInText(bet.selection, r.fixture.homeTeam.name, r.fixture.awayTeam.name))})`;
        await maybeOfferTelegram(tip.id, tip);
      } catch (err) {
        msgEl.innerHTML = `<span class="loss">Uloženie zlyhalo: ${escapeHtml(err.message)}</span>`;
      } finally {
        btn.disabled = false;
      }
    };
  });
}

/** Meranie (20. 10. 2026): verzia modelu a odhad stávkoviek z analýzy – na tip ani správy nemá vplyv. */
function measurementFields(r, bet) {
  const m = r.marketProbs && r.marketProbs[`${bet.market}|${bet.selection}`];
  return {
    ...(r.modelVersion ? { modelVersion: r.modelVersion } : {}),
    ...(m && typeof m.prob === "number" ? { marketProb: m.prob, marketProbDevig: !!m.devig } : {}),
  };
}

function buildTip(r, bet, realOdds, extra = {}) {
  return {
    id: `${r.fixture.fixtureId}-${Date.now()}`,
    fixtureId: r.fixture.fixtureId,
    leagueId: r.fixture.league.id,
    season: r.fixture.league.season,
    leagueName: r.fixture.league.name,
    homeTeam: r.fixture.homeTeam.name,
    awayTeam: r.fixture.awayTeam.name,
    homeTeamLogo: r.fixture.homeTeam.logo,
    awayTeamLogo: r.fixture.awayTeam.logo,
    matchDate: r.fixture.date,
    market: bet.market,
    selection: bet.selection,
    probability: bet.probability,
    odds: realOdds,
    ...(typeof bet.odds === "number" ? { apiOdds: bet.odds } : {}),
    ...measurementFields(r, bet),
    ...extra,
    savedAt: new Date().toISOString(),
    status: "pending",
  };
}

// ---- Kalkulačka hranice zo stávkovky (17. 10. 2026) ----
// Stávkovky majú často inú hranicu, ako model našiel v API. Michal zadá hranicu
// a kurzy a appka spočíta šancu rovnakým rozdelením ako model (Poisson, pri kartách
// a strelách negatívne binomické) vrátane kalibrácie trhu. Držanie lopty: normálne rozdelenie.
function normCdf(x) {
  // Abramowitz–Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
function poissonUnder(mean, line) {
  let pmf = Math.exp(-mean), under = 0;
  for (let k = 0; k <= Math.floor(line); k++) {
    under += pmf;
    pmf = (pmf * mean) / (k + 1);
  }
  return Math.min(1, under);
}
function negBinUnder(mean, line, varRatio) {
  if (!(mean > 0) || varRatio <= 1.0001) return poissonUnder(Math.max(mean, 0.01), line);
  const rr = mean / (varRatio - 1);
  const p = rr / (rr + mean);
  let pmf = Math.pow(p, rr), under = 0;
  for (let k = 0; k <= Math.floor(line); k++) {
    under += pmf;
    pmf = pmf * ((k + rr) / (k + 1)) * (1 - p);
  }
  return Math.min(1, Math.max(0, under));
}
function lineMarketLabel(r, market) {
  const h = translateTeamName(r.fixture.homeTeam.name), a = translateTeamName(r.fixture.awayTeam.name);
  if (market.endsWith(" domácich")) return `${market.replace(/ domácich$/, "")} – ${h}`;
  if (market.endsWith(" hostí")) return `${market.replace(/ hostí$/, "")} – ${a}`;
  return market;
}

/** Tipy v pásme 65 – 80 %, ktoré neprešli kontrolou – s dôvodom (aby bolo vidno, prečo je deň bez tipu). */
function rejectedBetsHtml(r) {
  const list = (r.lowValueBets || []).filter((b) => b.rejectReason);
  if (!list.length) return "";
  const rows = [...list]
    .sort((a, b) => b.probability - a.probability)
    .map((b) => `<tr><td>${escapeHtml(b.market)}: ${escapeHtml(translateNamesInText(b.selection, r.fixture.homeTeam.name, r.fixture.awayTeam.name))}</td><td class="num">${b.probability.toFixed(0)}${NB}%</td><td class="num">${typeof b.odds === "number" ? fmtOdds(b.odds) : "–"}</td><td>${escapeHtml(b.rejectReason)}</td></tr>`)
    .join("");
  return `<details class="card" style="margin-top:12px"><summary class="small">Prečo tipy neprešli (${list.length})</summary>
    <div class="table-wrap"><table class="bt-table"><thead><tr><th>Tip</th><th class="num">Dôvera</th><th class="num">Kurz</th><th>Dôvod</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}

function lineCalcHtml(r) {
  const models = r.lineModels || [];
  // V Lige majstrov a Európskej lige stávkovky držanie lopty neponúkajú – kalkulačka ho neukáže.
  const poss = [2, 3].includes(Number(r.fixture?.league?.id)) ? null : r.possession;
  if (!models.length && !poss) return "";
  const h = translateTeamName(r.fixture.homeTeam.name), a = translateTeamName(r.fixture.awayTeam.name);
  const possOpts = poss
    ? [["home", h, poss.expectedHome], ["away", a, 100 - poss.expectedHome]]
        .map(([side, name, exp]) => `<option value="poss-${side}">Držanie lopty – ${escapeHtml(name)} (čaká ${exp.toFixed(0)} %)</option>`)
        .join("")
    : "";
  return `
    <div class="card calc">
      <h4 class="ct">Kalkulačka hranice tvojej stávkovky</h4>
      <p class="faint small calc-intro">Ak má stávkovka inú hranicu ako tip vyššie, zadaj jej hranicu a kurzy. Appka spočíta šancu rovnako ako model.</p>
      <select data-lc="market" aria-label="Trh">${models
        .map((m, i) => `<option value="${i}">${escapeHtml(lineMarketLabel(r, m.market))} (čaká ${fmtNum(m.mean, 1)})</option>`)
        .join("")}${possOpts}</select>
      <div class="f">
        <label>Hranica<input type="text" data-lc="line" inputmode="decimal" placeholder="napr. 24,5" /></label>
        <label><span data-lc="overLabel">Kurz viac ako</span><input type="text" data-lc="over" inputmode="decimal" placeholder="napr. 1,85" /></label>
        <label>Kurz menej ako<input type="text" data-lc="under" inputmode="decimal" placeholder="napr. 1,90" /></label>
      </div>
      <button type="button" class="btn ghost sm calc-btn" data-lc="calc">Vypočítať</button>
      <div class="res" data-lc="result"></div>
    </div>`;
}

function wireLineCalc(r, root) {
  const q = (k) => root.querySelector(`[data-lc="${k}"]`);
  const btn = q("calc");
  if (!btn) return;
  const out = q("result"), sel = q("market"), lineEl = q("line"), overLabel = q("overLabel");
  const isPoss = () => sel.value.startsWith("poss-");
  // pri držaní lopty je hranica v % a stávkovky píšu „a viac“
  const syncHints = () => {
    lineEl.placeholder = isPoss() ? "napr. 55,5" : "napr. 24,5";
    overLabel.textContent = isPoss() ? "Kurz a viac" : "Kurz viac ako";
    out.innerHTML = "";
  };
  sel.onchange = syncHints;
  syncHints();
  const oddOf = (el) => {
    const v = parseFloat(String(el.value).replace(",", "."));
    return v > 1 && v <= 20 ? Math.round(v * 100) / 100 : null;
  };
  const calcPossession = (side, line) => {
    if (!(line > 0 && line < 100)) { out.innerHTML = `<p class="faint small">Zadaj hranicu v %, napr. 55,5.</p>`; return; }
    const exp = side === "home" ? r.possession.expectedHome : 100 - r.possession.expectedHome;
    const over = (1 - normCdf((line - exp) / r.possession.sd)) * 100;
    const teamName = translateTeamName(side === "home" ? r.fixture.homeTeam.name : r.fixture.awayTeam.name);
    const market = side === "home" ? "Držanie lopty domácich" : "Držanie lopty hostí";
    const lineTxt = String(line).replace(".", ",");
    renderCalcRows(out, r, market, [
      { label: `${teamName} ${lineTxt} % a viac`, selection: `Over ${line}`, probability: over, odds: oddOf(q("over")) },
      { label: `${teamName} menej ako ${lineTxt} %`, selection: `Under ${line}`, probability: 100 - over, odds: oddOf(q("under")) },
    ]);
  };
  const calc = () => {
    const line = parseFloat(String(lineEl.value).replace(",", "."));
    if (isPoss()) { if (r.possession) calcPossession(sel.value.slice(5), line); return; }
    const m = (r.lineModels || [])[Number(sel.value)];
    if (!m) return;
    if (!(line > 0) || Math.abs((line % 1) - 0.5) > 1e-9) {
      out.innerHTML = `<p class="faint small">Zadaj hranicu s ,5 – napr. 24,5.</p>`;
      return;
    }
    let under = negBinUnder(m.mean, line, m.varRatio) * 100;
    // rovnaká kalibrácia trhu ako pri tipoch modelu (stiahne šancu bližšie k 50 %)
    if (m.calibration < 1) under = 50 + m.calibration * (under - 50);
    const name = lineMarketLabel(r, m.market);
    const lineTxt = String(line).replace(".", ",");
    renderCalcRows(out, r, m.market, [
      { label: `${name} viac ako ${lineTxt}`, selection: `Over ${line}`, probability: 100 - under, odds: oddOf(q("over")) },
      { label: `${name} menej ako ${lineTxt}`, selection: `Under ${line}`, probability: under, odds: oddOf(q("under")) },
    ]);
  };
  btn.onclick = calc;
  ["line", "over", "under"].forEach((k) => {
    q(k).addEventListener("keydown", (e) => { if (e.key === "Enter") calc(); });
  });
}

/**
 * Spoločné vyhodnotenie kalkulačky: šanca 65 – 80 %, a ak je zadaný kurz, tak aspoň
 * MIN_ODDS (1,55) a výhodnosť (šanca × kurz) 1,05 – 1,25. Ak vyhovujú obe strany
 * a obe majú kurz, odporučí sa len tá výhodnejšia. rows: [{ label, selection, probability, odds }].
 */
function renderCalcRows(out, r, market, rows) {
  rows.forEach((x) => {
    if (x.odds != null) {
      x.ev = (x.probability / 100) * x.odds;
      x.ok = x.probability >= 65 && x.probability <= 80 && x.odds >= MIN_ODDS && x.ev >= 1.05 && x.ev <= 1.25;
    } else {
      x.ok = x.probability >= 65 && x.probability <= 80;
    }
  });
  const good = rows.filter((x) => x.ok);
  if (good.length > 1 && good.every((x) => x.ev != null)) {
    const best = good.reduce((a, b) => (b.ev > a.ev ? b : a));
    rows.forEach((x) => { x.ok = x === best; });
  }
  const whyNot = (x) => {
    if (x.probability < 65 || x.probability > 80) return `Mimo pásma 65 – 80${NB}% – neodporúčame.`;
    if (x.odds < MIN_ODDS) return `Kurz pod ${fmtOdds(MIN_ODDS)} – neodporúčame.`;
    if (x.ev < 1.05) return `Kurz je na túto šancu nízky (výhodnosť ${evPct(x.ev)}) – neodporúčame.`;
    if (x.ev > 1.25) return `Podozrivo vysoká výhodnosť (${evPct(x.ev)}), model sa asi mýli – neodporúčame.`;
    return "Druhá možnosť je výhodnejšia.";
  };
  out.innerHTML = rows
    .map((x, i) => {
      const min = minOddsFor({ probability: x.probability });
      const info = x.odds != null
        ? `Odporúčame · kurz <b>${fmtOdds(x.odds)}</b> · výhodnosť <b>${evPct(x.ev)}</b>`
        : `Hraj len pri kurze aspoň <b>${fmtOdds(min)}</b>`;
      const oddsTxt = x.odds != null ? ` · kurz ${fmtOdds(x.odds)}` : "";
      return `<div class="res-row ${x.ok ? "ok" : "no"}">
          <div class="res-top"><span>${escapeHtml(x.label)}${oddsTxt}</span><b>${x.probability.toFixed(0)}${NB}%</b></div>
          ${x.ok
            ? `<div class="res-act"><span class="small">${info}</span><button type="button" class="btn sm" data-poss="${i}">Uložiť tento tip</button></div>`
            : `<div class="res-why">${whyNot(x)}</div>`}
        </div>`;
    })
    .join("");
  out.querySelectorAll("[data-poss]").forEach((b) => {
    if (matchHasStarted(r.fixture)) { b.disabled = true; b.title = MATCH_STARTED_TEXT; }
    b.onclick = async () => {
      if (matchHasStarted(r.fixture)) { showToast(MATCH_STARTED_TEXT); return; }
      const x = rows[Number(b.dataset.poss)];
      const odds = x.odds ?? (await askRealOdds({ probability: x.probability }));
      if (odds == null) return;
      const tip = {
        id: `${r.fixture.fixtureId}-${Date.now()}`,
        fixtureId: r.fixture.fixtureId,
        leagueId: r.fixture.league.id,
        season: r.fixture.league.season,
        leagueName: r.fixture.league.name,
        homeTeam: r.fixture.homeTeam.name,
        awayTeam: r.fixture.awayTeam.name,
        homeTeamLogo: r.fixture.homeTeam.logo,
        awayTeamLogo: r.fixture.awayTeam.logo,
        matchDate: r.fixture.date,
        market,
        selection: x.selection,
        probability: Math.round(x.probability * 10) / 10,
        odds,
        savedAt: new Date().toISOString(),
        status: "pending",
      };
      b.disabled = true;
      try {
        await postJson("/api/tips", tip);
        b.textContent = "✓ Uložené";
        await maybeOfferTelegram(tip.id, tip);
      } catch (err) {
        showToast(`Uloženie zlyhalo: ${err?.message ?? String(err)}`);
        b.disabled = false;
      }
    };
  });
}

// ---- Štatistiky zápasu (porovnanie domácich a hostí) ----
function cmpRow(label, hv, av, digits, unit = "") {
  if (!(Number.isFinite(hv) && Number.isFinite(av))) return "";
  const sum = hv + av;
  const hp = sum > 0 ? (hv / sum) * 100 : 50;
  return `<div class="cmp-item"><div class="lb">${escapeHtml(label)}</div><div class="row"><b>${fmtNum(hv, digits)}${unit}</b><div class="dual"><i style="width:${hp.toFixed(1)}%"></i><i style="width:${(100 - hp).toFixed(1)}%"></i></div><b>${fmtNum(av, digits)}${unit}</b></div></div>`;
}

function statsPanelHtml(r, home, away) {
  const models = r.lineModels || [];
  const mean = (name) => {
    const m = models.find((x) => x.market === name);
    return m && Number.isFinite(m.mean) ? m.mean : null;
  };
  const rows = [];
  if (r.expectedGoals) rows.push(cmpRow("Očakávané góly", r.expectedGoals.home, r.expectedGoals.away, 2));
  for (const base of ["Rohy", "Karty", "Strely na bránu"]) {
    const h = mean(`${base} domácich`), a = mean(`${base} hostí`);
    if (h != null && a != null) rows.push(cmpRow(base === "Karty" ? "Žlté karty" : base, h, a, 1));
  }
  if (r.possession && Number.isFinite(r.possession.expectedHome)) {
    rows.push(cmpRow("Držanie lopty", r.possession.expectedHome, 100 - r.possession.expectedHome, 0, `${NB}%`));
  }
  if (r.form && Number.isFinite(r.form.homeScore)) rows.push(cmpRow("Vážené skóre formy (z 3,00)", r.form.homeScore, r.form.awayScore, 2));
  if (r.teamSeasonGoalsPerGame) rows.push(cmpRow("Góly na zápas v sezóne", Number(r.teamSeasonGoalsPerGame.home), Number(r.teamSeasonGoalsPerGame.away), 2));

  // očakávané hodnoty za celý zápas
  const totals = [];
  const pushTotal = (label, v, digits = 1) => { if (v != null && Number.isFinite(v)) totals.push(`<div><small>${label}</small><b>${fmtNum(v, digits)}</b></div>`); };
  pushTotal("Góly", mean("Góly") ?? (r.expectedGoals ? r.expectedGoals.home + r.expectedGoals.away : null), 2);
  pushTotal("Rohy", mean("Rohy") ?? r.corners?.expected);
  pushTotal("Žlté karty", mean("Karty") ?? r.cards?.expected);
  pushTotal("Strely na bránu", mean("Strely na bránu") ?? r.shotsOnGoal?.expected);
  pushTotal("Fauly", mean("Fauly") ?? r.fouls?.expected);
  pushTotal("Ofsajdy", r.offsides?.expected);

  const ref = r.referee;
  const factor = (v) => (Number.isFinite(v) ? `${signed(Math.round((v - 1) * 100), 0)}${NB}%` : "–");
  const refHtml = ref
    ? `<div class="card ref-card">
        <h4 class="ct">Rozhodca</h4>
        <div class="ref-name">${escapeHtml(ref.name)} <span class="faint small">· ${plural(ref.games, "zápas", "zápasy", "zápasov")} v dátach</span></div>
        <div class="kv-grid">
          ${ref.avgFouls != null ? `<div><small>Priemer faulov</small><b>${fmtNum(ref.avgFouls, 1)}</b></div>` : ""}
          ${ref.avgCards != null ? `<div><small>Priemer žltých kariet</small><b>${fmtNum(ref.avgCards, 1)}</b></div>` : ""}
          <div><small>Vplyv na fauly</small><b>${factor(ref.foulsFactor)}</b></div>
          <div><small>Vplyv na karty</small><b>${factor(ref.cardsFactor)}</b></div>
        </div>
      </div>`
    : r.fixture.referee
      ? `<div class="card ref-card">
        <h4 class="ct">Rozhodca</h4>
        <div class="ref-name">${escapeHtml(String(r.fixture.referee).split(",")[0])}</div>
        <p class="muted small">V tejto súťaži pískal zatiaľ menej ako 3 zápasy, takže o ňom nie je dosť štatistík. Model pri kartách a fauloch počíta len s tímami.</p>
      </div>`
      : "";

  const cmp = rows.filter(Boolean).join("");
  if (!cmp && !totals.length && !refHtml) return `<div class="empty-card">Štatistiky pre tento zápas nie sú k dispozícii.</div>`;
  return `
    ${cmp ? `<div class="card cmp"><div class="cmp-head"><span>${escapeHtml(home)}</span><span>${escapeHtml(away)}</span></div>${cmp}<p class="faint small">Očakávania modelu na tento zápas (rohy, karty a strely podľa celej sezóny).</p></div>` : ""}
    ${totals.length ? `<div class="card"><h4 class="ct">Očakávané v celom zápase</h4><div class="kv-grid">${totals.join("")}</div></div>` : ""}
    ${refHtml}`;
}

function h2hPanelHtml(r, f) {
  const h = r.headToHead;
  if (!h) return `<div class="empty-card">Vzájomné zápasy nie sú k dispozícii.</div>`;
  const home = translateTeamName(f.homeTeam.name), away = translateTeamName(f.awayTeam.name);
  const matches = h.matches || [];
  const list = matches
    .map((m, idx) => {
      const d = new Date(m.date);
      const date = isNaN(d.getTime()) ? "" : longDate(d);
      const hn = translateTeamName(m.homeWasHome ? f.homeTeam.name : f.awayTeam.name);
      const an = translateTeamName(m.homeWasHome ? f.awayTeam.name : f.homeTeam.name);
      const hg = m.homeWasHome ? m.homeGoals : m.awayGoals;
      const ag = m.homeWasHome ? m.awayGoals : m.homeGoals;
      return `<div class="h2h-row${m.usedInModel ? "" : " h2h-old"}${idx >= 5 ? " h2h-extra" : ""}"${idx >= 5 ? " hidden" : ""}><span class="faint">${date}</span><span>${escapeHtml(hn)} <b>${hg} : ${ag}</b> ${escapeHtml(an)}</span></div>`;
    })
    .join("");
  return `<div class="card">
    <h4 class="ct">Posledných ${h.matchesConsidered} vzájomných zápasov</h4>
    <div class="pb">
      <div><small>Výhry ${escapeHtml(home)}</small><b>${h.homeWins}</b></div>
      <div><small>Remízy</small><b>${h.draws}</b></div>
      <div><small>Výhry ${escapeHtml(away)}</small><b>${h.awayWins}</b></div>
    </div>
    ${matches.length ? `<div class="h2h-list">${list}</div>
      ${matches.length > 5 ? `<button type="button" class="btn ghost xs" data-h2h-toggle data-more="${matches.length - 5}">+ Zobraziť ďalšie (${matches.length - 5})</button>` : ""}
      <p class="faint small">${
        h.usedInModel
          ? `Model započítal ${h.usedInModel} ${h.usedInModel >= 5 ? "najnovších zápasov" : "najnovšie zápasy"} za posledných 5 rokov (sivé nie).`
          : "Menej ako 3 vzájomné zápasy za posledných 5 rokov – do odhadu sa nezapočítali."
      }</p>` : ""}
  </div>`;
}

function teamStatCard(name, form, formScore, xg, historyInfo) {
  const pills = (form || "")
    .slice(-5)
    .split("")
    .map((x) => `<i class="${x === "W" ? "w" : x === "L" ? "l" : "d"}">${translateFormLetter(x)}</i>`)
    .join("");
  return `
    <div class="card">
      <h4 class="ct">${escapeHtml(name)}</h4>
      <div class="form">${pills || '<span class="faint small">bez dát o forme</span>'}</div>
      <div class="stat-line"><span>Vážené skóre formy</span><b>${Number.isFinite(formScore) ? fmtNum(formScore, 2) : "–"} / 3,00</b></div>
      <div class="stat-line"><span>Očakávané góly</span><b>${Number.isFinite(xg) ? fmtNum(xg, 2) : "–"}</b></div>
      <div class="stat-line"><span>Historické sezóny použité</span><b>${historyInfo ? `${historyInfo.seasonsUsed} / ${historyInfo.seasonsChecked}` : "0 (nenájdené)"}</b></div>
    </div>`;
}

// =====================================================================
// TIPY DŇA – všetky odporúčané tipy zo všetkých zápasov dňa, od najvyššej dôvery
// =====================================================================
const dayTipsPaneEl = document.getElementById("dayTipsPane");
const dtRunBtn = document.getElementById("dtRunBtn");
let dayTips = { items: [], analyzed: 0, failed: 0, date: "", ran: false };
// Kurzy zadané v Tipoch dňa a už uložené tipy (podľa poradia v zozname); nová analýza ich vynuluje.
let dayTipOdds = {};
let dayTipSaved = new Set();
let dayTipsRun = { running: false, done: 0, total: 0, id: 0 };
let dayTipsDetail = null; // otvorený zápas z Tipov dňa
let dayTipsViewId = 0;
let strongIdx = -1;

function kickoffTime(fixture) {
  const d = new Date(fixture?.date);
  return isNaN(d.getTime()) ? "" : timeHm(d);
}

async function showDayTips() {
  if (dayTipsRun.running) return;
  dayTipsDetail = null;
  if (fixturesLoading && fixturesPromise) {
    dayTipsPaneEl.innerHTML = `<div class="empty-card">Zápasy sa ešte načítavajú…</div>`;
    await fixturesPromise.catch(() => {});
  }
  const fixtures = currentFixtures.filter((f) => !matchHasStarted(f));
  const date = matchDateInput.value || localToday();
  if (fixtures.length === 0) {
    dayTips = { items: [], analyzed: 0, failed: 0, date, ran: true, none: true };
    renderDayTipsView();
    return;
  }
  const runId = ++dayTipsRun.id;
  dayTipsRun = { running: true, done: 0, total: fixtures.length, id: runId };
  renderDayTipsView();
  const items = [];
  let failed = 0;
  const failedList = [];
  // Zápasy analyzujeme jeden po druhom – šetrne k limitu požiadaviek API,
  // aby boli výsledky pri každom načítaní rovnaké a úplné.
  for (const f of fixtures) {
    try {
      const r = await requestAnalysis(f);
      for (const bet of r?.bestBets || []) items.push({ r, bet });
    } catch (e) {
      failed++;
      failedList.push({ match: `${translateTeamName(f.homeTeam.name)} – ${translateTeamName(f.awayTeam.name)}`, why: (e && e.message) || "neznáma chyba" });
    }
    dayTipsRun.done++;
    if (currentView === "tipy" && !dayTipsDetail) renderDayTipsProgress();
  }
  items.sort((a, b) => b.bet.probability - a.bet.probability);
  dayTips = { items, analyzed: fixtures.length, failed, failedList, date, ran: true };
  dayTipOdds = {}; dayTipSaved = new Set();
  dayTipsRun.running = false;
  computeStrongIdx();
  if (!dayTipsDetail) renderDayTipsView();
  else updateDtRunBtn();
}

// Kandidát na silný tip dňa: najvyššia dôvera (aspoň 70 %), pri zhode vyšší kurz, potom skorší výkop – rovnako ako na serveri.
function computeStrongIdx() {
  strongIdx = -1;
  dayTips.items.forEach(({ r, bet }, i) => {
    if (typeof bet.probability !== "number" || bet.probability < STRONG_TIP_MIN_PROBABILITY) return;
    if (strongIdx < 0) { strongIdx = i; return; }
    const cur = dayTips.items[strongIdx];
    const a = [bet.probability, bet.odds ?? 0, -new Date(r.fixture.date).getTime()];
    const b = [cur.bet.probability, cur.bet.odds ?? 0, -new Date(cur.r.fixture.date).getTime()];
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) { if (a[k] > b[k]) strongIdx = i; return; }
  });
}

function updateDtRunBtn() {
  dtRunBtn.disabled = dayTipsRun.running;
  dtRunBtn.textContent = dayTipsRun.running ? "Analyzujem…" : dayTips.ran ? "Analyzovať znova" : "Spustiť analýzu";
  const date = dayTips.ran ? dayTips.date : matchDateInput.value || localToday();
  document.getElementById("dtDateLabel").textContent = dayKeyLabel(date);
}

function renderDayTipsProgress() {
  const p = dayTipsRun;
  const pct = p.total ? (p.done / p.total) * 100 : 0;
  dayTipsPaneEl.innerHTML = `<div class="card progress-card">
    <b>Analyzujem zápasy dňa… ${p.done} / ${p.total}</b>
    <div class="bar big"><i style="width:${pct.toFixed(1)}%"></i></div>
    <p class="faint small">Prvé načítanie chvíľu trvá, ďalšie sú rýchle. Môžeš medzitým prejsť na inú obrazovku.</p>
  </div>`;
  updateDtRunBtn();
}

function renderDayTipsView() {
  updateDtRunBtn();
  if (dayTipsDetail) { renderDayTipDetail(dayTipsDetail); return; }
  if (dayTipsRun.running) { renderDayTipsProgress(); return; }
  if (!dayTips.ran) {
    const n = currentFixtures.filter((f) => !matchHasStarted(f)).length;
    dayTipsPaneEl.innerHTML = `<div class="card intro-card">
      <h3 class="sh" style="margin-top:0">Všetky odporúčané tipy dňa naraz</h3>
      <p class="muted">Appka prejde všetky zápasy vybraného dňa pred výkopom${fixturesLoading ? "" : ` (${plural(n, "zápas", "zápasy", "zápasov")})`} a ukáže všetky tipy, ktoré prešli pravidlami (65 – 80${NB}% a kontrola kurzu), zoradené od najvyššej dôvery.</p>
      <button type="button" class="btn" data-dt-start>Spustiť analýzu</button>
    </div>`;
    dayTipsPaneEl.querySelector("[data-dt-start]").onclick = () => showDayTips();
    return;
  }
  if (dayTips.none) {
    dayTipsPaneEl.innerHTML = `<div class="empty-card">V tento deň (${escapeHtml(dayKeyLabel(dayTips.date))}) už nie sú žiadne zápasy pred výkopom.</div>`;
    return;
  }
  const otherDate = dayTips.date !== (matchDateInput.value || localToday());
  const rows = dayTips.items
    .map(({ r, bet }, i) => {
      const f = r.fixture;
      return `
      <div class="dtip${i === 0 ? " top" : ""}">
        <div class="rank">${i + 1}.</div>
        ${ring(bet.probability, 54)}
        <div class="dtip-body">
          <button type="button" class="dtip-match" data-open="${i}" title="Otvoriť detail zápasu">
            <span class="faint">${escapeHtml(kickoffTime(f))}</span> ${escapeHtml(translateTeamName(f.homeTeam.name))} – ${escapeHtml(translateTeamName(f.awayTeam.name))}
            <span class="faint small">· ${escapeHtml(translateLeagueName(f.league.name))}</span>
          </button>
          <div class="s">${escapeHtml(bet.market)}: <b>${escapeHtml(translateNamesInText(bet.selection, f.homeTeam.name, f.awayTeam.name))}</b>${strongTipBadge(bet.probability)}</div>
          <div class="m"><span>Dôvera <b>${bet.probability.toFixed(0)}${NB}%</b></span>${betOddsHtml(bet)}</div>
          ${bet.valueWarning ? `<div class="why warn">⚠️ ${escapeHtml(bet.valueWarning)}</div>` : ""}
        </div>
        <div class="dtip-odds">
          <label class="odds-in"><span>Kurz v stávkovke</span><input type="text" inputmode="decimal" autocomplete="off" data-odds="${i}" placeholder="min ${fmtOdds(minOddsFor(bet))}" value="${escapeHtml(dayTipOdds[i] ?? "")}"${dayTipSaved.has(i) ? " disabled" : ""} /></label>
          <span class="odds-st" data-odds-st="${i}"></span>
          <button type="button" class="btn sm${i === 0 ? "" : " ghost"}" data-save="${i}"${dayTipSaved.has(i) ? " disabled" : ""}>${dayTipSaved.has(i) ? "✓ Uložené" : "Uložiť"}</button>
        </div>
      </div>`;
    })
    .join("");
  dayTipsPaneEl.innerHTML = `
    <p class="muted small dt-meta">
      ${plural(dayTips.items.length, "tip", "tipy", "tipov")} · analyzované: ${plural(dayTips.analyzed, "zápas", "zápasy", "zápasov")} pred výkopom · zoradené od najvyššej dôvery${
        dayTips.failed ? ` · <span class="loss">${dayTips.failed} sa nepodarilo analyzovať</span>` : ""
      }${otherDate ? ` · <span class="gold">výsledky sú pre ${escapeHtml(dayKeyLabel(dayTips.date))}</span>` : ""}
    </p>
    ${(dayTips.failedList || []).length ? `<p class="muted small dt-failed">Neanalyzované: ${dayTips.failedList.map((x) => `<b>${escapeHtml(x.match)}</b> (${escapeHtml(x.why)})`).join(", ")}. Skús „Analyzovať znova“, často ide len o chvíľkový výpadok dát.</p>` : ""}
    ${rows ? `<div class="dt-bulk">
      <p class="small muted">Zadaj kurzy zo svojej stávkovky priamo do riadkov (Enter skočí na ďalší) a ulož všetky naraz. Tipy pod minimálnym kurzom sa neuložia.</p>
      <div class="dt-bulk-row">
        <label class="small">Telegram <select id="dtBulkTg"><option value="premium">◆ Členský kanál</option><option value="free">★ FREE kanál</option><option value="">Neposielať</option></select></label>
        <button type="button" class="btn" id="dtBulkSave" disabled>Uložiť všetky s kurzom</button>
      </div>
    </div><div class="dtips">${rows}</div>` : `<div class="empty-card">V tento deň nie je žiadny tip, ktorý by prešiel pravidlami (65 – 80${NB}% a kontrola kurzu).</div>`}`;

  dayTipsPaneEl.querySelectorAll("[data-open]").forEach((btn) => {
    btn.onclick = () => {
      const item = dayTips.items[Number(btn.dataset.open)];
      if (!item) return;
      dayTipsDetail = item.r;
      ++dayTipsViewId;
      renderDayTipDetail(item.r);
      window.scrollTo(0, 0);
    };
  });
  // Kurzy zo stávkovky: zadávajú sa priamo v riadkoch, hneď vidno, či kurz stačí.
  const oddsState = (i) => {
    const item = dayTips.items[i];
    const odd = parseOddsInput(dayTipOdds[i]);
    if (!item || odd == null) return { ok: false, odd: null };
    const min = minOddsFor(item.bet);
    return { ok: odd >= min && odd <= 20, odd, min };
  };
  const refreshOdds = () => {
    let n = 0;
    dayTipsPaneEl.querySelectorAll("[data-odds-st]").forEach((el) => {
      const i = Number(el.dataset.oddsSt);
      if (dayTipSaved.has(i)) { el.textContent = ""; el.className = "odds-st"; return; }
      const st = oddsState(i);
      el.className = "odds-st" + (st.odd == null ? "" : st.ok ? " ok" : " bad");
      el.textContent = st.odd == null ? "" : st.ok ? "✓ má hodnotu" : st.odd > 20 ? "✗ preklep?" : `✗ pod ${fmtOdds(st.min)}`;
      if (st.ok && !matchHasStarted(dayTips.items[i].r.fixture)) n++;
    });
    const b = document.getElementById("dtBulkSave");
    if (b) { b.disabled = n === 0; b.textContent = n ? `Uložiť všetky s kurzom (${n})` : "Uložiť všetky s kurzom"; }
  };
  const inputs = [...dayTipsPaneEl.querySelectorAll("[data-odds]")];
  inputs.forEach((inp, k) => {
    inp.oninput = () => { dayTipOdds[Number(inp.dataset.odds)] = inp.value; refreshOdds(); };
    inp.onkeydown = (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const next = inputs.slice(k + 1).find((x) => !x.disabled);
      if (next) next.focus(); else document.getElementById("dtBulkSave")?.focus();
    };
  });
  refreshOdds();
  const saveOne = async (idx, realOdds) => {
    const { r, bet } = dayTips.items[idx];
    // Kandidát na ⭐ Silný tip dňa si značku nesie do Histórie tipov (server nechá max. 1 za deň).
    const tip = buildTip(r, bet, realOdds, idx === strongIdx ? { strongOfDay: true } : {});
    await postJson("/api/tips", tip);
    dayTipSaved.add(idx);
    return tip;
  };
  dayTipsPaneEl.querySelectorAll("[data-save]").forEach((btn) => {
    btn.onclick = async () => {
      const idx = Number(btn.dataset.save);
      const item = dayTips.items[idx];
      if (!item) return;
      if (matchHasStarted(item.r.fixture)) { showToast(MATCH_STARTED_TEXT); return; }
      const st = oddsState(idx);
      if (st.odd != null && !st.ok) { showToast(st.odd > 20 ? `${fmtOdds(st.odd)} nevyzerá ako kurz.` : `Kurz ${fmtOdds(st.odd)} je pod minimom ${fmtOdds(st.min)} – tip radšej vynechaj.`); return; }
      const realOdds = st.ok ? Math.round(st.odd * 100) / 100 : await askRealOdds(item.bet);
      if (realOdds == null) return;
      btn.disabled = true;
      try {
        const tip = await saveOne(idx, realOdds);
        btn.textContent = "✓ Uložené";
        const inp = dayTipsPaneEl.querySelector(`[data-odds="${idx}"]`); if (inp) inp.disabled = true;
        refreshOdds();
        await maybeOfferTelegram(tip.id, tip);
      } catch (err) {
        showToast(`Uloženie zlyhalo: ${err?.message ?? String(err)}`);
        btn.disabled = false;
      }
    };
  });
  const bulk = document.getElementById("dtBulkSave");
  if (bulk) bulk.onclick = async () => {
    const target = document.getElementById("dtBulkTg").value;
    const todo = dayTips.items.map((_, i) => i).filter((i) => !dayTipSaved.has(i) && oddsState(i).ok && !matchHasStarted(dayTips.items[i].r.fixture));
    if (!todo.length) return;
    bulk.disabled = true;
    let saved = 0, sent = 0, errs = 0;
    for (const i of todo) {
      bulk.textContent = `Ukladám… ${saved + errs + 1} / ${todo.length}`;
      try {
        const tip = await saveOne(i, Math.round(oddsState(i).odd * 100) / 100);
        saved++;
        if (target && !isWatchTip(tip)) { try { await postJson(`/api/tips/${tip.id}/telegram`, { target }); sent++; } catch { errs++; } }
      } catch { errs++; }
    }
    showToast(`Uložené: ${saved}${target ? ` · do Telegramu: ${sent}` : ""}${errs ? ` · chyby: ${errs}` : ""}`);
    renderDayTipsView();
  };
}

/** Kurz z políčka („1,85“ aj „1.85“), inak null. */
function parseOddsInput(v) {
  const n = parseFloat(String(v ?? "").trim().replace(",", "."));
  return n > 1 ? n : null;
}

function renderDayTipDetail(r) {
  const back = {
    label: "‹ Späť na tipy dňa",
    onClick: () => {
      ++dayTipsViewId;
      dayTipsDetail = null;
      renderDayTipsView();
      window.scrollTo(0, 0);
    },
  };
  try {
    renderAnalysis(r, dayTipsPaneEl, {
      back,
      onRecalc: async () => {
        const viewId = ++dayTipsViewId;
        dayTipsPaneEl.innerHTML = skeletonHtml(5);
        try {
          const fresh = await requestAnalysis(r.fixture);
          if (viewId !== dayTipsViewId) return;
          dayTipsDetail = fresh;
          renderDayTipDetail(fresh);
        } catch (err) {
          if (viewId !== dayTipsViewId) return;
          dayTipsPaneEl.innerHTML = `<div class="empty">Analýzu sa nepodarilo vypočítať: ${escapeHtml(err.message)}</div>`;
          dayTipsPaneEl.insertAdjacentHTML("afterbegin", `<button type="button" class="btn ghost sm back-link" data-back2>${back.label}</button>`);
          dayTipsPaneEl.querySelector("[data-back2]").onclick = back.onClick;
        }
      },
    });
  } catch (err) {
    // Tlačidlo späť na zoznam – vždy, aj keby sa detail nepodarilo vykresliť.
    dayTipsPaneEl.innerHTML = `<button type="button" class="btn ghost sm back-link" data-back2>${back.label}</button><div class="empty">Detail sa nepodarilo zobraziť: ${escapeHtml(err.message)}</div>`;
    dayTipsPaneEl.querySelector("[data-back2]").onclick = back.onClick;
  }
}

dtRunBtn.addEventListener("click", () => showDayTips());

// =====================================================================
// HISTÓRIA TIPOV
// =====================================================================
let currentHistoryTips = [];
let lastStatTips = [];
let showArchivedTips = false;
let tipsFilter = "all";
const tipsListEl = document.getElementById("tipsList");
const bankrollStartInput = document.getElementById("bankrollStartInput");
const checkResultsBtn = document.getElementById("checkResultsBtn");

async function openTipsHistory() {
  void renderShadowSummary();
  void renderBlendSummary();
  void renderClvSummary();
  if (!currentHistoryTips.length) tipsListEl.innerHTML = skeletonHtml(3);
  try {
    const tips = await fetchJson("/api/tips");
    renderTipsList(tips);
  } catch (err) {
    tipsListEl.innerHTML = `<p class="empty">Tipy sa nepodarilo načítať: ${escapeHtml(err.message)}</p>`;
  }
}

// Bankroll simulátor: rovnaké percento z aktuálneho bankrollu na každý tip (1, 2, 3 alebo 5 %).
let bankrollPct = 2;
// Úspešnosť, zisk a ROI pri vklade 1 jednotka na tip (zisk len z tipov s kurzom).
const CALIBRATION_MIN_TIPS = 20;
const CALIBRATION_GAP = 10;

function marketStats(list) {
  const won = list.filter((t) => t.status === "won").length;
  const withOdds = list.filter((t) => typeof t.odds === "number" && t.odds > 1);
  const profit = withOdds.reduce((sum, t) => sum + (t.status === "won" ? t.odds - 1 : -1), 0);
  const probs = list.filter((t) => typeof t.probability === "number");
  return {
    won,
    total: list.length,
    pct: list.length ? (won / list.length) * 100 : 0,
    expected: probs.length ? probs.reduce((a, t) => a + t.probability, 0) / probs.length : null,
    profit,
    roi: withOdds.length ? (profit / withOdds.length) * 100 : null,
    withOdds: withOdds.length,
  };
}

function renderTipsList(allTips) {
  currentHistoryTips = allTips;
  // Tipy „len sledovať“ sa nerátajú do štatistík ani sa nezobrazujú.
  const tips = allTips.filter((t) => !t.watchOnly);
  // Tipy na trhy, ktoré appka už neponúka, ostávajú v zozname, ale nerátajú sa do štatistík.
  const statTips = tips.filter((t) => !EXCLUDED_STATS_MARKETS.includes(t.market));
  lastStatTips = statTips;
  renderTipsKpis(statTips);
  renderOverrideLine(statTips);
  renderMarketBreakdown(statTips);
  renderBankrollSimulation(statTips);
  renderCalibrationReport(statTips);
  renderWatchReport(allTips.filter((t) => t.watchOnly && !(t.legs && t.legs.length)));
  renderTipRows(tips);
}

function renderTipsKpis(statTips) {
  const won = statTips.filter((t) => t.status === "won").length;
  const lost = statTips.filter((t) => t.status === "lost").length;
  const pending = statTips.filter((t) => t.status === "pending").length;
  const decided = won + lost;
  const decidedTips = statTips.filter((t) => t.status === "won" || t.status === "lost");
  const st = marketStats(decidedTips);
  const now = new Date();
  const monthTips = decidedTips.filter((t) => {
    const d = new Date(t.matchDate);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const ms = marketStats(monthTips);
  const cls = (v) => (v > 0 ? "g" : v < 0 ? "l" : "");
  document.getElementById("tipsKpis").innerHTML = `
    <div class="kpi"><small>Tipov</small><b>${statTips.length}</b><span>${pending ? `${pending} ${pending === 1 ? "čaká" : "čakajú"}` : "nič nečaká"}</span></div>
    <div class="kpi"><small>Vyšlo</small><b>${decided ? `${Math.round((won / decided) * 100)}${NB}%` : "–"}</b><span>${won} z ${decided}</span></div>
    <div class="kpi"><small>Zisk</small><b class="${cls(st.profit)}">${st.withOdds ? `${signed(st.profit, 1)}${NB}j.` : "–"}</b><span>1 jednotka na tip</span></div>
    <div class="kpi"><small>ROI</small><b class="${cls(st.roi)}">${st.roi != null ? `${signed(st.roi, 1)}${NB}%` : "–"}</b><span>na vsadený tip</span></div>
    <div class="kpi"><small>${MONTH_NAMES[now.getMonth()]}</small><b class="${cls(ms.profit)}">${ms.withOdds ? `${signed(ms.profit, 1)}${NB}j.` : "–"}</b><span>${ms.won} z ${ms.total} vyšlo</span></div>`;
}

/** Prehľad tipov „mimo filtra“ – či sa oplatí prekonávať kontrolu kurzu. */
function renderOverrideLine(tips) {
  const el = document.getElementById("overrideLine");
  const ov = tips.filter(isOverrideTip);
  if (!ov.length) { el.innerHTML = ""; return; }
  const decided = ov.filter((t) => t.status === "won" || t.status === "lost");
  const won = decided.filter((t) => t.status === "won").length;
  const withOdds = decided.filter((t) => typeof t.odds === "number" && t.odds > 1);
  const profit = withOdds.reduce((sum, t) => sum + (t.status === "won" ? t.odds - 1 : -1), 0);
  el.innerHTML = `<span title="Tipy vyradené kontrolou kurzu, ktoré si pridal ručne">⚠️ Mimo filtra: <b>${won} z ${decided.length}</b>${
    withOdds.length > 0 ? ` · zisk <b>${signed(profit, 1)}${NB}j.</b>` : ""
  }${ov.length > decided.length ? ` · čaká ${ov.length - decided.length}` : ""}</span>`;
}

function marketBreakdownRow(label, st, bold) {
  let calib = "";
  if (st.expected != null) {
    const gap = st.pct - st.expected;
    if (st.total < CALIBRATION_MIN_TIPS) calib = `model čakal ${st.expected.toFixed(0)}${NB}%`;
    else if (gap <= -CALIBRATION_GAP) calib = `⚠️ model čakal ${st.expected.toFixed(0)}${NB}% – preceňuje`;
    else if (gap >= CALIBRATION_GAP) calib = `model čakal ${st.expected.toFixed(0)}${NB}% – podceňuje`;
    else calib = `model čakal ${st.expected.toFixed(0)}${NB}% ✓`;
  }
  const cls = st.profit > 0 ? "g" : st.profit < 0 ? "l" : "";
  const money = st.withOdds ? ` · zisk <b class="${cls}">${signed(st.profit, 1)}${NB}j.</b> · ROI <b class="${cls}">${signed(st.roi, 0)}${NB}%</b>` : "";
  return `
    <div class="mb-row${bold ? " total" : ""}">
      <div class="mb-top"><span class="mb-name">${escapeHtml(label)}</span><span class="mb-num">${st.won}/${st.total} · <b>${st.pct.toFixed(0)}${NB}%</b>${money}</span></div>
      <div class="bar mb-bar">
        <i style="width:${st.pct.toFixed(1)}%"></i>
        ${st.expected != null ? `<span class="mark" title="Model čakal ${st.expected.toFixed(0)} %" style="left:${clampPercent(st.expected)}%"></span>` : ""}
      </div>
      ${calib ? `<div class="faint small">${calib}</div>` : ""}
    </div>`;
}

function renderMarketBreakdown(tips) {
  const el = document.getElementById("marketBreakdown");
  const decidedTips = tips.filter((t) => t.status === "won" || t.status === "lost");
  if (!decidedTips.length) {
    el.innerHTML = `<p class="empty">Zatiaľ nie sú vyhodnotené žiadne tipy.</p>`;
    return;
  }
  const byMarket = {};
  for (const t of decidedTips) (byMarket[t.market] ??= []).push(t);
  const rows = Object.entries(byMarket)
    .map(([market, list]) => [market, marketStats(list)])
    .sort((a, b) => b[1].total - a[1].total);
  el.innerHTML = `
    <p class="faint small mb-intro">Zlatá čiarka = koľko model čakal. Hodnotenie modelu (preceňuje / podceňuje) sa ukáže od ${CALIBRATION_MIN_TIPS} tipov v trhu.</p>
    ${marketBreakdownRow("Spolu", marketStats(decidedTips), true)}
    ${rows.map(([market, st]) => marketBreakdownRow(market, st, false)).join("")}`;
}

function renderBankrollSimulation(tips) {
  const el = document.getElementById("bankrollResult");
  const resolved = tips
    .filter((t) => t.status === "won" || t.status === "lost")
    .sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());
  if (!resolved.length) {
    el.innerHTML = `<p class="faint small">Zatiaľ nemáš žiadne vyhodnotené tipy na simuláciu.</p>`;
    return;
  }
  const startingBankroll = parseFloat(bankrollStartInput.value) || 1000;
  let bankroll = startingBankroll;
  const history = [bankroll];
  for (const t of resolved) {
    const stake = bankroll * (bankrollPct / 100);
    // Skutočný kurz, ak bol pri tipe uložený – inak „fér“ kurz z pravdepodobnosti modelu.
    const odds = typeof t.odds === "number" && t.odds > 1 ? t.odds : 100 / t.probability;
    bankroll += t.status === "won" ? stake * (odds - 1) : -stake;
    history.push(bankroll);
  }
  const totalReturn = ((bankroll - startingBankroll) / startingBankroll) * 100;
  const maxVal = Math.max(...history), minVal = Math.min(...history);
  const range = maxVal - minVal || 1;
  el.innerHTML = `
    <div class="kv-grid">
      <div><small>Použitých tipov</small><b>${resolved.length}</b></div>
      <div><small>Prvý vklad</small><b>${fmtNum(startingBankroll * bankrollPct / 100, startingBankroll * bankrollPct % 100 ? 2 : 0)}${NB}€</b></div>
      <div><small>Konečný bankroll</small><b>${bankroll.toFixed(0)}${NB}€</b></div>
      <div><small>Celková zmena</small><b class="${totalReturn >= 0 ? "g" : "l"}">${signed(totalReturn, 1)}${NB}%</b></div>
    </div>
    <div class="bankroll-chart">${history
      .map((v) => `<div style="height:${(10 + ((v - minVal) / range) * 90).toFixed(1)}%" title="${v.toFixed(0)} €"></div>`)
      .join("")}</div>`;
}

// Kalibračný report (20. 10. 2026): úzke pásma po 2,5 bodu v rozsahu 65 – 82,5 %, aby bolo
// vidno, či vyššia dôvera modelu naozaj vychádza častejšie (alebo model preceňuje).
const CALIBRATION_FROM = 65;
const CALIBRATION_TO = 82.5;
const CALIBRATION_STEP = 2.5;
/** Sledované tipy (21. 10. 2026): skúšobné pásmo 65 – 67 % a ďalšie tipy „len sledovať“. */
function renderWatchReport(list) {
  const el = document.getElementById("watchResult");
  if (!el) return;
  if (!list.length) {
    el.innerHTML = `<p class="faint small">Zatiaľ žiadne. Tipy s dôverou 65 – 67${NB}% sa po uložení automaticky zaradia sem.</p>`;
    return;
  }
  const resolved = list.filter((t) => t.status === "won" || t.status === "lost");
  const won = resolved.filter((t) => t.status === "won").length;
  const withOdds = resolved.filter((t) => typeof t.odds === "number" && t.odds > 1);
  const profit = withOdds.reduce((a, t) => a + (t.status === "won" ? t.odds - 1 : -1), 0);
  const avgProb = resolved.length ? resolved.reduce((a, t) => a + Number(t.probability || 0), 0) / resolved.length : null;
  const pending = list.filter((t) => t.status === "pending").length;
  const res = { won: `<b class="g">vyšiel</b>`, lost: `<b class="l">nevyšiel</b>`, void: "vrátený", pending: `<span class="faint">čaká</span>` };
  const rows = [...list]
    .sort((a, b) => new Date(b.matchDate).getTime() - new Date(a.matchDate).getTime())
    .slice(0, 40)
    .map((t) => `<tr><td style="white-space:nowrap">${escapeHtml(new Date(t.matchDate).toLocaleDateString("sk-SK", { day: "numeric", month: "numeric" }))}</td><td>${escapeHtml(translateTeamName(t.homeTeam))} – ${escapeHtml(translateTeamName(t.awayTeam))}<br><span class="faint">${escapeHtml(t.market)}: ${escapeHtml(translateNamesInText(t.selection, t.homeTeam, t.awayTeam))}</span></td><td class="num">${Number(t.probability).toFixed(0)}${NB}%</td><td class="num">${typeof t.odds === "number" ? fmtOdds(t.odds) : "–"}</td><td>${res[t.status] || t.status}</td><td><button type="button" class="ib" data-watch-edit="${escapeHtml(t.id)}" title="Upraviť kurz alebo výsledok" aria-label="Upraviť kurz alebo výsledok">${ICON.edit}</button> <button type="button" class="ib danger" data-watch-del="${escapeHtml(t.id)}" title="Odstrániť tip" aria-label="Odstrániť tip">${ICON.trash}</button></td></tr>`)
    .join("");
  el.innerHTML = `<p class="small">${resolved.length
      ? `<b>Vyšlo ${won} z ${resolved.length}</b> (${fmtNum((won / resolved.length) * 100, 0)}${NB}%, model sľuboval ${fmtNum(avgProb, 0)}${NB}%)${withOdds.length ? `, zisk <b class="${profit >= 0 ? "g" : "l"}">${signed(profit, 1)}${NB}j.</b>` : "."}`
      : "Zatiaľ žiadny vyhodnotený."}${pending ? ` Čaká: ${pending}.` : ""}</p>
    <div class="table-wrap"><table class="bt-table"><thead><tr><th>Deň</th><th>Zápas a tip</th><th class="num">Dôvera</th><th class="num">Kurz</th><th>Výsledok</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="faint small">Tieto tipy sa vyhodnocujú, ale neposielajú sa členom, nie sú na webe a nerátajú sa do úspešnosti. Keď budú mať aspoň 30 vyhodnotených tipov v zisku, oplatí sa ich začať posielať.</p>`;
}

document.getElementById("watchResult")?.addEventListener("click", async (e) => {
  const del = e.target.closest("[data-watch-del]");
  if (del) {
    if (!window.confirm("Naozaj chceš tento sledovaný tip odstrániť? Táto akcia sa nedá vrátiť späť.")) return;
    try {
      await fetchJson(`/api/tips/${encodeURIComponent(del.dataset.watchDel)}`, { method: "DELETE" });
      showToast("Tip odstránený.");
    } catch (err) {
      showToast(`Zmazanie zlyhalo: ${err?.message ?? String(err)}`);
    }
    openTipsHistory();
    return;
  }
  const btn = e.target.closest("[data-watch-edit]");
  if (!btn) return;
  const tip = currentHistoryTips.find((x) => x.id === btn.dataset.watchEdit);
  if (tip) openEditTip(tip);
});

function renderCalibrationReport(tips) {
  const el = document.getElementById("calibrationResult");
  // Tikety vynechávame (kombinovaná pravdepodobnosť), aj obnovené tipy s odhadnutou dôverou.
  const resolved = tips.filter((t) => !t.legs && !t.probabilityEstimated && (t.status === "won" || t.status === "lost"));
  if (!resolved.length) {
    el.innerHTML = `<p class="faint small">Zatiaľ nemáš dosť vyhodnotených tipov na kalibráciu.</p>`;
    return;
  }
  const pct = (v) => `${fmtNum(v, 1)}${NB}%`;
  const rows = [];
  for (let min = CALIBRATION_FROM; min < CALIBRATION_TO - 0.001; min += CALIBRATION_STEP) {
    const max = min + CALIBRATION_STEP;
    const last = max >= CALIBRATION_TO - 0.001;
    const inBucket = resolved.filter((t) => t.probability >= min && (last ? t.probability <= max : t.probability < max));
    const won = inBucket.filter((t) => t.status === "won").length;
    rows.push({
      label: `${fmtNum(min, 1).replace(",0", "")}–${fmtNum(max, 1).replace(",0", "")}${NB}%`,
      count: inBucket.length,
      won,
      predicted: inBucket.length ? inBucket.reduce((a, t) => a + Number(t.probability), 0) / inBucket.length : null,
      actual: inBucket.length ? (won / inBucket.length) * 100 : null,
    });
  }
  const outside = resolved.filter((t) => t.probability < CALIBRATION_FROM || t.probability > CALIBRATION_TO).length;
  const promised = resolved.reduce((a, t) => a + Number(t.probability), 0) / resolved.length;
  const delivered = (resolved.filter((t) => t.status === "won").length / resolved.length) * 100;
  const diff = delivered - promised;
  const verdict = Math.abs(diff) < 2 ? "sedí" : diff < 0 ? "model preceňuje" : "model podceňuje";
  const body = rows
    .map((r) => {
      const d = r.count ? r.actual - r.predicted : null;
      return `<tr><td style="white-space:nowrap">${r.label}</td><td class="num">${r.count || "–"}</td><td class="num">${r.count ? pct(r.predicted) : "–"}</td><td class="num">${r.count ? `${pct(r.actual)} <span class="faint">(${r.won}/${r.count})</span>` : "–"}</td><td class="num ${d == null ? "" : d >= 0 ? "g" : "l"}">${d == null ? "–" : signed(d, 1)}</td></tr>`;
    })
    .join("");
  el.innerHTML = `<p class="small"><b>Model sľúbil ${pct(promised)}, vyšlo ${pct(delivered)}</b> (${plural(resolved.length, "tip", "tipy", "tipov")}, rozdiel <b class="${diff >= 0 ? "g" : "l"}">${signed(diff, 1)}${NB}b.</b> – ${verdict}).</p>
    <div class="table-wrap"><table class="bt-table"><thead><tr><th>Dôvera</th><th class="num">Tipy</th><th class="num">Model sľúbil</th><th class="num">Vyšlo</th><th class="num">Rozdiel</th></tr></thead><tbody>${body}</tbody></table></div>
    <p class="faint small">Pri pásme s menej ako 30 tipmi je rozdiel ešte prevažne náhoda.${outside ? ` Mimo pásiem ${CALIBRATION_FROM} – ${fmtNum(CALIBRATION_TO, 1)}${NB}%: ${plural(outside, "tip", "tipy", "tipov")} (započítané v celkovom riadku).` : ""}</p>`;
}
bankrollStartInput.addEventListener("input", () => renderBankrollSimulation(lastStatTips));
document.getElementById("bankrollPct").addEventListener("click", (e) => {
  const b = e.target.closest("[data-pct]");
  if (!b) return;
  bankrollPct = Number(b.dataset.pct);
  document.querySelectorAll("#bankrollPct [data-pct]").forEach((x) => x.classList.toggle("on", x === b));
  renderBankrollSimulation(lastStatTips);
});

const STATUS_PILL = {
  won: `<span class="res-b w">✓ Vyšlo</span>`,
  lost: `<span class="res-b l">✕ Nevyšlo</span>`,
  void: `<span class="res-b v">↩ Vrátené</span>`,
  pending: `<span class="res-b p">Čaká</span>`,
};
const LEG_ICON = { won: "✓", lost: "✕", void: "↩", pending: "…" };

function tipBadges(t) {
  let b = "";
  if (isOverrideTip(t)) b += ` <span class="tag warn" title="Vyradené kontrolou kurzu, pridané ručne">⚠️ mimo filtra</span>`;
  if (t.manualEntry) b += ` <span class="tag" title="Tip doplnený ručne po zápase">✍ doplnené ručne</span>`;
  if (t.edited) b += ` <span class="tag" title="Výsledok alebo kurz bol ručne opravený">✎ upravené</span>`;
  if (t.strongOfDay) b += ` <span class="tag gold" title="Silný tip dňa">⭐ silný tip dňa</span>`;
  if (t.archived) b += ` <span class="tag" title="Skrytý tip – v štatistikách aj na prezentácii ostáva">skrytý</span>`;
  return b;
}

function historyRowHtml(t) {
  const d = new Date(t.matchDate);
  const valid = !isNaN(d.getTime());
  const dateTxt = valid ? shortDate(d) : "";
  const yearTxt = valid && d.getFullYear() !== new Date().getFullYear() ? `<small>${d.getFullYear()}</small>` : "";
  const cls = (t.status === "won" ? " won" : t.status === "lost" ? " lost" : "") + (t.archived ? " is-archived" : "");
  const isTicket = Array.isArray(t.legs) && t.legs.length > 0;
  const main = isTicket
    ? `<b>🎫 Tiket (${plural(t.legs.length, "tip", "tipy", "tipov")})</b>
       <span>Kombinovaná pravdepodobnosť ${fmtNum(t.probability, 1)}${NB}%${tipBadges(t)}</span>
       ${t.legs
         .map(
           (leg) => `<span class="leg"><i class="leg-${leg.status || "pending"}">${LEG_ICON[leg.status] || "…"}</i> ${escapeHtml(translateTeamName(leg.homeTeam))} – ${escapeHtml(translateTeamName(leg.awayTeam))}: ${escapeHtml(leg.market)}: ${escapeHtml(
             translateNamesInText(leg.selection, leg.homeTeam, leg.awayTeam)
           )} · ${Number(leg.probability).toFixed(0)}${NB}%</span>`
         )
         .join("")}`
    : `<b>${escapeHtml(translateTeamName(t.homeTeam))} – ${escapeHtml(translateTeamName(t.awayTeam))}</b>
       <span>${escapeHtml(t.market)}: ${escapeHtml(translateNamesInText(t.selection, t.homeTeam, t.awayTeam))}${tipBadges(t)}</span>`;
  const conf = isTicket ? `${fmtNum(t.probability, 1)}${NB}% · ${tipOddsLabel(t)}` : `Dôvera ${Number(t.probability).toFixed(0)}${NB}% · ${tipOddsLabel(t)}`;
  const btn = (attr, icon, title, extra = "") => `<button type="button" class="ib${extra}" ${attr}="${escapeHtml(t.id)}" title="${title}" aria-label="${title}">${icon}</button>`;
  const buttons = [btn("data-edit-id", ICON.edit, "Upraviť výsledok alebo kurz")];
  if (t.status === "pending") {
    buttons.push(btn("data-send-id", ICON.send, "Poslať do kanála na Telegrame"));
  } else {
    buttons.push(btn("data-result-id", ICON.result, "Poslať výsledok do Telegramu"));
  }
  if (t.archived) buttons.push(btn("data-archive-id", ICON.unarchive, "Vrátiť späť do histórie"));
  else if (t.status !== "pending") buttons.push(btn("data-archive-id", ICON.archive, "Skryť z histórie (v štatistikách ostane)"));
  if (t.status === "pending") buttons.push(btn("data-delete-id", ICON.trash, "Odstrániť tip z histórie", " danger"));
  return `<div class="hrow${cls}" data-row-id="${escapeHtml(t.id)}">
    <span class="d" title="${valid ? escapeHtml(d.toLocaleString("sk-SK")) : ""}">${dateTxt}${yearTxt}</span>
    <span class="mt">${main}</span>
    <span class="conf">${conf}</span>
    ${STATUS_PILL[t.status] || STATUS_PILL.pending}
    <span class="ic">${buttons.join("")}</span>
  </div>`;
}

function renderTipRows(tips) {
  const archivedCount = tips.filter((t) => t.archived).length;
  const toggle = document.getElementById("showArchivedToggle");
  toggle.checked = showArchivedTips;
  toggle.closest(".toggle").hidden = archivedCount === 0 && !showArchivedTips;
  document.getElementById("showArchivedLabel").textContent = `Zobraziť skryté (${archivedCount})`;
  document.querySelectorAll("#tipsFilter [data-f]").forEach((b) => b.classList.toggle("on", b.dataset.f === tipsFilter));

  // Zoradené podľa času zápasu (najnovšie hore) – aj tipy doplnené dodatočne sedia na správnom mieste.
  const byMatchTime = (a, b) =>
    new Date(b.matchDate).getTime() - new Date(a.matchDate).getTime() ||
    new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime();
  const visible = (showArchivedTips ? tips : tips.filter((t) => !t.archived))
    .filter((t) => tipsFilter === "all" || (tipsFilter === "pending" ? t.status === "pending" : t.status !== "pending"))
    .sort(byMatchTime);
  if (!visible.length) {
    tipsListEl.innerHTML = `<p class="empty">${
      tips.length === 0 ? "Zatiaľ nemáš uložené žiadne tipy."
      : tipsFilter === "pending" ? "Žiadne tipy nečakajú na výsledok."
      : tipsFilter === "resolved" ? "Žiadne vyhodnotené tipy na zobrazenie."
      : "Všetky tipy sú skryté."
    }${archivedCount && !showArchivedTips ? ` Skrytých tipov: ${archivedCount} (rátajú sa do štatistík aj na prezentácii).` : ""}</p>`;
    return;
  }
  tipsListEl.innerHTML = visible.map(historyRowHtml).join("");
}

document.getElementById("tipsFilter").addEventListener("click", (e) => {
  const b = e.target.closest("[data-f]");
  if (!b) return;
  tipsFilter = b.dataset.f;
  renderTipRows(currentHistoryTips.filter((t) => !t.watchOnly));
});
document.getElementById("showArchivedToggle").addEventListener("change", (e) => {
  showArchivedTips = e.target.checked;
  renderTipRows(currentHistoryTips.filter((t) => !t.watchOnly));
});

tipsListEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const find = (id) => currentHistoryTips.find((x) => x.id === id);
  if (btn.dataset.editId) {
    const tip = find(btn.dataset.editId);
    if (tip) openEditTip(tip);
  } else if (btn.dataset.sendId) {
    const target = await askTelegramTarget();
    if (!target) return;
    try {
      await postJson(`/api/tips/${btn.dataset.sendId}/telegram`, { target });
      showToast("Tip odoslaný do kanála na Telegrame.");
    } catch (err) {
      showToast(`Odoslanie zlyhalo: ${err.message}`);
    }
  } else if (btn.dataset.resultId) {
    const target = await askTelegramTarget();
    if (!target) return;
    try {
      await postJson(`/api/tips/${btn.dataset.resultId}/telegram-result`, { target });
      showToast("Výsledok odoslaný.");
    } catch (err) {
      showToast(`Odoslanie zlyhalo: ${err.message}`);
    }
  } else if (btn.dataset.archiveId) {
    const tip = find(btn.dataset.archiveId);
    if (tip) await toggleArchive(tip);
  } else if (btn.dataset.deleteId) {
    const id = btn.dataset.deleteId;
    if (!window.confirm("Naozaj chceš odstrániť tento tip z histórie? Zmaže sa aj jeho správa v Telegrame. Táto akcia sa nedá vrátiť späť.")) return;
    try {
      const res = await fetch(`/api/tips/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(`Zmazanie zlyhalo: ${data.error || "neznáma chyba"}. Skús to prosím znova.`);
      } else {
        showToast("Tip odstránený.");
      }
    } catch {
      showToast("Zmazanie zlyhalo – skontroluj internetové pripojenie a skús to znova.");
    } finally {
      openTipsHistory();
    }
  }
});

async function setArchived(id, archived) {
  await postJson(`/api/tips/${encodeURIComponent(id)}/archive`, { archived });
}
async function toggleArchive(tip) {
  const msg = tip.archived
    ? "Vrátiť tento tip späť do histórie?"
    : "Skryť tento tip z histórie?\n\nNa prezentačnej stránke aj v štatistikách ostane – len ho tu nebudeš vidieť. Skryté tipy si môžeš kedykoľvek zobraziť.";
  if (!window.confirm(msg)) return;
  try {
    await setArchived(tip.id, !tip.archived);
  } catch (err) {
    showToast(`Nepodarilo sa: ${err?.message ?? String(err)}`);
  } finally {
    openTipsHistory();
  }
}
async function archiveAllResolved() {
  const toHide = currentHistoryTips.filter((t) => !t.archived && !t.watchOnly && t.status !== "pending");
  if (!toHide.length) { showToast("Nie sú žiadne vyhodnotené tipy na skrytie."); return; }
  const ok = window.confirm(
    `Skryť ${plural(toHide.length, "vyhodnotený tip", "vyhodnotené tipy", "vyhodnotených tipov")} z histórie?\n\nNa prezentačnej stránke aj v štatistikách ostanú. Čakajúce tipy ostanú viditeľné.`
  );
  if (!ok) return;
  for (const t of toHide) {
    try { await setArchived(t.id, true); } catch { /* pokračujeme s ďalšími */ }
  }
  showToast("Vyhodnotené tipy sú skryté.");
  openTipsHistory();
}
document.getElementById("archiveResolvedBtn").addEventListener("click", () => archiveAllResolved());

checkResultsBtn.addEventListener("click", async () => {
  checkResultsBtn.disabled = true;
  checkResultsBtn.textContent = "Kontrolujem…";
  try {
    const tips = await fetchJson("/api/tips/check-results", { method: "POST" });
    renderTipsList(tips);
    showToast("Výsledky skontrolované.");
  } catch (err) {
    showToast(`Kontrola výsledkov zlyhala: ${err.message}`);
  } finally {
    checkResultsBtn.disabled = false;
    checkResultsBtn.textContent = "Skontrolovať výsledky";
  }
});

document.getElementById("clearAllTipsBtn").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  if (!window.confirm("Naozaj chceš vymazať ÚPLNE VŠETKY uložené tipy (aj už vyhodnotené)? Táto akcia sa nedá vrátiť späť.")) return;
  btn.disabled = true;
  try {
    await fetchJson("/api/tips", { method: "DELETE" });
    renderTipsList([]);
  } catch (err) {
    showToast(`Vymazanie zlyhalo: ${err.message}. Skús to prosím znova.`);
  } finally {
    btn.disabled = false;
  }
});

/** Jednoduché oznamy do Telegramu: najprv výber kanála, potom odoslanie. */
function wireTelegramNotice(btnId, url) {
  const btn = document.getElementById(btnId);
  btn.addEventListener("click", async () => {
    const target = await askTelegramTarget();
    if (!target) return;
    btn.disabled = true;
    try {
      await postJson(url, { target });
      showToast("Odoslané.");
    } catch (err) {
      showToast(`Odoslanie zlyhalo: ${err.message}`);
    } finally {
      btn.disabled = false;
    }
  });
}
wireTelegramNotice("tipsComingBtn", "/api/telegram/tips-coming");
wireTelegramNotice("noTipTodayBtn", "/api/telegram/no-tip-today");

// Obnova tipov z denného súhrnu (/suhrn), ktoré v histórii chýbajú (bez ohľadu na kurz).
async function restoreFromDaily() {
  try {
    const preview = await postJson("/api/tips/restore-from-daily", { dryRun: true });
    if (!preview.count) {
      const sk = preview.skipped || {};
      showToast(`V histórii nič nechýba. Zo súhrnu: už v histórii ${sk.inHistory || 0}, bez výsledku ${sk.noResult || 0}, bez kurzu ${sk.badOdds || 0}.`);
      return;
    }
    const sample = (preview.tips || []).slice(0, 8).map((t) => `${t.day} · ${t.match} · ${t.tip} · ${fmtOdds(t.odds)}`).join("\n");
    const ok = window.confirm(
      `Vrátiť do histórie ${plural(preview.count, "tip", "tipy", "tipov")} z denného súhrnu?\n\nVyhraté: ${preview.won} · Prehraté: ${preview.lost}\nPreskočené – už v histórii: ${preview.skipped?.inHistory ?? 0} · bez výsledku: ${preview.skipped?.noResult ?? 0} · bez kurzu: ${preview.skipped?.badOdds ?? 0}\n\n${sample}${preview.count > 8 ? "\n…" : ""}`
    );
    if (!ok) return;
    const done = await postJson("/api/tips/restore-from-daily", {});
    showToast(`Obnovené: ${plural(done.count, "tip", "tipy", "tipov")}.`);
  } catch (err) {
    showToast(`Obnova zlyhala: ${err.message}`);
  }
  openTipsHistory();
}
document.getElementById("restoreDailyBtn").addEventListener("click", () => restoreFromDaily());

// ---- Oprava tipu v histórii (výsledok, kurz, pri tikete výsledky zápasov) ----
const STATUS_OPTIONS = [
  ["won", "✓ Vyšiel"],
  ["lost", "✗ Nevyšiel"],
  ["void", "↩ Vrátený"],
  ["pending", "⏳ Čaká"],
];
const STATUS_TEXT = { won: "✓ Vyšiel", lost: "✗ Nevyšiel", void: "↩ Vrátený", pending: "⏳ Čaká" };
function statusSelect(attr, value) {
  return `<select ${attr}>${STATUS_OPTIONS.map(([v, l]) => `<option value="${v}"${v === value ? " selected" : ""}>${l}</option>`).join("")}</select>`;
}
function ticketStatusFrom(statuses) {
  if (statuses.includes("lost")) return "lost";
  if (statuses.includes("pending")) return "pending";
  if (statuses.every((x) => x === "void")) return "void";
  return "won";
}

function openEditTip(tip) {
  const isTicket = Array.isArray(tip.legs) && tip.legs.length > 0;
  const title = isTicket
    ? `🎫 Tiket (${plural(tip.legs.length, "zápas", "zápasy", "zápasov")})`
    : `${escapeHtml(translateTeamName(tip.homeTeam))} – ${escapeHtml(translateTeamName(tip.awayTeam))}<br>${escapeHtml(tip.market)}: ${escapeHtml(translateNamesInText(tip.selection, tip.homeTeam, tip.awayTeam))}`;
  const legsHtml = isTicket
    ? tip.legs
        .map(
          (l, i) => `<div class="edit-leg">
            <div>${escapeHtml(translateTeamName(l.homeTeam))} – ${escapeHtml(translateTeamName(l.awayTeam))}<br><span class="faint small">${escapeHtml(l.market)}: ${escapeHtml(translateNamesInText(l.selection, l.homeTeam, l.awayTeam))}</span></div>
            ${statusSelect(`data-leg="${i}"`, l.status)}
          </div>`
        )
        .join("")
    : "";
  const m = openModal(`
    <h3>Upraviť tip</h3>
    <p class="muted small">${title}</p>
    ${isTicket
      ? `<div class="edit-legs">${legsHtml}</div><p class="small">Výsledok tiketu: <b data-ticket-status></b> <span class="faint">(vypočíta sa zo zápasov)</span></p>`
      : `<label class="fld">Výsledok ${statusSelect("data-status", tip.status)}</label>`}
    <label class="fld">Kurz <input type="text" data-odds inputmode="decimal" value="${typeof tip.odds === "number" && tip.odds > 1 ? String(tip.odds).replace(".", ",") : ""}" placeholder="napr. 1,75" /></label>
    ${isTicket ? "" : `<label class="small"><input type="checkbox" data-watch${tip.watchOnly ? " checked" : ""} /> Len sledovať <span class="faint">(nerátá sa do štatistík ani na web)</span></label>`}
    <p class="faint small form-msg" data-msg></p>
    <div class="modal-actions">
      <button type="button" class="btn ghost" data-close>Zrušiť</button>
      <button type="button" class="btn" data-save>Uložiť opravu</button>
    </div>`);
  const el = m.el;
  const legStatuses = () => (isTicket ? tip.legs.map((_, i) => el.querySelector(`[data-leg="${i}"]`).value) : []);
  const refresh = () => {
    if (isTicket) el.querySelector("[data-ticket-status]").textContent = STATUS_TEXT[ticketStatusFrom(legStatuses())];
  };
  el.querySelectorAll("[data-leg]").forEach((s) => s.addEventListener("change", refresh));
  refresh();
  const saveBtn = el.querySelector("[data-save]");
  saveBtn.onclick = async () => {
    const oddsText = String(el.querySelector("[data-odds]").value).trim().replace(",", ".");
    const odds = oddsText === "" ? null : parseFloat(oddsText);
    if (odds !== null && !(odds > 1)) {
      el.querySelector("[data-msg]").textContent = "Kurz musí byť číslo väčšie ako 1 (napr. 1,75) alebo nechaj políčko prázdne.";
      return;
    }
    const edit = { odds };
    if (isTicket) edit.legs = legStatuses().map((status) => ({ status }));
    else {
      edit.status = el.querySelector("[data-status]").value;
      edit.watchOnly = el.querySelector("[data-watch]").checked;
    }
    saveBtn.disabled = true;
    try {
      await postJson(`/api/tips/${encodeURIComponent(tip.id)}/edit`, edit);
      m.close();
      showToast("Tip upravený.");
      openTipsHistory();
    } catch (err) {
      el.querySelector("[data-msg]").textContent = `Uloženie zlyhalo: ${err?.message ?? String(err)}`;
      saveBtn.disabled = false;
    }
  };
}

// ---- Doplnenie odohraného tipu (tip poslaný klientom, ktorý v TipRadare chýba) ----
const MANUAL_MARKETS = ["Góly", "Góly domácich", "Góly hostí", "Rohy", "Rohy domácich", "Rohy hostí", "Karty", "Karty domácich", "Karty hostí", "Strely na bránu", "Strely na bránu domácich", "Strely na bránu hostí", "Fauly", "Vyššie držanie lopty"];
let manualLastDate = "";

/** Pravidlá odporúčaného tipu pre ručne doplnený tip – vráti dôvod zamietnutia alebo "". */
function manualTipProblem(p, odds) {
  if (!(p > 0) || !(odds > 1)) return "";
  if (p < 65) return `dôvera ${fmtNum(p, 0)}${NB}% je pod 65${NB}%`;
  if (p > 80) return `dôvera ${fmtNum(p, 0)}${NB}% je nad 80${NB}%`;
  const need = minOddsFor({ probability: p });
  if (odds < need) return `pri dôvere ${fmtNum(p, 0)}${NB}% treba kurz aspoň ${fmtOdds(need)}, zadaný je ${fmtOdds(odds)}`;
  if ((p / 100) * odds > 1.25) return "podozrivo vysoká hodnota (nad +25 %)";
  return "";
}

function openManualTip() {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const m = openModal(`
    <h3>Doplniť odohraný tip</h3>
    <p class="muted small">Pre tipy, ktoré si klientom poslal, ale v TipRadare nie sú uložené. Tip sa uloží rovno s výsledkom a započíta sa do štatistík aj do čísel na prezentačnej stránke.</p>
    <div class="form-grid">
      <label class="fld">Dátum zápasu<input type="date" data-mt="date" /></label>
      <label class="fld">Čas výkopu<input type="time" data-mt="time" title="Čas výkopu (voliteľné)" /></label>
      <label class="fld">Domáci<input type="text" data-mt="home" placeholder="napr. Česko" /></label>
      <label class="fld">Hostia<input type="text" data-mt="away" placeholder="napr. Chorvátsko" /></label>
      <label class="fld">Trh<select data-mt="market">${MANUAL_MARKETS.map((x) => `<option>${x}</option>`).join("")}</select></label>
      <label class="fld">Tip<input type="text" data-mt="selection" placeholder="napr. Nad 2,5" /></label>
      <label class="fld">Kurz<input type="text" data-mt="odds" inputmode="decimal" placeholder="napr. 1,67" /></label>
      <label class="fld">Dôvera %<input type="text" data-mt="prob" inputmode="decimal" placeholder="napr. 70" /></label>
      <label class="fld">Výsledok<select data-mt="result"><option value="won">✓ Vyšiel</option><option value="lost">✗ Nevyšiel</option><option value="void">↩ Vrátený</option></select></label>
    </div>
    <p class="small" data-mt="check"></p>
    <label class="small"><input type="checkbox" data-mt="watch" /> Len sledovať <span class="faint">(nerátá sa do štatistík ani na web)</span></label>
    <p class="small form-msg" data-mt="msg"></p>
    <div class="modal-actions">
      <button type="button" class="btn ghost" data-close>Zavrieť</button>
      <button type="button" class="btn" data-mt="save">Uložiť tip</button>
    </div>`, { wide: true, onClose: () => openTipsHistory() });
  const q = (k) => m.el.querySelector(`[data-mt="${k}"]`);
  q("date").value = manualLastDate || isoDay(y);
  // Rovnaká kontrola ako pri tipoch z modelu – tip, ktorý by model nepustil, ide len medzi sledované.
  const checkNow = () => {
    const odds = parseFloat(String(q("odds").value).replace(",", "."));
    const p = parseFloat(String(q("prob").value).replace(",", ".").replace("%", ""));
    const why = manualTipProblem(p, odds);
    const box = q("watch");
    if (!(odds > 1) || !(p > 0)) { q("check").textContent = ""; box.disabled = false; return; }
    // Skúšobné pásmo 65 – 67 %: kurz sa kontroluje rovnako, ale tip ide aj tak len medzi sledované.
    const trial = !why && p < WATCH_BELOW;
    const need = `pri ${fmtNum(p, 0)}${NB}% treba kurz aspoň ${fmtOdds(minOddsFor({ probability: p }))}`;
    q("check").textContent = why
      ? `✗ Model by tip nepustil: ${why}. Uloží sa len medzi sledované.`
      : trial
        ? `✓ Kurz je v poriadku (${need}). Dôvera je v skúšobnom pásme 65 – 67${NB}%, tip sa uloží medzi sledované.`
        : `✓ Tip prešiel kontrolou modelu (${need}).`;
    q("check").className = `small ${why ? "loss" : "win"}`;
    box.checked = !!why || trial;
    box.disabled = !!why || trial;
  };
  q("prob").addEventListener("input", checkNow);
  q("odds").addEventListener("input", checkNow);
  const msg = (t, ok) => { q("msg").textContent = t; q("msg").className = `small form-msg ${ok ? "win" : "loss"}`; };
  q("save").onclick = async () => {
    const date = q("date").value;
    const home = q("home").value.trim();
    const away = q("away").value.trim();
    const selection = q("selection").value.trim();
    const odds = parseFloat(String(q("odds").value).replace(",", "."));
    const probInput = parseFloat(String(q("prob").value).replace(",", ".").replace("%", ""));
    if (!date || !home || !away || !selection) { msg("Vyplň dátum, oba tímy a tip."); return; }
    if (!(odds > 1)) { msg("Zadaj kurz väčší ako 1 (napr. 1,67)."); return; }
    if (!(probInput > 0 && probInput <= 100)) { msg("Zadaj dôveru modelu v % (napr. 70), aby sa dal tip skontrolovať."); return; }
    const kickoff = new Date(`${date}T${q("time").value || "12:00"}:00`);
    if (kickoff.getTime() > Date.now()) { msg("Tento formulár je len pre odohrané zápasy. Tipy pred zápasom ukladaj z analýzy zápasu."); return; }
    const probability = probInput > 0 && probInput <= 100 ? probInput : Math.round(10000 / odds) / 100;
    const tip = {
      id: `manual-${Date.now()}`,
      fixtureId: 0,
      leagueId: 0,
      season: kickoff.getFullYear(),
      leagueName: "",
      homeTeam: home,
      awayTeam: away,
      matchDate: kickoff.toISOString(),
      market: q("market").value,
      selection,
      probability,
      odds: Math.round(odds * 100) / 100,
      manualEntry: true,
      savedAt: new Date().toISOString(),
      status: q("result").value,
    };
    // Dôvera pod 68 % patrí do skúšobného pásma – aj zabudnutý tip ide len medzi sledované.
    if (q("watch").checked || manualTipProblem(probInput, odds) || probInput < WATCH_BELOW) tip.watchOnly = true;
    if (!(probInput > 0 && probInput <= 100)) tip.probabilityEstimated = true;
    q("save").disabled = true;
    try {
      await postJson("/api/tips", tip);
      manualLastDate = date;
      msg(`✓ Uložené${tip.watchOnly ? " medzi sledované" : " do štatistík"}: ${home} – ${away}, ${tip.market}: ${selection}. Môžeš pridať ďalší tip.`, true);
      ["home", "away", "selection", "odds", "prob"].forEach((k) => { q(k).value = ""; });
      q("watch").checked = false;
      q("watch").disabled = false;
      q("check").textContent = "";
      q("home").focus();
    } catch (err) {
      msg(`Uloženie zlyhalo: ${err?.message ?? String(err)}`);
    } finally {
      q("save").disabled = false;
    }
  };
}
document.getElementById("manualTipBtn").addEventListener("click", () => openManualTip());

// ---- Poslať tipy dňa naraz (z histórie do Telegramu) ----
function tipDayKey(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava" }).format(d);
}
function tipTimeLabel(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bratislava" });
}
function openSendDayTips() {
  const m = openModal(`
    <h3>Poslať tipy dňa do Telegramu</h3>
    <label class="inline-field">Deň <input type="date" data-day></label>
    <div class="send-list" data-list></div>
    <p class="faint small" data-info></p>
    <div class="modal-actions wrap">
      <button type="button" class="btn ghost" data-close>Zavrieť</button>
      <button type="button" class="btn" data-target="free">★ Poslať do FREE</button>
      <button type="button" class="btn" data-target="premium">◆ Poslať do členského kanála</button>
    </div>`, { wide: true });
  const el = m.el;
  const dayInput = el.querySelector("[data-day]");
  const listEl = el.querySelector("[data-list]");
  const infoEl = el.querySelector("[data-info]");
  // Predvolene dnešok; ak dnes nič nečaká, najbližší deň s čakajúcimi tipmi.
  const today = tipDayKey(new Date().toISOString());
  const nextDays = currentHistoryTips
    .filter((t) => t.status === "pending" && !t.archived && !t.watchOnly)
    .map((t) => tipDayKey(t.matchDate))
    .filter((d) => d >= today)
    .sort();
  dayInput.value = nextDays.includes(today) || !nextDays.length ? today : nextDays[0];
  let dayTipsList = [];
  const selected = () => Array.from(listEl.querySelectorAll("input[type=checkbox]:checked")).map((c) => c.value);
  const updateInfo = () => {
    const n = selected().length;
    infoEl.textContent = dayTipsList.length ? `Vybrané: ${n} z ${dayTipsList.length}. Pôjdu ako samostatné správy, zoradené podľa času výkopu.` : "";
    el.querySelectorAll("[data-target]").forEach((b) => (b.disabled = n === 0));
  };
  const render = () => {
    dayTipsList = currentHistoryTips
      .filter((t) => t.status === "pending" && !t.archived && !t.watchOnly && tipDayKey(t.matchDate) === dayInput.value)
      .sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());
    if (!dayTipsList.length) {
      listEl.innerHTML = `<p class="empty">V tento deň nie sú v histórii žiadne čakajúce tipy.</p>`;
      updateInfo();
      return;
    }
    listEl.innerHTML = dayTipsList
      .map((t) => {
        const sent = (t.telegramMessages || []).length > 0;
        const isTicket = t.legs && t.legs.length;
        const title = isTicket
          ? `🎫 Tiket (${plural(t.legs.length, "tip", "tipy", "tipov")}) · ${fmtNum(t.probability, 1)}${NB}%`
          : `${escapeHtml(translateTeamName(t.homeTeam))} – ${escapeHtml(translateTeamName(t.awayTeam))}`;
        const sub = isTicket
          ? t.legs.map((l) => `${escapeHtml(translateTeamName(l.homeTeam))} – ${escapeHtml(translateTeamName(l.awayTeam))}`).join(" · ")
          : `${escapeHtml(t.market)}: ${escapeHtml(translateNamesInText(t.selection, t.homeTeam, t.awayTeam))} · ${Number(t.probability).toFixed(0)}${NB}%${typeof t.odds === "number" && t.odds > 1 ? ` · kurz ${fmtNum(t.odds, 2)}` : ""}`;
        return `<label class="send-row">
          <input type="checkbox" value="${escapeHtml(t.id)}" ${sent ? "" : "checked"}>
          <span><b>${tipTimeLabel(t.matchDate)} · ${title}</b>${sent ? ` <span class="faint small">· už odoslaný</span>` : ""}<br><span class="muted small">${sub}</span></span>
        </label>`;
      })
      .join("");
    listEl.querySelectorAll("input[type=checkbox]").forEach((c) => c.addEventListener("change", updateInfo));
    updateInfo();
  };
  dayInput.addEventListener("change", render);
  el.querySelectorAll("[data-target]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const ids = selected();
      if (!ids.length) return;
      const channel = btn.dataset.target === "free" ? "kanála FREE" : "členského kanála";
      if (!window.confirm(`Poslať ${plural(ids.length, "tip", "tipy", "tipov")} do ${channel}?`)) return;
      el.querySelectorAll("button").forEach((b) => (b.disabled = true));
      infoEl.textContent = "Posielam…";
      try {
        const r = await postJson("/api/telegram/send-tips", { ids, target: btn.dataset.target });
        showToast(`Odoslané: ${r.sent}.` + (r.failed ? ` Neodišlo: ${r.failed}.` : ""));
        m.close();
        openTipsHistory();
      } catch (err) {
        showToast(`Odoslanie zlyhalo: ${err.message}`);
        el.querySelectorAll("button").forEach((b) => (b.disabled = false));
        updateInfo();
      }
    })
  );
  render();
}
document.getElementById("sendDayTipsBtn").addEventListener("click", () => openSendDayTips());

// ---- Mesačný report (tipy daného mesiaca, s odoslaním do Telegramu) ----
function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
function openMonthlyReport(startMonth) {
  const m = openModal(`
    <div class="monthly-head">
      <button type="button" class="btn ghost xs" data-m="-1" aria-label="Predošlý mesiac">‹</button>
      <h3 data-title>Mesačný report</h3>
      <button type="button" class="btn ghost xs" data-m="1" aria-label="Ďalší mesiac">›</button>
    </div>
    <div data-body><p class="empty">Načítavam…</p></div>
    <div class="modal-actions">
      <button type="button" class="btn ghost" data-close>Zavrieť</button>
      <button type="button" class="btn" data-send>Odoslať do Telegramu</button>
    </div>`, { wide: true });
  const body = m.el.querySelector("[data-body]");
  const title = m.el.querySelector("[data-title]");
  let current = startMonth || null;
  let loaded = null;
  async function load() {
    body.innerHTML = `<p class="empty">Načítavam…</p>`;
    try {
      const r = await fetchJson(`/api/reports/monthly${current ? `?month=${encodeURIComponent(current)}` : ""}`);
      loaded = r;
      current = r.month;
      title.textContent = `Mesačný report – ${r.label}`;
      if (!r.resolved) {
        body.innerHTML = `<p class="empty">V tomto mesiaci zatiaľ nie sú vyhodnotené žiadne tipy.${r.pending ? ` Ešte sa hrá: ${r.pending}.` : ""}</p>`;
        return;
      }
      const card = (label, value, cls) => `<div><small>${label}</small><b class="${cls || ""}">${value}</b></div>`;
      body.innerHTML = `
        <div class="kv-grid big">
          ${card("Úspešnosť", `${fmtNum(r.rate, 0)}${NB}%`)}
          ${card("Vyšlo / nevyšlo", `<span class="win">${r.won}</span> / <span class="loss">${r.lost}</span>`)}
          ${r.profit != null ? card("Zisk", `${signed(r.profit, 1)}${NB}j.`, r.profit >= 0 ? "g" : "l") : ""}
          ${r.roi != null ? card("ROI", `${signed(r.roi, 0)}${NB}%`, r.roi >= 0 ? "g" : "l") : ""}
          ${r.avgOdds != null ? card("Priemerný kurz", fmtNum(r.avgOdds, 2)) : ""}
          ${r.bestStreak >= 2 ? card("Séria výhier", r.bestStreak) : ""}
        </div>
        <p class="faint small">${r.voided ? `Vrátené: ${r.voided}. ` : ""}${r.pending ? `Ešte sa hrá: ${r.pending}. ` : ""}${r.bestDay ? `Najlepší deň: ${escapeHtml(r.bestDay.day)} (${signed(r.bestDay.profit, 1)}${NB}j.). ` : ""}${r.oddsCount < r.resolved ? `Zisk je z ${r.oddsCount} tipov so známym kurzom.` : ""}</p>
        <h4 class="ct">Podľa trhov</h4>
        ${(r.byMarket || []).map((b) => `
          <div class="mb-row">
            <div class="mb-top"><span class="mb-name">${escapeHtml(b.market)}</span><span class="mb-num">${b.promised != null ? `<span class="faint" title="Priemerná dôvera modelu pri ${b.promisedCount} tipoch">model sľuboval ${fmtNum(b.promised, 0)}${NB}% · </span>` : ""}${b.won} z ${b.total} · <b>${fmtNum(b.rate, 0)}${NB}%</b></span></div>
            <div class="bar mb-bar"><i style="width:${Math.round(b.rate)}%"></i></div>
          </div>`).join("")}
        <div data-model><p class="faint small">Načítavam stav modelu…</p></div>`;
      renderModelHealth(body.querySelector("[data-model]"));
    } catch (err) {
      body.innerHTML = `<p class="empty">Súhrn sa nepodarilo načítať: ${escapeHtml(err.message || String(err))}</p>`;
    }
  }
  m.el.querySelectorAll("[data-m]").forEach((b) =>
    b.addEventListener("click", () => {
      if (!current) return;
      current = shiftMonth(current, Number(b.dataset.m));
      load();
    })
  );
  m.el.querySelector("[data-send]").addEventListener("click", async () => {
    if (!loaded) return;
    const target = await askTelegramTarget();
    if (!target) return;
    try {
      await postJson("/api/telegram/monthly-report", { month: loaded.month, target });
      showToast("Mesačný súhrn odoslaný.");
    } catch (err) {
      showToast(`Odoslanie zlyhalo: ${err.message}`);
    }
  });
  load();
}
/**
 * Model (21. 10. 2026) – len pre Michala, do Telegramu nejde:
 *  - nový model (xG, únava, doma/vonku) oproti súčasnému + prepínač,
 *  - stav trhov: automatické vypnutie slabého trhu (30+ tipov) a oprava presnosti (50+ tipov).
 */
async function renderModelHealth(el) {
  if (!el) return;
  try {
    const d = await fetchJson("/api/model/health");
    const nm = d.newModel || {};
    const err = (v) => (v == null ? "–" : fmtNum(v * 100, 1));
    const tipsTxt = (r) => (r.tips ? `${r.won} z ${r.tips} (${fmtNum(r.hitRate, 0)}${NB}%), ${signed(r.profit, 1)}${NB}j.` : "žiadny tip");
    const enough = (nm.settledPicks || 0) >= 300;
    let better = null;
    if (nm.current && nm.novy && nm.current.brier != null && nm.novy.brier != null)
      better = nm.novy.brier < nm.current.brier - 0.0005 ? "novy" : nm.novy.brier > nm.current.brier + 0.0005 ? "current" : "same";
    const verdict = !nm.settledPicks
      ? "Zatiaľ žiadny vyhodnotený odhad – čísla pribudnú po odohraní zápasov."
      : !enough
      ? `Vyhodnotené odhady: ${nm.settledPicks}. Na spoľahlivý záver treba aspoň 300 (asi 3 – 4 týždne).`
      : better === "novy"
      ? `<b class="g">Nový model je presnejší</b> (${nm.settledPicks} vyhodnotených odhadov).`
      : better === "current"
      ? `<b>Súčasný model je presnejší</b> – nový zatiaľ nezapínaj (${nm.settledPicks} odhadov).`
      : `Oba modely sú rovnako presné (${nm.settledPicks} odhadov).`;
    const markets = (nm.byMarket || []).filter((x) => x.picks >= 10)
      .map((x) => `<tr><td>${escapeHtml(x.market)}</td><td class="num">${x.picks}</td><td class="num">${err(x.current)}</td><td class="num ${x.novy < x.current - 0.0005 ? "bt-good" : x.novy > x.current + 0.0005 ? "bt-bad" : ""}">${err(x.novy)}</td></tr>`).join("");
    const rows = (d.rows || []).map((r) => {
      const status = r.disabled
        ? `<b class="l" title="${escapeHtml(r.disabledReason || "")}">vypnutý</b>`
        : r.window >= d.thresholds.disableMin ? `<span class="g">aktívny</span>` : `<span class="faint">zbiera dáta (${r.window}/${d.thresholds.disableMin})</span>`;
      const cal = r.k == null
        ? "–"
        : r.calibrationActive
        ? `<b>× ${fmtNum(r.k, 2)}</b>`
        : r.k === 1 ? (r.calTips >= d.thresholds.calibrationMin ? "netreba" : `<span class="faint">netreba (${r.calTips}/${d.thresholds.calibrationMin})</span>`)
        : `<span class="faint">× ${fmtNum(r.k, 2)} od ${d.thresholds.calibrationMin} tipov (${r.calTips})</span>`;
      const promise = r.promised != null ? `${fmtNum(r.promised, 0)} → ${fmtNum(r.actual, 0)}${NB}%` : "–";
      return `<tr><td>${escapeHtml(r.label)}</td><td class="num">${r.tips}</td><td class="num">${promise}</td><td class="num ${r.windowProfit >= 0 ? "g" : "l"}">${r.window ? `${signed(r.windowProfit, 1)}${NB}j.` : "–"}</td><td class="num">${r.avgClv == null ? "–" : `${signed(r.avgClv, 1)}${NB}% (${r.clvCount})`}</td><td>${status}</td><td class="num">${cal}</td></tr>`;
    }).join("");
    el.innerHTML = `
      <h4 class="ct">Model – len pre teba</h4>
      <p class="small"><b class="gold">Nový model</b> (xG, únava a rotácia, doma / vonku) beží potichu vedľa súčasného. ${verdict}</p>
      ${nm.settledPicks ? `<div class="table-wrap"><table class="bt-table"><thead><tr><th></th><th class="num" title="Ako ďaleko boli percentá od reality (× 100). Nižšie = presnejšie.">Chyba</th><th class="num">Tipy, ktoré by prešli</th></tr></thead><tbody>
        <tr><td>Súčasný model${enough && better === "current" ? " ★" : ""}</td><td class="num">${err(nm.current.brier)}</td><td class="num">${tipsTxt(nm.current)}</td></tr>
        <tr><td>Nový model${enough && better === "novy" ? " ★" : ""}</td><td class="num">${err(nm.novy.brier)}</td><td class="num">${tipsTxt(nm.novy)}</td></tr>
      </tbody></table></div>` : ""}
      ${markets ? `<details class="inner-details"><summary>Podľa trhov</summary><div class="table-wrap"><table class="bt-table"><thead><tr><th>Trh</th><th class="num">Odhady</th><th class="num">Chyba – súčasný</th><th class="num">Chyba – nový</th></tr></thead><tbody>${markets}</tbody></table></div></details>` : ""}
      <p class="small">Tipy teraz vyberá: <b>${nm.active ? "nový model" : "súčasný model"}</b>
        <button type="button" class="btn ghost xs" data-toggle-model>${nm.active ? "Vrátiť súčasný model" : "Zapnúť nový model"}</button></p>
      <h4 class="ct">Trhy: sľuboval → vyšlo</h4>
      ${rows ? `<div class="table-wrap"><table class="bt-table"><thead><tr><th>Trh</th><th class="num">Tipy</th><th class="num" title="Priemerná dôvera modelu → skutočná úspešnosť (posledných najviac 100 tipov)">Sľuboval → vyšlo</th><th class="num" title="Posledných najviac ${d.thresholds.disableWindow} tipov">Zisk</th><th class="num" title="Priemerný uzatvárací kurz (počet tipov)">Uzatvárací kurz</th><th>Stav</th><th class="num">Oprava</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="faint small">Zatiaľ žiadne vyhodnotené tipy.</p>`}
      <p class="faint small">Trh sa sám vypne, keď má aspoň ${d.thresholds.disableMin} tipov a za posledných ${d.thresholds.disableWindow} je bez zisku a bez lepšieho uzatváracieho kurzu – a sám sa znova zapne, keď sa mu opäť darí. Oprava presnosti sa zapne sama od ${d.thresholds.calibrationMin} tipov trhu. O každej zmene ti príde správa na Telegram.</p>`;
    const btn = el.querySelector("[data-toggle-model]");
    if (btn)
      btn.addEventListener("click", async () => {
        const next = !nm.active;
        if (next && !enough && !confirm("Porovnanie ešte nemá dosť vyhodnotených odhadov (aspoň 300). Naozaj zapnúť nový model?")) return;
        btn.disabled = true;
        try {
          await postJson("/api/model/new-model", { active: next });
          showToast(next ? "Tipy odteraz vyberá nový model." : "Tipy znova vyberá súčasný model.");
          renderModelHealth(el);
        } catch (e) {
          showToast(`Nepodarilo sa: ${e.message}`);
          btn.disabled = false;
        }
      });
  } catch (e) {
    el.innerHTML = `<p class="faint small">Stav modelu sa nepodarilo načítať.</p>`;
  }
}
document.getElementById("monthlyReportBtn").addEventListener("click", () => openMonthlyReport());
document.getElementById("openMonthlyBtn2").addEventListener("click", () => openMonthlyReport());

// ---- Uzatvárací kurz (CLV): bol kurz pri zverejnení tipu lepší ako tesne pred výkopom? ----
async function renderClvSummary() {
  const el = document.getElementById("clvSummary");
  try {
    const d = await fetchJson("/api/clv/summary");
    if (!d || (!d.total && !d.pending && !(d.shadow && d.shadow.total))) { el.textContent = ""; return; }
    const sign = (v) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1).replace(".", ",") + NB + "%";
    const tie = fmtNum(d.tieThreshold ?? 0.5, 1);
    // Meranie (20. 10. 2026): lepší / bez zmeny (pod ±0,5 %) / horší; kde sú kurzy oboch strán, bez marže.
    const split = (x) => `lepší <b class="g">${x.beat}</b> · bez zmeny <b>${x.tie ?? 0}</b> · horší <b class="l">${x.worse}</b>`;
    let t = `<b class="gold">Uzatvárací kurz:</b> `;
    if (d.total) {
      t += `z <b>${d.total}</b> tipov: ${split(d)}. `;
      t += `Priemerne sme mali o <b class="${d.avgClv >= 0 ? "g" : "l"}">${sign(d.avgClv)}</b> lepší kurz ako tesne pred zápasom`;
      t += d.byProbability ? ` (${d.byProbability} z ${d.total} porovnané bez marže stávkoviek).` : ".";
      const markets = (d.byMarket || []).filter((x) => x.total >= 3);
      if (markets.length) t += ` Podľa trhov: ${markets.map((x) => `${escapeHtml(x.market)} ${sign(x.avgClv)} (${x.total})`).join(", ")}.`;
    } else {
      t += `zatiaľ žiadny tip so zisteným kurzom tesne pred výkopom.`;
    }
    if (d.pending) t += ` Čaká: ${d.pending}.`;
    const sh = d.shadow;
    if (sh && (sh.total || sh.pending)) {
      t += `<br><b class="gold">Uzatvárací kurz vyradených tipov:</b> `;
      if (sh.total) {
        t += `z <b>${sh.total}</b>: ${split(sh)}, priemer <b class="${sh.avgClv >= 0 ? "g" : "l"}">${sign(sh.avgClv)}</b>.`;
        const reasons = (sh.byReason || []).filter((x) => x.total >= 1);
        if (reasons.length)
          t += `<details class="inner-details"><summary>Podľa dôvodu vyradenia</summary><div class="table-wrap"><table class="bt-table"><thead><tr><th>Dôvod</th><th class="num">Tipy</th><th class="num">Lepší / bez zmeny / horší</th><th class="num">Priemer</th></tr></thead><tbody>${reasons
            .map((x) => `<tr><td>${escapeHtml(shadowReasonLabel(x.reason))}</td><td class="num">${x.total}</td><td class="num">${x.beat} / ${x.tie} / ${x.worse}</td><td class="num">${x.avgClv == null ? "–" : sign(x.avgClv)}</td></tr>`)
            .join("")}</tbody></table></div></details>`;
      } else {
        t += `zatiaľ žiadny so zisteným kurzom pred výkopom.`;
      }
      if (sh.pending) t += ` Čaká: ${sh.pending}.`;
    }
    el.innerHTML = t;
    el.title = `Ak je kurz pri zverejnení tipu dlhodobo vyšší ako tesne pred výkopom, model predbieha stávkovky – to je spoľahlivejší znak kvality ako samotná úspešnosť pri malom počte tipov. Rozdiel pod ±${tie} % sa ráta ako bez zmeny.`;
  } catch {
    el.textContent = "";
  }
}

// ---- Tichá evidencia tipov vyradených pre rozpor so stávkovkami ----
// Dôvody vyradenia z tichej evidencie (kódy z predictor.ts, 20. 10. 2026).
const SHADOW_REASON_LABEL = {
  conflict: "rozpor so stávkovkami",
  ev_high: "podozrivo vysoká hodnota (nad +25 %)",
  ev_high_few_games: "vysoká hodnota pri málo dátach",
  ev_low: "nízka hodnota (pod +5 %)",
  min_odds: `kurz pod ${fmtNum(1.55, 2)}`,
  one_bookmaker: "kurz len od jednej stávkovky",
  band_low: "dôvera pod pásmom (do 21. 10. pod 68 %, potom pod 65 %)",
  band_high: "dôvera nad 80 %",
  category_lower_ev: "iná hranica trhu mala vyššiu hodnotu",
  match_lower_ev: "iný tip zápasu mal vyššiu hodnotu",
  market_disabled: "trh dočasne vypnutý (slabé výsledky)",
  market_excluded: "trh neodporúčame",
  few_games: "málo odohraných zápasov",
  no_market_odds: "trh bez kurzu",
  no_odds: "zápas bez kurzov",
  unknown: "neznámy",
};
function shadowReasonLabel(code) {
  return SHADOW_REASON_LABEL[code] || code || "neznámy";
}
/** Kompaktná tabuľka skupín tichej evidencie (dôvod alebo rozdiel model − stávkovky). */
function shadowTableHtml(rows, firstCol, labelOf) {
  const p = (v) => (v == null ? "–" : `${Math.round(v)}${NB}%`);
  const body = rows
    .map((r) => `<tr><td>${escapeHtml(labelOf(r.key))}</td><td class="num">${r.count}</td><td class="num">${r.settled ? `${r.won}/${r.settled}` : "–"}</td><td class="num">${p(r.hitRate)}</td><td class="num">${p(r.avgModel)}</td><td class="num">${p(r.avgMarket)}</td><td class="num ${r.withOdds ? (r.profit >= 0 ? "g" : "l") : ""}">${r.withOdds ? `${signed(r.profit, 1)}${NB}j.` : "–"}</td></tr>`)
    .join("");
  return `<div class="table-wrap"><table class="bt-table"><thead><tr><th>${firstCol}</th><th class="num">Spolu</th><th class="num" title="vyšlo / vyhodnotené">Vyšlo</th><th class="num">Úspešnosť</th><th class="num">Model</th><th class="num">Stávkovky</th><th class="num" title="Zisk pri vklade 1 jednotky za zaznamenaný kurz">Zisk</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

async function renderShadowSummary() {
  const el = document.getElementById("shadowSummary");
  try {
    const d = await fetchJson("/api/shadow/summary");
    if (!d) { el.textContent = ""; return; }
    const head = `<b class="gold">Vyradené tipy (rozpor so stávkovkami):</b> `;
    const p = (v) => (v == null ? "–" : `${Math.round(v)}${NB}%`);
    let t = "";
    if (!d.settled) {
      t = d.total ? `${head}${d.total} zapísaných, zatiaľ žiadny vyhodnotený.` : "";
    } else {
      t = `${head}<b>${d.won} z ${d.settled}</b> vyšlo (<b>${p(d.hitRate)}</b>), model im dával v priemere ${p(d.avgModel)}, stávkovky ${p(d.avgMarket)}.`;
      if (d.withOdds) t += ` Keby sa na ne stavilo: <b class="${d.profit >= 0 ? "g" : "l"}">${d.profit >= 0 ? "+" : "−"}${Math.abs(d.profit).toFixed(1).replace(".", ",")}${NB}j.</b>`;
      if (d.pending) t += ` Čaká: ${d.pending}.`;
    }
    // Meranie (20. 10. 2026): všetky dôvody vyradenia a rozdiel model − stávkovky.
    if (d.all && d.all.total && (d.byReason || []).length) {
      t += `<details class="inner-details"><summary>Všetky vyradené tipy podľa dôvodu a rozdielu (${d.all.total}, vyhodnotené ${d.all.settled})</summary>
        ${shadowTableHtml(d.byReason, "Dôvod vyradenia", shadowReasonLabel)}
        ${shadowTableHtml(d.byGap || [], "Model − stávkovky", (k) => (k === "unknown" ? "neznámy" : `${k} b.`))}
        <div>Model a stávkovky = priemer pri vyhodnotených tipoch. Stávkovky bez marže, ak boli kurzy oboch strán (staršie záznamy s odhadom marže 5 %). Zisk = vklad 1 jednotky za zaznamenaný kurz. Z každého trhu zápasu sa zapisuje len hranica s najväčšou hodnotou; tipy s rozporom všetky.</div></details>`;
    }
    el.innerHTML = t;
  } catch {
    el.textContent = "";
  }
}

// ---- Tiché sledovanie: model + stávkovky ako „druhý názor“ ----
async function renderBlendSummary() {
  const el = document.getElementById("blendSummary");
  try {
    const d = await fetchJson("/api/blend/summary");
    if (!d || !d.fixtures) { el.textContent = ""; return; }
    const head = `<b class="gold">Sledovanie „model + stávkovky“:</b> zapísané zápasy: ${d.fixtures}`;
    if (!d.settledPicks) {
      el.innerHTML = `${head}, zatiaľ žiadny vyhodnotený. Čísla pribudnú po odohraní zápasov.`;
      return;
    }
    const num = (v, k = 1) => Number(v).toFixed(k).replace(".", ",");
    const sign = (v) => (v >= 0 ? "+" : "−") + num(Math.abs(v));
    const best = (d.rows || []).reduce((a, r) => (r.brier != null && (a == null || r.brier < a.brier) ? r : a), null);
    const enough = d.settledPicks >= 300;
    const rows = (d.rows || []).map((r) => {
      const label = r.weight === 0 ? "len model (dnes)" : `${100 - r.weight} % model / ${r.weight} % stávkovky`;
      const tipsTxt = r.tips ? `${r.won} z ${r.tips} (${Math.round(r.hitRate)}${NB}%), ${sign(r.profit)}${NB}j.` : "žiadny tip";
      const mark = best && r.weight === best.weight ? " ★" : "";
      return `<tr><td>${label}${mark}</td><td class="num">${r.brier == null ? "–" : num(r.brier * 100)}</td><td class="num">${tipsTxt}</td></tr>`;
    }).join("");
    el.innerHTML = `${head}, vyhodnotené odhady: ${d.settledPicks}${d.pendingFixtures ? `, čakajúce zápasy: ${d.pendingFixtures}` : ""}.
      ${enough ? "" : `<br><em>Na spoľahlivý záver treba aspoň 300 vyhodnotených odhadov.</em>`}
      <details class="inner-details"><summary>Porovnať pomery</summary>
      <div class="table-wrap"><table class="bt-table"><thead><tr><th>Pomer</th><th class="num" title="Ako ďaleko boli percentá od reality. Nižšie = presnejšie.">Chyba</th><th class="num">Tipy, ktoré by prešli</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div>Chyba samotných stávkoviek: ${d.bookmakersBrier == null ? "–" : num(d.bookmakersBrier * 100)}. ★ = najpresnejší pomer.</div></details>`;
    el.title = "Tipy, ktoré dostávaš, sa nemenia. Appka si len potichu zapisuje odhad modelu aj stávkoviek a po zápase porovná, ktorý pomer by trafil najlepšie.";
  } catch {
    el.textContent = "";
  }
}

// =====================================================================
// ČLENOVIA (platba beží mimo appky, napr. bankovým prevodom)
// =====================================================================
// Ceny musia sedieť s PRICES na tipradar.eu (landing/index.html).
// Členstvo podľa dĺžky: Silver = 1 mesiac, Gold = 3 mesiace (bez obmedzenia miest), Platinum = 6 mesiacov (30 miest).
// 6 mesiacov má kvôli uloženým dátam kód "season" a ukladá sa ako tier "group" – počíta sa do miest.
const MEMBER_PRICES = { m1: 49, m3: 119, season: 219 };
const MEMBER_NAME = { m1: "Silver", m3: "Gold", season: "Platinum" };
const MEMBER_LENGTH_LABEL = { m1: "1 mesiac", m3: "3 mesiace", season: "6 mesiacov" };
const MEMBER_MONTHS = { m1: 1, m3: 3, season: 6 };
// Letná prestávka: jún a júl sa do členstva nepočítajú (rovnako ako src/payments.ts).
const SUMMER_PAUSE = { fromMonth: 6, toMonth: 7 };
let memberFilter = "active";
let lastSubs = [];
const subscribersListEl = document.getElementById("subscribersList");
const subLengthSelect = document.getElementById("subLength");
const subPriceInput = document.getElementById("subPrice");
const subStartInput = document.getElementById("subStart");

function daysUntil(dateStr) {
  const diffMs = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/** Koniec členstva: od dátumu `from` pridá dĺžku, jún a júl sa nepočítajú (členstvo sa pozastaví). */
function memberEnd(from, length) {
  const start = new Date(`${String(from).slice(0, 10)}T23:59:00`);
  const calEnd = new Date(start);
  const day = calEnd.getDate();
  calEnd.setMonth(calEnd.getMonth() + (MEMBER_MONTHS[length] || 1));
  if (calEnd.getDate() < day) calEnd.setDate(0); // napr. 31. 1. + 1 mesiac = 28./29. 2.
  let remaining = calEnd.getTime() - start.getTime();
  let cursor = start;
  for (let guard = 0; guard < 20; guard++) {
    const y = cursor.getFullYear();
    const pauseStart = new Date(y, SUMMER_PAUSE.fromMonth - 1, 1).getTime();
    const pauseEnd = new Date(y, SUMMER_PAUSE.toMonth, 1).getTime(); // 1. 8.
    const t = cursor.getTime();
    if (t >= pauseStart && t < pauseEnd) { cursor = new Date(pauseEnd); continue; }
    const nextPause = t < pauseStart ? pauseStart : new Date(y + 1, SUMMER_PAUSE.fromMonth - 1, 1).getTime();
    if (t + remaining <= nextPause) return new Date(t + remaining);
    remaining -= nextPause - t;
    cursor = new Date(nextPause);
  }
  return calEnd;
}

function syncMemberPrice() {
  subPriceInput.value = MEMBER_PRICES[subLengthSelect.value];
  updateSubEndPreview();
}
function updateSubEndPreview() {
  const start = subStartInput.value || todayIso();
  const end = memberEnd(start, subLengthSelect.value);
  document.getElementById("subEndPreview").textContent = `Členstvo potrvá do ${end.toLocaleDateString("sk-SK")} (jún a júl sa nepočítajú).`;
}
subLengthSelect.addEventListener("change", syncMemberPrice);
subStartInput.addEventListener("change", updateSubEndPreview);

function subscriberStatus(sub) {
  const days = daysUntil(sub.nextPaymentDue);
  if (days < 0) return { label: "Skončilo", cls: "l" };
  if (days <= 3) return { label: days === 0 ? "Končí dnes" : `Končí o ${days} d.`, cls: "p" };
  return { label: "Aktívny", cls: "w" };
}

// ---- Garancia: ak obdobie členstva (Silver 1, Gold 3, Platinum 6 mesiacov) skončí v strate, člen dostane mesiac zadarmo ----
let lastGuarantee = [];
const fmtDay = (iso) => new Date(iso).toLocaleDateString("sk-SK");
async function loadGuarantee() {
  try {
    lastGuarantee = await fetchJson("/api/guarantee");
  } catch (err) {
    lastGuarantee = [];
    const el = document.getElementById("guaranteeCard");
    if (el) {
      el.className = "card gar-card";
      el.innerHTML = `<p class="gar-line faint">Garanciu sa nepodarilo načítať: ${escapeHtml(err.message || String(err))}</p>`;
      el.hidden = false;
    }
    return false;
  }
  renderGuarantee();
  return true;
}
function renderGuarantee() {
  const el = document.getElementById("guaranteeCard");
  if (!el) return;
  const due = lastGuarantee.filter((r) => r.eligible);
  el.className = `card gar-card${due.length ? " warn" : ""}`;
  el.innerHTML = due.length
    ? `<div class="gar-head"><h4 class="ct">Garancia</h4><label class="check"><input type="checkbox" data-gar-notify checked /> Poslať správu do Telegramu</label></div>
      <p class="gar-line">${due.length === 1 ? "1 členovi skončilo" : `${due.length} členom skončilo`} členstvo v strate – podľa garancie ${due.length === 1 ? "má" : "majú"} nárok na mesiac zadarmo.</p>
      <div class="gar-rows">${due.map((r) => `
        <div class="gar-row">
          <span><b>${escapeHtml(r.name)}</b> <span class="tag gold">${escapeHtml(r.tier.toUpperCase())}</span><br>
          <span class="muted small">${fmtDay(r.periodStart)} – ${fmtDay(r.periodEnd)} · <span class="l">${signed(r.profit, 1)}${NB}j.</span> (${plural(r.resolved, "tip", "tipy", "tipov")})</span></span>
          <button type="button" class="btn sm" data-gar-id="${escapeHtml(r.id)}" data-gar-start="${escapeHtml(r.periodStart)}">Pridať mesiac zadarmo</button>
        </div>`).join("")}</div>`
    : `<div class="gar-head"><h4 class="ct">Garancia</h4></div><p class="gar-line faint">Teraz nikto nemá nárok na mesiac zadarmo.</p>`;
  el.hidden = false;
}
/** Bežiace obdobie člena (výsledok garancie priebežne). */
function currentGuaranteeRow(id) {
  return lastGuarantee.find((r) => r.id === id && !r.ended);
}
document.getElementById("guaranteeCard")?.addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-gar-id]");
  if (!b || b.disabled) return;
  const row = lastGuarantee.find((r) => r.id === b.dataset.garId && r.periodStart === b.dataset.garStart);
  if (!row) return;
  const notify = !!document.querySelector("#guaranteeCard [data-gar-notify]")?.checked;
  if (!window.confirm(`Pridať ${row.name} mesiac zadarmo? Členstvo ${row.tier} (${fmtDay(row.periodStart)} – ${fmtDay(row.periodEnd)}) skončilo v strate ${signed(row.profit, 1)}${NB}j.${notify ? " Člen dostane správu do Telegramu." : ""}`)) return;
  b.disabled = true;
  try {
    const r = await postJson("/api/guarantee/apply", { id: row.id, periodStart: row.periodStart, notify });
    showToast(`Mesiac zadarmo pridaný, platí do ${fmtDay(r.freeUntil)}.` + (notify ? (r.notified ? " Správa odišla." : " Správa neodišla.") : ""));
    openSubscribers();
  } catch (err) {
    showToast(`Garanciu sa nepodarilo pridať: ${err.message}`);
    b.disabled = false;
  }
});

async function openSubscribers() {
  const guarantee = loadGuarantee();
  void renderLeads();
  void renderPayments();
  loadSeats();
  if (!subStartInput.value) subStartInput.value = todayIso();
  if (!subPriceInput.value) syncMemberPrice();
  if (!lastSubs.length) subscribersListEl.innerHTML = skeletonHtml(2);
  try {
    const subs = await fetchJson("/api/subscribers");
    await guarantee;
    renderSubscribersList(subs);
  } catch (err) {
    subscribersListEl.innerHTML = `<p class="empty">Členov sa nepodarilo načítať: ${escapeHtml(err.message)}</p>`;
  }
}

function renderSubscribersList(subs) {
  lastSubs = subs;
  const active = subs.filter((s) => daysUntil(s.nextPaymentDue) >= 0);
  const vip = active.filter((s) => s.tier === "group").length;
  const income = active.reduce((sum, s) => sum + (Number(s.priceEur) || 0), 0);
  const ending = active.filter((s) => daysUntil(s.nextPaymentDue) <= 7).length;
  const vipPct = Math.min(100, Math.round((vip / 30) * 100));
  document.getElementById("subscribersSummary").innerHTML = `
    <div class="kpi"><small>Aktívni</small><b>${active.length}</b></div>
    <div class="kpi"><small>Silver a Gold</small><b>${active.length - vip}</b></div>
    <div class="kpi"><small>Platinum</small><b>${vip}<span class="faint"> / 30</span></b><div class="bar"><i style="width:${vipPct}%"></i></div></div>
    <div class="kpi"><small>Zaplatené</small><b>${income}${NB}€</b><span>aktívni členovia</span></div>
    <div class="kpi${ending ? " warn" : ""}"><small>Končí do 7 dní</small><b>${ending}</b></div>`;
  document.querySelectorAll("#memberFilter [data-f]").forEach((b) => b.classList.toggle("on", b.dataset.f === memberFilter));

  const shown = subs
    .filter((s) => memberFilter === "all" || (memberFilter === "active" ? daysUntil(s.nextPaymentDue) >= 0 : daysUntil(s.nextPaymentDue) < 0))
    .sort((a, b) => (memberFilter === "expired"
      ? new Date(b.nextPaymentDue) - new Date(a.nextPaymentDue)
      : new Date(a.nextPaymentDue) - new Date(b.nextPaymentDue)));
  if (!shown.length) {
    subscribersListEl.innerHTML = `<p class="empty">${
      subs.length === 0 ? "Zatiaľ nemáš žiadnych členov. Po prvej platbe ho pridaj formulárom vyššie."
      : memberFilter === "active" ? "Momentálne nemáš aktívnych členov." : "Žiadne skončené členstvá."
    }</p>`;
    return;
  }
  subscribersListEl.innerHTML = shown
    .map((s) => {
      const status = subscriberStatus(s);
      const isVip = s.tier === "group";
      const length = s.length || "m1";
      const endDate = new Date(s.nextPaymentDue).toLocaleDateString("sk-SK");
      const startDate = s.startDate ? new Date(s.startDate).toLocaleDateString("sk-SK") : null;
      const details = [
        escapeHtml(s.contact || ""),
        `${MEMBER_LENGTH_LABEL[length] || length} · ${Number(s.priceEur) || 0}${NB}€`,
        startDate ? `${startDate} – ${endDate}` : `do ${endDate}`,
        s.note ? escapeHtml(s.note) : "",
      ].filter(Boolean).join(" · ");
      const g = currentGuaranteeRow(s.id);
      // Priebežný výsledok zaplateného obdobia (mesiac zadarmo sa do garancie nepočíta, ten má len štítok).
      const period = !g || g.free ? ""
        : !g.resolved ? `<span class="gar-run faint">Toto obdobie: zatiaľ bez vyhodnotených tipov</span>`
        : `<span class="gar-run ${g.profit < 0 ? "l" : g.profit > 0 ? "g" : "faint"}">Toto obdobie: ${signed(g.profit, 1)}${NB}j. (${plural(g.resolved, "tip", "tipy", "tipov")})</span>`;
      return `<div class="mrow">
        <span class="mt"><b>${escapeHtml(s.name)} <span class="tag gold">${escapeHtml((MEMBER_NAME[isVip ? "season" : length] || "ČLEN").toUpperCase())}</span>${s.founder ? ` <span class="tag">Prvý člen</span>` : ""}${g && g.free ? ` <span class="tag free">Mesiac zadarmo</span>` : ""}</b><span>${details}</span>${period}</span>
        <span class="res-b ${status.cls}">${status.label}</span>
        <span class="ic">
          ${s.telegramChatId ? `<button type="button" class="btn ghost xs" data-test-reminder-id="${escapeHtml(s.id)}" title="Poslať testovaciu pripomienku teraz">🔔 Test</button>` : ""}
          <button type="button" class="btn ghost xs" data-extend-id="${escapeHtml(s.id)}" title="Predĺžiť o ďalšie obdobie (${MEMBER_LENGTH_LABEL[length] || length})">Predĺžiť</button>
          <button type="button" class="ib danger" data-remove-id="${escapeHtml(s.id)}" title="Zmazať člena" aria-label="Zmazať člena">${ICON.trash}</button>
        </span>
      </div>`;
    })
    .join("");
}

subscribersListEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (btn.dataset.extendId) {
    const sub = lastSubs.find((s) => s.id === btn.dataset.extendId);
    if (!sub) return;
    const length = sub.length || "m1";
    // Predĺženie nadväzuje na koniec, ak ešte platí, inak začína dnes.
    const from = daysUntil(sub.nextPaymentDue) >= 0 ? sub.nextPaymentDue : todayIso();
    const end = memberEnd(from, length);
    if (!window.confirm(`Predĺžiť ${sub.name} (${MEMBER_LENGTH_LABEL[length] || length}) do ${end.toLocaleDateString("sk-SK")}?`)) return;
    try {
      await fetchJson(`/api/subscribers/${sub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Nové obdobie: od konca súčasného (alebo od dnes); garancia sa vzťahuje na celé obdobie.
        body: JSON.stringify({ nextPaymentDue: end.toISOString(), periodStart: daysUntil(sub.nextPaymentDue) >= 0 ? sub.nextPaymentDue : new Date().toISOString() }),
      });
      showToast("Členstvo predĺžené.");
      openSubscribers();
    } catch (err) {
      showToast(`Predĺženie zlyhalo: ${err.message}`);
    }
  } else if (btn.dataset.testReminderId) {
    btn.disabled = true;
    try {
      const res = await fetchJson(`/api/subscribers/${btn.dataset.testReminderId}/test-reminder`, { method: "POST" });
      showToast(res.ok ? "Testovacia pripomienka odoslaná – skontroluj Telegram." : "Odoslanie zlyhalo.");
    } catch (err) {
      showToast(`Odoslanie zlyhalo: ${err.message}`);
    } finally {
      btn.disabled = false;
    }
  } else if (btn.dataset.removeId) {
    if (!window.confirm("Naozaj zmazať tohto člena?")) return;
    try {
      await fetchJson(`/api/subscribers/${btn.dataset.removeId}`, { method: "DELETE" });
      showToast("Člen zmazaný.");
      openSubscribers();
    } catch (err) {
      showToast(`Zmazanie zlyhalo: ${err.message}`);
    }
  }
});

document.getElementById("memberFilter").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-f]");
  if (!b) return;
  memberFilter = b.dataset.f;
  renderSubscribersList(lastSubs);
});

document.getElementById("addSubscriberBtn").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const nameEl = document.getElementById("subName");
  const name = nameEl.value.trim();
  if (!name) { showToast("Zadaj meno člena."); nameEl.focus(); return; }
  const length = subLengthSelect.value;
  const tier = length === "season" ? "group" : "individual"; // 6 mesiacov = obmedzené miesta
  const start = subStartInput.value || todayIso();
  const priceRaw = subPriceInput.value.trim();
  const priceEur = priceRaw === "" ? MEMBER_PRICES[length] : Number(priceRaw);
  const end = memberEnd(start, length);
  if (end.getTime() < Date.now()) {
    if (!window.confirm(`Toto členstvo by skončilo už ${end.toLocaleDateString("sk-SK")}. Pridať aj tak?`)) return;
  }
  const subscriber = {
    id: `sub-${Date.now()}`,
    name,
    contact: document.getElementById("subContact").value.trim(),
    telegramChatId: document.getElementById("subTelegramChatId").value.trim() || undefined,
    tier,
    priceEur,
    length,
    startDate: new Date(`${start}T12:00:00`).toISOString(),
    periodStart: new Date(`${start}T12:00:00`).toISOString(),
    nextPaymentDue: end.toISOString(),
    founder: document.getElementById("subFounder").checked,
    note: document.getElementById("subNote").value.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  btn.disabled = true;
  try {
    await postJson("/api/subscribers", subscriber);
    ["subName", "subContact", "subTelegramChatId", "subNote"].forEach((id) => { document.getElementById(id).value = ""; });
    subStartInput.value = todayIso();
    updateSubEndPreview();
    memberFilter = "active";
    showToast(`${name} pridaný medzi členov.`);
    openSubscribers();
  } catch (err) {
    showToast(`Pridanie zlyhalo: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
});

// ---- Platby prevodom (QR kód) – potvrdenie ----
function fmtDayTime(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : `${d.getDate()}. ${d.getMonth() + 1}. ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
async function renderPayments() {
  const box = document.getElementById("paymentsBox");
  const el = document.getElementById("paymentsList");
  let list = [];
  try {
    list = await fetchJson("/api/payments");
  } catch {
    box.hidden = true;
    return;
  }
  if (!Array.isArray(list)) list = [];
  // Čakajúce: najprv tí, čo dali vedieť „Zaplatil som“; vybavené len pre prehľad (posledných 30 dní).
  const pending = list.filter((p) => p.status === "pending").sort((a, b) => (b.claimedAt ? 1 : 0) - (a.claimedAt ? 1 : 0));
  const done = list.filter((p) => p.status !== "pending").slice(0, 10);
  box.hidden = !pending.length && !done.length;
  const rowHtml = (p) => {
    const who = p.name ? `${escapeHtml(p.name)}${p.username ? ` <span class="faint">@${escapeHtml(p.username)}</span>` : ""}` : `<span class="faint">zatiaľ bez mena</span>`;
    const state =
      p.status === "pending" ? (p.claimedAt ? `🏦 dal vedieť, že zaplatil · ${fmtDayTime(p.claimedAt)}` : `otvoril platbu · ${fmtDayTime(p.createdAt)} · ešte nedal vedieť`)
      : p.status === "cancelled" ? "✖ zrušené"
      : p.status === "redeemed" ? `✅ potvrdené, pozvánka odoslaná · ${fmtDayTime(p.paidAt)}`
      : `✅ potvrdené · čaká, kým klikne „Zaplatil som“`;
    return `<div class="mrow">
      <span class="mt"><b>VS ${escapeHtml(p.vs || "")} · ${escapeHtml(p.priceEur)}${NB}€ · ${escapeHtml(p.termName || "")}</b><span>${who} · ${state}</span></span>
      <span class="ic">${p.status === "pending"
        ? `<button type="button" class="btn xs" data-pay-ok="${escapeHtml(p.token)}">Potvrdiť</button><button type="button" class="btn ghost xs" data-pay-no="${escapeHtml(p.token)}">Zrušiť</button>`
        : `<button type="button" class="btn ghost xs" data-pay-del="${escapeHtml(p.token)}">Odstrániť</button>`}</span>
    </div>`;
  };
  el.innerHTML = pending.map(rowHtml).join("") + (done.length ? `<p class="list-sub">Vybavené</p>` + done.map(rowHtml).join("") : "");
  el.querySelectorAll("[data-pay-ok]").forEach((b) => {
    b.onclick = async () => {
      const p = pending.find((x) => x.token === b.dataset.payOk);
      if (!p || !window.confirm(`Prišla na účet platba ${p.priceEur} € s variabilným symbolom ${p.vs}?`)) return;
      b.disabled = true;
      try {
        const r = await fetchJson(`/api/payments/${encodeURIComponent(p.token)}/confirm`, { method: "POST" });
        showToast(r.invited ? "Potvrdené. Bot mu poslal pozvánku a člen je zapísaný." : "Potvrdené. Pozvánku dostane, keď na stránke platby klikne „Zaplatil som“.");
      } catch (err) {
        showToast(err?.message || "Potvrdenie zlyhalo.");
      }
      void openSubscribers();
    };
  });
  el.querySelectorAll("[data-pay-del]").forEach((b) => {
    b.onclick = async () => {
      if (!window.confirm("Odstrániť tento záznam o platbe? Člen v predplatiteľoch ostane.")) return;
      b.disabled = true;
      try {
        await fetchJson(`/api/payments/${encodeURIComponent(b.dataset.payDel)}`, { method: "DELETE" });
      } catch (err) {
        showToast(err?.message || "Odstránenie zlyhalo.");
      }
      void renderPayments();
    };
  });
  el.querySelectorAll("[data-pay-no]").forEach((b) => {
    b.onclick = async () => {
      if (!window.confirm("Zrušiť túto čakajúcu platbu?")) return;
      b.disabled = true;
      try {
        await fetchJson(`/api/payments/${encodeURIComponent(b.dataset.payNo)}/cancel`, { method: "POST" });
      } catch (err) {
        showToast(err?.message || "Zrušenie zlyhalo.");
      }
      void renderPayments();
    };
  });
}

// ---- Poradovník záujemcov z webu ----
document.getElementById("salesOpenBtn").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  if (!window.confirm("Poslať všetkým z poradovníka správu, že predaj je otvorený? Každý ju dostane len raz.")) return;
  btn.disabled = true;
  try {
    const r = await fetchJson("/api/leads/sales-open", { method: "POST" });
    showToast(`Správa odišla ${plural(r.sent, "človeku", "ľuďom", "ľuďom")}.` + (r.failed ? ` Neodišla: ${r.failed}.` : "") + (r.skipped ? ` Preskočení (už dostali, sú členmi alebo sú z formulára): ${r.skipped}.` : ""));
  } catch (err) {
    showToast(err?.message || "Správu sa nepodarilo poslať.");
  }
  btn.disabled = false;
  renderLeads();
});
const LEAD_PLAN_LABEL = { start: "Silver 1 mesiac", seria: "Gold 3 mesiace", sampion: "Platinum 6 mesiacov", sampion_waitlist: "Platinum 6 mesiacov (náhradník)", seria_waitlist: "Gold 3 mesiace (náhradník)", start_waitlist: "Silver 1 mesiac (náhradník)", premium: "starý odkaz Premium", vip: "Platinum 6 mesiacov (starý odkaz VIP)", vip_waitlist: "Platinum 6 mesiacov (náhradník)", clenstvo: "nevybral", otazka: "otázka z webu" };
async function renderLeads() {
  const el = document.getElementById("leadsList");
  try {
    const leads = await fetchJson("/api/leads");
    if (!leads.length) {
      el.innerHTML = `<p class="empty">Zatiaľ sa nikto nezapísal.</p>`;
      return;
    }
    el.innerHTML = leads
      .map((l, i) => {
        const d = new Date(l.firstAt);
        const date = isNaN(d.getTime()) ? "" : longDate(d);
        return `<div class="mrow lead">
          <span class="mt"><b>${i + 1}. ${escapeHtml(l.name || "Neznámy")}${l.username ? ` <span class="faint">@${escapeHtml(l.username)}</span>` : ""}</b>
            <span>${l.paidAt ? "✅ zaplatil · " : l.salesMsgAt ? "✉️ dostal správu o predaji · " : ""}${escapeHtml(LEAD_PLAN_LABEL[l.plan] || l.plan)} · zapísaný ${date} · ${l.email ? `formulár na webe · ${escapeHtml(l.email)}` : `ID ${escapeHtml(l.chatId)}`}</span>
            ${l.note ? `<span class="faint">„${escapeHtml(l.note)}“</span>` : ""}</span>
          <span class="ic">
            ${l.email ? `<a class="btn ghost xs" href="mailto:${encodeURIComponent(l.email)}">Napísať e-mail</a>` : `<a class="btn ghost xs" href="tg://user?id=${encodeURIComponent(l.chatId)}">Otvoriť chat</a>`}
            <button type="button" class="btn ghost xs" data-lead-add="${escapeHtml(l.chatId)}">Pridať ako člena</button>
            <button type="button" class="ib danger" data-lead-del="${escapeHtml(l.chatId)}" title="Odstrániť z poradovníka" aria-label="Odstrániť z poradovníka">${ICON.trash}</button>
          </span></div>`;
      })
      .join("");
    el.querySelectorAll("[data-lead-add]").forEach((b) => {
      b.onclick = () => {
        const l = leads.find((x) => String(x.chatId) === b.dataset.leadAdd);
        if (!l) return;
        document.getElementById("subName").value = l.name || "";
        document.getElementById("subContact").value = l.email || (l.username ? "@" + l.username : "");
        document.getElementById("subTelegramChatId").value = l.email ? "" : l.chatId;
        subLengthSelect.value = ["sampion", "sampion_waitlist", "vip", "vip_waitlist"].includes(l.plan) ? "season" : l.plan === "seria" || l.plan === "seria_waitlist" ? "m3" : "m1";
        syncMemberPrice();
        document.getElementById("subName").scrollIntoView({ behavior: "smooth", block: "center" });
        showToast("Údaje sú vyplnené – skontroluj ich a klikni na „Pridať člena“.");
      };
    });
    el.querySelectorAll("[data-lead-del]").forEach((b) => {
      b.onclick = async () => {
        if (!window.confirm("Odstrániť záujemcu z poradovníka?")) return;
        try {
          await fetchJson(`/api/leads/${encodeURIComponent(b.dataset.leadDel)}`, { method: "DELETE" });
        } catch { /* ignorujeme */ }
        renderLeads();
      };
    });
  } catch {
    el.innerHTML = `<p class="empty">Poradovník sa nepodarilo načítať.</p>`;
  }
}

// =====================================================================
// NÁSTROJE
// =====================================================================

// ---- Spätný test modelu ----
const BT_JOB_KEY = "tipradar-backtest-job";
let btPollTimer = null;
let btModal = null;
let btLastJob = null;

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* bez úložiska */ } }
function lsDel(k) { try { localStorage.removeItem(k); } catch { /* bez úložiska */ } }

function pct(v) { return v == null ? "–" : `${fmtNum(v, 0)}${NB}%`; }
function diffCell(pred, real) {
  if (pred == null || real == null) return `<td class="num">–</td>`;
  const d = real - pred;
  const cls = Math.abs(d) < 5 ? "bt-good" : d < 0 ? "bt-bad" : "";
  return `<td class="num ${cls}">${d > 0 ? "+" : d < 0 ? "−" : ""}${fmtNum(Math.abs(d), 0)} b.</td>`;
}

async function openBacktest() {
  const to = new Date(); to.setDate(to.getDate() - 1);
  const from = new Date(); from.setDate(from.getDate() - 21);
  btModal = openModal(`
    <h3>Spätný test modelu</h3>
    <p class="muted small">Model vypočíta tipy pre odohrané zápasy len z údajov, ktoré boli známe pred výkopom, a porovná ich so skutočnými výsledkami. Ukáže, pri ktorých trhoch sa percentá zhodujú s realitou a kde model preceňuje alebo podceňuje. Kurzy sa nepoužívajú – test meria presnosť percent, nie zisk.</p>
    <div class="bt-leagues" id="btLeagues"><span class="faint small">Načítavam ligy…</span></div>
    <div class="form-grid four">
      <label class="fld">Od<input type="date" id="btFrom" value="${isoDay(from)}" /></label>
      <label class="fld">Do<input type="date" id="btTo" value="${isoDay(to)}" /></label>
      <label class="fld">Sezóna<input type="number" id="btSeason" min="2000" max="2100" value="${currentSeason()}" /></label>
      <label class="fld">Max. zápasov<input type="number" id="btMax" min="5" max="300" value="60" /></label>
    </div>
    <p class="faint small" id="btCost"></p>
    <div id="btProgress" class="small"></div>
    <div id="btReport" class="bt-report"></div>
    <div class="modal-actions wrap">
      <button type="button" class="btn ghost" id="btCopyBtn" hidden title="Skopíruje celý výsledok ako text – vlož ho do správy">Kopírovať ako text</button>
      <button type="button" class="btn ghost" id="btImgBtn" hidden title="Uloží celý výsledok ako jeden obrázok">Uložiť ako obrázok</button>
      <button type="button" class="btn ghost" data-close>Zavrieť</button>
      <button type="button" class="btn" id="btStartBtn">Spustiť test</button>
    </div>`, {
    wide: true,
    onClose: () => { clearTimeout(btPollTimer); btModal = null; },
  });
  const $ = (id) => document.getElementById(id);
  const btCost = () => {
    const n = parseInt($("btMax").value, 10) || 60;
    $("btCost").textContent = `Odhad: ${n} zápasov ≈ ${n * 15}–${n * 25} požiadaviek na API pri prvom behu (opakované zápasy a tímy sú rýchlejšie). Test beží na serveri, okno môžeš zavrieť a vrátiť sa neskôr.`;
  };
  btCost();
  $("btMax").addEventListener("input", btCost);
  $("btStartBtn").addEventListener("click", startBacktest);
  $("btCopyBtn").addEventListener("click", copyBacktest);
  $("btImgBtn").addEventListener("click", saveBacktestImage);
  try {
    const leagues = await fetchJson("/api/leagues");
    if (!btModal) return;
    $("btLeagues").innerHTML = leagues
      .map((l) => `<label class="check"><input type="checkbox" value="${l.id}" checked /> ${escapeHtml(translateLeagueName(l.name))}</label>`)
      .join("");
  } catch {
    if (btModal) $("btLeagues").innerHTML = `<span class="faint small">Ligy sa nepodarilo načítať.</span>`;
  }
  const last = lsGet(BT_JOB_KEY);
  if (last && btModal) pollBacktest(last);
}
document.getElementById("openBacktestBtn").addEventListener("click", () => openBacktest());

async function startBacktest() {
  const $ = (id) => document.getElementById(id);
  const leagueIds = Array.from(document.querySelectorAll("#btLeagues input:checked")).map((i) => Number(i.value));
  if (!leagueIds.length) { showToast("Vyber aspoň jednu ligu."); return; }
  try {
    const job = await postJson("/api/backtest", {
      leagueIds,
      season: parseInt($("btSeason").value, 10),
      from: $("btFrom").value,
      to: $("btTo").value,
      maxFixtures: parseInt($("btMax").value, 10) || 60,
    });
    lsSet(BT_JOB_KEY, job.id);
    pollBacktest(job.id);
  } catch (err) {
    showToast(`Test sa nepodarilo spustiť: ${err.message}`);
  }
}

async function pollBacktest(id) {
  clearTimeout(btPollTimer);
  if (!btModal) return;
  try {
    const job = await fetchJson(`/api/backtest/${encodeURIComponent(id)}`);
    if (!btModal) return;
    renderBacktest(job);
    if (job.status === "running") btPollTimer = setTimeout(() => pollBacktest(id), 3000);
  } catch {
    // úloha už neexistuje (napr. server sa reštartoval)
    lsDel(BT_JOB_KEY);
    if (!btModal) return;
    document.getElementById("btProgress").textContent = "";
    document.getElementById("btStartBtn").disabled = false;
  }
}

function renderBacktest(job) {
  btLastJob = job;
  const r = job.report;
  const p = job.progress || { done: 0, total: 0 };
  const running = job.status === "running";
  document.getElementById("btProgress").innerHTML = running
    ? `Prebieha test: ${p.done} / ${p.total || "?"} zápasov…<div class="bar big"><i style="width:${p.total ? (p.done / p.total) * 100 : 3}%"></i></div>`
    : job.status === "error"
      ? `<span class="loss">Test zlyhal: ${escapeHtml(job.error || "")}</span>`
      : `Hotovo – ${plural(r ? r.fixturesAnalyzed : 0, "zápas", "zápasy", "zápasov")}${r && r.fixturesFailed ? `, ${r.fixturesFailed} sa nepodarilo spracovať` : ""}.`;
  document.getElementById("btStartBtn").disabled = running;
  const canExport = job.status === "done" && !!(r && r.samples);
  document.getElementById("btCopyBtn").hidden = !canExport;
  document.getElementById("btImgBtn").hidden = !canExport;
  const reportEl = document.getElementById("btReport");
  if (!r || !r.samples) {
    reportEl.innerHTML = running ? "" : `<p class="muted">Pre zvolené obdobie a ligy sa nenašli žiadne vyhodnotiteľné zápasy.</p>`;
    return;
  }
  const b = r.bandOverall || {};
  const summary = b.count
    ? `<div class="bt-summary">Tipy v pásme 65 – 80${NB}% (tie, ktoré by appka odporučila): <strong>${b.count}</strong>, model v priemere <strong>${pct(b.avgPredicted)}</strong>, reálne vyšlo <strong class="${b.hitRate < b.avgPredicted - 5 ? "bt-bad" : "bt-good"}">${pct(b.hitRate)}</strong>.</div>`
    : "";
  const buckets = (r.buckets || []).filter((x) => x.count > 0).map((x) =>
    `<tr><td>${escapeHtml(x.label)}</td><td class="num">${x.count}</td><td class="num">${pct(x.avgPredicted)}</td><td class="num">${pct(x.hitRate)}</td>${diffCell(x.avgPredicted, x.hitRate)}</tr>`).join("");
  const markets = (r.markets || []).map((m) =>
    `<tr><td>${escapeHtml(m.market)}</td><td class="num">${m.count}</td><td class="num">${pct(m.avgPredicted)}</td><td class="num">${pct(m.hitRate)}</td>${diffCell(m.avgPredicted, m.hitRate)}<td class="num">${m.inBand && m.inBand.count ? `${pct(m.inBand.hitRate)} <span class="muted">(${m.inBand.count})</span>` : "–"}</td></tr>`).join("");
  reportEl.innerHTML = `
    ${summary}
    <h4>Podľa dôvery modelu</h4>
    <div class="table-wrap"><table class="bt-table"><thead><tr><th>Pásmo</th><th class="num">Tipov</th><th class="num">Model</th><th class="num">Realita</th><th class="num">Rozdiel</th></tr></thead><tbody>${buckets}</tbody></table></div>
    <h4>Podľa trhov</h4>
    <div class="table-wrap"><table class="bt-table"><thead><tr><th>Trh</th><th class="num">Tipov</th><th class="num">Model</th><th class="num">Realita</th><th class="num">Rozdiel</th><th class="num">V pásme 65–80 %</th></tr></thead><tbody>${markets}</tbody></table></div>
    <p class="muted small">Rozdiel = realita mínus predpoveď v percentuálnych bodoch. Zelená: model sedí (do ±5 b.). Červená: model <strong>preceňuje</strong> – tipy vychádzajú menej často, než hovorí. Pri menej ako ~50 tipoch v riadku ber čísla len orientačne.</p>
    ${renderBacktestComparison(r, job.reportLegacy)}
    ${renderBacktestComparison(job.reportNew, r, true)}
    ${running ? "" : renderAbsenceImpact(job.absenceImpact)}
    ${running ? "" : renderBacktestOptimizer(r.optimizer)}`;
}

/** Vplyv chýbajúcich hráčov (zranenia, tresty) na presnosť – len zápasy, kde niekto chýbal. */
function renderAbsenceImpact(a) {
  if (!a || !a.fixtures || !a.withAbsences || !a.withAbsences.samples) return "";
  const err = (v) => (v == null ? "–" : fmtNum(v * 100, 1));
  const band = (x) => (x && x.inBand && x.inBand.count ? `${pct(x.inBand.hitRate)} <span class="muted">(${x.inBand.count})</span>` : "–");
  const rows = a.withAbsences.markets.filter((m) => /^Góly/.test(m.market)).map((m) => {
    const o = a.withoutAbsences.markets.find((x) => x.market === m.market);
    if (!o) return "";
    const cls = Math.abs(o.brier - m.brier) < 0.0005 ? "" : m.brier < o.brier ? "bt-good" : "bt-bad";
    return `<tr><td>${escapeHtml(m.market)}</td><td class="num">${m.count}</td><td class="num">${err(o.brier)}</td><td class="num ${cls}">${err(m.brier)}</td><td class="num">${band(o)}</td><td class="num">${band(m)}</td></tr>`;
  }).join("");
  const wb = a.withAbsences.bandOverall, ob = a.withoutAbsences.bandOverall;
  return `
    <h4>Vplyv chýbajúcich hráčov</h4>
    <div class="bt-summary">Zápasy, kde niekto chýbal (zranenie, trest): <strong>${a.fixtures}</strong>. Tipy v pásme bez zohľadnenia: <strong>${ob.count}</strong>, vyšlo <strong>${pct(ob.hitRate)}</strong> · so zohľadnením: <strong>${wb.count}</strong>, vyšlo <strong>${pct(wb.hitRate)}</strong>.</div>
    <div class="table-wrap"><table class="bt-table"><thead><tr><th>Trh</th><th class="num">Tipov</th><th class="num">Chyba – bez</th><th class="num">Chyba – s chýbajúcimi</th><th class="num">V pásme – bez</th><th class="num">V pásme – s</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted small">Chýbajúci hráči menia len očakávané góly, preto sú tu len gólové trhy. Zelená: so zohľadnením chýbajúcich je model presnejší.</p>`;
}

/** Hľadanie najlepšieho nastavenia (kalibrácia trhov, pásmo dôvery, min. zápasov). */
function renderBacktestOptimizer(o) {
  if (!o || !o.calibration || !o.calibration.length) return "";
  const k = (v) => (v == null || Number.isNaN(v) ? "–" : fmtNum(v, 2));
  const err = (v) => (v == null || Number.isNaN(v) ? "–" : fmtNum(v * 100, 1));
  const cal = o.calibration.map((c) => {
    const enough = c.bestK != null && !Number.isNaN(c.bestK);
    const better = enough && c.brierNow - c.brierBest > 0.002;
    return `<tr><td>${escapeHtml(c.markets.join(", "))}</td><td class="num">${c.count}</td><td class="num">${k(c.currentK)}</td><td class="num ${better ? "bt-good" : ""}">${enough ? k(c.bestK) : '<span class="muted">málo tipov</span>'}</td><td class="num">${err(c.brierNow)}</td><td class="num">${enough ? err(c.brierBest) : "–"}</td><td class="num">${enough ? `${pct(c.avgPredictedBest)} → ${pct(c.hitRate)}` : "–"}</td></tr>`;
  }).join("");
  const set = (o.settings || []).map((r) => {
    const label = `${r.lo}–${r.hi} %, min. ${r.minGames} ${r.minGames >= 5 ? "zápasov" : "zápasy"}`;
    const tag = r.current ? ' <span class="muted">(teraz)</span>' : r.best ? ' <strong class="bt-good">← najlepšie</strong>' : "";
    return `<tr${r.best ? ' class="bt-best"' : ""}><td>${label}${tag}</td><td class="num">${r.count}</td><td class="num">${pct(r.avgPredicted)}</td><td class="num">${pct(r.hitRate)}</td>${diffCell(r.avgPredicted, r.hitRate)}</tr>`;
  }).join("");
  const best = (o.settings || []).find((r) => r.best);
  const mk = (o.marketsInBest || []).map((m) =>
    `<tr><td>${escapeHtml(m.market)}</td><td class="num">${m.count}</td><td class="num ${m.hitRate >= 66.7 ? "bt-good" : "bt-bad"}">${pct(m.hitRate)}</td></tr>`).join("");
  return `
    <h4>Hľadanie najlepšieho nastavenia</h4>
    <p class="muted small">1. krok: pre každý trh koeficient kalibrácie k, pri ktorom percentá modelu najlepšie sedia s realitou (1,00 = bez úpravy, nižšie = model je opatrnejší). Zelená: zmena by model spresnila.</p>
    <div class="table-wrap"><table class="bt-table"><thead><tr><th>Trh</th><th class="num">Tipov</th><th class="num">k teraz</th><th class="num">k najlepšie</th><th class="num">Chyba teraz</th><th class="num">Chyba najlepšie</th><th class="num">Model → realita</th></tr></thead><tbody>${cal}</tbody></table></div>
    <p class="muted small">2. krok: s najlepšou kalibráciou všetky kombinácie pásma dôvery a minimálneho počtu odohraných zápasov. Najlepšie = najvyššia úspešnosť pri aspoň polovici tipov oproti terajšku.</p>
    <div class="table-wrap"><table class="bt-table"><thead><tr><th>Nastavenie</th><th class="num">Tipov</th><th class="num">Model</th><th class="num">Realita</th><th class="num">Rozdiel</th></tr></thead><tbody>${set}</tbody></table></div>
    ${best && mk ? `<p class="muted small">Trhy v najlepšom nastavení (${best.lo}–${best.hi} %). Pri kurze 1,55 je tip v zisku od úspešnosti 64,5 % – červené trhy by pri takých kurzoch prerábali.</p>
    <div class="table-wrap"><table class="bt-table"><thead><tr><th>Trh</th><th class="num">Tipov</th><th class="num">Vyšlo</th></tr></thead><tbody>${mk}</tbody></table></div>` : ""}
    <p class="muted small"><strong>Pozor:</strong> nastavenie nájdené na jednom období môže sedieť len náhodou. Zmenu sa oplatí urobiť, až keď podobné čísla vyjdú aj na inom období (napr. aug. – okt. 2024 a mar. – máj 2025).</p>`;
}

/** Porovnanie nového modelu s pôvodným (do 5. 10. 2026) na tých istých zápasoch. */
function renderBacktestComparison(r, old, newModel = false) {
  if (!r || !r.samples || !old || !old.samples) return "";
  const names = newModel ? ["súčasný", "nový"] : ["pôvodný", "nový"];
  const err = (v) => (v == null ? "–" : fmtNum(v * 100, 1));
  const band = (x) => (x && x.count ? `${pct(x.hitRate)} <span class="muted">(${x.count})</span>` : "–");
  const rows = r.markets.map((m) => {
    const o = old.markets.find((x) => x.market === m.market);
    if (!o) return "";
    const same = Math.abs(o.brier - m.brier) < 0.0005 && o.inBand.count === m.inBand.count;
    const cls = same ? "" : m.brier < o.brier ? "bt-good" : "bt-bad";
    const mr = (x) => `${pct(x.avgPredicted)} → ${pct(x.hitRate)}`;
    return `<tr><td>${escapeHtml(m.market)}</td><td class="num">${mr(o)}</td><td class="num">${mr(m)}</td><td class="num">${err(o.brier)}</td><td class="num ${cls}">${err(m.brier)}</td><td class="num">${band(o.inBand)}</td><td class="num">${band(m.inBand)}</td></tr>`;
  }).join("");
  const ob = old.bandOverall, nb = r.bandOverall;
  return `
    <h4>${newModel ? "Nový model (xG, únava, doma / vonku) oproti súčasnému" : "Nový model oproti pôvodnému"} (tie isté zápasy)</h4>
    <div class="bt-summary">Pásmo 65 – 80${NB}%: ${names[0]} model <strong>${ob.count}</strong> tipov, vyšlo <strong>${pct(ob.hitRate)}</strong> · ${names[1]} model <strong>${nb.count}</strong> tipov, vyšlo <strong>${pct(nb.hitRate)}</strong>.</div>
    <div class="table-wrap"><table class="bt-table"><thead><tr><th>Trh</th><th class="num">Model → realita – ${names[0]}</th><th class="num">Model → realita – ${names[1]}</th><th class="num">Chyba – ${names[0]}</th><th class="num">Chyba – ${names[1]}</th><th class="num">V pásme – ${names[0]}</th><th class="num">V pásme – ${names[1]}</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted small">Chyba = ako ďaleko boli percentá modelu od skutočnosti (Brierovo skóre × 100). <strong>Nižšia je lepšia.</strong> Zelená: ${names[1]} model je presnejší, červená: horší. ${newModel
      ? "Nový model (21. 10. 2026) = súčasný model + xG (kvalita šancí), únava a rotácia (dni voľna, zápasy za 14 dní) a rohy, karty, strely a fauly zvlášť doma a vonku. Spätný test je bez kurzov stávkoviek."
      : "Nový model = forma z gólov + kalibrácia striel, faulov, rohov a kariet (celá sezóna) a gólov navyše na začiatku sezóny. Kalibrácia (17. 10. 2026) vznikla z testov aug. – okt. 2024 a aug. – okt. 2026 – na poctivé overenie testuj iné obdobie, napr. mar. – máj 2025 (sezóna 2024)."}</p>`;
}

/** Hlavička exportu: obdobie, sezóna, počet zápasov. */
function btExportTitle() {
  const p = (btLastJob && btLastJob.params) || {};
  const r = btLastJob && btLastJob.report;
  return `TipRadar – spätný test ${p.from || ""} až ${p.to || ""}, sezóna ${p.season || ""}, ${r ? r.fixturesAnalyzed : 0} zápasov`;
}

async function copyBacktest() {
  const text = `${btExportTitle()}\n\n${document.getElementById("btReport").innerText}`;
  try {
    await navigator.clipboard.writeText(text);
    showToast("Výsledok je skopírovaný – vlož ho do správy (Cmd+V).");
  } catch {
    // schránka nedostupná – stiahne sa ako textový súbor
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    a.download = "spatny-test.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

let html2canvasLoading = null;
function loadHtml2canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (!html2canvasLoading) {
    html2canvasLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "vendor/html2canvas.min.js";
      s.onload = () => resolve(window.html2canvas);
      s.onerror = () => { html2canvasLoading = null; reject(new Error("knižnica sa nenačítala")); };
      document.head.appendChild(s);
    });
  }
  return html2canvasLoading;
}

async function saveBacktestImage(e) {
  const btn = e.currentTarget;
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = "Ukladám…";
  // celý výsledok (bez rolovania) do jedného širokého obrázka
  const box = document.createElement("div");
  box.className = "bt-export";
  box.style.cssText = "position:absolute;left:-10000px;top:0;width:1200px;padding:28px;background:#1B1612;color:#F4EEE3;";
  box.innerHTML = `<h3 style="margin:0 0 12px;font-size:20px;">${escapeHtml(btExportTitle())}</h3>${document.getElementById("btReport").innerHTML}`;
  document.body.appendChild(box);
  try {
    const h2c = await loadHtml2canvas();
    const canvas = await h2c(box, { backgroundColor: "#1B1612", scale: 1.5 });
    const p = (btLastJob && btLastJob.params) || {};
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `spatny-test-${p.from || ""}-${p.to || ""}.png`;
    a.click();
  } catch (err) {
    showToast(`Obrázok sa nepodarilo uložiť (${err.message}). Použi „Kopírovať ako text“.`);
  } finally {
    box.remove();
    btn.disabled = false;
    btn.textContent = old;
  }
}

// ---- Návštevnosť tipradar.eu (bez cookies) ----
const VISIT_CLICK_LABELS = {
  free: "Tipy zadarmo (Telegram kanál)",
  premium: "Premium – poradovník",
  vip: "VIP – poradovník",
  kurz: "Chcem kurz",
  formular: "Formulár",
  telegram: "Telegram (iné odkazy)",
  instagram: "Instagram",
  email: "E-mail",
};
const VISIT_SOURCE_LABELS = { priamo: "Priamo / neznámy zdroj", instagram: "Instagram", facebook: "Facebook", telegram: "Telegram", google: "Google", tiktok: "TikTok", youtube: "YouTube" };

async function openVisits() {
  const m = openModal(`
    <h3>Návštevnosť tipradar.eu</h3>
    <p class="muted small">Bez cookies. Návštevník = jeden človek za deň (podľa skráteného odtlačku, ktorý sa každý deň mení).</p>
    <p class="muted small">Aby sa nepočítali tvoje vlastné návštevy, otvor raz v každom svojom zariadení a prehliadači <a href="https://tipradar.eu/?ja=1" target="_blank" rel="noopener">tipradar.eu/?ja=1</a>. Počítanie znova zapneš cez tipradar.eu/?ja=0.</p>
    <div data-body><p class="empty">Načítavam…</p></div>
    <div class="modal-actions"><button type="button" class="btn ghost" data-close>Zavrieť</button></div>`, { wide: true });
  const body = m.el.querySelector("[data-body]");
  try {
    const { days } = await fetchJson("/api/stats/visits?days=30");
    const list = Array.isArray(days) ? days : [];
    const sum = (arr, key) => arr.reduce((s, d) => s + (d[key] || 0), 0);
    const merge = (arr, key) => {
      const out = {};
      for (const d of arr) for (const [k, v] of Object.entries(d[key] || {})) out[k] = (out[k] || 0) + v;
      return Object.entries(out).sort((a, b) => b[1] - a[1]);
    };
    const today = list.slice(0, 1), week = list.slice(0, 7);
    const card = (label, visitors, views) =>
      `<div><small>${label}</small><b>${visitors}</b><span class="faint small">${views} ${views === 1 ? "zobrazenie" : views >= 2 && views <= 4 ? "zobrazenia" : "zobrazení"}</span></div>`;
    const rows = (entries, labels, total) =>
      entries.length
        ? entries.map(([k, v]) => `
          <div class="mb-row">
            <div class="mb-top"><span class="mb-name">${escapeHtml(labels[k] || k)}</span><span class="mb-num"><b>${v}</b></span></div>
            <div class="bar mb-bar"><i style="width:${total ? Math.round((v / total) * 100) : 0}%"></i></div>
          </div>`).join("")
        : `<p class="faint small">Zatiaľ nič.</p>`;
    const sources = merge(list, "sources"), clicks = merge(list, "clicks");
    const maxDay = Math.max(1, ...list.slice(0, 14).map((d) => d.visitors || 0));
    if (!m.el.isConnected) return;
    body.innerHTML = `
      <div class="kv-grid big">
        ${card("Dnes", sum(today, "visitors"), sum(today, "views"))}
        ${card("7 dní", sum(week, "visitors"), sum(week, "views"))}
        ${card("30 dní", sum(list, "visitors"), sum(list, "views"))}
      </div>
      <h4 class="ct">Posledných 14 dní (návštevníci)</h4>
      <div class="visits-days">
        ${list.slice(0, 14).reverse().map((d) => `
          <div class="visits-day" title="${escapeHtml(d.day)}: ${d.visitors} návštevníkov, ${d.views} zobrazení">
            <i style="height:${Math.round(((d.visitors || 0) / maxDay) * 100)}%"></i>
            <span>${Number(String(d.day).slice(8, 10))}.</span>
          </div>`).join("")}
      </div>
      <h4 class="ct">Odkiaľ prišli (30 dní)</h4>
      ${rows(sources, VISIT_SOURCE_LABELS, sources.reduce((s, e) => s + e[1], 0))}
      <h4 class="ct">Kliknutia (30 dní)</h4>
      ${rows(clicks, VISIT_CLICK_LABELS, Math.max(1, ...clicks.map((e) => e[1])))}
      <p class="muted small">Tip: do odkazu v bio na Instagrame daj <b>tipradar.eu/?utm_source=instagram</b>, potom sa zdroj započíta presne aj z aplikácie Instagramu.</p>`;
  } catch (err) {
    body.innerHTML = `<p class="empty">Návštevnosť sa nepodarilo načítať: ${escapeHtml(err.message || String(err))}</p>`;
  }
}
document.getElementById("openVisitsBtn").addEventListener("click", () => openVisits());

// ---- Štart ----
init();
