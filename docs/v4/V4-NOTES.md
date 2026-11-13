# Firmware 4.0.0 — F1–F3: Predict, perps and tilt guard

MIT · Copyright (c) 2026 Nivesh Gajengi.

F1, F2 and F3 are delivered. V1–V3 and agent-wallet functionality remains.
F4 flatten, F5 full earcon suite, F6 ambient clock and F7 journal
remain planned. OTA generation defaults to 4.0.0 with F1–F3 notes; no manifest
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

## F3 — Firmware tilt guard

`/pad/options.tiltGuard` configures `{dailyLossUsd,maxTradesHour,losingCloses,
cooldownMinutes}` in Device's existing options form. Zero disables each limit;
cooldown is 1–10080 minutes, hourly and streak limits are 0–1000. Defaults leave
all limits disabled, preserving existing permissions. Each pad saves its settings,
accepted IDs, rolling-hour timestamps, confirmed close PnL, losing streak and
independent UTC deadlines as one versioned `xorrtilt/state` NVS blob in the
existing 256 KiB profiles partition (bounded to 64 KiB, avoiding NVS string limits). Approval
reserves and saves locally before any approval/signature leaves the device.
Repeated signal approval, crew review and signing count once (128 recent IDs).
Counts include reduce-only approvals and conservative reservations even if the
desk later rejects the trade. A failed NVS write or corrupt restore refuses new
exposure; risk-reducing actions remain available under their existing gates.

Hourly limits use a rolling hour, daily loss uses net **confirmed realized** USD
PnL received this UTC day, and N losing closes starts the configured cooldown.
Zero/profitable closes reset the streak. Independent deadlines compose: a new
UTC day releases only the daily loss latch. Relaxing/disabling settings, positive
PnL, reconnection and reboot cannot shorten a running deadline. There is no desk
reset or supplied-clock operation. Firmware uses ESP32 UTC/SNTP, started by the
existing price-alert service. Missing/regressing UTC gives Setup required when
limits are enabled or a deadline is retained. With disabled limits, approvals
before clock sync are persisted and conservatively counted for an hour after
sync, rather than inventing timestamps. At most 1000 hourly timestamps are kept.

Firmware v4+ receipt records carry `closed` and `realizedPnlUsd` (number or
null); v1–v3 receipt records retain their exact existing shape. Explicit close receipts, reduce-only fills and spot sells identify closes.
PnL is copied only from confirmed receipts; marks, quotes, unrealized PnL and
unsigned builds never become realized profit/loss. Current adapters do not always
supply realized close PnL. A missing close result is recorded as unavailable and
loss-based guards show **Setup required: close PnL**, refusing new exposure until
that receipt supplies known PnL or the next UTC day. Unknown closes reset streak
continuity. No external API or financial response is mocked. Receipt signatures
are deduplicated across reboot (128 recent signatures and unresolved closes).

The Cooldown screen shows the reason and countdown ring, including offline.
New proposal YES is refused before the ordinary confirmation and clear-sign /
session / crew signing paths. Previously reserved approval-to-sign steps may
finish without double-counting; no new approval or automatic signing route can
bypass a tripped guard. Hidden confirmation pages cannot count as reviewed, and
a refused approval releases its hold so approval requires a fresh YES. KILL retains its exact hold/latch/rearm semantics. NO,
PORTFOLIO (including its funding hold), liquidation-guard reduction proposals and
reviewed reduce-only trades retain their existing behavior. Core receives the
same state through the desktop/phone mirror, and the existing refusal earcon
announces cooldown start. Every prior permission/cap/clear-sign/mainnet gate
still applies; no live trade, production release signing or flashing is performed here.

Encrypted `{type:"tilt_state",blocked,reason,remainingSeconds,durationSeconds,
tradesHour,realizedPnlUsd,losingCloses,unknownCloses,clockReady,healthy,settings}`
reports locally authoritative state once per second. The desk accepts this only
from the preferred verified encrypted peer and exposes it in `/desk/link`.
Agent shows the actual device state or Setup required, including unknown PnL.
The native/WASM mirror renders the same Cooldown frame, and stale mirror state
is marked Setup required. Desktop controls reuse existing Field/Card components;
no CSS, design tokens or art is changed.

`tools/padsim/tilt.mjs` uses production C++ accounting via `tilt-driver`, public
accounting files and the existing encrypted native-signing simulator. Native tests
cover serialized reboot, UTC midnight, independent deadlines, settings changes,
rolling-hour counting, deduplication, unknown PnL/time, corrupt storage and failed
persistence. No board has been flashed: physical NVS atomicity, power cuts, UTC
synchronization and TFT readability still require hardware verification.

F3 acceptance: native **291 passed / 4,146 assertions / 0 failures**; isolated
complete desk **266 tests / 256 passed / 10 existing skips / 0 failures /
0 cancellations**. Model3d CAD parity and all 19 native/WASM frame cases pass.
The standalone app build, WASM rebuild and unsigned Pro/Core compilation pass.
Final implementation/artifact hashes match across the workspace and isolated
source. Verification logs are `firmware/build/f3-*.log`; see TESTING.md for exact
counts, build sizes and limits. No CSS, token or commissioned art is changed. No existing private key,
production signing key or existing wallet directory is opened.


