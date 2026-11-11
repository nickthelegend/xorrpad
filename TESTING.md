# T10 history-source verification

Run on **2026-11-12 (Asia/Kolkata)** / November 11 UTC, Node 26.5.0.
The source is now real GeckoTerminal Solana pool OHLCV, with named Pyth fallback.
No responses, candles, prices, fees, fills or signatures are mocked.

| Run | Tests | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| History + backtest, focused | 19 | 19 | 0 | 0 |
| Full desk | 118 | 110 | 0 | 8 |
| Full keeper | 9 | 7 | 1 | 1 |
| Full site | 14 | 14 | 0 | 0 |
| **Full combined run** | **141** | **131** | **1** | **9** |

Focused command: `node --test --test-concurrency=1 --test-reporter=tap desk/test/backtest*.test.mjs desk/test/history.live.test.mjs`.
Exit 0, **202,438.596292 ms**. It verifies real SOL/AAPLx candles, stable-quote
pool selection by mint/depth, USD volume, cache corruption recovery, pagination
past 1000 bars, complete 30-minute/two-hour aggregation, concurrent cache ranges,
replay fee/funding accounting, every book strategy, data-shift/no-look-ahead,
prediction modelling and authenticated HTTP/agent round trips.

Full command: `node --test --test-concurrency=1 --test-reporter=tap desk/test/*.test.mjs keeper/test/*.test.mjs site/test/*.test.mjs`.
Exit 1, **393,845.415833 ms**, cancelled 0, TODO 0. The focused run is a subset
and is not added to the full total. [Every result and skip reason](docs/v1/T10-HISTORY-RESULTS.json).
The six prior Pyth-history skips are gone. The sole failure remains the unchanged
keeper isolation assertion (test 126) forbidding all desk `.sign()` calls,
including the SPEC-approved session executor. No existing test was weakened.

The nine remaining skips are actual dependencies: Ollama unavailable;
`ANTHROPIC_API_KEY` and `DEEPGRAM_API_KEY` absent; Meteora account read HTTP 429;
the pad test wallet unfunded; two Phoenix trader/account setup cases;
`PMAMM_TEST_OWNER` unfunded with the devnet airdrop closed; and Hermes requiring
`PYTH_API_KEY`. The historical T8 report below gives recovery actions. No new
mainnet transaction was sent; mainnet calls are reads/builds/simulations only.

Data limitations remain explicit. The Pyth secondary probe returned HTTP 404.
The free pool endpoint returned HTTP 401 while paging older BTC history; the
available prefix is labelled `complete:false` with first/last/gap coverage and
warnings. Insufficient daily warm-up disables the 200-day gate; no daily bars are
invented. All book strategies still run on the actual available path. One early
focused attempt failed on conflicting AAPLx timestamps outside its requested
week; decoding now checks duplicates within each requested window and still
rejects conflicts inside it. The final 19-test run above has no failures/skips.

Firmware compiled successfully using the exact command already recorded in
[firmware/README.md](firmware/README.md):
`arduino-cli compile --fqbn esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc firmware/xorrpad`.
Sketch **1,476,455 bytes**, globals **59,060 bytes**. **Compiled, not yet flashed**.
The source-label UI detector returned 0 findings; changed modules passed syntax
and formatting checks. Browser evidence is recorded separately in the screen
manifest after the real chart capture step. Nothing was pushed.

---

# T9 judge-fix verification

Run on **2026-11-12 (Asia/Kolkata)** / November 11 UTC, using Node 26.5.0.
The full run after items 1–7 used the same command as the T8 release run below:

```sh
node --test --test-concurrency=1 --test-reporter=tap desk/test/*.test.mjs keeper/test/*.test.mjs site/test/*.test.mjs
```

| Suite | Tests | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Desk | 113 | 99 | 0 | 14 |
| Keeper | 9 | 7 | 1 | 1 |
| Site | 14 | 14 | 0 | 0 |
| **Total** | **136** | **120** | **1** | **15** |

