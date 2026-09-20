#pragma once
// ─────────────────────────────────────────────────────────────────────────────
// Board + wiring for the ESP32-S3 macropad. Only fixed hardware facts live here;
// WiFi and the backend address are provisioned at runtime through the captive
// portal (see provision.h) and kept in NVS (see settings.h) — no recompile to
// change networks. (No potentiometer on this build; the dial code is gone.)
// ─────────────────────────────────────────────────────────────────────────────

// ---- 4×4 matrix ----
#define MATRIX_ROWS 4
#define MATRIX_COLS 4
static const uint8_t ROW_PINS[MATRIX_ROWS] = {10, 11, 12, 13};
static const uint8_t COL_PINS[MATRIX_COLS] = {18, 17, 8, 14};  // columns reversed to match the wiring

// ---- Mic: INMP441 (I2S RX) ----   VDD→3V3, GND→GND, L/R→GND
#define MIC_SCK 5
#define MIC_WS  4
#define MIC_SD  6

// ---- Amp: MAX98357A (I2S TX) ----  Vin→3V3, SD→3V3 (enable), GND→GND
#define SPK_BCLK 15
#define SPK_LRC  16
#define SPK_DIN  7

// ---- Audio: the one format the whole system speaks ----
#define AUDIO_SAMPLE_RATE 16000     // 16 kHz, 16-bit, mono — matches the backend
#define REC_SECONDS_MAX   12        // hold-to-talk ceiling; sizes the PSRAM buffer

// ---- The push-to-talk key (row/col). Also the "reset provisioning" key: hold
//      it while powering on to wipe saved WiFi and re-open the portal. ----
#define TALK_ROW 0
#define TALK_COL 2                  // mic key's RAW matrix position (K13, mirrored → row0/col2)

// ---- Backend URL default (editable in the captive portal, saved to NVS) ----
// LAN:    http://<your-mac-ip>:8080            (the xorr-pad desk backend)
// Remote: https://<machine>.<tailnet>.ts.net   (Tailscale Funnel — needs a token)
#define DEFAULT_BACKEND_URL "http://192.168.1.100:8080"

// ---- Telnet debug console: fixed port (not in the portal — it's not the
//      backend, just a log/command line you reach with `telnet <pad-ip>`). ----
#define TELNET_PORT 23

// ---- Captive-portal access point shown during provisioning ----
#define PORTAL_AP_NAME "xorr-pad-setup"
#define PORTAL_AP_PASS ""           // "" = open AP; set 8+ chars for a locked one

// ---- Onboard status LED: WS2812 addressable RGB on GPIO 48 ----
#define STATUS_LED 48

// ---- Hands-free telnet `talk` test: record this many ms then send ----
#define TELNET_TALK_MS 4000

// ---- How often the pad asks the backend what is true (ms). One cheap GET.
#define PAD_POLL_MS 1000

// ---- The kill key is HELD, not tapped. A brush against a key that stops all
//      trading is not acceptable, so it needs a deliberate hold. ----
#define HOLD_TO_KILL_MS 600

// ---- Display pod: 2.8" ILI9341 320x240 on SPI — LCDwiki MSP2807, laid landscape
//      with its header on the right (cad/part_display.py). Eight wires: VCC -> 3V3,
//      GND -> GND and the pins below; SDO and the touch pins (T_*) stay unconnected.
//      Free pins only — 35-37 are the octal PSRAM, 19/20 USB, 43/44 UART0,
//      0/3/45/46 strapping.
#define TFT_SCK       39            // module pin SCK
#define TFT_MOSI      40            // module pin SDI(MOSI)
#define TFT_DC        41            // module pin DC
#define TFT_RST       42            // module pin RESET
#define TFT_CS        1             // module pin CS
#define TFT_BLK       2             // module pin LED (high = lit); -1 if LED is tied to 3V3
#define TFT_ROTATION  1             // landscape; 3 if it reads upside down (try `rot 3` on telnet)
#define TFT_SPI_HZ    20000000      // 20 MHz — safe over dupont leads
#define CHART_POLL_MS 60000         // the chart is hourly candles; once a minute is plenty
