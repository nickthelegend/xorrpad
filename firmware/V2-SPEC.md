# xorrpad firmware v2.0.0: the product-grade firmware

v1.0.0 compiles and covers the basics:
- links over USB-CDC, BLE and Wi-Fi;
- a programmable keymap;
- a signal screen;
- mic and TTS audio.

v2 makes it a device that can be sold. Its four aims:
- it is safe to trust with money;
- it updates itself safely;
- it survives bad networks;
- it can be manufactured and tested in bulk.

**Remove nothing that v1 does. Commit locally only. NEVER push.**

## Hardware (from `config.h`)
ESP32-S3 with 16 MB flash and OPI PSRAM, and these parts:
- **Keys:** a 14-key matrix plus a rotary knob with a press.
- **Mic:** INMP441 on I2S RX.
- **Amp:** MAX98357A on I2S TX.
- **Display:** a 2.8" ILI9341 320×240 TFT on SPI, with backlight on `TFT_BLK`.
- **Status LED:** one WS2812 on GPIO 48.
- **Power:** USB-C only, no battery.

## P0: required for the 9/10 bar

1. **Trusted display ("what you see is what you sign").**
   - Every signal shows on the TFT: venue, market, side, size, price and fee, plus a 6-character signal fingerprint (the first 6 base58 characters of SHA-256 over the canonical signal JSON).
   - The desk and the phone show the same fingerprint, so a tampered desk can't swap trades silently.
   - Above a threshold, set from the desk (default $100), ✓ becomes **hold-to-confirm**: 800 ms with a progress ring on the TFT and an LED sweep. Below it, a tap works.
   - ✗ refuses instantly.
2. **Secure pairing and an encrypted link.**
   - The device has an identity key: X25519 + Ed25519, generated on first boot and kept in NVS. The device ID comes from the eFuse MAC.
   - **Pairing:** the TFT shows a 6-digit code and a QR code. The QR holds `xorrpad://pair?id=<deviceId>&pk=<pubkey>&v=2` for the XOR app and the desk.
   - X25519 ECDH produces the session keys. Every frame is ChaCha20-Poly1305 with a sequence number, which gives replay protection.
   - The v1 static pad token remains a fallback only when the desk enables "legacy v1 link".
   - BLE uses LE Secure Connections with the passkey shown on the TFT.
3. **Robust link protocol v2.**
   - Framing: `{"v":2,"seq":n,"ack":m,...}` plus CRC32 on serial.
   - Ack and retry with backoff.
   - A heartbeat every 5 s, a link watchdog, and automatic reconnect with exponential backoff.
   - Transport failover USB → BLE → Wi-Fi without losing the pending-signal state.
   - **Key events are never queued into trades while offline.** Signals expire on the desk side, and the pad shows "offline: nothing will execute".
   - Backward compatible: the desk accepts v1 frames too.
4. **Signed OTA with rollback.**
   - Use A/B app partitions. The partition scheme stays 16 MB with two app slots.
   - Images are signed with Ed25519, and the public key is baked into the firmware. An unsigned or wrongly signed image is refused, with an error screen.
   - Updates arrive from the desk over USB, Wi-Fi or BLE (chunked), with progress on the TFT.
   - The new image boots in "pending verify" and marks itself valid only after a health check: display up, keys scanned, link handshake within 60 s. Otherwise it rolls back automatically (`esp_ota_mark_app_valid_cancel_rollback`).
   - `firmware/build.sh` produces:
     - the merged factory bin;
     - the app bin;
     - its sha256;
     - an Ed25519 signature, with the signing key read from a path in an env var. Never commit a key; add a `keygen` script that writes outside the repo and is gitignored;
     - a `manifest.json` with version, sha256, signature, min desk version and notes.

     The desktop's Connect screen reads that manifest.
5. **Kill switch latch.** Holding KILL for 2 s:
   - disarms everything;
   - sends a kill frame;
   - turns the LED solid red;
   - latches it in NVS, so it survives a reboot.

   Re-arming needs the desk plus a hold-to-confirm on the pad. It works offline: the pad refuses to show signals while killed.
6. **On-device profiles and layers.**
   - Up to 8 profiles synced from the desk (Scalper, Swing, Predictor, custom), stored in NVS, switched by a layer key or from the desk.
   - Layers per profile: Spot, Perps and Predict.
   - **Knob:** rotate changes size with an acceleration curve; press cycles size → leverage → slippage; a long press is the voice push-to-talk alternative.
   - The TFT shows the active profile and layer in a status strip.
