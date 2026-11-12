# OTA channels and delta updates (V6)

Compiled, not yet flashed. Existing v2 full-image manifests remain compatible.
Channel-aware pads must first receive a full upgrade; older v2 updaters cannot
understand the signed v3 manifest envelope. Use `XORR_OTA_LEGACY=1` for the
bootstrap full-image release with the current `2.0.0` firmware label; it preserves
the exact v2 signing envelope and rejects beta, partial rollout and deltas.

## Releases and trust

The existing manifest fields remain `version`, `sha256`, `size`,
`minDeskVersion`, `notes`, and `signature`. V3 adds `channel` (`stable` or
`beta`) and integer `rolloutPercent` (0–100). Both are signed. Versions are
numeric semantic-version triplets (for example `3.0.1`); beta is a channel,
not a version suffix. Minimum desk remains `1.0.0`.

A device starts on stable; beta opt-in is stored on that specific pad in NVS.
Stable releases are available to either channel, beta releases only to opted-in
pads. A release is eligible when SHA-256(deviceId), interpreted as a big-endian
integer, modulo 100 is strictly below rolloutPercent. Zero excludes all pads;
100 includes all eligible-channel pads. The pad derives its ID from eFuse MAC,
never from sender-supplied metadata. The desk checks independently. Raising a
rollout percentage requires signing a new manifest. This is deterministic
staging, not an anti-rollback/version-freshness mechanism.

An optional `delta` object has `format: "xorr-delta-v1"`, `fromVersion`,
`baseSha256`, `baseSize`, `sha256`, `size`, and `signature`. It is emitted only
when smaller than the image. The patch's independent Ed25519 signature binds its
hash/length/format, base version/hash/length, target version/hash/length, channel,
and rollout. The final image signature covers all release metadata including
the patch signature. See `manifestText` and `patchText` for exact newline-separated
domain-separated encodings; the legacy `xorrpad-ota-v2` encoding is unchanged.

The desk verifies the full app image and both signatures, then the patch hash
before transfer. It selects a supplied delta only for the matching running
version; otherwise it sends the full image. The pad checks both signatures at
begin and end, hashes the installed base bytes, hashes the received patch, and
hashes the reconstructed image against the signed target. No unverified result
is selected for boot. A base mismatch refuses with “use the full image”; retry
without selecting delta.bin. The desk retains the matching full image so final
image verification does not depend on trusting the patch's claimed output.

## Wire and API

All commands use the existing paired encrypted v2 link on USB, BLE or Wi-Fi.
`ota_status` returns `ota_result {id,ok,channel}`. `ota_channel {channel}` saves
and returns the channel only when idle. `GET /pad/ota-channel?device=...` reads
it; `POST /pad/ota-channel {device,channel}` sets it. Authentication and method
allowlists match other pad endpoints. Connect exposes explicit read/save
controls so the shown selection cannot silently opt another pad into beta.

`POST /pad/manifest {manifest}` validates signed metadata. `POST /pad/ota`
retains `{device,manifest,image}` (base64 app image) and accepts optional `patch`
(base64). The desk sends `ota_begin {manifest,delta:boolean}`, ordered
`ota_chunk {offset,data}` (base64, at most 512 decoded bytes), then `ota_end`.
Offsets/progress count transferred bytes, not reconstructed bytes. Replies are
correlated by ID and remain bound to the original encrypted session/transport.
The UI reports asynchronous failures through the existing OTA event stream.

## Patch encoding and device behavior

Magic is eight bytes `XORRD1\r\n`. Each opcode is followed by little-endian
unsigned 32-bit integers: COPY `0, baseOffset, length`; ADD `1, length, bytes`;
END `255`. Lengths must be positive; exact target size and one final END are
required, with no trailing data. Reads cannot exceed signed baseSize and writes
cannot exceed signed image size. The native streaming decoder retains only an
eight-byte header and a 512-byte copy buffer; headers/literals may cross any
transport chunk boundary. The release generator indexes 64-byte base blocks and
copies unchanged runs, including shifted runs, with literals for changed bytes.

The active slot is read-only. Reconstruction writes sequentially to the inactive
A/B partition. A malformed patch, digest mismatch or signature failure aborts
that handle and leaves the active boot slot unchanged. The normal pending-verify
boot health check/60-second rollback remains in place. Power loss, physical BLE
throughput, NVS persistence and rollback still require board validation.

## Releasing without repository secrets

`firmware/build.sh` still produces factory/app binaries, app SHA-256, signature
and manifest. The signer defaults to the current firmware label `2.0.0`, stable, 100%; configure
`XORR_FW_VERSION`, `XORR_OTA_CHANNEL`, `XORR_OTA_ROLLOUT_PERCENT`,
`XORR_RELEASE_NOTES`. To generate a patch also supply `XORR_OTA_BASE_IMAGE`
(previous app.bin path) and `XORR_OTA_FROM_VERSION`. `delta.bin` is written only
when beneficial. `XORR_SIGNING_KEY` remains an externally managed offline path.
No release signing command or private-key access is part of V6 verification;
tests generate temporary signers in memory. Never commit key material.
