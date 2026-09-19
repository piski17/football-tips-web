let selectedLeagueId = null;
let currentFixtures = [];
let currentAnalysis = null;

const sidebarEl = document.getElementById("sidebar");
const toggleFiltersBtn = document.getElementById("toggleFiltersBtn");
const leagueListEl = document.getElementById("leagueList");
const customLeagueInput = document.getElementById("customLeagueId");
const matchDateInput = document.getElementById("matchDateInput");
const seasonInput = document.getElementById("seasonInput");
const loadFixturesBtn = document.getElementById("loadFixturesBtn");
const fixtureListEl = document.getElementById("fixtureList");
const fixtureCountEl = document.getElementById("fixtureCount");
const analysisColumnEl = document.getElementById("analysisColumn");

const openTipsBtn = document.getElementById("openTipsBtn");
const tipsModal = document.getElementById("tipsModal");
const tipsSummaryEl = document.getElementById("tipsSummary");
const tipsListEl = document.getElementById("tipsList");
const closeTipsBtn = document.getElementById("closeTipsBtn");
const checkResultsBtn = document.getElementById("checkResultsBtn");
const clearAllTipsBtn = document.getElementById("clearAllTipsBtn");

toggleFiltersBtn.addEventListener("click", () => {
  sidebarEl.classList.toggle("open");
});

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
  });

  const leagues = await fetchJson("/api/leagues");
  leagueListEl.innerHTML = "";
  leagues.forEach((league) => {
    const item = document.createElement("div");
    item.className = "league-item";
    item.textContent = league.name;
    item.title = league.country;
    item.addEventListener("click", () => selectLeague(league.id, item));
    leagueListEl.appendChild(item);
  });
}

function selectLeague(id, el) {
  selectedLeagueId = id;
  customLeagueInput.value = "";
  document.querySelectorAll(".league-item").forEach((n) => n.classList.remove("active"));
  el.classList.add("active");
}

function getActiveLeagueId() {
  if (customLeagueInput.value.trim()) {
    return parseInt(customLeagueInput.value.trim(), 10);
  }
  return selectedLeagueId;
}

loadFixturesBtn.addEventListener("click", async () => {
  const leagueId = getActiveLeagueId();
  const season = parseInt(seasonInput.value, 10);

  if (!leagueId) {
    fixtureListEl.innerHTML = `<p class="empty-state">Vyber ligu, alebo zadaj vlastný kód súťaže.</p>`;
    return;
  }

  fixtureListEl.innerHTML = `<div class="loading-state">Načítavam zápasy…</div>`;
  loadFixturesBtn.disabled = true;
  sidebarEl.classList.remove("open");

  try {
    const date = matchDateInput.value || new Date().toISOString().slice(0, 10);
    const fixtures = await fetchJson(
      `/api/fixtures?league=${encodeURIComponent(leagueId)}&season=${season}&date=${date}`
    );
    currentFixtures = fixtures;
    renderFixtureList(fixtures, leagueId, season);
  } catch (err) {
    fixtureListEl.innerHTML = `<p class="empty-state">Chyba pri načítaní: ${escapeHtml(err.message)}</p>`;
  } finally {
    loadFixturesBtn.disabled = false;
  }
});