Exit **1**, duration **240,817.61125 ms**, cancelled 0, TODO 0.
[Test-by-test results and all skip reasons](docs/v1/T9-JUDGE-RESULTS.json).
The sole failure is the unchanged keeper isolation assertion (now test 121)
that forbids all desk signing, including the SPEC-approved session executor.
It remains **BLOCKED**, and is not relabelled as a pass or skip. Its detailed
explanation and every dependency recovery action remain in the historical T8
report below. No existing assertion was removed or relaxed.

After the browser review's visibility/cache fixes, the affected live Jupiter
cache and three theme contrast checks ran separately: **5 tests, 5 passed, 0
failed, 0 skipped**. They are already included in the 136 distinct tests above;
this follow-up run is not added to that total. The cache bounds input to 12
symbols, runs two quote workers per request, shares in-flight reads and caches
both outcomes for 15 seconds after completion. Mainnet reads only; no signing.
All three theme text token pairs pass WCAG AA (4.5:1), including primary buttons.

`npm run test:ui --prefix desk` passes **15 integration groups**, with **54 page
captures** (nine pages, Floor/Paper/Neon, 1440/375), **0 runtime errors** and **0
layout issues**. Three additional integration PNGs show a real devnet proposal
on Chats, the global decision drawer and the pad confirmation screen. The
proposal is refused from the mirror; no transaction is signed or submitted.
Real NDJSON events verify knob rotation and pressed-key travel. Every empty
state has an authored SVG, a setup reason and one recovery action. The final
capture waits for the first spot row's live quote result. No API is intercepted.
[Captures, before/after comparisons and measured manifest](docs/screens/v1/README.md).

**BLOCKED — real candle/24h history:** the specified T6 Pyth Benchmarks history
URL returned **HTTP 404**, then **HTTP 429** during repeated checks. All four
chart controls request the real service and show its error; candles and 24h
changes are not fabricated. The live Jupiter reference and perpetual marks are
independent of that failure. Restoring/reviewing the supported Pyth history
service is still required to verify candle drawing with real history.

The mechanical UI detector reported **0 findings**; changed UI modules and
new read services pass syntax and formatting checks. The full test runner and
browser runner run sequentially because both use port 8727. An initial parallel
attempt was stopped after that port collision; it is not counted as the full run.
The browser/server/sidecar processes are closed. Firmware is unchanged in T9;
the exact successful T8 compilation and **compiled, not yet flashed** limitation
remain below. Nothing was pushed.

---

# v1.0.0 release verification

T8 run on **2026-11-12 (Asia/Kolkata)**; UTC timestamps fall on November 11.
Runtime: Node **26.5.0**, npm **11.17.0**. Application/test baseline:
`35ef7a2`; T8 changes documentation and keeper version metadata only.
No application code or test was removed, modified or weakened.

## One complete test run

From the repository root, with the already installed dependencies and Python
Sibyl environment:

```sh
node --test --test-concurrency=1 --test-reporter=tap desk/test/*.test.mjs keeper/test/*.test.mjs site/test/*.test.mjs
```

This discovers the full `test/*.test.mjs` set used by all three package test
scripts. File concurrency is one to reduce simultaneous public-RPC requests.
The unmodified run exited **1** after **241,022.932125 ms**; no isolated rerun
was substituted for its result.

| Suite | Tests | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Desk | 108 | 94 | 0 | 14 |
| Keeper | 9 | 7 | 1 | 1 |
| Site | 14 | 14 | 0 | 0 |
| **Total, distinct tests in this run** | **131** | **115** | **1** | **15** |

