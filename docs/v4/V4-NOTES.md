# Firmware 4.0.0 — F1: Predict on the pad

MIT · Copyright (c) 2026 Nivesh Gajengi.

Only F1 is delivered in this step. V1–V3 and agent-wallet functionality remains.
F2 perps/liquidation guard, F3 tilt guard, F4 flatten, F5 earcons, F6 ambient clock,
and F7 journal are planned, not claimed as shipped. OTA generation now defaults to
4.0.0 with F1 notes; no manifest is signed with any existing key and no OTA is published.

Select **Predictor** in Device or **Predict on pad** in Markets. If the device has
stored hardware profiles, the desk selects its Predictor profile/Predict layer.
Otherwise the desktop profile activates the same screen. Pending decisions,
clear signing, KILL, pairing, receipts and errors retain their existing priority.
Knob turns browse the live market catalogue, six records at a time. The pad keeps
local selection responsive; the desk returns the selected catalogue page.

`{type:"predict", enabled, cluster:"devnet", venue:"pmamm", markets:[{market,
question, probability, change24h, closesIn}], selected, total, offset, sizeUsd,
observedAt, validForMs?}` comes from authenticated `/pm/markets`. A snapshot is
usable for at most 30 seconds. Scrolling cannot extend its original freshness.
Questions are bounded to 180 printable characters and drawn in at most three
lines. `change24h:null` is rendered **24h unavailable** because the current adapter
has no history. The arc uses the on-chain marginal YES probability; executable
BUY quotes include size, fees and price impact and need not equal that probability.
No offline or empty feed creates a quote. Failed prediction requests use the
existing Action needed screen with the actual desk error, rather than hiding
quote or liquidity failures behind the probability arc.

A first YES/NO emits `key` with `action:"predict:yes"|"predict:no"` and the displayed
market. The desk checks the profile, encrypted session, KILL state, absence of a
pending decision, freshness and market membership, then reads `/pm/quote` at the
current desk size and sends a normal `/signals` proposal. `manualConfirmation`
persists in the signal and disables auto-accept on both proposal and re-gate.
A new signal resets the physical hold: a held initiating YES cannot also accept.
Only a separate trusted YES (800 ms above the existing threshold) accepts; NO
refuses. Existing permissions, caps, execution, clear-sign, session policy and
mainnet acknowledgement gates remain in force. F1 is devnet-only. Nothing is
signed or submitted as part of the verification scenarios.

PORTFOLIO in Predict reads `/pm/positions` using its existing configured public
owner (`SOLANA_ADDRESS`). `{type:"outcome_positions",cluster:"devnet",positions:
[{name,yes,no}],message?}` shows up to eight outcome markets, three per timed page.
These are outcome **shares**, not invented USD valuations. Missing owner/RPC gives
Setup required; a successful empty response gives No outcome positions. Any key
closes the card without proposing; a one-second PORTFOLIO hold still requests FUND.
`predict:close` synchronizes this dismissal with the desktop mirror.

Core builds (`-DXORR_CORE=1`) skip TFT initialization/backlight. The same public
Predict/outcome records reach the authenticated desktop mirror; existing earcons
remain. Transaction-byte signing on a screenless Core still requires the existing
external desktop/phone review/signing path: local clear-sign approval is not bypassed.
No hardware was flashed and no physical pad behavior is claimed as measured.

`PredictPadSimulator` in `tools/padsim/predict.mjs` uses encrypted v2 framing with
firmware version 4.0.0 and the existing native session driver. It implements
proposal-vs-answer, scroll, stale/empty refusal and outcome dismissal. Run the
focused scenario with `SIBYL_PY=$PWD/.venv/bin/python node --test
--test-concurrency=1 desk/test/pad-predict.test.mjs` after the native driver build.
Tests use real local HTTP/encryption and real devnet reads; pure parser/layout
cases are explicitly test inputs, not substituted external service responses.

Evidence: `docs/screens/v4/predict.png` renders an actual public devnet record;
`outcome-positions.png` renders the actual missing-owner response. Markets captures
at 1440/375 px preserve the approved desktop. The native/WASM parity suite covers
live-layout probabilities 0/42/100%, unknown change, Setup, empty and share rows.
See TESTING.md for the final counts and unsigned Pro/Core build evidence.
