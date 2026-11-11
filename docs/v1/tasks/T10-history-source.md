# T10: replace the dead Pyth Benchmarks history source

Read `docs/v1/SPEC.md` first. Remove nothing.

## The problem
`https://benchmarks.pyth.network/v1/shims/tradingview/history` now returns **HTTP 404** (Claude checked this on Nov 12). Because of it:
- the Trade chart shows "Pyth history unavailable: HTTP 404";
- the backtest live tests skip.

## The fix
1. **Change the history provider.** In `desk/main/history.mjs`, add a GeckoTerminal OHLCV provider: on-chain Solana pool candles, free, no key, about 30 requests a minute.
   - **Pool lookup:** for a mint, call `GET https://api.geckoterminal.com/api/v2/networks/solana/tokens/<mint>/pools` and pick the deepest pool quoted in USDC/USDT by `reserve_in_usd`. Cache that choice.
   - **Candles:** call `GET https://api.geckoterminal.com/api/v2/networks/solana/pools/<pool>/ohlcv/<minute|hour|day>?aggregate=<1|15|...>&limit=1000&before_timestamp=<ts>`, paging backwards.
   - **Check:** SOL/USDC on Orca, `Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE`, returned real hourly candles.
   - **Limits:** respect the rate limit with a shared limiter and a 429 backoff. Cache to the app data dir.
   - **Labels:** the chart and backtest name the source: "GeckoTerminal · <pool name> · <dex>".
2. **Keep Pyth as a fallback.** Pyth stays as a secondary provider: if it is ever reachable again, it is used for feeds that have no pool. A 404 is reported per provider, never hidden.
3. **Perps.** Perp markets chart the underlying's spot pool. Label it "spot reference for the perp", plus the venue's live mark.
4. **Re-run.** Re-run the backtest and history live tests until they pass against real data; any remaining skip must have a real reason. Update the counts in `TESTING.md`, and add a note in `docs/VENUES.md` and the CHANGELOG under a new `1.0.1` entry.
5. **Screenshot.** Re-shoot `docs/screens/v1/trade-*.png` so they show the real chart.

Commit per step, with no push. Report in under 15 lines.
