# T9: judge fixes (Claude's review of the v1 desk, Nov 12)

Read `docs/v1/SPEC.md` first. **Remove nothing; only add or fix.** The desk is real-data and clean, and it currently scores about 7/10 on look and feel. These fixes take it to 9.

1. **Trade: a price chart.**
   - Add a real candle chart for the selected market (Pyth Benchmarks history from T6, plus a live mark price), with timeframe chips 1m, 15m, 1h, 1d. Keep it lightweight: canvas or `lightweight-charts` from npm.
   - Bundle the dependency locally. Electron must work offline from a CDN.
   - Layout like a pro terminal: market header (price, 24h change, funding, venue) → chart → order ticket on the right → positions and signals below.
2. **Trade: live spot quotes.** SOL spot shows "Quote required". Fetch a live Jupiter quote for the visible spot rows, with a bounded number of rows and a 15 s cache, so the directory shows real prices. Only on a real failure show "Quote failed: <reason>".
3. **Pad mirror.**
   - Render the device as a physical object: the enclosure with a subtle bevel and depth shadow, keycaps with top-light, a TFT with a scanline/glow, and a knob that rotates with knob events.
   - Pressed keys animate.
   - When a signal is pending, the TFT on the mirror shows the same signal screen as the firmware, with a countdown.
4. **Themes.** "Neon" must be clearly distinct: a high-contrast black background, electric accent pairs (for example cyan plus magenta), mono numerals and a glow on focus and active states, with WCAG AA contrast. "Floor" and "Paper" stay.
5. **Hero moments.**
   - Each page's empty state gets a small purposeful illustration in CSS or SVG (no stock art): the Chats empty state, Positions with no wallet, Predict with no keeper markets.
   - Every empty state carries the honest Setup-required reason plus one action button.
6. **Signals toast.** A global toast and drawer shows incoming signals from `/events` on every page, with Accept/Refuse and a countdown. The same actions are available from the pad.
7. **Status bar.** A thin bottom bar showing link (USB/BLE/Wi-Fi), the desk RPC (devnet/mainnet badge), the session wallet balance, today's spend against the cap, and auto-accept on/off.
8. **Screenshots.** Take new Playwright shots of every page at 1440 and 375 in all three themes, written to `docs/screens/v1/`. Then update `docs/screens/v1/README.md`.

Commit per item, with no push. Report in under 15 lines.
