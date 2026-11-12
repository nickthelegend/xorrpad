# Real 3D model, finishing pass (Claude's review). Local commits only, NEVER push.

The previous run timed out and left uncommitted work in `desk/app/src/style.css`, `desk/app/src/three/PadModel.jsx` and `docs/screens/v2/*`. Finish it and commit it first.

The geometry is right; it is the real pad. **Keep the model, the colours and the layouts.** Fix the render quality, so it reads as a premium product shot like the xorr.finance coin art.

1. **Lighting and materials,** in both the render tool and the desktop scene:
   - ACES Filmic tone mapping and an sRGB output.
   - A PMREM environment: RoomEnvironment or a small bundled studio HDRI, under 1 MB, offline.
   - Key, fill and rim lights: a cobalt `#2f5bff` rim on one side and a lavender `#b7a6ff` rim on the other, with a soft key light from the top-left.
   - Soft contact shadows on the ground, plus subtle SSAO or baked AO.
   - The enclosure is a slightly glossy PLA (roughness about 0.45, clearcoat 0.3), not flat unlit blue, with a slightly deeper base colour so the highlights read.
   - Keycaps: roughness about 0.35 with a soft specular. The legends are crisp.
   - The screen is emissive with a faint glass reflection on top.
   - Add a subtle reflective night floor in the hero shots only.
2. **Framing.** The top view crops the screen and the side view is cut off on the right. Frame every still with about 8% padding, using the model's bounding box, never guessed.
3. **Screen content.** For the hero, top and turntable shots, the screen shows the firmware's real home screen: the "xorr-pad" title bar, a live-looking SOL price line, and the profile and link strip, drawn exactly as the firmware draws it. Keep "OFFLINE" for an "offline state" still only.
4. **Re-render** every still and the turntable into `desk/app/public/media/pad/`. Update `RENDERS.json`.
5. **Desktop and teaser.**
   - The desktop's live scene gets the same lighting.
   - Copy the new renders and turntable to `/Volumes/Extreme SSD/Projects/xorr-solana/landing/public/media/pad/`, then commit there **on branch `xorrpad-teaser` only**, as a separate commit in that repo.
6. **Screenshots.** Re-shoot desktop v2 at 1440 and 375, write `docs/screens/v2/sheet-3d.jpg`, and record it in the README.

Commit per step. NEVER push. Report in under 10 lines.
