// ---- Preklad názvov reprezentácií do slovenčiny (kluby zostávajú v pôvodnom tvare) ----
const COUNTRY_NAME_SK = {
  Albania: "Albánsko",
  Andorra: "Andorra",
  Armenia: "Arménsko",
  Austria: "Rakúsko",
  Azerbaijan: "Azerbajdžan",
  Belarus: "Bielorusko",
  Belgium: "Belgicko",
  "Bosnia and Herzegovina": "Bosna a Hercegovina",
  Bulgaria: "Bulharsko",
  Croatia: "Chorvátsko",
  Cyprus: "Cyprus",
  "Czech Republic": "Česko",
  Denmark: "Dánsko",
  England: "Anglicko",
  Estonia: "Estónsko",
  "Faroe Islands": "Faerské ostrovy",
  Finland: "Fínsko",
  France: "Francúzsko",
  Georgia: "Gruzínsko",
  Germany: "Nemecko",
  Gibraltar: "Gibraltár",
  Greece: "Grécko",
  Hungary: "Maďarsko",
  Iceland: "Island",
  Israel: "Izrael",
  Italy: "Taliansko",
  Kazakhstan: "Kazachstan",
  Kosovo: "Kosovo",
  Latvia: "Lotyšsko",
  Liechtenstein: "Lichtenštajnsko",
  Lithuania: "Litva",
  Luxembourg: "Luxembursko",
  Malta: "Malta",
  Moldova: "Moldavsko",
  Montenegro: "Čierna Hora",
  Netherlands: "Holandsko",
  "North Macedonia": "Severné Macedónsko",
  "Northern Ireland": "Severné Írsko",
  Norway: "Nórsko",
  Poland: "Poľsko",
  Portugal: "Portugalsko",
  Romania: "Rumunsko",
  Russia: "Rusko",
  "San Marino": "San Maríno",
  Scotland: "Škótsko",
  Serbia: "Srbsko",
  Slovakia: "Slovensko",
  Slovenia: "Slovinsko",
  Spain: "Španielsko",
  Sweden: "Švédsko",
  Switzerland: "Švajčiarsko",
  Turkey: "Turecko",
  Ukraine: "Ukrajina",
  Wales: "Wales",
  // Alternatívne názvy z API a reprezentácie mimo Európy
  Czechia: "Česko",
  "Rep. Of Ireland": "Írsko",
  "Republic of Ireland": "Írsko",
  "FYR Macedonia": "Severné Macedónsko",
  Macedonia: "Severné Macedónsko",
  "Türkiye": "Turecko",
  Turkiye: "Turecko",
  "Bosnia & Herzegovina": "Bosna a Hercegovina",
  Ireland: "Írsko",
  Holland: "Holandsko",
  Kyrgyzstan: "Kirgizsko",
  Argentina: "Argentína",
  Brazil: "Brazília",
  Uruguay: "Uruguaj",
  Colombia: "Kolumbia",
  Chile: "Čile",
  Paraguay: "Paraguaj",
  Peru: "Peru",
  Ecuador: "Ekvádor",
  Bolivia: "Bolívia",
  Venezuela: "Venezuela",
  USA: "USA",
  "United States": "USA",
  Mexico: "Mexiko",
  Canada: "Kanada",
  "Costa Rica": "Kostarika",
  Panama: "Panama",
  Jamaica: "Jamajka",
  Honduras: "Honduras",
  Haiti: "Haiti",
  Curacao: "Curaçao",
  Morocco: "Maroko",
  Algeria: "Alžírsko",
  Tunisia: "Tunisko",
  Egypt: "Egypt",
  Senegal: "Senegal",
  Nigeria: "Nigéria",
  Ghana: "Ghana",
  Cameroon: "Kamerun",
  "Ivory Coast": "Pobrežie Slonoviny",
  "Cote D'Ivoire": "Pobrežie Slonoviny",
  "South Africa": "Južná Afrika",
  Mali: "Mali",
  "Cape Verde Islands": "Kapverdy",
  Japan: "Japonsko",
  "South Korea": "Južná Kórea",
  "Korea Republic": "Južná Kórea",
  Australia: "Austrália",
  Iran: "Irán",
  "Saudi Arabia": "Saudská Arábia",
  Qatar: "Katar",
  Iraq: "Irak",
  Jordan: "Jordánsko",
  "United Arab Emirates": "Spojené arabské emiráty",
  Uzbekistan: "Uzbekistan",
  China: "Čína",
  "China PR": "Čína",
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
 * Preloží mená tímov, ktoré sú vložené priamo vo vete (napr. "Výsledok zápasu:
 * Liechtenstein alebo remíza", vysvetlenie s formou a pod.) - len na zobrazenie,
 * uložené dáta (SavedTip.homeTeam/awayTeam) zostávajú v pôvodnom tvare, aby
 * fungovalo vyhodnocovanie výsledkov (tipEvaluator porovnáva presne s nimi).
 */
/** Slovenský tvar podľa počtu: plural(3, "tip", "tipy", "tipov") -> "3 tipy". */
/** Číslo so slovenskou desatinnou čiarkou: fmtNum(1.845, 2) -> "1,85". */
function fmtNum(n, digits) {
  return Number(n).toFixed(digits).replace(".", ",");
}

/** Číslo so znamienkom: +1,5 / −0,8 (typografické mínus). */
function signed(n, digits) {
  return (n > 0 ? "+" : n < 0 ? "−" : "") + fmtNum(Math.abs(n), digits);
}

function plural(n, one, few, many) {
  return n + " " + (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
}

function impliedOdds(probability) {
  return probability > 0 ? (100 / probability).toFixed(2) : "-";
}

/** Zápas už začal (alebo je odložený/zrušený) - tip ani tiket z neho sa nedá pridať. */
function matchHasStarted(fixture) {
  const status = fixture?.status ?? "NS";
  if (!["NS", "TBD"].includes(status)) return true;
  const t = new Date(fixture?.date).getTime();
  return !isNaN(t) && t <= Date.now();
}

const MATCH_STARTED_TEXT = "Zápas už začal – tip ani tiket z neho sa už nedá pridať.";

/** Označenie tipu pridaného ručne napriek kontrole kurzu. */
function isOverrideTip(t) {
  return !!t.overrideFilter || (Array.isArray(t.legs) && t.legs.some((l) => l.overrideFilter));
}

function manualBadge(t) {
  return t.manualEntry ? ` <span class="override-badge" style="color: var(--text-muted);" title="Tip doplnený ručne po zápase">✍ doplnené ručne</span>` : "";
}

function editedBadge(t) {
  return t.edited ? ` <span class="override-badge" style="color: var(--text-muted);" title="Výsledok alebo kurz bol ručne opravený">✎ upravené</span>` : "";
}

function overrideBadge(t) {
  return isOverrideTip(t) ? ` <span class="override-badge" title="Vyradené kontrolou kurzu, pridané ručne">⚠️ mimo filtra</span>` : "";
}

/** Kurz v slovenskom zápise (1,72). */
function fmtOdds(n) {
  return n.toFixed(2).replace(".", ",");
}

/** Skutočný kurz tipu, ak je známy - inak odhad z pravdepodobnosti (~1,43). */
function tipOddsLabel(t) {
  return typeof t.odds === "number" && t.odds > 1 ? fmtOdds(t.odds) : "~" + impliedOdds(t.probability).replace(".", ",");
}

/** Riadok s kurzom a hodnotou pri tipe v detaile zápasu. */
/** Odporúčaný tip s dôverou aspoň 70 % (STRONG_TIP_MIN_PROBABILITY v oddsMatcher.ts). */
const STRONG_TIP_MIN_PROBABILITY = 70;
function strongTipBadge(p) {
  return typeof p === "number" && p >= STRONG_TIP_MIN_PROBABILITY
    ? ' <span class="strong-tip" title="Dôvera 70 % a viac. Vo VIP kanáli dostane hviezdičku len jeden tip dňa – ten s najvyššou dôverou.">★ 70 %+</span>'
    : "";
}

/** Silný tip dňa – vo VIP kanáli ho dostane len jeden tip za deň (vyberá server pri odoslaní). */
const STRONG_OF_DAY_BADGE =
  ' <span class="strong-tip" title="Tip s najvyššou dôverou dňa (aspoň 70 %). Vo VIP kanáli pôjde ako ⭐ Silný tip dňa – ak ho uložíš a pošleš.">⭐ Silný tip dňa</span>';

function betOddsHtml(bet) {
  if (typeof bet.odds === "number" && bet.odds > 1) {
    const ev = Math.round(((bet.expectedValue ?? 0) - 1) * 100);
    return ` · kurz <strong>${fmtOdds(bet.odds)}</strong> <span class="muted small">(${bet.oddsBookmakers} stáv.)</span> · hodnota <strong style="color:var(--success)">${signed(ev, 0)} %</strong>`;
  }
  return ` · kurz ~${impliedOdds(bet.probability).replace(".", ",")} <span class="muted small">(odhad – stávkovky kurz neponúkajú)</span>`;
}

function skeletonHtml(rows = 3) {
  return Array.from({ length: rows })
    .map(() => `<div class="skeleton skeleton-block"></div>`)
    .join("");
}

function showToast(message) {
  const isError = /zlyhal|chyba|nepodarilo/i.test(message);
  const toast = document.createElement("div");
  toast.className = `toast ${isError ? "toast-error" : "toast-success"}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-visible"));
  setTimeout(() => {
    toast.classList.remove("toast-visible");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function translateNamesInText(text, homeOriginal, awayOriginal) {
  if (!text) return "";
  let result = text;
  const homeSk = translateTeamName(homeOriginal);
  const awaySk = translateTeamName(awayOriginal);
  if (homeSk !== homeOriginal) result = result.split(homeOriginal).join(homeSk);
  if (awaySk !== awayOriginal) result = result.split(awayOriginal).join(awaySk);
  // "Over 2.5" / "Under 2.5" -> "Nad 2,5" / "Pod 2,5" (len na zobrazenie,
  // uložené dáta ostávajú bez zmeny kvôli vyhodnocovaniu).
  result = result.replace(/\bOver (\d+(?:\.\d+)?)/g, (_m, n) => "Nad " + n.replace(".", ","));
  result = result.replace(/\bUnder (\d+(?:\.\d+)?)/g, (_m, n) => "Pod " + n.replace(".", ","));
  // Desatinné čísla po slovensky (1.8 -> 1,8) - vysvetlenia tipov a varovania.
  result = result.replace(/(\d)\.(\d)/g, "$1,$2");
  return result;
}

// ---- Animácia percenta na úvodnej obrazovke ----
(function runSplashProgress() {
  const fill = document.getElementById("splashProgressFill");
  const pct = document.getElementById("splashProgressPct");
  if (!fill || !pct) return;

  const duration = 3400; // ms - stihne sa doplniť pred zmiznutím úvodnej obrazovky (3.8s)
  const start = performance.now();

  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(1, elapsed / duration);
    const percent = Math.round(progress * 100);
    fill.style.width = `${percent}%`;
    pct.textContent = `${percent} %`;
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();

let selectedLeagueIds = new Set();
let currentFixtures = [];
let currentAnalysis = null;
let ticketItems = []; // aktuálne vybrané tipy na spojenie do "tiketu"
let collapsedLeagues = new Set(); // ligy schované cez tlačidlo, zostáva aj po automatickom obnovení

const matchDateInput = document.getElementById("matchDateInput");
const seasonInput = document.getElementById("seasonInput");
const loadFixturesBtn = document.getElementById("loadFixturesBtn");
const fixtureListEl = document.getElementById("fixtureList");
const fixtureCountEl = document.getElementById("fixtureCount");
const analysisColumnEl = document.getElementById("analysisColumn");

const openTicketBtn = document.getElementById("openTicketBtn");
const ticketCountEl = document.getElementById("ticketCount");
const ticketModal = document.getElementById("ticketModal");
const ticketSummaryEl = document.getElementById("ticketSummary");
const ticketListEl = document.getElementById("ticketList");
const closeTicketBtn = document.getElementById("closeTicketBtn");
const clearTicketBtn = document.getElementById("clearTicketBtn");
const saveTicketBtn = document.getElementById("saveTicketBtn");

const openTipsBtn = document.getElementById("openTipsBtn");
const tipsModal = document.getElementById("tipsModal");
const tipsSummaryEl = document.getElementById("tipsSummary");
const marketBreakdownEl = document.getElementById("marketBreakdown");
const bankrollStartInput = document.getElementById("bankrollStartInput");
const bankrollResultEl = document.getElementById("bankrollResult");
const calibrationResultEl = document.getElementById("calibrationResult");
const tipsListEl = document.getElementById("tipsList");
const closeTipsBtn = document.getElementById("closeTipsBtn");
const checkResultsBtn = document.getElementById("checkResultsBtn");
const clearAllTipsBtn = document.getElementById("clearAllTipsBtn");
const noTipTodayBtn = document.getElementById("noTipTodayBtn");
const weeklyReportBtn = document.getElementById("weeklyReportBtn");
const dailyResultsBtn = document.getElementById("dailyResultsBtn");

const openSubscribersBtn = document.getElementById("openSubscribersBtn");
const subscribersModal = document.getElementById("subscribersModal");
const subscribersSummaryEl = document.getElementById("subscribersSummary");
const subscribersListEl = document.getElementById("subscribersList");
const closeSubscribersBtn = document.getElementById("closeSubscribersBtn");
const addSubscriberBtn = document.getElementById("addSubscriberBtn");
const subNameInput = document.getElementById("subName");
const subContactInput = document.getElementById("subContact");
const subTelegramChatIdInput = document.getElementById("subTelegramChatId");
const subTierSelect = document.getElementById("subTier");
const subLengthSelect = document.getElementById("subLength");
const subStartInput = document.getElementById("subStart");
const subPriceInput = document.getElementById("subPrice");
const subFounderInput = document.getElementById("subFounder");
const subNoteInput = document.getElementById("subNote");
const memberFilterEl = document.getElementById("memberFilter");


async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Chyba servera (${res.status})`);
  }
  return data;
}

/**
 * Odhadne sezónu (rok jej začiatku) podľa zvoleného dátumu. Väčšina top
 * európskych líg beží od júla/augusta do mája/júna, preto mesiace júl-december
 * patria do sezóny toho istého roka, a mesiace január-jún do sezóny predošlého roka.
 * Pri súťažiach s jednoročnou sezónou (napr. MS, EURO) si sezónu preplš ručne.
 */
function guessSeasonFromDate(dateStr) {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1; // 1-12
  return month >= 7 ? d.getFullYear() : d.getFullYear() - 1;
}

async function init() {
  matchDateInput.value = localToday();
  seasonInput.value = String(guessSeasonFromDate(matchDateInput.value));

  matchDateInput.addEventListener("change", () => {
    seasonInput.value = String(guessSeasonFromDate(matchDateInput.value));
    loadFixtures();
  });

  const leagues = await fetchJson("/api/leagues");
  leagues.forEach((league) => selectedLeagueIds.add(league.id)); // všetky ligy sú vždy zahrnuté

  // Appka rovno pri otvorení sama načíta dnešné zápasy - netreba na nič klikať.
  loadFixtures();
}

/** Dnešný dátum podľa miestneho času (YYYY-MM-DD). toISOString() by po polnoci vrátil ešte včerajšok. */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Počítadlo načítaní: zoznam smie vykresliť len posledné spustené načítanie
// (inak by pomalšia staršia odpoveď, napr. na dnešok, prepísala zvolený deň).
let fixturesRequestId = 0;

async function loadFixtures(silent = false) {
  const requestId = ++fixturesRequestId;
  const season = parseInt(seasonInput.value, 10);
  const date = matchDateInput.value || localToday();

  const leagueIds = new Set(selectedLeagueIds);

  if (leagueIds.size === 0) {
    if (!silent) {
      fixtureListEl.innerHTML = `<p class="empty-state">Zaškrtni aspoň jednu ligu.</p>`;
    }
    return;
  }

  if (!silent) {
    fixtureListEl.innerHTML = skeletonHtml(5);
    loadFixturesBtn.disabled = true;
  }

  try {
    const results = await Promise.all(
      Array.from(leagueIds).map(async (leagueId) => {
        try {
          const fixtures = await fetchJson(
            `/api/fixtures?league=${encodeURIComponent(leagueId)}&season=${season}&date=${date}`
          );
          return { leagueId, fixtures };
        } catch (err) {
          return { leagueId, fixtures: [], error: String(err?.message ?? err) };
        }
      })
    );

    if (requestId !== fixturesRequestId) return; // medzitým sa spustilo novšie načítanie
    currentFixtures = results.flatMap((r) => r.fixtures);
    // Chyby API (napr. vyčerpaný denný limit) už nezamlčíme – inak by to vyzeralo ako deň bez zápasov.
    const failed = results.filter((r) => r.error);
    if (failed.length === results.length && failed.length > 0) {
      if (!silent) {
        fixtureListEl.innerHTML = `<p class="empty-state">Zápasy sa nepodarilo načítať: ${escapeHtml(failed[0].error)}<br><span class="muted small">Skús to o chvíľu znova. Ak ide o denný limit API, obnoví sa o polnoci.</span></p>`;
      }
      return;
    }
    renderGroupedFixtureList(results);
    if (failed.length && !silent) {
      fixtureListEl.insertAdjacentHTML(
        "afterbegin",
        `<p class="muted small" style="margin:0 12px 10px;color:var(--danger);">Pri ${failed.length} ${failed.length === 1 ? "lige" : "ligách"} sa zápasy nepodarilo načítať: ${escapeHtml(failed[0].error)}</p>`
      );
    }
  } catch (err) {
    if (!silent) {
      fixtureListEl.innerHTML = `<p class="empty-state">Chyba pri načítaní: ${escapeHtml(err.message)}</p>`;
    }
  } finally {
    if (!silent && requestId === fixturesRequestId) loadFixturesBtn.disabled = false;
  }
}

loadFixturesBtn.addEventListener("click", () => loadFixtures(false));

// Appka si sama každých pár minút znova natiahne zoznam zápasov (potichu, bez
// blikania), aby dohraté zápasy automaticky zmizli bez potreby čokoľvek klikať.
setInterval(() => {
  loadFixtures(true);
}, 3 * 60 * 1000); // 3 minúty

function renderGroupedFixtureList(results) {
  const totalCount = results.reduce((sum, r) => sum + r.fixtures.length, 0);
  fixtureCountEl.textContent = totalCount ? `${plural(totalCount, "zápas", "zápasy", "zápasov")}` : "";

  const groupsWithMatches = results.filter((r) => r.fixtures.length > 0);

  if (groupsWithMatches.length === 0) {
    fixtureListEl.innerHTML = `<p class="empty-state">Pre vybrané ligy sa v tento deň nekonajú žiadne zápasy.</p>`;
    return;
  }

  fixtureListEl.innerHTML = "";

  groupsWithMatches.forEach(({ fixtures }) => {
    const leagueName = fixtures[0]?.league?.name ?? "Liga";
    const leagueLogo = fixtures[0]?.league?.logo;
    const isCollapsed = collapsedLeagues.has(leagueName);

    const group = document.createElement("div");
    group.className = "league-group";

    const header = document.createElement("button");
    header.className = "league-group-header";
    header.innerHTML = `<span style="display:flex; align-items:center; gap:8px;">${
      leagueLogo ? `<img src="${escapeHtml(leagueLogo)}" class="league-logo" alt="" />` : ""
    }${escapeHtml(translateLeagueName(leagueName))}</span><span class="chevron">${isCollapsed ? "▸" : "▾"}</span>`;
    header.addEventListener("click", () => {
      if (collapsedLeagues.has(leagueName)) collapsedLeagues.delete(leagueName);
      else collapsedLeagues.add(leagueName);
      rowsContainer.hidden = collapsedLeagues.has(leagueName);
      header.querySelector(".chevron").textContent = collapsedLeagues.has(leagueName) ? "▸" : "▾";
    });
    group.appendChild(header);

    const rowsContainer = document.createElement("div");
    rowsContainer.className = "league-group-rows";
    rowsContainer.hidden = isCollapsed;

    fixtures.forEach((fixture) => {
      const row = document.createElement("div");
      row.className = "fixture-row";

      const date = new Date(fixture.date);
      const time = date.toLocaleString("sk-SK", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

      const LIVE_STATUSES = ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT"];
      const isLive = LIVE_STATUSES.includes(fixture.status);
      const liveLabel = fixture.status === "HT" ? "Polčas" : fixture.status === "BT" ? "Prestávka" : `${fixture.elapsed ?? "?"}'`;

      const timeHtml = isLive
        ? `<div class="time live">
             <span class="live-dot"></span>${liveLabel}
             <div class="live-score">${fixture.goalsHome ?? 0}:${fixture.goalsAway ?? 0}</div>
           </div>`
        : `<div class="time"><strong>${escapeHtml(
            date.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" })
          )}</strong><span>${date.getDate()}. ${date.getMonth() + 1}.</span></div>`;

      row.innerHTML = `
        ${timeHtml}
        <div class="teams">
          <div class="team-line">
            ${fixture.homeTeam.logo ? `<img class="team-logo" src="${escapeHtml(fixture.homeTeam.logo)}" alt="" />` : ""}
            <span class="team-name">${escapeHtml(translateTeamName(fixture.homeTeam.name))}</span>
          </div>
          <span class="vs">vs</span>
          <div class="team-line">
            ${fixture.awayTeam.logo ? `<img class="team-logo" src="${escapeHtml(fixture.awayTeam.logo)}" alt="" />` : ""}
            <span class="team-name">${escapeHtml(translateTeamName(fixture.awayTeam.name))}</span>
          </div>
        </div>
      `;

      row.addEventListener("click", () => {
        document.querySelectorAll(".fixture-row").forEach((n) => n.classList.remove("selected"));
        row.classList.add("selected");
        analyzeFixture(fixture, fixture.league.id, fixture.league.season);
        analysisColumnEl.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      rowsContainer.appendChild(row);
    });

    group.appendChild(rowsContainer);
    fixtureListEl.appendChild(group);
  });
}

// Počítadlo zobrazení v pravom stĺpci (analýza zápasu, Tipy dňa): vykresliť smie len
// posledná požiadavka – pomalšia staršia odpoveď nesmie prepísať novší výber.
let analysisViewId = 0;

async function analyzeFixture(fixture, leagueId, season) {
  const viewId = ++analysisViewId;
  analysisColumnEl.innerHTML = skeletonHtml(4);

  try {
    const result = await fetchJson("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture, leagueId, season }),
    });
    if (viewId !== analysisViewId) return; // medzitým bol vybraný iný zápas
    currentAnalysis = result;
    renderAnalysis(result);
  } catch (err) {
    if (viewId !== analysisViewId) return;
    analysisColumnEl.innerHTML = `<div class="empty-state">Analýzu sa nepodarilo vypočítať: ${escapeHtml(err.message)}</div>`;
  }
}

function renderAnalysis(r) {
  // Zobrazí všetky tipy zápasu v pásme 68–80 % (predictor.ts vracia max. 1 na trh).
  const topBets = r.bestBets || [];

  const gamesPlayedHtml = r.seasonGamesPlayed
    ? `<p class="muted small" style="margin: -6px 0 12px;">Odohratých zápasov v tejto sezóne: ${escapeHtml(translateTeamName(r.fixture.homeTeam.name))} ${r.seasonGamesPlayed.home}, ${escapeHtml(translateTeamName(r.fixture.awayTeam.name))} ${r.seasonGamesPlayed.away}</p>`
    : "";

  const warningHtml = r.sampleSizeWarning
    ? `<div class="disclaimer" style="margin-top:0;margin-bottom:20px;border-top:none;padding-top:0;color:var(--gold);">⚠️ ${escapeHtml(translateNamesInText(r.sampleSizeWarning, r.fixture.homeTeam.name, r.fixture.awayTeam.name))}</div>`
    : "";

  const topBetsHtml = topBets
    .map(
      (bet, idx) => `
    <div class="tip-callout" style="${idx > 0 ? "margin-top:10px;" : ""}">
      <div class="tip-outcome">${idx === 0 ? "🎯" : idx + 1 + "."}</div>
      <div class="tip-details">
        <div class="tip-label">${escapeHtml(bet.market)}: ${escapeHtml(translateNamesInText(bet.selection, r.fixture.homeTeam.name, r.fixture.awayTeam.name))}</div>
        <div class="tip-meta">
          ${idx === 0 ? "Najvyššia dôvera zo všetkých trhov · " : ""}${bet.probability.toFixed(0)} %${betOddsHtml(bet)}${strongTipBadge(bet.probability)}
        </div>
        ${bet.explanation ? `<div class="tip-explanation">💡 ${escapeHtml(translateNamesInText(bet.explanation, r.fixture.homeTeam.name, r.fixture.awayTeam.name))}</div>` : ""}
        ${bet.valueWarning ? `<div class="tip-explanation" style="color:var(--gold);font-style:normal;">⚠️ ${escapeHtml(bet.valueWarning)}</div>` : ""}
      </div>
    </div>
    <div style="display:flex; gap:8px; margin: 4px 0 8px;">
      <button class="btn-primary save-best-bet-btn" data-bet-idx="${idx}" style="flex:1;">Uložiť tento tip</button>
      <button class="btn-ghost add-to-ticket-btn" data-bet-idx="${idx}" style="flex:1;">+ Do tiketu</button>
    </div>
  `
    )
    .join("");

  const noBetsHtml =
    topBets.length === 0
      ? `<div class="empty-state" style="margin-bottom:16px;">Pri tomto zápase nie je žiadny tip v pásme 68–80 %${
          (r.lowValueBets || []).length > 0 ? ", ktorý by prešiel kontrolou kurzu" : ""
        }.</div>`
      : "";

  // Vyradené tipy: z každého trhu len jedna hranica (s najvyššou dôverou), schované pod rozbaľovačom.
  const lowValueShown = [];
  (r.lowValueBets || []).forEach((b, i) => {
    const k = lowValueShown.findIndex((x) => x.b.market === b.market);
    if (k < 0) lowValueShown.push({ b, i });
    else if (b.probability > lowValueShown[k].b.probability) lowValueShown[k] = { b, i };
  });
  // „Vyradené pre nízky kurz“ sa už nezobrazuje (vyradené tipy idú len do tichého záznamu).
  const lowValueHtml = "";

  analysisColumnEl.innerHTML = `
    <div class="match-header">
      <div class="league-name">${escapeHtml(translateLeagueName(r.fixture.league.name))} · sezóna ${r.fixture.league.season}</div>
      <h2 class="match-header-teams">
        ${r.fixture.homeTeam.logo ? `<img class="team-logo-lg" src="${escapeHtml(r.fixture.homeTeam.logo)}" alt="" />` : ""}
        <span>${escapeHtml(translateTeamName(r.fixture.homeTeam.name))}</span>
        <span class="vs-lg">—</span>
        ${r.fixture.awayTeam.logo ? `<img class="team-logo-lg" src="${escapeHtml(r.fixture.awayTeam.logo)}" alt="" />` : ""}
        <span>${escapeHtml(translateTeamName(r.fixture.awayTeam.name))}</span>
      </h2>
    </div>

    ${gamesPlayedHtml}
    ${warningHtml}

    ${matchHasStarted(r.fixture) ? `<div class="match-locked">⏱ ${MATCH_STARTED_TEXT}</div>` : ""}${topBetsHtml}${noBetsHtml}${lowValueHtml}
    <div id="saveTipMsg"></div>

    <div class="prob-section">
      <div class="section-title">Pravdepodobnosť výsledku</div>
      ${probRow(translateTeamName(r.fixture.homeTeam.name), r.probabilities.homeWin)}
      ${probRow("Remíza", r.probabilities.draw)}
      ${probRow(translateTeamName(r.fixture.awayTeam.name), r.probabilities.awayWin)}
    </div>

    <div class="stats-grid">
      ${teamStatCard(translateTeamName(r.fixture.homeTeam.name), r.form.home, r.form.homeScore, r.expectedGoals.home, r.historicalDataInfo && r.historicalDataInfo.home)}
      ${teamStatCard(translateTeamName(r.fixture.awayTeam.name), r.form.away, r.form.awayScore, r.expectedGoals.away, r.historicalDataInfo && r.historicalDataInfo.away)}
    </div>

    <div class="prob-section">
      <div class="section-title">Vzájomné zápasy (posledných ${r.headToHead.matchesConsidered})</div>
      <div class="stat-line"><span>Výhry ${escapeHtml(translateTeamName(r.fixture.homeTeam.name))}</span><strong>${r.headToHead.homeWins}</strong></div>
      <div class="stat-line"><span>Remízy</span><strong>${r.headToHead.draws}</strong></div>
      <div class="stat-line"><span>Výhry ${escapeHtml(translateTeamName(r.fixture.awayTeam.name))}</span><strong>${r.headToHead.awayWins}</strong></div>
      ${
        (r.headToHead.matches || []).length
          ? `<div class="h2h-list">${(r.headToHead.matches || [])
              .map((m, idx) => {
                const d = new Date(m.date);
                const date = isNaN(d.getTime()) ? "" : `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
                const home = translateTeamName(m.homeWasHome ? r.fixture.homeTeam.name : r.fixture.awayTeam.name);
                const away = translateTeamName(m.homeWasHome ? r.fixture.awayTeam.name : r.fixture.homeTeam.name);
                const hg = m.homeWasHome ? m.homeGoals : m.awayGoals;
                const ag = m.homeWasHome ? m.awayGoals : m.homeGoals;
                return `<div class="h2h-row${m.usedInModel ? "" : " h2h-old"}${idx >= 5 ? " h2h-extra" : ""}"${idx >= 5 ? " hidden" : ""}><span class="muted">${date}</span><span>${escapeHtml(home)} <strong>${hg} : ${ag}</strong> ${escapeHtml(away)}</span></div>`;
              })
              .join("")}</div>
             ${(r.headToHead.matches || []).length > 5 ? `<button type="button" class="btn-ghost btn-mini h2h-toggle" data-more="${(r.headToHead.matches || []).length - 5}">+ Zobraziť ďalšie (${(r.headToHead.matches || []).length - 5})</button>` : ""}
             <p class="muted small" style="margin:8px 0 0;">${
               r.headToHead.usedInModel
                 ? `Model započítal ${r.headToHead.usedInModel} ${r.headToHead.usedInModel >= 5 ? "najnovších zápasov" : "najnovšie zápasy"} za posledných 10 rokov (sivé nie).`
                 : "Menej ako 3 vzájomné zápasy za posledných 10 rokov – do odhadu sa nezapočítali."
             }</p>`
          : ""
      }
    </div>

    <div class="prob-section">
      <div class="section-title">Najpravdepodobnejší strelec zápasu</div>
      <p class="muted small" style="margin: -4px 0 10px;">
        ${
          (r.lineupConfirmed && (r.lineupConfirmed.home || r.lineupConfirmed.away))
            ? "✓ Počíta z potvrdenej zostavy na zápas (kde je k dispozícii)."
            : "Zostava na tento zápas ešte nie je potvrdená (zvyčajne sa objaví cca hodinu pred výkopom) – počíta sa z celej súpisky."
        }
      </p>
      ${bestScorerCard(r.bestScorer)}
    </div>

    <div class="disclaimer">
      Toto je štatistický odhad založený na historických dátach (forma, vzájomné zápasy,
      priemer gólov), nie garancia výsledku. Športové stávkovanie nesie finančné riziko –
      stávkuj len sumy, ktoré si môžeš dovoliť stratiť.
    </div>
  `;

  initSaveTipButton(r);
  wireTicketButtons(r);
  wireScorerSaveButtons(r);
  if (matchHasStarted(r.fixture)) {
    document
      .querySelectorAll(".save-best-bet-btn, .add-to-ticket-btn, .scorer-save-btn")
      .forEach((b) => {
        b.disabled = true;
        b.title = MATCH_STARTED_TEXT;
      });
  }
}

function probRow(label, value) {
  return `
    <div class="prob-bar-row">
      <span class="prob-label">${escapeHtml(label)}</span>
      <div class="prob-bar-track"><div class="prob-bar-fill" style="width:${clampPercent(value)}%"></div></div>
      <span class="prob-value">${value.toFixed(0)} %</span>
    </div>
  `;
}

function teamStatCard(name, form, formScore, xg, historyInfo) {
  const pills = (form || "")
    .slice(-5)
    .split("")
    .map((r) => `<div class="form-pill ${r}">${translateFormLetter(r)}</div>`)
    .join("");

  const historyLine = historyInfo
    ? `<div class="stat-line"><span>Historické sezóny použité</span><strong>${historyInfo.seasonsUsed} / ${historyInfo.seasonsChecked}</strong></div>`
    : `<div class="stat-line"><span>Historické sezóny použité</span><strong>0 (nenájdené)</strong></div>`;

  return `
    <div class="stat-card">
      <h4>${escapeHtml(name)}</h4>
      <div class="form-pills">${pills || '<span class="muted small">bez dát o forme</span>'}</div>
      <div class="stat-line"><span>Vážené skóre formy</span><strong>${fmtNum(formScore, 2)} / 3,00</strong></div>
      <div class="stat-line"><span>Očakávané góly</span><strong>${fmtNum(xg, 2)}</strong></div>
      ${historyLine}
    </div>
  `;
}

function bestScorerCard(best) {
  if (!best) {
    return `
      <div class="stat-card">
        <p class="muted small">Nenašiel sa hráč s dostatočným počtom zápasov v žiadnom z tímov.</p>
      </div>
    `;
  }

  const prediction = best.prediction;

  return `
    <div class="stat-card">
      <h4>${escapeHtml(prediction.player.name)} <span class="muted small">(${escapeHtml(translateTeamName(best.team))})</span></h4>
      <div class="stat-line"><span>Góly / zápasy</span><strong>${prediction.seasonGoals} / ${prediction.appearances}</strong></div>
      <div class="tip-callout" style="margin-top:10px; margin-bottom:0; padding: 10px 14px;">
        <div class="tip-outcome" style="font-size:16px;">⚽</div>
        <div class="tip-details">
          <div class="tip-label" style="font-size:13px;">Pravdepodobnosť gólu</div>
        </div>
        <div class="best-bet-prob" style="margin-left:auto;">${prediction.probabilityToScore.toFixed(0)} %</div>
      </div>
      <button
        class="tip-save-btn scorer-save-btn"
        style="margin-top:8px; width:100%;"
        data-player-id="${prediction.player.id}"
        data-player-name="${escapeHtml(prediction.player.name)}"
        data-probability="${prediction.probabilityToScore}"
      >Uložiť tento tip</button>
    </div>
  `;
}

function clampPercent(v) {
  return Math.max(0, Math.min(100, v));
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---- Uložiť tip ----

function wireScorerSaveButtons(r) {
  const buttons = document.querySelectorAll(".scorer-save-btn");
  buttons.forEach((btn) => {
    btn.onclick = async () => {
      if (matchHasStarted(r.fixture)) {
        showToast(MATCH_STARTED_TEXT);
        return;
      }
      const playerId = parseInt(btn.dataset.playerId ?? "0", 10);
      const playerName = btn.dataset.playerName ?? "";
      const probability = parseFloat(btn.dataset.probability ?? "0");

      const tip = {
        id: `${r.fixture.fixtureId}-player-${playerId}-${Date.now()}`,
        fixtureId: r.fixture.fixtureId,
        leagueId: r.fixture.league.id,
        season: r.fixture.league.season,
        leagueName: r.fixture.league.name,
        homeTeam: r.fixture.homeTeam.name,
        awayTeam: r.fixture.awayTeam.name,
        homeTeamLogo: r.fixture.homeTeam.logo,
        awayTeamLogo: r.fixture.awayTeam.logo,
        matchDate: r.fixture.date,
        market: "Strelec gólov",
        selection: playerName,
        probability,
        savedAt: new Date().toISOString(),
        status: "pending",
        playerId,
        playerName,
      };

      btn.disabled = true;
      const originalText = btn.textContent;
      try {
        await fetchJson("/api/tips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tip),
        });
        btn.textContent = "✓ Uložené";
      } catch {
        btn.textContent = "Uloženie zlyhalo";
      } finally {
        setTimeout(() => {
          btn.textContent = originalText;
          btn.disabled = false;
        }, 2000);
      }
    };
  });
}

function askTelegramTarget() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" style="max-width:320px;">
        <h3>Odoslať do Telegramu?</h3>
        <div style="display:flex; flex-direction:column; gap:10px; margin-top:18px;">
          <button class="btn-primary" id="tgChoicePremium">◆ PREMIUM kanál</button>
          <button class="btn-primary" id="tgChoiceVip">♛ VIP kanál</button>
          <button class="btn-primary" id="tgChoiceFree">★ FREE kanál</button>
          <button class="btn-ghost" id="tgChoiceBoth">Oba naraz (Premium + VIP)</button>
          <button class="btn-ghost" id="tgChoiceNone">Neposielať</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const cleanup = (result) => {
      document.body.removeChild(overlay);
      resolve(result);
    };
    overlay.querySelector("#tgChoicePremium").addEventListener("click", () => cleanup("premium"));
    overlay.querySelector("#tgChoiceVip").addEventListener("click", () => cleanup("vip"));
    overlay.querySelector("#tgChoiceBoth").addEventListener("click", () => cleanup("both"));
    overlay.querySelector("#tgChoiceFree").addEventListener("click", () => cleanup("free"));
    overlay.querySelector("#tgChoiceNone").addEventListener("click", () => cleanup(null));
  });
}

async function maybeOfferTelegram(tipId) {
  const target = await askTelegramTarget();
  if (!target) return;
  try {
    await fetchJson(`/api/tips/${tipId}/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
    });
  } catch (err) {
    showToast(`Odoslanie do Telegramu zlyhalo: ${err.message}`);
  }
}

function initSaveTipButton(r) {
  const msgEl = document.getElementById("saveTipMsg");
  const buttons = document.querySelectorAll(".save-best-bet-btn");
  if (!msgEl) return;

  buttons.forEach((btn) => {
    btn.onclick = async () => {
      const idx = parseInt(btn.dataset.betIdx ?? "0", 10);
      if (matchHasStarted(r.fixture)) {
        showToast(MATCH_STARTED_TEXT);
        return;
      }
      const fromLow = btn.dataset.source === "low"; // vyradený tip pridaný ručne
      const chosenBet = (fromLow ? r.lowValueBets : r.bestBets)?.[idx];
      if (!chosenBet) return;

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
        market: chosenBet.market,
        selection: chosenBet.selection,
        probability: chosenBet.probability,
        odds: chosenBet.odds ?? null,
        ...(fromLow ? { overrideFilter: true } : {}),
        savedAt: new Date().toISOString(),
        status: "pending",
      };

      btn.disabled = true;
      try {
        await fetchJson("/api/tips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tip),
        });
        msgEl.innerHTML = `<p class="muted small" style="margin-top:6px;">✓ Tip uložený (${escapeHtml(chosenBet.market)}: ${escapeHtml(translateNamesInText(chosenBet.selection, r.fixture.homeTeam.name, r.fixture.awayTeam.name))})</p>`;
        await maybeOfferTelegram(tip.id);
      } catch (err) {
        msgEl.innerHTML = `<p class="muted small" style="margin-top:6px;">Uloženie zlyhalo: ${escapeHtml(err.message)}</p>`;
      } finally {
        btn.disabled = false;
      }
    };
  });
}

