const API_CONFIG = {
  endpoint: "https://yield-commodities-proxy.yieldcommodities.workers.dev/api/dashboard",
  refreshMs: 60 * 1000
};

const SAMPLE_DATA = [
  { name: "Crude Oil (WTI)", symbol: "CL=F", price: 82.17, changePct: 1.42, category: "Energy", currency: "USD" },
  { name: "Brent Crude", symbol: "BZ=F", price: 85.04, changePct: 1.11, category: "Energy", currency: "USD" },
  { name: "Natural Gas", symbol: "NG=F", price: 2.31, changePct: -0.88, category: "Energy", currency: "USD" },
  { name: "Gold", symbol: "GC=F", price: 2388.2, changePct: 0.64, category: "Metals", currency: "USD" },
  { name: "Silver", symbol: "SI=F", price: 28.41, changePct: 0.27, category: "Metals", currency: "USD" },
  { name: "Copper", symbol: "HG=F", price: 4.18, changePct: -0.34, category: "Metals", currency: "USD" }
];

const state = {
  commodities: [],
  narrative: null,
  filteredQuery: "",
  lastUpdated: null,
  usingFallback: false
};

const el = {
  winnersList: document.getElementById("winners-list"),
  losersList: document.getElementById("losers-list"),
  commodityGroups: document.getElementById("commodity-groups"),
  searchInput: document.getElementById("search-input"),
  refreshBtn: document.getElementById("refresh-btn"),
  feedStatusText: document.getElementById("feed-status-text"),
  statusDot: document.getElementById("status-dot"),
  updatedAt: document.getElementById("updated-at"),
  narrativeLead: document.getElementById("narrative-lead"),
  narrativeSummary: document.getElementById("narrative-summary"),
  editorsNote: document.getElementById("editors-note"),
  energyBreadth: document.getElementById("energy-breadth"),
  metalsBreadth: document.getElementById("metals-breadth"),
  breadthSummary: document.getElementById("breadth-summary"),
  whatMattersList: document.getElementById("what-matters-list")
};

