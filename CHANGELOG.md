# Changelog

All notable changes to xorrpad are documented here. This file follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — firmware 2.0.0, S1 desk integration

- Encrypted v2 pad pairing and transport, serial CRC, acknowledgments/retries,
  telemetry/crash intake, signed OTA upload, profiles and BLE Opus bridging.
- Canonical trusted-signal fingerprints in queue events and trade confirmation;
  changed executable quotes require a fresh review.
- Connect controls for QR/code pairing, pad settings, signed firmware updates,
  profile selection and the desk/physical-hold kill-latch rearm flow.
- Stateful v2 pad simulator and real encrypted desk integration coverage.

### Fixed

- Reject incomplete or expired rearm confirmations, refresh the watchdog on
  authenticated control traffic, and bound crash uploads before saving them.
- Preserve the operator-refusal rule when accepting fingerprint-aware requests
  and isolate the v2 simulator's port from the existing signals tests.

## [1.0.1] - 2026-11-12

### Fixed

- Replace the dead primary Pyth Benchmarks history URL with mint-pinned
  GeckoTerminal Solana pool OHLCV, including cached pool selection, backward
  paging, a shared rate limiter and HTTP 429 backoff.
- Preserve Pyth as the secondary history provider and expose each attempted
  provider's failure. Disclose partial archive coverage and missing gate warm-up.
- Name the pool and DEX in chart/replay provenance; label perp charts as an
  underlying spot reference alongside the venue's live mark.
- Preserve all candle resolutions through complete-bar aggregation, validate
  requested-window duplicates, and share raw in-flight pages across ranges.

## [1.0.0] - 2026-11-12

### Added

- Shared Solana route comparison with live venue discovery, price/fee/impact
  disclosure, missing-venue reasons and mint-pinned catalog identities.
- Direct Meteora DLMM USDC-pair quotes and unsigned swaps alongside Jupiter spot,
  with Jupiter routing across Solana spot venues and the existing xStock book.
- Phoenix live perps markets, depth-based long/short quotes, actual positions,
  unsigned opens and ReduceOnly closes; Jupiter Perps SOL/ETH/BTC indicative
  quotes, on-chain fee reads and unsigned API open/close builders.
- pm-AMM devnet market reads, decay-aware YES/NO quotes, unsigned create/swap/claim,
  positions, expiring Solana Pay handoffs and outcome/perp hedge proposals.
- Separate devnet-only recurring-market keeper with deterministic SOL/BTC hourly
  and ETH daily scheduling, funding guards, exact-expiry Pyth/confidence rules,
  recovery journal and public resolution evidence. Chain-derived creator stats
  expose incomplete archive reads rather than substitute invented totals.
- Persisted permissions after memory vetoes: per-trade/day/leverage/position caps,
  venue/market restrictions, cooldown, quiet hours, manual thresholds and explicit
  deciding rule IDs. Auto-accept stays off by default and requires speech/logging.
- Expiring trade-signal queue, authenticated accept/refuse/signed-wallet routes,
  WebSocket events, durable execution reservations and confirmed receipts.
- Optional Electron safeStorage session wallet and protected Node wallet storage;
  exact-message signing capabilities, last-moment policy checks, RPC genesis
  validation and explicit mainnet acknowledgement for local signing.
- Bring-your-own-model Ollama/Anthropic/compatible-provider agent with gated tools,
  safeStorage API-key entry, model discovery, editable/resettable persona and
  persistent searchable/renameable/exportable chats with tool metadata.
- Deepgram Nova-3 streaming STT and Aura PCM TTS, ordered pad/desk playback,
  exact-number proposal speech and explicit missing-key/fallback states.
- Firmware USB-CDC, Nordic UART BLE and authenticated Wi-Fi NDJSON link manager,
  transport priority/expiry, no uncertain trade replay, nonblocking provisioning,
  persisted protected 14-key programming and protocol-level knob support.
- Firmware v1 boot/hello version, pending-signal countdown/AUTO, confirmation and
  refusal controls, confirmed signature/Explorer receipt display and PCM bridge.
- Real host pad simulator, fragmented TCP/HTTP/WebSocket framing checks and actual
  serialport/PTY round trips; host-rendered firmware layout evidence.
- Nine-page responsive desk: Pad, Trade, Predict, Chats, Models & keys, Permissions,
  Positions, Backtest and Link, with Floor/Paper/Neon themes and screenshot matrix.
- Real-history strategy/backtest tools, bounded rules, Pyth cache/provenance,
  fees/slippage/funding accounting, metrics and counterfactual pm-AMM curve replay.
- Standalone landing with actual prototype/desk imagery, durable Redis waitlist,
  live signup counts and terms-gated Solana Pay USDC reservations with immutable
  payment expectations and finalized on-chain receipt validation.
- Vercel deployment handoff, responsive landing evidence, v1 setup/architecture/
  safety documentation, deployment table, consolidated full-run test evidence and
  hackathon/bounty submission draft with explicit Nick-only TODOs.

### Changed

- Release metadata agrees at 1.0.0 for desk, keeper and firmware; keeper manifest
  and lockfile now declare the release version. The site already declares 1.0.0.

### Removed

- Nothing. v1 is additive: Classic, legacy HTTP/voice/provisioning paths, existing
  memory gates, market warnings and tests remain available.

### Known limitations

- Hardware is compiled, not yet flashed. Physical USB/BLE, persistence, display
  orientation, mic/amp and the unwired encoder need hardware verification.
- XOR Expo source is external; phone relay, push and public-TLS wallet completion
  are unverified. Packaged app verification remains outstanding.
- Funded devnet trade/receipt and keeper creation/resolution need funding and
  Hermes access; no new successful full cycle is asserted by this release.
- The specified Pyth history endpoint returns HTTP 404; successful historical
  replay/no-look-ahead evidence remains blocked. Provider and voice checks need
  a reachable model and credentials; live APIs may rate-limit requests.
- Landing persistence and a funded reservation payment need real Upstash,
  approved terms/merchant/price and deployment. Read [TESTING.md](TESTING.md)
  for exact current results and actions; this entry does not claim all tests pass.
