# xorrpad · v1.0.0

**Every market. One desk. Fourteen keys.**

xorrpad is a physical trading pad for Solana, backed by an Electron desk and
interfaces for the XOR phone app. Spot, perpetuals and YES/NO outcome markets
share programmable keys, an agent, remembered risk rules and an acceptance gate.
The ESP32-S3 prototype has 14 keys, a microphone, an amp and a 2.8-inch TFT.
The protocol supports a size/leverage knob; the current board has no wired encoder.

![The physical prototype](docs/pad.jpg)

The order of work is a working board demo, then waitlist and reservations, then
bulk manufacturing. v1 uses your own local model or provider account and keys;
a paid hosted LLM service is outside this release. Nothing is removed in v1:
the original desk remains at `/classic`, alongside the nine-page desk, legacy
HTTP/voice paths, tokenized-stock book and NYSE-hours warnings.

## Architecture

```text
 ESP32-S3 pad                         XOR phone app (external Expo project)
 14 keys · mic · amp · TFT            BLE pairing/relay · signals · accept/deny
 link manager: USB > BLE > Wi-Fi <--> wallet signing · push integration target
       | USB-CDC NDJSON / Wi-Fi HTTPS             | HTTPS / wallet handoff
       v                                          v
 XOR desk (Electron on the Mac mini; responsive authenticated web view)
 ├─ serial / BLE central / HTTP / WebSocket link server and key programmer
 ├─ agent: Ollama locally or over Tailscale, or a bring-your-own-key provider
 ├─ voice: Deepgram STT → gated proposal → Deepgram TTS to desk / pad amp
 ├─ aggregator: Jupiter spot · Meteora DLMM · Phoenix perps · Jupiter Perps
 │              pm-AMM outcome markets on devnet
 ├─ memory + permissions → manual / policy auto-accept → executor
 │                         phone wallet (default) | capped session wallet
 └─ pad mirror · trade · predict · chats · models/keys · permissions
    positions · backtest · link; confirmed signature / Explorer receipt

 Separate devnet keeper: recurring pm-AMM markets + exact-expiry Pyth resolution
 Standalone site: waitlist + terms-gated Solana Pay USDC reservation checkout
```

The phone app source is not in this repository. Its BLE relay, notifications and
acceptance UI are integration targets, not a verified shipped phone release.
Transport tests prove the host simulator path. Firmware is **compiled, not yet
flashed**; physical BLE, keys, display, mic and amp still need a board check.
See [TESTING.md](TESTING.md) for the current full run and exact blockers.

## Venues

| Route / adapter id | Network | Implemented capability | Execution limit |
| --- | --- | --- | --- |
| Jupiter spot / `solana` (`jupiter` in router) | Mainnet reads | Mint-pinned spot/xStocks quotes and unsigned swaps; Jupiter can route through Meteora, Orca, Raydium and Phoenix spot | Live liquidity/quote required; a catalog entry does not guarantee a route |
| Meteora DLMM / `meteora` | Mainnet reads | Direct USDC-pair discovery, quotes and unsigned swaps, compared with Jupiter | No direct pool is reported as unlisted |
| Phoenix perps / `phoenix` | Mainnet reads | Live market discovery, depth quotes, position reads, unsigned open and ReduceOnly close | Enabled, funded trader/subaccount required; no public perps devnet verified |
| Jupiter Perps / `jupperps` | Mainnet reads | SOL/ETH/BTC marks, indicative quotes, on-chain fee reads, unsigned API open/close builders | Funded owner required; quote excludes ongoing borrow costs and is not a fill guarantee |
| PREDICT pm-AMM / `pmamm` | Devnet only in this app | Live YES/NO quotes, unsigned create/swap/claim, positions, creator-filtered stats and resolution evidence | Needs devnet SOL and mUSDC for a trade; funded end-to-end cycle remains blocked |

Every venue adapter only reads or builds unsigned transactions. The shared
executor handles signing/submission after acceptance. Missing fees remain unknown,
never zero. Token identity is the exact mint (or catalog `symbol@mint`), not a
ticker match; historical xStock liquidity exclusions are retained. Perp `size`
is USD collateral and notional is size × leverage; spot sells use asset units,
spot buys use USDC, and prediction sizes use devnet mUSDC.
[Venue evidence and quote assumptions](docs/VENUES.md).

