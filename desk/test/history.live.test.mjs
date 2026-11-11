/** Real public API and disk cache. No injected fetch, responses, candles or fills. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  History,
  HistoryUnavailable,
  GECKO_HISTORY,
  UNDERLYING_MINTS,
} from "../main/history.mjs";
const dir = await mkdtemp(path.join(tmpdir(), "xorrpad-t10-history-")),
  history = new History({ dir });
after(() => rm(dir, { recursive: true, force: true }));
const to = 1794096000,
  from = to - 7 * 86400;
async function real(t, input) {
  try {
    return await history.get(input);
  } catch (e) {
    if (!(e instanceof HistoryUnavailable)) throw e;
    console.log("SKIP: " + e.message);
    t.skip(e.message);
    return null;
  }
}
test(
  "real mint-pinned stable-pool discovery, USD volume and persistent cache",
  { timeout: 120000 },
  async (t) => {
    const h = await real(t, { symbol: "SOL", from, to });
    if (!h) return;
    assert.equal(h.provider, "geckoterminal");
    assert.equal(h.mint, UNDERLYING_MINTS.SOL);
    assert.match(h.source, /GeckoTerminal · .+ · .+/);
    assert.equal(h.volumeUnit, "USD");
    assert.ok(h.candles.length > 100);
    assert.ok(h.candles.some((c) => c.volume > 0));
    const files = await readdir(history.dir),
      file = files.find((f) => f.startsWith("pool-"));
    const saved = JSON.parse(
      await readFile(path.join(history.dir, file), "utf8"),
    );
    assert.equal(
      saved.url,
      `${GECKO_HISTORY}/tokens/${h.mint}/pools?include=base_token,quote_token,dex`,
    );
    const candidates = saved.payload.data.filter(
      (p) =>
        p.relationships.base_token.data.id === `solana_${h.mint}` &&
        [
          "solana_EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          "solana_Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
        ].includes(p.relationships.quote_token.data.id),
    );
    assert.equal(
      h.pool.reserveUsd,
      Math.max(...candidates.map((p) => Number(p.attributes.reserve_in_usd))),
    );
    const repeated = await history.get({ symbol: "SOL", from, to });
    assert.deepEqual(repeated.candles, h.candles);
    assert.equal(repeated.networkRequests, 0);
    assert.ok(repeated.cacheHits >= 2);
    console.log(
      `REAL ${h.source}: ${h.candles.length} bars, cache verified, deepest returned stable pool ${h.pool.address}`,
    );
  },
);
test(
  "real OHLCV pages backward beyond 1000 bars with complete UTC coverage",
  { timeout: 120000 },
  async (t) => {
    const start = to - 1100 * 3600,
      h = await real(t, { symbol: "SOL", from: start, to });
    if (!h) return;
    assert.equal(h.candles.length, 1100);
    assert.equal(h.candles[0].t, start * 1000);
    assert.equal(h.candles.at(-1).tClose, to * 1000);
    assert.ok(h.candles.every((c, i) => !i || c.t === h.candles[i - 1].tClose));
    assert.equal(h.coverage.gaps, 0);
    const hit = await history.get({ symbol: "SOL", from: start, to });
    assert.equal(hit.networkRequests, 0);
    assert.deepEqual(hit.candles, h.candles);
    console.log(
      `REAL backward pagination ${h.candles.length} completed bars; no interpolation`,
    );
  },
);
test(
  "30-minute and two-hour bars aggregate only complete real provider groups",
  { timeout: 120000 },
  async (t) => {
    for (const [small, large, factor] of [
      ["15", "30", 2],
      ["60", "120", 2],
    ]) {
      const input = { symbol: "SOL", from: to - 86400, to },
        a = await real(t, { ...input, resolution: small });
      if (!a) return;
      const b = await real(t, { ...input, resolution: large });
      if (!b) return;
      assert.ok(b.candles.length > 0);
      for (const c of b.candles) {
        const group = a.candles.filter(
          (r) => r.t >= c.t && r.tClose <= c.tClose,
        );
        assert.equal(group.length, factor);
        assert.equal(c.open, group[0].open);
        assert.equal(c.close, group.at(-1).close);
        assert.equal(c.high, Math.max(...group.map((r) => r.high)));
        assert.equal(c.low, Math.min(...group.map((r) => r.low)));
        assert.equal(
          c.volume,
          group.reduce((n, r) => n + r.volume, 0),
        );
      }
    }
  },
);
test(
  "a real missing mint reports secondary Pyth availability separately",
  { timeout: 60000 },
  async () => {
    try {
      const h = await history.get({
        symbol: "XORRPADNOPINNEDHISTORY",
        from,
        to,
      });
      assert.equal(h.provider, "pyth");
      assert.equal(h.providers[0].provider, "geckoterminal");
      assert.equal(h.providers[0].status, "unavailable");
      assert.ok(h.warnings.length);
    } catch (e) {
      if (!(e instanceof HistoryUnavailable)) throw e;
      assert.equal(e.providers.length, 2);
      assert.match(
        e.providers[0].error,
        /GeckoTerminal: no pinned Solana mint/,
      );
      assert.match(e.providers[1].error, /Pyth/);
      console.log("REAL secondary provider report: " + e.message);
    }
  },
);
test(
  "concurrent ranges share a real page without truncating the wider request",
  { timeout: 120000 },
  async (t) => {
    let a, b;
    try {
      [a, b] = await Promise.all([
        history.get({ symbol: "SOL", from: to - 86400, to, resolution: "5" }),
        history.get({
          symbol: "SOL",
          from: to - 2 * 86400,
          to,
          resolution: "5",
        }),
      ]);
    } catch (e) {
      if (!(e instanceof HistoryUnavailable)) throw e;
      console.log("SKIP: " + e.message);
      t.skip(e.message);
      return;
    }
    assert.equal(a.candles.length, 288);
    assert.equal(b.candles.length, 576);
    assert.deepEqual(b.candles.slice(-288), a.candles);
    assert.equal(a.networkRequests + b.networkRequests, 1);
  },
);
