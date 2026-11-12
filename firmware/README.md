# xorr-pad — firmware

ESP32-S3 firmware for the trading pad. Take a market in hand, propose a trade,
confirm it with a physical ✓ — or hold the mic key and say it out loud. Wi-Fi
and the backend address are set once through a captive portal and remembered in
flash; **no recompile to change networks**.

Sketch: [`xorrpad/xorrpad.ino`](xorrpad/xorrpad.ino).

> **The pad holds no wallet key.** BUY and SELL raise a decision; manual ✓ or
> explicitly enabled desk auto-accept can advance it through the same memory and
> permissions gate. The desk executor uses the phone wallet by default, or an
> opted-in capped session wallet. The firmware asks the backend about limits,
> positions and armed state; it does not authorize signing itself.

## What it does

1. **Provision** — first boot (or hold the reset key at power-on) raises an
   access point, **`xorr-pad-setup`**. Join it; a captive page lists nearby
   networks and asks for the **backend URL** and a **pad token**. The URL is
   validated before it is saved — a pad that cheerfully stores `192.168.1.5`
   with no scheme boots into a state where nothing works and the portal has
   already closed.
2. **Connect** — it starts a telnet console, polls `GET /pad`, and speaks
   something true through the amp: whether it is armed, what is in hand, and
   whether the store has been wiped.
3. **Run** — keys drive the same backend the desk app drives. The status light
   is the backend's state, not the firmware's guess.

## The deck

```
  MOMENTUM   RISK       YIELD      DCA          ← who holds the baton
  ETH        cbBTC      AERO       VIRTUAL      ← what is in hand
  BUY        SELL       SCAN       PORTFOLIO    ← propose / run the book
  ✓ CONFIRM  ✗ REFUSE   MIC        KILL         ← answer / speak / stop
```

Every id is exactly what `POST /key` accepts. There is no translation table: if
an id is not real, the backend says so and the pad speaks the refusal.

**KILL is held, not tapped** — 2 seconds; it latches locally in NVS, even offline. A brush against the key that stops all
trading is not acceptable.

**MIC is hold-to-talk.** The recording goes to `POST /voice` as raw 16 kHz mono
PCM; the spoken reply streams straight back to the amp. A spoken order lands as
a decision waiting on a ✓, exactly like a key press.

## The status light

| State | Light |
|---|---|
| Backend unreachable | dark blue, pulsing — the pad is alone |
| Trading stopped | hard red, steady |
| A decision waits on a ✓ | amber, breathing |
| Memory wiped | white, breathing — it will refuse anything but the smallest trade |
| Armed | the agent's own colour, dim and steady |

The order matters: the most dangerous state wins the light.

## Hardware & wiring

ESP32-S3-DevKitC-1 (**N16R8** — 16 MB flash / 8 MB PSRAM). No pot, no diodes.

<div align="center">
<img src="../docs/images/circuit.png" alt="xorr-pad wiring diagram — 4×4 key matrix, INMP441 mic, MAX98357A amp + speaker, on an ESP32-S3-WROOM-1" width="920">
</div>

The full wiring at a glance: the 4×4 matrix (rows `G10–G13`, columns
`G14/G8/G17/G18`) and the INMP441 mic and MAX98357A amp on I2S. The tables below
are the same thing, cell by cell — all grounds are common.

**Mic — INMP441 (I2S RX):** `VDD→3V3`, `GND→GND`, `L/R→GND`

| INMP441 | SCK | WS | SD |
|---|---|---|---|
| GPIO | **5** | **4** | **6** |

**Amp — MAX98357A (I2S TX):** `Vin→3V3`, `GND→GND`, `SD→3V3` (leave SD high to enable)

| MAX98357A | BCLK | LRC | DIN |
|---|---|---|---|
| GPIO | **15** | **16** | **7** |

**4×4 key matrix** (rows are `INPUT_PULLUP`, columns driven low one at a time —
no diodes needed):

| | Col0 | Col1 | Col2 | Col3 |
|---|---|---|---|---|
| **Rows →** | GPIO 14 | GPIO 8 | GPIO 17 | GPIO 18 |
| Row0 · GPIO 10 | **K1 mic** | K2 | K3 | — |
| Row1 · GPIO 11 | K4 | K5 | K6 | K7 |
| Row2 · GPIO 12 | K8 | K9 | K10 | K11 |
| Row3 · GPIO 13 | K12 | K13 | K14 | — |

**Status LED:** onboard WS2812 on **GPIO 48**.

**Display pod (optional):** a 2.8" ILI9341 320×240 SPI screen (LCDwiki MSP2807),
laid landscape, showing the market in hand — price, 24h move and a 48-hour chart
from `GET /pad/chart`. The enclosure is `exports/display-pod-28.stl` and
`exports/display-cap-28.stl` (`cad/part_display.py`); the print plate is
`exports/print/display-plate-28.3mf`. Touch is not used.

| Module pin | VCC | GND | CS | RESET | DC | SDI(MOSI) | SCK | LED |
|---|---|---|---|---|---|---|---|---|
| Goes to | 3V3 | GND | GPIO **1** | GPIO **42** | GPIO **41** | GPIO **40** | GPIO **39** | GPIO **2** |