7. **Voice that fits BLE.**
   - Push-to-talk, with an energy VAD and a noise gate.
   - Opus encoding at 16 kHz mono, about 24 kbps, using an ESP32 Opus library. 16 kHz PCM at 256 kbps does not fit BLE.
   - Opus decode for TTS playback, plus a PCM fallback over USB and Wi-Fi.
   - A live waveform on the TFT while listening.
   - Chimes: accept, refuse, fill, error, kill.
   - Volume is set with the knob in the Voice layer.
8. **Health, telemetry and crash reports.**
   - A task watchdog (`esp_task_wdt`), brownout handling, and a reset-reason log.
   - A core dump to flash, uploaded to the desk on the next connect.
   - A telemetry frame every 30 s: uptime, heap, PSRAM, RSSI, temperature (internal sensor), link and firmware version.
9. **Manufacturing and self-test.**
   - **Factory mode:** hold `01`+`14` at boot. It runs:
     - a key matrix test, where every key must be pressed;
     - a knob turn and press test;
     - a mic level meter;
     - a speaker tone sweep;
     - TFT colour bars and a dead-pixel grid;
     - LED RGB;
     - a Wi-Fi scan and BLE advertising.

     It reports a signed JSON result to the desk or serial.
   - `firmware/factory.sh` flashes the merged bin with esptool and runs the test over serial. It prints PASS/FAIL per unit, with the serial number.
   - Factory reset: hold `01`+`13` for 10 s with a countdown. It wipes NVS, pairing and Wi-Fi.
10. **Release hardening.**
    - Build flags `XORR_RELEASE=1`: no telnet console, no verbose logs, the USB debug console only behind a desk-enabled flag.
    - Document secure boot v2 and flash encryption for production in `firmware/PRODUCTION.md`, with a loud warning that both are irreversible. **Do not enable or run them.**
11. **Native unit tests for the firmware logic.** Move the pure logic into header-only or plain C++ modules with no Arduino calls:
    - protocol framing / CRC / sequence-ack;
    - the signal state machine;
    - the fingerprint;
    - the hold-to-confirm timer;
    - keymap and profile serialization;
    - the knob acceleration;
    - the kill latch;
    - OTA manifest parsing and signature verify, with a real Ed25519 test vector.

    Test them with doctest (vendored single header) using the Mac's clang: `firmware/test/run.sh`. Target at least 60 tests, all real logic, no mocks of the hardware APIs. Hardware calls stay in thin adapters.

## P1: polish
- **TFT UI:** use sprite double-buffering in PSRAM, so nothing flickers. The screens:
  - Market Pulse ticker (live price of the active market and 24h change);
  - positions with PnL;
  - signal (trusted display);
  - receipt with the explorer short sig;
  - listening waveform;
  - agent reply with scroll;
  - OTA progress;
  - kill;
  - pairing QR;
  - error screens with codes and a one-line fix.

  Use the xorr.finance palette: night `#030304`, ink `#f3f0e8`, lime `#c8f53c`, mint `#0dd87e`, cobalt `#2f5bff`, lavender `#b7a6ff`, converted to RGB565.
- **Idle:** dim after 2 min and blank after 10, waking on a key or knob. Desk-set brightness and a night mode.
- **Accessibility:** a high-contrast theme, a mode that speaks amounts aloud on confirm, and a left-handed key flip.
- **Status LED language:** idle breathing in cobalt, pending signal pulsing lime, a fill flashing mint, an error in amber, killed in solid red.

## P2: research only. Write the findings in `firmware/RESEARCH.md`; don't build these.
- An on-device wake word ("hey xorr") with ESP-SR WakeNet: is a custom word feasible, and at what cost?
- An LVGL migration: cost against benefit.

## Desk side (the same branch)
- `desk/main/padlink.mjs`: v2 handshake, pairing, encryption, ack/retry, telemetry and crash-dump intake, plus the OTA sender with the manifest check. v1 compatibility is kept.
- `tools/padsim`: speaks v2. Its end-to-end tests cover:
  - pairing → encrypted signal → fingerprint match → hold-confirm → receipt;
  - OTA with a good signature and with a bad one;
  - the kill latch across a simulated reboot;
  - a replayed frame being rejected.
- Add a short `docs/v2/FIRMWARE-PROTOCOL-V2.md`.

## Done means
- `arduino-cli compile` passes, for both the normal build and `XORR_RELEASE=1`. Record the sizes.
- `firmware/test/run.sh` and the desk tests all pass.
- `TESTING.md` gets a firmware v2 section. The firmware is labelled "compiled, not yet flashed" until Nick flashes it.
- Firmware version `2.0.0`. Add a CHANGELOG entry `firmware 2.0.0`.
- Commit per feature. **NEVER push.** Report in under 15 lines.
