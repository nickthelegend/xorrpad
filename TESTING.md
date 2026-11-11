# Test results — Solana-only desk and pm-AMM

Run on 2026-11-12 (Asia/Kolkata), Node 26.5.0.

| Run | Tests | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Milestone 1: `npm test --prefix desk` | 2 | 2 | 0 | 0 |
| Final: `npm test --prefix desk` | 12 | 11 | 0 | 1 |
| pm-AMM subset: `node --test desk/test/pmamm*.test.mjs` | 10 | 9 | 0 | 1 |

The original memory and load-bearing assertions remain intact. They use real
SQLite through `sibyl-memory-client==0.4.19`, pinned in
`desk/memory/requirements.txt` to match the bridge's local-storage API. Install
with `python3 -m venv .venv` and
`.venv/bin/pip install -r desk/memory/requirements.txt`.

The Node test command now explicitly discovers `test/*.test.mjs`; `node --test
test/` failed to resolve the directory under Node 26 before any tests ran.
Legacy EVM gas/stress diagnostics now read or simulate on devnet and never sign.
The separate interactive `test/verify.mjs` was updated but was not run.

## Real devnet evidence

- Read 97 live mUSDC markets from program
  `GV1FMGHRYBjQLaghE5fnGuYCuCcpdt3GD5xEX3TwN16y`, including actual vault
  liquidity and current prices calculated with the upstream decay-aware helpers.
- Quoted both YES and NO for 1 mUSDC; the fee was 20,000 raw units (0.02 mUSDC).
- Built and deserialized both swaps; every signature was zero and the fee payer
  was the throwaway public key. Checked the 1% minimum output against the quote.
- Built an unsigned market creation with a 1 mUSDC deposit, read the throwaway
  owner's actual positions and built a claim against a real resolved market.
- Called real `simulateTransaction` with `sigVerify:false` and
  `replaceRecentBlockhash:true`. The chain returned `AccountNotFound` for the
  unfunded throwaway owner. A SOL airdrop attempt returned HTTP 410 with
  `The RPC faucet is closed on this cluster`. The successful-simulation test
  was therefore **skipped**, never reported as successful.
- Final-run throwaway public key:
  `FM6YiQBys7gQL1PyZXShXYeaL36Kbtsc8x2nF46KrjqV`.
  No corresponding secret key was generated, held or used.

## Protocol and safety checks

- The actual HTTP server ran on **127.0.0.1:8711** and was closed after the test.
  Checks covered authentication, method restrictions, malformed JSON, invalid
  public keys and live `/pm/markets` responses.
- Solana Pay metadata and POST requests were exercised through the real local
  HTTP route using an actual chain-built creation transaction. Tests used a
  localhost HTTPS origin for URL-format checks and called its local HTTP route;
  this does not validate public TLS or a phone-wallet connection.
- A different wallet was refused. The matching account received a fresh,
  unsigned serialized transaction. No app-side signing or broadcast occurred.
- All venue signing entry points refuse, and the signing-call regression checks
  pass. The adapter checks the devnet genesis hash before chain reads/builds.
- Amount precision, overflow and quote-input validation passed. Live read
  caches coalesce requests for at least 15 seconds; no polling process remains.
- `git diff --check` passed. No mainnet transactions, API mocks or fake fills.

## BLOCKED / remaining setup

- **Successful devnet swap simulation:** set `PMAMM_TEST_OWNER` to a throwaway
  public address funded with devnet SOL and at least 1 mUSDC. The public RPC's
  faucet is closed (HTTP 410). The test then requires `err === null`; other
  program failures are test failures. `PMAMM_RPC` may select another devnet RPC.
- **Phone-wallet end to end:** set `PMAMM_PUBLIC_URL` to a publicly reachable
  HTTPS origin routing to this backend. Until then, builders return the unsigned
  transaction plus `Setup required: PMAMM_PUBLIC_URL`, with no fabricated URL.
  The equivalent Jupiter variable is `SOLANA_PAY_PUBLIC_URL`.
