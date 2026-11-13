# MODEL-3D-FIX verification

Completed 2026-11-12: **152 tests, 143 passed, 9 skipped, 0 failed**, exit 0,
416,333.878916 ms. Command: `node --test --test-concurrency=1 --test-reporter=tap desk/test/*.test.mjs keeper/test/*.test.mjs site/test/*.test.mjs`.
[Every result, skip reason and copy hash](docs/v2/MODEL-3D-FIX-RESULTS.json).

Five focused artifact checks pass and are included in the full total. They verify
both sub-2 MB GLBs with zero validator errors/warnings, 1080p six-second videos,
alpha stills, all 16 art size contracts, native/WASM RGB565 parity for both home
and offline, bounds-derived 8% framing, clearcoat/AO and genuine quote provenance.
The SOL price and historical trace are real timestamped public reads; no mocked
prices, balances, positions or fills are used. Studio profile/link configuration
is explicitly labelled STUDIO SNAPSHOT, not asserted hardware connectivity.

Playwright: **9 groups, 13 captures, no runtime errors or horizontal overflow**.
[Current desktop contact sheet](docs/screens/v2/sheet-3d.jpg). Native Apple M4
Metal: **60.04 fps** at browser DPR 2, 1440×900, with the final shared studio rig.
[GPU measurement](docs/screens/v2/model-metal-performance.json). The separate
SwiftShader measurement is not represented as native GPU performance.

The nine full-suite skips name actual dependencies: localhost Ollama unavailable;
ANTHROPIC_API_KEY and DEEPGRAM_API_KEY absent; Meteora RPC HTTP 429; an unfunded
pad test wallet; two PHOENIX_AUTHORITY setup cases; PMAMM_TEST_OWNER unfunded with
the public devnet faucet closed; and Hermes requiring PYTH_API_KEY. No test was
removed or weakened. No mainnet transaction was sent.

Production build, formatting and diff checks pass; the design detector reports
zero findings. ESP32-S3 compile passed with the recorded exact FQBN/command:
`arduino-cli compile --fqbn esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc firmware/xorrpad`.
Sketch **1,476,559 bytes**, globals **59,060 bytes**. **Compiled, not yet flashed**.
The home header/profile strip change is in the actual firmware ui.h and bundled
WASM, rather than a studio-only imitation. Earlier reports below are historical.

# MODEL-3D verification

Completed 2026-11-12: full desk + keeper + site **151 tests, 142 passed, 9 skipped,
0 failed**, exit 0, 416,946.845916 ms. Four new CAD/artifact/native-WASM tests pass.
Browser: **9 groups, 13 captures, zero runtime errors or overflow**. Native Metal
on Apple M4 measured **60.12 fps** at browser DPR 2, 1440×900. Headless SwiftShader
was slower and is recorded separately, not represented as native GPU performance.
[Results](docs/v2/MODEL-3D-RESULTS.json) · [Contact sheet](docs/screens/v2/sheet-3d.jpg).

Both 1.4 MB GLBs pass gltf-validator with zero errors and warnings. Movies are
six seconds at 1920×1080 / 30 fps. All 16 commissioned assets are below 400 KB.
Firmware RGB565 pixels match native and WebAssembly byte for byte. ESP32-S3
compiled with the previously recorded FQBN: 1,476,455 sketch bytes, 59,060 global
bytes. **Compiled, not yet flashed.** No mainnet transaction was sent.

# Desktop v2 · FIX-1 verification

Run on **2026-11-12 (Asia/Kolkata)**, Node 26.5.0. The approved brand direction
is unchanged. FIX-1 corrects action notification lifetime, complete headlines,
Agent art, keyboard commands, Connect media containment and mobile navigation.

| Run | Checks | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| **Full desk + keeper + site** | **147** | **137** | **0** | **10** |
| Desktop HTTP integration (subset) | 6 | 6 | 0 | 0 |
| Playwright browser groups | 8 | 8 | 0 | 0 |

Full command: `node --test --test-concurrency=1 --test-reporter=tap desk/test/*.test.mjs keeper/test/*.test.mjs site/test/*.test.mjs`.
Exit 0, **530,203.3585 ms**, cancelled 0, TODO 0.
[Every result and skip reason](docs/v2/FIX-1-RESULTS.json). The focused HTTP tests
are included in that total; browser groups are reported separately. Two earlier
attempts were stopped after another worktree occupied port 8717. The final run
waited for that runner to exit and completed without a port collision.

The ten skips are actual dependencies: localhost Ollama unavailable;
`ANTHROPIC_API_KEY` and `DEEPGRAM_API_KEY` absent; Meteora RPC HTTP 429;
GeckoTerminal aggregation HTTP 429 with Pyth fallback HTTP 404; an unfunded
pad devnet test wallet; two `PHOENIX_AUTHORITY` setup cases;
`PMAMM_TEST_OWNER` unfunded with the devnet faucet closed; and Hermes requiring
`PYTH_API_KEY`. The current keeper/session isolation assertion passes.
No test was removed or weakened. These are the current full-suite counts;
the T10 and earlier reports below remain historical evidence.

Commands: `npm run build:app --prefix desk`;
`node --test desk/test/desktop-v2.http.test.mjs`;
`node desk/test/desktop-v2.mjs`. All exit 0. The browser harness verifies actual
keymap saves, profile selection, NDJSON hello/knob/disconnect, ability install /
uninstall, four-second and manually dismissed notifications, full reduced-motion
headlines, keyboard palette search across six screens and four actions, legacy
routes, a real devnet quote-backed proposal followed by Refuse, and every screen
at both sizes. **13 captures, zero runtime errors, zero layout issues**.
[Capture guide and manifest](docs/screens/v2/README.md) ·
[Contact sheet](docs/screens/v2/sheet.jpg).

Every capture starts from a freshly loaded app session. No action toast is
stored or resurrected, no reveal is captured midway, and the complete pad fits
above the mobile bottom bar. Markets retains real GeckoTerminal candles and
live venue catalog counts; an unavailable spot reference is labelled unavailable.
No responses, prices, credentials, signatures or fills are invented.

The production app builds. Changed app and harness files pass Prettier and
`git diff --check`; the Impeccable detector reports zero findings. Firmware
compiles with the exact command recorded in [firmware/README.md](firmware/README.md):
`arduino-cli compile --fqbn esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc firmware/xorrpad`.
Sketch **1,476,455 bytes**, globals **59,060 bytes**. **Compiled, not yet flashed**.
No signed firmware package is available; Connect says Setup required. Voice
requires the user's Deepgram key and verified pad. A loss cooldown requires
confirmed realized-PnL metadata; unknown PnL is never turned into a loss.
No transaction was signed or submitted by the browser harness.

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
and formatting checks. `node desk/test/history-ui.mjs` passes three browser
integration groups and writes **18 real captures**: Trade spot, Trade perp and
Backtest, each in all three themes at 1440 and 375. It verifies all four candle
timeframes, the separate live mark and a successful replay. Runtime errors 0;
layout issues 0. [T10 capture manifest](docs/screens/v1/history-manifest.json)
and [before/after guide](docs/screens/v1/README.md). All started processes are
closed; nothing was pushed.

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

## Firmware v2 — S1 desk integration (2026-11-12)

S1 covers the desk bridge, Connect/Trade renderer, simulator and protocol tests.
The pre-existing device firmware edits remain separate work. Device status is
**compiled, not yet flashed**; no physical BLE, audio, encoder, NVS power-cycle,
factory test or rollback behavior is established by host tests.

- `firmware/test/run.sh`: **80 cases, 109 assertions, all passed** using the
  device Crypto implementation, ArduinoJson and native clang.
- Both current working-tree ESP32 builds pass with ESP32 core **3.3.10**:
  normal **1,754,018 bytes**; release **1,752,866 bytes**; both use **65,084 bytes**
  of static RAM. The factory adapter needed its missing `link.h` include.
  These compile checks did not open a signing key or replace signed artifacts.
- Focused v2 crypto/signal tests: **21 passed**. Simulator integration:
  **5 passed**, including real devnet quote/fingerprint/hold and signed OTA.
- Isolated Playwright Connect check passed settings persistence, three-layer
  profile saving, disconnected action guards, 375/1440 px overflow checks and
  browser runtime-error checks. The broader `test:ui` matrix was interrupted;
  it is not counted as a pass here.
- `npm test` now runs files sequentially so the live suites share public API
  capacity. Assertions and live-provider/setup skip conditions are unchanged.
  Final full run: **139 tests, 129 passed, 10 explicit skips, 0 failed,
  0 cancelled** in **377.33 s**. All five v2 integration cases passed in this
  run. Skips reflect unavailable provider credentials, accounts/funding or
  live-provider limits; they are not counted as successful integrations.

