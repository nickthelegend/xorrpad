# Firmware protocol v2

Firmware **2.0.0**, minimum desk **1.0.0**. Status: **compiled, not yet flashed**.
NDJSON records remain at most 4096 bytes.
The same records travel over USB CDC, Nordic UART BLE or HTTP/WebSocket relay.
The desk retains v1 support. A v2 pad accepts the static-token v1 fallback only
after a paired desk enables **legacy v1 link**; this persists in NVS.

## Identity and pairing

The eFuse MAC forms `esp32-<12 hex digits>`. First boot generates independent
X25519 and Ed25519 private keys in NVS after radio entropy is enabled. The TFT
shows a six-digit code and
`xorrpad://pair?id=<device>&pk=<Ed25519 hex><X25519 hex>&v=2`.
The combined public key is 128 lowercase hex characters. Verify it through the
physical QR, not just the untrusted transport advertisement.

Plaintext handshake records are the only v2 records permitted before encryption:

- Pad: `{v:2,type:"hello",device,fw:"2.0.0",pk,xpk,nonce}` (separate 64-hex keys).
- Desk: `{v:2,type:"pair",deskpk,challenge,nonce}` (fresh X25519 ephemeral key and
  32 random bytes as hex for each session).
- Pad: `{v:2,type:"pair_proof",signature}` (128-hex Ed25519 signature).

The signed UTF-8 transcript is
`xorrpad-v2|<device>|<xpk>|<deskpk>|<challenge>|<nonce>`.
Given X25519 shared bytes `S`, the direction keys are
`SHA256(S || code || transcript || "desk")` and
`SHA256(S || code || transcript || "pad")`.
The device supplies a fresh 32-byte nonce for each offer, consumes it once,
rejects weak shared points and limits pairing attempts to five per minute.
Unfinished offers expire after 10 seconds. Old pairing requests cannot reset
sequence numbers under reused session keys. A valid
identity signature alone is insufficient: both sides exchange encrypted `ready`
records to demonstrate knowledge of the code-derived keys. The pad's ready
includes `killed`. Pairing codes stay in desk memory; restart requires the
current TFT code again. No code or private key is sent in plaintext frames.

## Encrypted records and reliability

Envelope: `{v:2,seq,ack,type:"encrypted",body,tag}`. `body` is base64 ciphertext;
`tag` is 16 bytes of lowercase hex. ChaCha20-Poly1305 uses the direction key,
nonce `0000000000000000 || uint32_le(seq)`, and UTF-8 AAD `2|seq|ack`.
Sequence numbers start at one, stop before wrap, and reset only with fresh
session keys. Authenticate before applying acknowledgments or payloads.

USB appends `crc` as the final JSON property: eight lowercase hex digits of
IEEE CRC32 over the complete JSON record **without** that property and without
its newline. Handshake records also require CRC. Receivers reconstruct that
record using its original property order. Newline terminates a frame.

One reliable data record is in flight per direction. Authenticated cumulative
acks clear it; retry the exact bytes after 250, 500, 1000, 2000, 4000, 8000 ms.
Repeated authenticated frames are rejected for execution and acknowledged again.
Ack-only frames and heartbeat pings are encrypted but do not request ack.
`ack` advances only for reliable data; a 64-frame replay window separately tracks
all authenticated sequences. Thus an ack or heartbeat overtaking lost data
cannot acknowledge or discard that data. Control traffic
precedes bounded TTS queues. Heartbeats run every 5 s; the watchdog expires links
at 15 s. Authenticated heartbeat/ack intake continues while backend work awaits
network I/O. USB discovery, BLE reconnect and Wi-Fi request failures use exponential backoff
capped at 30 s. Watchdog expiry is independent of outstanding backend work.

USB wins over BLE, then Wi-Fi. Device signal/expiry state is independent of the
transport. On a switch, old outgoing inputs are discarded. Offline key presses
never become deferred trades. The desk rejects trade inputs from standby links,
rechecks the active transport before queued backend work starts, and drops
expired signals from its delivery queue. The legacy HTTP adapter is disabled
unless the paired desk explicitly enables legacy mode. The screen says **offline: nothing will execute**;
the desk is authoritative for expiry and execution.

HTTP v2 clients use `X-Xorr-Protocol: 2`; every body record must be v2. WebSocket
clients use `xorrpad-v2`. These paths need no v1 pad token because the v2
handshake and AEAD authenticate the peer. Legacy HTTP/WS retains bearer/token
subprotocol authentication. Browser management APIs still require desk auth.

## Trusted signals and confirmation

`signal.trusted` is this exact field order, with every value a string:
`fee, market, price, side, signalId, size, venue`. Serialize compact JSON, hash
its UTF-8 bytes with SHA-256, encode the **whole digest** as Bitcoin base58, then
take six characters. Decimal values contain no exponent or grouping. Fee and
executable price must be present; unavailable fee data yields `QUOTE_REQUIRED`.
Example native/JS conformance vector in the tests yields `AgrJHn`.