- Missing transaction owners report `Setup required: SOLANA_ADDRESS`.
  No signer keys or new credentials are required by the desk.
- Oracle resolution belongs to a later milestone. Claims require an already
  resolved market. The spot strategy scan has no verified xStock candle adapter
  and reports its setup requirement rather than using the removed Base feed.

## Renderer evidence

The existing fonts, palette, layout and components were preserved. Changes
remove obsolete chain choices and the EVM fallback book. Screenshots are static
captures of the actual renderer with the backend disconnected, so the connection
warning and unavailable values are visible; no network response was substituted.

| Surface | Before | After |
|---|---|---|
| Desk, 1440 | [before](docs/screens/solana-only-before-1440.png) | [after](docs/screens/solana-only-after-1440.png) |
| Desk, 375 | [before](docs/screens/solana-only-before-375.png) | [after](docs/screens/solana-only-after-375.png) |
| Markets, 1440 | [before](docs/screens/solana-markets-before-1440.png) | [after](docs/screens/solana-markets-after-1440.png) |
| Markets, 375 | [before](docs/screens/solana-markets-before-375.png) | [after](docs/screens/solana-markets-after-375.png) |
| Setup, 1440 | [before](docs/screens/solana-setup-before-1440.png) | [after](docs/screens/solana-setup-after-1440.png) |
| Setup, 375 | [before](docs/screens/solana-setup-before-375.png) | [after](docs/screens/solana-setup-after-375.png) |

## Files touched across both milestones

Includes removed legacy files and the stale absolute `desk/node_modules`
symlink; dependencies now install into the ignored local directory.

- `.env.example`
- `README.md`
- `TESTING.md`
- `desk/electron.mjs`
- `desk/main/agents.mjs`
- `desk/main/chain.mjs`
- `desk/main/chains/index.mjs`
- `desk/main/chains/pm-amm-helpers.mjs`
- `desk/main/chains/pmamm.mjs`
- `desk/main/chains/solana.mjs`
- `desk/main/chains/xlayer.mjs`
- `desk/main/dex.mjs`
- `desk/main/electron.mjs`
- `desk/main/fork.mjs`
- `desk/main/markets.mjs`
- `desk/main/memory.mjs`
- `desk/main/routers/index.mjs`
- `desk/main/routers/kyberswap.mjs`
- `desk/main/routers/uniswap.mjs`
- `desk/main/scan.mjs`
- `desk/main/server.mjs`
- `desk/main/stocks.mjs`
- `desk/main/tokens.mjs`
- `desk/main/trader.mjs`
- `desk/main/wallet-requests.mjs`
- `desk/main/xstocks.mjs`
- `desk/memory/requirements.txt`
- `desk/node_modules`
- `desk/package-lock.json`
- `desk/package.json`
- `desk/renderer/index.html`
- `desk/renderer/setup.html`
- `desk/test/devnet-rpc.mjs`
- `desk/test/env.mjs`
- `desk/test/gas-drift.mjs`
- `desk/test/mainnet-conditions.mjs`
- `desk/test/pmamm.devnet.test.mjs`
- `desk/test/pmamm.http.test.mjs`
- `desk/test/pmamm.test.mjs`
- `desk/test/stress.mjs`
- `desk/test/verify.mjs`
- `docs/screens/06-xlayer.png`
- `docs/screens/solana-markets-after-1440.png`
- `docs/screens/solana-markets-after-375.png`
- `docs/screens/solana-markets-before-1440.png`
- `docs/screens/solana-markets-before-375.png`
- `docs/screens/solana-only-after-1440.png`
- `docs/screens/solana-only-after-375.png`
- `docs/screens/solana-only-before-1440.png`
- `docs/screens/solana-only-before-375.png`
- `docs/screens/solana-setup-after-1440.png`
- `docs/screens/solana-setup-after-375.png`
- `docs/screens/solana-setup-before-1440.png`
- `docs/screens/solana-setup-before-375.png`
- `tools/uipreview/preview.cpp`

## Worker brief 2 — Phoenix, all markets

