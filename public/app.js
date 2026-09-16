let selectedLeagueId = null;
let currentFixtures = [];

const sidebarEl = document.getElementById("sidebar");
const toggleFiltersBtn = document.getElementById("toggleFiltersBtn");
const leagueListEl = document.getElementById("leagueList");
const customLeagueInput = document.getElementById("customLeagueId");
const seasonInput = document.getElementById("seasonInput");
const loadFixturesBtn = document.getElementById("loadFixturesBtn");
const fixtureListEl = document.getElementById("fixtureList");
const fixtureCountEl = document.getElementById("fixtureCount");
const analysisColumnEl = document.getElementById("analysisColumn");

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

async function init() {
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
    return customLeagueInput.value.trim().toUpperCase();
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
    const fixtures = await fetchJson(`/api/fixtures?league=${encodeURIComponent(leagueId)}&season=${season}`);
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
    fixtureListEl.innerHTML = `<p class="empty-state">Pre túto ligu a sezónu sa nenašli žiadne zápasy. Ak používaš bezplatný plán, skús inú sezónu.</p>`;
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

    <div class="prob-section">
      <div class="section-title">Pravdepodobnosť výsledku</div>
      ${probRow(r.fixture.homeTeam.name, r.probabilities.homeWin)}
      ${probRow("Remíza", r.probabilities.draw)}
      ${probRow(r.fixture.awayTeam.name, r.probabilities.awayWin)}
    </div>

    <div class="stats-grid">
      ${teamStatCard(r.fixture.homeTeam.name, r.form.home, r.form.homeScore, r.expectedGoals.home)}
      ${teamStatCard(r.fixture.awayTeam.name, r.form.away, r.form.awayScore, r.expectedGoals.away)}
    </div>

    <div class="prob-section">
      <div class="section-title">Vzájomné zápasy (posledných ${r.headToHead.matchesConsidered})</div>
      <div class="stat-line"><span>Výhry ${escapeHtml(r.fixture.homeTeam.name)}</span><strong>${r.headToHead.homeWins}</strong></div>
      <div class="stat-line"><span>Remízy</span><strong>${r.headToHead.draws}</strong></div>
      <div class="stat-line"><span>Výhry ${escapeHtml(r.fixture.awayTeam.name)}</span><strong>${r.headToHead.awayWins}</strong></div>
    </div>

    <div class="markets-grid">
      <div class="market-card">
        <div class="market-value">${r.overUnder25.over.toFixed(0)}%</div>
        <div class="market-label">Over 2.5 gólu</div>
      </div>
      <div class="market-card">
        <div class="market-value">${r.btts.yes.toFixed(0)}%</div>
        <div class="market-label">Obaja tímy skórujú</div>
      </div>
    </div>

    <div class="disclaimer">
      Toto je štatistický odhad založený na historických dátach (forma, vzájomné zápasy,
      priemer gólov), nie garancia výsledku. Športové stávkovanie nesie finančné riziko –
      stávkuj len sumy, ktoré si môžeš dovoliť stratiť.
    </div>
  `;
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

function teamStatCard(name, form, formScore, xg) {
  const pills = (form || "")
    .slice(-5)
    .split("")
    .map((r) => `<div class="form-pill ${r}">${r}</div>`)
    .join("");

  return `
    <div class="stat-card">
      <h4>${escapeHtml(name)}</h4>
      <div class="form-pills">${pills || '<span class="muted small">bez dát o forme</span>'}</div>
      <div class="stat-line"><span>Vážené skóre formy</span><strong>${formScore.toFixed(2)} / 3.00</strong></div>
      <div class="stat-line"><span>Očakávané góly</span><strong>${xg.toFixed(2)}</strong></div>
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

init();