// ---- Tiket (spojenie viacerých tipov) ----

function wireTicketButtons(r) {
  const buttons = document.querySelectorAll(".add-to-ticket-btn");
  buttons.forEach((btn) => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.betIdx ?? "0", 10);
      if (matchHasStarted(r.fixture)) {
        showToast(MATCH_STARTED_TEXT);
        return;
      }
      const fromLow = btn.dataset.source === "low";
      const bet = (fromLow ? r.lowValueBets : r.bestBets)?.[idx];
      if (!bet) return;

      const id = `${r.fixture.fixtureId}-${bet.market}-${bet.selection}`;
      if (ticketItems.some((t) => t.id === id)) {
        btn.textContent = "✓ Už v tikete";
        setTimeout(() => (btn.textContent = "+ Do tiketu"), 1500);
        return;
      }

      ticketItems.push({
        id,
        fixtureId: r.fixture.fixtureId,
        leagueId: r.fixture.league.id,
        season: r.fixture.league.season,
        homeTeam: r.fixture.homeTeam.name,
        awayTeam: r.fixture.awayTeam.name,
        matchDate: r.fixture.date,
        market: bet.market,
        selection: bet.selection,
        probability: bet.probability,
        odds: bet.odds ?? null,
        ...(fromLow ? { overrideFilter: true } : {}),
      });

      updateTicketCount();
      btn.textContent = "✓ Pridané";
      setTimeout(() => (btn.textContent = "+ Do tiketu"), 1500);
    };
  });
}

