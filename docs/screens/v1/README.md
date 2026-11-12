# v1 browser captures

The matrix has all nine pages in Floor, Paper and Neon at 1440 and 375 pixels.
**T10 refreshed Trade and Backtest's twelve images with real pool history.**
The other 42 page variants retain their T9 captures. Financial values are
point-in-time reads and model outputs, not executable quotes or actual fills.

## T10: working history

Run `node desk/test/history-ui.mjs` from the repository root. Playwright uses
Chromium, the actual authenticated desk server on loopback **8727**, isolated
SQLite/app storage and real APIs. It closes the browser/server/memory sidecar
and removes its temporary app directory. Run it separately from the HTTP suites.
No response is intercepted and no transaction is signed or submitted.

The [T10 manifest](history-manifest.json) records **18 captures**, three
integration groups, **0 runtime errors** and **0 layout issues**. The runner
verifies all four timeframe controls render real canvas candles, the perp
reference label and separate live mark, and a successful HTTP strategy replay.
Twelve captures update Trade/Backtest below; six additional perp captures are
linked in the next table. All use the existing fonts, palettes and components.

GeckoTerminal supplies **SOL / USDC · Orca** candles. The selected pool/DEX is
visible, and the chart retains the venue's live mark. The Backtest captures show
an actual run of a declared rule on November 1–8, including its negative model
PnL, trade log and source provenance. These are research estimates with the
stated fee/funding/slippage assumptions. Pyth remains secondary; the prior 404
states are preserved in [before-t10](before-t10/README.md). Older BTC archive
limits and all measured test counts are in [TESTING.md](../../../TESTING.md).

| Page | Floor 1440 / 375 | Paper 1440 / 375 | Neon 1440 / 375 |
| --- | --- | --- | --- |
| Pad | [Desktop](pad-floor-1440.png) / [Phone](pad-floor-375.png) | [Desktop](pad-paper-1440.png) / [Phone](pad-paper-375.png) | [Desktop](pad-neon-1440.png) / [Phone](pad-neon-375.png) |
| Trade | [Desktop](trade-floor-1440.png) / [Phone](trade-floor-375.png) | [Desktop](trade-paper-1440.png) / [Phone](trade-paper-375.png) | [Desktop](trade-neon-1440.png) / [Phone](trade-neon-375.png) |
| Predict | [Desktop](predict-floor-1440.png) / [Phone](predict-floor-375.png) | [Desktop](predict-paper-1440.png) / [Phone](predict-paper-375.png) | [Desktop](predict-neon-1440.png) / [Phone](predict-neon-375.png) |
| Positions & receipts | [Desktop](positions-floor-1440.png) / [Phone](positions-floor-375.png) | [Desktop](positions-paper-1440.png) / [Phone](positions-paper-375.png) | [Desktop](positions-neon-1440.png) / [Phone](positions-neon-375.png) |
| Chats | [Desktop](chats-floor-1440.png) / [Phone](chats-floor-375.png) | [Desktop](chats-paper-1440.png) / [Phone](chats-paper-375.png) | [Desktop](chats-neon-1440.png) / [Phone](chats-neon-375.png) |
| Agent | [Desktop](agent-floor-1440.png) / [Phone](agent-floor-375.png) | [Desktop](agent-paper-1440.png) / [Phone](agent-paper-375.png) | [Desktop](agent-neon-1440.png) / [Phone](agent-neon-375.png) |
| Permissions | [Desktop](permissions-floor-1440.png) / [Phone](permissions-floor-375.png) | [Desktop](permissions-paper-1440.png) / [Phone](permissions-paper-375.png) | [Desktop](permissions-neon-1440.png) / [Phone](permissions-neon-375.png) |
| Backtest | [Desktop](backtest-floor-1440.png) / [Phone](backtest-floor-375.png) | [Desktop](backtest-paper-1440.png) / [Phone](backtest-paper-375.png) | [Desktop](backtest-neon-1440.png) / [Phone](backtest-neon-375.png) |
| Link | [Desktop](link-floor-1440.png) / [Phone](link-floor-375.png) | [Desktop](link-paper-1440.png) / [Phone](link-paper-375.png) | [Desktop](link-neon-1440.png) / [Phone](link-neon-375.png) |

## T10 perpetual reference evidence

| View | Floor | Paper | Neon |
| --- | --- | --- | --- |
| SOL perp / 1440 | [Desktop](evidence/trade-perp-floor-1440.png) | [Desktop](evidence/trade-perp-paper-1440.png) | [Desktop](evidence/trade-perp-neon-1440.png) |
| SOL perp / 375 | [Phone](evidence/trade-perp-floor-375.png) | [Phone](evidence/trade-perp-paper-375.png) | [Phone](evidence/trade-perp-neon-375.png) |

The source is explicitly **spot reference for the perp**; Phoenix's live mark
is separate. No historical perpetual executable prices are asserted.

## Earlier T9 evidence

`npm run test:ui --prefix desk` is the original all-page browser check.
The [T9 manifest](manifest.json) records its 15 integration groups and original
54-capture run, with 0 runtime/layout issues. Trade and Backtest images from
that run are preserved in [before-t10](before-t10/README.md); the remaining
page images in the matrix are unchanged. Disconnected hardware and absent
wallet/chat data are truthful setup states.

The T9 runner created a real quote-backed devnet proposal and **refused it**,
checking the authenticated NDJSON pad simulator and `/events` without signing:

- [Incoming signal on Chats](evidence/signal-toast-chats-375.png)
- [Global decision drawer and countdown](evidence/signal-drawer-chats-375.png)
- [Pad firmware-style confirmation screen](evidence/pad-confirm-375.png)

This is host integration evidence, not a claim of flashed hardware.

## Before / after

T10 preserved all twelve prior Trade/Backtest variants unchanged:
[Trade desktop before](before-t10/trade-floor-1440.png),
[phone before](before-t10/trade-floor-375.png),
[Backtest desktop before](before-t10/backtest-floor-1440.png), and
[phone before](before-t10/backtest-floor-375.png). Compare with the matrix above.

The [26 original pre-T9 captures](before-t9/README.md) also remain unchanged.
Floor and Paper retain their palettes and typography; T9 intentionally changed
Neon to black/cyan/magenta. Original renderer SVG geometry is not stock art.
T7's separate landing captures remain in [site/README.md](site/README.md).
