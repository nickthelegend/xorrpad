# xorrpad Abilities SDK (ABI 1)

**Compiled, not yet flashed.** An ability is a developer-signed `.wasm` plus a
capability manifest. Two independent slots persist on the pad. No capability
exists for signing, key material, USB/BLE/Wi-Fi access or trade frames.

Build C templates and both samples from the repository root:

```sh
sdk/abilities/build.sh
# Override WASM_CC and WASM_LD for your LLVM clang/wasm-ld installation.
```

The default paths are Homebrew LLVM 20 and lld. No WASI/sysroot is needed.
For AssemblyScript: `npm ci --prefix sdk/abilities/assemblyscript`, then
`npm run build --prefix sdk/abilities/assemblyscript`. Both templates export
`void tick(i32 uptimeSeconds)`; use raw UTF-8 memory with the widget import.
Managed strings and pointers to native objects never cross the ABI. Modules
must not define a start function or import globals, memory or tables.

| Capability | Import from `xorr` | Behavior |
|---|---|---|
| `tft.widget` | `i32 widget(i32 pointer, i32 length)` | ASCII 32–126; up to 96 bytes in a dedicated labelled ability screen |
| `keys.macro` | `i32 macro(i32 action)` | Local ability view: 0 hide, 1 show, 2 reset/show. No synthetic physical keys or desk key frames |
| `alerts.price` | `i64 price()` | Current desk market price in micro-USD, 0 if missing/stale (15 s). No network or invented prices |
| `audio.chime` | `i32 chime(i32 sound)` | 0 soft notification, 1 timer completion; one request per invocation |

Market Pulse formats the actual current market price; Pomodoro discipline
tracks 25 minutes of uptime and chimes once on completion. Reboot/reinstall
restarts its timer. Slot widgets alternate every five seconds. Trusted trade,
kill, pairing, factory, error and OTA screens always take priority.

Limits: WASM ≤32 KiB; linear memory 1–4 pages (64 KiB each); VM stack 16 KiB;
≤128 functions, ≤64 globals; a shared engine heap budget of 768 KiB including
compilation; ≤16 host calls per tick. Manifests select 100–100,000 fuel units.
Fuel counts interpreter dispatch operations including loop/call edges. Each
tick has an independent 20 ms dispatch deadline. A trap stops that ability
until reinstall/reboot, discards its staged effects and reports the error.
Abilities run once per second only while paired, online and idle; they cannot
interrupt a trusted confirmation or act while killed/offline. These are not
hardware timing measurements. No I/O host call blocks inside the interpreter.

Create a signing request with public material only:

```sh
node sdk/abilities/tools/bundle.mjs prepare sdk/abilities/out/market-pulse.wasm \
  sdk/abilities/samples/market-pulse.json "$DEVELOPER_PUBLIC_KEY" sdk/abilities/out/pulse
```

Sign `pulse.signing.txt` as exact bytes (no trailing newline) using your external
Ed25519 signer. This SDK never reads, generates or stores private keys. Keep
all signing material outside the repository. Finalize using its detached
64-byte signature, encoded as 128 lowercase hex characters:

```sh
node sdk/abilities/tools/bundle.mjs finalize sdk/abilities/out/market-pulse.wasm \
  sdk/abilities/out/pulse.draft.json "$SIGNATURE_HEX" sdk/abilities/out/pulse.bundle.json
```

In **Desk → Abilities**, select a paired/rearmed pad. Enter the developer's
32-byte public key (64 lowercase hex characters); compare the full key with a
trusted source and the pad TFT, then hold physical YES for 800 ms. NO cancels.
A connection change, unsafe screen or 30 s timeout cancels approval. Trust
replacement deletes the old abilities. Refresh, select the signed bundle,
review capabilities, choose a slot and install. The desk and pad independently
verify the signature and digest; only the pad's durable trust authorizes it.
There is no automatically trusted developer or shipped private key.

The signed payload is UTF-8, joined by LF without a final LF:
`xorrpad-ability-v1`, id, name, version, sorted comma-joined capabilities,
memoryPages, fuel, sha256, size, developerPublicKey. ABI is fixed at 1; unknown
manifest fields/capabilities, duplicate/unsorted capabilities, out-of-range
limits, noncanonical hex and identity newlines are refused. Developer signature
covers the capability manifest, resource limits and exact WASM digest.

Install uses encrypted v2 `ability_begin` / ordered 256-byte hex
`ability_chunk` / `ability_end`, with correlated `ability_result` responses.
A 30 s connection-bound upload must finish and verify before storage changes.
One NVS blob commits the manifest and module together; boot re-verifies it.
Storage is the reset-wiped `profiles` NVS partition, not the small default NVS.
Factory reset removes developer trust and both slots. Developer revocation
lists and anti-rollback policy are not part of ABI 1; a trusted developer can
publish an older signed ability. Signing remains entirely outside this ABI.

Run `firmware/test/run.sh` and `npm test --prefix desk`. The native driver and
padsim use the exact embedded engine, rather than a JavaScript WASM substitute.
See `firmware/xorrpad/src/wasm3/README.xorrpad.md` for pinned upstream provenance,
local hardening and the remaining need for a production engine security review.