function updateTicketCount() {
  ticketCountEl.textContent = ticketItems.length > 0 ? `(${ticketItems.length})` : "";
}

function renderTicket() {
  if (ticketItems.length === 0) {
    ticketSummaryEl.innerHTML = "";
    ticketListEl.innerHTML = `<p class="empty-state">Tiket je zatiaľ prázdny – pridaj tipy tlačidlom „+ Do tiketu“ pri analýze zápasu.</p>`;
    return;
  }

  const combinedProbability = ticketItems.reduce((acc, t) => acc * (t.probability / 100), 1) * 100;
  const impliedOdds = combinedProbability > 0 ? 100 / combinedProbability : 0;
  const allHaveOdds = ticketItems.every((t) => typeof t.odds === "number" && t.odds > 1);
  const realTicketOdds = allHaveOdds ? ticketItems.reduce((acc, t) => acc * t.odds, 1) : null;

  ticketSummaryEl.innerHTML = `
    <span>Počet tipov: <strong>${ticketItems.length}</strong></span>
    <span>Kombinovaná pravdepodobnosť: <strong>${fmtNum(combinedProbability, 1)} %</strong></span>
    <span>${realTicketOdds ? `Kurz: <strong>${fmtOdds(realTicketOdds)}</strong>` : `Odvodený kurz: <strong>~${fmtNum(impliedOdds, 2)}</strong>`}</span>
  `;

  ticketListEl.innerHTML = ticketItems
    .map(
      (t) => `
    <div class="tip-row">
      <div class="tip-row-info">
        <div class="tip-row-match">${escapeHtml(translateTeamName(t.homeTeam))} — ${escapeHtml(translateTeamName(t.awayTeam))}</div>
        <div class="tip-row-market">${escapeHtml(t.market)}: ${escapeHtml(translateNamesInText(t.selection, t.homeTeam, t.awayTeam))} · ${t.probability.toFixed(0)} %</div>
      </div>
      <button class="tip-delete-btn" data-ticket-id="${t.id}" title="Odstrániť z tiketu">✕</button>
    </div>
  `
    )
    .join("");

  ticketListEl.querySelectorAll(".tip-delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.dataset.ticketId;
      ticketItems = ticketItems.filter((t) => t.id !== id);
      updateTicketCount();
      renderTicket();
    });
  });
}

bankrollStartInput.addEventListener("input", () => {
  if (lastRenderedTips.length > 0) renderBankrollSimulation(lastRenderedTips);
});

openTicketBtn.addEventListener("click", () => {
  ticketModal.hidden = false;
  renderTicket();
});

closeTicketBtn.addEventListener("click", () => {
  ticketModal.hidden = true;
});

clearTicketBtn.addEventListener("click", () => {
  if (ticketItems.length === 0) return;
  if (!window.confirm("Naozaj chceš vymazať celý tiket?")) return;
  ticketItems = [];
  updateTicketCount();
  renderTicket();
});

saveTicketBtn.addEventListener("click", async () => {
  if (ticketItems.length < 2) {
    showToast("Tiket musí obsahovať aspoň 2 tipy.");
    return;
  }

  const startedLegs = ticketItems.filter((t) => {
    const time = new Date(t.matchDate).getTime();
    return !isNaN(time) && time <= Date.now();
  });
  if (startedLegs.length > 0) {
    showToast(
      `Tiket obsahuje zápas, ktorý už začal: ${startedLegs
        .map((t) => `${translateTeamName(t.homeTeam)} – ${translateTeamName(t.awayTeam)}`)
        .join(", ")}. Odstráň ho z tiketu.`
    );
    return;
  }

  const combinedProbability = ticketItems.reduce((acc, t) => acc * (t.probability / 100), 1) * 100;

  const ticketTip = {
    id: `ticket-${Date.now()}`,
    fixtureId: ticketItems[0].fixtureId,
    leagueId: ticketItems[0].leagueId,
    season: ticketItems[0].season,
    leagueName: "Tiket",
    homeTeam: "Tiket",
    awayTeam: `${plural(ticketItems.length, "zápas", "zápasy", "zápasov")}`,
    matchDate: new Date().toISOString(),
    market: "Tiket",
    selection: `${plural(ticketItems.length, "tip", "tipy", "tipov")}`,
    probability: combinedProbability,
    ...(ticketItems.some((t) => t.overrideFilter) ? { overrideFilter: true } : {}),
    odds: ticketItems.every((t) => typeof t.odds === "number" && t.odds > 1)
      ? Math.round(ticketItems.reduce((acc, t) => acc * t.odds, 1) * 100) / 100
      : null,
    savedAt: new Date().toISOString(),
    status: "pending",
    legs: ticketItems.map((t) => ({
      fixtureId: t.fixtureId,
      leagueId: t.leagueId,
      season: t.season,
      homeTeam: t.homeTeam,
      awayTeam: t.awayTeam,
      matchDate: t.matchDate,
      market: t.market,
      selection: t.selection,
      probability: t.probability,
      odds: t.odds ?? null,
      ...(t.overrideFilter ? { overrideFilter: true } : {}),
      status: "pending",
    })),
  };

  saveTicketBtn.disabled = true;
  try {
    await fetchJson("/api/tips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ticketTip),
    });
    ticketItems = [];
    updateTicketCount();
    renderTicket();
    await maybeOfferTelegram(ticketTip.id);
  } catch (err) {
    showToast(`Uloženie tiketu zlyhalo: ${err.message}`);
  } finally {
    saveTicketBtn.disabled = false;
  }
});

// ---- História tipov ----

async function openTipsHistory() {
  void renderShadowSummary();
  void renderClvSummary();
  void renderTicketWatch();
  tipsModal.hidden = false;
  tipsListEl.innerHTML = skeletonHtml(2);
  try {
    const tips = await fetchJson("/api/tips");
    renderTipsList(tips);
  } catch (err) {
    tipsListEl.innerHTML = `<p class="empty-state">Tipy sa nepodarilo načítať: ${escapeHtml(err.message)}</p>`;
  }
}

