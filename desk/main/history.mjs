/** Real Solana pool history, with a separately labelled Pyth provider. */
import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { appDataDir } from "./permissions.mjs";
import { MARKETS } from "./markets.mjs";
import { tokenOf } from "./spot-book.mjs";

export const PYTH_HISTORY =
  "https://benchmarks.pyth.network/v1/shims/tradingview/history";
export const RESOLUTIONS = Object.freeze({
  1: 60,
  5: 300,
  15: 900,
  30: 1800,
  60: 3600,
  120: 7200,
  240: 14400,
  "1D": 86400,
});
export class HistoryUnavailable extends Error {
  constructor(message, options) {
    super(`History unavailable: ${message}`, options);
    this.status = 502;
  }
}
export function pythSymbol(value) {
  if (typeof value !== "string" || !value.trim())
    throw new Error("invalid symbol");
  if (/^(Crypto\.[A-Z0-9.]+|Equity\.[A-Z]{2}\.[A-Z0-9.]+)\/USD$/.test(value))
    return value;
  const ticker = value.toUpperCase().replace(/-PERP$/, "");
  if (!/^[A-Z0-9]{1,24}$/.test(ticker)) throw new Error("invalid symbol");
  const equity = Object.entries(MARKETS).find(
    ([s, m]) =>
      m.class === "equity" &&
      [s.toUpperCase(), s.replace(/x$/i, "").toUpperCase()].includes(ticker),
  );
  return equity
    ? `Equity.US.${equity[0].replace(/x$/i, "").toUpperCase()}/USD`
    : `Crypto.${ticker}/USD`;
}
export function historyRequest({ symbol, from, to, resolution = "60" } = {}) {
  symbol = historySymbol(symbol);
  resolution = String(resolution) === "D" ? "1D" : String(resolution);
  const step = RESOLUTIONS[resolution];
  if (!step) throw new Error("invalid resolution");
  if (
    ![from, to].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    from >= to ||
    to * 1000 > Date.now()
  )
    throw new Error("from/to must be past Unix seconds with from < to");
  if ((to - from) / step > 20000)
    throw new Error("history range must be at most 20000 bars");
  return { symbol, from, to, resolution, step };
}
function decode(j, { from, to, step }) {
  if (j?.s === "no_data") return [];
  if (j?.s !== "ok") throw new Error("invalid Pyth history payload");
  if (
    !["t", "o", "h", "l", "c"].every(
      (k) => Array.isArray(j[k]) && j[k].length === j.t.length,
    ) ||
    (j.v != null && (!Array.isArray(j.v) || j.v.length !== j.t.length))
  )
    throw new Error("invalid Pyth history arrays");
  return j.t
    .map((t, i) => {
      const [open, high, low, close] = ["o", "h", "l", "c"].map((k) => j[k][i]);
      const volume = j.v?.[i] ?? null;
      if (
        !Number.isSafeInteger(t) ||
        t < 0 ||
        (i && t <= j.t[i - 1]) ||
        ![open, high, low, close].every((n) => Number.isFinite(n) && n > 0) ||
        high < Math.max(open, close) ||
        low > Math.min(open, close) ||
        high < low ||
        (volume !== null && (!Number.isFinite(volume) || volume < 0))
      )
        throw new Error("invalid Pyth candle");
      return {
        t: t * 1000,
        tClose: (t + step) * 1000,
        open,
        high,
        low,
        close,
        volume,
      };
    })
    .filter((c) => c.t >= from * 1000 && c.tClose <= to * 1000);
}
export class PythHistory {
  constructor({ dir = appDataDir() } = {}) {
    this.dir = path.join(dir, "history", "pyth-v1");
  }
  async get(input) {
    const req = historyRequest(input),
      rows = new Map();
    let cacheHits = 0,
      networkRequests = 0;
    for (let from = req.from; from < req.to;) {
      const part = {
        ...req,
        from,
        to: Math.min(req.to, Math.floor(from / req.step + 1000) * req.step),
      };
      const query = new URLSearchParams({
        symbol: req.symbol,
        resolution: req.resolution,
        from: String(part.from),
        to: String(part.to),
      });
      const url = `${PYTH_HISTORY}?${query}`;
      const file = path.join(
        this.dir,
        createHash("sha256").update(url).digest("hex") + ".json",
      );
      let candles;
      try {
        const saved = JSON.parse(await readFile(file, "utf8"));
        if (saved.url !== url) throw new Error("cache provenance mismatch");
        candles = decode(saved.payload, part);
        cacheHits++;
      } catch (e) {
        if (e.code !== "ENOENT") await unlink(file).catch(() => {});
      }
      if (!candles) {
        let r;
        try {
          r = await fetch(url, { signal: AbortSignal.timeout(15000) });
        } catch (e) {
          throw new HistoryUnavailable(`Pyth Benchmarks: ${e.message}`, {
            cause: e,
          });
        }
        if (!r.ok)
          throw new HistoryUnavailable(`Pyth Benchmarks: HTTP ${r.status}`);
        const payload = await r.json(),
          decoded = decode(payload, part);
        networkRequests++;
        candles = decoded;
        if (candles.length) {
          await mkdir(this.dir, { recursive: true, mode: 0o700 });
          const tmp = file + "." + randomUUID() + ".tmp";
          try {
            await writeFile(
              tmp,
              JSON.stringify({
                url,
                fetchedAt: new Date().toISOString(),
                payload,
              }),
              { mode: 0o600 },
            );
            await rename(tmp, file);
          } finally {
            await unlink(tmp).catch(() => {});
          }
        }
      }
      for (const c of candles) rows.set(c.t, c);
      from = part.to;
    }
    const candles = [...rows.values()].sort((a, b) => a.t - b.t);
    if (!candles.length)
      throw new Error(
        `Setup required: Pyth history for ${req.symbol} in the requested range`,
      );
    return {
      provider: "pyth",
      source: "Pyth Benchmarks",
      sourceUrl: PYTH_HISTORY,
      symbol: req.symbol,
      resolution: req.resolution,
      from: req.from,
      to: req.to,
      cacheHits,
      networkRequests,
      volumeAvailable: candles.some((c) => c.volume > 0),
      candles,
    };
  }
}