## F4 — Panic flatten

The existing KILL timer still fires at exactly 2 seconds, latches locally before
network work and persists through reboot. Its desk request + fresh physical
800 ms YES re-arm flow is unchanged. After a verified v4 pad reports KILL, the
desk reads configured Phoenix, Jupiter Perps and pm-AMM public wallet inventories
and builds one immutable Flatten all plan for that latch episode. KILL cancels
old pending trades first. No transaction is built for execution or signed merely
because KILL was pressed. NO refuses the plan and keeps the local and desk latch.

`{type:"flatten",id,fingerprint,reduceOnly:true,state,orders,perps,outcomes,rows,
message,remainingMs,observedAt}` drives the pad, Core's desktop/phone mirror and
Activity. States are building, awaiting, setup, empty, executing, refused, complete
and failed. Counts and every bounded row must agree; non-reduce-only records are
refused by the native parser. The pad shows four plan rows per page (knob scroll),
with quantities/budgets, venue and market; the fingerprint binds full identities
and amounts even when a long public market address is abbreviated for display.
The plan has at most 32 transactions and a 60-second confirmation window. Larger,
incomplete or unsupported inventories are Setup required rather than truncated
executable plans. A stale/changed plan requires re-arm and another KILL to rebuild.

A fresh YES hold of 800 ms sends a dedicated `flatten:yes` key bound to the
plan ID and fingerprint over the preferred verified encrypted transport. NO sends
`flatten:no`. Ordinary trade YES, voice, knobs that change trade parameters and
unrelated signing remain blocked while killed. The desk rereads the full inventory
before acting, cancels orders first, then closes every planned perp at 100% and
sells existing outcome tokens into collateral. No opposite-side purchase is used.
Each leg goes through the existing signal queue and executor, with auto-accept
forced off, permissions/caps/allowlists/cooldowns and the selected phone/session/
pad/crew policy intact. Caps cannot silently resize the reviewed exit. Outcome
permission budgets conservatively use $1 per share, not an invented price.
Normal remembered spot-position checks remain in force; only structurally valid
flatten exits use the actual venue inventory instead of requiring spot memory.

The killed exception is an in-memory grant for an exact internally created child
signal and its complete signal digest, device and current plan. A `reduceOnly`
label supplied by another proposal grants nothing. Re-arm requests and another
KILL revoke the plan; submission rechecks authorization immediately before the
network call. Each transaction must have a confirmed receipt before the next leg
starts; a phone handoff, quote or unsigned build is never called a fill. Failure
stops the sequence and reports its reason, retaining the latch and any earlier
confirmed partial progress. A completed flatten also leaves the latch on.

Every granted child ID also reserves native F3 accounting when its executing
record arrives, including phone/session signing modes; signing retries deduplicate
that same ID. Cancellations do not fabricate realized close PnL.

For pad signing, executing records identify the granted `legId` with
`legReduceOnly:true`. Only that ID can receive status/transaction review while
killed; policy configuration remains blocked. Native clear-sign decoding, every
reviewed page and its existing hold remain required. Automatic pad signing is
suppressed while killed, so an unrelated automatic policy cannot turn KILL into
a trade. Core retains its existing external visual-review/signing requirement.

Inventory scope is the existing configured Phoenix trader PDA and its subaccounts,
Jupiter public authority and pm-AMM public owner. Phoenix normal limit-order
cancellation uses the official SDK instruction builder; its conditional, spline
and active TWAP orders currently require external cancellation and block the
whole plan with Setup required. Jupiter limit and TP/SL requests use the official
unsigned cancellation API; keeper-dependent cancellation is explicitly refused.
Phoenix/Jupiter full-close instructions retain their real reduce-only/decrease
semantics and bind to the reviewed side/notional snapshot. Their deployments are
mainnet read-only by default: every flatten builder retains `XORR_ALLOW_MAINNET`.
pm-AMM sells exact existing YES/NO token amounts on devnet, checks the live token
balance and uses minimum-output protection. Resolved/expired shares require the
external claim flow and block the plan honestly. LP liquidity is outside the
outcome-position scope. Missing authorities, RPC failures, dust or unsupported
public account metadata never become a fabricated empty/successful flatten.

`tools/padsim/flatten.mjs` extends the encrypted native-signing/tilt simulator.
Coordinator tests use explicitly labelled local state-machine vectors to verify
YES execution dispatch, cancel-before-close ordering, receipt sequencing, NO,
replay, expiry, changed snapshots, permission refusal and grant revocation. These
vectors do not replace external APIs or claim live financial execution. The
actual HTTP/encrypted test uses missing public authorities, verifies Setup and
NO/re-arm, and confirms that YES cannot manufacture a plan or trade.
No physical pad is flashed and no live transaction is submitted in verification.


F4 acceptance: complete desk **271 tests / 262 passed / 9 existing skips /
0 failures / 0 cancellations**; native **293 passed / 4,179 assertions /
0 failures**. All 22 native/WASM frame cases, CAD parity, app build, WASM rebuild
and final unsigned Pro/Core compiles pass. See TESTING.md for exact sizes, command,
run duration, prerequisites and public log locations. No push or board flash.
