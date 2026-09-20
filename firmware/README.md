# xorr-pad — firmware

ESP32-S3 firmware for the trading pad. Take a market in hand, propose a trade,
confirm it with a physical ✓ — or hold the mic key and say it out loud. Wi-Fi
and the backend address are set once through a captive portal and remembered in
flash; **no recompile to change networks**.

Sketch: [`orchestrator_pad/orchestrator_pad.ino`](orchestrator_pad/orchestrator_pad.ino).

> **Nothing on this pad can move money on its own.** BUY and SELL raise a
> decision; only ✓ executes it, only while the backend says it is armed, and the
> same gate answers whether the key was pressed here or on screen. The firmware
> holds no opinion about limits, positions or what is armed — it asks.

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

**KILL is held, not tapped** — 600 ms. A brush against the key that stops all
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

All pins live in [`orchestrator_pad/config.h`](orchestrator_pad/config.h) — change
them there if your wiring differs.

The 12-second record buffer is 384 KB and **lives in PSRAM**, so PSRAM must be
enabled at build time. It is off in the default board config.

## Building

### From the command line

```bash
arduino-cli core install esp32:esp32
arduino-cli lib install WiFiManager
arduino-cli lib install "Adafruit ILI9341"

arduino-cli compile \
  --fqbn esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi \
  firmware/orchestrator_pad
```

**Those board options are not optional.** With the bare `esp32:esp32:esp32s3`
default you get a 4 MB partition scheme — the binary lands at 90% of the
available app space — and **PSRAM disabled**, which means the record buffer
never allocates. With the options above it is 39% and the mic works.

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

1. Open [`orchestrator_pad/orchestrator_pad.ino`](orchestrator_pad/orchestrator_pad.ino).
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
| on the same Wi-Fi as the Mac | `http://<mac-lan-ip>:8080` (e.g. `http://192.168.1.20:8080`) | blank is fine on a trusted LAN |
| anywhere / the pad moves around | `https://<machine>.<tailnet>.ts.net` (Tailscale Funnel) | **required** — Funnel is public |

- **`http://…`** → plain connection. Use the Mac's **LAN IP**, *not* its
  `tailscale ip` (`100.x`) — a bare ESP32 can't route to a tailnet address.
- **`https://…ts.net`** → TLS, with the Let's Encrypt root pinned (the pad
  verifies the cert, so the token can't be MITM'd). Set the same `PAD_TOKEN` on
  the backend, which lives in [`desktop/`](../desktop).

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
| Portal won't take my URL | It needs a scheme: `http://192.168.1.20:8080`, not `192.168.1.20` |
| Amp silent | Check `DIN/BCLK/LRC` wiring and that the amp's **SD pin is tied to 3V3** |
| Mic captures nothing | Check `SCK/WS/SD`, and tie the INMP441 **L/R pin to GND** |
| Keys wrong / swapped | Flash `keytest`, run MAP mode, paste the map it prints |

## What is verified, and what needs the board

Compiled and tested against the real backend on every run of
[`desktop/test/verify.mjs`](../desktop/test/verify.mjs) section P: the `/pad`
poll, `/speak`, the key ids, and the voice round trip.

The URL validator is unit-tested. The captive-portal markup is checked in a
browser.

**Not verifiable without hardware:** Wi-Fi provisioning on the device, I2S mic
capture, amp playback, matrix scanning, and NVS persistence across a power
cycle. Those are marked untested rather than assumed.
