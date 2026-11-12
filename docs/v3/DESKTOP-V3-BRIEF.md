# XOR Desktop v3: bring the pad's v2/v3 powers into the approved desktop (local commits only, NEVER push)

Firmware v2 and v3 are merged into `main`. Their desk routes already exist and are tested in
`desk/main/server.mjs` and `desk/main/padlink.mjs`. Today they are only reachable from the old
classic UI (`desk/renderer/ui/link.mjs`, `abilities.mjs`, `crew.mjs`, `device-attestation.mjs`).
The new XOR Desktop (`desk/app/`, Vite + React + Tailwind v4, xorr.finance brand) uses none of them.

**Nick approved the desktop v2 look: do NOT restyle anything.** Keep the nav, the screens, the
3D pad, the colours, the fonts, the spacing and the components. Add the new controls *inside* the
existing screens with the existing components (`Sheet`, cards, `Icon`, buttons, pills, the
existing empty-state art). No new top-level nav items. No new fonts, colours or libraries.

## Hard rules
- Real routes only. Never mock a pad response. With no pad connected, show the existing
  "no pad connected" empty state and a plain "Connect a pad" action, never fake data.
- Errors from the desk are shown verbatim and readable. "Setup required" stays as written.
- The desk never signs except the existing opt-in modes. Pad-signer mode only forwards to
  `/pad/clear-sign`; the pad decides.
- No secrets: never open `.env`, key files, `firmware/build/artifacts/*.key`, or anything under
  `~/zec-testnet-wallet/` or `.loom/`. Never push. Never touch Vercel or any vendor.
- Don't delete or weaken any test. Keep the classic UI (`/classic`) working.
- 375 px: no horizontal overflow, 44 px tap targets, `prefers-reduced-motion` respected.

## Where each feature goes

| Screen | Add | Routes |
|---|---|---|
| **Connect** | Encrypted pairing (show the pad's 6-character code, confirm on the pad). **Attestation badge**: lime "Genuine xorrpad #serial" or red "Unverified device" with the reason; unprovisioned dev pads honestly show red. Transport (USB / BLE / Wi-Fi) and link health. | `/pad/pair`, `/desk/link`, `/desk/status` (attestation is in the peer snapshot) |
| **Device** | Firmware card: version, **OTA update** (pick `app.bin` + manifest, optional delta), progress from `/events`, **channel** stable/beta toggle. **Kill latch**: state + "Re-arm" (needs a hold on the pad). **Profiles**: 8 profiles × 3 layers switcher, wired to the existing key assign sheet. Pad options (brightness/night). | `/pad/ota`, `/pad/manifest`, `/pad/ota-channel`, `/pad/rearm`, `/pad/profiles`, `/pad/profile`, `/pad/options` |
| **Abilities** | A second section "On-pad abilities" under the existing desktop abilities: trusted developer key, two slots (install signed bundle / remove), each ability's capabilities as pills (`tft.widget`, `keys.macro`, `alerts.price`, `audio.chime`), and the line "Abilities can never sign or trade". The two sample abilities from `sdk/abilities/` are the install examples. | `/pad/abilities` |
| **Agent** (wallet section, next to phone and session) | **Pad signer** as the third mode. Session policy editor: per-trade cap, per-day cap, max leverage, venue allowlist, auto-accept rule; the pad's session public key; the rolling daily spend read back from the pad. Blind signing toggle, off by default, with the red warning. | `/wallet/mode` (`pad`), `/pad/session` |
| **Activity** | Clear-sign requests: what the pad decoded, fingerprint, result (signed / refused + reason). **Crew co-sign**: the policy (above $X needs N of the crew's pads) and each round with who approved. | `/pad/clear-sign`, `/pad/crew`, `/events` |
| **Markets** | "Alert on pad" per market: price alerts stored on the pad that still fire when the desk is off ("nothing will trade"). | `/pad/price-alerts` |

Read `docs/v3/ATTESTATION.md`, `docs/v3/CREW-PROTOCOL.md`, `docs/v3/OTA-PROTOCOL.md` and the classic
UI files above for the exact payloads.

## Done means
- `npm run build:app --prefix desk` passes; `npm test --prefix desk` has 0 failures (run it alone,
  the suites share ports; set `SIBYL_PY` to the repo `.venv` python).
- Add `desk/test/app-v3-routes.test.mjs`: the built app's JS references every route in the table,
  and the desk answers each with auth (no pad → a readable error, never 200 with fake data).
- Screenshots at 1440 and 375 of every changed screen into `docs/screens/v3/` (desk running
  against the real padsim: `tools/padsim/`). Look at each one; fix overflow or clipped text.
- Append a "Desktop v3" section to `TESTING.md` with real counts, and a CHANGELOG entry.
- Commit per screen. **NEVER push.** Report in under 12 lines.