let lastRenderedTips = [];

function stakeTierPercent(probability) {
  if (probability >= 70) return 0.03; // vyššia dôvera = väčšia sadzba
  if (probability >= 60) return 0.02;
  return 0.01;
}

function renderCalibrationReport(tips) {
  // Tikety vynechávame - ich pravdepodobnosť je kombinovaná naprieč viacerými
  // zápasmi, takže sa nedá zmysluplne porovnať s jedným percentom.
  const resolved = tips.filter((t) => !t.legs && (t.status === "won" || t.status === "lost"));

  if (resolved.length === 0) {
    calibrationResultEl.innerHTML = `<p class="muted small">Zatiaľ nemáš dosť vyhodnotených tipov na kalibráciu.</p>`;
    return;
  }

  const buckets = [
    { min: 50, max: 60, label: "50–60 %" },
    { min: 60, max: 70, label: "60–70 %" },
    { min: 70, max: 80, label: "70–80 %" },
    { min: 80, max: 90, label: "80–90 %" },
    { min: 90, max: 100, label: "90–100 %" },
  ];

  const rows = buckets
    .map((b) => {
      const inBucket = resolved.filter((t) => t.probability >= b.min && t.probability < (b.max === 100 ? 101 : b.max));
      if (inBucket.length === 0) return null;
      const won = inBucket.filter((t) => t.status === "won").length;
      const actualPct = (won / inBucket.length) * 100;
      const predictedMid = (b.min + b.max) / 2;
      return { label: b.label, count: inBucket.length, actualPct, predictedMid };
    })
    .filter(Boolean);

  if (rows.length === 0) {
    calibrationResultEl.innerHTML = `<p class="muted small">Zatiaľ nemáš dosť vyhodnotených tipov na kalibráciu.</p>`;
    return;
  }

  calibrationResultEl.innerHTML = rows
    .map(
      (r) => `
      <div class="market-breakdown-row">
        <div class="market-breakdown-label">
          <span>Predikcia ${r.label}</span>
          <span class="muted small">realita: ${r.actualPct.toFixed(0)} % · ${plural(r.count, "tip", "tipy", "tipov")}</span>
        </div>
        <div class="market-breakdown-bar" style="position:relative;">
          <div class="market-breakdown-bar-fill" style="width: ${r.actualPct}%;"></div>
          <div style="position:absolute; left:${r.predictedMid}%; top:-2px; bottom:-2px; width:2px; background:var(--text);"></div>
        </div>
      </div>
    `
    )
    .join("") + `<p class="muted small" style="margin-top:8px;">Zlatý pruh = koľko tipov reálne vyšlo. Biela čiarka = stred predikovaného rozsahu (kde by mal pruh byť, ak je model presný).</p>`;
}

function renderBankrollSimulation(tips) {
  lastRenderedTips = tips;

  const resolved = tips
    .filter((t) => t.status === "won" || t.status === "lost")
    .sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());

  if (resolved.length === 0) {
    bankrollResultEl.innerHTML = `<p class="muted small">Zatiaľ nemáš žiadne vyhodnotené tipy na simuláciu.</p>`;
    return;
  }

  const startingBankroll = parseFloat(bankrollStartInput.value) || 1000;
  let bankroll = startingBankroll;
  const history = [bankroll];

  for (const t of resolved) {
    const stakePct = stakeTierPercent(t.probability);
    const stake = bankroll * stakePct;
    // Skutočný kurz, ak bol pri tipe uložený - inak "fér" kurz odvodený z pravdepodobnosti modelu.
    const impliedOdds = typeof t.odds === "number" && t.odds > 1 ? t.odds : 100 / t.probability;
    bankroll += t.status === "won" ? stake * (impliedOdds - 1) : -stake;
    history.push(bankroll);
  }

  const totalReturn = ((bankroll - startingBankroll) / startingBankroll) * 100;
  const maxVal = Math.max(...history);
  const minVal = Math.min(...history);
  const range = maxVal - minVal || 1;

  const barsHtml = history
    .map((v) => {
      const heightPct = 10 + ((v - minVal) / range) * 90;
      return `<div class="bankroll-bar" style="height:${heightPct}%;" title="${v.toFixed(0)}€"></div>`;
    })
    .join("");

  bankrollResultEl.innerHTML = `
    <div class="bankroll-summary">
      <span>Použitých tipov: <strong>${resolved.length}</strong></span>
      <span>Konečný bankroll: <strong>${bankroll.toFixed(0)}€</strong></span>
      <span>Celková zmena: <strong style="color:${totalReturn >= 0 ? "var(--success)" : "var(--danger)"};">${signed(totalReturn, 1)} %</strong></span>
    </div>
    <div class="bankroll-chart">${barsHtml}</div>
  `;
}

function renderMarketBreakdown(tips) {
  const decidedTips = tips.filter((t) => t.status === "won" || t.status === "lost");
  if (decidedTips.length === 0) {
    marketBreakdownEl.innerHTML = "";
    return;
  }

  const byMarket = {};
  for (const t of decidedTips) {
    if (!byMarket[t.market]) byMarket[t.market] = { won: 0, total: 0 };
    byMarket[t.market].total++;
    if (t.status === "won") byMarket[t.market].won++;
  }

  const rows = Object.entries(byMarket).sort((a, b) => b[1].total - a[1].total);

  marketBreakdownEl.innerHTML = `
    <div class="market-breakdown-title">Úspešnosť podľa typu stávky</div>
    ${rows
      .map(([market, stats]) => {
        const pct = (stats.won / stats.total) * 100;
        return `
        <div class="market-breakdown-row">
          <div class="market-breakdown-label">
            <span>${escapeHtml(market)}</span>
            <span class="muted small">${stats.won}/${stats.total} · ${pct.toFixed(0)} %</span>
          </div>
          <div class="market-breakdown-bar">
            <div class="market-breakdown-bar-fill" style="width: ${pct}%;"></div>
          </div>
        </div>
      `;
      })
      .join("")}
  `;
}

/** Samostatný prehľad tipov "mimo filtra" - či sa oplatí prekonávať kontrolu kurzu. */
function overrideSummaryHtml(tips) {
  const ov = tips.filter(isOverrideTip);
  if (ov.length === 0) return "";
  const decided = ov.filter((t) => t.status === "won" || t.status === "lost");
  const won = decided.filter((t) => t.status === "won").length;
  const withOdds = decided.filter((t) => typeof t.odds === "number" && t.odds > 1);
  const profit = withOdds.reduce((sum, t) => sum + (t.status === "won" ? t.odds - 1 : -1), 0);
  return `<span title="Tipy vyradené kontrolou kurzu, ktoré si pridal ručne">⚠️ Mimo filtra: <strong>${won} z ${decided.length}</strong>${
    withOdds.length > 0 ? ` · zisk <strong>${signed(profit, 1)} j.</strong>` : ""
  }${ov.length > decided.length ? ` · čaká ${ov.length - decided.length}` : ""}</span>`;
}

const EXCLUDED_STATS_MARKETS = ["Dvojšanca", "Presný výsledok", "Čisté konto"];

function renderTipsList(tips) {
  currentHistoryTips = tips;
  // Tipy na trhy, ktoré appka už neponúka (dvojšanca, presný výsledok, čisté
  // konto), ostávajú v zozname, ale nerátajú sa do štatistík.
  const statTips = tips.filter((t) => !EXCLUDED_STATS_MARKETS.includes(t.market));
  const won = statTips.filter((t) => t.status === "won").length;
  const lost = statTips.filter((t) => t.status === "lost").length;
  const pending = statTips.filter((t) => t.status === "pending").length;
  const decided = won + lost;
  const winRate = decided > 0 ? ((won / decided) * 100).toFixed(0) : "—";

  tipsSummaryEl.innerHTML = `
    <span>Spolu: <strong>${statTips.length}</strong></span>
    <span>Čaká: <strong>${pending}</strong></span>
    <span>Vyhral: <strong>${won}</strong></span>
    <span>Prehral: <strong>${lost}</strong></span>
    <span>Úspešnosť: <strong>${winRate}${decided > 0 ? " %" : ""}</strong></span>
    ${overrideSummaryHtml(statTips)}
  `;

  renderMarketBreakdown(statTips);
  renderBankrollSimulation(statTips);
  renderCalibrationReport(statTips);

  // Skryté (archivované) tipy sa v zozname nezobrazujú, ale rátajú sa do štatistík
  // a ostávajú na prezentačnej stránke.
  const archivedCount = tips.filter((t) => t.archived).length;
  const visible = showArchivedTips ? tips : tips.filter((t) => !t.archived);
  const archivedBar =
    archivedCount > 0
      ? `<div class="archived-bar">Skrytých tipov: <strong>${archivedCount}</strong> (rátajú sa do štatistík aj na prezentácii) · <button class="link-btn" id="toggleArchivedBtn">${
          showArchivedTips ? "Schovať skryté" : "Zobraziť skryté"
        }</button></div>`
      : "";

  if (visible.length === 0) {
    tipsListEl.innerHTML =
      archivedBar + `<p class="empty-state">${tips.length === 0 ? "Zatiaľ nemáš uložené žiadne tipy." : "Všetky tipy sú skryté."}</p>`;
    wireArchivedToggle();
    return;
  }

  tipsListEl.innerHTML = archivedBar + visible
    .map((t) => {
      const date = new Date(t.matchDate).toLocaleDateString("sk-SK");
      const rowClass = t.status === "won" ? "tip-row-won" : t.status === "lost" ? "tip-row-lost" : ""
      const rowClassFull = rowClass + (t.archived ? " is-archived" : "");
      const resultIconHtml =
        t.status === "won"
          ? `<span class="tip-result-icon won">✓</span>`
          : t.status === "lost"
          ? `<span class="tip-result-icon lost">✕</span>`
          : `<span class="tip-status ${t.status}">${t.status === "void" ? "Vrátené" : "Čaká"}</span>`;

      if (t.legs && t.legs.length > 0) {
        const legsHtml = t.legs
          .map(
            (leg) => `
            <div class="tip-row-market" style="padding-left: 10px; border-left: 2px solid var(--border); margin-top: 4px;">
              ${escapeHtml(translateTeamName(leg.homeTeam))} — ${escapeHtml(translateTeamName(leg.awayTeam))}: ${escapeHtml(leg.market)}: ${escapeHtml(translateNamesInText(leg.selection, leg.homeTeam, leg.awayTeam))} · ${leg.probability.toFixed(0)} %
            </div>`
          )
          .join("");

        return `
        <div class="tip-row ${rowClassFull}" data-row-id="${t.id}" style="align-items: flex-start;">
          <div class="tip-row-info">
            <div class="tip-row-match">🎫 Tiket (${plural(t.legs.length, "tip", "tipy", "tipov")}) <span class="muted small">(${date})</span></div>
            <div class="tip-row-market">Kombinovaná pravdepodobnosť: ${fmtNum(t.probability, 1)} % · kurz ${tipOddsLabel(t)}${overrideBadge(t)}${manualBadge(t)}${editedBadge(t)}</div>
            ${legsHtml}
          </div>
          ${resultIconHtml}
          ${
            t.status === "pending"
              ? `<button class="tip-delete-btn" data-edit-id="${t.id}" title="Upraviť výsledok alebo kurz" aria-label="Upraviť tip"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="display:block"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg></button><button class="tip-delete-btn" data-send-id="${t.id}" title="Poslať do Telegram kanála" aria-label="Poslať do Telegram kanála"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style="display:block"><path fill="currentColor" d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13.1 1.3 11.6c-1-.3-1.1-1 .2-1.5L20.6 2.8c.9-.3 1.6.2 1.3 1.5z"/></svg></button><button class="tip-delete-btn" data-motw-id="${t.id}" title="Poslať do VIP ako ⭐ Silný tip dňa">⭐</button>`
              : `<button class="tip-delete-btn" data-edit-id="${t.id}" title="Upraviť výsledok alebo kurz" aria-label="Upraviť tip"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="display:block"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg></button><button class="tip-delete-btn" data-result-id="${t.id}" title="Poslať výsledok do Telegramu">➤</button>`
          }
        </div>
      `;
      }

      return `
        <div class="tip-row ${rowClassFull}" data-row-id="${t.id}">
          <div class="tip-row-info">
            <div class="tip-row-match">${escapeHtml(translateTeamName(t.homeTeam))} — ${escapeHtml(translateTeamName(t.awayTeam))} <span class="muted small">(${date})</span></div>
            <div class="tip-row-market">${escapeHtml(t.market)}: ${escapeHtml(translateNamesInText(t.selection, t.homeTeam, t.awayTeam))} · ${t.probability.toFixed(0)} % · kurz ${tipOddsLabel(t)}${t.strongOfDay ? STRONG_OF_DAY_BADGE : ""}${overrideBadge(t)}${manualBadge(t)}${editedBadge(t)}</div>
          </div>
          ${resultIconHtml}
          ${
            t.status === "pending"
              ? `<button class="tip-delete-btn" data-edit-id="${t.id}" title="Upraviť výsledok alebo kurz" aria-label="Upraviť tip"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="display:block"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg></button><button class="tip-delete-btn" data-send-id="${t.id}" title="Poslať do Telegram kanála" aria-label="Poslať do Telegram kanála"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style="display:block"><path fill="currentColor" d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13.1 1.3 11.6c-1-.3-1.1-1 .2-1.5L20.6 2.8c.9-.3 1.6.2 1.3 1.5z"/></svg></button><button class="tip-delete-btn" data-motw-id="${t.id}" title="Poslať do VIP ako ⭐ Silný tip dňa">⭐</button>`
              : `<button class="tip-delete-btn" data-edit-id="${t.id}" title="Upraviť výsledok alebo kurz" aria-label="Upraviť tip"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="display:block"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg></button><button class="tip-delete-btn" data-result-id="${t.id}" title="Poslať výsledok do Telegramu">➤</button>`
          }
        </div>
      `;
    })
    .join("");

  wireArchivedToggle();

  tipsListEl.querySelectorAll("[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const tip = currentHistoryTips.find((x) => x.id === btn.dataset.editId);
      if (tip) openEditTip(tip);
    });
  });

  tipsListEl.querySelectorAll("[data-row-id]").forEach((row) => {
    row.addEventListener("click", async (e) => {
      if (e.target.closest("button")) return; // klik na iné tlačidlo v riadku (★/➤) - nie na mazanie
      const id = row.dataset.rowId;
      const tip = currentHistoryTips.find((x) => x.id === id);
      if (tip && (tip.archived || tip.status !== "pending")) {
        await toggleArchive(tip);
        return;
      }
      const confirmed = window.confirm("Naozaj chceš odstrániť tento tip/tiket z histórie? Táto akcia sa nedá vrátiť späť.");
      if (!confirmed) return;
      try {
        const res = await fetch(`/api/tips/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          showToast(`Zmazanie zlyhalo: ${data.error || "neznáma chyba"}. Skús to prosím znova.`);
        }
      } catch (err) {
        showToast("Zmazanie zlyhalo – skontroluj internetové pripojenie a skús to znova.");
      } finally {
        openTipsHistory();
      }
    });
  });

  tipsListEl.querySelectorAll("[data-send-id]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.dataset.sendId;
      if (!id) return;
      const target = await askTelegramTarget();
      if (!target) return;
      try {
        await fetchJson(`/api/tips/${id}/telegram`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target }),
        });
        showToast("Tip odoslaný do Telegram kanála.");
      } catch (err) {
        showToast(`Odoslanie zlyhalo: ${err.message}`);
      }
    });
  });

  tipsListEl.querySelectorAll("[data-motw-id]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.dataset.motwId;
      if (!id) return;
      if (!window.confirm("Poslať do VIP kanála ako ⭐ Silný tip dňa? Ak bol v ten deň silný iný tip, toto ho nahradí.")) return;
      try {
        await fetchJson(`/api/tips/${id}/telegram`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: "vip", asStrongOfDay: true }),
        });
        showToast("Odoslané do VIP ako Silný tip dňa.");
        renderTipsList(await fetchJson("/api/tips"));
      } catch (err) {
        showToast(`Odoslanie zlyhalo: ${err.message}`);
      }
    });
  });

  tipsListEl.querySelectorAll("[data-result-id]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.dataset.resultId;
      if (!id) return;
      const target = await askTelegramTarget();
      if (!target) return;
      try {
        await fetchJson(`/api/tips/${id}/telegram-result`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target }),
        });
        showToast("Výsledok odoslaný.");
      } catch (err) {
        showToast(`Odoslanie zlyhalo: ${err.message}`);
      }
    });
  });
}

