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
  matchDateInput.value = new Date().toISOString().slice(0, 10);
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

async function loadFixtures(silent = false) {
  const season = parseInt(seasonInput.value, 10);
  const date = matchDateInput.value || new Date().toISOString().slice(0, 10);

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
        } catch {
          return { leagueId, fixtures: [] };
        }
      })
    );

    currentFixtures = results.flatMap((r) => r.fixtures);
    renderGroupedFixtureList(results);
  } catch (err) {
    if (!silent) {
      fixtureListEl.innerHTML = `<p class="empty-state">Chyba pri načítaní: ${escapeHtml(err.message)}</p>`;
    }
  } finally {
    if (!silent) loadFixturesBtn.disabled = false;
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

async function analyzeFixture(fixture, leagueId, season) {
  analysisColumnEl.innerHTML = skeletonHtml(4);

  try {
    const result = await fetchJson("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture, leagueId, season }),
    });
    currentAnalysis = result;
    renderAnalysis(result);
  } catch (err) {
    analysisColumnEl.innerHTML = `<div class="empty-state">Analýzu sa nepodarilo vypočítať: ${escapeHtml(err.message)}</div>`;
  }
}

function renderAnalysis(r) {
  // Zobrazí všetky tipy zápasu v pásme 65–75 % (predictor.ts vracia max. 1 na trh).
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
          ${idx === 0 ? "Najvyššia dôvera zo všetkých trhov · " : ""}${bet.probability.toFixed(0)} %${betOddsHtml(bet)}
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
      ? `<div class="empty-state" style="margin-bottom:16px;">Pri tomto zápase nie je žiadny tip v pásme 65–75 %${
          (r.lowValueBets || []).length > 0 ? ", ktorý by prešiel kontrolou kurzu" : ""
        }.</div>`
      : "";

  // Tipy v pásme, ktoré vypadli pre nízky skutočný kurz (bez hodnoty) - len na informáciu.
  const lowValueHtml =
    (r.lowValueBets || []).length > 0
      ? `<div class="low-value-list">
          <div class="muted small" style="margin-bottom:6px;">Vyradené po kontrole kurzu (môžeš ich pridať na vlastnú zodpovednosť):</div>
          ${(r.lowValueBets || [])
            .map(
              (b, i) => `
            <div class="low-value-row">
              <span class="muted small">${escapeHtml(b.market)}: ${escapeHtml(
                translateNamesInText(b.selection, r.fixture.homeTeam.name, r.fixture.awayTeam.name)
              )} (${b.probability.toFixed(0)} %${typeof b.odds === "number" && b.odds > 1 ? `, kurz ${fmtOdds(b.odds)}` : ""} – ${escapeHtml(b.rejectReason || "bez hodnoty")})</span>
              <span class="low-value-actions">
                <button class="btn-ghost btn-mini save-best-bet-btn" data-source="low" data-bet-idx="${i}">Uložiť aj tak</button>
                <button class="btn-ghost btn-mini add-to-ticket-btn" data-source="low" data-bet-idx="${i}">+ Do tiketu</button>
              </span>
            </div>`
            )
            .join("")}
        </div>`
      : "";

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
              .map((m) => {
                const d = new Date(m.date);
                const date = isNaN(d.getTime()) ? "" : `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
                const home = translateTeamName(m.homeWasHome ? r.fixture.homeTeam.name : r.fixture.awayTeam.name);
                const away = translateTeamName(m.homeWasHome ? r.fixture.awayTeam.name : r.fixture.homeTeam.name);
                const hg = m.homeWasHome ? m.homeGoals : m.awayGoals;
                const ag = m.homeWasHome ? m.awayGoals : m.homeGoals;
                return `<div class="h2h-row${m.usedInModel ? "" : " h2h-old"}"><span class="muted">${date}</span><span>${escapeHtml(home)} <strong>${hg} : ${ag}</strong> ${escapeHtml(away)}</span></div>`;
              })
              .join("")}</div>
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
          <button class="btn-ghost" id="tgChoiceBoth">Oba naraz</button>
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
              ? `<button class="tip-delete-btn" data-edit-id="${t.id}" title="Upraviť výsledok alebo kurz" aria-label="Upraviť tip"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="display:block"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg></button><button class="tip-delete-btn" data-send-id="${t.id}" title="Poslať do Telegram kanála" aria-label="Poslať do Telegram kanála"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style="display:block"><path fill="currentColor" d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13.1 1.3 11.6c-1-.3-1.1-1 .2-1.5L20.6 2.8c.9-.3 1.6.2 1.3 1.5z"/></svg></button><button class="tip-delete-btn" data-motw-id="${t.id}" title="Poslať ako Zápas/Tiket týždňa">★</button>`
              : `<button class="tip-delete-btn" data-edit-id="${t.id}" title="Upraviť výsledok alebo kurz" aria-label="Upraviť tip"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="display:block"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg></button><button class="tip-delete-btn" data-result-id="${t.id}" title="Poslať výsledok do Telegramu">➤</button>`
          }
        </div>
      `;
      }

      return `
        <div class="tip-row ${rowClassFull}" data-row-id="${t.id}">
          <div class="tip-row-info">
            <div class="tip-row-match">${escapeHtml(translateTeamName(t.homeTeam))} — ${escapeHtml(translateTeamName(t.awayTeam))} <span class="muted small">(${date})</span></div>
            <div class="tip-row-market">${escapeHtml(t.market)}: ${escapeHtml(translateNamesInText(t.selection, t.homeTeam, t.awayTeam))} · ${t.probability.toFixed(0)} % · kurz ${tipOddsLabel(t)}${overrideBadge(t)}${manualBadge(t)}${editedBadge(t)}</div>
          </div>
          ${resultIconHtml}
          ${
            t.status === "pending"
              ? `<button class="tip-delete-btn" data-edit-id="${t.id}" title="Upraviť výsledok alebo kurz" aria-label="Upraviť tip"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="display:block"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg></button><button class="tip-delete-btn" data-send-id="${t.id}" title="Poslať do Telegram kanála" aria-label="Poslať do Telegram kanála"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style="display:block"><path fill="currentColor" d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13.1 1.3 11.6c-1-.3-1.1-1 .2-1.5L20.6 2.8c.9-.3 1.6.2 1.3 1.5z"/></svg></button><button class="tip-delete-btn" data-motw-id="${t.id}" title="Poslať ako Zápas/Tiket týždňa">★</button>`
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
      const target = await askTelegramTarget();
      if (!target) return;
      try {
        await fetchJson(`/api/tips/${id}/telegram`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target, asMatchOfWeek: true }),
        });
        showToast("Odoslané ako Zápas/Tiket týždňa.");
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

// ---- Predplatitelia ----

function daysUntil(dateStr) {
  const diffMs = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function subscriberStatus(sub) {
  const days = daysUntil(sub.nextPaymentDue);
  if (days < 0) return { label: "Vypršal", cls: "lost" };
  if (days <= 3) return { label: `Vyprší o ${days} d.`, cls: "void" };
  return { label: "Aktívny", cls: "won" };
}

async function openSubscribers() {
  subscribersModal.hidden = false;
  subscribersListEl.innerHTML = skeletonHtml(2);
  try {
    const subs = await fetchJson("/api/subscribers");
    renderSubscribersList(subs);
  } catch (err) {
    subscribersListEl.innerHTML = `<p class="muted small">Predplatiteľov sa nepodarilo načítať: ${escapeHtml(err.message)}</p>`;
  }
}

function renderSubscribersList(subs) {
  const activeCount = subs.filter((s) => daysUntil(s.nextPaymentDue) >= 0).length;
  const monthlyRevenue = subs
    .filter((s) => daysUntil(s.nextPaymentDue) >= 0)
    .reduce((sum, s) => sum + (s.priceEur || 0), 0);

  subscribersSummaryEl.innerHTML = `
    <span>Spolu: <strong>${subs.length}</strong></span>
    <span>Aktívnych: <strong>${activeCount}</strong></span>
    <span>Mesačný príjem: <strong>${monthlyRevenue} €</strong></span>
  `;

  if (subs.length === 0) {
    subscribersListEl.innerHTML = `<p class="empty-state">Zatiaľ nemáš pridaných žiadnych predplatiteľov.</p>`;
    return;
  }

  subscribersListEl.innerHTML = subs
    .map((s) => {
      const status = subscriberStatus(s);
      const tierLabel = s.tier === "group" ? "VIP" : "PREMIUM";
      const dueDate = new Date(s.nextPaymentDue).toLocaleDateString("sk-SK");
      return `
        <div class="tip-row">
          <div class="tip-row-info">
            <div class="tip-row-match">${escapeHtml(s.name)} <span class="muted small">(${tierLabel} · ${s.priceEur} €)</span></div>
            <div class="tip-row-market">${escapeHtml(s.contact || "")} · najbližšia platba: ${dueDate}</div>
          </div>
          <span class="tip-status ${status.cls}">${status.label}</span>
          ${
            s.telegramChatId
              ? `<button class="tip-delete-btn" data-test-reminder-id="${s.id}" title="Poslať testovaciu pripomienku teraz" style="background:var(--surface-alt); color:var(--gold-bright); border-radius:6px; padding:4px 8px; font-size:12px;">🔔 Test</button>`
              : ""
          }
          <button class="tip-delete-btn" data-extend-id="${s.id}" title="Predĺžiť o mesiac" style="background:var(--surface-alt); color:var(--gold-bright); border-radius:6px; padding:4px 8px; font-size:12px;">+30d</button>
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
      const base = daysUntil(sub.nextPaymentDue) > 0 ? new Date(sub.nextPaymentDue) : new Date();
      base.setDate(base.getDate() + 30);
      try {
        await fetchJson(`/api/subscribers/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nextPaymentDue: base.toISOString() }),
        });
        openSubscribers();
      } catch (err) {
        showToast(`Predĺženie zlyhalo: ${err.message}`);
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
      if (!window.confirm("Naozaj zmazať tohto predplatiteľa?")) return;
      try {
        await fetchJson(`/api/subscribers/${id}`, { method: "DELETE" });
        openSubscribers();
      } catch (err) {
        showToast(`Zmazanie zlyhalo: ${err.message}`);
      }
    });
  });
}