Leave SDO(MISO) and the five touch pins (T_CLK, T_CS, T_DIN, T_DO, T_IRQ)
unconnected. At power-on the screen shows a test card — colour bars and an arrow
that should point up the slant. If it points down, type `rot 3` on the telnet
console to check, then set `TFT_ROTATION 3` in `config.h`; `screen` reports what
the display last drew. These pins avoid the octal PSRAM (35–37), USB (19/20),
UART0 (43/44) and the strapping pins (0, 3, 45, 46).

**2.4" UNO shield:** the pod fits it (`exports/display-pod-24.stl`), but this
firmware does not drive it. That shield is an **8-bit parallel** display — 12
pins for the LCD alone, and its resistive touch shares four of them — while the
pad's ESP32-S3 has 10 free. The SPI version of the same 2.4" ILI9341 panel (with
XPT2046 touch) fits the pin budget; the pod is parametric (`MODULES` in
`cad/part_display.py`), so another board is a few numbers.

All pins live in [`xorrpad/config.h`](xorrpad/config.h) — change
them there if your wiring differs.

The 12-second record buffer is 384 KB and **lives in PSRAM**, so PSRAM must be
enabled at build time. It is off in the default board config.

## Building

### From the command line

```bash
arduino-cli core install esp32:esp32
arduino-cli lib install WiFiManager
arduino-cli lib install "Adafruit ILI9341"
arduino-cli lib install "ArduinoJson@7.4.3"
arduino-cli lib install "NimBLE-Arduino@2.5.0"

arduino-cli compile \
  --fqbn esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc \
  firmware/xorrpad
```

**Those board options are not optional.** The bare `esp32:esp32:esp32s3`
default has a smaller app partition and PSRAM disabled. The v1 BLE/TLS build
requires the selected 3 MB app partition, and the recording buffer needs OPI
PSRAM. Native USB protocol input needs `CDCOnBoot=cdc`. See the measured v1
build size below; device audio still needs hardware verification.

To flash, add `--port <the pad's port>` and `upload` in place of `compile` —
`/dev/cu.usbserial-*` on the board's UART USB-C, where the Serial log also
comes out. Plugged into its native USB-C instead (`/dev/cu.usbmodem*`), add
`,CDCOnBoot=cdc` to the FQBN to get the log there. With more than one ESP32
connected, check the port is the pad's before uploading.

### From the Arduino IDE

**Libraries** (Library Manager):

- **WiFiManager** by *tzapu* — the captive portal.
- **Adafruit ILI9341** (pulls in Adafruit GFX) — the display pod.
- `ESP_I2S`, `WiFi`, `HTTPClient`, `Preferences` ship with the **arduino-esp32
  core 3.x** — nothing to install, but you do need core 3.x (Boards Manager →
  "esp32" by Espressif, ≥ 3.0).

**Board settings** (Tools menu) — the three starred ones are the same
constraints as the FQBN above:

- Board: **ESP32S3 Dev Module**
- ⭐ **PSRAM: `OPI PSRAM`** — the record buffer is `ps_malloc`'d; without this it
  fails to allocate and the mic won't record.
- ⭐ **USB CDC On Boot: `Enabled`** — so the Serial monitor works over USB-C.
- ⭐ **Partition Scheme: `Huge APP (3MB No OTA/1MB SPIFFS)`** — the TLS stack
  pushes the build to ~90 % of the *default* app partition (it fits, but
  barely). Huge APP drops it to ~38 %. Flash Size: `16MB`.

**Steps:**

1. Open [`xorrpad/xorrpad.ino`](xorrpad/xorrpad.ino).
2. Install WiFiManager, set the board options above, pick the port, **Upload**.
3. First boot: join the **`xorr-pad-setup`** Wi-Fi from your phone. If the portal
   doesn't pop up, browse to `http://192.168.4.1`.
4. Pick your Wi-Fi, enter the **backend URL** and **pad token** (below), save.
5. It joins, says what state the desk is in, and you're ready: **take a market,
   press BUY, confirm with ✓** — or hold **K1** and say it.

### Backend URL & token

One field decides where — and how — the pad reaches the backend; the **scheme
picks the transport**:

| You're… | Enter | Token |
|---|---|---|
| on the same Wi-Fi as the Mac | `http://<mac-lan-ip>:8710` (e.g. `http://192.168.1.20:8710`) | matching backend token required |
| anywhere / the pad moves around | `https://<machine>.<tailnet>.ts.net` (Tailscale Funnel) | **required** — Funnel is public |

- **`http://…`** → plain connection. Use the Mac's **LAN IP**, *not* its
  `tailscale ip` (`100.x`) — a bare ESP32 can't route to a tailnet address.
- **`https://…ts.net`** → TLS, with the Let's Encrypt root pinned (the pad
  verifies the cert, so the token can't be MITM'd). Set the same `PAD_TOKEN` on
  the backend, which lives in [`desk/`](../desk).

A URL that cannot work is refused at the portal rather than saved — see
`Provision::validUrl`. Change either later without reflashing: `reset-wifi` over
telnet (or hold **K1** at power-on) re-opens the portal.

## Telnet console

The S3's USB-CDC serial can be flaky, so the pad mirrors its logs to a telnet
server and takes commands back — no cable needed:

```
telnet <pad-ip>
```

| Command | What it does |
|---|---|
| `status` | Wi-Fi, heap, backend, and the pad's view of the backend |
| `pad` | one raw `GET /pad` poll, printed |
| `map` | the key map as currently compiled |
| `key <id>` | press any key id by hand — the same route the caps use |
| `say <text>` | speak a line through the amp |
| `talk` | hands-free record for 4 s and send |
| `url <u>` / `token <t>` | repoint the backend without re-provisioning Wi-Fi |
| `reset-wifi` | forget the network and reopen the portal |