The exact FQBN and both compile commands are recorded in
[firmware/README.md](firmware/README.md#v2-working-tree-compile-evidence--s1-2026-11-12).

`desk/test/pad-v2.e2e.test.mjs` uses real SQLite and desk HTTP routes, fragmented
encrypted TCP and serial framing. It checks pairing, plaintext downgrade/replay
rejection, authenticated management, settings, telemetry liveness, kill-latch
reboot persistence and rearm validation. Its OTA test requires the existing
public signed `firmware/build/artifacts/{manifest.json,app.bin}` from an authorized
release build and checks both correct and incorrect signatures. The live signal
test uses an actual devnet quote and independently verifies a historical receipt;
it does **not** claim a new fill. Missing live dependencies remain explicit skips.


## Firmware v2 — S2 pairing and protocol (2026-11-12)

Status: **compiled, not yet flashed**. S2 changes are committed independently of
pre-existing firmware work; no upload, private-key read, new signing operation,
secure-boot enablement or push was performed.

| Check | Result |
| --- | --- |
| Native S2 staged-source snapshot | 91 cases, 192 assertions, all passed |
| Native complete working tree | 98 cases, 215 assertions, all passed |
| Focused desk crypto/reliability | 26 passed, no skips |
| Full desk `npm test` | 150 tests: 140 passed, 10 dependency skips, 0 failures |

Full desk duration: **422.23 s**. Existing live-provider/setup skip conditions
were retained. Real v2 simulator integration, signed public OTA artifact intake,
live devnet quote/fingerprint/hold and historical-receipt verification passed;
no new fill is claimed. Fault tests use real TCP endpoints and real cryptography,
with dropped delivery/clock boundaries injected; they fabricate no quotes/fills.

Native tests compile the production Crypto/ArduinoJson frame engine with clang.
Coverage includes fresh handshake challenges, weak points, directional keys,
Node/native byte-for-byte AEAD conformance, CRC/tag/sequence/ack tampering,
replays, lost data overtaken by control frames, dropped acks, bounded retries,
sequence exhaustion, timer wrap, watchdog and USB → BLE → Wi-Fi priority.
Desk tests also cover reconnect with new keys, watchdog expiry during backend
work, standby trade rejection, expired delivery queues and v1 framing.

Final complete-working-tree builds passed in both modes with ESP32 core 3.3.10:
normal **1,759,786 bytes flash**; release **1,758,658 bytes flash**; both
**65,252 bytes static RAM**, against 3,145,728/327,680-byte limits. An earlier
isolated staged S2 snapshot also compiled in both modes at **1,523,927 bytes
flash, 63,012 bytes static RAM**. The final normal build used a separate build
path and external-drive temp directory after a parallel normal/release attempt
collided in Arduino's shared cache. The cache error and temporary disk-space
failure were resolved; neither failed attempt is counted as a pass. Final
normal-mode compiler syntax/type checking also passed. Signed OTA artifacts
were retained and no signing key was opened.

Exact FQBN, commands and dependency versions are in
[firmware/README.md](firmware/README.md). TFT/QR scan quality, BLE SMP/passkey
interoperability, physical failover and NVS behavior still require the board.


## Firmware v2 — S3 kill latch (2026-11-12)

Status: **compiled, not yet flashed**. The isolated S3 feature snapshot passes
106 native cases / 235 assertions. Fifteen new cases exercise the production
kill state machine: 2-second threshold, release/tap cancellation, timer wrap,
NVS latch-byte reboot restoration, corrupt/unavailable storage, offline signal
refusal, fresh 800 ms consent, delayed completion after release, failed NVS
clear, expiry, disconnect, and a second kill during re-arm. Hardware NVS
power-cycle and physical controls still require the board.

KILL discards queued inputs/retries and recording before notifying the desk.
The latch wins over remote armed/auto-accept status and signal messages, and
the TFT kill screen wins over pairing, stale quotes, receipts, and keymaps.
Re-arm is authenticated, bound to its transport, and clears memory only after
its NVS write succeeds. No signing key, flash operation, or push was used.


## Firmware v2 — S3 profiles and knob (2026-11-12)

Status: **compiled, not yet flashed**. S3 commits are built from an isolated
snapshot so the earlier uncommitted OTA/voice/factory/health work is not folded
into these features. The full working tree is checked separately.

| Check | Result |
| --- | --- |
| Native isolated S3 snapshot | 137 cases, 460 assertions, all passed |
| Native complete working tree | 144 cases, 483 assertions, all passed |
| New encrypted USB profile/knob integration | Passed, all 24 maps and desk permission cap |
| Partition layout check | 16 MB, no overlap, original A/B app offsets and sizes retained |
| Existing host TFT renderer | Built and emitted nine frames; no hardware claim |

The 31 new profile/knob cases exercise the production ArduinoJson parser,
complete eight-profile/three-layer round trips (including revisions and maximum
binding lengths), invalid storage and immutable safety cells, incomplete and
out-of-order sync, selection preservation by name, acceleration boundaries,
mode bounds, timer wrap, quadrature decoding, switch debounce and PTT/click
exclusion. Tests link no mocked hardware API. Existing native tests are retained.

The added desk integration uses the real server, SQLite, encrypted fragmented
USB framing and authenticated HTTP management routes. It sends all eight
three-layer configurations, selects profile 7/Predict, checks device state
intake and verifies that knob size remains permission-capped, with leverage and
slippage stored for subsequent proposals. It creates no synthetic quote/fill.
The existing kill-reboot/re-arm simulator and real devnet signal tests remain.

A single NVS blob commits only after the complete desk sync. While busy, the
old map stays active. Failed writes preserve the installed data and retries
are throttled. Factory reset in the complete working tree also erases the new
profile partition. On the board, verify power-loss behavior, switching all
24 maps, physical encoder direction/bounce, TFT status strip, and PTT audio.
The partition table must be installed before profiles can persist; app-only
OTA cannot create a new NVS partition on an older layout.

Final full desk `npm test`: **151 tests, 140 passed, 11 explicit skips,
0 failures, 0 cancelled**, in **441.87 s**. Existing skip conditions were
retained: unavailable credentials/services, unfunded test accounts, public RPC
429 limits and a Phoenix HTTP 503. The new S3 USB case and existing v2
kill-reboot/re-arm, OTA, replay and real devnet signal cases all passed.

All four ESP32 builds passed (ESP32 core 3.3.10):

| Source | Normal flash | Release flash | Static RAM (both) |
| --- | ---: | ---: | ---: |
| Isolated committed S3 snapshot | 1,542,703 bytes | 1,542,703 bytes | 63,252 bytes |
| Complete working tree | 1,767,558 bytes | 1,766,342 bytes | 64,844 bytes |

Limits: 3,145,728 bytes per app slot, 327,680 bytes static RAM. Runtime profile,
JSON, audio and display allocations are additional. Exact commands/FQBN are in
[firmware/README.md](firmware/README.md#v2-s3-kill-latch-profiles-and-rotary-controls-2026-11-12).
No upload, signing-key read, new signing operation, eFuse action or push occurred.

## Firmware v2 — S4 voice (2026-11-12)

**Compiled, not yet flashed.** Nine new native cases exercise energy VAD,
noise gate/hangover, waveform bounds, shared volume, distinct chimes, actual
Opus encode/decode at exactly 24,000 bits per second, partial-frame padding,
stream resets, malformed packets and ordered TTS/PCM fallback. At this step
`firmware/test/run.sh`: **153 cases, 970 assertions, all passed** (including
pre-existing working-tree tests). Three new encrypted simulator tests pass:
BLE Opus TTS at 60 bytes/20 ms, exact USB PCM and invalid voice rejection.
Complete normal working-tree build: **1,768,470 bytes flash; 64,900 bytes static
RAM** before S4 health changes. Final normal/release evidence follows below.
Mic, speaker, knob, TFT and radio behavior still require hardware verification.

## Firmware v2 — S4 health and final builds (2026-11-12)

**Compiled, not yet flashed.** S4 adds 14 native cases and seven encrypted
simulator cases across voice and health. Native results:

| Source | Cases | Assertions | Result |
| --- | ---: | ---: | --- |
| Isolated S4 commit snapshot | 151 | 992 | all passed |
| Complete working tree, preserving pre-existing work | 158 | 1,015 | all passed |

The health cases cover exact 30-second cadence and timer wrap, bounded brownout
and watchdog reset history, crash size/digest validation, ack binding, chunk
progress, reconnect, failover, same-transport re-pair and lost-ack retries.
The desk tests pair over real TCP with v2 encryption, exercise actual Opus,
and test ordered binary crash transfer, private durable file storage, hash and
offset failures, retry idempotence and storage failure without acknowledgment.
Their generated transfer bytes are protocol fixtures, not a claim of a crash
captured from hardware. Plaintext telemetry cannot update an encrypted peer.

All four final Arduino builds passed with ESP32 core **3.3.10**:

| Source | Normal flash | Release flash | Static RAM (both) |
| --- | ---: | ---: | ---: |
| Isolated S4 snapshot | 1,741,027 bytes | 1,741,027 bytes | 64,204 bytes |
| Complete working tree | 1,770,706 bytes | 1,769,562 bytes | 64,940 bytes |

App-slot limit: 3,145,728 bytes; static RAM limit: 327,680 bytes. Dynamic Opus,
PSRAM audio/display and JSON allocations are additional. Exact working-tree
commands and FQBN are in [firmware/README.md](firmware/README.md#v2-s4-voice-2026-11-12).
The isolated snapshot uses those same flags/FQBN with a separate source and
build path, keeping unrelated unfinished work out of the S4 commits.

Hardware still needs mic/VAD calibration, BLE throughput and latency, actual
PTT/knob/chimes/waveform, watchdog panic capture, brownout/reset history, flash
dump retention across power loss, and reconnect/upload/erase verification.
No upload/flash, secret-file read, signing, eFuse action or push was performed.

Final full desk `npm test`: **158 tests, 148 passed, 10 explicit skips,
0 failures, 0 cancelled**, in **386.30 s**. Skips retain the suite's existing
setup conditions (missing optional credentials/services or unfunded devnet
accounts). An initial full run timed out in the existing live book-strategy
market-data test; that unchanged test passed in **68.14 s** on the final run.
All seven S4 desk tests and existing v2 pairing, OTA, kill, replay, profile and
live devnet signal/verified historical receipt cases passed.

## Firmware v2 — S5 manufacturing (2026-11-12)

**Compiled, not yet flashed.** Eight new native cases cover the actual factory
state machine: fixed matrix numbering/unused cells, unique presses, ordered
knob/mic/inspection steps, RGB observation time, explicit NO failure, scan plus
advertising requirements, timeout wrap and uninterrupted/cancelled reset holds.
The isolated factory snapshot passes **159 cases / 1,055 assertions**. Five
new desk tests verify real Ed25519 signed reports, CRC, serial and public-key
binding, incomplete/inconsistent reports, per-component FAIL, bounded fragmented serial framing and forged signatures
with attacker-recomputed CRC. They pass without accessing hardware or secrets.
The keys used by those tests are ephemeral cryptographic test material.

Hardware is still required for chord wiring, all key switches, knob direction,
mic calibration, sweep audibility, TFT pixels/colours, LED channels, Wi-Fi/BLE,
CDC reconnect and default/profile NVS erasure across reboot. No physical flash,
factory reset, production security provisioning or eFuse operation was run.

The isolated manufacturing feature compiles normally at **1,748,267 bytes flash /
64,340 bytes static RAM** (ESP32 core 3.3.10). Final normal/release evidence for
S5 follows below.

## Firmware v2 — S5 release and final builds (2026-11-12)

**Compiled, not yet flashed.** Three additional native cases verify that USB
debug defaults off, requires authenticated USB desk consent, and loses consent
on disconnect, failover, re-pair or reboot. Native suites are green:

| Source | Cases | Assertions | Result |
| --- | ---: | ---: | --- |
| Isolated S5 commit snapshot | 162 | 1,074 | all passed |
| Complete working tree, preserving pre-existing work | 169 | 1,097 | all passed |

Final full desk `npm test`: **162 tests, 152 passed, 10 explicit skips,
0 failures, 0 cancelled**, in **420.68 s**. Existing setup/service skip
conditions remain unchanged. That run includes four factory cases; the final
fifth case (forged Ed25519 with recomputed CRC) was subsequently added and all
**five factory cases passed** in a targeted run. No tests were removed or
weakened. Native tests run real logic; these results do not establish hardware
behavior. `sh -n firmware/factory.sh` and diff whitespace checks also pass.

All final Arduino CLI builds pass, with ESP32 core **3.3.10**:

| Source | Normal flash | Release flash | Normal static RAM | Release static RAM |
| --- | ---: | ---: | ---: | ---: |
| Isolated S5 snapshot | 1,749,347 bytes | 1,747,307 bytes | 64,356 bytes | 64,276 bytes |
| Complete working tree | 1,774,886 bytes | 1,772,750 bytes | 65,004 bytes | 64,932 bytes |

App-slot limit: **3,145,728 bytes**; static RAM limit: **327,680 bytes**.
Runtime audio, PSRAM display buffers and JSON allocations are additional.
Exact normal/release commands, FQBN, source/build paths and CLI version are in
[firmware/README.md](firmware/README.md#v2-s5-release-validation-2026-11-12).

Binary inspection confirms the telnet greeting and application startup banner
exist in normal images and are absent in release images. Telnet networking
and parsing are also excluded by preprocessing; USB diagnostics remain behind
volatile, authenticated USB consent, checked again at every diagnostic write.
Secure Boot v2 and flash/NVS encryption are documented in
[firmware/PRODUCTION.md](firmware/PRODUCTION.md), with permanent eFuse/key/recovery
warnings. They are not enabled. No flash/upload, hardware reset, signing-key
read, release signing operation, security configuration/eFuse change or push occurred.

## Firmware v2 — S6 P1 presentation (2026-11-12)

**Compiled, not yet flashed.** Firmware remains **2.0.0** on local branch
`fw-v2`. P1 is split into local screen/sprite, accessibility/idle, LED-language
and integration-hardening commits. Unrelated unfinished firmware work is
preserved outside those commits. No upload, signing-key read, release signing,
eFuse/security operation or push was performed.

Nine new native cases exercise the actual presentation logic: the exact
RGB565 palette, lossless bounded reply pagination (including clock wrap),
idle boundaries/night clamps/wake, every four-cell left-handed permutation,
LED priority/pulse/off phases, and confirmation visibility under all overlay
states. All native tests passed:

| Source | Cases | Assertions | Result |
| --- | ---: | ---: | --- |
| Isolated S6 commit snapshot | 171 | 1,512 | all passed |
| Complete working tree | 178 | 1,535 | all passed |

Final full desk `npm test`: **163 tests, 153 passed, 10 explicit setup/provider
skips, zero failures, zero cancelled**, **445.10 s**. The existing encrypted
USB management test now verifies all four accessibility/night flags, brightness,
and rejection of out-of-range brightness without changing the saved value.
Real quote/provider, simulator, crypto, OTA, factory, voice and health tests
remain enabled; no tests were deleted or weakened.

All final normal/release Arduino CLI builds passed:

| Source | Normal flash | Release flash | Normal static RAM | Release static RAM |
| --- | ---: | ---: | ---: | ---: |
| Isolated S6 snapshot | 1,775,658 bytes | 1,773,486 bytes | 65,196 bytes | 65,116 bytes |
| Complete working tree | 1,781,430 bytes | 1,779,282 bytes | 65,236 bytes | 65,156 bytes |

Limits are **3,145,728 bytes per app slot** and **327,680 bytes static RAM**.
Two runtime PSRAM sprites add **307,200 bytes**; audio/JSON/other runtime memory
is additional. Arduino CLI **1.5.1**, ESP32 core **3.3.10**; exact FQBN,
flags, source and output paths are in
[firmware/README.md](firmware/README.md#v2-s6-p1-presentation-2026-11-12).

`make -C tools/uipreview` and the preview executable passed, rendering sixteen
frames of the same Adafruit GFX drawing code to `firmware/build/s6-ui/`.
Visual review covered chart/status separation, the canonical signal conformance
vector (explicitly not a live quote), the historical receipt, empty positions,
reply wrapping/high contrast, listening, OTA, coded fixes and kill. The preview
also asserts that pending/listening/update state cannot replace the killed
screen. Palette values and visibility rules are covered by native logic tests.
Diff whitespace checks pass.

**Nick still needs to verify on the assembled board:** PSRAM allocation and
flicker/tearing over SPI, QR scanning/BLE passkey visibility, PWM brightness
and physical wake, two-/ten-minute idle transitions, contrast in ambient light,
left-handed cap/wiring correspondence, audible amount timing/provider setup,
LED colors/brightness, waveform and OTA/reboot behavior. Compilation, native
logic and laptop rendering do not establish those physical results.


## Firmware v2 — S7 end-to-end validation (2026-11-12)

Firmware **2.0.0** on local branch `fw-v2`: **compiled, not yet flashed**.
S7 adds one end-to-end case and strengthens the existing cases without removing
or weakening any test. The test, P2 research and protocol/release documentation
are separate local commits. Pre-existing unfinished firmware changes remain
outside those commits. No push, flash, release signing, signing-key read,
security provisioning or eFuse action was performed.

The focused simulator run passes **7/7 tests**, zero skips/failures/cancelled,
in **22.40 s**. Actual desk routes, fragmented TCP and serial CRC records use
real X25519/Ed25519/ChaCha20-Poly1305. Wire observations verify encryption.
A live devnet quote produces the matching signal fingerprint; the desk also
rejects authenticated wrong-fingerprint and 799 ms confirmations. Releasing
YES cancels the simulated hold. A separately chain-verified historical receipt
traverses the encrypted link; **no new funded fill is claimed**.

Kill persistence is read by a new simulator instance before reconnection;
clearing the desk's remembered latch makes it relearn disarm from encrypted
ready. Rearm still needs the desk plus fresh physical-hold simulation. Exact
wire replay is rejected in both directions without applying the key/config
again. The OTA case verifies the existing compiled signed public artifact,
rejects missing/bad signatures and corrupt bytes, and completes the valid
transfer. This artifact is 1,752,144 bytes, SHA-256
`202fd32f33a6c0e6f7674c8603d808797e4326a2cacf978a1e13d8d13d7ca26e`;
it is distinct from the final builds below. No signing key was needed or read.

Native tests run the actual portable C++ logic and installed Crypto/Opus code:

| Source | Cases | Assertions | Result |
| --- | ---: | ---: | --- |
| Committed firmware snapshot | 171 | 1,512 | all passed |
| Complete working tree, preserving unfinished changes | 178 | 1,535 | all passed |

All four Arduino CLI builds pass (CLI **1.5.1**, ESP32 core **3.3.10**):

| Source | Normal flash | Release flash | Normal static RAM | Release static RAM |
| --- | ---: | ---: | ---: | ---: |
| Committed firmware snapshot | 1,775,658 | 1,773,486 | 65,196 | 65,116 |
| Complete working tree | 1,781,430 | 1,779,282 | 65,236 | 65,156 |

All sizes are bytes. Limits: **3,145,728 bytes per app slot**, **327,680 bytes
static RAM**. Runtime PSRAM sprites, audio and JSON allocations are additional.
Exact FQBN, flags, paths and commands are in
[firmware/README.md](firmware/README.md#v2-s7-end-to-end-validation-2026-11-12).
S7 changes no firmware runtime source; the committed-source snapshot excludes
the eight firmware files already modified when S7 began.

Full automated package run (all desk, keeper and site test files, sequential):

```sh
node --test --test-concurrency=1 --test-reporter=tap desk/test/*.test.mjs keeper/test/*.test.mjs site/test/*.test.mjs
```

Final serial run exits **0** in **411.29 s**: **187 tests, 175 passed,
12 explicit setup/provider skips, zero failures and zero cancelled**.

| Suite | Tests | Passed | Skipped | Failed/cancelled |
| --- | ---: | ---: | ---: | ---: |
| Desk (includes all seven S7 cases) | 164 | 154 | 10 | 0 |
| Keeper | 9 | 7 | 2 | 0 |
| Site | 14 | 14 | 0 | 0 |
| Total | 187 | 175 | 12 | 0 |

Desk skips disclose unreachable Ollama, missing Anthropic/Deepgram/Electron
setup, a Meteora RPC HTTP 429, missing keeper public metadata, and unfunded
devnet/Phoenix accounts. Keeper skips disclose missing Hermes authorization and
missing local keeper-key setup; no key generation is run.
All S7 end-to-end cases pass without skips in the final run. The previously
timed-out live book-strategy test passes in **68.03 s**. Final log:
`firmware/build/s7-final-all.log`.

Other checks: `npm run test:ui --prefix desk` passes **15 integration groups /
54 screenshots**, zero issues/runtime errors. `npm run test:ui --prefix site`
passes **2 viewport checks** (1440/375 px), zero runtime errors. Site build and
format checks, shell/JavaScript syntax checks and `git diff --check` pass.
`make -C tools/uipreview` and `tools/uipreview/preview firmware/build/s7-ui 2`
pass, rendering **16 frames** with the real GFX drawing code. Generated browser
artifacts are preserved under ignored `firmware/build/s7-browser-evidence/`;
tracked v1 screenshot baselines are restored. Logs are `firmware/build/s7-*.log`.

The final standalone `node desk/test/history-ui.mjs` run exits **0** with
**3 checks / 18 captures**, zero errors/issues. It verifies all timeframe chips,
real candle drawing, perpetual spot-reference disclosure and backtest charts
at desktop/mobile sizes across the three themes. Final log:
`firmware/build/s7-final-history-ui.log`.

The initial run overlapped live-history browser checks with package tests.
It finished **187 tests: 175 passed, 11 setup/provider skips, 1 cancelled by
the existing 120-second live book-strategy timeout, zero assertion failures**
(exit 1, 628.99 s). The initial history browser check also timed out waiting
for live candles. Both initial logs are retained (`s7-all.log` and
`s7-history-ui.log`); the final runs are serialized, with no timeout or test
assertion changes.

[Protocol v2](docs/v2/FIRMWARE-PROTOCOL-V2.md) documents the tested flow and
[firmware/RESEARCH.md](firmware/RESEARCH.md) records P2 findings, checked against
Espressif and LVGL primary documentation. Neither WakeNet nor LVGL was built.
Physical USB/BLE security/latency, TFT/LED/audio behavior, button timing,
actual NVS power-loss persistence, OTA partition writes/boot/rollback and phone
interoperability still require Nick's assembled-board verification. Native
logic, simulator disk persistence and laptop screenshots do not establish
those hardware results. Standalone interactive/funding/stress diagnostics
outside the automated suites are not invoked.

## Firmware v3 — V1 clear signing (2026-11-12)

Status: **compiled, not yet flashed**. V3-SPEC item 1 is implemented; items 2–8
are outside this step. [V3-NOTES.md](firmware/V3-NOTES.md) records the actual
wire-format limitations, exact review API and remaining hardware work. No
signing key was opened, no transaction broadcast, no image signed/flashed,
no production security enabled and nothing pushed. Pre-existing unfinished
firmware edits are preserved separately from the V1 commits.

Final native verification:

| Source / run | Cases | Assertions | Failed / skipped |
|---|---:|---:|---:|
| Full working tree, `firmware/test/run.sh` | 202 | 2,030 | 0 / 0 |
| Same tree, AddressSanitizer + UndefinedBehaviorSanitizer | 202 | 2,030 | 0 / 0 |
| Isolated staged V1 + committed v2 | 195 | 2,007 | 0 / 0 |

The sanitizer run uses the same run.sh command with
`-fsanitize=address,undefined -fno-omit-frame-pointer` added to clang++, writing
`firmware/build/native-tests-asan`; no hardware adapters are mocked. The
isolated command is `firmware/build/v3-snapshot/firmware/test/run.sh`.

The twelve JSON fixtures are captured by
`node firmware/test/generate-solana-fixtures.mjs` from actual v1 venue builders
and official web3/SPL constructors, with live public chain reads/blockhashes.
pm-AMM/System/SPL use devnet; Phoenix/Jupiter are unsigned read-only mainnet
captures because the v1 adapters have no devnet deployment. No private key is
loaded/generated by that script and no test submits those transactions.
Jupiter route layouts are generated from its actual public on-chain Anchor
IDL (211 variants; address, observed slot and hash are pinned in the header).

Coverage includes legacy/v0 headers, exact SHA-256/base58 fingerprints, every
truncation of a real message, canonical compact lengths, invalid account and
program indices, duplicate accounts, lookup evidence ownership/layout/order
and tampering, ATA mint proofs, integer precision, transfer variants,
pm-AMM directions, actual Phoenix IOC options/flags, Jupiter route amounts,
unknown-instruction redirection without invented amounts, chunk ordering,
digest/size/time/epoch binding, all-page review and fresh hold requirements.
Blind signing is off by default and needs 3,800 ms when enabled. Lookup-bearing
messages remain blind because cross-checking two desk-supplied representations
does not authenticate chain state. Phoenix native lots/ticks are displayed;
account-wide leverage is not encoded in the order and is not invented.

JavaScript suites, with zero failures or cancellations:

| Command | Passed | Explicit setup/provider skips | Total |
|---|---:|---:|---:|
| `npm test --prefix desk` | 158 | 10 | 168 |
| `npm test --prefix site` | 14 | 0 | 14 |
| `npm test --prefix keeper` | 7 | 2 | 9 |
| Final focused `node --test desk/test/clear-sign.test.mjs` | 4 | 0 | 4 |

The full desk run took 416.60 s. Its skips report unavailable public-provider
capacity or missing funded/public account setup, never fabricated successes.
The final focused test additionally verifies full-message-hash mismatch
rejection after the full suite began. It uses an actual paired encrypted TCP
pad-simulator connection and captured devnet transaction bytes, with a real RPC
genesis check; default-off blind policy, short holds, wrong fingerprints,
wrong full digests and repeated approvals are refused. It does not simulate
firmware parsing: the native C++ tests run the real parser/gate separately.

Exact FQBN and compile-only commands are in
[firmware/README.md](firmware/README.md#v3-v1-clear-signing-2026-11-12).
Arduino CLI 1.5.1 / ESP32 core 3.3.10. Final build sizes:

| Source | Mode | Flash bytes / 3,145,728 | Static RAM / 327,680 |
|---|---|---:|---:|
| Full working tree | normal | 1,818,070 | 65,612 |
| Full working tree | release | 1,815,962 | 65,532 |
| Isolated V1 + committed v2 | normal | 1,812,938 | 65,556 |
| Isolated V1 + committed v2 | release | 1,810,722 | 65,476 |

Runtime allocations and the two existing PSRAM sprites are additional.
The isolated source was exported from the index with `git checkout-index`
under ignored `firmware/build/v3-snapshot`; it excludes all earlier unfinished
firmware changes. Final verification logs are `firmware/build/v3-*.log`.

`make -C tools/uipreview` and
`./tools/uipreview/preview firmware/build/v3-ui 2` pass with 19 actual GFX
layout renders. Clear review wraps the captured public destination and shows
its actual message fingerprint; blind-disabled and extra-hold states use a red
screen. These are layout exercises, not executed trades. Full addresses are
reviewed on separate knob pages; only pages actually drawn count toward YES.
Button timing, physical knob/TFT/LED behavior, BLE upload throughput and board
integration still require Nick's assembled hardware.

## Firmware v3 — V2 session signing (2026-11-12)

**Compiled, not yet flashed.** See [V3-NOTES.md](firmware/V3-NOTES.md#v2--session-signing-2026-11-12)
for the precise item-2 implementation and refused/unproven cases. Session keys
exist only in pad NVS or ephemeral native-simulator memory; no private material
was opened, logged, saved by the simulator or committed. No transaction was
broadcast and no image was signed/flashed. No eFuses/security settings changed.
The original eight unfinished firmware files remain uncommitted and preserved.

| Native source | Cases | Assertions | Failures / skips |
|---|---:|---:|---:|
| Full working tree | 212 | 2,169 | 0 / 0 |
| Isolated index: V2 + committed V1/v2 | 205 | 2,146 | 0 / 0 |

Commands: `firmware/test/run.sh` and
`firmware/build/v2-snapshot/firmware/test/run.sh`. Both also compile the native
`session-driver` used by the desk simulator tests. Ten new native cases cover
real captured instruction amounts, per-trade/program/mint/signer refusals,
unmeasurable Phoenix leverage, pad auto-policy matching, full-review/fresh-hold
authorization, policy serialization, rolling expiry, reboot restoration,
failed durable writes, overflow and journal capacity. Existing tests remain.

`node firmware/test/generate-session-fixture.mjs` generated the new public
`session-usdc-transfer.json` using the actual SPL transferChecked builder,
verified live devnet collateral mint/decimals, and a live blockhash. The source
and destination are derived token accounts; this unsigned parser fixture does
not assert they are funded. No handwritten serialized message was added.

The final focused `node --test desk/test/pad-signer.test.mjs` passes all **5**
tests. It executes production C++ parsing/approval/caps/counter and Ed25519 in
a native child, verifies its signatures independently with Node crypto, checks
bad hash/signature, incomplete/short hold, one-time consumption, reboot debit,
zero-hold exact-policy auto signing, persisted pad mode, mainnet refusal,
physical policy hold, encrypted v2 management/upload/signature, stale response
refusal and disconnect cancellation. No RPC or signature is mocked. It uses
real SDK constructors and the captured chain blockhash/mint. Simulated reboot
reloads public accounting/policy but retains the process-RAM signing identity;
it is not proof of physical NVS power-loss behavior.

Full JavaScript suites, zero failures or cancellations:

| Command | Passed | Explicit setup/provider skips | Total |
|---|---:|---:|---:|
| `npm test --prefix desk` | 163 | 10 | 173 |
| `npm test --prefix site` | 14 | 0 | 14 |
| `npm test --prefix keeper` | 7 | 2 | 9 |

All final commands set `TMPDIR="$PWD/firmware/build/session-tmp"`; the desk
run took 423.70 seconds. The five focused signer cases are a subset of the full
desk suite and are not added again. Missing providers/funded account setup are
explicit skips, not claimed executions. The keeper key-permission check was
skipped because no keeper key was opened or provisioned.

Exact FQBN and all compile commands are in [firmware/README.md](firmware/README.md#v3-v2-session-signing-2026-11-12).
Arduino CLI 1.5.1, ESP32 core 3.3.10:

| Source | Mode | Flash / 3,145,728 bytes | Static RAM / 327,680 bytes |
|---|---|---:|---:|
| Full working tree | normal | 1,833,902 | 65,996 |
| Full working tree | release | 1,831,770 | 65,916 |
| Isolated V2 + committed V1/v2 | normal | 1,828,810 | 65,940 |
| Isolated V2 + committed V1/v2 | release | 1,826,602 | 65,860 |

These are image/static sizes; runtime heap/PSRAM allocations are additional.
The staged-source builds exclude all original unfinished edits. Logs and
artifacts are under ignored `firmware/build/v2-*` and `session-*` paths. The
initial full-suite attempt encountered a full internal temporary filesystem
and is superseded by the final run with `TMPDIR` on the workspace drive.

Funding/broadcast is **BLOCKED** pending a flashed paired pad and funded session
public key/token accounts. `/pad/session` supplies the exact device public key
to fund. There is no persistent simulator key to fund. Real Phoenix orders have
no instruction leverage field and are refused; unpriced/rent-bearing messages
are refused. Caps measure the approved nominal dollar-token input, excluding
SOL network fees. Counter age uses conservative powered uptime because no
trusted wall clock survives power loss. These boundaries are explicit; this is
not a completed all-venues/funded full-v3 end-to-end claim. Hardware NVS power
cuts, encrypted NVS provisioning, TFT readability and physical holds remain
unverified.

## Firmware v3 — V4 Abilities SDK (2026-11-12)

**Compiled, not yet flashed.** No image was signed/flashed, no production fuse
changed, no signing secret opened, and nothing pushed. V4 implements item 4;
full v3 completion and hardware qualification remain separate work.

| Verification | Result |
|---|---|
| `firmware/test/run.sh` (full working tree) | 250 cases, 2,379 assertions, all pass |
| Isolated staged-source native suite | 236 cases, 2,326 assertions, all pass |
| `npm test --prefix desk` | 192 total: 182 pass, 10 explicit setup/provider skips, zero failures/cancellations |
| Focused `desk/test/abilities.test.mjs` | 5 pass, including real encrypted developer approval/install and native sandbox refusal |
| SDK external-signing bundle tools | Public signing-request/finalize round trip and native verification pass |
| `firmware/test/abilities-sanitize.sh` | Same 5 cases pass under AddressSanitizer + UBSan; halt on first UB; no diagnostic |
| `node desk/test/abilities-ui.mjs` | Real isolated HTTP auth/method/schema checks and Chromium 1440×1100 / 390×844; no page errors/overflow |
| `npm test --prefix site` | 14/14 pass |
| `npm test --prefix keeper` | 7 pass, 2 explicit setup skips, zero failures |

The native total includes 31 new ability cases. The 14-case difference between
source trees is pre-existing unfinished attestation work, excluded from the V4
index. Tests run the actual vendored firmware interpreter and Ed25519 verifier.
Fresh test developer keys remain in process memory; only public manifests,
code and detached signatures are sent to the native process. Sample market
formatting uses explicitly constructed unit-test inputs; the encrypted transport
test uses price unavailable rather than invented market data. No new market
read, quote, transaction signature or broadcast is claimed for V4.

Adversarial coverage includes unknown signing/trade imports (also delivered
past the desktop validator over encrypted padsim), undeclared capabilities,
manifest/bytecode/signature tampering, untrusted developers, linear memory and
host-pointer bounds, memory growth, recursion, infinite-loop fuel exhaustion,
independent watchdog deadline logic, host-call floods, trade-like macro IDs,
malformed/duplicate/forbidden sections, upload offsets/expiry/connection changes,
heap caps/reclamation and isolation of the two runtimes. Both C/AssemblyScript
templates and Market Pulse/Pomodoro execute on the embedded engine. Sanitizers
found a misaligned upstream constant access; the final source uses `memcpy` and
passes. macOS lacks LeakSanitizer support, so leak detection is disabled;
explicit engine-allocation accounting is checked instead.

UI captures are ignored artifacts at `firmware/build/v4-ui/{desktop,mobile}.png`.
The reviewer found stale file-preview and pending-error feedback; both fixes
were scored resolved after a repeat real-browser smoke. Captures prove the
unpaired setup layout, not physical pad display or pairing. See
[sdk/abilities](sdk/abilities/README.md) for install/external-signing instructions.

Arduino CLI 1.5.1, ESP32 core 3.3.10; exact FQBN/commands in
[firmware/README.md](firmware/README.md#v3-v4-abilities-sdk-2026-11-12):

| Source | Mode | Flash / 3,145,728 bytes | Static RAM / 327,680 bytes |
|---|---|---:|---:|
| Full working tree | normal | 1,929,210 | 67,740 |
| Full working tree | release | 1,927,078 | 67,668 |
| Isolated V4 + committed V1/V2/v2 | normal | 1,918,422 | 67,484 |
| Isolated V4 + committed V1/V2/v2 | release | 1,916,226 | 67,404 |

Runtime heap/PSRAM allocations are additional to static RAM. The isolated
snapshot was exported from the index into `firmware/build/v4-snapshot`; no
unfinished attestation/key-tool/other changes are part of that snapshot. Native
and focused abilities tests run there too. Logs are ignored `firmware/build/v4-*`.
Actual hardware NVS power loss, PSRAM pressure, physical hold/TFT visibility,
watchdog timing and chime latency remain unverified. The documented pinned
interpreter needs a production security review; adversarial regressions are
not a formal proof of resistance to every possible engine vulnerability.

## Firmware v3 V5 — offline price alerts (2026-11-12)

Compiled, not yet flashed. Staged-source native checks passed **248 cases / 2,375
assertions**; working tree including pre-existing attestation changes passed
**262 / 2,428**. Twelve new cases exercise bounded config, captured live Jupiter
prices, one-shot persistence encoding, replay suppression, polling cadence,
reconnect/failure cooldown and millis rollover. `node --test
desk/test/price-alerts.test.mjs`: **2 passed**. Live keyless HTTPS with exactly the
firmware Amazon root passed via `node tools/padsim/price-alerts.mjs`.

Both configurations compile with FQBN
`esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc`
and the SC-only C/C++ flags documented in firmware/README.md. Isolated index
snapshot `firmware/build/v5-snapshot`: normal **1,931,178 B flash / 67,572 B RAM**;
release **1,928,982 / 67,492**. Working tree before the network-clock addition:
normal **1,937,730 / 67,804**, release **1,935,622 / 67,732**. Final V5 combined
validation is recorded below with the crew feature. No board flash or trade
broadcast was performed by the new tests. Physical Wi-Fi, SNTP, NVS persistence,
worker timing, TFT, LED and chime behavior require hardware verification.

## Firmware v3 V5 — final offline alerts + crew co-sign (2026-11-12)

**Compiled, not yet flashed.** Item 5 and item 6 are implemented; these results
are not evidence of a physical board test or a new funded trade. Existing
unfinished attestation changes remain outside both feature commits.

- Final working-tree `firmware/test/run.sh`: **267 cases, 2,462 assertions,
  zero failures**. The five crew cases cover consumed exact hashes, full review,
  hold/session requirements, unconditional blind refusal, real Ed25519 hashes
  and incompatible/malformed request modes. The twelve price-alert cases use a
  live Jupiter response captured by the public smoke tool.
- Final isolated staged source `firmware/build/v5-final-snapshot/firmware/test/run.sh`:
  **253 cases, 2,409 assertions, zero failures**. It excludes the pre-existing
  attestation tests; the working tree includes those tests too.
- Final working-tree `cd desk && npm test`: **204 tests, 194 passed, 10 setup
  skips, zero failures/cancellations**. The skips explicitly require provider
  credentials, Electron, keeper public metadata or funded devnet accounts.
  No `.env` or user key file was loaded for this work. The new crew tests
  generate ephemeral identities in memory and send no transaction.
- Final isolated `node --test desk/test/{crew,pad-signer,clear-sign,price-alerts,executor}.test.mjs`:
  **27 passed, zero failures/skips**. Actual encrypted pairs plus the native
  firmware review gate prove two distinct approvals, one-pad blocking, refusal,
  disconnect, expiry, replay rejection, wrong signature/hash/identity/hold,
  exact-message binding and policy/permission changes.
- `node desk/test/crew-ui.mjs` passed for both the final working tree and isolated
  source. The real HTTP server checks authentication/method/policy validation;
  two actual encrypted padsim peers complete 2-of-2; desktop (1440×1100) and
  mobile (390×844) render approver names without overflow or browser errors.
  Screenshots are in `firmware/build/v5-ui/` and the isolated snapshot's matching
  build directory. Impeccable's detector reported no findings for changed UI.
  An initial browser run exposed the missing static module allowlist entry;
  it was fixed. A concurrent regression attempt encountered test-port collisions
  and was stopped by PID; the complete final suite and UI checks ran sequentially.
- `node tools/padsim/price-alerts.mjs`: **PASS**, actual keyless Jupiter Price v3
  with the firmware's pinned Amazon Root CA 1. This verifies endpoint/root
  compatibility on the host; ESP32 Wi-Fi/SNTP/TLS still needs hardware.

Final `arduino-cli compile` commands/FQBN/flags are recorded in firmware/README.md.
Both normal and release builds pass, including the isolated commit source:

| Source | Normal flash / static RAM | Release flash / static RAM |
|---|---:|---:|
| Working tree | 1,942,322 B / 67,844 B | 1,940,210 B / 67,772 B |
| Isolated staged source | 1,932,630 B / 67,588 B | 1,930,470 B / 67,508 B |

App slot maximum is 3,145,728 B; static RAM maximum is 327,680 B. Isolated
build directories are `firmware/build/v5-isolated-{normal,release}` with
`v5-final-isolated-{normal,release}.log` logs. Native, desk, UI and live-root
logs also live under the ignored `firmware/build/` directory. Only dependency
and virtualenv directories were symlinked into the snapshot; tested source
came from the index. Real Wi-Fi behavior, worker/watchdog latency, NVS power-loss
persistence, TFT review readability, physical holds, LED and chimes still need
the board. The crew threshold is enforced by the coordinating desk; this is not
an on-chain multisig or protection from a desk that disables its own policy.


## Firmware v3 — V6 OTA channels and delta updates (2026-11-12)

**Compiled, not yet flashed.** One local feature commit on `fw-v3`; no push,
release signing, private-key-file access, flashing or eFuse operations.
Pre-existing unfinished attestation changes remain outside the V6 commit.

| Verification | Result |
| --- | --- |
| Working tree: `firmware/test/run.sh` | 273/273 cases, 2,676 assertions, no failures |
| Isolated candidate native runner | 259/259 cases, 2,623 assertions, no failures |
| `node --test desk/test/ota.test.mjs` | 14/14 passed, no skips |
| Isolated OTA tests, split into pure/native and encrypted link groups | 10 + 4 passed, no failures |
| `npm test --prefix desk` | 218 total: 208 passed, 10 setup skips, zero failures |
| `node desk/test/ota-ui.mjs` (working tree and isolated candidate) | HTTP auth/method/invalid-channel checks, encrypted channel read/save, persistence, manifest verification, 1440px/390px layouts, no page errors/overflow |
| Impeccable detector on Connect module | No findings |
| `git diff --cached --check` | Passed |

The full desk suite's existing setup skips were unreachable local Ollama,
unset Anthropic/Deepgram environment credentials, absent Electron safeStorage
binary, a Meteora RPC rate limit, missing keeper metadata, and unfunded or
unregistered devnet/Phoenix test owners. No test was deleted or weakened. The
live reads that were available ran against real providers. The OTA regressions
use real compiled ESP32 binaries and transient in-memory Ed25519 signers; no
private signing-key file is loaded and no new transaction is broadcast by them.

Six added native cases cover deterministic rollout hashing/channel boundaries,
all streaming chunk splits, truncation/trailing/opcode/bounds failures, base-read
and target-write failure, and malformed manifest fields. Shared C++/JavaScript
cases independently reject either signature, altered signed metadata, wrong base
hash/version, corrupted patches, validly signed malformed patches, and wrong
reconstructed-image hashes. Encrypted padsim covers per-pad beta opt-in across
reboot, rollout/beta/base refusals at the pad, final patch/image checks, reduced
transfer bytes and full-image fallback. Legacy v2-envelope bootstrap is tested.

| ESP32-S3 build | Program bytes / 3,145,728 | Static RAM bytes / 327,680 |
| --- | ---: | ---: |
| Working normal | 1,950,590 | 68,188 |
| Working release | 1,948,426 | 68,116 |
| Isolated normal | 1,940,918 | 67,932 |
| Isolated release | 1,938,802 | 67,852 |

Against the pre-existing 1,752,144-byte signed app artifact, the new working
app.bin is 1,950,736 bytes and its patch is 1,319,963 bytes (32% smaller).
The isolated app.bin is 1,941,072 bytes and its patch is 1,299,788 bytes
(33% smaller). These are actual file/transfer lengths; Arduino's program-storage
counts above measure occupied sketch bytes and differ slightly from bin length.

Exact FQBN and working compile commands are in [firmware/README.md](firmware/README.md#v6--ota-channels-and-signed-delta-patches).
The isolated candidate in ignored `firmware/build/v6-snapshot` contains HEAD
plus only the V6 changes, preserving the prior OpenSSL-native compatibility path.
The same FQBN/flags use source `firmware/build/v6-snapshot/firmware/xorrpad`,
build paths `firmware/build/v6-isolated-{normal,release}` and output directories
`firmware/build/v6-isolated-{normal,release}-out`. Public compile headers,
installed node dependencies and compiled app artifacts were reused. Its native
command is `firmware/build/v6-snapshot/firmware/test/run.sh`. Its OTA command is
`node --test firmware/build/v6-snapshot/desk/test/ota.test.mjs`, run in two
nonoverlapping name groups to avoid shared test-port contention. The isolated
browser command sets `SIBYL_BRIDGE` to the existing `desk/memory/sibyl_bridge.py`
and `SIBYL_PY` to the installed `.venv/bin/python`, then runs
`node firmware/build/v6-snapshot/desk/test/ota-ui.mjs`.

Logs are ignored `firmware/build/v6-{native,desk,ota-final,ui}.log` and
`v6-isolated-{native,normal,release,ota,ota-link,ui}.log`; browser captures are
`firmware/build/v6-ui/{desktop,mobile}.png`. The browser tested the actual HTTP
application and paired encrypted padsim, without replacing protocol endpoints.
Physical BLE throughput, NVS power-loss behavior, inactive-slot flash failure,
TFT progress and pending-verify rollback still require the board. Deterministic
rollout is staging rather than version-freshness/anti-rollback enforcement.

## Firmware v3 — V7 3.0.0 validation and hardware research (2026-11-12)

**Compiled, not yet flashed.** V7 adds item-8 research, a repeatable v3 scenario
runner, the firmware version bump and these release notes. Existing unfinished
attestation and other working-tree edits remain outside V7's commits. The
combined working tree and isolated staged source are reported separately.
The version label does not imply that all full-v3 acceptance criteria are met.

| Final verification | Total | Passed | Skipped / blocked | Failed |
| --- | ---: | ---: | --- | ---: |
| Working native `firmware/test/run.sh` | 273 cases / 2,676 assertions | all | 0 | 0 |
| Isolated native `firmware/build/v7-snapshot/firmware/test/run.sh` | 259 cases / 2,623 assertions | all | 0 | 0 |
| Working desk suite, command below | 217 | 208 | 9 setup/provider skips; one additional legacy key-file test excluded | 0 |
| `npm test --prefix site` | 14 | 14 | 0 | 0 |
| `npm test --prefix keeper` | 9 | 7 | 2 setup skips | 0 |
| Live `node tools/padsim/price-alerts.mjs` | 1 HTTPS smoke check | 1 | 0 | 0 |
| Working v3 padsim runner (desk subset) | 54 | 54 | broadcast BLOCKED: unfunded | 0 |
| Isolated v3 padsim runner (desk subset) | 40 | 40 | attestation absent; broadcast BLOCKED: unfunded | 0 |

The native source difference is the original unfinished attestation work. The
nine desk skips are: unavailable localhost Ollama; absent environment-only
Anthropic/Deepgram credentials; missing Electron binary; a real Meteora RPC 429;
missing public keeper metadata; two unfunded/unregistered Phoenix-owner cases;
and missing funded pm-AMM devnet test-owner setup (the RPC faucet returned 410).
Keeper skips are a real Hermes HTTP 401 requiring PYTH_API_KEY and absent keeper
key-permission setup. Skips are not successful live executions.

The separately excluded legacy test is named `key → live devnet signal → accept
→ actual confirmed receipt (funded test wallet required)`. It would open the
persistent `desk/.t4-devnet` wallet; the explicit no-existing-key-access rule
therefore takes priority. No test source was deleted or weakened to exclude it.
The new v3 live path uses the native pad's RAM-only identity instead, with an
exact public funding address. Other unit tests use their own disposable test
identities; no existing wallet, production signing key or `.env` is loaded.

Final desk command (217 tests are the runner's reported total; the CLI-excluded
case is not included in that number):

```sh
TMPDIR='/Volumes/Extreme SSD/xorrpad-v7.GIXX3g' XORR_OTA_TEST_IMAGE="$PWD/firmware/build/v7-normal-out/xorrpad.ino.bin" node --test --test-concurrency=1 --test-skip-pattern='funded test wallet required' desk/test/*.test.mjs
```

The temporary directory was created with
`mktemp -d '/Volumes/Extreme SSD/xorrpad-v7.XXXXXX'`, outside the repository.
The initial desk attempt used `firmware/build/v7-tmp` and reported 217 total,
207 pass, 9 skips and one failure: the existing factory-keygen destination test
correctly refused its purported external destination because TMPDIR was inside
the repo. The complete corrected run above supersedes it: 208 pass, no failures,
475,037.849 ms. The protection and test were unchanged.

| ESP32-S3 source / mode | Program bytes / 3,145,728 | Static RAM bytes / 327,680 |
| --- | ---: | ---: |
| Working normal | 1,950,594 | 68,188 |
| Working `XORR_RELEASE=1` | 1,948,430 | 68,116 |
| Isolated normal | 1,940,938 | 67,932 |
| Isolated `XORR_RELEASE=1` | 1,938,806 | 67,852 |

Arduino CLI 1.5.1, ESP32 core 3.3.10. Exact FQBN and commands are in
[firmware/README.md](firmware/README.md#v7--firmware-300-validation-and-hardware-research).
The isolated index export is `firmware/build/v7-snapshot`; it contains only
committed source plus the staged V7 changes. Dependencies and public compiled
OTA fixtures are symlinked, without copying user wallets or secret files.
Runtime heap/PSRAM is additional to static RAM. Outputs/logs are ignored
`firmware/build/v7-*`; no release signing or flash command is run.

The [hardware research](firmware/HARDWARE-REV2.md) records actual orderable
parts, distributor price links and tier/multiple-aware extensions for 1,000
units. The subtotal explicitly excludes unresolved custom/retained parts and
manufacturing costs; there is no fabricated complete COGS. Physical TFT review,
holds/knob mapping, BLE/Wi-Fi/audio, NVS power loss/key recovery, offline TLS,
watchdog/PSRAM behavior, OTA flash/boot rollback and production factory trust
provisioning remain unproven. Secure boot/flash encryption are not enabled.

### V7 padsim v3 scenarios

| Working-tree scenario file | Total | Pass | Skip | Fail |
| --- | ---: | ---: | ---: | ---: |
| `clear-sign.test.mjs` | 4 | 4 | 0 | 0 |
| `pad-signer.test.mjs` | 5 | 5 | 0 | 0 |
| `attestation.test.mjs` | 14 | 14 | 0 | 0 |
| `abilities.test.mjs` | 5 | 5 | 0 | 0 |
| `price-alerts.test.mjs` | 2 | 2 | 0 | 0 |
| `crew.test.mjs` | 10 | 10 | 0 | 0 |
| `ota.test.mjs` | 14 | 14 | 0 | 0 |
| **Aggregate** | **54** | **54** | **0** | **0** |

These 54 regressions are a subset of the full desk suite; do not add them
again to the desk total. They cover blind-sign refusal, incomplete/short review,
exact-message signing and real Ed25519, rolling-cap refusal after reboot,
attestation pass/fail/replay, signed sandbox escape refusal, 2-of-2 approval,
offline alert rules and signed OTA channel/rollout/delta/fallback checks.

Working command: `TMPDIR='/Volumes/Extreme SSD/xorrpad-v7.GIXX3g' node tools/padsim/v3.mjs`.
The separate live path passes real-devnet genesis/mint/blockhash reads, native
clear review and exact-message pad signing, with fingerprint **57Yd6Z**.
New devnet broadcast: **BLOCKED**, unfunded session identity:

```text
public key: 4gVz8qoE4gZi2tJWTBY6LbszvFUNocaAZxum47zQepmS
token ATA:  F16j1hGdwvmdZSQDXg9rF1JNBX6JDmcysPAfYJYkrWHz
```

That was the exact public identity observed in this run; its private material
was never saved and was lost when the process exited. To fund a new run, use
`node tools/padsim/v3.mjs --funding-wait=300` and the newly printed public key
and ATA while that process is alive. Supply 0.01 devnet SOL and collateral in
its existing ATA (the instruction asks for 1 mUSDC). The only broadcast path is
a one-base-unit self-transfer; no real trade/fill or token-account creation is
claimed. The pinned-root live Jupiter smoke is a separate 1/1 check above.

Isolated command:
`TMPDIR='/Volumes/Extreme SSD/xorrpad-v7.GIXX3g' node firmware/build/v7-snapshot/tools/padsim/v3.mjs`.
It passes **40/40**, zero test skips/failures: clear-sign 4, signer 5, abilities 5,
alerts 2, crew 10 and OTA 14. The fourteen attestation tests are absent from
that committed-source candidate and reported **BLOCKED**, not passed or silently
counted as skips. Live devnet reads, clear review and pad signing pass here too,
with fingerprint **HWCwog**; broadcast remains **BLOCKED** for the exact signer:

```text
public key: BkQb1zKjoB612KYe2uCvKteJPN69m3vbAqUXB9PeBYuV
token ATA:  BFdEvF5RYUEMUQk8fFKn5jZFAThWJRvzk6UdKXEn3VwB
```

This second RAM-only identity also ceased to exist at process exit. No new
transaction was broadcast by either V7 live path, and no historical receipt is
presented as a new fill. Working-tree attestation is validated but still needs
its own reviewed feature commit and real factory/phone provisioning. The
isolated scenario totals reuse the same tests, so they are not additional
independent coverage to sum into a grand total.

Final logs: `firmware/build/v7-{native,desk-final,site,keeper,live-alerts,padsim}.log`,
`v7-isolated-{native,padsim}.log` and `v7-{normal,release,isolated-normal,isolated-release}.log`.
`node --check tools/padsim/v3.mjs`, `git diff --check` and staged whitespace
checks also pass. The only new OTA-test change permits an explicit compiled
image path; the complete final desk and both scenario runs use the corresponding
new 3.0.0 image. Existing assertions are retained. No production image is signed,
no flash/eFuse operation is performed, and nothing is pushed.

## Firmware v3 — final factory and XOR phone attestation delivery (2026-11-12)

Attestation is now committed on `fw-v3` as `94111b3`. The actual Expo app is on
`xorrpad-v3-attest` in `/Volumes/Extreme SSD/Projects/xorr-solana`: `86984ed`
implements verification in the existing Pad screen; `747277d` records evidence.
The prior V7 references to missing committed attestation and phone integration
are superseded by this section. Earlier unrelated working-tree edits were
preserved and excluded from the attestation commit.

| Verification | Result |
| --- | --- |
| Combined working native suite | 275 cases / 2,681 assertions, all pass |
| Isolated committed-source native suite (`94111b3`) | 268 cases / 2,658 assertions, all pass |
| Targeted desk attestation + factory | 19/19 pass |
| Complete desk suite | 217 reported: 208 pass, 9 setup/provider skips, 0 failures/cancellations |
| V3 padsim scenario runner | 54/54 pass, 0 test skips/failures |
| Actual phone Pad suite | 53/53 pass, including 4 native-verifier cross-checks |
| Phone TypeScript check | Pass |
| Phone Android/Hermes export | Pass, `/tmp/xorr-pad-v3-attest-android` |
| Phone real component screenshots | Updated unverified/BLE setup screens; existing design preserved |

The phone suite's 53 tests include the existing Pad tests. Targeted desk/V3
scenario tests overlap the full suite and are not added to a coverage total.
The native difference comes from seven pre-existing uncommitted logic tests;
the clean committed source meets the V3 minimum independently.

Both unsigned build configurations compile. No release key was opened and no
image was flashed. Flash maximum is 3,145,728 bytes; static RAM maximum is
327,680 bytes (runtime PSRAM allocations are additional):

| Source | Normal flash / static RAM | Release flash / static RAM |
| --- | --- | --- |
| Combined working tree | 1,952,106 B / 68,196 B | 1,949,962 B / 68,124 B |
| Isolated commit `94111b3` | 1,947,646 B / 68,140 B | 1,945,410 B / 68,060 B |

Native command: `firmware/test/run.sh`. The isolated verification used a detached
worktree at `/tmp/xorrpad-v3-attest-source.D9Vzfu` with dependency symlinks; only
committed source was built. Both builds used Arduino CLI/core/FQBN and the
normal/release compiler properties recorded in the preceding V7 section, with
`--jobs 3`, explicit `--build-path` and `--output-dir`. Final working artifacts
are in `firmware/build/attestation-final-{normal,release}-out`; copied clean
app images are in `firmware/build/attestation-isolated-{normal,release}-out`.

Desk/firmware attestations verify real Ed25519 certificates and fresh proofs,
foreign/absent authorities, changed fields, replayed challenges, identity
substitution and strict schema. Encrypted padsims exercise firmware label 3.0.0
over TCP and USB CRC. Phone tests use real process-memory Ed25519 signers and
strict RFC8032 verification; four also invoke the production native driver with
public inputs. Phone challenges are generated locally, expire in 10 seconds,
are consumed once, are BLE-only and reset on disconnect. Desk verdict flags
cannot promote phone trust. Production public root stores intentionally remain
empty; no fake authority was installed to make the UI genuine.

The phone commands used `EXPO_NO_DOTENV=1`; the dedicated Vitest config avoids
loading `.env` and unrelated executor live warmup:

```sh
EXPO_NO_DOTENV=1 npm run test:pad -- --exclude '**/*.live.test.ts'
EXPO_NO_DOTENV=1 npm run typecheck
EXPO_NO_DOTENV=1 EXPO_PUBLIC_XORR_CHAIN=solana-devnet node node_modules/expo/bin/cli export --platform android --output-dir /tmp/xorr-pad-v3-attest-android
EXPO_NO_DOTENV=1 node tools/pad-screenshots.mjs
```

`node tools/padsim/v3.mjs` passes clear-sign 4, pad-signer 5, attestation 14,
abilities 5, offline alerts 2, crew 10 and OTA 14. The live path verifies devnet
state and the native pad's real Ed25519 signature over exact SDK message bytes
(fingerprint `JDbw2s`). New broadcast is **BLOCKED**, unfunded session signer
`Gkc1f2997WpgKDQFPiYz5WRKvfT3VijRMVyEX8mg32G2`, ATA
`2Yfg9wZUqGKsjEB8Pv7Pq1Y2Hy91LACr5kwEkahgoKDw`. That RAM-only key was discarded
at process exit: do not fund that old address. Re-run with `--funding-wait=300`
and fund the newly printed signer while it is alive. No new fill is claimed.

**Compiled, not yet flashed.** Physical BLE/OS passkey flow, a genuinely
provisioned certificate/phone connection, factory NVS persistence, TFT/holds,
PSRAM/timing, power-loss behavior and actual OTA rollback still require the
board. Factory public trust anchors and irreversible secure boot/flash
provisioning remain operator work; no eFuse or existing private key was accessed.
Final logs use `firmware/build/attestation-{final,isolated}-*.log`.


Final complete desk run: **217 tests, 208 passed, 9 setup/provider skips, zero
failures/cancellations**, 482,059.611334 ms. Command:

```sh
TASK_ATTEST_TMP=$(mktemp -d /tmp/xorrpad-v3-attest-tests.XXXXXX)
TMPDIR="$TASK_ATTEST_TMP" XORR_OTA_TEST_IMAGE="$PWD/firmware/build/attestation-final-normal-out/xorrpad.ino.bin" node --test --test-concurrency=1 --test-skip-pattern='funded test wallet required' desk/test/*.test.mjs
```

The one CLI-excluded legacy funded-wallet scenario opens a pre-existing private
key file and therefore remains excluded under the no-existing-key-access rule;
it is not included in the runner's 217 reported tests. No test was removed or
weakened. The V3 RAM-only signing/broadcast path supplies the explicit unfunded
BLOCKED evidence above. Full output: `firmware/build/attestation-final-full-desk.log`.
The signed firmware-3.0.0 factory-report regression also passes in the focused
five-test factory rerun. All executed final checks have zero failures.

## Desktop v3

### D1 — Connect

`npm run build:app --prefix desk` passes. The focused
`desk/test/app-v3-routes.test.mjs` run passes **2/2 tests**, zero failures.
`TMPDIR` points to a temporary directory on the project SSD because the system
volume is nearly full; `SIBYL_PY="$PWD/.venv/bin/python"` selects the repo Python.
The native prerequisite `firmware/test/run.sh` passes **268 cases / 2,658
assertions**, zero failures.

The D1 test checks the built bundle's `/pad/pair`, `/desk/link` and
`/desk/status` references, unauthenticated requests, method restrictions,
readable no-pad responses and continued `/classic` access. Its actual browser
uses the desk server and fragmented USB CRC padsim, never intercepted APIs.
It checks six-digit pairing, wrong-code timeout and corrected-code reconnect,
real encrypted completion, unprovisioned red attestation with the exact reason,
and genuine lime attestation using an issued certificate and fresh proof from
a transient in-memory test factory injected through the `PadLink` constructor.
Disconnect and transport changes clear the badge; no production root changes.

Screenshots for empty, pairing, unverified and genuine states are in
`docs/screens/v3/`, at **1440 and 375 px**, with reduced motion. Browser checks
assert no horizontal overflow and at least 44 px for the screen's buttons,
form controls and customization links. The screenshots are visually inspected.

The complete desk suite runs alone in a disposable copy of the current source,
with dependencies, native helpers and public compiled images available. No
existing wallet, environment or private-key files are copied into that checkout;
the funded-wallet test can only create a disposable unfunded test identity.
No existing local wallet is opened, no test is deleted or weakened, and nothing
is signed with an existing key, flashed or pushed.

Final complete run: **231 tests, 221 passed, 10 setup/provider skips, zero
failures or cancellations**, 518,856.422209 ms. Run alone from the isolated
checkout, with no skip filter and all existing test files unchanged:

```sh
TMPDIR="$PWD/../runtime" SIBYL_PY="$PWD/.venv/bin/python" npm test --prefix desk
```

The final working-tree `npm run build:app --prefix desk` also passes. Local logs
are retained at `firmware/build/desktop-v3-d1-{desk,build,native}.log`.

### D2 — Device

The approved Device layout, pad model and key sheet remain in place. Firmware
controls use `/pad/manifest`, `/pad/ota` (optional delta), `/pad/ota-channel` and
`/events`; the desk publishes transfer percentages and reboot/error states.
The UI distinguishes transfer completion from a confirmed installed version.
Kill state is read from the peer and `/pad/rearm` requests the physical YES hold.
Eight stored profile slots each expose three layers; editing slot 8/layer 3
through the existing key sheet leaves the other layers and desk keymap intact.
Brightness/night writes use `/pad/options`, preserving all other options.

The built-bundle/authentication regression now covers every D1/D2 route,
method restrictions, absent-pad failures, persisted empty profiles/options and
continued `/classic` access. The real encrypted USB-CRC padsim browser check
covers explicit beta opt-in, option propagation, profile creation/activation,
reported profile state, kill/re-arm with a real simulated hold, invalid
manifest/delta errors, refresh-safe manifest selection and a complete transfer
of the existing public signed app image. Start, intermediate and rebooting
progress events are asserted alongside the pad's installed SHA-256.

Eight Device screenshots (empty, connected/kill pending, manifest error and
transfer complete) are saved under `docs/screens/v3/` at 1440 and 375 px and
visually inspected. Browser checks enforce no horizontal overflow and 44 px
controls for the added Device forms, with reduced motion enabled.

The full suite runs alone using the same disposable-checkout approach as D1,
with the existing public compiled ability WASM modules, public firmware images,
native drivers and dependency directories available. No existing environment,
wallet or private-key files are copied or opened; no tests are removed,
weakened or excluded. The unmodified funded-wallet check creates a fresh,
disposable unfunded test identity inside that checkout.

The final focused D1/D2 route/browser run passes **3/3 tests**, zero failures
or cancellations (58,761.708666 ms). The final working-tree
`npm run build:app --prefix desk` passes. The resize check waits for the real
responsive WebGL/poster lifecycle before asserting the unchanged overflow
condition; it never masks or clips the page. Logs are retained in
`firmware/build/desktop-v3-d2-{focused,build,desk}.log`.

Final complete run: **232 tests, 222 passed, 10 setup/provider skips, zero
failures or cancellations**, 674,206.422167 ms. Run alone from the isolated
checkout, with no skip filter:

```sh
TMPDIR="$PWD/../runtime" SIBYL_PY="$PWD/.venv/bin/python" npm test --prefix desk
```

The tested application, server and test source files match the working tree
byte for byte. Nothing was flashed or pushed.

### D3 — Abilities

The existing desktop ability catalog, install sheet and run controls are unchanged.
A second On-pad abilities section uses `/desk/link` for device selection and
`/pad/abilities` for the pad's developer key, two slot statuses, developer review,
signed bundle installation and removal. Trust requires the physical YES hold;
the UI never treats a review request as approval. Refresh reads the actual pad
state. The exact safety line is “Abilities can never sign or trade”. Capability
pills parse the firmware's comma-separated capabilities and the bundle preview's
manifest array. SDK examples import the actual `market-pulse.json` and
`pomodoro.json` manifests; users build and sign their bundles externally.

The authenticated built-bundle regression covers both GET and POST, method
restrictions and readable no-pad errors. The D3 browser regression connects real
encrypted USB-CRC `AbilityPadSimulator` instances backed by the native embedded
interpreter. It verifies no-pad and untrusted states, refusal of a 799 ms trust
hold, an 800 ms approval, installation/running state for both signed SDK samples,
capability pills, a verbatim signature-refusal error that retains the installed
module, malformed bundle handling, independent slot removal, and two-device
selection/disconnect behavior. Switching pads clears old previews and errors;
a disconnected selection never silently targets the remaining pad. Test signing
keys are transient process memory only, with no existing private material read
or persisted. `/classic` remains reachable.

Eight screenshots in `docs/screens/v3/` cover empty, developer review, installed
and signature-error states at **1440 and 375 px** and were visually inspected.
Browser assertions enforce no horizontal
overflow and 44 px added controls with reduced motion enabled. Existing surfaces,
fields, buttons, pills and empty-state artwork provide all styling; no new CSS,
fonts, colors or libraries were added.

The focused D3 route/browser run passes **2/2 tests**, zero failures or
cancellations (32,939.67775 ms). `npm run build:app --prefix desk` passes.
The complete suite runs alone in a disposable copy of the current source, using
only public compiled firmware/WASM inputs, native helpers and shared dependencies.
Existing environment, wallet and private-key files are excluded, following D1/D2.
No tests are removed, weakened or excluded. Logs are retained at
`firmware/build/desktop-v3-d3-{focused,build,desk}.log`.

```sh
TMPDIR="$PWD/../runtime" SIBYL_PY="$PWD/.venv/bin/python" npm test --prefix desk
```

Final complete run: **233 tests, 223 passed, 10 setup/provider skips, zero
failures or cancellations**, 539,553.626167 ms. The disposable copy has its own
Git metadata for the existing ignore-rule regression and all five public native
drivers (abilities, attestation, crew, OTA and session). Changed application and
test sources match the working tree byte for byte. Nothing was flashed or pushed.

### D4 — Agent

The unchanged Agent wallet section now offers phone, session and Pad signer.
`/wallet/mode` selects the explicit device; `/pad/session` reads the public key,
approved policy and public rolling daily spend. The editor sends six-decimal USD
caps as micro-USD, supports the firmware's 1× leverage, exact venue program keys,
and a zero-default auto-accept cap with an exact market/destination rule. Policy
approval still requires 3.8 seconds on the pad. `/pad/options` saves blind signing
only after explicit opt-in; the warning uses the existing red token.

Firmware status now exposes public spentToday accounting; older firmware reports
unavailable instead of inventing a zero. Native accounting expiry/reboot assertions
pass in **268/268 native cases, 2,662 assertions**. The Agent browser regression
passes **1/1**, verifying encrypted native-backed session policy refusal/approval,
cap conversion, actual charged spend readback, blind opt-in, device selection and
disconnect without write redirection. No trade is broadcast. Six inspected
screenshots (`agent-{empty,policy,approved}-{1440,375}.png`) check no overflow and
44 px controls with reduced motion. Build passes. Final full-suite evidence follows
with the remaining D4 screens.

### D4 — Activity

Activity uses `/pad/clear-sign`, the authenticated `/events` stream and `/pad/crew`.
The last 100 real review/signature events survive screen navigation, with no
persisted or invented history. Reload honestly starts a new event session. The
unsigned review sheet cannot sign or broadcast. Results distinguish review approval,
refusal, actual pad signature and crew co-sign approval; show hash/fingerprint and
verbatim reasons; and display bounded actual firmware-decoded rows. Older firmware
honestly reports missing decoded text. Public review telemetry is capped to fit a
single encrypted response, with an explicit truncation indication.

The crew editor uses pinned device identities, strict USD threshold and a 2–8-pad
quorum; polling cannot overwrite the open form. Round rows show actual approvers,
state, hash and deadline. The focused Activity browser regression passes **1/1**:
actual `/pad/clear-sign` with real devnet genesis lookup, native review refusal and
approval, encrypted actual native signature, navigation/reload history semantics,
crew policy save and independent native-backed two-pad approval. No transaction is
broadcast. Native tests pass **269/269 cases, 2,669 assertions**. Ten inspected
Activity screenshots cover empty, verbatim error, actual clear results, crew policy
and approved round at **1440/375 px**; no horizontal overflow or short added controls.
Build passes. Full-suite evidence is recorded after the Markets screen.

### D4 — Markets

The selected market ticket opens the existing Sheet for Alert on pad. Rules are
read from and saved to the selected pad through `/pad/price-alerts`: token mint,
USD threshold and above/below direction, with an eight-rule limit and removal.
The UI preserves the remaining rules, explains that saves re-arm them, and states
“Nothing will trade”. Offline alerts require pad power, Wi-Fi and valid network
time; perpetual prices and outcome probabilities are not claimed as supported.

The focused Markets browser regression passes **1/1** through real encrypted USB-CRC
padsim and the native firmware alert parser: empty/readback, both directions,
preserving/removing rules, invalid trading-field rejection, two-device selection
and disconnect without write redirection. Browser assertions confirm that every
write is a price-alert request, with no signing or trading route invoked. Four
inspected screenshots cover empty/stored alerts at **1440/375 px**, with no overflow
and 44 px added targets. The built-route regression now covers every v3 brief
route, authentication, method allowlists and real no-pad errors; `/classic` works.
No test was removed, weakened or excluded.

### D4 — Final verification

The complete desk suite ran alone, with no test filter, in an isolated source
copy excluding existing environment files, wallets, private keys and `.loom`.
It shared the installed desk and render3d dependencies, the repo Python venv,
public compiled firmware images, SDK WASM and all five public native drivers.
An initial isolation attempt lacked render3d's installed `gltf-validator`; that
dependency link was corrected before this complete rerun. No test was weakened,
deleted or excluded.

```sh
SIBYL_PY="$PWD/.venv/bin/python" npm test --prefix desk
```

Final complete run: **236 tests, 226 passed, 10 setup/provider skips, zero failures
or cancellations**, **615,955.764542 ms**. Skips cover unavailable Ollama/API keys,
Electron safeStorage, a rate-limited Meteora request, keeper setup, unfunded devnet
wallets and unconfigured Phoenix accounts. No transaction was broadcast by D4.
After that run, the final mode-specific Agent status text was verified by the
focused native-backed Agent browser test: **1/1 passed**, zero failures or skips,
27,898.095917 ms. `npm run build:app --prefix desk` passes on the final app source.

Native verification passes **269/269 cases and 2,669 assertions**. All **20 D4
screenshots** in `docs/screens/v3/` were inspected at 1440/375 px; added controls
meet 44 px targets, including checkbox labels, and reduced motion is honored.
No new CSS, font, color or library was introduced. Existing desktop layout and
navigation remain intact. The mechanical UI detector returned no findings.

Logs: `firmware/build/desktop-v3-d4-{desk,build,native,agent-final}.log`.
Public firmware spend/review telemetry was native-tested; older firmware uses
honest unavailable states. No board was flashed, no existing secret was opened,
and nothing was pushed. D4 is recorded as one local commit per screen.

## Desktop v3

### D5 — route and responsive acceptance

`desk/test/app-v3-routes.test.mjs` now checks **17 distinct brief routes and
25 route/method pairs** against the built JavaScript and actual authenticated
desk server. It preserves the D1–D4 browser coverage and adds invalid-token
checks, the remaining GET/POST methods, readable no-pad/validation errors and
actual `/events` WebSocket authentication and empty-snapshot checks. The
authenticated HTTP event route correctly returns 426 with its readable upgrade
instruction. `/classic` remains covered.

No-pad errors remain real errors. `/desk/link` and `/desk/status` honestly
report no devices; profiles, options, crew policy and wallet mode are persisted
desk configuration, not fabricated device responses. Their actual empty/default
state is checked separately from unavailable pad operations. “Setup required”
messages remain verbatim. No test was deleted, weakened or excluded.

The initial focused browser/route run passed **9/9 tests**, zero failures,
cancellations or skips, **120,421.127542 ms**. The final layout check also checks
text rectangles against viewport and clipping ancestors, 44×44 px added controls
and reduced motion. This catches clipping hidden by the existing body overflow
rule. Long Sheet content retains its intended vertical scrolling; the Markets
test scrolls to and captures the reachable Save action at each width.

**46 freshly generated and visually inspected screenshots** in
`docs/screens/v3/` cover **23 states at 1440 and 375 px**: Connect 8, Device 8,
Abilities 8, Agent 6, Activity 10 and Markets 6. No horizontal overflow or
unreachable/clipped v3 content was found. The extra Markets lower-form captures
complete the evidence for its scrolling sheet. No UI source, CSS, font, color,
library, navigation or approved desktop component was changed.

Captures use the actual built app and desk routes with encrypted USB-CRC
`tools/padsim` peers, including native firmware-backed abilities, session,
clear-sign, crew and alert logic. Attestation uses an explicitly injected
disposable test factory; production roots remain unchanged. The screenshots
establish simulator behavior, not physical flashing, BLE or board acceptance.
See [the screenshot inventory](docs/screens/v3/README.md) for state names and
provenance.

The full desk suite runs alone in a disposable source copy with all **44 desk
test files**, matching application/test sources, installed dependency links,
the repo Python venv, public native drivers and public compiled OTA/SDK inputs.
Existing environment files, wallets, private keys and `.loom` are excluded.
An incomplete setup attempt was stopped after missing public SDK WASM fixtures
were detected; all public WASM fixtures were linked before the complete rerun.
No test filter or suite modification is used.

```sh
TMPDIR="$PWD/../runtime" SIBYL_PY="$PWD/.venv/bin/python" npm test --prefix desk
npm run build:app --prefix desk
```

Final complete run: **238 tests, 228 passed, 10 skipped, zero failures or
cancellations**, **581,771.341417 ms**, exit **0**. Skips are unavailable Ollama,
Anthropic and Deepgram setup, missing Electron binary, rate-limited Meteora,
unconfigured keeper, an unfunded disposable pad test wallet, two unconfigured
Phoenix account cases and an unfunded pm-AMM simulation owner. No new trade was
broadcast. All nine v3 route/browser cases passed within that complete run.
The standalone working-tree `npm run build:app --prefix desk` also passes,
exit **0**, on the final unchanged app source. Existing bundle-size and mixed
static/dynamic Device import warnings remain non-failing.

Logs: `firmware/build/desktop-v3-d5-{desk,browser,build}.log`;
the incomplete setup log is retained separately as
`firmware/build/desktop-v3-d5-incomplete-setup.log`.
Six local screen commits record the test/capture work; the acceptance
documentation is a separate local commit. No existing secret was opened,
no board was flashed, and nothing was pushed.


## Agent wallet W1 — part 1 (2026-11-12)

`SIBYL_PY="$PWD/.venv/bin/python" node --test desk/test/agent-wallet{,.live}.test.mjs`:
3 passed, no skips. The live authenticated route created a disposable session
wallet and independently checked SOL and both SPL programs against
`https://api.devnet.solana.com` (SOL 0, USDC 0). Repeated create preserved the
address; GET returned the executor's same public key. No airdrop, signing or
submission. Existing wallet/key files and environment files were not inspected.
Explicit local protocol fixtures separately check raw-unit aggregation, unknown
mints, wrapped/native SOL separation, Jupiter failure and RPC failure.
RPC and pricing formats: [Solana](https://solana.com/docs/rpc/http/gettokenaccountsbyowner),
[Jupiter](https://github.com/jup-ag/api-examples/blob/main/apps/price-api/README.md).


## Agent wallet W1 — part 3 (2026-11-12)

Scope: brief parts 1 and 3. No desktop restyle, funding QR, firmware Fund
screen or wallet-card work is included. Unrelated pre-existing working-tree
changes were preserved and excluded from the W1 commits.

- `firmware/test/run.sh`: **271 cases / 2686 assertions passed**, no skips.
- Focused `agent-wallet.live.test.mjs` plus `portfolio.live.test.mjs`, run
  sequentially with the repo Python venv: **3 passed, no skips**. Actual public
  devnet SOL/SPL reads, idempotent creation, exact no-wallet instruction,
  agent-wallet fallback, explicit phone precedence and the selected native
  pad session public key all passed. The encrypted test proves the raw
  transport contains encrypted frames and neither the public wallet address
  nor a plaintext Portfolio record. No policy approval, funding or submission.
- Explicit local protocol fixtures: **3 passed**, including SPL raw-unit
  aggregation, unknown mints/unknown USD, RPC and price failures, native versus
  wrapped SOL, and SOL/USDC plus exactly three other holdings.
- `model3d.test.mjs` plus `portfolio-screen.test.mjs`: **7 passed**. Offline,
  home, five-row Portfolio, unavailable USD and exact no-wallet firmware frames
  agree with the shipped WASM byte for byte. WASM was rebuilt with the brief's
  EMSDK path. Existing commissioned art/model checks remain present.
- Standalone `npm run build:app --prefix desk` passed. Existing chunk-size and
  mixed static/dynamic Device import warnings remain non-failing.

Real public RPC limits initially rejected repeated reads; tests now space the
integration reads and allow bounded route-read retries. A genuine failure
stays an error. The encrypted integration test also found and verified the
session-response queue deadlock fix. The final live run passed all three
cases in 67,486.686625 ms. Earlier failed/interrupted diagnostic runs are not
claimed as acceptance runs.

The full desk suite runs alone in a disposable copy of the working source,
with the repo Python venv, CAD Python venv, installed dependency links and public
native/OTA/SDK artifacts. Existing key files, environment files and `.loom` are
excluded. One incomplete attempt lacked the CAD venv required by the existing
SCAN-model test; the missing environment was linked before restarting the full
suite. Its log is retained as `firmware/build/w1-desk-incomplete-cad.log`.
A later review retained Classic's live chain-slot/chain-ID metadata and added
regression assertions; the suite was restarted on that final source. The
interrupted pre-fix run is `firmware/build/w1-desk-before-slot.log`.

The two Portfolio screenshots in `docs/screens/v3/` were rendered and inspected
from actual captured records through `tools/uipreview`. The devnet wallet was
unfunded; no positive balance is asserted. Mainnet signing authorization was
unchanged. No existing secrets/environment files were inspected and no push
was performed. Public logs live under `firmware/build/w1-{native,live,parity,build}.log`.


Final isolated desk run on the complete final W1 source: **248 tests,
238 passed, 10 skipped, zero failures/cancellations**, exit **0**,
**849,288.373708 ms**. All new W1 cases passed without skips. Existing skips
were unavailable Ollama/Anthropic/Deepgram setup, missing Electron binary,
rate-limited Meteora, unconfigured keeper, unfunded disposable devnet receipt
and pm-AMM simulation owners, and two unconfigured Phoenix account cases.
The SCAN CAD comparison passed after linking the CAD venv; Classic's live
chain slot and chain ID are retained and asserted. Twenty changed code/artifact
files were checked byte for byte against the isolated suite source.

```sh
TMPDIR="$PWD/../runtime" XORR_USER_DATA="$PWD/../runtime/user" SIBYL_PY="$PWD/.venv/bin/python" npm test --prefix desk
```

The full run includes the app build and model3d/Portfolio parity tests. Its
complete log is `firmware/build/w1-desk-final.log`. The standalone app build
also passed. The disposable source/runtime copy was removed after verification;
public acceptance logs and the two inspected pad captures remain in this repo.

## Agent wallet W2 — part 2 (2026-11-12)

Scope: brief parts 2 and 5. The approved desktop components and styling are
unchanged; the desktop wallet card from part 4 is outside this step. Existing
working-tree edits are preserved and excluded from the W2 commits.

- `firmware/test/run.sh`: **273 cases / 2709 assertions passed**, no skips.
  Funding parsing binds the exact Solana Pay URI to its public address and
  supported cluster. Hold tests cover 999/1000 ms, release-only detection,
  one-shot dispatch, cancellation, dismissal and clock wrap.
- `desk/test/portfolio-screen.test.mjs`: native RGB565 and shipped WASM agree
  byte for byte for six wallet states: five-row Portfolio, unknown USD,
  no wallet, devnet Fund, mainnet Fund and a longer funding address. `jsqr`
  independently decodes each actual native funding frame to its supplied URI.
- All six `desk/test/model3d.test.mjs` checks passed in the focused run,
  including exact native/WASM home and offline frame parity. No test was
  weakened. Full serial desk-suite results are recorded in the W2 part 5 entry.
- `npm run build:app --prefix desk`: passed (existing chunk/import warnings).
- Final ESP32-S3 compile passed: **1,953,978 sketch bytes / 68,316 global
  bytes**. Compiled, not flashed; no hardware scan claim is made.
- Actual uipreview captures inspected: [Fund](docs/screens/v3/agent-wallet-fund-devnet.png),
  [Portfolio](docs/screens/v3/agent-wallet-portfolio-devnet.png) and
  [no wallet](docs/screens/v3/agent-wallet-portfolio-no-wallet.png). Fund uses
  the record received by the real v1 TCP padsim; the existing Portfolio captures
  were regenerated from the public W1 records and remained byte-identical.

```sh
firmware/test/run.sh
EMSDK='/Volumes/Extreme SSD/.xorrpad-toolcache/emsdk' tools/uipreview/build-web-screen.sh
SIBYL_PY="$PWD/.venv/bin/python" node --test --test-concurrency=1 desk/test/fund.live.test.mjs desk/test/portfolio-screen.test.mjs desk/test/model3d.test.mjs
npm run build:app --prefix desk
arduino-cli compile --fqbn esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc firmware/xorrpad
make -C tools/uipreview preview
tools/uipreview/preview firmware/build/w2-shots/fund 2 firmware/build/w2-fund-devnet.json
```

`firmware-screen.wasm` was rebuilt with the specified EMSDK; a second rebuild
was byte-identical, SHA-256
`554e559be963087ad9823789333a43f5ebbcd3c3055c4164d79f25cb00c15058`.
ESP32 pairing and funding use `esp_qrcode`; native/WASM uses the same encoder
and encoding options, with pinned Espressif source and retained licenses.

The authenticated local `POST /agent-wallet {"action":"fund"}` is the integration
point for “Show QR on pad”: 200 with the number of pads sent, 409 when no pad
is connected, 503 for no wallet, and 502 for unavailable RPC/storage. It never
creates a wallet implicitly. A firmware hold emits the existing key record
with `action:"fund"`; short release emits `action:"portfolio"`. Wallet screens
wake the display and dismiss without activating another key, while KILL retains
its safety action and pending confirmations keep priority.

Public logs: `firmware/build/w2-{native,focused,app-build,esp32}.log`.
No existing key files, environment files or private project state were opened;
no transaction was submitted. Mainnet execution gating is unchanged.

## Agent wallet W2 — part 5, final isolated acceptance (2026-11-12)

Final serial desk suite: **250 tests, 240 passed, 10 skipped, zero failures or
cancellations**, exit **0**, **822,539.133208 ms**. All new funding, native/WASM
wallet-frame and model3d cases passed without skips. The ten skips are the
existing unavailable Ollama/Anthropic/Deepgram/Electron setup, rate-limited
Meteora, missing keeper public metadata, unfunded disposable devnet receipt
and pm-AMM simulation owners, and two unconfigured Phoenix account cases.

Both padsim versions keep actual received `fund` and `portfolio` records.
The new live tests verify authenticated desktop funding actions and pad key
requests over fragmented TCP and encrypted serial v2; the v2 case uses the
native pad's selected session identity and asserts that neither its address nor
its funding record appears in plaintext transport. Missing wallet and missing
pad responses remain explicit. The saved actual TCP Fund screenshot was also
independently decoded back to the exact received Solana Pay URI.

The first focused run exposed the simulator's 15-second v1 inactivity timeout
between live reads. The live test now sends normal five-second hello heartbeats;
both delivery cases passed in the completed isolated suite. The initial broader
run was stopped after 161 passing tests, before the later receipt test could
open the repository's existing dedicated devnet key. It is not counted as a
completed suite. The final run used a disposable source/runtime copy excluding
all existing keys, environment files, `.loom`, and dedicated wallet directories.
Only dependency/venv links and explicitly public compiled drivers, firmware,
manifest and SDK WASM inputs were supplied. The receipt test created its own
unfunded disposable identity; no existing saved wallet was opened.

Equivalent command, in the isolated source copy (with the original repo venv):

```sh
TMPDIR="$W2_RUNTIME" XORR_USER_DATA="$W2_RUNTIME/user" SIBYL_PY="$W2_SOURCE_REPO/.venv/bin/python" node --test --test-concurrency=1 --test-reporter=tap desk/test/*.test.mjs
```

All **30** W2 code, test and artifact files were checked byte for byte against
the tested source copy and rechecked after completion. The disposable copy and
its generated wallet were removed. Final public log:
`firmware/build/w2-desk-final.log`; source hashes:
`firmware/build/w2-source-sha256.json`. W2 contains local commits only; no push,
transaction submission, existing secret-file access or desktop restyle occurred.

## Agent wallet W3 — part 4 and final acceptance (2026-11-12)

The Agent wallet card uses the existing desktop surface, buttons, badges,
icons and empty-state art. Its address, wallet source, cluster, SOL/SPL units,
USD availability and observation time come from authenticated `/agent-wallet`.
The funding QR uses the existing local encoder; no third-party QR service or
secret export is involved. Creation is explicit, an absent pad is reported,
and refresh/RPC failure clears prior balances instead of retaining stale values.
The signing/session controls remain available below the card.

The new built-app `desk/test/app-agent-wallet.test.mjs` exercises the actual
backend and public devnet RPC without intercepted HTTP/WebSocket responses:

- No-wallet instruction and Create action, with no funding QR or balances.
- Explicit creation of one disposable wallet, identity match with the existing
  session wallet, live zero SOL/USDC and honest devnet valuation text.
- Clipboard address and independently decoded rendered QR match the wallet's
  exact Solana Pay URI.
- Card at 1440/375 px, reduced motion, text bounds, no horizontal overflow,
  44×44 px controls and the entire card above the mobile navigation.
- “Show QR on pad” reports no connected pad, then sends the matching public
  Fund record to the real fragmented TCP padsim.
- A refused RPC connection produces the actual route error, clears stale
  balances/QR and does not offer Create for an already-created wallet.

All existing W1/W2 tests remain, including the authenticated route's independent
devnet balance checks, encrypted-v2 funding of the selected native pad wallet,
PORTFOLIO fallback, explicit phone precedence and no-wallet instruction.
`agent-wallet-status.test.mjs` additionally verifies that simultaneous wallet
identity and policy-status reads share one fresh encrypted native-pad response,
mutations remain exclusive and all readers reject together on disconnect.

The first full run exposed a read race: the new wallet card could acquire the
pad's single session request before the existing policy-status route, causing
that route to fail and leave its controls disabled. That run was stopped and
is not counted as completed acceptance. Read-only session-status requests now
share their in-flight promise on the same encrypted connection. Policy changes,
transaction signing and reviews retain their existing exclusive request gate.

Screenshots are in `docs/screens/v3/`: `agent-wallet-devnet-{1440,375}.png`,
`agent-wallet-fund-devnet.png`, `agent-wallet-portfolio-devnet.png` and
`agent-wallet-portfolio-no-wallet.png`. The desktop images come from the new
browser test; the pad images render actual captured public records through
`tools/uipreview/preview` at 2× resolution. The unfunded disposable devnet
identities have actual zero SOL/USDC. No funded-account or physical-pad scan
claim is made. See the screenshot inventory for provenance.

The full desk suite runs alone, serially, in a disposable source/runtime copy.
Existing key material, `.env` files, `.loom`, dedicated devnet wallet directories
and unrelated private runtime state are excluded before any file is read.
Only dependency/venv links and explicitly public native drivers, firmware,
manifest and SDK WASM inputs are supplied. The original repo Python venv is
selected with `SIBYL_PY="$PWD/.venv/bin/python"` before entering the copy.
Tests can create their own disposable identities; none is funded or submitted.
All unrelated working-tree edits are preserved and excluded from the W3 commit.

```sh
firmware/test/run.sh
EMSDK='/Volumes/Extreme SSD/.xorrpad-toolcache/emsdk' tools/uipreview/build-web-screen.sh
npm run build:app --prefix desk
# Inside the isolated source copy, with SIBYL_PY pointing to the repo venv:
node --test --test-concurrency=1 --test-reporter=tap desk/test/*.test.mjs
```

Public evidence: `firmware/build/w3-{native,wasm,app-build-final,desk-final}.log`,
`firmware/build/w3-design-check.json` and `firmware/build/w3-source-sha256.json`.
The mechanical design check reports no findings. The rebuilt screen WASM is
byte-identical to W2, SHA-256
`554e559be963087ad9823789333a43f5ebbcd3c3055c4164d79f25cb00c15058`.

Native acceptance: **273/273 cases, 2,709/2,709 assertions**, zero failures or
skips. The focused concurrent-status regression passes **1/1**; the existing
Agent policy browser regression passes **1/1** after the race fix. Their public
logs are `firmware/build/w3-status.log` and
`firmware/build/w3-policy-regression.log`. The standalone isolated app build
passes; its pre-existing bundle-size and Device import warnings remain.

Final isolated desk acceptance: **252 tests, 242 passed, 10 skipped, zero
failures or cancellations**, exit **0**, **912,977.868458 ms**. Every new W3
test and the existing live agent-wallet/funding/Portfolio tests passed without
skips. The existing ten skips are unavailable Ollama/Anthropic/Deepgram/Electron
setup, rate-limited Meteora, missing keeper public metadata, an unfunded
disposable receipt wallet, two unconfigured Phoenix account cases and an
unfunded pm-AMM simulation owner. No test was weakened or removed.

Model3d parity and the independently decoded native Fund QR plus all six
native/WASM wallet-frame cases passed in that full run. The desktop captures
were refreshed from its actual browser test; the pad captures were regenerated
from its actual TCP Fund and Portfolio records and visually inspected.
The 25 recorded W3 source/public-artifact hashes matched both the working tree
and isolated copy before and after completion. The disposable source/runtime
and generated unfunded identities were removed after evidence extraction.

Local implementation commit: `6a64a69`. Acceptance documentation and captures
are committed separately. No existing secret files, `.env`, `.loom` or dedicated
wallet directories were opened; no transaction was submitted and nothing was
pushed. Mainnet execution gating and the approved desktop look are unchanged.

## Firmware v4 F1 — Predict on the pad (2026-11-13)

Scope: Predictor home, real pm-AMM devnet feed and quote-backed proposals,
YES arc/closing time, knob paging, two-step YES/NO, outcome positions, encrypted
v4 padsim, firmware mirror, version 4.0.0 and F1-only release notes. No prior
feature/test was removed. The approved desktop keeps its components and styling.

- `bash firmware/test/run.sh`: **277 cases / 2,744 assertions passed, 0 failed,
  0 skipped**. Tests include bounded/wrong-cluster records, unknown change,
  clock wrapping, stale refusal, outcome shares/Setup, two-step intent and
  fingerprint-bound confirmations which cannot inherit a held proposal key.
- Focused F1 actual HTTP/encrypted-native-padsim scenario: **4 passed / 0 failed**.
  The public devnet feed returned **89 open markets** in this run; a knob turn
  traversed beyond the first six-record page. The proposal remained gated by
  the real allowlist, and no accepted/signed/executed signal resulted. Missing
  outcome owner returned actual `/pm/positions` Setup required. No API mocks.
- Native/WASM RGB565 parity includes 13 distinct frames: existing Fund/Portfolio,
  prediction probabilities 0/42/100%, unavailable 24h history, prediction Setup,
  outcome Setup/empty/share rows. QR decoding remains checked independently.
- `npm run build:app --prefix desk`: exit **0**. Existing bundle size warnings
  remain; no new desktop CSS or assets were introduced. Impeccable's detector
  reports **0 findings** on the changed desktop screens.
- WASM rebuilt from final `ui.h` with
  `EMSDK='/Volumes/Extreme SSD/.xorrpad-toolcache/emsdk' bash tools/uipreview/build-web-screen.sh`.
  SHA-256: `29b40994dc48f9c4031e4e369090a94edc27176e99ddffc8c1a93d1b258a4b3d`.
  Public-record frames are in `docs/screens/v4/`; desktop captures are 1440/375 px.

Unsigned Arduino CLI compile-only evidence (both exit **0**):

| Build | Flash bytes / 3,145,728 | Static RAM bytes / 327,680 |
| --- | ---: | ---: |
| Pro | 1,969,062 | 68,660 |
| Core, release, `XORR_CORE=1` | 1,949,107 | 68,356 |

```sh
mkdir -p firmware/build/f1-tmp
TMPDIR="$PWD/firmware/build/f1-tmp" arduino-cli compile --jobs 4 --build-path "$PWD/firmware/build/f1-pro" --output-dir firmware/build/f1-pro-out --fqbn 'esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc' --build-property 'compiler.cpp.extra_flags=-DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --build-property 'compiler.c.extra_flags=-DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' firmware/xorrpad
TMPDIR="$PWD/firmware/build/f1-tmp" arduino-cli compile --jobs 4 --build-path "$PWD/firmware/build/f1-core" --output-dir firmware/build/f1-core-out --fqbn 'esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc' --build-property 'compiler.cpp.extra_flags=-DXORR_CORE=1 -DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0 -DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --build-property 'compiler.c.extra_flags=-DXORR_CORE=1 -DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0 -DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' firmware/xorrpad
```

Compiled, not flashed. No existing key files were opened; no release signing,
OTA publication, transaction submission or push was performed. Core skips TFT
access and relies on the authenticated desktop/phone for visual review; local
transaction-byte clear-sign approval is not bypassed. The current pm-AMM adapter
has no 24h history, so that metric is unavailable. Outcome balances require a
configured public owner/RPC and are shown as shares without invented USD prices.
F2–F7 remain future work; `docs/v4/V4-NOTES.md` specifies F1 records and limits.

Full isolated desk regression: `SIBYL_PY=$PWD/.venv/bin/python npm test --prefix desk`
ran alone, exit **0**: **256 tests / 244 passed / 12 skipped / 0 failed /
0 cancelled**, duration **933,996.289916 ms**. Every existing v1–v3 and
agent-wallet test remains in the normal suite. The skips report actual missing
local/provider/account setup or live upstream rate limits; none substitutes data.
The full run includes the new F1 scenario, all 13 frame parity cases, existing
model3d parity, Fund/Portfolio, cap persistence, clear-sign, crew, OTA and audio.
Test-generated v3 PNG changes were restored with `git checkout -- docs/screens/v3`.
The final app bundle was rebuilt after the final firmware WASM, and the native
suite was rerun after the final firmware request-error feedback change.

## Firmware v4 F2 — Perps cockpit and liquidation guard (2026-11-13)

F2 adds actual Phoenix/Jupiter public position reads, unavailable-safe cockpit
fields, the default 10% `liqGuardPct` option, red LIQ GUARD/LED and distinct alarm,
manual reduce-50% proposals and venue-bound reduction builders, Activity records,
Core/desktop mirror, encrypted padsim, native parser/input tests and uipreview.
Existing features, tests, key roles and desktop styles remain.

`bash firmware/test/run.sh`: **281 cases / 2,790 assertions passed, 0 failures,
0 skips**. This includes the new parser bounds/unknowns, exact 30-second expiry
across clock wrap, two-step guard intent, unchanged KILL LED priority and distinct
alarm sequence. Focused preflight: **6 tests passed / 0 failed**, including the
actual HTTP/paired encrypted padsim Setup flow and all **16 distinct native/WASM
RGB565 frames** (plus independent Fund QR decoding). The final full desk suite
also includes half-close identity/side/size/cap and padsim input coverage added
after that preflight.

The live integration deliberately has no configured perp public authority. It
asserts actual Setup required, no fabricated positions/quotes, no created signals
on connection or invalid/replayed input, validated persistent threshold options,
and the existing desktop form at 1440/375. Layout vectors explicitly say
LAYOUT TEST. No positive funded-position reduction or physical-pad behavior is
claimed. Jupiter's documented decrease request is unsigned and reduce-only;
Phoenix retains its actual ReduceOnly flag and decimal lot sizing. Existing
mainnet acknowledgement gates are preserved and additionally checked for every
reduce-only routed build, including phone mode.

WASM was rebuilt from final `ui.h` using the required EMSDK. Public evidence logs
are `firmware/build/f2-{native,wasm,app-build,focused,pro,core,desk}.log`.
`f2-source-sha256.json` binds the implementation/tests/public artifacts to the
isolated source; no existing private key, `.env`, `.loom` or wallet directory is
copied or opened. Dependencies and Python venv are linked; native public drivers
and public firmware/manifest inputs are copied. The full regression command runs
alone inside that copy as `SIBYL_PY=$PWD/.venv/bin/python npm test --prefix desk`.

Unsigned Arduino CLI compile-only checks both exit **0**:

| Build | Flash bytes / 3,145,728 | Static RAM bytes / 327,680 |
| --- | ---: | ---: |
| Pro | 1,976,534 | 68,820 |
| Core release (`XORR_CORE=1`) | 1,956,479 | 68,516 |

Both use the existing FQBN
`esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc`,
`--jobs 4`, and `CONFIG_BT_NIMBLE_SM_SC_ONLY=1` for C/C++. Core additionally
sets `XORR_CORE=1`, `XORR_RELEASE=1`, `CORE_DEBUG_LEVEL=0`. Existing F1 Pro/Core
build paths were reused as compilation caches; outputs/logs are F2-specific.
No signing step, flashing, transaction submission or push was performed.

The disposable source is initialized as a local Git repository so the unchanged
factory-key safety regression can verify its private-material ignore rules.
Final screen WASM SHA-256:
`6a0296ca80974ea103ccc73c49ab52db28741db3870bb76331ad6749b5016c0f`.
The design detector reports **0 findings** on the changed desktop components;
no CSS, tokens or commissioned art changed.

Final complete desk acceptance:
`SIBYL_PY=$PWD/.venv/bin/python npm test --prefix desk` ran alone in the matching
isolated source, exit **0**: **262 tests / 252 passed / 10 skipped / 0 failed /
0 cancelled**, duration **982,307.709625 ms**. All six F2 tests and every existing
v1–v3, F1 and agent-wallet regression that ran passed. Model3d parity and all
16 distinct native/WASM wallet/Predict/outcome/perps/guard frame cases passed.
No test was removed or weakened. The final 32 implementation/test/public-artifact
hashes match both working tree and isolated source before and after the run.

Standalone `npm run build:app --prefix desk` also passes from the same isolated
source; its verified public bundle is copied to the local desk build. Existing
bundle-size and Device import warnings remain. Final 1440/375 F2 captures are
copied from that full run; the real Setup pad frame is regenerated from its
captured public record. `docs/screens/v3` is restored as requested. See
`docs/screens/v4/README.md` for frame provenance and the explicitly labelled
LAYOUT TEST guard/cockpit vectors. No existing secret files were opened, no
release was signed or flashed, no trade was submitted and nothing was pushed.

The ten skips are existing external prerequisites: unavailable Ollama,
Anthropic, Deepgram and Electron setup; rate-limited Meteora; missing keeper
public metadata; an unfunded devnet receipt wallet; two unconfigured Phoenix
account cases; and an unfunded pm-AMM simulation owner. None substitutes fake
financial data or claims a successful broadcast.

## Firmware v4 — F3 tilt guard (2026-11-13)

`bash firmware/test/run.sh` exits **0**: **291 tests / 291 passed / 0 failed**,
**4,146 assertions / 0 failed**. Ten new native discipline cases exercise
serialized reboot, UTC midnight with independent deadlines, rolling-hour limits,
settings relaxation, unknown/duplicate close PnL, invalid/corrupt state, missing
UTC, conservative untimed approvals and retry refusal after a persistence error.
Native drivers are rebuilt, including `firmware/build/tilt-driver`.

Focused encrypted HTTP/browser/native/WASM checks exit **0**: **5 tests passed**.
The expanded parity test compares **19 distinct native/WASM frames** and still
decodes the actual Fund QR. F3 transport checks run against real local servers,
SQLite, encryption and production C++ accounting, with no external API mocks.
Accounting-only vectors are explicitly labelled test inputs, never real fills.

`EMSDK='/Volumes/Extreme SSD/.xorrpad-toolcache/emsdk'
bash tools/uipreview/build-web-screen.sh` rebuilds the shipped WASM after the
final `ui.h` edit. SHA-256:
`3495256ef6ccaa1284d8259b3d2a617d3b63e9ddec942ea52d619fc75ad8aa57`.
`make -C tools/uipreview` compiles the actual renderer and accepts public
`tilt_state` records. Countdown and UTC Setup frames are captured through this
renderer. Device/Agent screenshots at 1440/375 use the approved components and
real empty native simulator accounting; no CSS, token or art changes are made.

Unsigned Arduino CLI compile-only verification exits **0** for both boards:

| Build | Flash bytes / 3,145,728 | Static RAM bytes / 327,680 |
| --- | ---: | ---: |
| Pro | 1,991,590 | 69,156 |
| Core release (`XORR_CORE=1`) | 1,971,395 | 68,852 |

Both use the existing ESP32-S3 16 MB / OPI PSRAM FQBN, `--jobs 4`, and
`CONFIG_BT_NIMBLE_SM_SC_ONLY=1` for C/C++. Core also sets `XORR_RELEASE=1` and
`CORE_DEBUG_LEVEL=0`. No build signing step, flashing or push is performed.
Physical NVS power-cut atomicity, SNTP/TFT and input timing remain board checks.

Standalone `npm run build:app --prefix desk` exits **0** in the isolated source;
existing bundle-size and Device import warnings remain. Public build logs are
`firmware/build/f3-{native,wasm,uipreview,app-build,focused,pro,core,desk}.log`.
`f3-source-sha256.json` binds 24 changed implementation/test/public-artifact files
to the matching source copy. No existing private-key, `.env`, `.loom` or wallet
directory is opened or copied. Dependencies/Python venv are linked; generated
public ability WASM fixtures, native drivers and public OTA inputs are copied.
The unchanged regression suite runs alone there with the exact required command
`SIBYL_PY=$PWD/.venv/bin/python npm test --prefix desk`.

Final complete desk regression exits **0**: **266 tests / 256 passed / 10 skipped /
0 failed / 0 cancelled**, duration **995,609.75975 ms**. The exact required command
runs alone in the matching isolated source. All v1–v3, F1–F3 and agent-wallet
checks that ran pass; no test is removed or weakened. The ten skips are existing
external prerequisites (unavailable provider/Electron setup, venue rate limits,
missing public account metadata or unfunded devnet accounts), with honest Setup
states. The final 24 source/artifact hashes match before and after the run.

The exact legacy historical-receipt regression also passes independently: new
close/PnL metadata is sent only to firmware v4 and later, retaining byte-for-byte
v1–v3 receipt shape. A transient upstream history timeout was separately checked
against the unchanged live test: real SOL/AAPL candles and corrupt-cache recovery
passed in 8,922.873959 ms before the final full run. No data or assertions were
substituted. Standalone CAD/OTA prerequisite verification passed **20/20**.

The verified final app bundle and F3 1440/375 captures are copied from that run.
`docs/screens/v3` is restored as requested. No existing private material was
opened, no production release was signed/flashed, no trade was submitted and
nothing was pushed. See `docs/screens/v4/README.md` for frame provenance.


## Firmware 4 F4 — Panic flatten (2026-11-13)

The final desktop regression runs alone with the exact required command:

```sh
SIBYL_PY=$PWD/.venv/bin/python npm test --prefix desk
```

Exit **0**: **271 tests / 262 passed / 9 existing skips / 0 failures /
0 cancellations**, **987,104.764875 ms**. No other suite runs alongside it.
Every v1–v3, agent-wallet and F1–F3 check that ran passes. The nine skips retain
existing external prerequisites: unavailable provider/Electron setup, an upstream
Meteora rate limit, unfunded devnet accounts or missing public Phoenix metadata.
No test is removed or weakened, and no external API response is mocked. An
earlier progress run was deliberately interrupted for a stricter close-budget
boundary; only this final complete run is counted.

All five new F4 desk cases pass: YES dispatch versus NO, cancel-before-close and
confirmed-receipt sequencing, stale/replayed plans, short holds, changed inventory,
permission/cap refusal, grant revocation, malformed/oversized inventories,
mainnet refusal and an actual encrypted HTTP/padsim Setup/NO/re-arm flow. Pure
coordinator vectors are explicitly local state-machine inputs, not simulated
external prices, fills or balances. Close notional and outcome share budgets
must exactly match their reviewed quantities.

`bash firmware/test/run.sh` exits **0** on the final firmware: **293 test cases /
293 passed / 4,179 assertions / 0 failures**. New native cases cover strict
reduce-only parsing, row/count limits, full child-ID binding, the exact 800 ms
YES boundary, release, NO, expiry, connection changes and millis wrap. Existing
2-second KILL, NVS persistence and deliberate re-arm tests remain unchanged.
Granted flatten child IDs reserve F3 accounting even with phone/session signing;
subsequent native signing deduplicates the same ID. Cancellations do not invent
realized close PnL.

The actual firmware renderer and shipped WASM pass all prior cases plus awaiting,
Setup and refused Flatten states: **22 distinct frame cases**, with the genuine
Fund QR still decoded. Model3d CAD, commissioned art and byte-for-byte offline /
Home parity also pass. The final `ui.h` is rebuilt with:

```sh
EMSDK='/Volumes/Extreme SSD/.xorrpad-toolcache/emsdk' bash tools/uipreview/build-web-screen.sh
```

`desk/app/public/firmware-screen.wasm` SHA-256:
`69a2151f505efd2bfb470ba9f3756a2fe97104da5bb849c7ee1c3105faa481b4`.
`make -C tools/uipreview` and standalone `npm run build:app --prefix desk` exit
**0**; the existing bundle-size / Device import warnings remain.

Final unsigned Arduino CLI compile-only checks exit **0** using the existing
ESP32-S3 16 MB / OPI PSRAM FQBN, `--jobs 4`, and
`CONFIG_BT_NIMBLE_SM_SC_ONLY=1` for C/C++. Core additionally sets `XORR_CORE=1`,
`XORR_RELEASE=1` and `CORE_DEBUG_LEVEL=0`.

| Build | Flash bytes / 3,145,728 | Static RAM bytes / 327,680 |
| --- | ---: | ---: |
| Pro | 1,998,782 | 69,324 |
| Core release | 1,978,499 | 69,020 |

Public logs: `firmware/build/f4-{desk,native,wasm,app-build,pro,core}.log`.
The complete suite runs against the final desk implementation and F4 simulator;
final native/board checks additionally verify the firmware accounting hook.
The native Setup/layout frames and 1440/375 desktop evidence are documented in
`docs/screens/v4/README.md`. Mobile retains the approved static CAD poster;
Activity carries actual flatten plan/NO records using existing components.
No CSS, tokens or commissioned art are changed. `docs/screens/v3` and earlier
v4 captures are restored after the tests. No existing key files are opened, no
production release is signed/flashed, no live trade is submitted and nothing is
pushed. Venue-specific Setup limitations are in `docs/v4/V4-NOTES.md`.

## Firmware 4 F5 — Synthesized earcons (2026-11-13)

`bash firmware/test/run.sh` exits **0**: **296 test cases / 296 passed /
4,286 assertions / 0 failures**. All prior native cases remain unchanged.
New production PCM cases render accept, refuse, fill, alert, liquidation alarm,
KILL, cooldown and tick and verify exact sample length, bounded nonzero peak,
silent edges and distinct sample vectors. Policy cases cover default-off tick,
zero volume, mute, both UTC quiet-hour shapes, exact boundaries, all-day silence,
unknown UTC and atomic settings rejection. LED cases cover amber breathing and
alarm priority. `earcon-driver` compiles with warnings treated as errors.

The focused `desk/test/pad-earcons.test.mjs` run exits **0**, **3 passed**. It
compares every native PCM sample with the WebAudio input to within one signed
16-bit quantization unit, observes real AudioBufferSourceNode playback in a
browser from the authenticated encrypted pad link, verifies gain/mute and
persistent options, saves the real Device form and reloads simulator state.
No external API response, quote, fill, wallet balance or trade is fabricated.
The complete suite below additionally regenerates its final 1440/375 evidence.

`npm run build:app --prefix desk` and `make -C tools/uipreview` exit **0**.
Existing bundle-size / Device import warnings remain. The uipreview capture
uses the production native tilt driver's honest missing-UTC state with an hourly
limit enabled; no trade is accepted. See `docs/screens/v4/README.md`.

Final unsigned Arduino CLI compile-only checks exit **0** using the existing
ESP32-S3 16 MB / OPI PSRAM FQBN, `--jobs 4`, and
`CONFIG_BT_NIMBLE_SM_SC_ONLY=1` for C/C++. Core additionally sets `XORR_CORE=1`,
`XORR_RELEASE=1` and `CORE_DEBUG_LEVEL=0`. The final Core check reuses the existing
`firmware/build/f4-core` cache and writes its output to `f5-core-out`.

| Build | Flash bytes / 3,145,728 | Static RAM bytes / 327,680 |
| --- | ---: | ---: |
| Pro | 2,007,138 | 69,364 |
| Core release | 1,986,943 | 69,068 |

F5 does not change `ui.h` or `firmware-screen.wasm`; the shipped WASM SHA-256
remains `69a2151f505efd2bfb470ba9f3756a2fe97104da5bb849c7ee1c3105faa481b4`.
No signing step, board flash or push is performed. Physical acoustic/LED checks
remain hardware work. Logs: `firmware/build/f5-{native,focused,app-build,pro,core,uipreview,desk}.log`.


Final complete desktop suite, run alone:

```sh
SIBYL_PY=$PWD/.venv/bin/python npm test --prefix desk
```

Exit **0**: **274 tests / 265 passed / 9 existing skips / 0 failures /
0 cancellations**, **1,009,605.932 ms**. All v1–v3, agent-wallet and F1–F4 cases
that ran pass, including encrypted OTA, Opus/TTS, trusted confirmation, KILL /
re-arm, flatten, liquidation guard, prediction, native signing, persistent tilt,
permissions, session caps and real provider routes. All three F5 cases pass in
this complete run. The nine existing skips retain unavailable provider/Electron
setup, upstream Meteora rate limits, unfunded devnet accounts and missing Phoenix
trading authorities. No test is removed or weakened, and no external API is mocked.
Native/WASM frame parity and actual Fund QR decoding pass with the unchanged
WASM. Final sound screenshots at 1440/375 are visually reviewed; regenerated
v3 and earlier v4 screenshots are restored. No other suite or compile ran
alongside this complete desktop run.

F6 ambient targeted validation: native 300 cases / 4,390 assertions / 0 failures;
three desk ambient checks exercise the native gate, persistent options, encrypted
padsim wake and Device form at 1440/375. Native/WASM parity adds clock Setup states.
Final F6/F7 full-suite and unsigned Pro/Core results are recorded below.
