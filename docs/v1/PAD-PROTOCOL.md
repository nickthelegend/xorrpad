# Pad link v1 (firmware 1.0.0)

All transports carry the same UTF-8 newline-delimited JSON (NDJSON). Each
record ends in LF, has `v:1` and a `type`. CR before LF is tolerated. JSON
strings escape newlines. Maximum record: 4096 bytes including LF. Unknown
versions/types and malformed records are refused; diagnostic serial lines that
do not start with `{` are ignored. A partial record is never an event.

## Records

| Type / direction | Fields (in addition to v and type) |
| --- | --- |
| `hello` pad → desk | `device` (stable chip id), `fw:"1.0.0"`, `caps:["keys","voice","tts","signals","keymap"]` |
| `caps` desk → pad | `heartbeatMs:5000`, `maxLine:4096`, `sampleRate:16000` |
| `keymap` desk → pad | `revision` unsigned 32-bit integer; `keys:[{row,col,action,label}]`, exactly the 14 wired cells |
| `keymap_state` pad → desk | `revision`, `ok`; sent only after validation and NVS write |
| `key` pad → desk | `id` unique per boot/event, `action` id, `edge:"down"`, optional `signalId` for yes/no |
| `knob` pad → desk | `id`, `sizeUsd` positive finite absolute trade size (no encoder is wired on the current board) |
| `signal` desk → pad | `signalId`, `state:"awaiting"`, `market`, `side`, `sizeUsd`, `venue`, `why`, `remainingMs`, `autoAccept` |
| `signal_state` either direction | desk: `signalId,state,remainingMs,autoAccept`; pad: `id,signalId,state:"accept"` or `"refuse"` |
| `receipt` desk → pad | `signalId`, `signature`, `explorer`; emitted only from an actual confirmed backend receipt |
| `voice` pad → desk | `id` (chunk event), `stream` (utterance), `seq` starting at 0, `end` boolean, `sampleRate:16000`, `pcm` base64 |
| `tts` desk → pad | `stream`, `seq` starting at 0, `end`, `sampleRate:16000`, `pcm` base64 |
| `status` desk → pad | `armed`, `link` (`usb`, `ble`, `wifi`, `tcp` for lab), `venue`, `market`, `agent`, `sizeUsd`, `remembers`, `autoAccept` |
| `ping` either direction | optional `id`; desk answers with status, not another ping |
| `result` desk → pad | `id` of input, `ok`, optional `error`/`status` (missing credentials: `Setup required: …`) |

PCM is signed 16-bit little-endian mono, 16 kHz, no WAV header. A chunk contains
at most 512 PCM bytes, always whole samples; an empty final chunk is allowed.
At most 12 seconds / 384000 bytes per utterance; sequence gaps abort the stream.
The desk assembles the utterance and calls the existing voice module through
`/voice`; TTS comes back in ordered chunks for I2S playback. No provider key
ever travels to or is stored on the pad.

The fixed scanned cells are rows 0/1 columns 0/1/2 and rows 2/3 columns 0/1/2/3.
Labels are printable ASCII, 1–16 characters; action ids are 1–96 ASCII letters,
numbers or `_ . : -`. `mic`, `kill`, `yes`, and `no` each occur exactly once,
on their existing measured cells (3,1), (3,0), (2,1), (2,0). This preserves the
hold-to-talk, 600 ms hold-to-kill and confirmation controls. The action `pmamm:<market-public-key>:<yes|no>` proposes a devnet outcome
through `/signals` at the desk's current size. Other actions go
to the same `/key` handler as the desk. A full map is validated before replacing
NVS. The desk persists the map and pushes it after every hello or edit via
`GET/POST /pad/keymap` (existing pad-token authentication).

## Lifecycle and routing

Pad sends hello on connection and every five seconds; desk answers caps,
keymap, status and current awaiting signals. Receipt and state events bridge
from the real signals queue to the pad and `/events`; pad inputs also appear
on `/events` as `type:"pad"`. A countdown uses relative remaining milliseconds,
so the ESP32 needs no wall clock. Zero disables acceptance locally; the desk
independently expires/rechecks the gate. ✓/✗ carry the displayed signal id,
never a stale implicit queue position. AUTO is the desk permission policy, off
by default; firmware cannot enable it or bypass a gate. Receipts are never
manufactured from a key acknowledgment or an accepted state.

USB wins over BLE, BLE over Wi-Fi after a valid v1 desk response. A link expires
after 15 seconds without response. Each link has its own receive accumulator.
No trade event is queued for replay after disconnect/failover. Input ids are
deduplicated per device at the desk across links for the process lifetime
(bounded recent history); use a new boot nonce on reset. A lost acknowledgment
is not permission to repeat a key. Refresh state through hello/ping instead.

## Transports

* **USB-CDC:** native ESP32-S3 USB, 115200 baud interface setting. Enable
  `CDCOnBoot=cdc`. Desk uses `serialport`, scans Espressif VID 303A, and probes
  hello; `XORR_PAD_SERIAL` explicitly selects another path (including a PTY).
* **BLE:** NimBLE-Arduino Nordic UART service
  `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`, RX/write `…0002…`, TX/notify
  `…0003…`. Central subscribes before writing hello/ping. Split *bytes*, not
  JSON records, into negotiated ATT MTU minus 3 (20 bytes if unknown).
  Reassemble until LF. Use acknowledged writes and paced notifications;
  bounded buffers abort on overflow. On the Mac the optional
  `@abandonware/noble` adapter discovers that service; the phone can relay the
  exact bytes to authenticated `/padlink` over HTTP or WS. No phone app changes
  are claimed by this task. Provision/pair only with trusted local clients;
  v1 BLE has no application-level wallet or signing capability.
* **Wi-Fi:** existing captive-portal backend URL and bearer pad token.
  `POST /padlink?device=<stable-id>` with `application/x-ndjson` body;
  response is NDJSON of queued outbound records (empty response is valid).
  Send hello first, then ping at least once per second while using HTTP.
  `WS /padlink?device=<stable-id>` carries the same newline records with
  bearer or `x-pad-token` header; phone/browser may use the existing
  `xorrpad, pad-token.<token>` subprotocols. Tokens in URLs are refused.
  Legacy `/key`, `/pad`, `/pad/chart`, `/voice`, `/speak` remain available.
* **Lab TCP:** same byte stream on a loopback port 8710–8729; never expose an
  unauthenticated simulator socket on the LAN. This tests protocol behavior,
  not USB electrical timing or BLE radio behavior.

The Mac mini/desk may join Tailscale; **the ESP32 does not join the tailnet in
v1**. It reaches the desk over LAN/USB, a LAN relay, or the existing verified
HTTPS Funnel URL. A bare `100.x` tailnet address is not reachable from the pad.