export const GECKO_HISTORY =
  "https://api.geckoterminal.com/api/v2/networks/solana";
export const HISTORY_SOURCE =
  "GeckoTerminal Solana pools; Pyth Benchmarks secondary";
// The same wrapped underlying identities used by our Jupiter Perps adapter.
export const UNDERLYING_MINTS = Object.freeze({
  SOL: "So11111111111111111111111111111111111111112",
  BTC: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
  ETH: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
});
const STABLE_MINTS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
]);
const POOL_TTL = 24 * 3600000;
const FORMATS = {
  1: ["minute", 1, 60],
  5: ["minute", 5, 300],
  15: ["minute", 15, 900],
  30: ["minute", 15, 900],
  60: ["hour", 1, 3600],
  120: ["hour", 1, 3600],
  240: ["hour", 4, 14400],
  "1D": ["day", 1, 86400],
};
function historySymbol(value) {
  // Keep exact qualified catalog identities; never resolve repeated tickers by search.
  if (
    typeof value === "string" &&
    (value.startsWith("mint:") ||
      value.includes("@") ||
      /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value))
  ) {
    const token = tokenOf(value.replace(/^mint:/, ""));
    return `mint:${token.mint}`;
  }
  return pythSymbol(value);
}
export function historyMint(symbol) {
  if (symbol.startsWith("mint:")) return tokenOf(symbol.slice(5)).mint;
  const ticker = symbol
    .replace(/^Crypto\./, "")
    .replace(/^Equity\.[A-Z]{2}\./, "")
    .replace(/\/USD$/, "");
  if (symbol.startsWith("Crypto.") && UNDERLYING_MINTS[ticker])
    return UNDERLYING_MINTS[ticker];
  const equity = Object.values(MARKETS).find(
    (m) =>
      m.class === "equity" &&
      m.symbol.replace(/x$/i, "").toUpperCase() === ticker,
  );
  try {
    return equity?.mint || tokenOf(ticker).mint;
  } catch {
    return null;
  }
}