openTipsBtn.addEventListener("click", openTipsHistory);
closeTipsBtn.addEventListener("click", () => {
  tipsModal.hidden = true;
});

// ---- Členovia (platba beží mimo appky, napr. bankovým prevodom) ----

// Ceny musia sedieť s PRICES na tipradar.eu (landing/index.html).
const MEMBER_PRICES = {
  individual: { m1: 29, m3: 69, season: 149 },
  group: { m1: 59, m3: 139, season: 299 },
};
const MEMBER_LENGTH_LABEL = { m1: "1 mesiac", m3: "3 mesiace", season: "sezóna" };
const SEASON_END = "2027-05-31";
let memberFilter = "active";
let lastSubs = [];

function daysUntil(dateStr) {
  const diffMs = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Koniec členstva: od dátumu `from` pridá dĺžku; sezóna končí vždy 31. 5. 2027. */
function memberEnd(from, length) {
  if (length === "season") return new Date(`${SEASON_END}T23:59:00`);
  const d = new Date(`${String(from).slice(0, 10)}T23:59:00`);
  const months = length === "m3" ? 3 : 1;
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0); // napr. 31. 1. + 1 mesiac = 28./29. 2.
  return d;
}

function syncMemberPrice() {
  subPriceInput.value = MEMBER_PRICES[subTierSelect.value][subLengthSelect.value];
}
subTierSelect.addEventListener("change", syncMemberPrice);
subLengthSelect.addEventListener("change", syncMemberPrice);

function subscriberStatus(sub) {
  const days = daysUntil(sub.nextPaymentDue);
  if (days < 0) return { label: "Skončilo", cls: "lost" };
  if (days <= 3) return { label: days === 0 ? "Končí dnes" : `Končí o ${days} d.`, cls: "void" };
  return { label: "Aktívny", cls: "won" };
}

async function openSubscribers() {
  void renderLeads();
  subscribersModal.hidden = false;
  if (!subStartInput.value) subStartInput.value = todayIso();
  if (!subPriceInput.value) syncMemberPrice();
  subscribersListEl.innerHTML = skeletonHtml(2);
  try {
    const subs = await fetchJson("/api/subscribers");
    renderSubscribersList(subs);
  } catch (err) {
    subscribersListEl.innerHTML = `<p class="muted small">Členov sa nepodarilo načítať: ${escapeHtml(err.message)}</p>`;
  }
}

