# T6 backtesting

History uses the specified [Pyth Benchmarks TradingView shim](https://benchmarks.pyth.network/v1/shims/tradingview/history).
`history({symbol,from,to,resolution:'60'})` takes Unix seconds and returns
chronological candles with millisecond `t` and exclusive `tClose`. Only completed
bars entirely inside the requested range are returned. Up to 20,000 bars are
requested in bounded chunks; gaps are preserved, never interpolated.

The desk's xStock symbols (for example `AAPLx` or `AAPL`) map to
`Equity.US.AAPL/USD`; crypto maps to `Crypto.SOL/USD`. Explicit Pyth crypto and
equity USD symbols are accepted. A missing symbol/range reports setup required.
Equity prices are the underlying reference, not historical xStock pool prices;
split adjustment is not assumed. Do not replay across corporate actions without
checking the reference path.

Completed responses are cached atomically beneath `appDataDir()/history/pyth-v1`
(Electron's userData directory, or the existing platform default). Each cache
entry includes the request URL, fetch timestamp and original Pyth payload.
Responses are validated on network reads and cache reads. Missing volume stays
missing, and all-zero oracle volume is reported as unavailable.

On 2026-11-12 the specified public shim returned HTTP 404 for both SOL history
and symbol metadata. This is an upstream availability error, not an empty or
successful backtest. The newer [Pyth OHLC API](https://docs.pyth.network/api-reference/historical-prices/history)
requires authentication; T6 does not silently replace its specified data source.

## Replay contract

`backtest({symbol,strategy,venue,from,to,resolution,initialCash,tradeUsd,slippageBps})`
returns trades, net dollar PnL, percentage maximum drawdown, win-rate fraction,
annualized Sharpe, time-exposure fraction and a millisecond equity curve.
Strategies are the six exact `BOOK` names, `book` (first firing strategy), or
`rule`. Every decision sees a prefix of completed candles and fills at the next
available open. Stops use high/low, stop wins ambiguous ties, stop gaps fill at
the worse open, and final positions close at the final bar's close.

Default capital is $10,000, maximum position notional $1,000, one unlevered
position. PnL subtracts both legs' fees, adverse slippage (default 10 bps per
fill) and actual historical funding payments. Phoenix funding uses its public
`/v1/funding/overview/{symbol}` USD-per-base-unit payments. Partial coverage is
labelled; Jupiter Perps reports **funding not modelled**, including borrow costs.
No current funding rate is projected backwards. Intrabar exits pay that whole
bar's funding because OHLC does not establish the exact exit time.

Fees use the T1 adapters: Phoenix standard taker metadata; Jupiter Perps' decoded
on-chain increase/decrease and impact math; Jupiter spot's actual routePlan fee
amounts in both directions. An undisclosed fee reports setup required, never
zero. These are **current observed schedules applied to the historical path**,
not reconstructed historical schedules. Price impact is represented only by the
stated fixed slippage model (plus Jupiter Perps' current impact fee). Network
fees/rent, historical liquidity and liquidations are excluded. Oracle-price
results are research estimates, not executable historical fills.

The book's trend gate uses only BTC bars closed by the decision time: the latest
BTC close vs 200 completed daily closes. Missing warm-up disables gated entries.
Pyth has no traded volume: volume-dependent strategies are disabled explicitly.
All rules use completed bars, with a bounded JSON expression format; no code or
`eval` is accepted. For example:

```json
{"symbol":"SOL","from":1794268800,"to":1794355200,"venue":"phoenix",
 "strategy":"rule","rule":{"name":"close above mean","side":"long",
 "entry":[{"left":{"indicator":"close"},"op":"gt","right":{"indicator":"sma","period":20}}],
 "exit":[{"left":{"indicator":"close"},"op":"lt","right":{"indicator":"sma","period":20}}],
 "stopPct":8,"takeProfitPct":16,"maxHoldMin":1440}}
```

Conditions in each array are ANDed. Indicators: close, SMA, EMA, RSI,
returnPct, relativeVolume; comparisons: lt/lte/gt/gte. Periods are 2–500 bars.
Warm-up or absent volume cannot satisfy a condition. Short rules require a perp
venue. Sharpe is null for zero variance or insufficient samples; win rate is
null for no trades. Exposure and drawdown include fees and funding; equity is
marked at each completed bar, not at unobserved intrabar prices.

## Prediction-market replay

`predictionBacktest({symbol,from,to,strike,liquidityUsdc,...})` tests a question
like “SOL above $X at hour H”, with `to` as expiry. **Liquidity is an explicit
model input, not fabricated historical pool data.** A balanced 50/50 pm-AMM curve
starts at the first Pyth candle; `marketState` accrues its real decay formula and
`quoteSwap` prices both sides including the protocol's 2% USDC fee. The one
model trade updates reserves; no invented external order flow is supplied.

The simple value strategy estimates terminal probability from trailing squared
Pyth log returns (default 20-bar lookback, zero-drift lognormal model), buys the
side whose expected payout exceeds cost by at least `minEdgePct` (default 2%),
and holds to expiry. Additional slippage haircuts received shares (default 10
bps). It reports predicted dollar/percentage edge and realized return, along
with trades, liquidation-value equity curve and the standard metrics. A quote
at a completed-bar close is possible because the pool model, unlike underlying
execution, does not consume a future candle. All probability inputs are prefixes.

This is a **counterfactual curve experiment on real underlying history**, not
empirical pm-AMM execution or a profitable-market claim. It requires contiguous
Pyth bars and a bar closing exactly at expiry, settles `close > strike` (ties NO),
and labels the difference from the keeper's exact timestamp/confidence oracle
resolution. It never signs, submits, or creates a real prediction market.