Cancelled: 0. TODO: 0. The legacy memory/load-bearing executable test files each
count as one Node file subtest. Browser groups, the CLI proof and compilation
below use different units and are not added to this test total.
[Test-by-test machine-readable evidence](docs/v1/T8-RELEASE-RESULTS.json) records
all 131 outcomes, skip reasons, auxiliary results and the real traction snapshot.
Raw local logs are in `/tmp/xorrpad-t8-release/`; that temporary directory is not
a release dependency. Tests use real HTTP, chain reads and SQLite. No API is
intercepted and no price, fill, receipt or successful payment is mocked.

## The failure

**Test 116, `keeper/test/keeper.test.mjs:55`:**
`desk modules do not load keeper signing code or its key`.

The existing test recursively scans every desk module and forbids `.sign(`,
`.partialSign(` and `.sendRawTransaction(`. It fails on the shared v1 executor,
which intentionally signs/submits through the accepted capped session-wallet
path. The earlier keeper-only signing invariant predates T2. This is a real
failed regression check, not an upstream skip or a green release run. T8 leaves
the source and assertion unchanged.

**BLOCKED — release checks:** reconcile this isolation check with SPEC/T2's
approved signer boundary: keep keeper keys/imports isolated and venue adapters
unsigned, retain executor/session-wallet authorization tests, and verify the
resulting boundary with the complete command above. This requires the subsequent
code/test review (T9), not relabelling this failure as passed.

## Every skip and exact recovery action

The numbers below are the stable subtest IDs from this run, not projected counts.

1. **13 — `agent.test.mjs`: real localhost Ollama model list and provider chat.**
   Reason: `Ollama is not reachable on localhost: fetch failed`. Start Ollama at
   `http://localhost:11434`, pull a tool-capable model, then rerun
   `npm run test:agent --prefix desk`.
2. **14 — `agent.test.mjs`: live Anthropic /models and specified default model.**
   Reason: `ANTHROPIC_API_KEY is not set in the environment; no config files read`.
   Supply that variable through the test process environment with access to the
   configured model, then run the agent suite. Product keys belong in Electron UI.
3. **15 — `agent.test.mjs`: live Deepgram Aura PCM streams back through Nova-3.**
   Reason: `DEEPGRAM_API_KEY is not set in the environment; no config files read`.
   Supply the variable to the test process with STT/TTS access and run the agent
   suite. This verifies live synthesis/transcription, not physical pad audio.
4. **23 — `aggregate.live.test.mjs`: Meteora builds a real unsigned swap for an
   explicit public owner.** Reason: account-info RPC returned **HTTP 429,
   Connection rate limits exceeded**. Set `SOLANA_RPC` to an available mainnet
   read RPC (or wait for the quota to recover), then run
   `node --test desk/test/aggregate.live.test.mjs`. No mainnet send is required.
5. **29 — `backtest.http.test.mjs`: real Pyth HTTP strategy, prediction and agent
   tool round trips.** Reason: `Pyth history unavailable: HTTP 404`.
6. **33 — `backtest.live.test.mjs`: real Pyth candles cache, corrupt cache
   recovery, no fabricated volume and equity reference.** Same HTTP 404.
7. **34 — `backtest.live.test.mjs`: real history replay accounts for both fees,
   funding, slippage, sizing, exits and metrics.** Same HTTP 404.
8. **35 — `backtest.live.test.mjs`: no look-ahead: delayed real data delays
   decisions; truncated/future-shifted paths preserve past fills.** Same HTTP 404.
9. **36 — `backtest.live.test.mjs`: every book strategy uses real Pyth data and
   gate warmup; volume absence is explicit.** Same HTTP 404.
10. **37 — `backtest.live.test.mjs`: prediction exact helpers replay real Pyth
    path and disclose counterfactual edge.** Same HTTP 404.
    For **all six Pyth skips**, restore the specified
    `https://benchmarks.pyth.network/v1/shims/tradingview/history` service, or
    explicitly review/update the adapter to the official supported authenticated
    Pyth history API and provide its credential through the supported mechanism.
    Then run `npm run test:backtest --prefix desk`. A Hermes `PYTH_API_KEY` alone
    does not change this history adapter. No alternate candles were substituted.
