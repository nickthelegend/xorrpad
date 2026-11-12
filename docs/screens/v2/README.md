# MODEL-3D-FIX finishing-pass evidence

[Current desktop sheet](sheet-3d.jpg) · [Native Metal measurement](model-metal-performance.json).
All six screens were recaptured at 1440×900 and 375×812, with palette-1440.png.
Nine actual browser groups pass, including raycast and keyboard assignment,
real NDJSON knob rotation, reduced-motion changes and a devnet proposal refused
through the existing gate. Runtime errors 0; layout issues 0. Layouts, keycap
colours and CAD geometry remain in place.

The desktop and render tool share an offline PMREM RoomEnvironment, ACES Filmic,
sRGB, key/fill/cobalt/lavender lights, clearcoat and geometry-baked AO. Native
Apple M4 Metal measured 60.04 fps at browser DPR 2. Every studio still has at
least 8% projected bounds padding. Home and offline RGB565 frames both match
the native firmware byte for byte. Studio home uses the recorded real public
quote, explicitly marked STUDIO SNAPSHOT; the live desktop still shows actual
connection state. The original prototype is compiled, not yet flashed.

[Render provenance](../../../desk/app/public/media/pad/RENDERS.json) ·
[Read-only quote capture](../../../desk/app/public/media/pad/SCREEN-SNAPSHOT.json).
The teaser assets are identical copies committed only on xorrpad-teaser.
Earlier capture reports below are retained as historical records.

# MODEL-3D evidence

[Current CAD contact sheet](sheet-3d.jpg) · [All 16 art assets](art-contact.jpg).
The six screens at 1440×900 and 375×812 plus palette-1440.png use the real CAD.
Nine browser groups pass, including real mesh raycasting, keyboard assignment,
hover lift, preference changes, NDJSON knob rotation, actual installs and a real
devnet quote-backed proposal followed by Refuse. No mock API or fill is used.
Mobile uses the true render without a WebGL context. Layouts stay unchanged.
[Native M4 benchmark](model-metal-performance.json) and
[headless software benchmark](model-performance.json) are distinct measurements.
The full earlier FIX-1 capture guide below is historical; its rings were replaced
by the true CAD turntable for MODEL-3D.

# Desktop v2 · FIX-1 evidence

[Contact sheet](sheet.jpg) · [Machine-readable manifest](manifest.json)

All captures use the actual isolated desk server, SQLite and live venue APIs.
Playwright requests reduced motion before loading the app; the brand components
render fully visible headings immediately in that mode. Every capture reloads
into a clean app session after interaction checks. No action notification is
present in any capture. Fonts are bundled locally.

| Screen    | 1440 × 900                    | 375 × 812                   |
| --------- | ----------------------------- | --------------------------- |
| Device    | [Desktop](device-1440.png)    | [Mobile](device-375.png)    |
| Abilities | [Desktop](abilities-1440.png) | [Mobile](abilities-375.png) |
| Connect   | [Desktop](connect-1440.png)   | [Mobile](connect-375.png)   |
| Agent     | [Desktop](agent-1440.png)     | [Mobile](agent-375.png)     |
| Markets   | [Desktop](markets-1440.png)   | [Mobile](markets-375.png)   |
| Activity  | [Desktop](activity-1440.png)  | [Mobile](activity-375.png)  |

[Command palette, 1440 × 900](palette-1440.png) shows actual search results for
“Open”. Keyboard checks cover all six screens and four actions, arrow movement,
Enter, Escape, Tab containment, both Meta+K and Control+K.

The real NDJSON host simulator is disconnected before capture; the Device screen
therefore says no pad connected. There are no invented balances, trades or chat
messages. Markets waits for the real GeckoTerminal candle response and venue
catalog response; an unavailable live reference stays unavailable. The shared
signal flow was checked using a real devnet pm-AMM quote-backed proposal, then
Refuse. No wallet signed and no transaction was submitted by this harness.

Mobile checks assert no horizontal overflow on every screen and a reachable
fixed bottom navigation. The entire pad enclosure also fits above that bar.
The Connect film retains its 16:9 ratio with object-fit contain and the site's
radial mask. Agent uses a compact decorative waveform and the selected provider
chip; this visual does not claim a live voice stream.

Run `npm run build:app --prefix desk`, then `node desk/test/desktop-v2.mjs`.
The harness shuts down its own browser/server/memory sidecar and removes its
isolated app data. Captures do not depend on an existing user profile or keys.
