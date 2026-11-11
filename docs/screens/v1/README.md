# T5 browser captures

Run `npm run test:ui --prefix desk` from the repository root. The Playwright
Chromium check uses the actual server, isolated SQLite/app storage, and real
venue APIs. It listens on loopback 8727, then closes the server/browser and
removes only its temporary directory. No APIs are intercepted. No transaction
is signed or submitted. A real devnet proposal is created and refused in the
TFT integration check after screenshots are captured.

The [manifest](manifest.json) records timestamps, integration checks, runtime and
layout results, and each page's actual empty/setup/error states. Financial values
in the PNGs are point-in-time reads and are not quotes for later execution.
The disconnected hardware and absent chat history are intentional truthful states.

| Page | Floor 1440 / 375 | Paper 1440 / 375 | Neon 1440 / 375 |
| --- | --- | --- | --- |
| Pad | [Desktop](pad-floor-1440.png) / [Phone](pad-floor-375.png) | [Desktop](pad-paper-1440.png) / [Phone](pad-paper-375.png) | [Desktop](pad-neon-1440.png) / [Phone](pad-neon-375.png) |
| Trade | [Desktop](trade-floor-1440.png) / [Phone](trade-floor-375.png) | [Desktop](trade-paper-1440.png) / [Phone](trade-paper-375.png) | [Desktop](trade-neon-1440.png) / [Phone](trade-neon-375.png) |
| Predict | [Desktop](predict-floor-1440.png) / [Phone](predict-floor-375.png) | — | — |
| Positions & receipts | [Desktop](positions-floor-1440.png) / [Phone](positions-floor-375.png) | — | — |
| Chats | [Desktop](chats-floor-1440.png) / [Phone](chats-floor-375.png) | — | — |
| Agent | [Desktop](agent-floor-1440.png) / [Phone](agent-floor-375.png) | — | — |
| Permissions | [Desktop](permissions-floor-1440.png) / [Phone](permissions-floor-375.png) | — | — |
| Backtest | [Desktop](backtest-floor-1440.png) / [Phone](backtest-floor-375.png) | — | — |
| Link | [Desktop](link-floor-1440.png) / [Phone](link-floor-375.png) | — | — |

These 26 PNGs are original screenshots of this implementation. None of the
internal design-reference artwork was copied into the repository.
