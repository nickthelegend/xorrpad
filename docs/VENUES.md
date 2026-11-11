# Phoenix perps: venue research

Observed 2026-11-12 (Asia/Kolkata). Phoenix is the chosen perps venue. This
confirms the existing decision; Drift is excluded by the project brief and
Jupiter Perps remains an optional second venue.

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

`desk/main/markets.solana.json` records the source URLs, observation time,
TradingFloor mapping, Phoenix market identities and every catalog spot mint.
`node tools/sync-solana-markets.mjs` refreshes it from the real public APIs.
Only market identities are saved; unrelated site configuration and wallet data
are excluded. Phoenix runtime discovery remains live, so a new market need not
wait for this snapshot to be regenerated.

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