Run on 2026-11-12 (Asia/Kolkata), Node 26.5.0, Rise 0.7.10.

| Run | Tests | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| `npm test --prefix desk` | 23 | 20 | 0 | 3 |
| `phoenix.live.test.mjs` within that run | 5 | 3 | 0 | 2 |
| Phoenix HTTP protocol checks | 1 | 1 | 0 | 0 |
| Phoenix, identity and hedge-direction unit checks | 4 | 4 | 0 | 0 |
| Expanded Jupiter live checks | 1 | 1 | 0 | 0 |

The preceding milestone's 12 tests still run; none were deleted or weakened.
The registry assertion now explicitly expects the additional Phoenix venue.

### Real observations

- The adapter's complete set of **109** Phoenix markets matched an independent
  Rise API market-list request. Marks, funding and leverage came from real API
  responses, rather than a fixed subset or invented values.
- Real SOL quotes were read for long and short, using orderbook depth and the
  live taker fee. Liquidation values used the SDK's margin helper and state
  their hypothetical single-position collateral assumptions.
- An open order was serialized to **542 bytes**, deserialized, and checked for
  the expected authority, Phoenix program and all-zero signatures.
- Real mainnet `simulateTransaction` was called with `sigVerify:false` and
  `replaceRecentBlockhash:true`. Its result was **`AccountNotFound`** for the
  throwaway authority. The successful-simulation test was skipped, not passed.
  No transaction was submitted, and no signing key was generated or read.
- The final-run Phoenix throwaway public key was
  `3CDbtMUYibAbLW2CEY96Tv4MsNiNinCdQkryZ4Zdnm1a`.
- An unregistered authority's actual trader snapshot was `uninitialized`.
  Position/close validation was skipped with `Setup required: PHOENIX_AUTHORITY`.
  The code reads every cross/isolated subaccount for the selected trader PDA
  index; close quantities come from signed raw position lots and use ReduceOnly.
- The real local HTTP server used **127.0.0.1:8712** and was closed afterward.
  Authentication, methods, JSON validation, invalid authorities, expired wallet
  links, wrong-wallet refusal, metadata and a matching-wallet unsigned rebuild
  passed. As in the earlier protocol test, localhost HTTPS was used for URL
  syntax and the local HTTP endpoint was exercised directly. Public TLS and a
  phone connection were not claimed to have been tested.
- Every one of the **7,550** catalog spot mint identities was covered by the
  expanded allowlist. Repeated symbols require an exact mint or a qualified
  key; unusual ticker text cannot become an inline HTML handler key.
- Real Jupiter quotes succeeded for SOL and HYPE; actual mint decimals were 9
  for both. Final-run routes included BisonFi and GoonFi V2. No mock quote,
  success response or price was supplied to a service client.
- The existing pm-AMM tests read **95** live devnet markets in this run. Their
  successful-simulation check remained skipped after real `AccountNotFound`
  and the devnet SOL faucet's HTTP 410 response.

### Hedge limits and setup

`/hedge` only proposes. It parses recognized numeric questions whose named
expiry matches the on-chain end time, pairs their payout direction against
actual position entry prices, derives premium size from real pm-AMM quotes,
and calls the existing `decide()` gate. Tests cover every supported comparison
operator on both position sides, mismatched assets/expiry, ambiguous conditions,
allowlist refusal, size caps and exhausted daily budget. Pure logic inputs are
unit-test parameters; no external API response is mocked.

A hedge outcome is permissioned under its exact
`pmamm:<market pubkey>:<yes|no>` key. A gate refusal remains a refusal and is
returned with its reasons. Mainnet Phoenix positions and devnet mUSDC outcomes
are explicitly labelled **not an economic hedge**. Market-name interpretation
is not a verified oracle; creator resolution, expiry gaps and threshold gaps
remain visible limitations.

**BLOCKED:**

- Successful Phoenix simulation, live close and real-position hedge exercise:
  `Setup required: PHOENIX_AUTHORITY`, with an enabled, registered trader,
  adequate collateral, SOL for fees and an open position for close/hedge checks.
  Set `PHOENIX_TRADER_PDA_INDEX` / `PHOENIX_SUBACCOUNT_INDEX` for non-default
  accounts. No private key is needed or accepted by the desk.
