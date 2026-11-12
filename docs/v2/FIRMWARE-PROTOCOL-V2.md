# Firmware protocol v2

Firmware 2.0.0; desk 1.0.0 or later. NDJSON records remain at most 4096 bytes.
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
Ack-only frames are encrypted but do not themselves request ack. Control traffic
precedes bounded TTS queues. Heartbeats run every 5 s; the watchdog expires links
at 15 s. Authenticated heartbeat/ack intake continues while backend work awaits
network I/O. Reconnect uses backoff capped at 30 s.

USB wins over BLE, then Wi-Fi. Device signal/expiry state is independent of the
transport. On a switch, old outgoing inputs are discarded. Offline key presses
never become deferred trades. The screen says **offline: nothing will execute**;
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
new signals. Other killed pads keep global trading disarmed.

## Profiles, voice, health and OTA

`profiles {names}` declares up to eight names. Each `profile_map` carries
`profile,layer,map` (the validated v1 14-key map); layer 0/1/2 is Spot/Perps/Predict.
`profile_select` activates a saved layer. `profile:next` and `layer:next` bindings
cycle locally. Dedicated mic/kill/yes/no cells cannot be reassigned.

Knob events carry `mode` (size/leverage/slippage), `value` and `sizeUsd`.
Short press cycles modes; long press is PTT. Voice mode controls volume.
BLE `voice`/`tts` use `codec:"opus",sampleRate:16000,data:<base64>` with stream,
sequence and end markers. Firmware encodes 20 ms mono frames at 24 kbps and
decodes Opus TTS. USB/Wi-Fi also accept v1-shaped PCM. The desk converts codecs
before the existing voice backend; no provider key reaches the pad.

`telemetry` runs every 30 s (uptime, heap, PSRAM, RSSI, temperature or null, link,
fw, reset reason/log). `crash` chunks carry offset/data/end, bounded to 256 KiB;
only encrypted `crash_saved` allows erasure. `factory_result` includes the exact
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