function renderFixtureList(fixtures, leagueId, season) {
  fixtureCountEl.textContent = fixtures.length ? `${fixtures.length} zápasov` : "";

  if (!fixtures.length) {
    fixtureListEl.innerHTML = `<p class="empty-state">Pre túto ligu sa v tento deň nekonajú žiadne zápasy.</p>`;
    return;
  }

  fixtureListEl.innerHTML = "";
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

    row.innerHTML = `
      <div class="time">${escapeHtml(time)}</div>
      <div class="teams">
        <span class="team-name">${escapeHtml(fixture.homeTeam.name)}</span>
        <span class="vs">vs</span>
        <span class="team-name">${escapeHtml(fixture.awayTeam.name)}</span>
      </div>
    `;

    row.addEventListener("click", () => {
      document.querySelectorAll(".fixture-row").forEach((n) => n.classList.remove("selected"));
      row.classList.add("selected");
      analyzeFixture(fixture, leagueId, season);
      analysisColumnEl.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    fixtureListEl.appendChild(row);
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
  const outcomeLetter = r.tip.outcome;

  const warningHtml = r.sampleSizeWarning
    ? `<div class="disclaimer" style="margin-top:0;margin-bottom:20px;border-top:none;padding-top:0;color:var(--gold);">⚠️ ${escapeHtml(r.sampleSizeWarning)}</div>`
    : "";

  analysisColumnEl.innerHTML = `
    <div class="match-header">
      <div class="league-name">${escapeHtml(r.fixture.league.name)} · sezóna ${r.fixture.league.season}</div>
      <h2>${escapeHtml(r.fixture.homeTeam.name)} — ${escapeHtml(r.fixture.awayTeam.name)}</h2>
    </div>

    ${warningHtml}

    <div class="tip-callout">
      <div class="tip-outcome">${outcomeLetter}</div>
      <div class="tip-details">
        <div class="tip-label">${escapeHtml(r.tip.outcomeLabel)}</div>
        <div class="tip-meta">Istota modelu: ${escapeHtml(r.tip.confidence)} · Odhad gólov: ${escapeHtml(r.tip.goalsMarket)}</div>
      </div>
    </div>

    <div class="best-bets-section">
      <div class="section-title">Odporúčané tipy - klikni "Uložiť" pri tom, ktorý chceš sledovať</div>
      <div class="best-bets-list">
        ${(r.bestBets || [])
          .map(
            (bet, idx) => `
          <div class="best-bet-row">
            <div class="best-bet-rank">${idx + 1}.</div>
            <div class="best-bet-info">
              <div class="best-bet-market">${escapeHtml(bet.market)}</div>
              <div class="best-bet-selection">${escapeHtml(bet.selection)}</div>
            </div>
            <div class="best-bet-prob">${bet.probability.toFixed(0)}%</div>
            <button class="tip-save-btn" data-bet-idx="${idx}">Uložiť</button>
          </div>
        `
          )
          .join("")}
      </div>
      <div id="saveTipMsg"></div>
    </div>

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

    <div class="markets-grid">
      <div class="market-card">
        <div class="market-value">${(r.overUnder25.over >= r.overUnder25.under ? r.overUnder25.over : r.overUnder25.under).toFixed(0)}%</div>
        <div class="market-label">${r.overUnder25.over >= r.overUnder25.under ? "Over" : "Under"} 2.5 gólu</div>
      </div>
      <div class="market-card">
        <div class="market-value">${(r.btts.yes >= r.btts.no ? r.btts.yes : r.btts.no).toFixed(0)}%</div>
        <div class="market-label">Obaja tímy skórujú: ${r.btts.yes >= r.btts.no ? "Áno" : "Nie"}</div>
      </div>
      ${
        r.corners
          ? `
      <div class="market-card">
        <div class="market-value">${(r.corners.over >= r.corners.under ? r.corners.over : r.corners.under).toFixed(0)}%</div>
        <div class="market-label">${r.corners.over >= r.corners.under ? "Over" : "Under"} ${r.corners.line} rohov</div>
      </div>`
          : ""
      }
      <div class="market-card">
        <div class="market-value">${(r.cards.over >= r.cards.under ? r.cards.over : r.cards.under).toFixed(0)}%</div>
        <div class="market-label">${r.cards.over >= r.cards.under ? "Over" : "Under"} ${r.cards.line} kariet</div>
      </div>
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

function initSaveTipButton(r) {
  const msgEl = document.getElementById("saveTipMsg");
  const saveButtons = document.querySelectorAll(".tip-save-btn");
  if (!msgEl || !r.bestBets || r.bestBets.length === 0) return;

  saveButtons.forEach((btn) => {
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
      } catch (err) {
        msgEl.innerHTML = `<p class="muted small" style="margin-top:6px;">Uloženie zlyhalo: ${escapeHtml(err.message)}</p>`;
      } finally {
        btn.disabled = false;
      }
    };
  });
}

// ---- História tipov ----

async function openTipsHistory() {
  tipsModal.hidden = false;
  tipsListEl.innerHTML = `<div class="loading-state">Načítavam tipy…</div>`;
  const tips = await fetchJson("/api/tips");
  renderTipsList(tips);
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

  if (tips.length === 0) {
    tipsListEl.innerHTML = `<p class="empty-state">Zatiaľ nemáš uložené žiadne tipy.</p>`;
    return;
  }

  tipsListEl.innerHTML = tips
    .map((t) => {
      const date = new Date(t.matchDate).toLocaleDateString("sk-SK");
      const statusLabel =
        t.status === "won" ? "Vyhral" : t.status === "lost" ? "Prehral" : t.status === "void" ? "Neurčené" : "Čaká";
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
      await fetch(`/api/tips/${id}`, { method: "DELETE" });
      openTipsHistory();
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
    await fetch("/api/tips", { method: "DELETE" });
    renderTipsList([]);
  } finally {
    clearAllTipsBtn.disabled = false;
  }
});

init();
