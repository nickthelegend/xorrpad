# Device identity attestation

Firmware 3.0.0 and protocol v2. Compiled, not yet flashed. This certifies a device
identity key and fresh liveness; it does **not** measure firmware, enable secure
boot, or prevent clones after extraction of a software-held device key.

## Factory certificate and release roots

A certificate has exactly `v,deviceKey,serial,model,signature`: version 1,
32-byte lowercase hex Ed25519 public key, eFuse serial `esp32-<12 hex digits>`,
model `xorrpad-esp32s3`, and a 64-byte lowercase hex factory signature.
Ed25519 signs the ASCII bytes (no trailing newline):

```text
xorrpad-cert-v3\n1\n<deviceKey>\n<serial>\n<model>
```

Reviewed public factory roots must be pinned in all releases:

- firmware: `firmware/xorrpad/factory-public-key.h`;
- desk: `desk/renderer/ui/attestation-roots.mjs`;
- XOR phone: `src/pad/attestationRoots.ts` in the `xorr-solana` checkout.

These intentionally contain no production authority yet. Missing/foreign roots,
malformed certificates, identity mismatch and invalid/replayed proofs show red
**Unverified device**. A chain and fresh proof must both pass to show
**Genuine xorrpad #serial**. Test authorities are transient in-memory identities,
never production trust anchors. Desk constructor injection is for tests; network
messages and phone/desk settings cannot install a root.

## Offline issuance and USB provisioning

`firmware/factory-keygen.sh [external-directory]` generates an Ed25519 authority
outside the repository, mode 0700 directory / 0600 private file. It rejects
repository destinations, symlink escapes and overwrites before opening material.
The script has no network commands and never emits key contents. It was tested
with newly generated disposable material; no existing private key was opened.

An offline factory operator supplies the external key path in `XORR_FACTORY_KEY`
and runs `node firmware/factory-cert.mjs public-identity.json external-certificate.json`.
The input contains the actual eFuse serial/device public key obtained from that
unit. Only this explicit offline issuance command reads the factory key. Do not
run issuance as part of agent verification or ordinary build/test commands.
Distribute only the reviewed public root and per-unit signed certificate.

With the root baked into the factory image, hold 01+14 at boot. The factory monitor
accepts `XORR_DEVICE_CERT` pointing to the **public** certificate. It sends a CRC'd
USB-only `{v:2,type:"factory_cert",certificate}` until durable NVS acknowledgment
`factory_cert_result`. The firmware accepts it only in physical factory mode,
verifies the root/serial/model/key, and stores it in `xorrattest` NVS. Wi-Fi/BLE
cannot provision certificates. The existing signed physical self-test is retained.
Factory reset erases the certificate along with identity/pairing data.

## Desk connection proof

The v2 hello contains the pad's public keys and a device nonce. Pairing's fresh
ECDH transcript is:
`xorrpad-v2|device|padX25519|deskX25519|deskChallenge|deviceNonce`.
Alongside the existing pairing signature, `pair_proof` includes `certificate`
and `attestationSignature`. The device signs:

```text
xorrpad-attest-v3\n<certificate signing text>\n<factory signature hex>\n<transcript>
```

The desk checks its pinned root, connection serial/key, fresh challenge and
signature. `/desk/link` exposes the result after encrypted pairing completes.
The Connect screen uses the current connection result and clears it on failure
or disconnect. Encryption/pairing and attestation are separate: legacy and
uncertified pads retain their existing behavior but cannot claim genuine status.
Firmware labels 2.0.0 and 3.0.0 both retain protocol v2 compatibility.

## Independent XOR phone proof

The phone never promotes a desk-supplied verification boolean. On the actual BLE
hello, it generates two 32-byte random values locally with Expo Crypto and sends:
`{v:2,type:"attest_request",clientKey,challenge,nonce}`. This is a public liveness
challenge, not a signing request for funds. The firmware accepts it only over
BLE, checks the current offer nonce and strict request shape, and limits valid
requests to four per minute. It constructs the transcript using its **own**
serial and X25519 public key, `clientKey`, phone challenge and current pad nonce.
It returns `{v:2,type:"attest_response",certificate,signature}` using the same
domain-separated attestation text above. Missing certificates return no proof.

The phone verifies both signatures locally using strict RFC8032 Ed25519,
consumes each expectation once within 10 seconds, and resets trust on every BLE
connection boundary. A replay, expired proof, changed hello, foreign authority,
missing verifier or disconnect leaves the existing Pad card red/unverified.
Phone challenge records never pass through the desk relay. The relay preserves
original bounded v2 handshake/encrypted envelopes and v1 support; no offline
trade input is queued. The existing Pad styles are unchanged.

The phone implementation is committed in `xorr-solana`, branch
`xorrpad-v3-attest`, commit `86984ed`. Its 53 Pad tests include four checks against
the real native firmware verifier. No physical BLE/provisioned-phone success is
claimed until the release public roots and per-unit certificate are provisioned
and the board is flashed. No secrets were printed, no eFuses were changed and
nothing was pushed.
