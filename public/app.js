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
const tipsListEl = document.getElementById("tipsList");
const closeTipsBtn = document.getElementById("closeTipsBtn");
const checkResultsBtn = document.getElementById("checkResultsBtn");
const clearAllTipsBtn = document.getElementById("clearAllTipsBtn");

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
            <span class="team-name">${escapeHtml(fixture.homeTeam.name)}</span>
          </div>
          <span class="vs">vs</span>
          <div class="team-line">
            ${fixture.awayTeam.logo ? `<img class="team-logo" src="${escapeHtml(fixture.awayTeam.logo)}" alt="" />` : ""}
            <span class="team-name">${escapeHtml(fixture.awayTeam.name)}</span>
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
    ? `<p class="muted small" style="margin: -6px 0 12px;">Odohratých zápasov v tejto sezóne: ${escapeHtml(r.fixture.homeTeam.name)} ${r.seasonGamesPlayed.home}, ${escapeHtml(r.fixture.awayTeam.name)} ${r.seasonGamesPlayed.away}</p>`
    : "";

  const warningHtml = r.sampleSizeWarning
    ? `<div class="disclaimer" style="margin-top:0;margin-bottom:20px;border-top:none;padding-top:0;color:var(--gold);">⚠️ ${escapeHtml(r.sampleSizeWarning)}</div>`
    : "";

  const topBetsHtml = topBets
    .map(
      (bet, idx) => `
    <div class="tip-callout" style="${idx > 0 ? "margin-top:10px;" : ""}">
      <div class="tip-outcome">${idx === 0 ? "🎯" : idx + 1 + "."}</div>
      <div class="tip-details">
        <div class="tip-label">${escapeHtml(bet.market)}: ${escapeHtml(bet.selection)}</div>
        <div class="tip-meta">
          ${idx === 0 ? "Najvyššia dôvera zo všetkých trhov · " : ""}${bet.probability.toFixed(0)}%
        </div>
        ${bet.explanation ? `<div class="tip-explanation">💡 ${escapeHtml(bet.explanation)}</div>` : ""}
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
        <span>${escapeHtml(r.fixture.homeTeam.name)}</span>
        <span class="vs-lg">—</span>
        ${r.fixture.awayTeam.logo ? `<img class="team-logo-lg" src="${escapeHtml(r.fixture.awayTeam.logo)}" alt="" />` : ""}
        <span>${escapeHtml(r.fixture.awayTeam.name)}</span>
      </h2>
    </div>

    ${gamesPlayedHtml}
    ${warningHtml}

    ${topBetsHtml}
    <div id="saveTipMsg"></div>

    <div class="prob-section">
      <div class="section-title">Pravdepodobnosť výsledku</div>
      ${probRow(r.fixture.homeTeam.name, r.probabilities.homeWin)}
      ${probRow("Remíza", r.probabilities.draw)}
      ${probRow(r.fixture.awayTeam.name, r.probabilities.awayWin)}
    </div>

    <div class="stats-grid">
      ${teamStatCard(r.fixture.homeTeam.name, r.form.home, r.form.homeScore, r.expectedGoals.home, r.historicalDataInfo && r.historicalDataInfo.home)}
      ${teamStatCard(r.fixture.awayTeam.name, r.form.away, r.form.awayScore, r.expectedGoals.away, r.historicalDataInfo && r.historicalDataInfo.away)}
    </div>

    <div class="prob-section">
      <div class="section-title">Vzájomné zápasy (posledných ${r.headToHead.matchesConsidered})</div>
      <div class="stat-line"><span>Výhry ${escapeHtml(r.fixture.homeTeam.name)}</span><strong>${r.headToHead.homeWins}</strong></div>
      <div class="stat-line"><span>Remízy</span><strong>${r.headToHead.draws}</strong></div>
      <div class="stat-line"><span>Výhry ${escapeHtml(r.fixture.awayTeam.name)}</span><strong>${r.headToHead.awayWins}</strong></div>
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

async function maybeOfferTelegram(tipId) {
  const send = window.confirm("Odoslať tento tip aj do Telegramu?");
  if (!send) return;
  try {
    await fetchJson(`/api/tips/${tipId}/telegram`, { method: "POST" });
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
        <div class="tip-row-match">${escapeHtml(t.homeTeam)} — ${escapeHtml(t.awayTeam)}</div>
        <div class="tip-row-market">${escapeHtml(t.market)}: ${escapeHtml(t.selection)} · ${t.probability.toFixed(0)}%</div>
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

  if (tips.length === 0) {
    tipsListEl.innerHTML = `<p class="empty-state">Zatiaľ nemáš uložené žiadne tipy.</p>`;
    return;
  }

  tipsListEl.innerHTML = tips
    .map((t) => {
      const date = new Date(t.matchDate).toLocaleDateString("sk-SK");
      const statusLabelOf = (s) =>
        s === "won" ? "Vyhral" : s === "lost" ? "Prehral" : s === "void" ? "Neurčené" : "Čaká";
      const statusLabel = statusLabelOf(t.status);

      if (t.legs && t.legs.length > 0) {
        const legsHtml = t.legs
          .map(
            (leg) => `
            <div class="tip-row-market" style="padding-left: 10px; border-left: 2px solid var(--border); margin-top: 4px;">
              ${escapeHtml(leg.homeTeam)} — ${escapeHtml(leg.awayTeam)}: ${escapeHtml(leg.market)}: ${escapeHtml(leg.selection)} · ${leg.probability.toFixed(0)}%
              <span class="tip-status ${leg.status}" style="margin-left:6px; font-size:9.5px; padding:2px 7px;">${statusLabelOf(leg.status)}</span>
            </div>`
          )
          .join("");

        return `
        <div class="tip-row" style="align-items: flex-start;">
          <div class="tip-row-info">
            <div class="tip-row-match">🎫 Tiket (${t.legs.length} tipov) <span class="muted small">(${date})</span></div>
            <div class="tip-row-market">Kombinovaná pravdepodobnosť: ${t.probability.toFixed(1)}%</div>
            ${legsHtml}
          </div>
          <span class="tip-status ${t.status}">${statusLabel}</span>
          ${
            t.status === "pending"
              ? `<button class="tip-delete-btn" data-tip-id="${t.id}" title="Zmazať">✕</button>`
              : ""
          }
        </div>
      `;
      }

      return `
        <div class="tip-row">
          <div class="tip-row-info">
            <div class="tip-row-match">${escapeHtml(t.homeTeam)} — ${escapeHtml(t.awayTeam)} <span class="muted small">(${date})</span></div>
            <div class="tip-row-market">${escapeHtml(t.market)}: ${escapeHtml(t.selection)} · ${t.probability.toFixed(0)}%</div>
          </div>
          <span class="tip-status ${t.status}">${statusLabel}</span>
          ${
            t.status === "pending"
              ? `<button class="tip-delete-btn" data-tip-id="${t.id}" title="Zmazať">✕</button>`
              : ""
          }
        </div>
      `;
    })
    .join("");

  tipsListEl.querySelectorAll(".tip-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.dataset.tipId;
      if (!id) return;
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
}

openTipsBtn.addEventListener("click", openTipsHistory);
closeTipsBtn.addEventListener("click", () => {
  tipsModal.hidden = true;
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

init();
