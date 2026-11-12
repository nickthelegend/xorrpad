# v2 P2 research — no implementation

Research checked 2026-11-12. Neither WakeNet nor LVGL was added to the build.

## “hey xorr” with ESP-SR WakeNet

ESP32-S3 supports WakeNet, but “hey xorr” needs a custom trained model rather than
a string setting. Espressif offers TTS-only training, crowdsourced speech plus
TTS, or a customer corpus. Its S3 documentation describes a one-time fee and no
per-device/time license fee; **no public price is quoted**. Obtain a written quote
and model/license terms before budgeting. Customer-corpus training requires at
least 20,000 qualified recordings; training/optimization is normally 2–3 weeks
after the corpus is ready. TTS-only avoids collecting a corpus, with accuracy to
be measured in the enclosure. Source: [S3 customization process](https://docs.espressif.com/projects/esp-sr/en/latest/esp32s3/wake_word_engine/ESP_Wake_Words_Customization.html).

Our assessment: feasible, but “xorr” pronunciation and a short two-word trigger
need false-accept and missed-trigger trials across accents, desk noise and the
pad's own speaker. Espressif describes typical wake words as 3–6 symbols;
confirm the proposed pronunciation with the vendor before ordering a model.
A wake detection may start listening only; it must never
confirm a trade. Keep physical push-to-talk for the release.

Engineering estimate, not a vendor quote: 1–2 weeks to integrate and measure a
provided model, plus corpus/vendor lead time and a separate user trial. Measure
PSRAM, internal heap, I2S task timing, BLE/Opus contention and power before
choosing a model. USB power removes the battery constraint; it does not remove
compute or acoustic echo costs. No model footprint or accuracy is claimed here.

## LVGL migration

LVGL supplies widgets, scrolling, focus/input groups, theme/style management and
partial rendering. Its display port requires a flush callback, rendering mode,
buffers and flush-completion notification. Two buffers can overlap drawing and
transfer when the driver supports asynchronous flushing. Source: [LVGL display setup](https://docs.lvgl.io/9.4/details/main-modules/display/setup.html).

Our current renderer already has two PSRAM RGB565 sprites and an ILI9341 SPI
adapter. Two full 320×240×2 buffers occupy **307,200 bytes** before object/font
storage. At 20 MHz SPI, transmitting 153,600 bytes takes at least **61.44 ms**
before command/driver overhead; migrating libraries does not remove that limit.
Partial invalidation could improve sparse updates. Full-screen animation would
still need measurement and possibly a faster verified SPI clock or DMA path.

Assessment: useful once rich scrolling, localization or more on-device settings
outgrow the small custom renderer. For this release, replacing trusted-display
layouts and their host previews adds regression risk without a necessary user
capability. Keep the existing renderer.

Engineering estimate: 1 week for a display/input prototype, 1–2 weeks for all
screens, fonts/themes and host screenshots, then at least 1 week of board
regression tests. These are planning estimates, not measured implementation
costs. Re-evaluate against flash size, frame latency, focus accessibility,
PSRAM/internal-DMA allocation and code ownership on a separate branch.