openSubscribersBtn.addEventListener("click", openSubscribers);
closeSubscribersBtn.addEventListener("click", () => {
  subscribersModal.hidden = true;
});

addSubscriberBtn.addEventListener("click", async () => {
  const name = subNameInput.value.trim();
  if (!name) {
    showToast("Zadaj meno alebo názov skupiny.");
    return;
  }
  const tier = subTierSelect.value;
  const priceEur = tier === "group" ? 99 : 29;
  const nextPaymentDue = new Date();
  nextPaymentDue.setDate(nextPaymentDue.getDate() + 30);

  const subscriber = {
    id: `sub-${Date.now()}`,
    name,
    contact: subContactInput.value.trim(),
    telegramChatId: subTelegramChatIdInput.value.trim() || undefined,
    tier,
    priceEur,
    nextPaymentDue: nextPaymentDue.toISOString(),
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
    renderDayTips();
  } finally {
    dayTipsBtn.disabled = false;
  }
}

function renderDayTips() {
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
          <div class="muted small">Dôvera <strong>${bet.probability.toFixed(0)} %</strong>${betOddsHtml(bet)}</div>
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
    ${rows || `<div class="empty-state">V tento deň nie je žiadny tip, ktorý by prešiel pravidlami (65–75 % a kontrola kurzu).</div>`}
  `;

  analysisColumnEl.querySelectorAll("[data-open]").forEach((btn) => {
    btn.onclick = () => {
      const item = dayTipsItems[Number(btn.dataset.open)];
      if (!item) return;
      currentAnalysis = item.r;
      try {
        renderAnalysis(item.r);
      } finally {
        // Tlačidlo späť na zoznam - vždy, aj keby sa detail nepodarilo vykresliť.
        const back = document.createElement("button");
        back.className = "btn-ghost btn-mini";
        back.textContent = "‹ Späť na tipy dňa";
        back.style.marginBottom = "12px";
        back.onclick = () => renderDayTips();
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

function renderBacktest(job) {
  const r = job.report;
  const p = job.progress || { done: 0, total: 0 };
  const running = job.status === "running";
  document.getElementById("btProgress").innerHTML = running
    ? `Prebieha test: ${p.done} / ${p.total || "?"} zápasov…<div class="bt-bar"><i style="width:${p.total ? (p.done / p.total) * 100 : 3}%"></i></div>`
    : job.status === "error"
      ? `Test zlyhal: ${escapeHtml(job.error || "")}`
      : `Hotovo – ${r ? r.fixturesAnalyzed : 0} zápasov${r && r.fixturesFailed ? `, ${r.fixturesFailed} sa nepodarilo spracovať` : ""}.`;
  document.getElementById("btStartBtn").disabled = running;
  if (!r || !r.samples) { document.getElementById("btReport").innerHTML = running ? "" : `<p class="muted">Pre zvolené obdobie a ligy sa nenašli žiadne vyhodnotiteľné zápasy.</p>`; return; }

  const b = r.bandOverall;
  const summary = b.count
    ? `<div class="bt-summary">Tipy v pásme 65 – 75 % (tie, ktoré by appka odporučila): <strong>${b.count}</strong>, model v priemere <strong>${pct(b.avgPredicted)}</strong>, reálne vyšlo <strong class="${b.hitRate < b.avgPredicted - 5 ? "bt-bad" : "bt-good"}">${pct(b.hitRate)}</strong>.</div>`
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
    <table class="bt-table"><thead><tr><th>Trh</th><th class="num">Tipov</th><th class="num">Model</th><th class="num">Realita</th><th class="num">Rozdiel</th><th class="num">V pásme 65–75 %</th></tr></thead><tbody>${markets}</tbody></table>
    <p class="muted small">Rozdiel = realita mínus predpoveď v percentuálnych bodoch. Zelená: model sedí (do ±5 b.). Červená: model <strong>preceňuje</strong> – tipy vychádzajú menej často, než hovorí. Pri menej ako ~50 tipoch v riadku berte čísla len orientačne.</p>`;
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

init();