`say hello` and `talk` are the fastest way to prove the audio path end to end.

## Mapping a scrambled matrix

[`keytest/`](keytest) is a standalone sketch — flash it *instead of* the main
firmware. It has two modes over the serial monitor at 115200 baud:

- **MAP** names a key, you press it, and it records which matrix cell actually
  fired (`s` skips a dead one). At the end it prints a ready-to-paste `KEYMAP`,
  so a scrambled or half-broken wiring job is fixed in software rather than
  re-soldered.
- **DIAG** is free-press: every press prints its cell, and a grid shows which
  cells have ever fired (`*`) versus never (`.`). This is how you find a dead
  switch.

## Troubleshooting

| Symptom | Fix |
|---|---|
| No serial output | Set **USB CDC On Boot: Enabled**, re-upload |
| "PSRAM alloc failed" in the log | Set **PSRAM: OPI PSRAM** (or `PSRAM=opi` in the FQBN) |
| "backend not reachable" | Backend running? Right URL? On `http://`, use the Mac's **LAN IP** not `100.x`. Fix with `url <u>` or `reset-wifi` |
| Works on LAN, fails on the `ts.net` URL | Is `tailscale funnel` running? Does `PAD_TOKEN` match on both sides? (a 401 means the token's wrong/blank) |
| Portal never opens | Forget/rejoin `xorr-pad-setup`, or browse to `192.168.4.1` |
| Portal won't take my URL | It needs a scheme: `http://192.168.1.20:8710`, not `192.168.1.20` |
| Amp silent | Check `DIN/BCLK/LRC` wiring and that the amp's **SD pin is tied to 3V3** |
| Mic captures nothing | Check `SCK/WS/SD`, and tie the INMP441 **L/R pin to GND** |
| Keys wrong / swapped | Flash `keytest`, run MAP mode, paste the map it prints |

## What is verified, and what needs the board

Compiled and tested against the real backend on every run of
[`desk/test/verify.mjs`](../desk/test/verify.mjs) section P: the `/pad`
poll, `/speak`, the key ids, and the voice round trip.

The URL validator is unit-tested. The captive-portal markup is checked in a
browser.

**Not verifiable without hardware:** Wi-Fi provisioning on the device, I2S mic
capture, amp playback, matrix scanning, and NVS persistence across a power
cycle. Those are marked untested rather than assumed.


## v1.0.0 pad link

The [v1 protocol](../docs/v1/PAD-PROTOCOL.md) adds native USB-CDC JSON,
NimBLE Nordic UART BLE and authenticated Wi-Fi NDJSON at the existing backend
URL. The link manager prefers a responsive USB desk, then BLE, then Wi-Fi;
15 seconds without a valid desk message expires a link. Trade inputs are never
replayed on another transport after an uncertain result. Old HTTP key, voice,
chart, speech and telnet paths remain available with older backends.

The captive portal now runs without blocking the key scan or wired/BLE link.
It still saves Wi-Fi, backend URL and token through WiFiManager/Preferences.
The desk pushes a validated full 14-key map, saved in the `xorrkeys` NVS
namespace. The TFT shows programmed labels after a change and the pressed
label during use. MIC, KILL and yes/no retain their measured cells and hold
behavior. The existing board has no wired rotary encoder; knob records are
supported by the protocol and desk, not claimed as physical input.

Pending signals display the desk's proposal and relative expiry countdown,
with drawn green check/red cross controls. A check carries the displayed
signal id to the backend gate. AUTO reflects desk policy only. Confirmed
receipts show the real signature and explorer URL. No acknowledgment is drawn
as a confirmed fill. Firmware 1.0.0 appears on boot and in hello.

Mic audio streams as 16 kHz signed little-endian mono PCM chunks to `/voice`
through the desk bridge; ordered TTS PCM goes to the existing I2S amp. Legacy
raw-PCM HTTP voice remains available. Deepgram credentials stay on the desk;
a missing key reports `Setup required: DEEPGRAM_API_KEY`.

The **Mac mini/desk joins Tailscale; the ESP32 does not join the tailnet itself
in v1**. Reach the desk over USB or LAN, a LAN relay, or the existing pinned-TLS
Funnel URL. A bare ESP32 cannot route directly to `100.x` tailnet addresses.
BLE central support uses optional `@abandonware/noble` when available on the
Mac; the phone may relay the exact records to `/padlink`. This task does not
claim a tested phone app integration. BLE and USB are local trusted links;
backend token authentication remains required for Wi-Fi/phone relays.

Radio, flash persistence, display orientation, mic and amp behavior still need
the board. Compilation and software protocol tests cannot establish these.


## v1 compile evidence (2026-11-12)

Status: **compiled, not yet flashed**. No upload/flash command was run.

Exact command (Arduino CLI 1.5.1; ESP32 core 3.3.10):

```sh
arduino-cli compile --fqbn esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc firmware/xorrpad
```

Result: **1,476,455 / 3,145,728 bytes flash (46%)**;
**59,060 / 327,680 bytes static RAM (18%)**, leaving **268,620 bytes**.
Runtime PSRAM canvas/record allocations are additional to the static RAM count.
Dependencies: NimBLE-Arduino 2.5.0, ArduinoJson 7.4.3, WiFiManager 2.0.17,
Adafruit ILI9341 1.6.3, Adafruit GFX 1.12.6 and Adafruit BusIO 1.17.4.
The ESP32 3.x core supplies Wi-Fi, Preferences, HTTP/TLS and ESP_I2S.
NimBLE callbacks use the [2.x API](https://h2zero.github.io/NimBLE-Arduino/).

`make -C tools/uipreview shots` also compiles the real `ui.h` against Adafruit
GFX on the host and renders nine screen states, including v1 keymap and historical-receipt layouts. That is display
layout evidence, not hardware or trade-execution evidence.

## v2 working-tree compile evidence — S1 (2026-11-12)

Status: **compiled, not yet flashed**. These checks use the existing v2 device
work alongside the S1 desk changes; they do not complete hardware verification.
ESP32 core: **3.3.10**. From the repository root:

```sh
arduino-cli compile --fqbn 'esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc' --build-property 'compiler.cpp.extra_flags=-DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --build-property 'compiler.c.extra_flags=-DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --output-dir firmware/build/normal firmware/xorrpad
arduino-cli compile --fqbn 'esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc' --build-property 'compiler.cpp.extra_flags=-DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0 -DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --build-property 'compiler.c.extra_flags=-DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0 -DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --output-dir firmware/build/release firmware/xorrpad
```

Normal: **1,754,018 / 3,145,728 bytes** flash. Release:
**1,752,866 / 3,145,728 bytes** flash. Both use **65,084 / 327,680 bytes** static
RAM; runtime PSRAM allocations are additional. No flash, signing-key read,
secure-boot enablement or eFuse operation was performed during these checks.


## v2 S2 pairing and protocol verification (2026-11-12)

Status: **compiled, not yet flashed**. Use the exact FQBN and normal/release
commands in the S1 evidence section above, sequentially. Parallel normal/release
builds must use different `--build-path` directories; Arduino otherwise shares
the sketch cache and can mix compiler options. Crypto **0.4.0** is also required:
`arduino-cli lib install "Crypto@0.4.0"`. The ESP32 core supplies the QR generator.
Native tests use the same Crypto and ArduinoJson implementations via
`firmware/test/run.sh`; no hardware mocks are linked.

S2 pairs through the TFT QR/code, binds each handshake to a fresh consumed device
challenge, and uses directional X25519/ChaCha20-Poly1305 session keys. BLE requires
Secure Connections, authenticated encryption and the TFT passkey; notifications
start only after authentication. USB → BLE → Wi-Fi selection leaves signal state
in the sketch, discards prior transport output and rejects offline trade keys.
The legacy HTTP adapter remains available only after the paired desk enables it.

Final complete working-tree builds passed: normal **1,759,786 bytes flash**;
release **1,758,658 bytes flash**; both **65,252 bytes static RAM**. An isolated
staged S2 snapshot also compiled normally and in release mode at **1,523,927
bytes flash**, **63,012 bytes static RAM**. The final normal command avoided
shared-cache interference and kept temporary compiler files on the external SSD:

```sh
mkdir -p firmware/build/s2-tmp
env TMPDIR="$PWD/firmware/build/s2-tmp" arduino-cli compile --jobs 4 --build-path "$PWD/firmware/build/s2-normal" --output-dir firmware/build/normal --fqbn 'esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc' --build-property 'compiler.cpp.extra_flags=-DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --build-property 'compiler.c.extra_flags=-DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' firmware/xorrpad
```

The final release used the exact release command in the S1 section above after
other builds finished. See [TESTING.md](../TESTING.md#firmware-v2--s2-pairing-and-protocol-2026-11-12)
for tested states, native/desk counts and remaining hardware verification.


## v2 S3 kill latch, profiles and rotary controls (2026-11-12)

Status: **compiled, not yet flashed**. KILL persists in `xorrsafety/killed` and
requires the paired desk plus a fresh 800 ms physical hold to clear it. Failed
NVS access fails closed. No signal or trade input can bypass the local latch.

Profiles use a separate **256 KB NVS partition** labelled `profiles`, and one
validated snapshot blob (`xorrprofiles/snapshot`). The partition table keeps
`app0` at `0x10000` and `app1` at `0x310000`, both 3 MB, and ends at 16 MB.
The new partition occupies `0x650000..0x68ffff`; FAT now starts at `0x690000`.
**The updated partition table must be installed when Nick flashes the board;
an app-only OTA cannot add the profile partition to an older layout.** No
flash or signing command was run here.

Optional encoder wiring: A **GPIO 9**, B **GPIO 21**, switch **GPIO 47**, with
pull-ups and common ground. Those inputs are separate from the measured matrix.
Short press cycles size/leverage/slippage; hold starts voice PTT. A programmed
`profile:next` or `layer:next` key cycles the saved selection. Actual encoder,
NVS power-loss, TFT and microphone behavior still need physical verification.

Final builds: isolated committed S3 **1,542,703 bytes flash** in both modes,
**63,252 bytes static RAM**. Complete working tree: normal **1,767,558 bytes**,
release **1,766,342 bytes**, both **64,844 bytes static RAM**. Limits remain
3,145,728 bytes per app slot and 327,680 bytes static RAM; runtime allocations
are additional. Native results: isolated **137 cases / 460 assertions**; full
working tree **144 cases / 483 assertions**. Full desk: **140 passed, 11 explicit
provider/setup skips, zero failed** (151 tests, 441.87 s).

Exact full-working-tree commands, run sequentially with Arduino CLI 1.5.1 and
ESP32 core 3.3.10, from the repository root:

```sh
mkdir -p firmware/build/s3-tmp
env TMPDIR="$PWD/firmware/build/s3-tmp" arduino-cli compile --jobs 4 --build-path "$PWD/firmware/build/s3-working-normal-build" --output-dir "$PWD/firmware/build/s3-working-normal-bin" --fqbn 'esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc' --build-property 'compiler.cpp.extra_flags=-DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --build-property 'compiler.c.extra_flags=-DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' firmware/xorrpad
env TMPDIR="$PWD/firmware/build/s3-tmp" arduino-cli compile --jobs 4 --build-path "$PWD/firmware/build/s3-working-release-build" --output-dir "$PWD/firmware/build/s3-working-release-bin" --fqbn 'esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc' --build-property 'compiler.cpp.extra_flags=-DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0 -DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --build-property 'compiler.c.extra_flags=-DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0 -DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' firmware/xorrpad
```

The isolated S3 commands used the identical FQBN and flags, with source
`firmware/build/s3-source/firmware/xorrpad`, build paths
`firmware/build/s3-kill-normal` / `firmware/build/s3-release-build`, and output
paths `firmware/build/s3-normal-bin` / `firmware/build/s3-release-bin`.
That source snapshot includes only the S3 commits and their committed
prerequisites. Earlier uncommitted firmware work remains separate. No signed
OTA artifacts were overwritten. See [TESTING.md](../TESTING.md) for coverage
and the remaining physical verification.

## v2 S4 voice (2026-11-12)

Status: **compiled, not yet flashed**. Install the Arduino Opus library from
[pschatzmann/codec-opus](https://github.com/pschatzmann/codec-opus) at commit
`c02de6316dddbb9dffdf976c159c4eaacecdf12f` (library version 1.6.1) in
`$(arduino-cli config get directories.user)/libraries/codec-opus`. CMake is
required for native tests, which compile that same library on the Mac.

PTT sends 20 ms, 16 kHz mono Opus frames on encrypted v2 links with constant
24 kbps encoding (60 raw bytes per frame). USB/Wi-Fi keep legacy PCM fallback;
BLE refuses PCM. The energy gate opens at RMS 600 with 250 ms hangover and a
500-amplitude noise gate. The TFT waveform shows the gated samples. Voice-mode
knob turns change the gain by 5%, clamped to 0–100%, for all speech and cues.

Compile commands (no signing key, upload or eFuse operations):

```sh
mkdir -p firmware/build/s4-tmp
env TMPDIR="$PWD/firmware/build/s4-tmp" arduino-cli compile --jobs 4 --build-path "$PWD/firmware/build/s4-normal" --output-dir firmware/build/s4-normal-out --fqbn 'esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc' --build-property 'compiler.cpp.extra_flags=-DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --build-property 'compiler.c.extra_flags=-DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' firmware/xorrpad
env TMPDIR="$PWD/firmware/build/s4-tmp" arduino-cli compile --jobs 4 --build-path "$PWD/firmware/build/s4-release" --output-dir firmware/build/s4-release-out --fqbn 'esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc' --build-property 'compiler.cpp.extra_flags=-DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0 -DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --build-property 'compiler.c.extra_flags=-DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0 -DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' firmware/xorrpad
```

S4 final sizes and test counts are recorded in [TESTING.md](../TESTING.md).
Actual mic energy thresholds, BLE throughput/latency, amp volume and the TFT
waveform require the assembled board. No hardware result is implied by tests.

## v2 S4 health (2026-11-12)

ESP32 core 3.3.10's `qio_opi` SDK enables
`CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH`, `CONFIG_ESP_COREDUMP_DATA_FORMAT_ELF`
and `CONFIG_ESP_BROWNOUT_DET`. Health compilation fails if flash core dumps or
brownout detection are disabled. The existing `coredump` partition is 256 KiB
at `0x610000`; install that partition layout before app-only OTA can use it.
[Espressif's core dump guide](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-guides/core_dump.html)
describes decoding the SDK image with the matching application ELF.

The loop task and idle tasks have a panic-enabled 90 s watchdog, allowing the
retained 60 s legacy voice HTTP timeout. Brownout stays under the SDK handler;
reset reason/name and a 120-character NVS history are reported at the next
stable boot. Telemetry is encrypted, immediate on the first connection and then
every 30 s; internal-sensor failures report null. Only an accepted link send
advances the telemetry timer or the crash upload offset.

On connect the pad checks the SDK flash dump checksum and hashes the bounded
image. The desk verifies ordered chunks and SHA-256, writes a private 0600 file
and fsyncs before acknowledging its digest and size. The pad retains flash
until that exact acknowledgment; disconnects, transport changes, fresh pairing
and lost acknowledgments restart safely. Dumps remain local to the paired desk.
No crash is deliberately triggered or hardware brownout induced by this step.

## v2 S5 factory test (2026-11-12)

**Compiled, not yet flashed.** Hold **01+14 at boot** to enter an isolated
self-test. Numbers follow the fixed keymap in `logic/safety.h`: 01=(0,0),
13=(3,2), 14=(3,3); unused cells are (0,3) and (1,3). Verify the assembled
board's labels/wiring before flashing. Factory mode suppresses trade inputs,
OTA commands, provisioning and backend polling. Reset exits the mode.

Press all fourteen keys, turn and click the knob, speak above the mic meter's
threshold, listen to the tone sweep, inspect TFT colour bars/dead-pixel grid,
and observe red/green/blue LED phases. Fresh YES presses acknowledge the
speaker/TFT/LED; NO fails inspection. The firmware then scans Wi-Fi and checks
BLE advertising. A completed scan with zero nearby APs is valid. Missing steps
time out after three minutes and produce FAIL, never an assumed PASS.

For a separately authorized physical manufacturing run, use
`firmware/factory.sh SERIAL_PORT esp32-<12 hex eFuse MAC> [ED25519_PUBLIC_KEY]`.
It writes the merged image using esptool at offset zero, opens 115200-baud serial,
and prompts for the boot chord. The expected serial is mandatory; an optional
public identity key pins the signer. Without that pin, signature validation
provides self-consistency, not independent device authenticity or freshness.
The monitor verifies CRC, Ed25519, serial, firmware and every boolean verdict;
it prints PASS/FAIL per check and per serial, returning nonzero on any failure,
disconnect or four-minute timeout. The signed report repeats over serial so CDC
reconnection cannot lose it; a paired desk can also receive it. No secret is
read by the monitor. Signing uses the device's existing identity internally.

Hold **01+13 for ten uninterrupted seconds** to reset, with a TFT countdown;
release cancels. Trade inputs are suspended during the gesture. A completed
reset stops radios, erases both default and profile NVS (identity/pairing,
legacy consent, Wi-Fi, settings, keymaps, profiles, safety and reset history),
then reboots. Erase failure leaves the unit offline with an error, never a
success/reboot claim. Flash firmware, eFuses and the separate crash partition
are untouched. Re-pair and provision after reset; identity keys regenerate.


## v2 S5 release validation (2026-11-12)

**Compiled, not yet flashed.** Release uses `XORR_RELEASE=1` and
`CORE_DEBUG_LEVEL=0`. Telnet networking/parser is absent; application debug
output requires volatile, encrypted USB desk consent (`usbDebug` in `config`
or `ready`, then `debug` with a `command`). Consent expires on disconnect,
failover, re-pair or reboot; v1/BLE/Wi-Fi cannot enable or use it. Normal builds
retain the development telnet console. See [PRODUCTION.md](PRODUCTION.md) for
planning and irreversible-step warnings; no production security is enabled.

Arduino CLI **1.5.1**, ESP32 core **3.3.10**. Exact compile-only commands from the
repository root (no signing key, flash, fuse or upload operation):

```sh
mkdir -p firmware/build/s5-tmp
env TMPDIR="$PWD/firmware/build/s5-tmp" arduino-cli compile --jobs 4 --build-path "$PWD/firmware/build/s5-working-normal" --output-dir firmware/build/s5-working-normal-out --fqbn 'esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc' --build-property 'compiler.cpp.extra_flags=-DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --build-property 'compiler.c.extra_flags=-DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' firmware/xorrpad
env TMPDIR="$PWD/firmware/build/s5-tmp" arduino-cli compile --jobs 4 --build-path "$PWD/firmware/build/s5-working-release" --output-dir firmware/build/s5-working-release-out --fqbn 'esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc' --build-property 'compiler.cpp.extra_flags=-DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0 -DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --build-property 'compiler.c.extra_flags=-DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0 -DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' firmware/xorrpad
```

The isolated S5 snapshot uses the same FQBN/flags with source
`firmware/build/s5-snapshot/firmware/xorrpad`, normal build path
`firmware/build/s5-factory-normal`, release build path
`firmware/build/s5-isolated-release`, and output paths
`firmware/build/s5-isolated-{normal,release}-out`. It contains only committed
S1–S5 features; unrelated unfinished working-tree changes remain outside the
S5 commits. Sizes, native/desk results and hardware limitations are recorded
in [TESTING.md](../TESTING.md#firmware-v2--s5-release-and-final-builds-2026-11-12).

## v2 S6 P1 presentation (2026-11-12)

**Compiled, not yet flashed.** All ten P1 screen states are implemented: Market
Pulse (including 24h change without candle history), paged positions/PnL,
trusted signal, receipt/short explorer signature, waveform, scrolling agent
reply, OTA progress, kill, pairing QR, and coded errors with a one-line fix.
Two explicit RGB565 PSRAM sprites total **307,200 bytes**; allocation failure
shows `DISPLAY_RAM / Enable OPI PSRAM; reboot` and does not report display health.
Frames swap after the synchronous SPI blit. The six xorr.finance colors use
RGB565 truncation; night is `0x0000` because all its channel values are below
the panel's quantization step.

Desk-set brightness (1–255), night mode, high contrast, spoken confirmation
amounts and left-handed mode persist in NVS. Night caps brightness at 40;
inactivity divides it by eight at two minutes and blanks at ten. Keys and
knob events wake it, consuming the first gesture from a blank screen. Error
and reply dismissal also consumes the gesture. KILL/REFUSE stay available.
The left-handed permutation reverses movable occupied cells per matrix row;
YES/NO/MIC/KILL and unused cells keep their measured positions. The keymap
preview follows that same mapping. Confirmed receipts take priority over
replies; all replies start on page one and scroll without dropping long words.

The status LED breathes cobalt at idle, pulses lime for a pending signal,
flashes mint only for a receipt, displays errors in amber and KILL in solid red.
KILL overrides every other animation. Ordinary voice activity uses this same
language. Factory mode retains its dedicated RGB inspection sequence.

Exact compile-only commands (Arduino CLI 1.5.1, ESP32 core 3.3.10):

```sh
mkdir -p firmware/build/s6-tmp
env TMPDIR="$PWD/firmware/build/s6-tmp" arduino-cli compile --jobs 2 --build-path "$PWD/firmware/build/s6-working-normal" --output-dir firmware/build/s6-working-normal-out --fqbn 'esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc' --build-property 'compiler.cpp.extra_flags=-DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --build-property 'compiler.c.extra_flags=-DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' firmware/xorrpad
env TMPDIR="$PWD/firmware/build/s6-tmp" arduino-cli compile --jobs 2 --build-path "$PWD/firmware/build/s6-working-release" --output-dir firmware/build/s6-working-release-out --fqbn 'esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc' --build-property 'compiler.cpp.extra_flags=-DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0 -DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --build-property 'compiler.c.extra_flags=-DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0 -DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' firmware/xorrpad
```

Isolated S6 builds use the same FQBN/flags with source
`firmware/build/s6-snapshot/firmware/xorrpad`, build paths
`firmware/build/s6-isolated-{normal,release}` and output paths
`firmware/build/s6-isolated-{normal,release}-out`. This snapshot contains only
committed S1–S6 work; unrelated unfinished changes remain outside these commits.
Sizes, native/desk results and physical limitations are recorded in
[TESTING.md](../TESTING.md). Layout QA runs `make -C tools/uipreview` followed by
`./tools/uipreview/preview firmware/build/s6-ui 2`, rendering the actual GFX UI.
Those layout fixtures do not represent new trades or hardware verification.


## v2 S7 end-to-end validation (2026-11-12)

Firmware stays **2.0.0**, **compiled, not yet flashed**. The focused padsim
command is `node --test --test-concurrency=1 desk/test/pad-v2*.test.mjs`.
[Protocol v2](../docs/v2/FIRMWARE-PROTOCOL-V2.md) and the
[simulator README](../tools/padsim/README.md) describe the wire format, live
quote/historical receipt distinction and signed public artifact prerequisite.
[P2 research](RESEARCH.md) evaluates WakeNet and LVGL; neither is implemented.

Arduino CLI 1.5.1 / ESP32 core 3.3.10, from repository root:

```sh
mkdir -p firmware/build/s7-tmp
env TMPDIR="$PWD/firmware/build/s7-tmp" arduino-cli compile --jobs 2 --build-path "$PWD/firmware/build/s7-working-normal" --output-dir firmware/build/s7-working-normal-out --fqbn 'esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc' --build-property 'compiler.cpp.extra_flags=-DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --build-property 'compiler.c.extra_flags=-DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' firmware/xorrpad
env TMPDIR="$PWD/firmware/build/s7-tmp" arduino-cli compile --jobs 2 --build-path "$PWD/firmware/build/s7-working-release" --output-dir firmware/build/s7-working-release-out --fqbn 'esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc' --build-property 'compiler.cpp.extra_flags=-DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0 -DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --build-property 'compiler.c.extra_flags=-DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0 -DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' firmware/xorrpad
```

The isolated committed-source builds use identical FQBN/flags, source
`firmware/build/s7-snapshot/firmware/xorrpad` (exported with `git archive HEAD
firmware/xorrpad firmware/test`), build paths `s7-committed-normal` /
`s7-committed-release`, and output directories with `-out` appended. S7 changes
no firmware runtime source; this snapshot excludes the pre-existing unfinished
firmware edits. Its native command is
`firmware/build/s7-snapshot/firmware/test/run.sh`; the full working-tree command
is `firmware/test/run.sh`.

All sizes, final suite totals and hardware limitations are recorded in
[TESTING.md](../TESTING.md#firmware-v2--s7-end-to-end-validation-2026-11-12).
Logs and build products are under ignored `firmware/build/s7-*`. No final image
was signed or flashed. OTA tests verify the pre-existing signed public image
(SHA-256 `202fd32f33a6c0e6f7674c8603d808797e4326a2cacf978a1e13d8d13d7ca26e`,
1,752,144 bytes), not the new normal/release images. No signing key is needed
or opened for that verification.

## v3 V1 clear signing (2026-11-12)

**Compiled, not yet flashed.** [V3-NOTES.md](V3-NOTES.md) records the exact
parser/decoder coverage, real builder fixture provenance, review API, blind-sign
gate and remaining trust boundaries. This implements V3-SPEC item 1 only. The
stable firmware label remains 2.0.0 pending the complete v3 release.

Compile-only commands (Arduino CLI 1.5.1, ESP32 core 3.3.10), from repo root:

```sh
mkdir -p firmware/build/v3-tmp
env TMPDIR="$PWD/firmware/build/v3-tmp" arduino-cli compile --jobs 2 --build-path "$PWD/firmware/build/v3-normal" --output-dir firmware/build/v3-normal-out --fqbn 'esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc' --build-property 'compiler.cpp.extra_flags=-DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --build-property 'compiler.c.extra_flags=-DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' firmware/xorrpad
env TMPDIR="$PWD/firmware/build/v3-tmp" arduino-cli compile --jobs 2 --build-path "$PWD/firmware/build/v3-release" --output-dir firmware/build/v3-release-out --fqbn 'esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc' --build-property 'compiler.cpp.extra_flags=-DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0 -DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --build-property 'compiler.c.extra_flags=-DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0 -DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' firmware/xorrpad
```

The isolated staged-source builds use identical flags/FQBN, source
`firmware/build/v3-snapshot/firmware/xorrpad`, build paths
`firmware/build/v3-isolated-{normal,release}`, and corresponding `-out` output
directories. That snapshot contains V1 plus committed v2, excluding the earlier
unfinished firmware changes. Native results and image/static RAM sizes for
both source trees are recorded in [TESTING.md](../TESTING.md).

## v3 V2 session signing (2026-11-12)

**Compiled, not yet flashed.** See [V3-NOTES.md](V3-NOTES.md#v2--session-signing-2026-11-12)
for the stored caps, physical policy approval, supported collateral-input
instructions, conservative rolling counter, Phoenix refusal and funding limits.
The desk supports `POST /wallet/mode {"mode":"pad"}`; `/pad/session` returns
the actual device public key and starts physically reviewed policy changes.

Compile-only reproduction, with temporary files on the workspace drive:

```sh
mkdir -p firmware/build/session-tmp
TMPDIR="$PWD/firmware/build/session-tmp" arduino-cli compile --jobs 2 --build-path "$PWD/firmware/build/session-normal-work" --output-dir firmware/build/v2-session-normal --fqbn 'esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc' --build-property 'compiler.cpp.extra_flags=-DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --build-property 'compiler.c.extra_flags=-DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' firmware/xorrpad
TMPDIR="$PWD/firmware/build/session-tmp" arduino-cli compile --jobs 4 --build-path "$PWD/firmware/build/session-release-work" --output-dir firmware/build/v2-session-release --fqbn 'esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc' --build-property 'compiler.cpp.extra_flags=-DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0 -DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --build-property 'compiler.c.extra_flags=-DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0 -DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' firmware/xorrpad
firmware/test/run.sh
TMPDIR="$PWD/firmware/build/session-tmp" npm test --prefix desk
```

The index-only snapshot in `firmware/build/v2-snapshot` excludes the eight
pre-existing unfinished firmware edits. Its identical FQBN/flags use source
`firmware/build/v2-snapshot/firmware/xorrpad`, build directories
`session-isolated-{normal,release}` and matching `-out` output directories;
both isolated commands use `--jobs 2`. Native verification is
`firmware/build/v2-snapshot/firmware/test/run.sh`. Exact sizes/counts are in
[TESTING.md](../TESTING.md). No image is signed, flashed or pushed by these steps.

## v3 V4 Abilities SDK (2026-11-12)

**Compiled, not yet flashed.** See [sdk/abilities](../sdk/abilities/README.md)
for templates, samples, the four capability imports and developer signing.
The desk **Abilities** screen enrolls a developer through a physical pad hold,
then verifies and installs signed modules into two persistent slots.
[TESTING.md](../TESTING.md) records sizes and sandbox/transport evidence;
[V3-NOTES.md](V3-NOTES.md#v4--abilities-sdk-2026-11-12) lists remaining limits.

Compile-only reproduction (Arduino CLI 1.5.1; ESP32 core 3.3.10):

```sh
mkdir -p firmware/build/v4-tmp
TMPDIR="$PWD/firmware/build/v4-tmp" arduino-cli compile --jobs 3 --build-path "$PWD/firmware/build/v4-normal" --output-dir firmware/build/v4-normal-out --fqbn 'esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc' --build-property 'compiler.cpp.extra_flags=-DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --build-property 'compiler.c.extra_flags=-DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' firmware/xorrpad
TMPDIR="$PWD/firmware/build/v4-tmp" arduino-cli compile --jobs 2 --build-path "$PWD/firmware/build/v4-release" --output-dir firmware/build/v4-release-out --fqbn 'esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc' --build-property 'compiler.cpp.extra_flags=-DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0 -DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' --build-property 'compiler.c.extra_flags=-DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0 -DCONFIG_BT_NIMBLE_SM_SC_ONLY=1' firmware/xorrpad
npm ci --prefix sdk/abilities/assemblyscript
firmware/test/run.sh
firmware/test/abilities-sanitize.sh
npm test --prefix desk
node desk/test/abilities-ui.mjs
```

The index-only snapshot in `firmware/build/v4-snapshot` excludes pre-existing
unfinished edits. It uses the same FQBN and flags, source
`firmware/build/v4-snapshot/firmware/xorrpad`, build directories
`v4-isolated-{normal,release}`, matching `-out` output directories and `--jobs 3`.
Its native command is `firmware/build/v4-snapshot/firmware/test/run.sh` after
installing/symlinking the pinned AssemblyScript dependency inside that snapshot.
No firmware signing, private-key read, flashing, fuse operation or push is part
of these commands. The firmware label remains 2.0.0 pending the full v3 release.

## v3 V5 offline alerts

See [V3-NOTES.md](V3-NOTES.md#v5--offline-price-alerts-2026-11-12) for the
`/pad/price-alerts` API, one-shot semantics, pinned provider and hardware limits.
Build with the same ESP32-S3 FQBN/SC-only flags as V4 above, using
`firmware/build/v5-{normal,release}` build paths and `v5-{normal,release}-out`
output directories. Native checks: `firmware/test/run.sh`; live pinned HTTPS:
`node tools/padsim/price-alerts.mjs`. Compiled, not yet flashed.
