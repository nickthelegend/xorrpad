# xorrpad

**Wall Street closes. Your desk doesn't.**

A physical trading terminal for tokenized stocks. Fourteen keys, a knob, a
microphone and a 2.8" panel, sitting next to your keyboard — quoting NVDAx at
3am on a Sunday, when the exchange that prices NVDA has been shut for 40 hours.

Two thirds of tokenized-equity volume happens while the underlying listing is
closed. That gap is the entire product.

![the pad](docs/pad.jpg)

---

## What it does

Press a key, and an agent proposes a trade. The proposal goes through a gate
built only from what the pad remembers — your risk limits, your allowlist, what
you already hold, what you have already spent today, and the rules it learned
from your own past refusals. If the gate allows it, the panel asks you to
confirm.

Press ✓ and it builds the transaction. **It does not sign it.** See
[Signing](#signing).

```
  ┌─────────────────────────────────────────────┐
  │ NVDAx           [SOLANA]      [ARMED]       │
  │ momentum  -  $50 of $300 today              │
  │                                             │
  │  $223.64                  +1.70% 24h        │
  │                              +12.40 unreal. │
  │       ╱╲    ╱╲      ╱╲   ╱                  │
  │   ╱╲╱  ╲__╱   ╲___╱  ╲_╱                    │
  │ ───────────────────────────────────────     │
  │ WEEKEND                        15:17 NY     │
  │ shut on the NYSE - this trades anyway       │
  └─────────────────────────────────────────────┘
```

The bottom bar is never absent and never subtle. A screen that showed a price
without saying which of those two worlds it came from would be implying the
exchange is open.

---

## Solana venues, one deck

| | chain | venue | what it trades |
|---|---|---|---|
| **Solana** | mainnet reads | Jupiter | 17 Backed Finance xStocks — SPYx, NVDAx, TSLAx, AAPLx … |
| **Solana** | devnet | pm-AMM | Live prediction markets, YES / NO |

```bash
CHAIN=solana ./desk/run.sh      # default
```

Same keys, same gate, same memory, same screen. `chains/index.mjs` keeps the
venue interface open to more Solana venues. The desk builds unsigned
transactions for a wallet to sign; it never signs or submits.

---

## Phoenix perpetuals

The backend discovers every market from Phoenix through `@ellipsis-labs/rise`.
It currently uses **mainnet read-only data and unsigned transaction building**;
no public perps devnet deployment was found. See [venue evidence](docs/VENUES.md).
The desk never signs, onboards a wallet or submits a transaction. A real fill
requires Nick's approval and signature in his own wallet.

| Endpoint | Input |
|---|---|
| `GET /perps/markets` | Every live venue listing, mark price, funding and max leverage |
| `GET /perps/quote` | `market`, `side=long\|short`, `usd`, `leverage` |
| `GET /perps/positions` | `authority`; optional `traderPdaIndex` |
| `POST /perps/open` | JSON: `authority`, `market`, `side`, `usd`, `leverage`, optional `slippageBps`, account indexes |
| `POST /perps/close` | JSON: `authority`, `market`, optional `subaccountIndex`, `traderPdaIndex`, `slippageBps` |

`usd` is a collateral **sizing budget**, so target notional is `usd × leverage`,
rounded down to Phoenix lots. The order does not move collateral into the
account. The quote's liquidation price is an SDK estimate for the requested
position alone; actual account-wide liquidation can differ. Close orders read
the actual position and set `ReduceOnly`.

Set `PHOENIX_AUTHORITY` to an existing, enabled, funded Phoenix trader public
key, with `PHOENIX_TRADER_PDA_INDEX` and `PHOENIX_SUBACCOUNT_INDEX` when needed.
Isolated-only markets require an isolated subaccount. `PHOENIX_RPC` optionally
selects another mainnet RPC; a cluster check prevents deployment mismatch.
Set `PHOENIX_PUBLIC_URL` to this backend's public HTTPS origin for Solana Pay
URLs/QRs. `GET /perps/request/:id` and `POST` with the matching wallet's
`account` implement the same short-lived unsigned handoff as the other venues.
Missing setup is named explicitly. Poll at least 15 seconds apart.

`GET /hedge?authority=…` reads actual positions and pairs recognized numeric
pm-AMM outcomes that pay on the adverse side of the entry price. Sizing uses
real quotes and the existing memory gate; outcome permissions use
`pmamm:<market pubkey>:<yes|no>` allowlist keys. No transaction is built or
submitted by this proposal route. Optional `usdc` caps the proposed premium.
Phoenix is mainnet while pm-AMM is devnet: these proposals are research only;
devnet mUSDC cannot economically hedge mainnet USD. Numeric names are interpreted,
not verified oracle resolutions.

Jupiter spot coverage also includes every mint identity in
`main/markets.solana.json` (under `desk/`). Duplicate ticker symbols require
an exact mint or the catalog's `symbol@mint` key. Mint decimals and executable
routes are read live; a catalog listing does not promise liquidity. Price
requests are limited to requested/held assets instead of quoting the whole
catalog on each UI poll.

---

## Prediction markets (pm-AMM, devnet)

The [PREDICT pm-AMM SDK](https://github.com/sparkfun-labs/pm-amm/blob/main/doc/api-reference.md)
reads markets and builds unsigned transactions for YES/NO purchases, market
creation and winning-token claims. Program:
`GV1FMGHRYBjQLaghE5fnGuYCuCcpdt3GD5xEX3TwN16y`; collateral is 6-decimal devnet
mUSDC, `3WQ8hCqTNwjrh8WzE2XyoZoUrd1miPcwWfMkmFPUMEWZ`.

| Endpoint | Input |
|---|---|
| `GET /pm/markets` | Live markets, YES prices, end times and actual vault liquidity |
| `GET /pm/quote` | `market`, `side=yes\|no`, `usdc` query parameters |
| `GET /pm/positions` | `owner` public key (or `SOLANA_ADDRESS`) |
| `POST /pm/swap` | JSON: `owner`, `market`, `side`, `usdc`, optional `slippageBps` (100 default) |
| `POST /pm/create` | JSON: `owner`, `name`, `durationSecs`, `initialPriceBps`, `depositUsdc` |
| `POST /pm/claim` | JSON: `owner`, `market`; requires an already resolved market |

These routes use the existing pad bearer token. Set `PMAMM_RPC` to a devnet
RPC if needed; the adapter verifies the genesis hash and refuses other clusters.
Amounts are human mUSDC with at most six decimal places. Quotes use the
[official helpers](https://predict-pm-amm.dev/helpers/pm-amm-helpers.ts), including
time decay and the 2% fee. Poll at least 15 seconds apart; reads are cached for
15 seconds. Missing setup is named explicitly.

Set `PMAMM_PUBLIC_URL` to this desk's publicly reachable HTTPS origin for the
phone wallet. Builds return base64 `unsignedTx`, `requestUrl` and `qrSvg`.
Without that URL they still return the unsigned transaction and
`Setup required: PMAMM_PUBLIC_URL`. Solana Pay's `GET /pm/request/:id` returns
wallet metadata; `POST` with `{ "account": "<owner pubkey>" }` returns a fresh
unsigned transaction. Those unguessable URLs expire after 90 seconds, require
the matching owner and never include the pad token. The desk never signs or
submits. Jupiter builds use the same protocol with `SOLANA_PAY_PUBLIC_URL` and
`/wallet/request/:id`.

No resolver is implemented in this milestone. Tests use real devnet reads and
simulations, with explicit skips when devnet or a funded throwaway public
address is unavailable. See [TESTING.md](TESTING.md) for measured results and
remaining setup.

---

## The book is measured, not assumed

Searching Jupiter for `TSLAx` returns three tokens:

```
TSLAx  XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB   $1,261,725   real
TSLAx  EaxDDrLr3P2txZmgAgwaKD7sGSoZY4EZM9xFgtTbpump  $    3,110   impostor
TSLAx  HMMxrskwSnXrMwX4xG6MTAnQ9BG3LPcJCeE2tsjtpump  $    2,953   impostor
```

Every genuine xStock carries Backed's `Xs` mint prefix; no impostor did. So the
mints are **hardcoded** and the pad never resolves a ticker to an address at
runtime. A symbol is not an identity, and getting it wrong means buying a
worthless copy of Tesla.

Then each market was quoted at $50 and again at $500, because a pool existing is
not a pool being tradeable:

```
symbol   $50       $500      impact     verdict
SPYx     768.04    768.06     0.00%     listed
NVDAx    221.60    221.67     0.03%     listed
NFLXx    736.96    743.91     0.94%     listed — thin but real
JPMx     374.67   4124.79  1000.92%     REJECTED
```

The original xStock depth check found: JPMx is why the check exists: $1,453 of liquidity behind a ticker that looks as
legitimate as the rest, and a $500 order that pays eleven times the going rate.
It remains excluded from the original xStock book, with that historical reason
kept in the file. The expanded perp.so mint catalog carries that warning and
requires a fresh Jupiter quote; it does not claim historical depth is current.

---

## Signing

**The pad holds no key. No venue can execute.**

It quotes, it prices, it reads balances, it reasons, and it builds an unsigned
transaction. Then it stops. `chains/index.mjs` asserts this at startup rather
than trusting it, and `test/verify.mjs` checks that venues refuse to sign and the RPC uses only read methods.

That is not a limitation dressed up as a feature. This is a device that sits on
a desk within reach of anyone walking past it, where the watched wallet may hold real money. A trading terminal must not be one
keypress from spending a balance.

On ✓ the trade is **re-quoted at that moment** rather than reused from the
proposal — seconds have passed, and on a market that trades while its exchange
is shut, that is exactly when a price moves. It is journalled as `HANDED_OFF`,
never as filled, because the pad does not watch for that signature and must not
claim an outcome it cannot see.

---

## Memory is load-bearing

The gate is built from memory and nothing else. Wipe the store and the agent
keeps working, but it forgets your limits, forgets what you hold, and forgets
the rules you taught it — so it shrinks to a timid version of itself
(`$10/trade` instead of `$100`) rather than carrying on at full size.

```
signal            WITH memory                          WITHOUT memory
A  ETH buy $80    REJECT   vetoed by a rule you taught EXECUTE $10  clamped
B  ETH buy $30    EXECUTE $30                          EXECUTE $10  clamped
C  ETH sell $30   EXECUTE  position remembered         REJECT   cannot see the bag
D  ETH buy $8     EXECUTE $8    ← control, unchanged   EXECUTE $8
```

`node desk/test/loadbearing.test.mjs` asserts that three of four change and the
control does not.

---

## Running it

```bash
# 1. the desk backend  (Node 20+, no build step)
cd desk && npm install && ./run.sh
#    -> xorrpad backend on http://0.0.0.0:8080  (Solana, quotes only, auth on)

# 2. the browser view
open "http://localhost:8080/?token=xorrpad-dev"

# 3. check it end to end, against the live venues
node test/verify.mjs          # live checks, nothing mocked
```

The pad itself joins over Wi-Fi and points at the same URL — its captive portal
asks for the address and token, so there is no firmware rework to move it
between machines.

### The screen, without a board

`firmware/xorrpad/ui.h` is every pixel the pad draws and nothing that knows
about hardware, so it compiles on a laptop:

```bash
cd tools/uipreview && make open      # renders the real frames to PNGs
```

Three layout bugs came straight out of looking at those PNGs: a UTF-8 middot
rendering as line noise in an ASCII-only font, the hours bar running off the
right edge of a 320px panel, and the gate's reasoning truncating one word before
"anyway".

---

## Layout

```
firmware/xorrpad/     ESP32-S3 sketch — 4×4 matrix, I2S mic + amp, ILI9341
  ui.h                every pixel; no SPI, no WiFi, host-renderable
  display.h           the device: SPI, panel, PSRAM canvas, one blit per frame
  padstate.h          what the pad knows, as plain data
desk/
  main/chains/        solana.mjs (Jupiter) · pmamm.mjs (devnet) · index.mjs
  main/xstocks.mjs    the verified book, and when the NYSE is shut
  main/decide.mjs     the gate — memory in, verdict out
  main/memory.mjs     Sibyl, over a Python sidecar
  renderer/           the desk app
  test/verify.mjs     live checks against the running product
tools/uipreview/      compile ui.h on a laptop, get PNGs
cad/                  the printable case, parametric, no CSG
```

---

## Known limits

- **Balances need an address.** Set `SOLANA_ADDRESS` to watch a wallet;
  without it the pad quotes and reasons but reports no holdings.
- **The hardware sweep is incomplete.** One key (`RUN`, r2c1) is dead at the
  solder joint and row 3 was never swept. The desk app mirrors every key as a
  button, so a dead switch never blocks a demo.

## Licence

MIT.