11. **60 — `padlink.test.mjs`: key → live devnet signal → accept → actual
    confirmed receipt (funded test wallet required).** Observed **0 SOL,
    0 mUSDC**. Fund **`DbHsbDBtPHKGzEd4iC9QPPrKYhH68zchpznThZFbjxtD`** with
    **0.01 devnet SOL and at least 1 mUSDC**, then run
    `node --test desk/test/padlink.test.mjs`. This uses its dedicated ignored
    wallet and, once funded, submits a real 1 mUSDC devnet trade.
12. **80 — `phoenix.live.test.mjs`: Phoenix unsigned order simulates on real
    mainnet with sigVerify:false.** Reason: `Setup required: PHOENIX_AUTHORITY
    (registered, enabled, funded trader and SOL fee payer)`; actual simulation
    returned `AccountNotFound`. Configure that public authority and required
    trader/subaccount indexes, then run `node --test desk/test/phoenix.live.test.mjs`.
13. **81 — `phoenix.live.test.mjs`: Phoenix reads actual positions and builds a
    reduce-only close when an account is available.** Reason:
    `Setup required: PHOENIX_AUTHORITY (register and fund this Phoenix trader
    before opening positions)`. The configured existing trader must also have
    an actual open position. Rerun the same read/build/simulate suite; it does
    not sign or submit a mainnet order.
14. **88 — `pmamm.devnet.test.mjs`: the unsigned pm-AMM swap simulates
    successfully on real devnet.** Reason: `Setup required: PMAMM_TEST_OWNER`;
    automatic airdrop returned **HTTP 410: RPC faucet closed on devnet**.
    Set `PMAMM_TEST_OWNER` to a throwaway public key funded with **at least
    0.02 devnet SOL and 1 mUSDC** and rerun
    `node --test desk/test/pmamm.devnet.test.mjs`. `PMAMM_RPC` must be devnet.
15. **110 — `keeper/test/hermes.live.test.mjs`: Hermes parsing uses an actual
    signed response and retrieves the exact publish second.** Reason:
    `Setup required: PYTH_API_KEY (Hermes price endpoint returned HTTP 401)`.
    Supply `PYTH_API_KEY` in the keeper test process environment and run
    `npm test --prefix keeper`.

<a id="worker-brief-2--phoenix-all-markets"></a>

## Actual live evidence from this run

- Router discovery observed **7,549** pinned Jupiter mint identities,
  **7,174** Meteora pool rows, **109** Phoenix markets, **3** Jupiter Perps
  markets and **97** pm-AMM markets. Pool rows are not distinct asset counts;
  catalog membership is not a promise of executable liquidity.
- Real SOL spot routes quoted Jupiter and Meteora; real long/short quotes
  worked on both perp venues. Unknown Jupiter route fees stayed unknown.
  Phoenix's unsigned order was 542 bytes. No mainnet transaction was sent.
- Real pm-AMM YES/NO quotes, unsigned create/swap/claim and wrong-wallet/refreshed
  handoff checks passed. A newly generated session wallet signed a real devnet
  message and verified the signature locally **without broadcasting**.
- Actual TCP, authenticated Wi-Fi HTTP/WebSocket and serialport over real PTYs
  passed. The programmable outcome key produced a live quote, signal and accepted
  transition, then refused execution for missing `SOLANA_ADDRESS`. It invented
  no receipt. Keymap protection/persistence, framing and ordered PCM setup/error
  behavior passed; none establishes physical USB/BLE/audio behavior.
- Electron's real OS encryption round trip, ciphertext/masked listing and removal
  passed. Memory deletion changed three of four decisions with the control
  unchanged. Gate, queue, expiry, authentication, exact-message capability,
  mainnet acknowledgement and durable execution accounting tests passed.
