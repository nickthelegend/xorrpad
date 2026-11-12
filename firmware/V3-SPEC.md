# xorrpad firmware v3.0.0: the pad becomes the trust anchor

This is research by Claude (Nov 12 2026), building on v2. v2 makes the pad safe to trust with a *desk's summary*. v3 makes the pad **trust nothing but itself**: it reads the real transaction, enforces your limits in its own firmware, signs on the device, and proves it is a genuine xorrpad.

The bar is the hardware-wallet standard (Ledger and Trezor "clear signing"), applied to a trading desk.

- **Branch and push:** build on branch `fw-v3`, cut from `fw-v2`. Commit locally only. **NEVER push.**
- **Remove nothing.**

## Research summary: why these eight

| # | Feature | Why it matters | Feasible on today's board? |
|---|---|---|---|
| 1 | Clear signing on the pad | The fingerprint becomes a hash of the real transaction bytes, not a desk-made summary, so a compromised desk can't lie. | Yes: Solana message parsing is small. |
| 2 | On-pad session signing with caps enforced in firmware | Even a fully compromised desk can't exceed your per-trade or daily limits or sign anything you didn't hold-confirm. | Yes: Ed25519 is cheap on the S3. Production key protection needs flash encryption (#8). |
| 3 | Device attestation | The desk and phone verify a genuine xorrpad (factory cert chain). It stops clones and fake firmware. | Yes in software; stronger with a secure element (hardware rev). |
| 4 | Abilities SDK on the device (WASM) | An ecosystem: anyone can write abilities (TFT widgets, key macros, local alerts) in a sandbox with **no** signing access. | Yes: wasm3 runs on ESP32-S3 with PSRAM. |
| 5 | Offline market alerts | The pad still watches prices and alerts (TFT, LED, chime) when the desk is off. It never trades offline. | Yes: Wi-Fi with HTTPS to the Jupiter Price API / Pyth Hermes. |
| 6 | Multi-pad co-sign (crew desk) | Big trades need 2-of-N pads to approve, like a team or treasury desk. | Yes: the device keys sign approvals and the desk coordinates. |
| 7 | OTA channels, staged rollout, delta updates | Stable and beta channels, a percentage rollout, and smaller downloads over BLE. | Yes: the desk manifest plus a delta patcher (janpatch-style). |
| 8 | Hardware rev 2 research | A secure element, a haptic smart knob, a battery, USB-C PD, and a bill of materials at 1k units, for manufacturing. | Research doc only. |

## Build (P0 = items 1–3, then 4–7, and 8 is documents only)

1. **Clear signing.**
   - Parse Solana legacy and v0 messages on the pad: header, account keys, recent blockhash, instructions and address-table lookups (shown as "lookup table: N accounts", resolved by the desk and **verified** against the lookup-table data that the desk must also send).
   - Decoders: System transfer, SPL Token / Token-2022 transfer and transferChecked, ComputeBudget, the pm-AMM swap (from its IDL), Jupiter v6 route (input and output mint plus amounts from the instruction data), and Phoenix place-order (side, size, limit price).
   - Show the decoded result on the TFT. The fingerprint is the first 6 base58 characters of SHA-256 over the message bytes.
   - An unknown program or instruction gives a **"Blind sign"** red screen. That needs an extra 3 s hold, and is allowed only when the desk has "allow blind signing" turned on, which is off by default.
   - Native tests use real devnet transaction bytes captured from the v1 builders. Save them as fixtures produced by a script that calls the real builders; never hand-written bytes.
2. **On-pad session signing.**
   - The session key is generated on the pad, or imported once over the encrypted link, and kept in NVS (encrypted NVS when flash encryption is on). The public key is shown on the desk.
   - The pad signs only after these checks:
     - clear signing passed, or blind signing was explicitly allowed;
     - the caps in pad NVS pass: per trade, per day (with a rolling counter that survives reboot), a max leverage parsed from the Phoenix instruction, and a venue/program allowlist;
     - hold-to-confirm, or an auto-accept policy *stored on the pad* that matches.
   - The desk's executor gains a "pad signer" mode next to the phone-wallet and session-wallet modes.
3. **Attestation.**
   - Factory provisioning writes a device certificate: the device's Ed25519 public key plus serial number plus model, signed by an xorr factory key.
   - The factory key is generated offline by `firmware/factory-keygen.sh` outside the repo and gitignored; never commit it.
   - On connect, the pad signs a challenge. The desk and the XOR app verify the chain and show "Genuine xorrpad #serial", or a red "Unverified device".
4. **Abilities SDK.**
   - Embed wasm3. An ability is a `.wasm` with a manifest that lists its capabilities: `tft.widget`, `keys.macro`, `alerts.price`, `audio.chime`.
   - **No capability exists for signing or for the link's trade frames.**
   - Limits: memory and CPU (instruction-count fuel), with a watchdog kill.
   - Abilities are installed from the desktop's Abilities screen (v2 desktop), signed by the developer key and verified.
   - `sdk/abilities/` gets a C and an AssemblyScript template, and two sample abilities: a "Market Pulse" widget and a "Pomodoro discipline" timer.
5. **Offline alerts.**
   - When the desk link is down but Wi-Fi is up, the pad polls the Jupiter Price API or Pyth Hermes (HTTPS, pinned roots in `certs.h`) at no faster than 30 s.
   - It fires the price alerts that were set from the desk. The TFT shows "Desk offline · alerts only · nothing will trade".
6. **Multi-pad co-sign.**
   - A desk policy says that trades above $X need approvals from N pads in the crew.
   - Each pad shows the clear-signed trade and signs an approval (its device key over the message hash).
   - The desk collects the approvals before signing or sending, and shows who approved.
   - The padsim runs two simulated pads in tests.
7. **OTA channels.**
   - The manifest gains `channel` (stable or beta), a rollout percentage (hash of deviceId mod 100), and an optional delta patch from the previous version, verified by both the patch signature and the final image signature.
   - Pads opt into beta from the desk.
8. **`firmware/HARDWARE-REV2.md`.** Research with real part numbers and real distributor price links, no guesses:
   - a secure element, ATECC608B against NXP SE050;
   - a haptic smart knob, BLDC plus a magnetic encoder;
   - an optional battery with charging;
   - USB-C PD;
   - enclosure DFM notes;
   - a BOM at 1k units;
   - FCC and CE paths for the radio, noting the ESP32-S3 pre-certified modules.

## Done means
- Native tests: at least 120 in total with v2, all passing, including real transaction fixtures and real Ed25519 vectors.
- Both build configurations compile; record the sizes.
- The padsim covers:
  - clear sign → pad sign → devnet broadcast, when the session key is funded; otherwise BLOCKED, with the exact public key to fund;
  - blind-sign refusal;
  - a cap breach refusal across a reboot;
  - the attestation pass and fail;
  - a WASM ability sandbox escape attempt being refused;
  - a 2-of-2 co-sign.
- Write `firmware/V3-NOTES.md`, with what is proven and what still needs real hardware. Add a CHANGELOG entry `firmware 3.0.0`.
- Commit per feature. **NEVER push.** Report in under 15 lines.
