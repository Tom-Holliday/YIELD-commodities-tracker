const CACHE_TTL_SECONDS = 300;
const YAHOO_CHART_URL = "https://query2.finance.yahoo.com/v8/finance/chart";
const COMMODITY_CONFIG = [
  { symbol: "CL=F", name: "Crude Oil (WTI)", category: "Energy" },
  { symbol: "BZ=F", name: "Brent Crude", category: "Energy" },
  { symbol: "NG=F", name: "Natural Gas", category: "Energy" },

  { symbol: "GC=F", name: "Gold", category: "Metals" },
  { symbol: "SI=F", name: "Silver", category: "Metals" },
  { symbol: "HG=F", name: "Copper", category: "Metals" }
];

const SAMPLE_DATA = [
  { name: "Crude Oil (WTI)", symbol: "CL=F", price: 82.17, changePct: 1.42, category: "Energy" },
  { name: "Brent Crude", symbol: "BZ=F", price: 85.04, changePct: 1.11, category: "Energy" },
  { name: "Natural Gas", symbol: "NG=F", price: 2.31, changePct: -0.88, category: "Energy" },
  { name: "Gold", symbol: "GC=F", price: 2388.2, changePct: 0.64, category: "Metals" },
  { name: "Silver", symbol: "SI=F", price: 28.41, changePct: 0.27, category: "Metals" },
  { name: "Copper", symbol: "HG=F", price: 4.18, changePct: -0.34, category: "Metals" }
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    if (url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        service: "yield-commodities-worker",
        timestamp: new Date().toISOString()
      });
    }

    if (url.pathname === "/api/dashboard") {
      return handleDashboard(request, ctx);
    }

    return jsonResponse({ error: "Not found" }, { status: 404 });
  }
};

async function handleDashboard(request, ctx) {
  const cache = caches.default;
  const freshCacheKey = buildCacheKey(request, "fresh");
  const staleCacheKey = buildCacheKey(request, "stale");

  const freshCached = await cache.match(freshCacheKey);
  if (freshCached) {
    const headers = new Headers(freshCached.headers);
    headers.set("X-Cache", "HIT");
    addCors(headers);

    return new Response(freshCached.body, {
      status: freshCached.status,
      headers
    });
  }

  try {
    const data = await fetchYahooQuotes();
    const narrative = buildNarrative(data);

    const payload = {
      data,
      narrative,
      meta: {
        source: "Yahoo Finance",
        generatedAt: new Date().toISOString(),
        fallbackUsed: false,
        cacheTtlSeconds: CACHE_TTL_SECONDS
      }
    };

    const response = jsonResponse(payload, {
      headers: {
        "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`
      }
    });

    const staleResponse = jsonResponse(payload, {
      headers: {
        "Cache-Control": "public, max-age=86400"
      }
    });

    ctx.waitUntil(Promise.all([
      cache.put(freshCacheKey, response.clone()),
      cache.put(staleCacheKey, staleResponse.clone())
    ]));

    return withHeader(response, "X-Cache", "MISS");
  } catch (error) {
    const staleCached = await cache.match(staleCacheKey);

    if (staleCached) {
      const headers = new Headers(staleCached.headers);
      headers.set("X-Cache", "STALE");
      headers.set("X-Fallback", "stale-cache");
      addCors(headers);

      return new Response(staleCached.body, {
        status: staleCached.status,
        headers
      });
    }

    const fallbackData = SAMPLE_DATA.map(item => ({ ...item }));
    const narrative = buildNarrative(fallbackData);

    return jsonResponse({
      data: fallbackData,
      narrative,
      meta: {
        source: "Sample fallback",
        generatedAt: new Date().toISOString(),
        fallbackUsed: true,
        fallbackReason: error instanceof Error ? error.message : String(error),
        cacheTtlSeconds: CACHE_TTL_SECONDS
      }
    }, {
      headers: {
        "Cache-Control": "no-store",
        "X-Fallback": "sample-data"
      }
    });
  }
}

function buildCacheKey(request, type) {
  const url = new URL(request.url);
  url.pathname = `/__cache/dashboard/${type}`;
  url.search = "";
  return new Request(url.toString(), { method: "GET" });
}

