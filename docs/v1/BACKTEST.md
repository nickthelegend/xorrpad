# T6 backtesting

History now prefers real GeckoTerminal Solana pool OHLCV, with Pyth Benchmarks
as a separately labelled fallback. `history({symbol,from,to,resolution:'60'})`
takes Unix seconds and returns chronological candles with millisecond `t` and
exclusive `tClose`. Only completed bars entirely inside the requested range are
returned, up to 20,000 requested bars. Gaps remain unfilled.

Pool lookup uses exact catalog mint identities, the pinned wrapped BTC/ETH
underlyings, and actual xStock mints. It selects the greatest `reserve_in_usd`
among eligible USDC/USDT-quoted pools in the token endpoint's returned top pools,
then caches that selection for 24 hours. An `AAPLx` request retains the legacy
`Equity.US.AAPL/USD` symbol identity, but its provenance names the **AAPLx pool**;
it is tokenized-share history rather than a NYSE oracle path. Exact allowlisted
mint and qualified catalog identities are accepted without ticker guessing.

History labels are `GeckoTerminal · <pool name> · <DEX>`. USD OHLCV pages contain
up to 1000 rows and are fetched backward until the requested start or the
available archive boundary. No-swap intervals are omitted, not interpolated.
All existing resolutions remain: 30-minute and two-hour bars sum/aggregate only
complete consecutive 15-minute/hourly provider groups. `volumeUnit` is USD.
Raw responses are cached atomically beneath `appDataDir()/history/geckoterminal-v1`
with URL and fetch timestamp, and revalidated for each requested range. Shared
in-flight pages retain their raw payload so a narrow request cannot truncate a
concurrent wider request. Identical requested-window duplicates are deduplicated;
conflicting ones fail. A process-wide 2.1-second request queue and 429 backoff
respect the public API's approximate 30/minute allowance.

Pyth's crypto/equity symbols and the existing `pyth-v1` cache are preserved.
If no pool feed can be read, Pyth is attempted; its HTTP 404 and the pool-provider
reason are both exposed if neither succeeds. A fallback success keeps the failed
primary reason in warnings. The keeper's Pyth settlement is unaffected.

The public pool API returned HTTP 401 for an older BTC page. Already-read bars
remain usable only with `complete:false`, actual first/last/gap coverage and
explicit archive warnings. No missing price or volume is fabricated. Perp
replays label the path **spot reference for the perp**; the Trade chart displays
the separate current venue mark. Those candles are not historical perp fills.

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
fees/rent, historical liquidity and liquidations are excluded. Historical-price
results are research estimates, not executable historical fills.

The book's trend gate uses only BTC bars closed by the decision time: the latest
BTC close vs 200 completed daily closes. Missing warm-up disables gated entries.
Volume-dependent strategies are disabled when the selected provider has no usable volume; GeckoTerminal supplies actual pool USD volume.
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
starts at the first history candle; `marketState` accrues its real decay formula and
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
history bars and a bar closing exactly at expiry, settles `close > strike` (ties NO),
and labels the difference from the keeper's exact timestamp/confidence oracle
resolution. It never signs, submits, or creates a real prediction market.

## Authenticated HTTP and agent surface

- `GET /backtest`: strategy names, venues, defaults, rule format and assumptions.
- `GET /backtest/history?symbol=SOL&from=...&to=...&resolution=60`: cached real
  pool/oracle candles and provenance, including volume availability.
- `POST /backtest`: the strategy request documented above.
- `POST /backtest/predict`: prediction request; `to` is expiry, `strike` and
  `liquidityUsdc` required. Optional capital, slippage, lookback, minimum edge.

All use the existing bearer PAD_TOKEN authentication and method restrictions.
Invalid requests return 400; missing data/setup returns 503; upstream failure
returns 502. No endpoint accepts caller-supplied candles or fee overrides.
The agent's `backtest` tool supports the same fields, with optional
`kind:"predict"` selecting the prediction endpoint. Default kind is strategy;
BOOK names and rule schema are disclosed in its description/schema. T5 owns the
UI page; T6 changes only the backend/tool surface.

Run `npm run test:backtest --prefix desk` plus
`node --test desk/test/history.live.test.mjs`. Validation/arithmetic and live
venue checks run independently of history availability. Candle/cache, backward
pagination, aggregation, book/rule accounting, causality/data-shift, prediction
and HTTP/tool replay checks use real APIs; an unreachable dependency is skipped
with its actual reason. [TESTING.md](../../TESTING.md) records measured counts.