## Trade lifecycle

1. **Signal:** a pad key, strategy scan, chat or voice intent creates a proposal.
2. **Proposal:** the aggregator compares real quotes and fees across eligible venues.
3. **Gate:** memory rules run before permissions: trade/day caps, leverage,
   position limits, venue/market allowlists, deny rules, cooldown and quiet hours.
4. **Accept or refuse:** press ✓/✗ on the pad or use the desk/phone integration.
   Waiting signals expire (60 seconds by default). Auto-accept is off by default;
   both venue and product kind must be enabled and the action logged and spoken.
   Unavailable speech leaves it awaiting manual acceptance.
5. **Sign:** the phone wallet is the default. Optionally create/fund a local
   session wallet and select session mode. The executor refreshes the quote and
   gate, reserves budget and checks the exact message again before signing.
6. **Execute and receipt:** after chain confirmation, persist the signature and
   Explorer link and publish them to the desk, TFT and connected event clients.
   An accepted proposal or unsigned handoff is never shown as a confirmed fill.

[Permissions, state transitions and wallet callbacks](docs/v1/T2-SIGNALS.md).

## Safety model

- The pad holds no wallet or model keys. The model can propose through tools;
  it has no tool to accept, sign, execute or change policy.
- Electron stores API credentials and session keys with OS-backed `safeStorage`
  (Keychain on macOS). Unavailable encryption fails closed. The optional Node
  session wallet uses an ignored owner-only 0600 file; it is not Keychain storage.
  Node refuses API-key persistence without Electron encryption.
- The local session signer checks RPC genesis and requires exactly
  `XORR_ALLOW_MAINNET=I_ACKNOWLEDGE_REAL_FUNDS` for mainnet. This switch does not
  configure or approve a phone wallet. Our transaction tests use devnet only.
- Permissions restrict memory decisions; deleting memory lowers fallback limits
  and removes knowledge of holdings. Corrupt policy fails closed. Ambiguous sends
  retain durable budget reservations and are not automatically retried.
- Hold KILL to disarm; pending unsigned signals are voided. A transaction already
  submitted cannot be cancelled. Keep authentication on all pad/phone relays and
  use a private, unique pad token before making the backend remotely reachable.
- pm-AMM resolution is creator-operated: the keeper records exact-expiry Pyth
  evidence but the program does not verify a Pyth proof. Confidence intervals
  touching a strike remain unresolved. Mainnet perps plus devnet predictions are
  research proposals, not an economic hedge.

## Setup

### Desk and memory

Use Node 20+ for desk/keeper (the site requires Node 22.12+ or 24+) and Python 3.
From the repository root:

```sh
python3 -m venv .venv
.venv/bin/pip install -r desk/memory/requirements.txt
npm ci --prefix desk
npm ci --prefix keeper
npm start --prefix desk
```

Electron starts the backend on port **8710** and opens setup. Enter the pad token
and provider/Deepgram keys in the desk's setup or **Models & keys**, then restart
when changing the pad token. Do not put secrets in source or plaintext files.
The browser desk uses the same backend; `/classic` preserves the original view.
For a headless backend, use `PORT=8710 HOST=127.0.0.1 node desk/main/server.mjs`
and supply configuration through your process environment. It does not offer
Electron credential persistence. Do not load `.env` files for tests.

### Pad: USB, BLE and Wi-Fi

Install Arduino CLI, the ESP32 core and libraries from
[firmware/README.md](firmware/README.md), then compile from the root:

```sh
arduino-cli compile --fqbn esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc firmware/xorrpad
```

This is a compile command, not a flash. The documented FQBN enables native CDC,
16 MB flash, the 3 MB app partition and OPI PSRAM for audio buffers.

- **USB:** connect the board's native USB-C. The desk scans Espressif serial
  devices at 115200; set `XORR_PAD_SERIAL` to select an explicit device path.
- **BLE:** the pad exposes Nordic UART; the desk's optional
  `@abandonware/noble` central or an external phone relay carries the same records.
  Enable Bluetooth access for the host. Physical radio/phone behavior is unverified.