// One queue for all History instances in this process, including retries.
// 2.1s between request starts is below the public ~30/minute allowance.
let geckoTail = Promise.resolve(),
  nextGeckoAt = 0;
const inflight = new Map();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function geckoJson(url) {
  const task = geckoTail.then(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await pause(Math.max(0, nextGeckoAt - Date.now()));
      nextGeckoAt = Date.now() + 2100;
      let response;
      try {
        response = await fetch(url, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(20000),
        });
      } catch (e) {
        throw new HistoryUnavailable(`GeckoTerminal: ${e.message}`, {
          cause: e,
        });
      }
      if (response.status === 429) {
        const header = response.headers.get("retry-after"),
          seconds = Number(header);
        const retry = header
          ? Number.isFinite(seconds)
            ? seconds * 1000
            : Date.parse(header) - Date.now()
          : 30000 * 2 ** attempt;
        nextGeckoAt = Math.max(
          nextGeckoAt,
          Date.now() + Math.min(60000, Math.max(2100, retry || 30000)),
        );
        await response.body?.cancel();
        if (attempt < 2) continue;
      }
      if (!response.ok)
        throw new HistoryUnavailable(`GeckoTerminal: HTTP ${response.status}`);
      return response.json();
    }
  });
  geckoTail = task.catch(() => {});
  return task;
}
async function cachedGecko(
  dir,
  url,
  { prefix, ttl = Infinity, decode },
  counts,
) {
  const file = path.join(
    dir,
    prefix + "-" + createHash("sha256").update(url).digest("hex") + ".json",
  );
  try {
    const saved = JSON.parse(await readFile(file, "utf8"));
    if (
      saved.url !== url ||
      !Number.isFinite(Date.parse(saved.fetchedAt)) ||
      Date.now() - Date.parse(saved.fetchedAt) >= ttl
    )
      throw new Error("cache expired or provenance mismatch");
    const value = decode(saved.payload);
    counts.cacheHits++;
    return value;
  } catch (e) {
    if (e.code !== "ENOENT") await unlink(file).catch(() => {});
  }
  let job = inflight.get(file);
  if (!job) {
    job = (async () => {
      const payload = await geckoJson(url),
        value = decode(payload);
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const tmp = file + "." + randomUUID() + ".tmp";
      try {
        await writeFile(
          tmp,
          JSON.stringify({ url, fetchedAt: new Date().toISOString(), payload }),
          { mode: 0o600 },
        );
        await rename(tmp, file);
      } finally {
        await unlink(tmp).catch(() => {});
      }
      return value;
    })();
    inflight.set(file, job);
    job
      .finally(() => {
        if (inflight.get(file) === job) inflight.delete(file);
      })
      .catch(() => {});
    counts.networkRequests++;
  } else counts.cacheHits++;
  return job;
}
export function selectPool(payload, mint) {
  if (!Array.isArray(payload?.data))
    throw new Error("invalid GeckoTerminal pool payload");
  const included = new Map(
    (payload.included || []).map((row) => [row.id, row]),
  );
  const candidates = payload.data.filter(
    (p) =>
      p.relationships?.base_token?.data?.id === `solana_${mint}` &&
      STABLE_MINTS.has(
        p.relationships?.quote_token?.data?.id?.replace(/^solana_/, ""),
      ) &&
      Number(p.attributes?.reserve_in_usd) > 0 &&
      /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(p.attributes?.address),
  );
  candidates.sort(
    (a, b) =>
      Number(b.attributes.reserve_in_usd) -
        Number(a.attributes.reserve_in_usd) || a.id.localeCompare(b.id),
  );
  const p = candidates[0];
  if (!p) return null;
  const dexId = p.relationships.dex?.data?.id;
  return {
    address: p.attributes.address,
    mint,
    quoteMint: p.relationships.quote_token.data.id.replace(/^solana_/, ""),
    name: p.attributes.name,
    dex: included.get(dexId)?.attributes?.name || dexId,
    reserveUsd: Number(p.attributes.reserve_in_usd),
    selectionBasis:
      "Largest reserve_in_usd among mint-base, USDC/USDT-quote pools returned by the token top-pools endpoint",
  };
}
function decodeGecko(payload, mint, step) {
  const list = payload?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(list) || payload.meta?.base?.address !== mint)
    throw new Error("invalid GeckoTerminal OHLCV payload or base mint");
  if (!STABLE_MINTS.has(payload.meta?.quote?.address))
    throw new Error("invalid GeckoTerminal quote mint");
  const candles = list
    .map((row) => {
      if (!Array.isArray(row) || row.length !== 6)
        throw new Error("invalid GeckoTerminal OHLCV row");
      const [t, open, high, low, close, volume] = row;
      if (
        !Number.isSafeInteger(t) ||
        t < 0 ||
        t % step !== 0 ||
        ![open, high, low, close].every((v) => Number.isFinite(v) && v > 0) ||
        high < Math.max(open, close) ||
        low > Math.min(open, close) ||
        high < low ||
        !Number.isFinite(volume) ||
        volume < 0
      )
        throw new Error("invalid GeckoTerminal candle");
      return {
        t: t * 1000,
        tClose: (t + step) * 1000,
        open,
        high,
        low,
        close,
        volume,
      };
    })
    .sort((a, b) => a.t - b.t);
  if (candles.some((c, i) => i && c.t === candles[i - 1].t))
    throw new Error("duplicate GeckoTerminal candle");
  return candles;
}
function aggregateBars(candles, sourceStep, targetStep) {
  if (sourceStep === targetStep) return candles;
  const groups = new Map();
  for (const c of candles) {
    const t = Math.floor(c.t / 1000 / targetStep) * targetStep * 1000;
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t).push(c);
  }
  return [...groups.entries()].flatMap(([t, rows]) => {
    if (
      rows.length !== targetStep / sourceStep ||
      rows.some((r, i) => r.t !== t + i * sourceStep * 1000)
    )
      return [];
    return [
      {
        t,
        tClose: t + targetStep * 1000,
        open: rows[0].open,
        high: Math.max(...rows.map((r) => r.high)),
        low: Math.min(...rows.map((r) => r.low)),
        close: rows.at(-1).close,
        volume: rows.reduce((sum, r) => sum + r.volume, 0),
      },
    ];
  });
}
export class GeckoHistory {
  constructor({ dir = appDataDir() } = {}) {
    this.dir = path.join(dir, "history", "geckoterminal-v1");
  }
  async get(input) {
    const req = historyRequest(input),
      mint = historyMint(req.symbol),
      counts = { cacheHits: 0, networkRequests: 0 };
    if (!mint)
      throw new HistoryUnavailable(
        `GeckoTerminal: no pinned Solana mint for ${req.symbol}`,
      );
    const lookupUrl = `${GECKO_HISTORY}/tokens/${mint}/pools?include=base_token,quote_token,dex`;
    const pool = await cachedGecko(
      this.dir,
      lookupUrl,
      { prefix: "pool", ttl: POOL_TTL, decode: (j) => selectPool(j, mint) },
      counts,
    );
    if (!pool)
      throw new HistoryUnavailable(
        `GeckoTerminal: no USDC/USDT-quoted pool for ${mint}`,
      );
    const [unit, aggregate, sourceStep] = FORMATS[req.resolution],
      rows = new Map();
    let before = req.to - 1;
    while (before >= req.from) {
      const query = new URLSearchParams({
        aggregate,
        limit: 1000,
        before_timestamp: before,
        currency: "usd",
        token: "base",
        include_empty_intervals: false,
      });
      const url = `${GECKO_HISTORY}/pools/${pool.address}/ohlcv/${unit}?${query}`;
      const page = await cachedGecko(
        this.dir,
        url,
        { prefix: "ohlcv", decode: (j) => decodeGecko(j, mint, sourceStep) },
        counts,
      );
      if (!page.length) break;
      for (const c of page)
        if (c.t >= req.from * 1000 && c.tClose <= req.to * 1000)
          rows.set(c.t, c);
      const oldest = page[0].t / 1000;
      if (oldest >= before)
        throw new Error("GeckoTerminal history pagination did not advance");
      if (oldest <= req.from) break;
      before = oldest - 1;
    }
    const candles = aggregateBars(
      [...rows.values()].sort((a, b) => a.t - b.t),
      sourceStep,
      req.step,
    );
    if (!candles.length)
      throw new HistoryUnavailable(
        `GeckoTerminal: no completed candles for ${req.symbol} in requested range`,
      );
    const gaps = candles
      .slice(1)
      .filter((c, i) => c.t !== candles[i].tClose).length;
    return {
      provider: "geckoterminal",
      source: `GeckoTerminal · ${pool.name} · ${pool.dex}`,
      sourceUrl: lookupUrl,
      pool,
      symbol: req.symbol,
      mint,
      resolution: req.resolution,
      from: req.from,
      to: req.to,
      ...counts,
      volumeAvailable: candles.some((c) => c.volume > 0),
      volumeUnit: "USD",
      coverage: {
        firstOpen: candles[0].t,
        lastClose: candles.at(-1).tClose,
        gaps,
        requestedBars: Math.floor((req.to - req.from) / req.step),
        returnedBars: candles.length,
      },
      aggregation:
        sourceStep === req.step
          ? "Provider OHLCV"
          : `${req.step / sourceStep} consecutive provider ${sourceStep}s bars; incomplete groups omitted`,
      warnings: [
        ...(gaps
          ? ["No-swap intervals are omitted, never filled or interpolated."]
          : []),
        ...(candles[0].t > req.from * 1000
          ? ["Requested start predates the available pool history."]
          : []),
      ],
      candles,
    };
  }
}
export class History extends GeckoHistory {
  constructor(options = {}) {
    super(options);
    this.pyth = new PythHistory(options);
  }
  async get(input) {
    const req = historyRequest(input);
    if (input.kind !== undefined && !["spot", "perp"].includes(input.kind))
      throw new Error("invalid history kind");
    const perp =
      input.kind === "perp" || ["phoenix", "jupperps"].includes(input.venue);
    let geckoError;
    try {
      const result = await super.get(req);
      return {
        ...result,
        reference: perp ? "spot reference for the perp" : "on-chain spot pool",
        warnings: [
          ...result.warnings,
          ...(perp
            ? [
                "Spot pool candles are an underlying reference, not historical perpetual fills or marks.",
              ]
            : []),
        ],
        providers: [{ provider: "geckoterminal", status: "used" }],
      };
    } catch (e) {
      if (!(e instanceof HistoryUnavailable)) throw e;
      geckoError = e.message.replace(/^History unavailable: /, "");
    }
    const providers = [
      { provider: "geckoterminal", status: "unavailable", error: geckoError },
    ];
    try {
      if (req.symbol.startsWith("mint:"))
        throw new HistoryUnavailable(
          "Pyth Benchmarks: no feed identity for exact mint " +
            req.symbol.slice(5),
        );
      const result = await this.pyth.get(req);
      return {
        ...result,
        reference: perp ? "oracle reference for the perp" : "oracle history",
        providers: [...providers, { provider: "pyth", status: "used" }],
        warnings: [geckoError],
      };
    } catch (e) {
      if (
        !(e instanceof HistoryUnavailable) &&
        !e.message.startsWith("Setup required:")
      )
        throw e;
      const pythError = e.message.replace(/^History unavailable: /, "");
      const error = new HistoryUnavailable(geckoError + "; " + pythError);
      error.providers = [
        ...providers,
        { provider: "pyth", status: "unavailable", error: pythError },
      ];
      throw error;
    }
  }
}
export const history = (input) => new History().get(input);
