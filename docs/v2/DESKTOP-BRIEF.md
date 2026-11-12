# XOR Desktop v2: xorrpad becomes a product of xorr.finance

Nick rejected the v1 desk UI as looking like an old, generic admin panel. These are the new rules.

- **xorrpad is a product of xorr.finance.** Its look IS the xorr.finance look. The live site is https://xorr.finance; its code is `/Volumes/Extreme SSD/Projects/xorr-solana/landing` (Next 16, Tailwind v4).
- **XOR Desktop is the app you download** to connect your pad, customize it and give it features. It must feel premium and new: a device companion app, not a trading admin panel.
- **NOTHING is pushed.** Commit locally only. This is unreleased.

## Brand, copied exactly from `landing/src/app/globals.css` and `layout.tsx`
- **Colours:**
  - night `#030304` (the ground);
  - ink `#f3f0e8` (warm off-white type);
  - lime `#c8f53c` (first accent, the primary action);
  - mint `#0dd87e` (success, profit);
  - cobalt `#2f5bff` (second accent);
  - lavender `#b7a6ff` (third accent).
- **Fonts:** display is Plus Jakarta Sans; body is Inter. Bundle them offline with `@fontsource-variable/plus-jakarta-sans` and `@fontsource-variable/inter`, because Electron must not depend on Google Fonts.
- **Motion:** the site's keyframes are float, twinkle, ripple, orbit and glow. Read `landing/src/components/motion/{BlurWords,Reveal,LoopVideo}.tsx` and port them. Respect `prefers-reduced-motion`.
- **Components:** read `landing/src/components/ui/{Card,Badge,Icon}.tsx` and `landing/src/components/bento/*` (OrbitCta, KeysStack, AgentShuffle, RuleTracks) and reuse their exact shape language: radius, borders, glows, pill buttons and the badge style ("Winner" lime pill, "New" pill).
- **Media:** the brand media in `landing/public/media` (`rings.mp4`/`.webm`/`.jpg`, `hero.mp4`, the `coin-*.webp` files, `vault.webp`) may be reused. The real pad photo is `xorrpad/docs/pad.jpg`.
- **Finish references, Dribbble, internal only.** Look at these with your image tool; never copy them into the repo or reuse their art or text.
  - `/Volumes/Extreme SSD/Projects/grokbot/design-references/web-shots/w27-03-product-launch-website.jpg`: cinematic dark, huge display type, floating isometric product objects, mono numbered tags ("01 BRAND").
  - `/Volumes/Extreme SSD/Projects/grokbot/design-references/web-shots/w146-03-gradient-website.jpg`: luminous fluid gradient backdrops. Use one slow cobalt→lavender glow behind the device, low intensity.
  - `/Volumes/Extreme SSD/Projects/grokbot/design-references/web-shots/w64-01-perps-trading-dashboard.jpg`: only for the Markets screen's density.

  Write your measured takes in `docs/v2/DESIGN.md`.
- **Banned:** a left admin sidebar full of 9 text links; grey bordered card grids everywhere; Inter Tight; glassmorphism by default; fake numbers.

## Layout leaders
- **Elgato Stream Deck** and **Logitech Options+**: the device is the hero, centered and big. Click a key or the knob and a sheet opens with what it does. Profiles switch at the top.
- **Apple's device setup** (AirPods/Vision pairing): connecting is a calm, animated, step-by-step moment.

## Screens (`desk/app/`: a new Vite + React + Tailwind v4 app that Electron loads)
1. **Device (home).**
   - The pad, rendered big and centered, as a premium object: CSS 3D or three.js. It has lit keycaps, the TFT glowing with the real pad screen state from padlink, and the knob. Behind it sits the slow brand glow.
   - The top center holds a "device island" pill: link (USB/BLE/Wi-Fi), firmware, and a live pending signal with a countdown.
   - Profiles appear as pills on top: Scalper, Swing, Predictor, plus Custom.
   - Clicking a key opens a right sheet to assign an Ability or action, with a live preview of the key label.
2. **Abilities: the "new type of features" Nick asked for.** An abilities store for the pad. Every card is real and wired to existing v1 modules:
   - Voice Trader (Deepgram + agent);
   - Auto-accept (permissions policy);
   - Signals (strategy scan);
   - Prediction Hedge (`hedge.mjs`);
   - Market Pulse on the TFT (live price ticker for a chosen market);
   - Discipline: a daily cap with a cooldown after a loss;
   - Backtest a key: replay a key's action over real history before binding it;
   - Morning Brief: the agent speaks positions and markets when you plug in.

   Each card has an install toggle, the permissions it needs, and which keys it binds. Installing an ability pushes to the pad.
3. **Connect.** The pairing flow:
   - choose USB, BLE or Wi-Fi;
   - an animated rings moment (reuse `rings` media);
   - found device;
   - firmware check, with release notes and an update button (Setup required until a signed firmware file exists);
   - Wi-Fi provisioning guide;
   - Tailscale / Mac mini status.
4. **Agent.**
   - Model cards: Ollama on the Mac mini, Anthropic and OpenRouter, each with status.
   - Keys, masked.
   - The persona with sample lines.
   - The voice, with a test button that speaks through the pad.
   - Chat history as a timeline.
5. **Markets.** Trade and Predict merged here, secondary and denser: aggregated venues, chart, ticket, pm-AMM markets, signals.
6. **Activity.** Receipts, signals and chats as one premium timeline.
7. **⌘K command palette** across everything.

## Data and safety
- Data comes from the existing v1 backend (`server.mjs` routes, `/events`), and the safety model is unchanged.
- Only real data, or designed Empty / Loading / Error / Setup-required states.
- Keep the v1 renderer reachable at `/v1` and Classic at `/classic`. **Remove nothing.**
- Desktop window: 1280×800 minimum. It also serves as the web desk at 375 px, with no overflow.

## Done means
- Playwright screenshots of every screen at 1440×900 (plus 375 for Device and Markets) in `docs/screens/v2/`. Add a contact sheet.
- Tests pass, with no test removed or weakened.
- Commit per screen. **Do not push.** Report in under 15 lines.
