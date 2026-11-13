# Firmware v4 captures

The approved desktop components, tokens and art are retained.

| Files | Source / limits |
| --- | --- |
| `predict.png` | F1 actual public pm-AMM devnet record through firmware ui.h. |
| `outcome-positions.png` | F1 actual missing-owner Setup record through ui.h. |
| `predict-markets-{1440,375}.png` | F1 real local desk + encrypted native padsim. |
| `perps-device-{1440,375}.png` | F2 real local desk + encrypted native padsim, threshold saved to 7.5%; no configured perp authority. |
| `perps-positions.png` | F2 actual empty/Setup `perps` wire record rendered with ui.h. |
| `liq-guard.png` | F2 native parser/renderer **LAYOUT TEST** vector (mark 100, liquidation 95, distance 5%). No external API substitution or live liquidation claim. |
| `perps-cockpit-layout.png` | F2 native **LAYOUT TEST** cockpit vector; next funding unavailable. No live position claim. |

F2 layout inputs are generated under `firmware/build/f2-{liq,cockpit}-layout.json`;
the real Setup record is captured as `firmware/build/f2-perps.json` by
`desk/test/pad-perps.test.mjs`. Run `make -B -C tools/uipreview` and
`tools/uipreview/preview OUTPUT 2 RECORD.json` to render the exact firmware pixels.
Native/WASM tests cover 16 distinct frames including unknown cockpit fields and
the guard, alongside all existing Fund/Portfolio/Predict/outcome cases. No hardware
was flashed, no funded perp was reduced and no transaction was submitted.

F3 evidence:

- `tilt-agent-{1440,375}.png` and `tilt-device-{1440,375}.png`: real local desk,
  SQLite and verified encrypted native-accounting padsim. The actual simulator
  has no approvals/fills at capture time; its saved hourly limit is 1. No market
  quote, fill, wallet balance or realized PnL is fabricated.
- `cooldown-layout.png`: the actual `ui.h` native renderer with explicit
  **LAYOUT TEST** inputs (900/1800 seconds, half ring), not a real trading event.
- `cooldown-setup.png`: the native renderer's honest missing-UTC state, with
  no invented clock/countdown value.

F3 extends native/WASM parity to **19 distinct frames**, including countdown,
missing UTC and a reviewed reduce-only decision while cooling. Desktop captures
reuse the approved components; no stylesheet, token or commissioned art changes.
Physical display/power-loss verification remains hardware work.


F4 evidence:

- `flatten-setup.png` uses the actual encrypted padsim/desk response with missing
  public authorities, rendered by the production `ui.h` through uipreview.
- `flatten-layout.png` is explicitly **LAYOUT TEST / no live trades**: three
  coordinator/parser layout vectors, never an external API response or a fill.
- `flatten-device-{1440,375}.png` uses the actual local desk and verified v4
  padsim after KILL. The desktop live firmware texture receives the Setup plan;
  mobile retains the approved static CAD poster and actual Kill latch controls.
  `flatten-activity-{1440,375}.png` shows the actual NO/refused record in the
  existing Activity components. Styling, tokens and commissioned art are unchanged.
- Native/WASM parity adds awaiting, Setup and refused Flatten frames, preserving
  every earlier frame and actual Fund QR decoding (22 distinct frame cases).

Public inputs are in `firmware/build/f4-flatten-{setup,layout}.json`. A plan
layout is not proof of a funded live close; venue/signing prerequisites and
unsupported inventory cases are documented in `docs/v4/V4-NOTES.md`.
