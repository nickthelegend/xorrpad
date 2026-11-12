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