- Phone-wallet end to end: `Setup required: PHOENIX_PUBLIC_URL`, a public HTTPS
  origin serving this backend. The unsigned build still works without it.
- Economic mainnet hedging: pm-AMM is intentionally devnet-only in the current
  adapter. Devnet mUSDC cannot cover mainnet USD losses.
- The earlier `PMAMM_TEST_OWNER` funding/faucet limitation remains unchanged.

### Additional renderer evidence

Only the existing market-class mapping changed so equities retain their class
inside the expanded mixed spot catalog. Fonts, palette, layout and components
were unchanged. These are static renderer captures with the backend visibly
disconnected; no service response was replaced:

- 1440: [before](docs/screens/phoenix-spot-before-1440.png),
  [after](docs/screens/phoenix-spot-after-1440.png).
- 375: [before](docs/screens/phoenix-spot-before-375.png),
  [after](docs/screens/phoenix-spot-after-375.png).

## Worker brief 3 — devnet keeper and chain traction

Run on 2026-11-12 (Asia/Kolkata), Node 26.5.0.

| Run | Tests | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| `npm test --prefix keeper` | 9 | 8 | 0 | 1 |
| `npm test --prefix desk` | 26 | 23 | 0 | 3 |
| Combined | 35 | 31 | 0 | 4 |

The desk suite retains all previous tests and adds three real keeper/history
checks. Keeper tests cover rejecting non-devnet genesis hashes and other mints,
a real devnet guard call, exact straddle/boundary arithmetic, UTC schedules,
strike ticks, deterministic ids, actual key-file ignore/mode/overwrite protection,
no desk signing imports, and matching keeper questions to hedge expiry semantics.
All three Pyth feed IDs matched actual public Hermes feed-discovery responses.

### Keeper identity and funding evidence