function renderSubscribersList(subs) {
  lastSubs = subs;
  const active = subs.filter((s) => daysUntil(s.nextPaymentDue) >= 0);
  const vip = active.filter((s) => s.tier === "group").length;
  const income = active.reduce((sum, s) => sum + (Number(s.priceEur) || 0), 0);
  const ending = active.filter((s) => daysUntil(s.nextPaymentDue) <= 7).length;

  subscribersSummaryEl.innerHTML = `
    <span>Aktívni: <strong>${active.length}</strong></span>
    <span>Premium: <strong>${active.length - vip}</strong></span>
    <span>VIP: <strong>${vip}</strong></span>
    <span>Zaplatené (aktívni): <strong>${income} €</strong></span>
    <span>Končí do 7 dní: <strong>${ending}</strong></span>
  `;

  memberFilterEl.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.f === memberFilter));

  const shown = subs
    .filter((s) => memberFilter === "all" || (memberFilter === "active" ? daysUntil(s.nextPaymentDue) >= 0 : daysUntil(s.nextPaymentDue) < 0))
    .sort((a, b) => memberFilter === "expired"
      ? new Date(b.nextPaymentDue) - new Date(a.nextPaymentDue)
      : new Date(a.nextPaymentDue) - new Date(b.nextPaymentDue));

  if (shown.length === 0) {
    subscribersListEl.innerHTML = `<p class="empty-state">${
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
      const needsCard = isVip && (length === "m3" || length === "season");
      const details = [
        escapeHtml(s.contact || ""),
        `${MEMBER_LENGTH_LABEL[length]} · ${Number(s.priceEur) || 0} €`,
        startDate ? `${startDate} – ${endDate}` : `do ${endDate}`,
        s.note ? escapeHtml(s.note) : "",
      ].filter(Boolean).join(" · ");
      return `
        <div class="tip-row">
          <div class="tip-row-info">
            <div class="tip-row-match">${escapeHtml(s.name)}<span class="member-tag ${isVip ? "vip" : "premium"}">${isVip ? "VIP" : "PREMIUM"}</span>${s.founder ? `<span class="member-tag founder">Prvý člen</span>` : ""}</div>
            <div class="tip-row-market">${details}</div>
          </div>
          <span class="tip-status ${status.cls}">${status.label}</span>
          ${needsCard ? `<button class="tip-delete-btn member-btn" data-card-id="${s.id}" title="Kovová karta">${s.cardSent ? "✓ Karta poslaná" : "Poslať kartu"}</button>` : ""}
          ${s.telegramChatId ? `<button class="tip-delete-btn member-btn" data-test-reminder-id="${s.id}" title="Poslať testovaciu pripomienku teraz">🔔 Test</button>` : ""}
          <button class="tip-delete-btn member-btn" data-extend-id="${s.id}" title="Predĺžiť o ďalšie obdobie (${MEMBER_LENGTH_LABEL[length]})">Predĺžiť</button>
          <button class="tip-delete-btn" data-remove-id="${s.id}" title="Zmazať">✕</button>
        </div>
      `;
    })
    .join("");

  subscribersListEl.querySelectorAll("[data-extend-id]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.dataset.extendId;
      const sub = subs.find((s) => s.id === id);
      if (!sub) return;
      const length = sub.length || "m1";
      if (length === "season" && daysUntil(sub.nextPaymentDue) >= 0) {
        showToast("Sezónne členstvo platí do 31. 5. 2027, predĺžiť sa dá až potom.");
        return;
      }
      // Predĺženie nadväzuje na koniec, ak ešte platí, inak začína dnes.
      const from = daysUntil(sub.nextPaymentDue) >= 0 ? sub.nextPaymentDue : todayIso();
      const end = memberEnd(from, length);
      if (!window.confirm(`Predĺžiť ${sub.name} (${MEMBER_LENGTH_LABEL[length]}) do ${end.toLocaleDateString("sk-SK")}?`)) return;
      try {
        await fetchJson(`/api/subscribers/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nextPaymentDue: end.toISOString() }),
        });
        showToast("Členstvo predĺžené.");
        openSubscribers();
      } catch (err) {
        showToast(`Predĺženie zlyhalo: ${err.message}`);
      }
    });
  });

  subscribersListEl.querySelectorAll("[data-card-id]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.dataset.cardId;
      const sub = subs.find((s) => s.id === id);
      if (!sub) return;
      btn.disabled = true;
      try {
        await fetchJson(`/api/subscribers/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardSent: !sub.cardSent }),
        });
        openSubscribers();
      } catch (err) {
        btn.disabled = false;
        showToast(`Uloženie zlyhalo: ${err.message}`);
      }
    });
  });

  subscribersListEl.querySelectorAll("[data-test-reminder-id]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.dataset.testReminderId;
      btn.disabled = true;
      try {
        const res = await fetchJson(`/api/subscribers/${id}/test-reminder`, { method: "POST" });
        showToast(res.ok ? "Testovacia pripomienka odoslaná – skontroluj Telegram." : "Odoslanie zlyhalo.");
      } catch (err) {
        showToast(`Odoslanie zlyhalo: ${err.message}`);
      } finally {
        btn.disabled = false;
      }
    });
  });

  subscribersListEl.querySelectorAll("[data-remove-id]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.dataset.removeId;
      if (!window.confirm("Naozaj zmazať tohto člena?")) return;
      try {
        await fetchJson(`/api/subscribers/${id}`, { method: "DELETE" });
        openSubscribers();
      } catch (err) {
        showToast(`Zmazanie zlyhalo: ${err.message}`);
      }
    });
  });
}

memberFilterEl.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-f]");
  if (!b) return;
  memberFilter = b.dataset.f;
  renderSubscribersList(lastSubs);
});

openSubscribersBtn.addEventListener("click", openSubscribers);
closeSubscribersBtn.addEventListener("click", () => {
  subscribersModal.hidden = true;
});

addSubscriberBtn.addEventListener("click", async () => {
  const name = subNameInput.value.trim();
  if (!name) {
    showToast("Zadaj meno člena.");
    return;
  }
  const tier = subTierSelect.value;
  const length = subLengthSelect.value;
  const start = subStartInput.value || todayIso();
  const priceRaw = subPriceInput.value.trim();
  const priceEur = priceRaw === "" ? MEMBER_PRICES[tier][length] : Number(priceRaw);
  const end = memberEnd(start, length);
  if (end.getTime() < Date.now() && length !== "season") {
    if (!window.confirm(`Toto členstvo by skončilo už ${end.toLocaleDateString("sk-SK")}. Pridať aj tak?`)) return;
  }

  const subscriber = {
    id: `sub-${Date.now()}`,
    name,
    contact: subContactInput.value.trim(),
    telegramChatId: subTelegramChatIdInput.value.trim() || undefined,
    tier,
    priceEur,
    length,
    startDate: new Date(`${start}T12:00:00`).toISOString(),
    nextPaymentDue: end.toISOString(),
    founder: subFounderInput.checked,
    note: subNoteInput.value.trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  addSubscriberBtn.disabled = true;
  try {
    await fetchJson("/api/subscribers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscriber),
    });
    subNameInput.value = "";
    subContactInput.value = "";
    subTelegramChatIdInput.value = "";
    subNoteInput.value = "";
    subStartInput.value = todayIso();
    memberFilter = "active";
    showToast(`${name} pridaný medzi členov.`);
    openSubscribers();
  } catch (err) {
    showToast(`Pridanie zlyhalo: ${err.message}`);
  } finally {
    addSubscriberBtn.disabled = false;
  }
});

checkResultsBtn.addEventListener("click", async () => {
  checkResultsBtn.disabled = true;
  checkResultsBtn.textContent = "Kontrolujem…";
  try {
    const tips = await fetchJson("/api/tips/check-results", { method: "POST" });
    renderTipsList(tips);
  } catch (err) {
    showToast(`Kontrola výsledkov zlyhala: ${err.message}`);
  } finally {
    checkResultsBtn.disabled = false;
    checkResultsBtn.textContent = "Skontrolovať výsledky";
  }
});

clearAllTipsBtn.addEventListener("click", async () => {
  const confirmed = window.confirm(
    "Naozaj chceš vymazať ÚPLNE VŠETKY uložené tipy (aj už vyhodnotené)? Táto akcia sa nedá vrátiť späť."
  );
  if (!confirmed) return;

  clearAllTipsBtn.disabled = true;
  try {
    await fetchJson("/api/tips", { method: "DELETE" });
    renderTipsList([]);
  } catch (err) {
    showToast(`Vymazanie zlyhalo: ${err.message}. Skús to prosím znova.`);
  } finally {
    clearAllTipsBtn.disabled = false;
  }
});

noTipTodayBtn.addEventListener("click", async () => {
  const target = await askTelegramTarget();
  if (!target) return;
  noTipTodayBtn.disabled = true;
  try {
    await fetchJson("/api/telegram/no-tip-today", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
    });
    showToast("Odoslané.");
  } catch (err) {
    showToast(`Odoslanie zlyhalo: ${err.message}`);
  } finally {
    noTipTodayBtn.disabled = false;
  }
});

weeklyReportBtn.addEventListener("click", async () => {
  const target = await askTelegramTarget();
  if (!target) return;
  weeklyReportBtn.disabled = true;
  try {
    await fetchJson("/api/telegram/weekly-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
    });
    showToast("Odoslané.");
  } catch (err) {
    showToast(`Odoslanie zlyhalo: ${err.message}`);
  } finally {
    weeklyReportBtn.disabled = false;
  }
});

// ---- Mesačný súhrn (tipy daného mesiaca, s odoslaním do Telegramu) ----
function fmtMonthNum(n, digits) {
  return Number(n).toFixed(digits).replace(".", ",");
}
function signedMonthNum(n, digits) {
  return (n > 0 ? "+" : n < 0 ? "−" : "") + fmtMonthNum(Math.abs(n), digits);
}
function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

async function openMonthlyReport(startMonth) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal modal-large monthly-modal">
      <div class="monthly-head">
        <button class="btn-ghost btn-mini" data-m="-1" aria-label="Predošlý mesiac">‹</button>
        <h3 class="monthly-title">Mesačný súhrn</h3>
        <button class="btn-ghost btn-mini" data-m="1" aria-label="Ďalší mesiac">›</button>
      </div>
      <div class="monthly-body"><p class="empty-state">Načítavam…</p></div>
      <div class="modal-actions">
        <button class="btn-ghost" data-close>Zavrieť</button>
        <button class="btn-primary" data-send>Odoslať do Telegramu</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const body = overlay.querySelector(".monthly-body");
  const title = overlay.querySelector(".monthly-title");
  let current = startMonth || null;
  let loaded = null;

  async function load() {
    body.innerHTML = `<p class="empty-state">Načítavam…</p>`;
    try {
      const r = await getMonthlyReport(current);
      loaded = r;
      current = r.month;
      title.textContent = `Mesačný súhrn – ${r.label}`;
      if (!r.resolved) {
        body.innerHTML = `<p class="empty-state">V tomto mesiaci zatiaľ nie sú vyhodnotené žiadne tipy.${r.pending ? ` Ešte sa hrá: ${r.pending}.` : ""}</p>`;
        return;
      }
      const card = (label, value, cls) => `<div class="monthly-stat"><span>${label}</span><b class="${cls || ""}">${value}</b></div>`;
      body.innerHTML = `
        <div class="monthly-grid">
          ${card("Úspešnosť", `${fmtMonthNum(r.rate, 0)} %`)}
          ${card("Vyšlo / nevyšlo", `<span class="won">${r.won}</span> / <span class="lost">${r.lost}</span>`)}
          ${r.profit != null ? card("Zisk", `${signedMonthNum(r.profit, 1)} j.`, r.profit >= 0 ? "won" : "lost") : ""}
          ${r.roi != null ? card("ROI", `${signedMonthNum(r.roi, 0)} %`, r.roi >= 0 ? "won" : "lost") : ""}
          ${r.avgOdds != null ? card("Priemerný kurz", fmtMonthNum(r.avgOdds, 2)) : ""}
          ${r.bestStreak >= 2 ? card("Séria výhier", r.bestStreak) : ""}
        </div>
        <p class="muted small">${r.voided ? `Vrátené: ${r.voided}. ` : ""}${r.pending ? `Ešte sa hrá: ${r.pending}. ` : ""}${r.bestDay ? `Najlepší deň: ${r.bestDay.day} (${signedMonthNum(r.bestDay.profit, 1)} j.). ` : ""}${r.oddsCount < r.resolved ? `Zisk je z ${r.oddsCount} tipov so známym kurzom.` : ""}</p>
        <div class="market-breakdown-title">Podľa trhov</div>
        ${r.byMarket.map((b) => `
          <div class="market-breakdown-row">
            <div class="market-breakdown-label"><span>${escapeHtml(b.market)}</span><span>${b.won} z ${b.total} · ${fmtMonthNum(b.rate, 0)} %</span></div>
            <div class="market-breakdown-bar"><div class="market-breakdown-bar-fill" style="width:${Math.round(b.rate)}%"></div></div>
          </div>`).join("")}`;
    } catch (err) {
      body.innerHTML = `<p class="empty-state">Súhrn sa nepodarilo načítať: ${escapeHtml(err.message || String(err))}</p>`;
    }
  }

  overlay.querySelectorAll("[data-m]").forEach((b) =>
    b.addEventListener("click", () => {
      if (!current) return;
      current = shiftMonth(current, Number(b.dataset.m));
      load();
    })
  );
  overlay.querySelector("[data-close]").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector("[data-send]").addEventListener("click", async () => {
    if (!loaded) return;
    const target = await askTelegramTarget();
    if (!target) return;
    try {
      await sendMonthlyReport(loaded.month, target);
      showToast("Mesačný súhrn odoslaný.");
    } catch (err) {
      showToast(`Odoslanie zlyhalo: ${err.message}`);
    }
  });
  load();
}

function getMonthlyReport(month) {
  return fetchJson(`/api/reports/monthly${month ? `?month=${encodeURIComponent(month)}` : ""}`);
}
function sendMonthlyReport(month, target) {
  return fetchJson("/api/telegram/monthly-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month, target }),
  });
}
document.getElementById("monthlyReportBtn").addEventListener("click", () => openMonthlyReport());

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
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal modal-large">
      <h3>Návštevnosť tipradar.eu</h3>
      <p class="muted small">Bez cookies. Návštevník = jeden človek za deň (podľa skráteného odtlačku, ktorý sa každý deň mení).</p>
      <p class="muted small">Aby sa nepočítali tvoje vlastné návštevy, otvor raz v každom svojom zariadení a prehliadači <a href="https://tipradar.eu/?ja=1" target="_blank" rel="noopener">tipradar.eu/?ja=1</a>. Znova zapneš cez tipradar.eu/?ja=0.</p>
      <div class="visits-body"><p class="empty-state">Načítavam…</p></div>
      <div class="modal-actions"><button class="btn-ghost" data-close>Zavrieť</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("[data-close]").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  const body = overlay.querySelector(".visits-body");
  try {
    const { days } = await fetchJson("/api/stats/visits?days=30");
    const sum = (list, key) => list.reduce((s, d) => s + (d[key] || 0), 0);
    const merge = (list, key) => {
      const out = {};
      for (const d of list) for (const [k, v] of Object.entries(d[key] || {})) out[k] = (out[k] || 0) + v;
      return Object.entries(out).sort((a, b) => b[1] - a[1]);
    };
    const today = days.slice(0, 1), week = days.slice(0, 7);
    const card = (label, visitors, views) =>
      `<div class="monthly-stat"><span>${label}</span><b>${visitors}</b><small class="muted">${views} ${views === 1 ? "zobrazenie" : views >= 2 && views <= 4 ? "zobrazenia" : "zobrazení"}</small></div>`;
    const rows = (entries, labels, total) =>
      entries.length
        ? entries.map(([k, v]) => `
          <div class="market-breakdown-row">
            <div class="market-breakdown-label"><span>${escapeHtml(labels[k] || k)}</span><span>${v}</span></div>
            <div class="market-breakdown-bar"><div class="market-breakdown-bar-fill" style="width:${total ? Math.round((v / total) * 100) : 0}%"></div></div>
          </div>`).join("")
        : `<p class="muted small">Zatiaľ nič.</p>`;
    const sources = merge(days, "sources"), clicks = merge(days, "clicks");
    const maxDay = Math.max(1, ...days.slice(0, 14).map((d) => d.visitors));
    body.innerHTML = `
      <div class="monthly-grid">
        ${card("Dnes", sum(today, "visitors"), sum(today, "views"))}
        ${card("7 dní", sum(week, "visitors"), sum(week, "views"))}
        ${card("30 dní", sum(days, "visitors"), sum(days, "views"))}
      </div>
      <div class="market-breakdown-title">Posledných 14 dní (návštevníci)</div>
      <div class="visits-days">
        ${days.slice(0, 14).reverse().map((d) => `
          <div class="visits-day" title="${d.day}: ${d.visitors} návštevníkov, ${d.views} zobrazení">
            <i style="height:${Math.round((d.visitors / maxDay) * 100)}%"></i>
            <span>${Number(d.day.slice(8, 10))}.</span>
          </div>`).join("")}
      </div>
      <div class="market-breakdown-title">Odkiaľ prišli (30 dní)</div>
      ${rows(sources, VISIT_SOURCE_LABELS, sources.reduce((s, e) => s + e[1], 0))}
      <div class="market-breakdown-title" style="margin-top:14px">Kliknutia (30 dní)</div>
      ${rows(clicks, VISIT_CLICK_LABELS, Math.max(1, ...clicks.map((e) => e[1])))}
      <p class="muted small" style="margin-top:12px">Tip: do odkazu v bio na Instagrame dajte <b>tipradar.eu/?utm_source=instagram</b>, potom sa zdroj započíta presne aj z aplikácie Instagramu.</p>`;
  } catch (err) {
    body.innerHTML = `<p class="empty-state">Návštevnosť sa nepodarilo načítať: ${escapeHtml(err.message || String(err))}</p>`;
  }
}
document.getElementById("openVisitsBtn").addEventListener("click", () => openVisits());

// ---- Denné vyhodnotenie (všetky tipy a tikety dňa naraz do Telegramu) ----
/** Deň, za ktorý sa posiela vyhodnotenie: dnes, po polnoci (do 6:00) ešte včerajšok. */
function dailyResultsDay() {
  const d = new Date();
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

dailyResultsBtn.addEventListener("click", async () => {
  const target = await askTelegramTarget();
  if (!target) return;
  const day = dailyResultsDay();
  dailyResultsBtn.disabled = true;
  try {
    let res = await fetchJson("/api/telegram/daily-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, day }),
    });
    if (res && res.pendingCount > 0) {
      const ok = window.confirm(
        `${res.pendingCount} ${res.pendingCount === 1 ? "tip sa ešte hrá" : res.pendingCount < 5 ? "tipy sa ešte hrajú" : "tipov sa ešte hrá"}. Poslať vyhodnotenie aj tak? (Nedohrané budú označené ⏳.)`
      );
      if (!ok) return;
      res = await fetchJson("/api/telegram/daily-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, day, force: true }),
      });
    }
    if (res && res.empty) {
      showToast("Pre dnešok nie sú v histórii žiadne tipy ani tikety.");
    } else if (res && res.ok) {
      showToast("Denné vyhodnotenie odoslané.");
      if (lastRenderedTips) openTipsHistory();
    } else {
      showToast("Nepodarilo sa odoslať – skontroluj nastavenie Telegramu.");
    }
  } catch (err) {
    showToast(`Odoslanie zlyhalo: ${err.message}`);
  } finally {
    dailyResultsBtn.disabled = false;
  }
});


// ---- Tipy dňa: všetky odporúčané tipy zo všetkých zápasov dňa, zoradené od najvyššej dôvery ----
const dayTipsBtn = document.getElementById("dayTipsBtn");
let dayTipsItems = [];
let dayTipsInfo = { analyzed: 0, failed: 0 };

function kickoffTime(fixture) {
  const d = new Date(fixture?.date);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
}

async function showDayTips() {
  const viewId = ++analysisViewId;
  const fixtures = currentFixtures.filter((f) => !matchHasStarted(f));
  if (fixtures.length === 0) {
    analysisColumnEl.innerHTML = `<div class="empty-state">V tento deň už nie sú žiadne zápasy pred výkopom.</div>`;
    return;
  }
  dayTipsBtn.disabled = true;
  const items = [];
  let done = 0;
  let failed = 0;
  const progress = () => {
    if (viewId !== analysisViewId) return; // používateľ medzitým otvoril niečo iné
    analysisColumnEl.innerHTML = `<div class="empty-state">Analyzujem zápasy dňa… ${done} / ${fixtures.length}<br><span class="muted small">Prvé načítanie chvíľu trvá, ďalšie sú rýchle.</span></div>`;
  };
  progress();
  const queue = fixtures.slice();
  // Zápasy analyzujeme jeden po druhom - šetrne k limitu požiadaviek API,
  // aby boli výsledky pri každom načítaní rovnaké a úplné.
  const worker = async () => {
    while (queue.length > 0) {
      const f = queue.shift();
      try {
        const r = await fetchJson("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fixture: f, leagueId: f.league.id, season: f.league.season }),
        });
        for (const bet of r?.bestBets || []) items.push({ r, bet });
      } catch {
        failed++;
      }
      done++;
      progress();
    }
  };
  try {
    await worker();
    items.sort((a, b) => b.bet.probability - a.bet.probability);
    dayTipsItems = items;
    dayTipsInfo = { analyzed: fixtures.length, failed };
    if (viewId !== analysisViewId) return; // zoznam je pripravený, ale nezobrazíme ho cez iný výber
    renderDayTips();
  } finally {
    dayTipsBtn.disabled = false;
  }
}

function renderDayTips() {
  // Kandidát na silný tip dňa: najvyššia dôvera (aspoň 70 %), pri zhode vyšší kurz, potom skorší výkop – rovnako ako na serveri.
  let strongIdx = -1;
  dayTipsItems.forEach(({ r, bet }, i) => {
    if (typeof bet.probability !== "number" || bet.probability < STRONG_TIP_MIN_PROBABILITY) return;
    if (strongIdx < 0) { strongIdx = i; return; }
    const cur = dayTipsItems[strongIdx];
    const a = [bet.probability, bet.odds ?? 0, -new Date(r.fixture.date).getTime()];
    const b = [cur.bet.probability, cur.bet.odds ?? 0, -new Date(cur.r.fixture.date).getTime()];
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) { if (a[k] > b[k]) strongIdx = i; return; }
  });
  const dateLabel = (() => {
    const [y, m, d] = (matchDateInput.value || "").split("-").map(Number);
    return y ? `${d}. ${m}. ${y}` : "";
  })();
  const rows = dayTipsItems
    .map(({ r, bet }, i) => {
      const f = r.fixture;
      const warn = bet.valueWarning
        ? `<div class="muted small" style="color:var(--gold);">⚠️ ${escapeHtml(bet.valueWarning)}</div>`
        : "";
      return `
      <div class="day-tip">
        <div class="day-tip-rank">${i + 1}.</div>
        <div class="day-tip-main">
          <button class="day-tip-match" data-open="${i}" title="Otvoriť detail zápasu">
            <span class="muted">${escapeHtml(kickoffTime(f))}</span> ${escapeHtml(translateTeamName(f.homeTeam.name))} — ${escapeHtml(
              translateTeamName(f.awayTeam.name)
            )}
          </button>
          <div class="day-tip-bet">${escapeHtml(bet.market)}: <strong>${escapeHtml(
            translateNamesInText(bet.selection, f.homeTeam.name, f.awayTeam.name)
          )}</strong></div>
          <div class="muted small">Dôvera <strong>${bet.probability.toFixed(0)} %</strong>${betOddsHtml(bet)}${i === strongIdx ? STRONG_OF_DAY_BADGE : ""}</div>
          ${warn}
        </div>
        <div class="day-tip-actions">
          <button class="btn-primary btn-mini" data-save="${i}">Uložiť</button>
          <button class="btn-ghost btn-mini" data-ticket="${i}">+ Do tiketu</button>
        </div>
      </div>`;
    })
    .join("");

  analysisColumnEl.innerHTML = `
    <div class="league-name">Tipy dňa${dateLabel ? " · " + dateLabel : ""}</div>
    <h2 style="margin: 4px 0 6px;">Všetky odporúčané tipy</h2>
    <p class="muted small" style="margin: 0 0 16px;">
      ${plural(dayTipsItems.length, "tip", "tipy", "tipov")} · analyzované: ${plural(dayTipsInfo.analyzed, "zápas", "zápasy", "zápasov")} pred výkopom · zoradené od najvyššej dôvery${
        dayTipsInfo.failed ? ` · ${dayTipsInfo.failed} sa nepodarilo analyzovať` : ""
      }
    </p>
    ${rows || `<div class="empty-state">V tento deň nie je žiadny tip, ktorý by prešiel pravidlami (68–80 % a kontrola kurzu).</div>`}
  `;

  analysisColumnEl.querySelectorAll("[data-open]").forEach((btn) => {
    btn.onclick = () => {
      const item = dayTipsItems[Number(btn.dataset.open)];
      if (!item) return;
      ++analysisViewId;
      currentAnalysis = item.r;
      try {
        renderAnalysis(item.r);
      } finally {
        // Tlačidlo späť na zoznam - vždy, aj keby sa detail nepodarilo vykresliť.
        const back = document.createElement("button");
        back.className = "btn-ghost btn-mini";
        back.textContent = "‹ Späť na tipy dňa";
        back.style.marginBottom = "12px";
        back.onclick = () => { ++analysisViewId; renderDayTips(); };
        analysisColumnEl.prepend(back);
        analysisColumnEl.scrollTop = 0;
      }
    };
  });

  analysisColumnEl.querySelectorAll("[data-save]").forEach((btn) => {
    btn.onclick = async () => {
      const item = dayTipsItems[Number(btn.dataset.save)];
      if (!item) return;
      const { r, bet } = item;
      if (matchHasStarted(r.fixture)) {
        showToast(MATCH_STARTED_TEXT);
        return;
      }
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
        market: bet.market,
        selection: bet.selection,
        probability: bet.probability,
        odds: bet.odds ?? null,
        savedAt: new Date().toISOString(),
        status: "pending",
      };
      btn.disabled = true;
      try {
        await fetchJson("/api/tips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tip),
        });
        btn.textContent = "✓ Uložené";
        await maybeOfferTelegram(tip.id);
      } catch (err) {
        showToast(`Uloženie zlyhalo: ${err?.message ?? String(err)}`);
        btn.disabled = false;
      }
    };
  });

  analysisColumnEl.querySelectorAll("[data-ticket]").forEach((btn) => {
    btn.onclick = () => {
      const item = dayTipsItems[Number(btn.dataset.ticket)];
      if (!item) return;
      const { r, bet } = item;
      if (matchHasStarted(r.fixture)) {
        showToast(MATCH_STARTED_TEXT);
        return;
      }
      const id = `${r.fixture.fixtureId}-${bet.market}-${bet.selection}`;
      if (ticketItems.some((t) => t.id === id)) {
        btn.textContent = "✓ Už v tikete";
        return;
      }
      ticketItems.push({
        id,
        fixtureId: r.fixture.fixtureId,
        leagueId: r.fixture.league.id,
        season: r.fixture.league.season,
        homeTeam: r.fixture.homeTeam.name,
        awayTeam: r.fixture.awayTeam.name,
        matchDate: r.fixture.date,
        market: bet.market,
        selection: bet.selection,
        probability: bet.probability,
        odds: bet.odds ?? null,
      });
      updateTicketCount();
      btn.textContent = "✓ V tikete";
    };
  });
}

dayTipsBtn.addEventListener("click", () => showDayTips());


// ---- Doplnenie odohraného tipu (tip poslaný klientom, ktorý v TipRadare chýba) ----
const manualTipModal = document.getElementById("manualTipModal");
const mt = (id) => document.getElementById(id);

document.getElementById("manualTipBtn").addEventListener("click", () => {
  const today = new Date();
  today.setDate(today.getDate() - 1);
  const pad = (n) => String(n).padStart(2, "0");
  if (!mt("mtDate").value) mt("mtDate").value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  mt("mtMsg").textContent = "";
  manualTipModal.hidden = false;
});
document.getElementById("mtCloseBtn").addEventListener("click", () => {
  manualTipModal.hidden = true;
  openTipsHistory();
});
document.getElementById("mtSaveBtn").addEventListener("click", async () => {
  const date = mt("mtDate").value;
  const home = mt("mtHome").value.trim();
  const away = mt("mtAway").value.trim();
  const selection = mt("mtSelection").value.trim();
  const odds = parseFloat(String(mt("mtOdds").value).replace(",", "."));
  const probInput = parseFloat(String(mt("mtProb").value).replace(",", ".").replace("%", ""));
  if (!date || !home || !away || !selection) {
    mt("mtMsg").textContent = "Vyplň dátum, oba tímy a tip.";
    return;
  }
  if (!(odds > 1)) {
    mt("mtMsg").textContent = "Zadaj kurz väčší ako 1 (napr. 1,67).";
    return;
  }
  const kickoff = new Date(`${date}T${mt("mtTime").value || "12:00"}:00`);
  if (kickoff.getTime() > Date.now()) {
    mt("mtMsg").textContent = "Tento formulár je len pre odohrané zápasy. Tipy pred zápasom ukladaj z analýzy zápasu.";
    return;
  }
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
    market: mt("mtMarket").value,
    selection,
    probability,
    odds: Math.round(odds * 100) / 100,
    manualEntry: true,
    savedAt: new Date().toISOString(),
    status: mt("mtResult").value,
  };
  const btn = document.getElementById("mtSaveBtn");
  btn.disabled = true;
  try {
    await fetchJson("/api/tips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tip),
    });
    mt("mtMsg").textContent = `✓ Uložené: ${home} – ${away}, ${tip.market}: ${selection}. Môžeš pridať ďalší tip.`;
    mt("mtHome").value = "";
    mt("mtAway").value = "";
    mt("mtSelection").value = "";
    mt("mtOdds").value = "";
    mt("mtProb").value = "";
  } catch (err) {
    mt("mtMsg").textContent = `Uloženie zlyhalo: ${err?.message ?? String(err)}`;
  } finally {
    btn.disabled = false;
  }
});


// ---- Skrývanie tipov v histórii (archív) ----
let currentHistoryTips = [];
let showArchivedTips = false;

function wireArchivedToggle() {
  const btn = document.getElementById("toggleArchivedBtn");
  if (btn) btn.onclick = () => {
    showArchivedTips = !showArchivedTips;
    renderTipsList(currentHistoryTips);
  };
}

async function setArchived(id, archived) {
  await fetchJson(`/api/tips/${encodeURIComponent(id)}/archive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived }),
  });
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
  const toHide = currentHistoryTips.filter((t) => !t.archived && t.status !== "pending");
  if (toHide.length === 0) {
    showToast("Nie sú žiadne vyhodnotené tipy na skrytie.");
    return;
  }
  const ok = window.confirm(
    `Skryť ${plural(toHide.length, "vyhodnotený tip", "vyhodnotené tipy", "vyhodnotených tipov")} z histórie?\n\nNa prezentačnej stránke aj v štatistikách ostanú. Čakajúce tipy ostanú viditeľné.`
  );
  if (!ok) return;
  for (const t of toHide) {
    try {
      await setArchived(t.id, true);
    } catch {
      /* pokračujeme s ďalšími */
    }
  }
  showToast("Vyhodnotené tipy sú skryté.");
  openTipsHistory();
}

