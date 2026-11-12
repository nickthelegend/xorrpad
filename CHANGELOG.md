# Changelog

All notable changes to xorrpad are documented here. This file follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — firmware 3.0.0, factory and XOR phone attestation

- Factory-signed device certificates, offline external-path key/issuance tools,
  physical USB factory provisioning and fresh connection proofs, verified by
  the firmware, desk and actual XOR phone app.
- Independent fresh phone-origin BLE challenges, local strict Ed25519 checking,
  single-use/expiry/disconnect protection and genuine/unverified labels in the
  existing Pad screens; v1 and encrypted v2 relay support remain.
- Native/desk/phone verification parity and firmware 3.0.0 handshake/report
  compatibility. Production trust roots remain deliberately unconfigured;
  compiled, not yet flashed, with funding/hardware acceptance still explicit.

### Added — firmware 3.0.0, V7 validation and hardware research

- Rev 2 research with exact secure-element, haptic knob, battery/charger and
  USB-C PD candidates, distributor price links, a 1k sourcing worksheet,
  enclosure DFM and FCC/CE integration paths; unresolved costs remain RFQ.
- Repeatable v3 padsim regression and live native-pad devnet signing runner,
  with exact public funding addresses and explicit BLOCKED broadcast reporting.
- Firmware label `3.0.0`, normal/release compile evidence and complete test
  totals in TESTING.md; compiled, not yet flashed. Pending attestation source,
  funded broadcast and physical-board acceptance remain explicit in V3-NOTES.md.

### Added — firmware 3.0.0, V6 OTA channels

- Per-pad stable/beta opt-in saved in NVS, signed channel/percentage rollout
  metadata, and deterministic device-ID cohorts checked by desk and firmware.
- Streaming signed COPY/ADD patches tied to the previous app version/hash;
  independent patch and final-image verification, inactive-slot writes and
  existing boot health-check rollback. Full-image and v2 bootstrap paths remain.
- Connect channel controls and optional delta uploads; real compiled-image,
  native, encrypted padsim, HTTP authorization and desktop/mobile regressions.

### Added — firmware 3.0.0, V5 multi-pad co-sign

- Persistent desk threshold/quorum policies with distinct paired crew identities;
  every pad clear-reviews the exact message and signs its raw SHA-256 after a hold.
- Executor gates phone, session and selected-pad signing/submission on fresh
  verified approvals; Connect displays the crew policy and approver names.
- Two encrypted native-backed simulated pads cover 2-of-2, refusal, expiry,
  disconnect, replay, identity/signature substitution and policy changes.

### Added — firmware 3.0.0, V5 offline price alerts

- Up to eight desk-configured, NVS-persisted one-shot price alerts; keyless
  Jupiter Price v3 over pinned Amazon Root CA 1 HTTPS at 30-second minimum intervals.
- Background bounded polling, offline-only TFT/LED/chime and no trade dispatch;
  native parser/scheduler regressions and a live pinned-root smoke check.

### Added — firmware 3.0.0, V4 Abilities SDK

- Embedded wasm3 with capability-only imports, instruction-dispatch fuel,
  bounded linear/engine memory, deadline traps and staged host effects.
- Two persistent developer-signed ability slots, full-key physical developer
  approval, encrypted installs and the desktop Abilities management screen.
- C/AssemblyScript templates, Market Pulse and Pomodoro discipline samples,
  external-signing bundle tools and native/ASan/UBSan sandbox escape regressions.
- Compiled, not yet flashed; hardware timing and production interpreter review
  remain explicit in `firmware/V3-NOTES.md`.

### Added — firmware 3.0.0, V2 on-pad session signing

- On-pad Ed25519 session generation, NVS policy/rolling debit journal, program
  allowlist, reviewed policy changes and exact-message hold/auto authorization.
- Conservative collateral-input caps refuse unpriced instructions and Phoenix
  packets without leverage. Counter reservations survive reboot and precede signing.
- Desk `pad` executor mode, public signer/policy API, signature verification and
  a native-firmware-backed encrypted simulator with real cryptographic tests.
- V2 remains compiled, not yet flashed; funded broadcast and unsupported exposure
  require further work documented in `firmware/V3-NOTES.md`.

### Added — firmware 3.0.0, V1 clear signing

- Bounded Solana legacy/v0 message parsing and the specified transfer, compute,
  pm-AMM, Jupiter v6 and Phoenix decoders, using real unsigned builder captures.
- On-pad transaction-byte fingerprints and full paged review; default-off red
  blind signing requires a fresh extra-three-second hold. Authenticated chunked
  desk transport records one approval for the exact message without signing it.
- Native/adversarial and real encrypted-link tests. Unauthenticated lookup
  evidence remains blind; Jupiter input mints use verified ATA derivations.
  Phoenix shows native lots/ticks and discloses absent account-wide leverage.
  This is item 1 of v3, compiled, not yet flashed; the full v3 release is pending.

### Added — firmware 2.0.0, S7 validation and research

- End-to-end padsim checks of encrypted wire records, live signal fingerprints,
  desk rejection of short holds/wrong fingerprints, released-hold cancellation,
  verified historical receipt delivery, signed OTA and corrupt-image rejection.