async function fetchYahooQuotes() {
  const requests = COMMODITY_CONFIG.map(async (config) => {
    const url = `${YAHOO_CHART_URL}/${encodeURIComponent(config.symbol)}?interval=1d&range=5d`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://finance.yahoo.com/"
      },
      cf: {
        cacheTtl: 0,
        cacheEverything: false
      }
    });

    if (!response.ok) {
      throw new Error(`${config.symbol} chart request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    const meta = result?.meta;

    if (!meta) {
      throw new Error(`${config.symbol} missing chart meta`);
    }

    const price = Number(meta.regularMarketPrice);
    const previousClose = Number(meta.chartPreviousClose ?? meta.previousClose);

    if (!Number.isFinite(price) || !Number.isFinite(previousClose) || previousClose === 0) {
      throw new Error(`${config.symbol} missing usable price data`);
    }

    const changePct = ((price - previousClose) / previousClose) * 100;

    return {
      name: config.name,
      symbol: config.symbol,
      price: round(price, price >= 100 ? 2 : 4),
      changePct: round(changePct, 2),
      category: config.category
    };
  });

  const settled = await Promise.allSettled(requests);

  const normalized = settled
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);

  if (!normalized.length) {
    const reasons = settled
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason?.message || String(result.reason))
      .join(" | ");

    throw new Error(`No valid commodity quotes returned from chart endpoint. ${reasons}`);
  }

  return normalized;
}

function buildNarrative(data) {
  const sorted = [...data].sort((a, b) => b.changePct - a.changePct);

  const topGainers = sorted.filter(item => item.changePct > 0).slice(0, 3);
  const topLosers = [...sorted].slice().sort((a, b) => a.changePct - b.changePct).filter(item => item.changePct < 0).slice(0, 3);

  const energy = data.filter(item => item.category === "Energy");
  const metals = data.filter(item => item.category === "Metals");

  const energyAvgMove = average(energy.map(item => item.changePct));
  const metalsAvgMove = average(metals.map(item => item.changePct));

  const strongest = sorted[0] || null;
  const weakest = [...sorted].sort((a, b) => a.changePct - b.changePct)[0] || null;

  const summary = generateSummary({
    strongest,
    weakest,
    energyAvgMove,
    metalsAvgMove
  });

  return {
    topGainers,
    topLosers,
    sectorMoves: {
      Energy: round(energyAvgMove, 2),
      Metals: round(metalsAvgMove, 2)
    },
    summary
  };
}

function generateSummary({ strongest, weakest, energyAvgMove, metalsAvgMove }) {
  const intro = strongest
    ? `${strongest.name} is leading moves at ${formatSignedPct(strongest.changePct)}`
    : "Commodity markets are mixed";

  const laggard = weakest
    ? `while ${weakest.name} is the weakest contract at ${formatSignedPct(weakest.changePct)}`
    : "";

  let sectorLine = "";
  if (energyAvgMove > metalsAvgMove) {
    sectorLine = `Energy is outperforming metals, averaging ${formatSignedPct(energyAvgMove)} versus ${formatSignedPct(metalsAvgMove)}.`;
  } else if (metalsAvgMove > energyAvgMove) {
    sectorLine = `Metals are outperforming energy, averaging ${formatSignedPct(metalsAvgMove)} versus ${formatSignedPct(energyAvgMove)}.`;
  } else {
    sectorLine = `Energy and metals are moving broadly in line at ${formatSignedPct(energyAvgMove)}.`;
  }

  return `${intro}${laggard ? `, ${laggard}` : ""}. ${sectorLine}`.replace(/\s+/g, " ").trim();
}

function jsonResponse(data, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  addCors(headers);

  return new Response(JSON.stringify(data, null, 2), {
    status: options.status || 200,
    headers
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function addCors(headers) {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
}

function withHeader(response, key, value) {
  const headers = new Headers(response.headers);
  headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    headers
  });
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatSignedPct(value) {
  const n = round(value, 2);
  return `${n > 0 ? "+" : ""}${n}%`;
}