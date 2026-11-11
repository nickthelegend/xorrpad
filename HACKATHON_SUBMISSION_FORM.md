# xorrpad · hackathon submission draft

Prepared 2026-11-12 (Asia/Kolkata). This is a copy-ready draft, not a submitted
entry. TODOs require Nick's account, publication decisions or private details.
Do not invent team identities, links, traction or completed hardware cycles.

Sources checked for this draft:
[Perps and Prediction Markets event and bounty](https://hackathons.solana.com/hackathons/perps-and-prediction-markets),
[submission form](https://hackathons.solana.com/hackathons/perps-and-prediction-markets/submit),
[submission guide](https://hackathons.solana.com/how-it-works),
[pm-AMM builder kit](https://predict-pm-amm.dev/hackathon.md).
The public form's shipped client schema was inspected without logging in or
submitting: Project Info → Links → Team → Bounty Tracks → Review & Submit.
It exposes all fields below; no separate bounty questionnaire was found.
Short description limit: 280 characters. Full description: 5,000 characters.
At least one valid supporting HTTP(S) link is required by the current form.
The bounty additionally requires working public code and a short demo.

## Project Info

**Project Name (`projectName`):** xorrpad

**Short Description (`shortDescription`, 159 characters):**

Every market. One desk. Fourteen keys. A physical Solana trading pad with gated
spot, perps and pm-AMM outcome proposals, voice and an optional session wallet.

**Full Description (Markdown; `longDescription`):**

<!-- Copy the block between these markers into Full Description. -->
<!-- BEGIN FULL DESCRIPTION -->
### Every market. One desk. Fourteen keys.

xorrpad brings Solana spot, perpetuals and short-dated prediction markets onto
one physical pad and an Electron desk. A key, chat or voice command proposes a
trade. Live routing selects a venue, memory and permissions gate the size, and
the user accepts or refuses. The default signer is the phone wallet; an optional
local session wallet operates within caps. A confirmed signature and Explorer
link become the receipt. Acceptance alone never counts as execution.

### Why it matters now

Trading across venues splits quotes, risk settings and outcomes between tabs.
A persistent physical control surface makes the proposal and risk decision
visible. The desk also works in a browser, so trying the software need not wait
for manufacturing. The existing ESP32-S3 prototype has 14 keys, mic, amp and TFT;
knob messages are implemented but the board has no wired encoder.

### What works today

Live Jupiter spot and Meteora DLMM quotes, Phoenix and Jupiter Perps quotes,
pm-AMM devnet markets/quotes and unsigned transaction builders; persisted memory
and permissions; expiring manual/auto-accept signals; a gated executor; real
Electron safeStorage credential encryption; provider/chat/voice integration;
responsive desk pages; actual serialport/PTY and Wi-Fi host-simulator checks;
and a standalone waitlist/reservation landing with explicit setup states.

The complete discovered release test run has 131 tests: 115 passed, 15 skipped
and 1 failed. The failure is a legacy keeper test forbidding any desk signing,
which conflicts with the v1 session-wallet executor. Live dependencies and
funding explain the skips; TESTING.md lists every one and its action. Firmware
v1.0.0 compiles for ESP32-S3 but is not yet flashed. No successful new funded
pad trade or keeper create/resolve cycle is claimed. Phone Expo source is
external and phone relay/push/public-TLS signing remain unverified. Pyth's
specified history endpoint returns 404, so successful backtest replay is blocked.

### Why pm-AMM is core

The Predict layer uses @pm-amm/sdk for actual market reads, decay-aware YES/NO
quotes, unsigned creation, swaps and claims. Programmable outcome keys create
the same gated signals as spot/perps. Creator-filtered chain stats and public
resolution evidence feed the desk. Hedge pairing is proposal research: mainnet
perps and devnet mUSDC do not form a real economic hedge.

Recurring price-above-strike questions fit the expiry-aware outcome model. A
seeded pool can quote without a maintained two-sided order book. Unlike a
parimutuel pool, it supports continuous outcome entry/exit rather than waiting
for final pool odds. Compared with LMSR or a generic constant-product AMM, the
dynamic pm-AMM reduces liquidity toward expiry to target uniform expected
arbitrage loss under Gaussian-score assumptions. That property does not promise
LP profit or deep liquidity at expiry.

A separate devnet keeper implements hourly SOL/BTC and daily ETH markets and
exact-expiry Pyth resolution. It requires the observation's publish second to
equal expiry and refuses confidence intervals touching the strike. Resolution
is creator-operated; the contract does not independently verify Pyth proofs.
Funding and Hermes authentication still block a demonstrated create/resolve cycle.

### Actual traction

At 2026-11-11T23:00:11.877Z, creator
GFvUgcVeEwBHnirG1jwcjaMJ8qJhRq1DM33c78trum2f had 0 markets, 0 unique trader
wallets, 0 swaps, 0.000000 mUSDC volume and 0.000000 mUSDC creator fees on devnet.
The chain-history scan was complete for that empty set; published resolutions
were 0. Public reference swaps used to test the decoder are not our traction.
No mainnet volume, customers, waitlist count or revenue is claimed.

### Standalone potential

The path is a working physical demo, waitlist and terms-backed reservations,
then manufacturing. v1 brings the user's own model and keys; a paid hosted model
service is deferred. The browser desk can support software evaluation first.
Manufacturing, pricing, distribution and independent-user traction still need
validation. Code is MIT-licensed; setup, exact blockers and release evidence are
in the repository's README.md and TESTING.md.
<!-- END FULL DESCRIPTION -->

## Links

| Exact form field | Value to enter |
| --- | --- |
| GitHub Repository (`githubUrl`) | https://github.com/nickthelegend/xorrpad — verified publicly readable. TODO Nick: ensure the reviewed v1 commit is published before submission; T8 does not push. |
| Demo URL (`demoUrl`) | TODO Nick: publish the authenticated demo and supply its actual HTTPS URL and safe reviewer access instructions. No deployment URL is established by this task. |
| Pitch Video URL (`pitchVideoUrl`) | TODO Nick: record/upload the short product demo and paste its URL; the guide allows a pitch of at most 3 minutes. |
| Technical Video URL (`technicalVideoUrl`) | TODO Nick: record/upload a code walkthrough and paste its URL; the guide allows at most 5 minutes. |

Do not paste the repository URL plus its annotation into a URL input; enter
only the actual URL. The public repository currently reflects earlier work,
so public visibility is not evidence that the local v1 release is published.

## Team

| Exact form control | Value / action |
| --- | --- |
| Team Lead (authenticated submitter) | TODO Nick: sign in, confirm the actual platform username and linked payout wallet. Local package author `nickthelegend` is not proof of the platform identity. |
| Invite by username (`teamInvites[].username`) | TODO Nick: supply each teammate's registered hackathon username, or confirm solo entry. |
| Role (`teamInvites[].role`) | TODO Nick: assign each actual teammate's role. |
| Existing team members (`teamMembers`) | TODO Nick: verify accepted members in the form; do not list unconfirmed collaborators. |

## Bounty Tracks

**Selected track (`selectedBounties` / submitted as `bountyIds`):**
Best use of the pm-AMM by PREDICT — Spark.

The main track evaluates submissions automatically. Select this one sponsor
bounty; the form permits up to three. The event lists a December 5, 2026 deadline
and a $100,000 main track. The pm-AMM award is a $1,000 investment rather than
a grant, plus help raising up to $25,000 on Backable. These facts come from the
[event listing](https://hackathons.solana.com/hackathons/perps-and-prediction-markets).

The full description answers all six published bounty criteria: actual traction,
why pm-AMM versus alternatives, narrative, integration depth, product today and
standalone potential. Working public code and a short demo remain eligibility
requirements, not accomplishments inferred from this draft.

## Review & Submit

TODO Nick: replace the private-detail/link TODOs, review the full description
against the latest test evidence, publish reviewed code and demo, confirm team
and track selection, and submit through the authenticated form before the
listed deadline. Recheck the live form for changes before submission.
No account action, team invitation, submission, push, tag or deployment was
performed by T8.