- Bidirectional authenticated replay rejection and kill persistence loaded by a
  new simulator before the desk relearns the latch; existing v1 tests retained.
- Protocol/reproduction documentation and P2 findings on custom WakeNet training
  costs and LVGL migration. Both remain research only. Firmware is 2.0.0,
  compiled, not yet flashed; hardware/phone/bootloader verification is pending.

### Added — firmware 2.0.0, S6 P1

- All P1 TFT screens, two explicit PSRAM sprites and the xorr.finance RGB565
  palette; live Market Pulse, real position rows/PnL, scrolling replies and
  coded fixes preserve unknown values and display priority.
- Persisted brightness/night/high-contrast/spoken-amount/left-handed settings,
  two-minute dim and ten-minute blank, with consumed wake/dismiss gestures.
- Cobalt idle breathing, lime pending pulses, mint receipt flashes, amber
  errors and kill-first solid red status indications.

### Added — firmware 2.0.0, S5 release hardening

- Compile out telnet in `XORR_RELEASE=1`, suppress application/SDK/portal logs,
  and gate USB diagnostics on volatile authenticated USB desk consent that is
  revoked on disconnect, transport failover, re-pair or reboot.
- Production Secure Boot v2, flash/NVS encryption and key-lifecycle planning
  with irreversible-step warnings. No security fuses or encryption enabled.

### Added — firmware 2.0.0, S5 manufacturing

- Physical 01+14 boot self-test: all fourteen keys, knob, mic meter, speaker
  sweep, TFT bars/grid, LED RGB, Wi-Fi scan and BLE advertising; signed unit
  reports with explicit failure/timeouts and serial PASS/FAIL verification.
- Physical 01+13 ten-second reset countdown with cancellation, suspended trade
  inputs, checked erasure of default/profile NVS and fresh pairing after reboot.

### Added — firmware 2.0.0, S4 health

- Panic-enabled task/idle watchdog, SDK brownout reset handling, bounded NVS
  reset history and encrypted 30-second uptime/heap/PSRAM/RSSI/temperature/link
  telemetry. Uptime uses the 64-bit monotonic clock.
- Flash core dump upload with contiguous bounded chunks, SHA-256 and size-bound
  acknowledgments, durable private desk storage, reconnect/re-pair recovery
  and lost-ack retries. Flash is erased only after the desk saves the full image.

### Added — firmware 2.0.0, S4 voice

- 16 kHz mono Opus at 24 kbps, push-to-talk energy VAD/noise gate, live TFT
  waveform, ordered Opus TTS and USB/Wi-Fi PCM fallback. Codec state resets per
  utterance; disconnects and congestion stop capture with an actionable message.
- Five distinct accept/refuse/fill/error/kill cues and shared speaker gain,
  adjusted by the knob in Voice mode. Native tests use the actual ESP32 Opus
  library; encrypted simulator tests decode real Opus TTS and preserve PCM.

### Added — firmware 2.0.0, S3 profiles and knob

- Eight persistent profiles with Spot, Perps and Predict keymaps; desk sync
  stages every layer before atomically replacing the saved snapshot. Selection
  persists locally and the TFT identifies the active profile and layer.
- A dedicated 256 KB profile NVS partition retains both 3 MB A/B app slots and
  the 16 MB flash layout. Profile names and all fourteen bindings are validated;
  MIC, KILL, YES and NO stay in their measured cells.
- Debounced rotary input, speed-dependent size/leverage/slippage changes,
  short-press mode cycling and long-press voice PTT. Offline/killed inputs do
  not change trade settings. Encrypted USB tests cover all 24 profile maps and
  the desk's size cap, leverage and slippage defaults.

### Added — firmware 2.0.0, S3 kill latch

- A two-second physical KILL persists disarm in NVS, stops queued inputs and
  voice, forces solid red, and refuses signals even while offline or rebooted.
- Re-arm requires a paired desk request and a fresh 800 ms physical YES hold
  within 15 seconds. Failed storage clears remain killed; disconnects revoke
  consent. Native tests cover timers, reboot bytes and failed persistence.

### Added — firmware 2.0.0, S2 secure pairing and link reliability

- TFT code/QR pairing with persistent device identities, fresh one-use device
  challenges, X25519 directional keys and ChaCha20-Poly1305 replay protection.
- BLE Secure Connections passkey enforcement and authenticated subscriptions;
  a BLE pairing prompt blocks trade confirmation until the signal is visible.
- Native frame/CRC/AEAD conformance tests and real TCP delivery-fault tests.

### Fixed — firmware 2.0.0, S2

- Keep control-frame replay tracking separate from reliable acknowledgments so
  heartbeats cannot discard lost data; recover dropped acknowledgments safely.
- Expire links during backend work, back off reconnects, prefer USB/BLE/Wi-Fi,
  reject standby trade inputs, and discard expired outbound signals.
- Gate every legacy HTTP request on the desk-enabled legacy setting and discard
  old Wi-Fi output on failover. Keep v1 desk compatibility.

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
