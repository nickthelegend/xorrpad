# T4: pad link protocol and firmware v1.0.0

Read `docs/v1/SPEC.md` first, then `firmware/README.md` and every file in `firmware/xorrpad`.

1. **Protocol.** Write `docs/v1/PAD-PROTOCOL.md`: newline-delimited JSON, versioned `{"v":1,...}`.
   - Messages: hello/caps, keymap push, key event, knob event, a signal (pending trade, shown on the TFT with ✓/✗), signal state, receipt, a voice chunk (base64 PCM, 16 kHz), TTS audio chunk, status (armed, link, venue), ping.
   - One protocol over three transports: USB-CDC serial, BLE GATT (Nordic-UART-style service, MTU-aware chunking) and Wi-Fi HTTP/WS (the existing backend path).
2. **Desk side.** Add `desk/main/padlink.mjs`:
   - It finds the pad on USB serial (the `serialport` npm package), on BLE (via the phone app or `@abandonware/noble` on the Mac when available), or on Wi-Fi.
   - It bridges messages to `/events` and the signals queue.
   - It pushes the programmable keymap from the desk.
3. **Firmware v1.0.0.** All existing behaviour stays. Add:
   - a link manager that prefers USB, then BLE, then Wi-Fi;
   - a BLE GATT service using NimBLE-Arduino;
   - USB-CDC JSON;
   - the keymap stored in NVS and pushed from the desk; each key gets an action id plus a label drawn on the TFT;
   - a pending-signal screen with a countdown; ✓ accepts, ✗ refuses;
   - an AUTO badge when auto-accept is on; a receipt screen;
   - mic streaming to the desk and TTS playback on the amp;
   - `XORR_FW_VERSION "1.0.0"`, shown on boot and reported in hello.
   - Wi-Fi provisioning: keep the captive portal.
   - Tailscale: the Mac mini or desk is on the tailnet and the pad reaches it over the LAN or USB. Document honestly that the ESP32 does not join the tailnet itself in v1.
4. **Compile.** `arduino-cli compile --fqbn <esp32s3 fqbn> firmware/xorrpad` must pass. Install the core and libraries with `arduino-cli` if they are missing. Put the build size and the command in `firmware/README.md`.
5. **Pad simulator.** Add `tools/padsim/`, a Node program speaking the exact protocol over a pseudo-terminal or TCP. Tests drive the desk's `padlink` end to end:
   - key → signal → accept → receipt;
   - keymap push;
   - a voice chunk path that delivers chunks to the voice module, which returns `Setup required` without a key.
6. **Labelling.** In `TESTING.md`, mark the firmware "compiled, not yet flashed" until Nick flashes it.

Make one commit per step.