document.getElementById("archiveResolvedBtn").addEventListener("click", () => archiveAllResolved());


// ---- Oprava tipu v histórii (výsledok, kurz, pri tikete výsledky zápasov) ----
const STATUS_OPTIONS = [
  ["won", "✓ Vyšiel"],
  ["lost", "✗ Nevyšiel"],
  ["void", "↩ Vrátený"],
  ["pending", "⏳ Čaká"],
];
function statusSelect(id, value) {
  return `<select id="${id}" class="edit-select">${STATUS_OPTIONS.map(
    ([v, l]) => `<option value="${v}"${v === value ? " selected" : ""}>${l}</option>`
  ).join("")}</select>`;
}
function ticketStatusFrom(statuses) {
  if (statuses.includes("lost")) return "lost";
  if (statuses.includes("pending")) return "pending";
  if (statuses.every((x) => x === "void")) return "void";
  return "won";
}
const STATUS_TEXT = { won: "✓ Vyšiel", lost: "✗ Nevyšiel", void: "↩ Vrátený", pending: "⏳ Čaká" };

function openEditTip(tip) {
  let overlay = document.getElementById("editTipModal");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "editTipModal";
    document.body.appendChild(overlay);
  }
  const isTicket = Array.isArray(tip.legs) && tip.legs.length > 0;
  const title = isTicket
    ? `🎫 Tiket (${plural(tip.legs.length, "zápas", "zápasy", "zápasov")})`
    : `${escapeHtml(translateTeamName(tip.homeTeam))} — ${escapeHtml(translateTeamName(tip.awayTeam))}`;
  const legsHtml = isTicket
    ? tip.legs
        .map(
          (l, i) => `<div class="edit-leg">
            <div class="edit-leg-name">${escapeHtml(translateTeamName(l.homeTeam))} — ${escapeHtml(translateTeamName(l.awayTeam))}<br><span class="muted small">${escapeHtml(
              l.market
            )}: ${escapeHtml(translateNamesInText(l.selection, l.homeTeam, l.awayTeam))}</span></div>
            ${statusSelect("editLeg" + i, l.status)}
          </div>`
        )
        .join("")
    : "";
  overlay.innerHTML = `
    <div class="modal">
      <h3>Upraviť tip</h3>
      <p class="muted small" style="margin:-4px 0 12px;">${title}${
        isTicket ? "" : `<br>${escapeHtml(tip.market)}: ${escapeHtml(translateNamesInText(tip.selection, tip.homeTeam, tip.awayTeam))}`
      }</p>
      ${
        isTicket
          ? `<div class="edit-legs">${legsHtml}</div>
             <p class="small" style="margin:10px 0 0;">Výsledok tiketu: <strong id="editTicketStatus"></strong> <span class="muted">(vypočíta sa zo zápasov)</span></p>`
          : `<label class="edit-row">Výsledok ${statusSelect("editStatus", tip.status)}</label>`
      }
      <label class="edit-row">Kurz <input type="text" id="editOdds" inputmode="decimal" value="${
        typeof tip.odds === "number" && tip.odds > 1 ? String(tip.odds).replace(".", ",") : ""
      }" placeholder="napr. 1,75" /></label>
      <p class="muted small" id="editMsg" style="min-height:1.4em;"></p>
      <div class="modal-actions">
        <button class="btn-ghost" id="editCancelBtn">Zrušiť</button>
        <button class="btn-primary" id="editSaveBtn">Uložiť opravu</button>
      </div>
    </div>`;
  overlay.hidden = false;
  const $e = (id) => document.getElementById(id);
  const legStatuses = () => (isTicket ? tip.legs.map((_, i) => $e("editLeg" + i).value) : []);
  const refreshTicket = () => {
    if (isTicket) $e("editTicketStatus").textContent = STATUS_TEXT[ticketStatusFrom(legStatuses())];
  };
  if (isTicket) tip.legs.forEach((_, i) => $e("editLeg" + i).addEventListener("change", refreshTicket));
  refreshTicket();
  $e("editCancelBtn").onclick = () => {
    overlay.hidden = true;
  };
  $e("editSaveBtn").onclick = async () => {
    const oddsText = String($e("editOdds").value).trim().replace(",", ".");
    const odds = oddsText === "" ? null : parseFloat(oddsText);
    if (odds !== null && !(odds > 1)) {
      $e("editMsg").textContent = "Kurz musí byť číslo väčšie ako 1 (napr. 1,75), alebo nechaj políčko prázdne.";
      return;
    }
    const edit = { odds };
    if (isTicket) edit.legs = legStatuses().map((status) => ({ status }));
    else edit.status = $e("editStatus").value;
    $e("editSaveBtn").disabled = true;
    try {
      await fetchJson(`/api/tips/${encodeURIComponent(tip.id)}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit),
      });
      overlay.hidden = true;
      showToast("Tip upravený.");
      openTipsHistory();
    } catch (err) {
      $e("editMsg").textContent = `Uloženie zlyhalo: ${err?.message ?? String(err)}`;
      $e("editSaveBtn").disabled = false;
    }
  };
}


// ---- Spätný test modelu ----
const backtestModal = document.getElementById("backtestModal");
let btPollTimer = null;

function btDefaults() {
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const to = new Date(); to.setDate(to.getDate() - 1);
  const from = new Date(); from.setDate(from.getDate() - 21);
  if (!document.getElementById("btFrom").value) document.getElementById("btFrom").value = iso(from);
  if (!document.getElementById("btTo").value) document.getElementById("btTo").value = iso(to);
  if (!document.getElementById("btSeason").value) document.getElementById("btSeason").value = seasonInput.value;
}
function btCost() {
  const n = parseInt(document.getElementById("btMax").value, 10) || 60;
  document.getElementById("btCost").textContent =
    `Odhad: ${n} zápasov ≈ ${n * 15}–${n * 25} požiadaviek na API pri prvom behu (opakované zápasy a tímy sú rýchlejšie). Test beží na serveri, okno môžeš zavrieť a vrátiť sa neskôr.`;
}

async function openBacktest() {
  backtestModal.hidden = false;
  btDefaults(); btCost();
  try {
    const leagues = await fetchJson("/api/leagues");
    document.getElementById("btLeagues").innerHTML = leagues
      .map((l) => `<label><input type="checkbox" value="${l.id}" checked /> ${escapeHtml(translateLeagueName(l.name))}</label>`)
      .join("");
  } catch {
    document.getElementById("btLeagues").innerHTML = `<span class="muted small">Ligy sa nepodarilo načítať.</span>`;
  }
  const last = localStorage.getItem("tipradar-backtest-job");
  if (last) pollBacktest(last);
}

function pct(v) { return v == null ? "–" : `${fmtNum(v, 0)} %`; }
function diffCell(pred, real) {
  if (pred == null || real == null) return `<td class="num">–</td>`;
  const d = real - pred;
  const cls = Math.abs(d) < 5 ? "bt-good" : d < 0 ? "bt-bad" : "";
  return `<td class="num ${cls}">${d > 0 ? "+" : d < 0 ? "−" : ""}${fmtNum(Math.abs(d), 0)} b.</td>`;
}

let btLastJob = null;
function renderBacktest(job) {
  btLastJob = job;
  const r = job.report;
  const p = job.progress || { done: 0, total: 0 };
  const running = job.status === "running";
  document.getElementById("btProgress").innerHTML = running
    ? `Prebieha test: ${p.done} / ${p.total || "?"} zápasov…<div class="bt-bar"><i style="width:${p.total ? (p.done / p.total) * 100 : 3}%"></i></div>`
    : job.status === "error"
      ? `Test zlyhal: ${escapeHtml(job.error || "")}`
      : `Hotovo – ${r ? r.fixturesAnalyzed : 0} zápasov${r && r.fixturesFailed ? `, ${r.fixturesFailed} sa nepodarilo spracovať` : ""}.`;
  document.getElementById("btStartBtn").disabled = running;
  const canExport = job.status === "done" && !!(r && r.samples);
  document.getElementById("btCopyBtn").hidden = !canExport;
  document.getElementById("btImgBtn").hidden = !canExport;
  if (!r || !r.samples) { document.getElementById("btReport").innerHTML = running ? "" : `<p class="muted">Pre zvolené obdobie a ligy sa nenašli žiadne vyhodnotiteľné zápasy.</p>`; return; }

  const b = r.bandOverall;
  const summary = b.count
    ? `<div class="bt-summary">Tipy v pásme 68 – 80 % (tie, ktoré by appka odporučila): <strong>${b.count}</strong>, model v priemere <strong>${pct(b.avgPredicted)}</strong>, reálne vyšlo <strong class="${b.hitRate < b.avgPredicted - 5 ? "bt-bad" : "bt-good"}">${pct(b.hitRate)}</strong>.</div>`
    : "";
  const buckets = r.buckets.filter((x) => x.count > 0).map((x) =>
    `<tr><td>${x.label}</td><td class="num">${x.count}</td><td class="num">${pct(x.avgPredicted)}</td><td class="num">${pct(x.hitRate)}</td>${diffCell(x.avgPredicted, x.hitRate)}</tr>`).join("");
  const markets = r.markets.map((m) =>
    `<tr><td>${escapeHtml(m.market)}</td><td class="num">${m.count}</td><td class="num">${pct(m.avgPredicted)}</td><td class="num">${pct(m.hitRate)}</td>${diffCell(m.avgPredicted, m.hitRate)}<td class="num">${m.inBand.count ? `${pct(m.inBand.hitRate)} <span class="muted">(${m.inBand.count})</span>` : "–"}</td></tr>`).join("");
  document.getElementById("btReport").innerHTML = `
    ${summary}
    <h4 style="margin:14px 0 0;">Podľa dôvery modelu</h4>
    <table class="bt-table"><thead><tr><th>Pásmo</th><th class="num">Tipov</th><th class="num">Model</th><th class="num">Realita</th><th class="num">Rozdiel</th></tr></thead><tbody>${buckets}</tbody></table>
    <h4 style="margin:4px 0 0;">Podľa trhov</h4>
    <table class="bt-table"><thead><tr><th>Trh</th><th class="num">Tipov</th><th class="num">Model</th><th class="num">Realita</th><th class="num">Rozdiel</th><th class="num">V pásme 68–80 %</th></tr></thead><tbody>${markets}</tbody></table>
    <p class="muted small">Rozdiel = realita mínus predpoveď v percentuálnych bodoch. Zelená: model sedí (do ±5 b.). Červená: model <strong>preceňuje</strong> – tipy vychádzajú menej často, než hovorí. Pri menej ako ~50 tipoch v riadku berte čísla len orientačne.</p>
    ${renderBacktestComparison(r, job.reportLegacy)}
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
    <h4 style="margin:18px 0 0;">Vplyv chýbajúcich hráčov</h4>
    <div class="bt-summary">Zápasy, kde niekto chýbal (zranenie, trest): <strong>${a.fixtures}</strong>. Tipy v pásme bez zohľadnenia: <strong>${ob.count}</strong>, vyšlo <strong>${pct(ob.hitRate)}</strong> · so zohľadnením: <strong>${wb.count}</strong>, vyšlo <strong>${pct(wb.hitRate)}</strong>.</div>
    <table class="bt-table"><thead><tr><th>Trh</th><th class="num">Tipov</th><th class="num">Chyba – bez</th><th class="num">Chyba – s chýbajúcimi</th><th class="num">V pásme – bez</th><th class="num">V pásme – s</th></tr></thead><tbody>${rows}</tbody></table>
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
  const set = o.settings.map((r) => {
    const label = `${r.lo}–${r.hi} %, min. ${r.minGames} ${r.minGames >= 5 ? "zápasov" : "zápasy"}`;
    const tag = r.current ? ' <span class="muted">(teraz)</span>' : r.best ? ' <strong class="bt-good">← najlepšie</strong>' : "";
    return `<tr${r.best ? ' style="background:rgba(127,191,154,.08)"' : ""}><td>${label}${tag}</td><td class="num">${r.count}</td><td class="num">${pct(r.avgPredicted)}</td><td class="num">${pct(r.hitRate)}</td>${diffCell(r.avgPredicted, r.hitRate)}</tr>`;
  }).join("");
  const best = o.settings.find((r) => r.best);
  const mk = o.marketsInBest.map((m) =>
    `<tr><td>${escapeHtml(m.market)}</td><td class="num">${m.count}</td><td class="num ${m.hitRate >= 66.7 ? "bt-good" : "bt-bad"}">${pct(m.hitRate)}</td></tr>`).join("");
  return `
    <h4 style="margin:18px 0 0;">Hľadanie najlepšieho nastavenia</h4>
    <p class="muted small">1. krok: pre každý trh koeficient kalibrácie k, pri ktorom percentá modelu najlepšie sedia s realitou (1,00 = bez úpravy, nižšie = model je opatrnejší). Zelená: zmena by model spresnila.</p>
    <table class="bt-table"><thead><tr><th>Trh</th><th class="num">Tipov</th><th class="num">k teraz</th><th class="num">k najlepšie</th><th class="num">Chyba teraz</th><th class="num">Chyba najlepšie</th><th class="num">Model → realita</th></tr></thead><tbody>${cal}</tbody></table>
    <p class="muted small">2. krok: s najlepšou kalibráciou všetky kombinácie pásma dôvery a minimálneho počtu odohraných zápasov. Najlepšie = najvyššia úspešnosť pri aspoň polovici tipov oproti terajšku.</p>
    <table class="bt-table"><thead><tr><th>Nastavenie</th><th class="num">Tipov</th><th class="num">Model</th><th class="num">Realita</th><th class="num">Rozdiel</th></tr></thead><tbody>${set}</tbody></table>
    ${best && mk ? `<p class="muted small">Trhy v najlepšom nastavení (${best.lo}–${best.hi} %). Pri kurze 1,50 je tip v zisku od úspešnosti 66,7 % – červené trhy by pri takých kurzoch prerábali.</p>
    <table class="bt-table"><thead><tr><th>Trh</th><th class="num">Tipov</th><th class="num">Vyšlo</th></tr></thead><tbody>${mk}</tbody></table>` : ""}
    <p class="muted small"><strong>Pozor:</strong> nastavenie nájdené na jednom období môže sedieť len náhodou. Zmenu sa oplatí urobiť, až keď podobné čísla vyjdú aj na inom období (napr. aug. – okt. 2024 a mar. – máj 2025).</p>`;
}

/** Porovnanie nového modelu s pôvodným (do 5. 10. 2026) na tých istých zápasoch. */
function renderBacktestComparison(r, old) {
  if (!old || !old.samples) return "";
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
    <h4 style="margin:14px 0 0;">Nový model oproti pôvodnému (tie isté zápasy)</h4>
    <div class="bt-summary">Pásmo 68 – 80 %: pôvodný model <strong>${ob.count}</strong> tipov, vyšlo <strong>${pct(ob.hitRate)}</strong> · nový model <strong>${nb.count}</strong> tipov, vyšlo <strong>${pct(nb.hitRate)}</strong>.</div>
    <table class="bt-table"><thead><tr><th>Trh</th><th class="num">Model → realita – pôvodný</th><th class="num">Model → realita – nový</th><th class="num">Chyba – pôvodný</th><th class="num">Chyba – nový</th><th class="num">V pásme – pôvodný</th><th class="num">V pásme – nový</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted small">Chyba = ako ďaleko boli percentá modelu od skutočnosti (Brierovo skóre × 100). <strong>Nižšia je lepšia.</strong> Zelená: nový model je presnejší, červená: horší. Nový model = forma z gólov + kalibrácia striel, faulov, rohov a kariet (celá sezóna) a gólov a kariet navyše na začiatku sezóny. Kalibrácia (6. 10. 2026) vznikla z testov aug. – okt. 2024 a mar. – máj 2025 – na poctivé overenie testuj iné obdobie, napr. aug. – dec. 2023 (sezóna 2023).</p>`;
}

async function pollBacktest(id) {
  clearTimeout(btPollTimer);
  try {
    const job = await fetchJson(`/api/backtest/${encodeURIComponent(id)}`);
    renderBacktest(job);
    if (job.status === "running") btPollTimer = setTimeout(() => pollBacktest(id), 3000);
  } catch {
    localStorage.removeItem("tipradar-backtest-job");
    document.getElementById("btProgress").textContent = "";
    document.getElementById("btStartBtn").disabled = false;
  }
}

document.getElementById("openBacktestBtn").addEventListener("click", openBacktest);

/** Hlavička exportu: obdobie, sezóna, počet zápasov. */
function btExportTitle() {
  const p = (btLastJob && btLastJob.params) || {};
  const r = btLastJob && btLastJob.report;
  return `TipRadar – spätný test ${p.from || ""} až ${p.to || ""}, sezóna ${p.season || ""}, ${r ? r.fixturesAnalyzed : 0} zápasov`;
}

document.getElementById("btCopyBtn").addEventListener("click", async () => {
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
});

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

document.getElementById("btImgBtn").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = "Ukladám…";
  // celý výsledok (bez rolovania) do jedného širokého obrázka
  const box = document.createElement("div");
  box.style.cssText = "position:absolute;left:-10000px;top:0;width:1200px;padding:28px;background:#141416;color:#EDE6D6;";
  box.innerHTML = `<h3 style="margin:0 0 12px;font-size:20px;">${escapeHtml(btExportTitle())}</h3>${document.getElementById("btReport").innerHTML}`;
  document.body.appendChild(box);
  try {
    const h2c = await loadHtml2canvas();
    const canvas = await h2c(box, { backgroundColor: "#141416", scale: 1.5 });
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
});
document.getElementById("btCloseBtn").addEventListener("click", () => { backtestModal.hidden = true; clearTimeout(btPollTimer); });
document.getElementById("btMax").addEventListener("input", btCost);
document.getElementById("btStartBtn").addEventListener("click", async () => {
  const leagueIds = Array.from(document.querySelectorAll("#btLeagues input:checked")).map((i) => Number(i.value));
  if (!leagueIds.length) { showToast("Vyber aspoň jednu ligu."); return; }
  try {
    const job = await fetchJson("/api/backtest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leagueIds,
        season: parseInt(document.getElementById("btSeason").value, 10),
        from: document.getElementById("btFrom").value,
        to: document.getElementById("btTo").value,
        maxFixtures: parseInt(document.getElementById("btMax").value, 10) || 60,
      }),
    });
    localStorage.setItem("tipradar-backtest-job", job.id);
    pollBacktest(job.id);
  } catch (err) {
    showToast(`Test sa nepodarilo spustiť: ${err.message}`);
  }
});


