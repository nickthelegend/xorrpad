# T9 browser captures

Run `npm run test:ui --prefix desk` from the repository root. Playwright uses
Chromium, the actual desk server on loopback **8727**, isolated SQLite/app
storage, and real venue APIs. No responses are intercepted. The runner closes
the browser, server and memory sidecar and removes its temporary app directory.
Do not run it alongside the HTTP unit suites, which also use 8727.

All **nine pages × three themes × two widths = 54 captures** below are from
one final run. The [manifest](manifest.json) records timestamps, real setup/error
states, integration checks, runtime errors and layout results. Each empty state
is checked for its illustration, exact setup reason and one recovery action.
The checks cover all four chart timeframes, spot quote completion, session/RPC
status, theme persistence, key programming, knob rotation and key travel.

The specified Pyth Benchmarks history service returned **HTTP 404** (and rate
limiting during repeated reads). The chart displays that real error; there are
no substitute candles. Jupiter references and perp marks are point-in-time
reads, not quotes for later execution. The screenshots use an unfunded,
unconfigured session wallet and disconnected hardware, honestly labelled.

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

## Real signal evidence

After the page captures, the runner uses a real live devnet pm-AMM quote to
create a gated proposal and **refuses it**. No transaction is signed or submitted.
The authenticated NDJSON pad simulator and `/events` stream carry the actual
messages; this is host integration evidence, not a claim of flashed hardware.

- [Incoming signal on Chats](evidence/signal-toast-chats-375.png)
- [Global decision drawer and countdown](evidence/signal-drawer-chats-375.png)
- [Pad firmware-style confirmation screen](evidence/pad-confirm-375.png)

If live devnet cannot return a liquid market, the manifest explicitly records
that dependency failure rather than manufacturing a signal or capture.

## Before / after

The [26 original pre-T9 captures](before-t9/README.md) are preserved unchanged
from the release baseline. Compare [Pad desktop before](before-t9/pad-floor-1440.png)
and [phone before](before-t9/pad-floor-375.png) with the first row above;
[Trade desktop before](before-t9/trade-floor-1440.png) and
[phone before](before-t9/trade-floor-375.png) with the second row.
Floor and Paper keep their original palette and typography. Neon intentionally
uses the new black, cyan and magenta tokens. Original SVG geometry is generated
by the renderer; no reference artwork or stock art is copied.

T7's separate landing captures remain in [site/README.md](site/README.md).
