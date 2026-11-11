# Phoenix perps: venue research

Observed 2026-11-12 (Asia/Kolkata). Phoenix is the chosen perps venue. This
confirms the existing decision; Drift is excluded by the project brief and
Jupiter Perps is now integrated as the second perps route in T1; the
research below preserves the Phoenix deployment evidence.

## Current SDK and public data

The official [Rise SDK](https://docs.phoenix.trade/sdk/rise.md) and
[public source](https://github.com/Ellipsis-Labs/rise-public/tree/master/ts)
expose `createPhoenixClient`, `client.api`, `client.exchange`,
`client.orderPackets` and `client.ixs`. This project pins npm
`@ellipsis-labs/rise@0.7.10`.

Real calls to [the market list](https://perp-api.phoenix.trade/v1/view/exchange/markets)
returned **109 markets**. The response includes each market's public key,
asset class, status, taker/maker fees, leverage tiers, funding configuration and
risk factors. [Latest market stats](https://perp-api.phoenix.trade/v1/markets/stats/latest)
provide mark prices and current/eight-hour/annualized funding. Join by the
returned symbol; do not maintain a restricted hand-picked perp allowlist.
The dynamic list includes crypto, equities and commodities.

The [official order guide](https://docs.phoenix.trade/sdk/orders.md) documents
`client.orderPackets.buildMarketOrderPacket` and
`client.ixs.buildPlaceMarketOrder`. These produce unsigned instruction data for
an explicit authority, trader PDA index and subaccount index. A live SDK probe
successfully built a SOL instruction for a throwaway public key: program
`EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih`, 10 accounts, 65 bytes.
Closing uses the opposite side with `OrderFlags.ReduceOnly`; quantity must come
from the actual open position, including its subaccount.

## Network and execution posture

No public Phoenix **perps** devnet deployment or API was found in the current
[docs index](https://docs.phoenix.trade/llms.txt), SDK configuration or official
examples. The documented mainnet program returned `value: null` from devnet
`getAccountInfo` at slot 521214189. This is evidence for using the mainnet
read-only fallback, not proof that no private test deployment exists. The old
Phoenix **spot** devnet SDK is a different program and is not a perps devnet.

Perps therefore use **mainnet read-only / unsigned build / simulation only**.
No signer, service-account credential, Privy session, embedded wallet or
transaction sender belongs in this desk adapter. SDK WebSockets are disabled;
read snapshots are refreshed no faster than 15 seconds. Simulations explicitly
use `sigVerify:false`; they are never submissions. A real fill is outside the
app: Nick must explicitly approve and sign using his own wallet.

Phoenix's exchange snapshot reports `gated: true`. Read data and instruction
construction work anonymously, but a successful simulated order needs an
existing registered, enabled and funded trader account and a fee-paying public
address. Missing accounts must report `Setup required: PHOENIX_AUTHORITY`.
See [account setup](https://docs.phoenix.trade/sdk/accounts.md) and
[onboarding](https://docs.phoenix.trade/sdk/register.md). The app does not call
onboarding routes that sign or send. Isolated-only markets require an isolated
subaccount; account indexes must be carried through opens, positions and closes.

The [SDK margin guide](https://docs.phoenix.trade/sdk/margin.md) distinguishes
hypothetical liquidation estimates from actual account-wide margin. Quotes
must label their assumptions, use live leverage tiers and fees, and never
present `entry ± entry/leverage` as an authoritative liquidation price. Cross
account collateral, other positions, funding and orders can change the actual
liquidation boundary. An unsigned order alone does not deposit collateral.

## perp.so market coverage

[perp.so](https://perp.so) now exposes a full
[spot catalog](https://perp.so/api/spot/asset-catalog), in addition to the
[TradingFloor book](https://perp.so/api/tradingfloor). The observed catalog
contained **7,550 mint identities**; the floor payload contained **16 distinct
asset labels** across trades and pitches. These are snapshots, not invented
fixtures or promises that illiquid tokens have executable routes.

`desk/main/markets.solana.json` now stores only the spot fields consumed by the
code: symbol, name, mint, asset class and whether a Jupiter quote is applicable.
`node tools/sync-solana-markets.mjs` refreshes those identities from the real
[spot catalog](https://perp.so/api/spot/asset-catalog). The earlier full snapshot
was recorded in commit `c353ad2`; its observed floor mapping is preserved below.
Phoenix discovery remains live and is not duplicated in this spot snapshot.

Jupiter mappings mean **quote required**, not a claimed successful fill. Use
exact mint addresses, fetch mint decimals from Solana, then obtain a real quote.
Duplicate symbols must not silently select the first token. Floor labels with
neither a Phoenix market nor a verified Solana mint are marked **not routable**.
For example, a same-named token in the catalog does not establish that a guest's
KET/NEIRO/CHONKY pitch refers to that mint. Equity suffixes are mapped to Phoenix
underlyings only when the catalog identifies an equity; `stORE` is never
silently treated as the same asset as `ORE`.

## Implemented integration

The adapter exposes every discovered Phoenix market, real depth-based quotes,
unsigned open/ReduceOnly-close builders, and position reads across all
subaccounts for a selected trader PDA index. `usd` is the requested collateral
sizing budget; target notional is `usd × leverage`, rounded down to base lots.
No deposit or account-wide leverage change is implied by an order. The SDK
liquidation estimate uses the applicable tier maximum, live maintenance/uPnL
factors, that budget and estimated entry fee; it is not an actual cross-account
liquidation guarantee.

The production and SDK beta program addresses were both absent on public
devnet. The beta check used `phDEVv4w6BcfkLrLNeXr8HhhgQxnxziVGXpGPcaadMf`
at devnet slot 521219273 and also returned `value: null`.

Spot routes pin every catalog mint, including tokenized equities beyond the
original xStock list. Historical liquidity warnings stay attached to their
identities; live quotes remain necessary. Price polling does not request all
7,550 tokens. The renderer received only a functional asset-class mapping fix.

The mainnet Phoenix / devnet pm-AMM pairing is proposal research, explicitly
not an economic hedge. The `/hedge` route never creates a transaction. It passes
the quoted proposal through the existing memory gate, with exact outcome
allowlist keys. See [measured tests and setup limits](../TESTING.md#worker-brief-2--phoenix-all-markets).


### Recorded TradingFloor mapping (2026-11-12)

| Floor label | Phoenix perp | Jupiter mint / status |
|---|---|---|
| AAVE | AAVE | `AavE1kKKnesPw4MuRJmJ9jZs9QzEE8CPxQ3ViczUDfc1` (live quote required) |
| ANYTHING | — | not routable |
| ARX | — | `ARXwZkNAtzPfdcoqQiduJn8EPv9fKiDfGn2KyggyDrFs` (live quote required) |
| BABAON | BABA | `1zvb9ELBFShBCWKEk5jRTJAaPAwtVt7quEXx1X4ondo` (live quote required) |
| BONK | — | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` (live quote required) |
| BP | BP | `BPxxfRCXkUVhig4HS1Lh7kZqV6SPJhzfEk4x6fVBjPCy` (live quote required) |
| CHONKY | — | not routable |
| HOOD | HOOD | `HooDYv5RewLRiMLnEVq3VJqdqxhuE6c5eYvqejMC3e9A` (live quote required) |
| KET | — | not routable |
| LLY | LLY | `LLYuwZ33keFihgwoxXsBawy31AiRFLFSva32TYq5TvD` (live quote required) |
| LLYX | LLY | `Xsnuv4omNoHozR6EEW5mXkw8Nrny5rB3jVfLqi6gKMH` (live quote required) |
| NEIRO | — | not routable |
| ORE | ORE | `oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp` (live quote required) |
| PAPER | — | not routable |
| SOL | SOL | `So11111111111111111111111111111111111111112` (live quote required) |
| TTWO | — | `TTWofwAge91oFhZs7kpQdyrVRkmevgM88xijGvQFbKo` (live quote required) |

## Jupiter Perps integration (T1 step 2)

`jupperps.mjs` reads SOL/ETH/BTC marks from the `/v2/market-stats` interface
used by the [official Jupiter CLI](https://github.com/jup-ag/cli/blob/d8d7386691535469f7d17705ebfc5f432b96feba/src/clients/PerpsClient.ts).
The [official perps docs](https://developers.jup.ag/docs/perps/index.md) still
label the API work in progress. Open/close builders call the CLI's unsigned
`positions/increase` and `positions/decrease` endpoints, never its execute endpoint.
They require an explicit funded owner; close first verifies position ownership.
Unsigned API transactions are checked for their fee payer and empty signatures.
No mainnet transaction is signed or submitted by this integration.

Anonymous quotes are **indicative**: live API mark, requested collateral × leverage,
and current on-chain opening and impact fees. They exclude collateral swaps,
rent, network fees and subsequent borrow costs. The API simulates again for the
funded owner at build time; an unfunded public-key probe returned HTTP 422
`insufficient_funds`. This is not an executable anonymous API quote.

The [Pool](https://developers.jup.ag/docs/perps/pool-account.md) and
[Custody](https://developers.jup.ag/docs/perps/custody-account.md) accounts supply
JLP AUM, available reserves, leverage/position limits and borrow rates. Short
borrow rates use USDC custody; longs use the asset custody. Both the linear and
jump borrow curves include outstanding lending debt. Impact fees include the
rolling 60-second imbalance buffer. These are point-in-time estimates.

`jupperps-accounts.json` contains only the Pool/Custody account layouts and their
transitive types, converted to modern Anchor IDL format from the reference
[IDL linked by Jupiter](https://github.com/julianfssen/jupiter-perps-anchor-idl-parsing/blob/630cfd72cad499f45453a53383d7ac6d3e09e022/src/idl/jupiter-perpetuals-idl.ts).
Borrow and fee math follows that revision's `get-borrow-fee-and-funding-rate.ts`
and `price-impact-fee.ts`. Account owner, discriminator, asset mint and pool are
checked before use. No provider, wallet or secret key is instantiated.

## T1 unified aggregator

`desk/main/aggregate.mjs` exports `route({kind, market, side, size, leverage?})`
and `venues()`. All matching venues are queried concurrently, with a 25-second
per-venue deadline. `best` is null if none quote; `alternatives` retains errors,
unlisted markets and successful runners-up. No failed venue receives a quote.

| Venue | Kind | Markets | Network | Signing status |
|---|---|---|---|---|
| Jupiter spot | spot | 7,549 pinned, unambiguous catalog identities; real quote required per mint | Solana mainnet-beta | unsigned transaction, external owner wallet |
| Meteora direct DLMM | spot | live USDC pool discovery; 6,985 distinct mints in the recorded health run | Solana mainnet-beta | unsigned SDK swap for explicit owner |
| Phoenix | perp | all 109 discovered markets, including SOL | Solana mainnet-beta | unsigned open / ReduceOnly close; registered funded trader required |
| Jupiter Perps | perp | SOL, ETH, BTC | Solana mainnet-beta | unsigned API open/close for funded explicit owner; anonymous quotes indicative |
| pm-AMM | predict | 95 live mUSDC outcomes in the recorded health run | Solana devnet | unsigned swap/create/claim, external owner wallet |

Counts are observations, not availability guarantees. Meteora discovery counts
all returned USDC-pair mint identities, while routing accepts only exact catalog
mint identities. `/venues` probes a real SOL Jupiter quote; its Jupiter market
count is labelled as the pinned catalog count. Other counts come from current
venue discovery. Unreachable venues return `ok:false`, `marketCount:null`, and
an error. A successful health check does not imply a funded trading account.

Meteora uses the current public [DLMM pools API](https://docs.meteora.ag/api-reference/dlmm/pools/pools.md)
for paginated discovery and TVL. The official
[DLMM SDK](https://docs.meteora.ag/developer-guides/dlmm/typescript-sdk/getting-started.md)
reads pool accounts and bins, calculates quotes, and builds unsigned swaps.
Exact mints are checked against on-chain pool state. Quotes compare the three
highest-TVL direct USDC pools; that search boundary and each failed pool are
returned. They reject partial fills. SDK transaction construction refreshes the
quote, owner and blockhash; compute estimation may report an unfunded account
while still constructing an unsigned transaction. DAMM v2 is deferred under
T1's optional condition: the [DAMM v2 SDK](https://docs.meteora.ag/developer-guides/damm-v2/typescript-sdk/getting-started.md)
is a separate `@meteora-ag/cp-amm-sdk` integration,
with different discovery, state and dynamic-fee handling, rather than a DLMM
SDK option. Jupiter can still route supported DAMM pools.

Authenticated API:

- `GET /route?kind=spot&market=SOL&side=buy&size=10`
- `GET /route?kind=perp&market=SOL&side=long&size=10&leverage=2`
- `GET /route?kind=predict&market=<market public key>&side=yes&size=0.1`
- `GET /venues`
- `POST /propose` with `{kind, market, side, size, leverage?}` creates a routed,
  gated, manually pending agent proposal; it never signs or auto-accepts.

For **`route()`**, spot `size` is input units: USDC for buys, base tokens for
sells. Perp `size` is USD collateral; notional is collateral × leverage.
Prediction `size` is devnet mUSDC. For **`/propose` and pad keys**, sizing is the
existing USD budget; sell budgets become identical base-token input amounts
across venues using a live reference quote and available remembered holdings.
The returned `sizeUnit` spells out the router input denomination.

Quotes return price, fees, impact, liquidity, venue, network and `why`. Spot
selection maximizes output for the same input; route fees are already included.
Unknown separate Jupiter fees or liquidity remain null with an explanation.
Perp selection compares entry price including opening fees per base unit;
ongoing borrow/funding, collateral conversion, rent and network costs are not
ranked. Phoenix liquidity means visible orderbook depth; Jupiter Perps liquidity
means JLP AUM; DLMM liquidity means API pool TVL; pm-AMM liquidity means vault
mUSDC. These metrics are labelled and are not interchangeable depth measures.

BUY, SELL, LONG, SHORT, voice orders, scans, strategy evaluation and the agent
proposal endpoint use the shared `propose()` path. Pad key requests can include
`market` and `leverage`, e.g. `{id:"long",market:"SOL",leverage:2}`. Leverage
permission defaults to 1× until `limits.max_leverage` is set. `limits.venues`,
when present, is an exact venue allowlist; `limits.cooldown_seconds` gates after
executed journal entries. Existing market/rule/per-trade/day limits still apply.
A venue refusal does not silently choose a different venue. Accepting reruns
routing and the gate against current memory, then builds only the selected
venue's unsigned transaction. YES/NO and other pad controls take priority over
same-named catalog tickers. Rejections, quote-only results and unsigned
handoffs remain distinct from fills. Public owner setup uses `SOLANA_ADDRESS`,
`PHOENIX_AUTHORITY` or `JUPPERPS_AUTHORITY`; no signer is created here.


## 1.0.1: on-chain history for charts and research

T10 observed real, key-free responses from the
[GeckoTerminal public API](https://api.geckoterminal.com/docs/index.html).
The desk resolves an exact pinned Solana mint, reads its
[token pools](https://api.geckoterminal.com/api/v2/networks/solana/tokens/So11111111111111111111111111111111111111112/pools?include=base_token,quote_token,dex),
and selects the greatest `reserve_in_usd` among the returned pools with that
base mint and the canonical USDC or USDT quote mint. This is the deepest eligible
pool in the endpoint's top-pool response, not a claim to enumerate every pool.
The selected pool is cached for 24 hours. Symbols alone never authorize a
similarly named token. BTC/ETH use the wrapped mint identities already pinned
by the Jupiter Perps adapter; xStock history uses the actual tokenized share.

SOL selected **SOL / USDC · Orca**, pool
`Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE`.
[Pool OHLCV](https://docs.coingecko.com/reference/pool-ohlcv-contract-address)
is fetched backward, up to 1000 rows per call, in USD with no empty-interval
filling. A process-wide queue starts at most one public request every 2.1 seconds;
429 responses honor Retry-After or use 30/60-second backoff. Completed raw
responses are cached atomically in app data, with URL/timestamp provenance.
30-minute and two-hour resolutions aggregate complete real 15-minute/hourly
bars; missing groups are omitted. Conflicting candles inside the requested
window fail validation rather than choosing a price.

Chart/replay labels name **GeckoTerminal · pool name · DEX**. Perps explicitly
show **spot reference for the perp**, separately from the venue's live mark.
These are underlying spot candles, not historical executable perp prices.
Pyth Benchmarks remains secondary when a pool feed is unavailable. Both provider
reasons are returned if it also fails; its actual HTTP 404 is never converted
into an empty successful backtest. No Pyth credential is needed for pool reads,
and the keeper's exact-expiry Pyth resolution remains unchanged.

The public service denied an older BTC history page with HTTP 401. A usable
prefix is returned only with `complete:false`, actual coverage and the provider
error in warnings; no missing bars are invented. Insufficient BTC daily warm-up
disables the existing 200-day gate. See [replay limits](v1/BACKTEST.md) and
[measured testing](../TESTING.md) for the actual run.
