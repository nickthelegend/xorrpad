# Desktop v2, fix pass 1 (Claude's review). Local commits only, NEVER push.

The previous run ended with "failed" and left uncommitted changes in `desk/app/src/brand/*`. Finish that work first. Then fix the following. Change nothing else visually; the look is approved in direction.

1. **The toast never goes away.** "Ability removed. Its unchanged key bindings were restored." shows on every screen in every screenshot.
   - Toasts must appear only after a real user action in the current session.
   - They auto-dismiss after 4 s, can be closed, and never come back on load.
   - Make sure the screenshot run starts from a clean state.
2. **Headlines are cut off.** BlurWords headlines were captured half-revealed: "Your edge. At", "Small additions. Entirely", "A voice that".
   - Screenshots must wait for every reveal animation to finish, or disable motion via `prefers-reduced-motion` for captures.
   - Check that every headline reads as a full, good line:
     - Device: "Your edge, at your fingertips."
     - Abilities: "Small additions. Entirely yours."
     - Agent: "A voice that knows your rules."
     - Connect: "Good things take one cable."
3. **Agent page art.** The giant swap-arrow icon in the "Make the connection." card looks like clip art. Replace it with a purposeful visual in the brand language: a small animated waveform plus a model chip, or the `rings` media cropped tightly. No oversized icons.
4. **Check ⌘K.** The command palette opens, searches every screen and action, and works from the keyboard. Add a screenshot `palette-1440.png` that shows results.
5. **Connect.** The left panel's ring art is cropped awkwardly at the edges. Contain it properly, as the xorr.finance site does.
6. **375 px.** Re-check every screen at 375: no overflow, the nav becomes a bottom bar or menu, and the device render scales down.
7. **Screenshots.** Re-shoot every screen at 1440×900 and 375 into `docs/screens/v2/`, plus a contact sheet `docs/screens/v2/sheet.jpg`.

Commit per fix. NEVER push. Report in under 10 lines.