The pad recomputes the fingerprint and renders venue, full market, side, size,
price and fee. `/signals` and `/events` carry the same trusted object and
fingerprint for desk and XOR phone rendering. A v2 YES key carries
`signalId,fingerprint,heldMs`; above the desk threshold (default USD 100), at
least 800 ms is required. NO refuses immediately. Desk confirmation passes the
fingerprint into the common signal gate; a changed quote is refused for a fresh
review. A result acknowledgment is never a fill; only `receipt` displays a
confirmed signature/explorer link.

Holding KILL 2 s persists the local latch before sending `kill`. A latched pad
refuses signals and trade keys, including offline. Desk `rearm_request` starts a
15 s window; an 800 ms physical hold emits `rearm_confirm`, and desk
`rearm_complete` permits the NVS latch to clear. Reboot reports the latch before
new signals. Other killed pads keep global trading disarmed. The hold must
start after the request; an already-held YES cannot grant consent. Releasing
YES after confirmation allows the authenticated completion to arrive within
the same window. Disconnect, transport change, another KILL, or window expiry
revokes consent. The device clears the latch only after the NVS write succeeds.
KILL cancels unsent key/voice/knob frames and their retries before sending the
kill frame. Inputs that already reached the desk remain subject to its gate.

## Profiles, voice, health and OTA

`profiles {names}` declares up to eight names. Each `profile_map` carries
`profile,layer,map` (the validated v1 14-key map); layer 0/1/2 is Spot/Perps/Predict.
`profile_select` activates a saved layer. `profile:next` and `layer:next` bindings
cycle locally. Dedicated mic/kill/yes/no cells cannot be reassigned. Names are
1–20 printable ASCII bytes. Sync stages all `3 * names.length` maps in RAM;
only a complete validated set replaces the previous NVS snapshot, as one blob
in the `profiles` NVS partition. Map revisions survive serialization. An
interrupted transfer or failed write preserves the installed set. Activation
waits until a pending signal or recording finishes. Selection is persisted
before applying a map; removed active profiles fall back to the first Spot
layer, while a retained profile is matched by name across reordering.

The pad reports `profile_state {ok,profile,layer}` on each management message;
`ok` means the message was accepted, including staging while busy, and indices
identify the installed selection. The desk exposes the latest response in
`/desk/link`. A failed write reports `ok:false`; it never installs the candidate.
Desk `profile_select` and local cycles refuse a switch while busy.

Knob events carry `mode` (size/leverage/slippage), `value` and `sizeUsd`.
Short press cycles modes; long press (600 ms after debounce) is PTT and does
not also cycle. The first detent uses step 1; later detents use step 10 below
40 ms, step 4 below 100 ms, otherwise step 1. Bounds are size $1–$1,000,000,
leverage 1–100 and slippage 1–5,000 bps; desk permissions still apply. Offline,
killed, recording and pending-signal states do not emit trade-setting changes.
Voice mode controls volume.
BLE `voice`/`tts` use `codec:"opus",sampleRate:16000,data:<base64>` with stream,
sequence and end markers. Firmware encodes 20 ms mono frames at 24 kbps and
decodes Opus TTS. USB/Wi-Fi also accept v1-shaped PCM. The desk converts codecs
before the existing voice backend; no provider key reaches the pad.

`telemetry` runs every 30 s (uptime, heap, PSRAM, RSSI, temperature or null, link,
fw, reset reason/log). `crash` chunks carry offset/data/end, bounded to 256 KiB;
each chunk also supplies `dump` (64 lowercase hex SHA-256 characters) and
`size` (1–262,144 bytes). Offsets must be contiguous and `end` must coincide
with the declared size. The desk checks SHA-256, saves the raw SDK flash image
as `<device>-<dump>.coredump` with mode 0600, and fsyncs before sending
`crash_saved {dump,size}`. Only a matching encrypted acknowledgment after the
complete upload permits erasure. Disconnect, failover or a fresh pairing
restarts at offset zero; loss of `crash_saved` retries after 30 seconds.
Keep the matching firmware ELF for Espressif's core dump analysis tools.
Reset telemetry also includes `resetName`, `brownout`, and `watchdog`; the SDK
brownout ISR resets immediately and NVS history is updated on stable boot.
The loop task and idle tasks use a panic-enabled 90-second task watchdog to
allow the retained 60-second legacy voice HTTP operation.

`factory_result` includes the exact
signed JSON payload, public identity key and Ed25519 signature. Its serial must
match the paired identity; the desk/factory monitor verify before reporting.