- **Wi-Fi:** first boot/hold MIC at boot opens `xorr-pad-setup`. Join it, open
  `http://192.168.4.1` if needed, and enter Wi-Fi, `http://<mac-lan-ip>:8710`
  and the matching pad token. A reachable pinned-TLS HTTPS relay is also supported.
  The manager prefers responsive USB, then BLE, then Wi-Fi; uncertain trade
  inputs are not replayed after a transport change.

Use the desk **Pad** page to save/push the full 14-key map; MIC, KILL and
confirm/refuse cells stay protected. The **Link** page shows transport, version
and setup state. [Protocol](docs/v1/PAD-PROTOCOL.md) ·
[No-board simulator and real serial/PTY test](tools/padsim/README.md).

### Phone and Tailscale

Run the XOR Expo app from its separate project once Nick supplies its location
and build. Configure it to the desk HTTPS origin and matching pad token, pair the
pad's Nordic UART service, relay v1 records to authenticated `/padlink`, subscribe
to `/events`, and wire signal accept/refuse and wallet signing callbacks from
[T2](docs/v1/T2-SIGNALS.md). This is the integration contract; this repo has no
phone installation/build command or verified push-notification path.

Join the Mac mini, phone and any remote Ollama host to the same Tailscale network.
Use Serve for private HTTPS, or Funnel for a deliberately public HTTPS wallet/pad
relay, forwarding to port 8710 with backend authentication retained. A bare ESP32
**does not join Tailscale** and cannot route directly to a `100.x` tailnet IP;
use USB, LAN, a LAN relay or the pinned-TLS Funnel URL.

For wallet request URLs configure the relevant public HTTPS origin:
`SOLANA_PAY_PUBLIC_URL`, `PMAMM_PUBLIC_URL` and/or `PHOENIX_PUBLIC_URL`.
Set `SOLANA_ADDRESS` to the watched/phone wallet public key and
`PHOENIX_AUTHORITY` plus trader/subaccount indexes for Phoenix. A URL alone does
not prove a phone wallet signed and returned the correct message.

### Ollama, provider keys and voice

Start Ollama on the Mac mini or another reachable host and pull a tool-capable
model. In **Models & keys**, choose Ollama, set its root URL
(`http://localhost:11434` or your reachable Tailscale host), **Load models** and
select the installed model. Other choices are Anthropic or an OpenAI-compatible
provider with its API base URL and selected model. Enter keys in Electron's UI;
never include credentials in the provider URL. [Agent and chat guide](docs/v1/T3-AGENT-VOICE.md).

Enter a Deepgram key for Nova-3 STT and Aura TTS. Hold MIC to stream 16 kHz mono
PCM; enable desk playback with a user gesture. A missing key shows
`Setup required: DEEPGRAM_API_KEY`; no speech is synthesized locally to hide it.
Live model/voice verification and physical mic/amp verification remain separate.

### Keeper, backtest and landing

The optional keeper runs separately on devnet. Follow
[keeper/README.md](keeper/README.md): create its dedicated key once, fund with
at least 0.5 devnet SOL and the configured mUSDC liquidity budget, supply
`PYTH_API_KEY` in the process environment, then run `node keeper/run.mjs --cycle`
for a real create/resolve check. Never open its private key for documentation.

Backtest replays actual GeckoTerminal Solana pool candles, labelled with the
pool and DEX, with disclosed current fee schedules, funding gaps and adverse
slippage. Perps use the underlying spot reference plus the venue's live mark.
Pyth remains a secondary provider; its current HTTP 404 is reported when tried.
Partial archive coverage is explicit. Prediction replay is a counterfactual
curve experiment, not historical pm-AMM liquidity or proof of profitability.
[Replay contract and limits](docs/v1/BACKTEST.md).

```sh
npm ci --prefix site
npm run dev --prefix site
# http://127.0.0.1:8717
```

Waitlist storage requires Upstash; reservations need an approved price, merchant
and published terms. Missing setup leaves pre-orders disabled. The site verifies
finalized Solana Pay transfers; neither its API nor frontend signs payments.
[Site configuration and Vercel handoff](site/README.md).

## Deployment table