- Creator `GFvUgcVeEwBHnirG1jwcjaMJ8qJhRq1DM33c78trum2f` had **0 markets**.
  An additional real read at **2026-11-11T23:00:11.877Z** returned a complete
  chain-history scan with **0 unique trader wallets, 0 swaps, 0.000000 mUSDC
  volume, 0.000000 mUSDC creator fees and 0 published resolutions**. These zeros
  describe the observed empty creator set, not a fallback for missing data.
- The public reference market's history scan was complete with **3 swaps**.
  One independently decoded historical swap had **10.093 mUSDC** gross volume
  and **0.100930 mUSDC** creator fees:
  [historical devnet reference](https://explorer.solana.com/tx/5hFEx7T33RLSekreevbuEZ1khnJojRi97eJ3EWndjpACwvxcFhtBfyPbRS8NQrcRtTW7ACcaCo2Be5kyxsqPnoKU?cluster=devnet).
  Replaying that confirmed receipt through the host bridge passed. It is neither
  our creator's traction nor evidence of a newly executed pad trade.

<a id="v1-t6--real-history-backtesting"></a>

## Backtest interpretation

Phoenix real taker fees were **0.00035**, with **168** historical funding
payments for the requested week. Jupiter Perps current opening/closing rates
were **0.0007** at slot **468298811**. Jupiter spot explicitly required fee
disclosure for both legs. The Pyth history 404 prevented successful candle replay,
PnL/edge results and empirical no-look-ahead verification. Prediction replay's
liquidity/settlement model is counterfactual, as disclosed in
[BACKTEST.md](docs/v1/BACKTEST.md); current fee snapshots are not historical fees.

## Browser, build and firmware checks

These were executed separately from the 131-test run:

- `npm run test:ui --prefix desk`: exit 0; **13 integration groups**, **26
  screenshots**, **0 issues**, **0 runtime errors**. Actual local server/SQLite
  and live venue reads on loopback **8727**; 1440/375 px in Floor, plus Pad/Trade
  in Paper/Neon. Checks include navigation, real state mutations, simulator
  connection, quote-backed prediction refusal and actual setup/error states.
- `npm run test:ui --prefix site`: exit 0; **2 viewport checks**, 1440/375 px,
  **0 runtime errors, document overflows, broken images or clipped controls**.
  Actual API handlers on **8719**; missing Upstash and reservation config are
  visible, signup failure preserves input, and pre-orders stay disabled.
  Both browser runs generated local captures; prior committed screenshot assets
  are retained to keep T8 focused on release documents. Current run summaries
  are saved in the machine-readable evidence.
- `npm run format:check --prefix site`: passed. `npm run build --prefix site`:
  passed with Vite **8.3.8**, **35 modules**. Build output stays ignored.
- `make -C tools/uipreview shots`: passed; **9 host-rendered frames** from the
  real firmware UI. These are layout fixtures, not current quotes/hardware proof.
- Arduino CLI **1.5.1**, ESP32 core **3.3.10**: exit 0 with the exact command:

```sh
arduino-cli compile --fqbn esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc firmware/xorrpad
```

Flash **1,476,455 / 3,145,728 bytes (46%)**; static RAM **59,060 / 327,680
bytes (18%)**, leaving **268,620 bytes**. Runtime PSRAM allocations are additional.
Dependencies and wiring are in [firmware/README.md](firmware/README.md).
Status: **compiled, not yet flashed**. No upload command was run.

<a id="v1-t2-step-5--session-wallet-devnet-proof-blocked"></a>

## Remaining BLOCKED items and exact next actions

Every skipped dependency is blocked as described individually above. In addition:

- **CLI auto-accept → session send/confirm/receipt:** the actual
  `node desk/test/t2-devnet.mjs` rerun exited **2**. It read **0 SOL, 0 mUSDC**
  for **`52wB7u5s6AEnCffq4Kvhd3Se4y53j1XMCsAsxRgRWvmL`**, retaining the prior
  HTTP 410 faucet evidence. Fund it with **0.2 devnet SOL and 20 mUSDC**, then
  rerun the same command for its capped 1 mUSDC cycle. It never loads another
  wallet or `.env`. This and the T4 test are blocked before signing/sending.
- **Keeper create → exact-expiry resolve:** fund
  **`GFvUgcVeEwBHnirG1jwcjaMJ8qJhRq1DM33c78trum2f`** with **at least 0.5
  devnet SOL** plus the configured market deposit (default **50 mUSDC per market**),
  supply **`PYTH_API_KEY`**, run `node keeper/fund.mjs`, then
  `node keeper/run.mjs --cycle`. Retain actual create/resolve signatures and
  exact-expiry signed observation evidence; an ambiguous confidence interval
  must remain unresolved. No completed keeper cycle is claimed.
- **Phone wallet/public TLS and remote pad:** configure a real authenticated
  reachable HTTPS desk relay, `SOLANA_ADDRESS`, and the applicable
  `PMAMM_PUBLIC_URL`, `SOLANA_PAY_PUBLIC_URL` and/or `PHOENIX_PUBLIC_URL`.
  Complete a real **devnet** phone signature/confirmation callback and verify
  the receipt independently. Local HTTPS-format handoff tests do not prove TLS
  reachability. Join the Mac mini to Tailscale; use LAN/USB or the pinned-TLS
  relay for ESP32, which does not join the tailnet itself.
- **XOR phone app:** Nick must supply its external Expo repository/build, then
  integrate BLE Nordic UART relay, authenticated `/events`, accept/refuse and
  wallet callbacks, and actual push notifications. Verify on a phone. This
  repository contains no installable Expo app or tested push service.
- **Physical board:** flash the compiled FQBN to the correct ESP32-S3, then sweep
  every key/hold, USB enumeration, BLE/MTU/phone relay, link failover, captive
  portal, NVS after power cycling, TFT orientation, INMP441 mic and MAX98357A amp.
  Repair the previously reported dead RUN solder joint and check unswept row 3.
  Wire/verify an encoder before claiming a physical knob. These are all
  **compiled, not yet flashed**, not inferred from host simulator success.
- **Packaged desk:** build/install the macOS app with its Python resources and
  verify safeStorage, session-wallet persistence, hardware discovery and voice
  in that package. The successful source-launched OS encryption test is narrower.
- **Live waitlist:** configure `UPSTASH_REDIS_REST_URL` and
  `UPSTASH_REDIS_REST_TOKEN` server-side, deploy a Preview and test a real signup,
  duplicate signup/count and actual rate-limit exhaustion. No successful Redis
  persistence or signup count was fabricated for this run.
- **Reservation payment:** Nick must approve `PREORDER_PRICE_USDC`, the public
  `PREORDER_MERCHANT_ADDRESS` and published reservation/refund
  `PREORDER_TERMS_URL`. For verification set `PREORDER_NETWORK=devnet`, a matching
  `PREORDER_SOLANA_RPC_URL`, initialize/fund the merchant's devnet USDC token
  account and fund a separate test payer. Pay one real reservation using the
  matching devnet USDC mint (not pm-AMM mUSDC), then verify reference/amount/mint/
  merchant and finalized receipt/reload. No real payment cycle is claimed.
- **Deployment/submission:** import `site/` in Vercel, configure its server
  variables, deploy Preview and verify the checked-in security headers before
  Production. Follow [site/README.md](site/README.md). Nick supplies demo/video/
  team/payout details in [the submission draft](HACKATHON_SUBMISSION_FORM.md).
  Deployment, pushing, tagging and submission were not performed by T8.

All test servers, browser processes and PTY helpers created by these commands
closed on completion. Ports used stayed within **8710–8729**. No mainnet
transaction was submitted. The old interactive `verify.mjs` and standalone
stress/gas diagnostics are outside the package test glob and were not run;
this document does not count them as passes. Historical milestone totals are
superseded by this single full run; earlier evidence remains in git history.