function formatPrice(value, currency = "USD") {
  if (!Number.isFinite(value)) return "—";

  if (value >= 1000) {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(value);
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatPct(value) {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function getChangeClass(value) {
  if (!Number.isFinite(value)) return "change-flat";
  if (value > 0) return "change-up";
  if (value < 0) return "change-down";
  return "change-flat";
}

function formatTime(timestamp) {
  if (!timestamp) return "Waiting for market feed";

  return new Date(timestamp).toLocaleString("en-GB", {
    hour12: false,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function setStatus(label, mode = "neutral") {
  el.feedStatusText.textContent = label;

  if (mode === "live") {
    el.statusDot.style.background = "#3dd68c";
    el.statusDot.style.color = "#3dd68c";
  } else if (mode === "fallback") {
    el.statusDot.style.background = "#ffb020";
    el.statusDot.style.color = "#ffb020";
  } else if (mode === "error") {
    el.statusDot.style.background = "#ff5c5c";
    el.statusDot.style.color = "#ff5c5c";
  } else {
    el.statusDot.style.background = "#888";
    el.statusDot.style.color = "#888";
  }
}

async function fetchDashboard() {
  const response = await fetch(API_CONFIG.endpoint, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Dashboard API failed: ${response.status}`);
  }

  return response.json();
}

function renderMovers() {
  const sorted = [...state.commodities]
    .filter((item) => Number.isFinite(item.changePct))
    .sort((a, b) => b.changePct - a.changePct);

  const winners = sorted.slice(0, 3);
  const losers = [...sorted].sort((a, b) => a.changePct - b.changePct).slice(0, 3);

  el.winnersList.innerHTML = winners.length
    ? winners.map(renderMoverRow).join("")
    : renderEmpty("No winner data available.");

  el.losersList.innerHTML = losers.length
    ? losers.map(renderMoverRow).join("")
    : renderEmpty("No loser data available.");
}

function renderMoverRow(item) {
  return `
    <div class="mover-row">
      <div>
        <div class="mover-name">${escapeHtml(item.name)}</div>
        <span class="mover-symbol">${escapeHtml(item.symbol)}</span>
      </div>
      <div class="price-block">
        <div class="price-value">${formatPrice(item.price, item.currency)}</div>
      </div>
      <div class="change-block">
        <div class="${getChangeClass(item.changePct)}">${formatPct(item.changePct)}</div>
      </div>
    </div>
  `;
}

function renderCommodityGroups() {
  const query = state.filteredQuery.trim().toLowerCase();

  const filtered = state.commodities.filter((item) => {
    if (!query) return true;
    const haystack = `${item.name} ${item.symbol} ${item.category}`.toLowerCase();
    return haystack.includes(query);
  });

  const groupsMap = filtered.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const groupNames = Object.keys(groupsMap).sort();

  if (!groupNames.length) {
    el.commodityGroups.innerHTML = renderEmpty("No commodities match your search.");
    attachAccordionEvents();
    return;
  }

  el.commodityGroups.innerHTML = groupNames
    .map((groupName, index) => {
      const rows = groupsMap[groupName].sort((a, b) => a.name.localeCompare(b.name));
      const body = rows.map(renderCommodityRow).join("");

      return `
        <article class="group-card ${index === 0 ? "open" : ""}">
          <button class="group-header" type="button">
            <div class="group-header-left">
              <span class="group-title">${escapeHtml(groupName)}</span>
              <span class="group-subtitle">${rows.length} instrument${rows.length > 1 ? "s" : ""}</span>
            </div>
            <span class="group-chevron">⌄</span>
          </button>
          <div class="group-body">
            ${body}
          </div>
        </article>
      `;
    })
    .join("");

  attachAccordionEvents();
}

function renderCommodityRow(item) {
  return `
    <div class="commodity-row">
      <div>
        <div class="commodity-name">${escapeHtml(item.name)}</div>
        <span class="commodity-symbol">${escapeHtml(item.symbol)}</span>
      </div>
      <div class="price-block">
        <div class="price-value">${formatPrice(item.price, item.currency)}</div>
      </div>
      <div class="change-block">
        <div class="${getChangeClass(item.changePct)}">${formatPct(item.changePct)}</div>
      </div>
    </div>
  `;
}

function renderNarrative(narrative) {
  state.narrative = narrative;

  const energyMove = narrative?.sectorMoves?.Energy;
  const metalsMove = narrative?.sectorMoves?.Metals;

  el.narrativeLead.textContent =
    narrative?.summary || "Commodities are mixed.";

  el.narrativeSummary.textContent =
    narrative?.summary || "No summary currently available.";

  el.editorsNote.textContent = state.usingFallback
    ? "Fallback mode is active. The dashboard remains usable while the live feed is unavailable."
    : "Server-side narrative is being generated by the Yahoo Finance Cloudflare Worker.";

  el.energyBreadth.textContent = formatPct(energyMove);
  el.metalsBreadth.textContent = formatPct(metalsMove);

  const breadthSummaryParts = [];
  if (Number.isFinite(energyMove)) {
    breadthSummaryParts.push(`Energy ${energyMove >= 0 ? "is firmer" : "is softer"} on average`);
  }
  if (Number.isFinite(metalsMove)) {
    breadthSummaryParts.push(`metals ${metalsMove >= 0 ? "are stronger" : "are weaker"} on average`);
  }

  el.breadthSummary.textContent = breadthSummaryParts.length
    ? `${breadthSummaryParts.join(", ")}.`
    : "Breadth snapshot unavailable.";

  const bullets = [];

  if (Array.isArray(narrative?.topGainers) && narrative.topGainers.length) {
    bullets.push(
      `Top gainer: ${narrative.topGainers[0].name} (${formatPct(narrative.topGainers[0].changePct)})`
    );
  }

  if (Array.isArray(narrative?.topLosers) && narrative.topLosers.length) {
    bullets.push(
      `Top loser: ${narrative.topLosers[0].name} (${formatPct(narrative.topLosers[0].changePct)})`
    );
  }

  if (Number.isFinite(energyMove) && Number.isFinite(metalsMove)) {
    bullets.push(
      energyMove > metalsMove
        ? "Energy is outperforming metals."
        : metalsMove > energyMove
          ? "Metals are outperforming energy."
          : "Energy and metals are moving in line."
    );
  }

  el.whatMattersList.innerHTML = (bullets.length ? bullets : ["No lead signals currently available."])
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");
}

function renderDashboard() {
  renderMovers();
  renderCommodityGroups();
  el.updatedAt.textContent = state.lastUpdated
    ? `Updated ${formatTime(state.lastUpdated)}`
    : "Waiting for market feed";
}

function renderEmpty(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function attachAccordionEvents() {
  const cards = document.querySelectorAll(".group-card");

  cards.forEach((card) => {
    const button = card.querySelector(".group-header");
    if (!button) return;

    button.addEventListener("click", () => {
      card.classList.toggle("open");
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function refreshDashboard() {
  setStatus("Refreshing", "neutral");
  el.refreshBtn.disabled = true;
  el.refreshBtn.textContent = "Refreshing...";

  try {
    const payload = await fetchDashboard();

    state.commodities = (payload.data || []).map((item) => ({
      ...item,
      currency: item.currency || "USD"
    }));

    state.narrative = payload.narrative || null;
    state.lastUpdated = payload.meta?.generatedAt || new Date().toISOString();
    state.usingFallback = Boolean(payload.meta?.fallbackUsed);

    renderNarrative(state.narrative);
    renderDashboard();

    setStatus(
      state.usingFallback ? "Fallback feed" : "Live feed",
      state.usingFallback ? "fallback" : "live"
    );
  } catch (error) {
    console.error("Dashboard refresh failed:", error);

    state.commodities = [...SAMPLE_DATA];
    state.narrative = {
      summary: "Live feed unavailable — fallback sample data is being displayed.",
      sectorMoves: {
        Energy: averageByCategory(state.commodities, "Energy"),
        Metals: averageByCategory(state.commodities, "Metals")
      },
      topGainers: [...state.commodities]
        .sort((a, b) => b.changePct - a.changePct)
        .slice(0, 3),
      topLosers: [...state.commodities]
        .sort((a, b) => a.changePct - b.changePct)
        .slice(0, 3)
    };
    state.lastUpdated = new Date().toISOString();
    state.usingFallback = true;

    renderNarrative(state.narrative);
    renderDashboard();
    setStatus("Fallback feed", "fallback");
  } finally {
    el.refreshBtn.disabled = false;
    el.refreshBtn.textContent = "Refresh now";
  }
}

function averageByCategory(rows, category) {
  const values = rows
    .filter((row) => row.category === category && Number.isFinite(row.changePct))
    .map((row) => row.changePct);

  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function bindEvents() {
  el.searchInput.addEventListener("input", (event) => {
    state.filteredQuery = event.target.value;
    renderCommodityGroups();
  });

  el.refreshBtn.addEventListener("click", () => {
    refreshDashboard();
  });
}

function init() {
  bindEvents();
  refreshDashboard();
  window.setInterval(refreshDashboard, API_CONFIG.refreshMs);
}

init();