# Firmware 4.0.0 · 2026-11-13

MIT · Copyright (c) 2026 Nivesh Gajengi.

Version four adds the following to every retained v1–v3 and agent-wallet flow:

| Feature | Pad / desktop behavior | Public link records and limits |
| --- | --- | --- |
| Predict on pad | Predictor home probability arc, question, close time; knob browses markets; PORTFOLIO shows outcome shares. Markets selects Predictor. | `predict`, `outcome_positions`; live devnet pm-AMM only, 30 s freshness; unavailable 24 h history stays unavailable. First YES/NO proposes; separate YES accepts. |
| Perps cockpit + liquidation guard | Entry, mark, leverage, liquidation distance and funding; red guard offers Reduce 50%. Device threshold, Activity events. | `perps`, `liq_guard`; actual configured Phoenix/Jupiter inventory. Missing venue fields are unavailable. Guard YES proposes a reduce-only close for separate review. |
| Persistent tilt guard | Local loss, hourly-trade and losing-close limits; countdown cooldown. Device settings and Agent state. | `tilt_state`; NVS persists counters/deadlines. Confirmed realized PnL only; missing clock/PnL/storage is Setup required. Desk cannot shorten an active cooldown. |
| Panic flatten | Existing 2 s KILL latch creates one cancellation/perp/outcome exit plan. Fresh YES authorizes that reviewed plan; NO retains KILL. | `flatten`; reduce-only, fingerprint-bound, fresh inventory and sequential confirmed receipts. Missing/unsupported inventory is Setup required. Caps, permissions and signing policy still apply. |
| Sounds + LED cues | Eight synthesized earcons shared with WebAudio; volume, mute, quiet hours and optional knob tick in Device. | `earcon`, `config`/`ready` sound options; quiet hours use UTC and can silence alarms. LED cues remain; actual speaker loudness/timing awaits hardware. |
| Ambient clock | After 60 s idle on Home: UTC, SOL sparkline, portfolio P/L, funding, NY hours and crew. Device on/off. | `ambient`, `pad_view`; 90 s data expiry, missing feeds unavailable. First complete key/knob gesture only wakes, including first KILL gesture. |
| Pad journal | Knob press on Home opens the last 32 decisions; Activity syncs them. | `journal_decision`, `journal_begin`, `journal_entry`, `journal_end`, plus existing signal/receipt updates. Only confirmed receipts become fills; no reconstructed PnL. |

[V4-NOTES.md](V4-NOTES.md) specifies each record, priority, persistence and venue
limitation in detail. Core skips the TFT and uses the authenticated desktop/phone
mirror and earcons. Core retains the existing external visual-review requirement
for transaction-byte signing. No proposal, clock, sound, journal or profile
selection grants trading authority. A pad never trades without trusted YES under
the existing permissions, caps, clear-sign, session/crew policy and mainnet gate.

The filming add-ons for SCAN answers and remaining legacy mirror corrections are
separate follow-up scope in the brief, not new claims of this F7 release pass.
No external response, balance, quote, fill or successful liquidation is fabricated.
Missing configuration gives Setup required; a successful empty read stays empty.

Build unsigned artifacts with `bash firmware/build-unsigned.sh`. The script runs
`arduino-cli compile` for Pro and Core release configurations, writes local image
bytes under `firmware/build/f7-{pro,core}-out/`, and records their exact hashes and
sizes under `firmware/releases/4.0.0/{pro,core}/manifest.unsigned.json`.
It has no signing-key argument and performs no signing step. Those JSON files
have no signature and are deliberately rejected by the existing OTA verifier.
Connect therefore continues to report Setup required for an installable package.
Never rename an unsigned manifest to imply a verified release or weaken the
verification gate. Production signing and publication are outside this work.

The final counts, commands, image sizes and capture review are in
[TESTING.md](../../TESTING.md). [Screenshots](../screens/v4/README.md) include
live-or-Setup data and clearly identified native layout vectors. No physical
board has been flashed; NVS endurance/power loss, acoustic/LED timing and panel
readability still require hardware verification.