| Component | Local entry / target | Release state / exact handoff |
| --- | --- | --- |
| Desk | `npm start --prefix desk`; Mac mini, port 8710 | Source-run app; packaged app and public TLS/phone cycle need verification |
| Firmware | ESP32-S3 FQBN above | v1.0.0 compiled, not yet flashed; flash and sweep actual hardware |
| Phone | External XOR Expo app | Nick must supply repo/build and integrate relay, wallet and notifications |
| Keeper | `node keeper/run.mjs`; no listener | Fund dedicated devnet wallet and supply Hermes key before a real cycle |
| Landing | `site/`, port 8717; Vercel static + Node functions | Local build verified; configure Upstash/terms/merchant and deploy Preview, then Production |
| Remote access | Tailscale Serve/Funnel → desk 8710 | Configure HTTPS, token and wallet public URL; verify from the phone/pad |
| Models/voice | Ollama host or provider; Deepgram | Bring your own model/keys; paid hosted LLM deferred |

## Hackathon: Solana Perps & Prediction Markets

Target: [Perps and Prediction Markets](https://hackathons.solana.com/hackathons/perps-and-prediction-markets),
including Spark's **Best use of the pm-AMM by PREDICT** bounty. Its public listing
requires a working public repository and short demo, and weights real on-chain
traction most heavily. It lists a December 5, 2026 deadline; the bounty is a
$1,000 investment, with support to raise up to $25,000 on Backable.

pm-AMM is central to the Predict layer: quotes, YES/NO intent, creation, claims,
creator stats, keeper resolution and hedge proposals all use its actual markets.
Short-lived price-above-strike questions fit its expiry-aware outcome model.
A seeded AMM offers a quote without maintaining a two-sided order book;
parimutuel pools defer payout odds rather than provide the same continuous
entry/exit mechanism. Compared with LMSR or a generic constant-product pool,
the dynamic pm-AMM adjusts liquidity with time to expiry to target uniform
expected arbitrage loss under the paper's assumptions. This is a model property,
not guaranteed LP profit. [Protocol explanation](https://predict-pm-amm.dev/) ·
[Paradigm paper](https://www.paradigm.xyz/2024/11/pm-amm).

We do not claim borrowed reference transactions as users or revenue. Funded
keeper/trade cycles, independent users and a public demo must be demonstrated
before claiming bounty eligibility. The fact-filled draft and Nick-only TODOs
are in [HACKATHON_SUBMISSION_FORM.md](HACKATHON_SUBMISSION_FORM.md).

## Verification and layout

Run the complete discovered test set without parallel RPC bursts:

```sh
node --test --test-concurrency=1 desk/test/*.test.mjs keeper/test/*.test.mjs site/test/*.test.mjs
npm run test:ui --prefix desk
npm run test:ui --prefix site
npm run format:check --prefix site
npm run build --prefix site
make -C tools/uipreview shots
```

[TESTING.md](TESTING.md) gives one consolidated run, all skips, failures and
BLOCKED actions. Tests use real services and SQLite; no mocked quotes or receipts.

`firmware/xorrpad/` is the board sketch; `desk/main/` holds adapters, memory,
policy, agent and executor; `desk/renderer/` holds v1 and Classic; `keeper/` is
the separate oracle process; `site/` is the standalone landing; `tools/padsim/`
and `tools/uipreview/` verify host transport and display layout; `cad/` contains
the printable enclosure. [Spec](docs/v1/SPEC.md) · [Changelog](CHANGELOG.md).

MIT · Copyright (c) 2026 Nivesh Gajengi. No tag is created by T8; Claude tags
`v1.0.0` after review.

Art generated with ChatGPT; pad renders from the real CAD.
The [studio render pipeline](tools/render3d/README.md) and
[asset prompts/provenance](tools/render3d/ART-PROMPTS.md) document the source.

The finishing-pass [desktop contact sheet](docs/screens/v2/sheet-3d.jpg) records
all six screens at 1440 and 375 plus the command palette. The shared offline
studio rig, bounds-based framing and [timestamped SOL snapshot](desk/app/public/media/pad/SCREEN-SNAPSHOT.json)
keep the CAD renders and desktop consistent. `offline.png` is the explicit offline
asset; the hero and turntable show the firmware's real home screen. Teaser media
was copied in a separate local `xorrpad-teaser` commit; nothing was pushed.
