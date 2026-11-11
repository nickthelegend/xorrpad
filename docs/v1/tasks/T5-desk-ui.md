# T5: XOR desktop v1 UI (a new design, approved by Nick)

Read `docs/v1/SPEC.md` first. Nick asked for a **new** XOR desktop look ("take reference from Dribbble, make it look cool, good themes"), so a redesign IS allowed for this task.

1. **Layout references: the category leaders.**
   - Elgato Stream Deck's desktop app, for the key programmer: the device drawn on the left, the action library on the right, drag an action onto a key, and per-key settings below.
   - A pro trading terminal (Hyperliquid or Phoenix), for markets, the order ticket and positions.
2. **Finish references: look at these files with your image tool.** They are internal references only. Never copy them into the repo or reuse their artwork or text:
   - `/Volumes/Extreme SSD/Projects/grokbot/design-references/web-shots/w64-01-perps-trading-dashboard.jpg`
   - `/Volumes/Extreme SSD/Projects/grokbot/design-references/web-shots/w99-04-terminal-ui.jpg`
   - `/Volumes/Extreme SSD/Projects/grokbot/design-references/web-shots/w131-01-price-alert-ui.jpg`
   - `/Volumes/Extreme SSD/Projects/grokbot/design-references/web-shots/w92-05-ai-memory-app.jpg`

   Write the concrete takes in `docs/v1/DESIGN.md`: grid, type scale, spacing, radius, palette, components.
3. **Pages.** Left rail navigation:
   - **Pad:** a live mirror of the device (keys, knob and TFT, from padlink events) plus the key programmer. Assigning a key pushes the keymap.
   - **Trade:** aggregated markets across venues, the route card (best plus alternatives), the order ticket, and the signals queue with Accept/Refuse.
   - **Predict:** pm-AMM markets, our keeper markets, resolutions with their Pyth evidence, and stats.
   - **Positions and receipts.**
   - **Chats:** history, search, the transcript with tool calls, and the model picker.
   - **Agent:** providers, API keys (masked), persona, voice.
   - **Permissions:** the auto-accept policy and caps.
   - **Backtest:** T6.
   - **Link:** USB, BLE and Wi-Fi status, firmware version, the provisioning guide.
4. **Themes.** Three themes, set as CSS variables:
   - "Floor", dark (the default);
   - "Paper", light;
   - "Neon", high-contrast.

   The theme switch persists. Fonts: keep the fonts the repo already ships in `desk/renderer/fonts`. No Inter Tight, no glassmorphism.
5. **Data rules.**
   - Only real data, or designed Empty / Loading / Error / "Setup required" states.
   - Units on every number.
   - `prefers-reduced-motion` is respected.
   - Focus is visible.
   - Tap targets are at least 44 px.
6. **Web desk.** The renderer is also served by `server.mjs` as a web desk, used by the phone and the public demo. At 375 px it must not overflow and the nav collapses.
7. **Screenshots.** Playwright screenshots of every page at 1440 and 375, in all three themes for Pad and Trade, saved to `docs/screens/v1/`.
8. **Keep the old screen.** The old renderer page stays reachable as "Classic" (`/classic`), so nothing is removed.

Make one commit per page or group.
