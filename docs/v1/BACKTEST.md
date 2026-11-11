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