OTA is `ota_begin {manifest,id}`, ordered `ota_chunk {offset,data,id}` (512 raw
bytes), then `ota_end {id}`. Each gets `ota_result {id,ok,error}`. The manifest
contains version, size, sha256, signature, minDeskVersion and one-line notes.
Ed25519 signs UTF-8:
`xorrpad-ota-v2\nversion\nsha256\nsize\nminDeskVersion\nnotes`.
Both endpoints pin the release public key. The pad verifies before opening the
inactive slot, hashes writes, verifies length/hash before changing the boot
partition, and leaves boot pending until display/keys/handshake pass within 60 s.
The Connect screen verifies a selected manifest and starts background upload;
status polling exposes progress. No enablement of silicon secure boot is implied.

## P1 presentation and accessibility

Authenticated `ready` and `config` carry `brightness` (integer 1–255),
`night`, `highContrast`, `speakAmounts`, and `leftHanded` (booleans). Partial
updates preserve omitted fields. The pad validates a complete candidate and
persists only changed display settings in `xorrui/settings`; a failed write
leaves the previous settings active and displays `UI_SETTINGS`. Factory reset
erases these preferences. Night mode caps the backlight at 40/255. After
120,000 ms without a key/knob event the backlight is divided by eight (minimum
one); after 600,000 ms it is zero. A key/knob wakes it. The first gesture from
a blank screen, or a key dismissing an error/reply, is consumed before trade
input; KILL and REFUSE retain their immediate safety behavior. Left-handed
mode reverses occupied action cells within each matrix row; holes and dedicated
YES/NO/MIC/KILL stay fixed. The keymap preview follows the same mapping.

With spoken amounts enabled, a fresh physical confirmation sends
`speak_amount {signalId}` once for that displayed signal. The desk checks the
signal ID against its displayed proposal before invoking its existing TTS
path. Provider configuration stays on the desk. This is an accessibility
announcement; the normal confirmation gate and hold requirement still apply.

`pulse` carries the active market's real `price`, optional `change24h`, up to
48 closes, optional book `unrealised`, `positions` (open count), and up to eight
`positionDetails [{market,qty,pnl}]`. A row's `pnl` is null when its live price
or remembered entry basis is unavailable. The TFT marks unavailable PnL with
`--`; it never substitutes flat performance. Market Pulse and positions
alternate every six seconds; lists longer than four rows page on later visits.
Legacy HTTP retains the book/count display when detail rows are unavailable.

`reply {text}` is bounded to 2,000 characters and scrolls eight wrapped lines
at a time every six seconds, starting at arrival. Pending signals and receipts
outrank replies; loss of link shows the offline warning. Error records carry
`code` and a one-line `fix`. Local OTA acknowledgments drive the progress bar,
including 100% until reboot after a successful end. Pairing QR rendering is
suppressed whenever KILL, factory, update or error screens own the display.

The TFT composes frames on two explicitly allocated 320×240 RGB565 PSRAM
sprites (307,200 bytes total), blits synchronously, then swaps. Its palette is
night `0000`, ink `f79d`, lime `cfa7`, mint `0ecf`, cobalt `2adf`, lavender
`b53f`. High contrast uses white text against night, retaining written state
labels as well as color. LED priority is KILL solid red, error amber,
confirmation sweep, pending lime pulse, confirmed fill mint flash, then idle
cobalt breathing. A fill flash includes a fully off phase; acknowledgments do
not create fill indications.
## S7 end-to-end verification

Run `firmware/test/run.sh` and `npm test --prefix desk`. The focused command is
`node --test --test-concurrency=1 desk/test/pad-v2*.test.mjs`.
[Padsim](../../tools/padsim/README.md) connects to the actual desk over fragmented
loopback TCP, including CRC-protected serial framing. It uses real X25519,
Ed25519 and ChaCha20-Poly1305, observes the encrypted wire records, and checks:

- Live devnet proposal → encrypted signal → identical queue/display fingerprint
  → released-hold cancellation → 800 ms hold → desk gate. Independent desk
  checks reject an encrypted wrong fingerprint and a 799 ms hold.
- A separately verified historical devnet receipt traverses that encrypted
  connection. This proves receipt delivery, not a new trade or funded fill.
- A compiled image with the pinned release signature transfers successfully;
  missing/bad signatures and image corruption are rejected. No signing key is
  read by these tests. The pre-existing signed artifacts must be present at
  `firmware/build/artifacts/{app.bin,manifest.json}`; see the simulator README.
- A new simulator instance loads the killed state from disk before connection.
  Clearing the desk's remembered latch proves encrypted ready restores it from
  the pad. Rearm still requires the desk and a fresh physical-hold simulation.
- Replaying actual authenticated wire bytes in either direction does not apply
  an input or configuration twice; the serial case also checks CRC framing.

Live-provider failures retain explicit dependency skips; see
[TESTING.md](../../TESTING.md) for totals. The phone relay, physical BLE/USB,
actual NVS power-loss persistence, flashed OTA and bootloader rollback still
require hardware verification. P2 remains [research only](../../firmware/RESEARCH.md).
