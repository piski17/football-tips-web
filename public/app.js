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
  "Republic of Ireland": "Írsko",
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
};

function translateTeamName(name) {
  return COUNTRY_NAME_SK[name] ?? name;
}

/**
 * Preloží mená tímov, ktoré sú vložené priamo vo vete (napr. "Výsledok zápasu:
 * Liechtenstein alebo remíza", vysvetlenie s formou a pod.) - len na zobrazenie,
 * uložené dáta (SavedTip.homeTeam/awayTeam) zostávajú v pôvodnom tvare, aby
 * fungovalo vyhodnocovanie výsledkov (tipEvaluator porovnáva presne s nimi).
 */
function impliedOdds(probability) {
  return probability > 0 ? (100 / probability).toFixed(2) : "-";
}

function translateNamesInText(text, homeOriginal, awayOriginal) {
  if (!text) return "";
  let result = text;
  const homeSk = translateTeamName(homeOriginal);
  const awaySk = translateTeamName(awayOriginal);
  if (homeSk !== homeOriginal) result = result.split(homeOriginal).join(homeSk);
  if (awaySk !== awayOriginal) result = result.split(awayOriginal).join(awaySk);
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
    pct.textContent = `${percent}%`;
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();

let selectedLeagueIds = new Set();
let currentFixtures = [];
let currentAnalysis = null;
let ticketItems = []; // aktuálne vybrané tipy na spojenie do "tiketu"
let collapsedLeagues = new Set(); // ligy schované cez tlačidlo, zostáva aj po automatickom obnovení

const customLeagueInput = document.getElementById("customLeagueId");
const toggleCustomLeagueBtn = document.getElementById("toggleCustomLeagueBtn");
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

toggleCustomLeagueBtn.addEventListener("click", () => {
  customLeagueInput.hidden = !customLeagueInput.hidden;
  if (!customLeagueInput.hidden) customLeagueInput.focus();
});

customLeagueInput.addEventListener("change", () => loadFixtures());

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
  const customId = customLeagueInput.value.trim() ? parseInt(customLeagueInput.value.trim(), 10) : null;
  if (customId) leagueIds.add(customId);

  if (leagueIds.size === 0) {
    if (!silent) {
      fixtureListEl.innerHTML = `<p class="empty-state">Zaškrtni aspoň jednu ligu, alebo zadaj vlastné ID ligy.</p>`;
    }
    return;
  }

  if (!silent) {
    fixtureListEl.innerHTML = `<div class="loading-state">Načítavam zápasy…</div>`;
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
  fixtureCountEl.textContent = totalCount ? `${totalCount} zápasov` : "";

  const groupsWithMatches = results.filter((r) => r.fixtures.length > 0);

  if (groupsWithMatches.length === 0) {
    fixtureListEl.innerHTML = `<p class="empty-state">Pre vybrané ligy sa v tento deň nekonajú žiadne zápasy.</p>`;
    return;
  }

  fixtureListEl.innerHTML = "";

  groupsWithMatches.forEach(({ fixtures }) => {
    const leagueName = fixtures[0]?.league?.name ?? "Liga";
    const isCollapsed = collapsedLeagues.has(leagueName);

    const group = document.createElement("div");
    group.className = "league-group";

    const header = document.createElement("button");
    header.className = "league-group-header";
    header.innerHTML = `<span>${escapeHtml(leagueName)}</span><span class="chevron">${isCollapsed ? "▸" : "▾"}</span>`;
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
        : `<div class="time">${escapeHtml(time)}</div>`;

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
  analysisColumnEl.innerHTML = `<div class="loading-state">Počítam štatistickú analýzu…</div>`;

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
  const topBets = (r.bestBets || []).slice(0, 3);

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
          ${idx === 0 ? "Najvyššia dôvera zo všetkých trhov · " : ""}${bet.probability.toFixed(0)}%
        </div>
        ${bet.explanation ? `<div class="tip-explanation">💡 ${escapeHtml(translateNamesInText(bet.explanation, r.fixture.homeTeam.name, r.fixture.awayTeam.name))}</div>` : ""}
      </div>
    </div>
    <div style="display:flex; gap:8px; margin: 4px 0 8px;">
      <button class="btn-primary save-best-bet-btn" data-bet-idx="${idx}" style="flex:1;">Uložiť tento tip</button>
      <button class="btn-ghost add-to-ticket-btn" data-bet-idx="${idx}" style="flex:1;">+ Do tiketu</button>
    </div>
  `
    )
    .join("");

  analysisColumnEl.innerHTML = `
    <div class="match-header">
      <div class="league-name">${escapeHtml(r.fixture.league.name)} · sezóna ${r.fixture.league.season}</div>
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

    ${topBetsHtml}
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
    </div>

    <div class="prob-section">
      <div class="section-title">Najpravdepodobnejší strelec zápasu</div>
      <p class="muted small" style="margin: -4px 0 10px;">
        ${
          (r.lineupConfirmed && (r.lineupConfirmed.home || r.lineupConfirmed.away))
            ? "✓ Počíta z potvrdenej zostavy na zápas (kde je k dispozícii)."
            : "Zostava na tento zápas ešte nie je potvrdená (zvyčajne sa objaví cca hodinu pred výkopom) - počíta sa z celej súpisky."
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
}

function probRow(label, value) {
  return `
    <div class="prob-bar-row">
      <span class="prob-label">${escapeHtml(label)}</span>
      <div class="prob-bar-track"><div class="prob-bar-fill" style="width:${clampPercent(value)}%"></div></div>
      <span class="prob-value">${value.toFixed(0)}%</span>
    </div>
  `;
}

function teamStatCard(name, form, formScore, xg, historyInfo) {
  const pills = (form || "")
    .slice(-5)
    .split("")
    .map((r) => `<div class="form-pill ${r}">${r}</div>`)
    .join("");

  const historyLine = historyInfo
    ? `<div class="stat-line"><span>Historické sezóny použité</span><strong>${historyInfo.seasonsUsed} / ${historyInfo.seasonsChecked}</strong></div>`
    : `<div class="stat-line"><span>Historické sezóny použité</span><strong>0 (nenájdené)</strong></div>`;

  return `
    <div class="stat-card">
      <h4>${escapeHtml(name)}</h4>
      <div class="form-pills">${pills || '<span class="muted small">bez dát o forme</span>'}</div>
      <div class="stat-line"><span>Vážené skóre formy</span><strong>${formScore.toFixed(2)} / 3.00</strong></div>
      <div class="stat-line"><span>Očakávané góly</span><strong>${xg.toFixed(2)}</strong></div>
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
      <h4>${escapeHtml(prediction.player.name)} <span class="muted small">(${escapeHtml(best.team)})</span></h4>
      <div class="stat-line"><span>Góly / zápasy</span><strong>${prediction.seasonGoals} / ${prediction.appearances}</strong></div>
      <div class="tip-callout" style="margin-top:10px; margin-bottom:0; padding: 10px 14px;">
        <div class="tip-outcome" style="font-size:16px;">⚽</div>
        <div class="tip-details">
          <div class="tip-label" style="font-size:13px;">Pravdepodobnosť gólu</div>
        </div>
        <div class="best-bet-prob" style="margin-left:auto;">${prediction.probabilityToScore.toFixed(0)}%</div>
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
          <button class="btn-primary" id="tgChoicePremium">📣 PREMIUM kanál</button>
          <button class="btn-primary" id="tgChoiceVip">👑 VIP kanál</button>
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
    alert(`Odoslanie do Telegramu zlyhalo: ${err.message}`);
  }
}

function initSaveTipButton(r) {
  const msgEl = document.getElementById("saveTipMsg");
  const buttons = document.querySelectorAll(".save-best-bet-btn");
  if (!msgEl || !r.bestBets || r.bestBets.length === 0) return;

  buttons.forEach((btn) => {
    btn.onclick = async () => {
      const idx = parseInt(btn.dataset.betIdx ?? "0", 10);
      const chosenBet = r.bestBets[idx];
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
        msgEl.innerHTML = `<p class="muted small" style="margin-top:6px;">✓ Tip uložený (${escapeHtml(chosenBet.market)}: ${escapeHtml(chosenBet.selection)})</p>`;
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
      const bet = r.bestBets && r.bestBets[idx];
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
    ticketListEl.innerHTML = `<p class="empty-state">Tiket je zatiaľ prázdny - pridaj tipy tlačidlom "+ Do tiketu" pri analýze zápasu.</p>`;
    return;
  }

  const combinedProbability = ticketItems.reduce((acc, t) => acc * (t.probability / 100), 1) * 100;
  const impliedOdds = combinedProbability > 0 ? 100 / combinedProbability : 0;

  ticketSummaryEl.innerHTML = `
    <span>Počet tipov: <strong>${ticketItems.length}</strong></span>
    <span>Kombinovaná pravdepodobnosť: <strong>${combinedProbability.toFixed(1)}%</strong></span>
    <span>Odvodený kurz: <strong>~${impliedOdds.toFixed(2)}</strong></span>
  `;

  ticketListEl.innerHTML = ticketItems
    .map(
      (t) => `
    <div class="tip-row">
      <div class="tip-row-info">
        <div class="tip-row-match">${escapeHtml(translateTeamName(t.homeTeam))} — ${escapeHtml(translateTeamName(t.awayTeam))}</div>
        <div class="tip-row-market">${escapeHtml(t.market)}: ${escapeHtml(translateNamesInText(t.selection, t.homeTeam, t.awayTeam))} · ${t.probability.toFixed(0)}%</div>
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
    alert("Tiket musí obsahovať aspoň 2 tipy.");
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
    awayTeam: `${ticketItems.length} zápasov`,
    matchDate: new Date().toISOString(),
    market: "Tiket",
    selection: `${ticketItems.length} tipov`,
    probability: combinedProbability,
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
    alert(`Uloženie tiketu zlyhalo: ${err.message}`);
  } finally {
    saveTicketBtn.disabled = false;
  }
});

// ---- História tipov ----

async function openTipsHistory() {
  tipsModal.hidden = false;
  tipsListEl.innerHTML = `<div class="loading-state">Načítavam tipy…</div>`;
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
    { min: 50, max: 60, label: "50-60%" },
    { min: 60, max: 70, label: "60-70%" },
    { min: 70, max: 80, label: "70-80%" },
    { min: 80, max: 90, label: "80-90%" },
    { min: 90, max: 100, label: "90-100%" },
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
          <span class="muted small">realita: ${r.actualPct.toFixed(0)}% · ${r.count} tipov</span>
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
    const impliedOdds = 100 / t.probability; // predpokladaný "fér" kurz odvodený z vlastnej pravdepodobnosti modelu
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
      <span>Celková zmena: <strong style="color:${totalReturn >= 0 ? "var(--success)" : "var(--danger)"};">${totalReturn >= 0 ? "+" : ""}${totalReturn.toFixed(1)}%</strong></span>
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
            <span class="muted small">${stats.won}/${stats.total} · ${pct.toFixed(0)}%</span>
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

function renderTipsList(tips) {
  const won = tips.filter((t) => t.status === "won").length;
  const lost = tips.filter((t) => t.status === "lost").length;
  const pending = tips.filter((t) => t.status === "pending").length;
  const decided = won + lost;
  const winRate = decided > 0 ? ((won / decided) * 100).toFixed(0) : "—";

  tipsSummaryEl.innerHTML = `
    <span>Spolu: <strong>${tips.length}</strong></span>
    <span>Čaká: <strong>${pending}</strong></span>
    <span>Vyhral: <strong>${won}</strong></span>
    <span>Prehral: <strong>${lost}</strong></span>
    <span>Úspešnosť: <strong>${winRate}${decided > 0 ? "%" : ""}</strong></span>
  `;

  renderMarketBreakdown(tips);
  renderBankrollSimulation(tips);
  renderCalibrationReport(tips);

  if (tips.length === 0) {
    tipsListEl.innerHTML = `<p class="empty-state">Zatiaľ nemáš uložené žiadne tipy.</p>`;
    return;
  }

  tipsListEl.innerHTML = tips
    .map((t) => {
      const date = new Date(t.matchDate).toLocaleDateString("sk-SK");
      const rowClass = t.status === "won" ? "tip-row-won" : t.status === "lost" ? "tip-row-lost" : "";
      const resultIconHtml =
        t.status === "won"
          ? `<span class="tip-result-icon won">✓</span>`
          : t.status === "lost"
          ? `<span class="tip-result-icon lost">✕</span>`
          : `<span class="tip-status ${t.status}">${t.status === "void" ? "Neurčené" : "Čaká"}</span>`;

      if (t.legs && t.legs.length > 0) {
        const legsHtml = t.legs
          .map(
            (leg) => `
            <div class="tip-row-market" style="padding-left: 10px; border-left: 2px solid var(--border); margin-top: 4px;">
              ${escapeHtml(translateTeamName(leg.homeTeam))} — ${escapeHtml(translateTeamName(leg.awayTeam))}: ${escapeHtml(leg.market)}: ${escapeHtml(translateNamesInText(leg.selection, leg.homeTeam, leg.awayTeam))} · ${leg.probability.toFixed(0)}%
            </div>`
          )
          .join("");

        return `
        <div class="tip-row ${rowClass}" style="align-items: flex-start;">
          <div class="tip-row-info">
            <div class="tip-row-match">🎫 Tiket (${t.legs.length} tipov) <span class="muted small">(${date})</span></div>
            <div class="tip-row-market">Kombinovaná pravdepodobnosť: ${t.probability.toFixed(1)}% · kurz ~${impliedOdds(t.probability)}</div>
            ${legsHtml}
          </div>
          ${resultIconHtml}
          ${
            t.status === "pending"
              ? `<button class="tip-delete-btn" data-telegram-id="${t.id}" title="Poslať do Telegramu">✉</button>
                 <button class="tip-delete-btn" data-motw-id="${t.id}" title="Poslať ako Zápas/Tiket týždňa">★</button>`
              : `<button class="tip-delete-btn" data-result-id="${t.id}" title="Poslať výsledok do Telegramu">📣</button>`
          }
          <button class="tip-delete-btn" data-tip-id="${t.id}" title="Zmazať">✕</button>
        </div>
      `;
      }

      return `
        <div class="tip-row ${rowClass}">
          <div class="tip-row-info">
            <div class="tip-row-match">${escapeHtml(translateTeamName(t.homeTeam))} — ${escapeHtml(translateTeamName(t.awayTeam))} <span class="muted small">(${date})</span></div>
            <div class="tip-row-market">${escapeHtml(t.market)}: ${escapeHtml(translateNamesInText(t.selection, t.homeTeam, t.awayTeam))} · ${t.probability.toFixed(0)}% · kurz ~${impliedOdds(t.probability)}</div>
          </div>
          ${resultIconHtml}
          ${
            t.status === "pending"
              ? `<button class="tip-delete-btn" data-telegram-id="${t.id}" title="Poslať do Telegramu">✉</button>
                 <button class="tip-delete-btn" data-motw-id="${t.id}" title="Poslať ako Zápas/Tiket týždňa">★</button>`
              : `<button class="tip-delete-btn" data-result-id="${t.id}" title="Poslať výsledok do Telegramu">📣</button>`
          }
          <button class="tip-delete-btn" data-tip-id="${t.id}" title="Zmazať">✕</button>
        </div>
      `;
    })
    .join("");

  tipsListEl.querySelectorAll(".tip-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.dataset.tipId;
      if (!id) return;
      const confirmed = window.confirm("Naozaj chceš odstrániť tento tip/tiket z histórie? Táto akcia sa nedá vrátiť späť.");
      if (!confirmed) return;
      btn.disabled = true;
      try {
        const res = await fetch(`/api/tips/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(`Zmazanie zlyhalo: ${data.error || "neznáma chyba"}. Skús to prosím znova.`);
        }
      } catch (err) {
        alert("Zmazanie zlyhalo - skontroluj internetové pripojenie a skús to znova.");
      } finally {
        openTipsHistory();
      }
    });
  });

  tipsListEl.querySelectorAll("[data-telegram-id]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.dataset.telegramId;
      if (!id) return;
      await maybeOfferTelegram(id);
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
        alert("Odoslané ako Zápas/Tiket týždňa.");
      } catch (err) {
        alert(`Odoslanie zlyhalo: ${err.message}`);
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
        alert("Výsledok odoslaný.");
      } catch (err) {
        alert(`Odoslanie zlyhalo: ${err.message}`);
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
  subscribersListEl.innerHTML = `<p class="muted small">Načítavam…</p>`;
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
        alert(`Predĺženie zlyhalo: ${err.message}`);
      }
    });
  });

  subscribersListEl.querySelectorAll("[data-test-reminder-id]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.dataset.testReminderId;
      btn.disabled = true;
      try {
        const res = await fetchJson(`/api/subscribers/${id}/test-reminder`, { method: "POST" });
        alert(res.ok ? "Testovacia pripomienka odoslaná - skontroluj Telegram." : "Odoslanie zlyhalo.");
      } catch (err) {
        alert(`Odoslanie zlyhalo: ${err.message}`);
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
        alert(`Zmazanie zlyhalo: ${err.message}`);
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
    alert("Zadaj meno alebo názov skupiny.");
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
    alert(`Pridanie zlyhalo: ${err.message}`);
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
    alert(`Kontrola výsledkov zlyhala: ${err.message}`);
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
    alert(`Vymazanie zlyhalo: ${err.message}. Skús to prosím znova.`);
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
    alert("Odoslané.");
  } catch (err) {
    alert(`Odoslanie zlyhalo: ${err.message}`);
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
    alert("Odoslané.");
  } catch (err) {
    alert(`Odoslanie zlyhalo: ${err.message}`);
  } finally {
    weeklyReportBtn.disabled = false;
  }
});

init();