Public key: **`GFvUgcVeEwBHnirG1jwcjaMJ8qJhRq1DM33c78trum2f`**
([Solana Explorer, devnet](https://explorer.solana.com/address/GFvUgcVeEwBHnirG1jwcjaMJ8qJhRq1DM33c78trum2f?cluster=devnet)).

- `node keeper/keygen.mjs` printed only that public key. `stat` reported
  `-rw-------` (0600). The secret was neither printed nor committed.
- `git check-ignore keeper/.keeper-devnet.json` returned that ignored path.
  The test also verified the key is untracked and refuses overwrite without
  reading its contents.
- The one public `requestAirdrop` attempt returned HTTP **410** (RPC faucet
  closed). Its attempt is recorded locally so restarts do not retry it.
- `node keeper/run.mjs --once` and `node keeper/run.mjs --cycle` both stopped
  during funding preflight with:
  `Setup required: fund GFvUgcVeEwBHnirG1jwcjaMJ8qJhRq1DM33c78trum2f with ≥0.5 devnet SOL`.
- The mUSDC faucet is gated behind successful SOL funding and was therefore not
  called for this keeper. When SOL is available, the funding command calls it at
  most once per hour and verifies the resulting token balance from chain.
- **No real keeper create/resolve cycle occurred. No creation or resolution
  transaction signatures exist, so no placeholder transaction links are given.**
  Run `node keeper/run.mjs --cycle` after funding and Hermes setup; it creates a
  ten-minute SOL market, waits, and resolves only an unambiguous exact-expiry
  observation. Successful evidence contains actual devnet Explorer links.

### Real Hermes result

The price-update endpoint returned HTTP **401**. The live signed-price parsing
and exact-publish-time test was skipped with
`Setup required: PYTH_API_KEY`; no payload or price was fabricated.
The official [upgrade notice](https://docs.pyth.network/pro/pyth-core-upgrade)
now requires an API key for Hermes price updates. Feed discovery still worked.
The implementation preserves `binary.data` only from a successful actual
response and refuses a later timestamp as a substitute for exact `endTs`.

### Real chain/API observations

The actual authenticated HTTP server ran on **127.0.0.1:8713** and was closed
in the test's cleanup. `/pm/ours` matched independent on-chain filtering by the
keeper creator. `/pm/resolutions` returned no published evidence yet.
`/pm/stats` reported **0 markets, 0 unique traders, 0 swaps, 0 mUSDC volume and
0 creator fees**, with complete history for that empty chain-derived set.
Consecutive calls reused the same cache result; no database totals are used.

The parser and full history scanner were separately exercised against this
**public reference market, not a keeper market**:
`9Ly4tHCaenGc6nkhAwWHxjKisEkpNZm9dh7XtacQiDra`.
Its history included initialization and one successful swap. The independently
observed swap had **10.093 mUSDC** gross volume and an actual SPL transfer of
**0.100930 mUSDC** to the creator:
[reference swap on devnet](https://explorer.solana.com/tx/5hFEx7T33RLSekreevbuEZ1khnJojRi97eJ3EWndjpACwvxcFhtBfyPbRS8NQrcRtTW7ACcaCo2Be5kyxsqPnoKU?cluster=devnet).
It is never counted as our keeper's traction. No API was mocked, and the tests
fetched this transaction and its history from real devnet RPC.

### BLOCKED and process status

- Fund **`GFvUgcVeEwBHnirG1jwcjaMJ8qJhRq1DM33c78trum2f` with at least 0.5
  devnet SOL**. The public RPC airdrop is closed (HTTP 410).
- Set **`PYTH_API_KEY`** in the keeper process environment for signed Hermes
  price updates (HTTP 401 without it). No `.env` or secret was opened to find one.
- The previous Phoenix account and pm-AMM swap funding skips remain unchanged.
- The keeper is the only process that can sign, and its network/mint guards run
  before key access and again before signing/submission. The desk only reads
  public creator metadata and evidence. No renderer files changed in this brief.
- The cycle attempt exited, all test servers closed, and no listeners remained
  on ports 8710–8719. No mainnet transaction was submitted and nothing was pushed.

### Slim snapshot verification

`node tools/sync-solana-markets.mjs --slim-current` reduced the snapshot from
**2733361 to 1019141 bytes** (62.7% smaller). All **7550** entries retained exactly the same mint,
symbol, name, asset class and Jupiter eligibility. Unread metadata and repeated
output-mint/status fields were removed; the generator now writes the same slim,
minified form. The original floor mapping remains in `docs/VENUES.md`, and
Phoenix market discovery remains live. No renderer values or styles changed.

Post-compaction regression run:
`node --test desk/test/phoenix.test.mjs keeper/test/keeper.test.mjs` —
**11 tests, 11 passed, 0 failed, 0 skipped**. This rechecked every catalog mint,
duplicate ticker handling, the desk gate, exact keeper expiry interpretation,
key isolation and the real devnet guard after the snapshot/schema change.

## v1 T1 — unified Solana aggregator

Measured 2026-11-12 (Asia/Kolkata), Node **26.5.0**. Venue APIs and Solana
RPC were called directly. No mocked venue responses, mainnet sends, signing,
secret files or `.env` loading were used. Servers were closed after each test.

| Run | Tests | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Final `npm test --prefix desk` | 37 | 32 | 0 | 5 |
| T1 targeted: `node --test desk/test/aggregate.test.mjs desk/test/aggregate.live.test.mjs desk/test/aggregate.http.test.mjs` | 11 | 10 | 0 | 1 |
| Gate and adapter regression subset: `node --test desk/test/aggregate.test.mjs desk/test/pmamm.test.mjs desk/test/phoenix.test.mjs` | 11 | 11 | 0 | 0 |

The five required T1 venue checks all passed in both the targeted and full
runs: Jupiter SOL spot, Meteora SOL spot, Phoenix SOL perp (both sides),
Jupiter SOL perp (both sides), and pm-AMM live market discovery. A real
pm-AMM outcome also routed and quoted on devnet. The error-path test used a
sub-unit input, retained both actual venue errors, and returned `best:null`.

Final-run evidence (prices are snapshots, not current offers):

| Venue | Observed quote / discovery |
|---|---|
| Jupiter spot | 10 USDC → **0.117705895 SOL**, execution **$84.957512111**; separately itemized fees and liquidity unavailable, explicitly null |
| Meteora DLMM | 10 USDC → **0.117598880 SOL**, execution **$85.034823461**, included fee **$0.003713**, API pool TVL **$3,747,421.41** |
| Phoenix SOL | long **$85.04**, opening fee **$0.006845720**; short **$85.03**, opening fee **$0.006844915**; $10 collateral at 2×, lot-rounded |
| Jupiter SOL perp | live mark **$84.963423790**, indicative opening/impact fees **$0.014** on $20 notional; JLP AUM **$759,348,770.9034** |
| pm-AMM | **95** live devnet mUSDC markets; a liquid YES outcome routed successfully |

The actual `/venues` response reported **7,549 Jupiter catalog identities**,
**6,985 distinct Meteora USDC-pair mints**, **109 Phoenix markets**, **3 Jupiter
Perps markets**, and **95 pm-AMM markets**. Discovery is live and counts can
change even between adjacent runs. Jupiter's count is labelled as the pinned
catalog, with a separate real SOL quote health probe. See
[venue scope, quote semantics and signing status](docs/VENUES.md#t1-unified-aggregator).

Additional integration evidence:

- The HTTP suite used **127.0.0.1:8717** and verified authentication, allowed
  methods, invalid intents, all five venue health entries, BUY/SELL/LONG/SHORT,
  the agent `/propose` endpoint and the existing $10 remembered size cap.
- Changing the remembered allowlist after proposing caused YES to rerun the
  gate and refuse the handoff. No transaction was built. The check also caught
  and fixed the catalog `YES` ticker intercepting the confirm control.
- Unit coverage retains market/rule/day caps and adds venue, leverage,
  cooldown, invalid-size and refused-build checks. The existing registry
  signing assertion now includes both added venues; no assertion was removed.
  The original memory/load-bearing tests passed unchanged.
- A standalone real Meteora quote and SDK build produced a **765-byte**,
  **5-instruction**, unsigned mainnet transaction for an explicit throwaway
  public owner. Deserialization confirmed the owner as fee payer and all
  signatures empty. The SDK compute estimate reported `AccountNotFound` for
  that unfunded owner, then returned the unsigned transaction. This proves
  construction only, not a successful execution or simulation.
- Jupiter Perps decoded real Pool/Custody accounts, including SOL/ETH/BTC marks,
  available reserves, 500× venue maximums, and distinct long/USDC-short borrow
  rates. A separate observed snapshot at slot **468263468** gave SOL hourly
  borrow rate **0.000015684** and USDC-short hourly rate **0.000007739** (fractions).
  These rates are not locked. Anonymous quotes are explicitly indicative and
  exclude collateral conversion, rent and network costs.
- Jupiter's official unsigned-build API returned **HTTP 422 insufficient_funds**
  for an unfunded on-curve public owner. Funded-owner open and close success is
  **not verified**. Builders require an explicit funded public owner; no
  corresponding secret key was generated or used for the probes.

Exact final full-suite skips:

1. The extra Meteora unsigned-build test hit public mainnet RPC **429**.
2. Existing Phoenix successful simulation needed a registered funded trader;
   the real simulation returned **AccountNotFound**.
3. Existing Phoenix actual-position/close check needed that funded trader.
4. Existing pm-AMM successful simulation needed devnet SOL/mUSDC; the RPC
   faucet returned **HTTP 410**.
5. Existing expanded SOL/HYPE spot test quoted SOL, then the HYPE mint-decimal
   RPC read hit **HTTP 429**.

The added live tests skip only printed network/service unavailability reasons;
invalid inputs, missing listings, invalid quote math and assertions fail tests.
The only skip in the targeted 11-test run was the extra Meteora build's RPC
429. No required two-venue quote check was skipped. No pad firmware was
changed, compiled or flashed as part of T1.
