# The real xorrpad as a 3D model, plus brand assets (local commits only, NEVER push)

Nick: the product must show **the real xorrpad**, the one in `docs/pad.jpg`. Its real geometry is in `cad/`: the parametric parts (tray, plate, 14 caps, display pod, knob) and `cad/assembly.py`, which already exports GLB files. Use that model, and only that model, everywhere the pad appears.

**Do not change the approved UI layouts.** Only replace the CSS-drawn pad with the real model and add assets.

## 1. Export the web model
- Set up `cad/.venv` per `cad/requirements.txt`, installing whatever `partlib.py` imports.
- Run `cad/assembly.py` (assembled and exploded GLB).
- Add `cad/export_web_glb.py`. It:
  - applies PBR materials matched to the real photo: the cobalt-blue PLA enclosure (slightly rough), the keycap colours per key position exactly as in `docs/pad.jpg` (white, black, pink, red, blue and purple caps), dark legends, and a dark display bezel;
  - gives the TFT a separate emissive mesh named `Screen` with UVs, so the app can map a live canvas texture onto it;
  - names the nodes `key-01`…`key-14`, `knob`, `screen`, `tray`, `plate`;
  - compresses the result with `@gltf-transform/cli` (meshopt plus texture compression);
  - writes `desk/app/public/models/xorrpad.glb` and `xorrpad-exploded.glb`, each under 3 MB.
- Validate both with `gltf-validator` (npm) and record the result.

## 2. Real renders from the model
Add `tools/render3d/`: a headless three.js scene run through Playwright, in the xorr.finance studio look. That means a night `#030304` ground, a soft cobalt `#2f5bff` and lavender `#b7a6ff` rim light, a lime `#c8f53c` glint, and a contact shadow. It renders:
- `hero-34.png`, a 3/4 view at 2400 px, with transparent and dark variants;
- `top.png`, `side.png` and `exploded.png`, all transparent;
- `turntable.webm` and `.mp4`: 6 s, a seamless loop, 1080p, with a poster frame.

Write everything to `desk/app/public/media/pad/`. These are true renders of the real CAD; label them as such.

## 3. XOR Desktop: the Device screen uses the model
- Replace the CSS pad with `@react-three/fiber` + `@react-three/drei`, loading `xorrpad.glb`.
- It has a studio environment, a slow idle sway (off under reduced motion, which shows a static pose), and hover lift on keys.
- Clicking a key raycasts to `key-NN` and opens the **existing** assign sheet.
- The knob mesh rotates with knob events.
- The `Screen` mesh shows a live canvas texture of the pad state, drawn exactly as the firmware screen (the "xorr-pad" title bar, the signal and status).
- Key colours keep the real caps, and assigned keys get a subtle emissive rim.
- Lazy-load the model with a poster still (`hero-34.png`) so the first paint is instant. Keep 60 fps on an M-series Mac.
- At 375 px, use the poster or a lighter render.
- Use the same model wherever the desktop shows the pad: Connect, empty states and the ⌘K hero, if present.

## 4. Brand assets from the Codex image tool
Use `/Users/jaibajrang/.claude/skills/judge-skill/scripts/assets-codex.sh`, or your own image tool. Anything that shows the pad must use the step-2 renders as the image reference, so it stays the real device.
- **Style line:** "glossy premium 3D, soft studio light, xorr.finance palette (night #030304, lime #c8f53c, cobalt #2f5bff, lavender #b7a6ff, mint #0dd87e), matches glossy 3D coin art; no text, no logos, no real brands".
- **Ability icons** (8, 1024, transparent): Voice Trader (a glowing waveform orb), Auto-accept (a shield with a check), Signals (a radar ping), Prediction Hedge (yes/no tokens balanced), Market Pulse (a heartbeat line on a glass tile), Discipline (an hourglass with a lock), Backtest a key (a keycap with a rewind arc), Morning Brief (a sunrise with a speaker).
- **Empty-state art** (4, transparent): no pad connected (a cable floating), no chats, no positions, no keeper markets.
- **Connect step art** (3): USB-C, Bluetooth and Wi-Fi as glossy 3D objects.
- **OG card** at 1536×1024, using the pad render.

Then:
- Make a contact sheet, look at every image, and regenerate any with text, artefacts or the wrong palette.
- Optimize them: webp for photos, pngquant for alpha, each under 400 KB.
- Wire them into the existing slots (ability cards, empty states, Connect steps) without layout changes.
- Credit "Art generated with ChatGPT; pad renders from the real CAD" in the README.

## 5. Screenshots
Re-shoot the desktop screens (1440 and 375) into `docs/screens/v2/`, plus `docs/screens/v2/sheet-3d.jpg`.

Commit per step. **NEVER push.** Report in under 12 lines.
