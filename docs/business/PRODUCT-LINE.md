# xorrpad product line

Decision proposal for Nick, 2026-11-12. Quantities and features below are design choices from the [brief](BRIEF.md), not claims of a manufactured product. The current hardware is a hand-wired prototype; the production board is an unreviewed [engineering draft](../../hardware/README.md).

| Feature | xorrpad Core | xorrpad Pro |
| --- | --- | --- |
| Customer | Desk-first Solana trader who already uses a headset and a phone | Trader who wants a dedicated glanceable display and push-to-talk device |
| Keys | 14 MX switches in genuine Kailh hot-swap sockets | Same |
| Knob | EC11 rotary encoder with push | Same |
| Feedback | Per-key addressable RGB; desk and phone show the proposal | 2.8-inch ILI9341 bare FPC display plus status RGB |
| Microphone | Omit | I2S microphone; production replacement qualification required |
| Amplifier / speaker | Omit both | MAX98357A plus a vendor-terminated speaker harness |
| Voice | Desk / phone microphone and audio | Hold-to-talk on the pad; audio returned to its speaker |
| Controller | ESP32-S3-WROOM-1-N16R8 | Same |
| Power | USB-C; no battery | Same |
| Connectivity | USB, BLE and Wi-Fi, subject to firmware and certification validation | Same |
| Trading flow | Proposal → permissions gate → explicit accept/refuse → wallet review/signing, or the explicitly enabled capped session wallet | Same; the TFT also shows the proposal and receipt |
| Signing security | The pad is a controller, not a private-key vault or trusted wallet display | Same; do not market its screen as a hardware-wallet secure display |

Core drops the mic, amp and speaker. It avoids an audio-port gasket, speaker harness, acoustic tests and the current microphone lifecycle problem. Keeping audio would reduce the meaningful distinction between SKUs and retain expensive factory checks. Voice remains available through the existing host/phone workflow; Core is a new SKU proposal, not removal of an existing Pro feature. Core's MIC key invokes host voice, and refusal must work even when that host audio is unavailable.

Pro per-key RGB is an **optional later population variant**, not a third launch SKU. Reserve the same LED chain footprints; quote its added LEDs, capacitors, power switching, diffuser caps and test work separately. Do not sell the upgrade until firmware can enforce the USB power budget. Base Pro has only its status LED; Core has 14 per-key LEDs and a separate status LED in the draft.

Keep the N16R8: the prototype expects 16 MB flash and octal PSRAM. N8R8 is not an automatic drop-in procurement substitution: its smaller flash needs partition/OTA sizing and recovery tests. GPIO35–37 are unavailable on the octal-PSRAM variant; the draft avoids them. See [Espressif module datasheet](https://www.espressif.com/sites/default/files/documentation/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf), read 2026-11-12; [firmware configuration](../../firmware/xorrpad/config.h).

All electrical assembly is outsourced, including sockets, encoder, USB connector, display connector and speaker cable termination. Our final assembly is plugging in, pressing switches and caps, closing, flashing and testing. No soldering iron belongs in that station. Both SKUs need completed PCB, mechanical, firmware and regulatory validation before a paid delivery promise. Existing desk UI layouts are unchanged.
