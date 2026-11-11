# T6: backtesting on real history

Read `docs/v1/SPEC.md` first.

1. **History.** Add `desk/main/history.mjs`, with real candles from the Pyth Benchmarks TradingView shim:
   `https://benchmarks.pyth.network/v1/shims/tradingview/history?symbol=Crypto.SOL/USD&resolution=60&from=..&to=..`
   - Use the equities symbols for stocks where they exist.
   - Cache to the app data dir.
2. **Engine.** Add `desk/main/backtest.mjs`:
   - It replays `strategies.mjs` strategies, and user-defined rule strategies, over the candles.
   - Fees come from the chosen venue's real fee schedule (Phoenix and Jupiter fees from T1).
   - Slippage is a stated model.
   - Perps include funding where history exists; otherwise say "funding not modelled".
   - Output: trades, PnL, max drawdown, win rate, Sharpe, exposure, and an equity curve.
   - No look-ahead. A test proves it: shift the data and check the results change accordingly.
3. **Prediction-market backtest.** For a market like "SOL above X at hour H", replay the pm-AMM pricing helpers from `pm-amm-helpers.mjs` against the real Pyth path and report the edge of a simple strategy.
4. **Surface.** Add `/backtest` endpoints and the agent's `backtest` tool. The UI page is in T5.
5. **Tests.** Use real Pyth history, and skip if Pyth is unreachable.

Make one commit per step.