// ---- Uzatvárací kurz (CLV): bol kurz pri zverejnení tipu lepší ako tesne pred výkopom? ----
async function renderClvSummary() {
  const el = document.getElementById("clvSummary");
  if (!el) return;
  try {
    const d = await fetchJson("/api/clv/summary");
    if (!d || (!d.total && !d.pending)) { el.textContent = ""; return; }
    const sign = (v) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1).replace(".", ",") + " %";
    let t = `Uzatvárací kurz: `;
    if (d.total) {
      t += `pri <strong>${d.beat} z ${d.total}</strong> tipov kurz do výkopu klesol (trh sa posunul k nášmu tipu), pri ${d.worse} stúpol. `;
      t += `Priemerne sme mali o <strong class="${d.avgClv >= 0 ? "text-success" : "text-danger"}">${sign(d.avgClv)}</strong> lepší kurz ako tesne pred zápasom.`;
      const markets = (d.byMarket || []).filter((m) => m.total >= 3);
      if (markets.length) t += ` Podľa trhov: ${markets.map((m) => `${escapeHtml(m.market)} ${sign(m.avgClv)} (${m.total})`).join(", ")}.`;
    } else {
      t += `zatiaľ žiadny tip so zisteným kurzom tesne pred výkopom.`;
    }
    if (d.pending) t += ` Čaká: ${d.pending}.`;
    el.innerHTML = t;
    el.title = "Ak je kurz pri zverejnení tipu dlhodobo vyšší ako tesne pred výkopom, model predbieha stávkovky – to je spoľahlivejší znak kvality ako samotná úspešnosť pri malom počte tipov.";
  } catch {
    el.textContent = "";
  }
}

// ---- Tichá evidencia tipov vyradených pre rozpor so stávkovkami ----
async function renderShadowSummary() {
  const el = document.getElementById("shadowSummary");
  if (!el) return;
  try {
    const d = await fetchJson("/api/shadow/summary");
    if (!d) { el.textContent = ""; return; }
    if (!d.settled) {
      el.innerHTML = d.total
        ? `Tichá evidencia vyradených tipov (rozpor so stávkovkami): ${d.total} zapísaných, zatiaľ žiadny vyhodnotený.`
        : "";
      return;
    }
    const pct = (v) => (v == null ? "–" : `${Math.round(v)} %`);
    let t = `Tichá evidencia vyradených tipov (rozpor so stávkovkami): <strong>${d.won} z ${d.settled}</strong> vyšlo (<strong>${pct(d.hitRate)}</strong>), model im dával v priemere ${pct(d.avgModel)}, stávkovky ${pct(d.avgMarket)}.`;
    if (d.withOdds) t += ` Keby sa stavili: <strong class="${d.profit >= 0 ? "text-success" : "text-danger"}">${d.profit >= 0 ? "+" : "−"}${Math.abs(d.profit).toFixed(1).replace(".", ",")} j.</strong>`;
    if (d.pending) t += ` Čaká: ${d.pending}.`;
    el.innerHTML = t;
  } catch {
    el.textContent = "";
  }
}


// ---- Tiché sledovanie tiketu dňa (2 zápasy, kurz spolu aspoň 2,00) ----
async function renderTicketWatch() {
  const el = document.getElementById("ticketWatchSummary");
  if (!el) return;
  try {
    const d = await fetchJson("/api/ticket-watch/summary");
    if (!d || !d.total) {
      el.innerHTML = d && d.candidates
        ? `Tiché sledovanie tiketu dňa: ${d.candidates} vhodných tipov zapísaných, zatiaľ z nich nevznikol žiadny tiket.`
        : "";
      return;
    }
    const num = (v, k = 2) => Number(v).toFixed(k).replace(".", ",");
    const sign = (v) => (v >= 0 ? "+" : "−") + num(Math.abs(v), 1);
    let t = `Tiché sledovanie tiketu dňa (2 zápasy, kurz spolu aspoň 2,00): `;
    if (d.settled) {
      t += `<strong>${d.won} z ${d.settled}</strong> tiketov vyšlo (<strong>${Math.round(d.hitRate)} %</strong>), priemerný kurz ${num(d.avgOdds)}. `;
      t += `Keby sa stavili: <strong class="${d.profit >= 0 ? "text-success" : "text-danger"}">${sign(d.profit)} j.</strong> (ROI ${sign(d.roi)} %).`;
    } else {
      t += `${d.total} ${d.total === 1 ? "tiket" : d.total <= 4 ? "tikety" : "tiketov"}, zatiaľ žiadny vyhodnotený.`;
    }
    if (d.pending) t += ` Čaká: ${d.pending}.`;
    const icon = { won: "✓", lost: "✕", void: "↺", pending: "…" };
    const day = (k) => { const [y, m, dd] = k.split("-").map(Number); return `${dd}. ${m}. ${y}`; };
    const rows = (d.tickets || []).map((tk) => {
      const legs = tk.legs.map((l) => `${icon[l.status]} ${escapeHtml(l.homeTeam)} – ${escapeHtml(l.awayTeam)}: ${escapeHtml(l.market)} ${escapeHtml(l.selection)} (${num(l.odds)}, ${Math.round(l.probability)} %)`).join("<br>");
      const res = tk.profit == null ? "čaká" : tk.status === "void" ? "vrátený vklad" : `${sign(tk.profit)} j.`;
      return `<div style="padding:6px 0;border-top:1px solid rgba(127,127,127,.2)"><strong>${day(tk.day)}</strong> – kurz ${num(tk.odds)}, hodnota +${Math.round((tk.value - 1) * 100)} %, ${icon[tk.status]} ${res}<br>${legs}</div>`;
    }).join("");
    el.innerHTML = `${t}<details style="margin-top:4px"><summary style="cursor:pointer">Zobraziť tikety</summary>${rows}</details>`;
  } catch {
    el.textContent = "";
  }
}


// ---- Poradovník záujemcov z webu ----
const LEAD_PLAN_LABEL = { premium: "Premium", vip: "VIP", vip_waitlist: "VIP (náhradník)", clenstvo: "nevybral", otazka: "otázka z webu" };
async function renderLeads() {
  const el = document.getElementById("leadsList");
  if (!el) return;
  try {
    const leads = await fetchJson("/api/leads");
    if (!leads.length) {
      el.innerHTML = `<p class="empty-state">Zatiaľ sa nikto nezapísal.</p>`;
      return;
    }
    el.innerHTML = leads
      .map((l, i) => {
        const d = new Date(l.firstAt);
        const date = isNaN(d.getTime()) ? "" : `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
        return `<div class="tip-row lead-row">
          <div class="lead-main"><strong>${i + 1}. ${escapeHtml(l.name || "Neznámy")}</strong>${l.username ? ` <span class="muted">@${escapeHtml(l.username)}</span>` : ""}
            <div class="muted small">${escapeHtml(LEAD_PLAN_LABEL[l.plan] || l.plan)} · zapísaný ${date} · ${l.email ? `formulár na webe · ${escapeHtml(l.email)}` : `ID ${escapeHtml(l.chatId)}`}</div>${l.note ? `<div class="muted small">„${escapeHtml(l.note)}“</div>` : ""}</div>
          <div class="lead-actions">
            ${l.email ? `<a class="btn-ghost btn-mini" href="mailto:${encodeURIComponent(l.email)}">Napísať e-mail</a>` : `<a class="btn-ghost btn-mini" href="tg://user?id=${encodeURIComponent(l.chatId)}">Otvoriť chat</a>`}
            <button class="btn-ghost btn-mini" data-lead-add="${escapeHtml(l.chatId)}">Pridať ako predplatiteľa</button>
            <button class="btn-ghost btn-mini" data-lead-del="${escapeHtml(l.chatId)}">Odstrániť</button>
          </div></div>`;
      })
      .join("");
    el.querySelectorAll("[data-lead-add]").forEach((b) => {
      b.onclick = () => {
        const l = leads.find((x) => x.chatId === b.dataset.leadAdd);
        if (!l) return;
        document.getElementById("subName").value = l.name || "";
        document.getElementById("subContact").value = l.email || (l.username ? "@" + l.username : "");
        document.getElementById("subTelegramChatId").value = l.email ? "" : l.chatId;
        document.getElementById("subTier").value = l.plan === "vip" || l.plan === "vip_waitlist" ? "group" : "individual";
        document.getElementById("subName")?.scrollIntoView({ behavior: "smooth", block: "center" });
        showToast("Údaje sú vyplnené – skontroluj ich a klikni na Pridať.");
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
    el.innerHTML = `<p class="empty-state">Poradovník sa nepodarilo načítať.</p>`;
  }
}

init();

// Vzájomné zápasy: najprv 5, tlačidlom +/− sa rozbalia alebo zbalia ďalšie.
document.addEventListener("click", (e) => {
  const btn = (e.target).closest?.(".h2h-toggle");
  if (!btn) return;
  const list = btn.previousElementSibling;
  if (!list) return;
  const open = btn.dataset.open === "1";
  list.querySelectorAll(".h2h-extra").forEach((row) => { (row).hidden = open; });
  btn.dataset.open = open ? "0" : "1";
  btn.textContent = open ? `+ Zobraziť ďalšie (${btn.dataset.more})` : "− Skryť";
});
