# Firmware 4.0.0 — F1–F2: Predict and perps cockpit

MIT · Copyright (c) 2026 Nivesh Gajengi.

F1 and F2 are delivered. V1–V3 and agent-wallet functionality remains.
F3 tilt guard, F4 flatten, F5 full earcon suite, F6 ambient clock and F7 journal
remain planned. OTA generation defaults to 4.0.0 with F1–F2 notes; no manifest
is signed with any existing key and no OTA is published.

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


## F2 — Perps cockpit and liquidation guard

Authenticated `GET /pad/perps` reads configured Phoenix (`PHOENIX_AUTHORITY`)
and Jupiter (`JUPPERPS_AUTHORITY`, falling back to the public `SOLANA_ADDRESS`)
positions. The desk checks these on its existing five-second connected-pad tick.
No authority means Setup required; a successful empty venue response stays empty.
Both existing perp deployments expose mainnet **read-only** data. F2 verification
uses no funded perp authority, executes no mainnet transaction, and never enables
`XORR_ALLOW_MAINNET`. The existing mainnet signing gate additionally guards the
reduce-only builder in every wallet mode.

`{type:"perps",positions:[{market,venue,side,entry,mark,leverage,liq,distancePct,
nextFunding}],message,observedAt}` adds up to six cockpit pages alongside all
existing spot position pages. Native/WASM share the exact renderer. Missing
fields are null on the link and **unavailable** on the pad. Phoenix account data
does not expose actual account liquidation or leverage; its isolated-entry quote
estimate is deliberately excluded. Neither adapter supplies a next funding time.
Jupiter API micro-USD fields are decoded at six decimal places; leverage is copied
from the API. [Jupiter's API specification](https://perps-api.jup.ag/v2/docs)
documents position fields and the partial `positions/decrease` request.

Distance is `max(0, (mark-liq)/mark*100)` for longs and
`max(0, (liq-mark)/mark*100)` for shorts. Crossing liquidation remains an alarm.
`liqGuardPct` defaults to 10 and is persisted in `/pad/options` (0 < pct <= 100).
The nearest eligible open position emits `{type:"liq_guard",active,id,market,
mark,liq,distancePct,proposal,observedAt}`. Missing prices never trigger a guard.
A red LIQ GUARD screen, distinct synthesized alarm and red LED pulse announce
the episode. KILL, errors, pairing, pending/clear-sign decisions and updates retain
priority. The guard and cockpit expire after 30 seconds without a fresh read.

With no pending decision, first YES sends `liq:yes` with `guardId`; NO sends
`liq:no` and dismisses that episode. YES rechecks the live position, threshold,
identity, exact half size, encrypted peer, KILL and pending state, then creates
an ordinary `/signals` proposal with `reduceOnly:true`, `reducePct:50` and
`manualConfirmation:true`. It never accepts, signs or executes that proposal.
A distinct trusted YES must accept the newly displayed **REDUCE 50%** proposal;
the existing fresh-key/hold and transaction-byte clear-sign rules still apply.
Every re-gate preserves manual confirmation. Permissions, caps, cooldowns and
session/crew policy remain in force. A cap that would alter the half-close
refuses it rather than silently changing its meaning. A changed position or
quote requires a fresh proposal.

Reduction routes never call an opening builder or switch venues. Phoenix halves
absolute base lots and sets the actual order's ReduceOnly flag. Jupiter halves
raw USD size, uses `positions/decrease` with `entirePosition:false` and withdraws
zero collateral. Both round down to the venue integer unit, rejecting dust. Each builder read
also verifies the reviewed position side and notional size before constructing
the close; intervening changes require a fresh proposal.
Jupiter's decrease response has no execution price: proposal price is its live
mark reference, explicitly labelled in quote metadata; fees come from its API
quote. A quote/unsigned transaction is never presented as a fill. After a
proposal/refusal, the same alert episode stays dismissed until recovery or a
different nearest position, preventing repeated prompts/alarms.

Device's existing options form gains the threshold. Activity's existing surfaces
show actual guard events received this session; disconnected/empty states remain
honest. Core receives the same records through the existing desktop/phone mirror
and hears the alarm, without bypassing the existing external visual review path.
`PredictPadSimulator` handles guard records and proposal-vs-answer semantics using
the encrypted native session simulator.

Evidence in `docs/screens/v4/`: `perps-device-{1440,375}.png` captures the real
local server and encrypted padsim; `perps-positions.png` renders its actual Setup
record. `liq-guard.png` and `perps-cockpit-layout.png` are explicitly labelled
**LAYOUT TEST** native parser/renderer vectors, not external financial data or
claims of a live liquidation. Their supplied inputs are generated test vectors
in `firmware/build/f2-{liq,cockpit}-layout.json`. No physical pad was flashed.
