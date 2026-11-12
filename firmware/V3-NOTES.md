# Firmware v3 — V1 clear signing and V2 session signing

V1 implements V3-SPEC item 1; V2 adds the conservative item-2 implementation described below. **Compiled, not yet flashed.** This is an incremental
implementation, not the completed eight-item v3 release. The existing 2.0.0
firmware label and v2/legacy paths remain until the full v3 release is ready.
V1 review-only approvals remain available. V2 signs the same uploaded message
without rebuilding it and adds a desk executor mode. Attestation remains future work.

## Proven behavior

- The native reader accepts canonical legacy/v0 headers, static account keys,
  blockhash, compiled instructions and v0 lookup indices; rejects truncation,
  trailing bytes, oversized counts, invalid indices, duplicate keys, duplicate
  table evidence, unknown message versions and invalid signer/header counts.
- Lookup evidence contains the table address, owning program, complete binary
  account data and desk-resolved addresses. Firmware checks the table state,
  bounds and every writable/readonly index, preserving Solana's global
  writable-then-readonly account order.
- Decoders cover System transfer; SPL Token and Token-2022 transfer and
  transferChecked; ComputeBudget; pm-AMM's six swap directions from SDK 0.2.0's
  actual IDL; Jupiter v6 route/shared_accounts_route; Phoenix perps IOC and
  limit-order packets from rise 0.7.10. ATA idempotent creation, SyncNative and
  token-account close are also decoded because the real builders emit them.
- Amounts stay uint64 integers. Screens explicitly show raw token units,
  decimals, Phoenix base lots/ticks, quoted/minimum output and fees/slippage
  encoded in the instruction. They do not turn arbitrary addresses into
  desk-supplied symbols or guess a USD value or network fee.
- SHA-256 covers precisely the serialized **message**, excluding signatures
  and all desk descriptions. Its first six base58 characters appear on the TFT,
  the review API response and the authenticated approval. The desk keeps the
  full 32-byte message hash and binds approvals to the encrypted session.
- Every review row has its own knob-selected page, with full addresses wrapped
  rather than clipped. Only a page actually drawn counts as reviewed. YES is
  gated on all pages, a fresh 800 ms hold, a live deadline, visible screen,
  paired connection, no OTA, and no kill latch. NO refuses immediately.
- Any unknown instruction/program, unsupported route-plan layout, unavailable
  input-mint proof or unauthenticated lookup table selects the red **Blind sign**
  screen. Blind signing defaults off in desk settings and firmware. Enabling it
  on the paired desk permits a fresh **3,800 ms** hold (800 + extra 3,000 ms).
  Release, page change, hidden screen, disconnect, failover, re-pair, expiry or
  policy revocation cancels the hold. Invalid messages never become blind-sign
  approvals. An approval is consumed once.

## Important limits of the actual wire formats

Jupiter mints are **account references**, not both instruction-data fields.
Ordinary `route` omits the input mint entirely. For an ATA source, the desk can
supply a candidate mint and bump; firmware hashes the owner/token-program/mint
PDA seeds and checks the result against the actual source account in the
message. This establishes mint identity without trusting desk token-account
metadata. Non-ATA sources without a proof stay blind. Shared routes contain
both mint account references. Dynamic/new unsupported route-plan variants stay
blind; the fixed variant layouts are generated from Jupiter's public on-chain
Anchor IDL, with its address, observed slot and inflated-content hash in
`logic/jupiter-layouts.h`. Regenerate with
`node firmware/test/generate-jupiter-layouts.mjs`.

Phoenix perps order data contains side, lots, optional price ticks, order flags,
minimum fills, matching limits and expiry; **it does not encode leverage**.
Market tick/lot-to-USD conversion and account-wide leverage require independently
verified market/account state. V1 displays exact native units and the missing
leverage disclosure; item 2 must not enforce leverage using a desk assertion.

A desk-supplied lookup-table account is not a cryptographic chain-state proof.
Even though all resolved addresses are checked against its binary data, a
compromised desk could replace both. Consequently **all lookup-bearing messages
stay blind** until a separately trusted chain-state source exists. This is an
explicit safety boundary, not a claim that raw RPC data authenticates Solana.

Phoenix and Jupiter have no devnet deployment in the v1 adapters. Their captured
fixtures are genuine **unsigned mainnet** builder results, never transactions
sent by tests. pm-AMM, System and SPL fixtures use live devnet data/blockhashes.
The script calls the real shipped v1 builders and SDK instruction constructors;
no fixture message is hand-authored. SDK-only token exercises are unsigned
parser fixtures, not claims that the public payer owns funded token accounts.

## Reproduce

- `node firmware/test/generate-solana-fixtures.mjs` captures twelve unsigned
  fixtures. Public-provider failure exits nonzero with setup information;
  it never creates a replacement fixture or loads/generates a private key.
- `firmware/test/run.sh` runs native parsing, decoding, fingerprint, table/mint
  evidence, upload, hold and approval tests alongside all v2 native tests.
- `node --test desk/test/clear-sign.test.mjs` verifies exact captured bytes,
  chunk offsets/digests, default-off persisted settings and a real paired,
  encrypted TCP pad-simulator session. It refuses blind approvals while off,
  short holds, wrong fingerprints and replayed approvals. No trade is submitted.
- `npm test --prefix desk` runs the full desk suite.
- `make -C tools/uipreview && ./tools/uipreview/preview firmware/build/v3-ui 2`
  renders the actual GFX clear-review/red-disabled/extra-hold screens.

`POST /pad/clear-sign` uses existing desk authentication. Body:
`{device, signalId, unsignedTx, cluster, remainingMs:120000, inputMint?}`.
The desk verifies the RPC genesis, fetches any public lookup accounts, builds
optional ATA mint proofs, and sends ordered `clear_begin/clear_chunk/clear_end`
frames over the existing encrypted v2 protocol. Frames remain below 4 KiB;
uploads are bounded to 96 KiB on the desk / 128 KiB on the pad, expire after
30 seconds, and are bound to a connection epoch and SHA-256. Responses are
`clear_approval` events containing acceptance, blind status, hold duration,
fingerprint and the full message hash on the desk. This endpoint is for review;
it does not bypass the executor's proposal/permissions/acceptance lifecycle.

The final counts, exact build commands and sizes are in [TESTING.md](../TESTING.md)
and [README.md](README.md). Physical knob/TFT readability, actual button timing,
BLE throughput, power-loss, and board integration still require Nick's hardware.
No image was signed/flashed, no eFuses were changed, and nothing was pushed.


## V2 — session signing (2026-11-12)

**Compiled, not yet flashed.** This is fail-closed signing support, not a claim
that every venue can currently execute under independently verified USD/leverage
caps. The actual Phoenix packet has no leverage field; both captured long/short
orders must be refused. Fabricating a decoder field or accepting the desk's
leverage assertion would violate the item-2 trust boundary.

### Firmware trust boundary

- A separate Ed25519 session seed is generated on-pad with ESP32 entropy, stored
  once in the `xorrsession` NVS namespace, and never exported. Only its base58
  public key and detached message signature cross the encrypted v2 link. No
  import path is needed because the spec permits generation **or** import.
- `Preferences` uses the default NVS partition. When flash encryption is enabled,
  signing initialization refuses a build without `CONFIG_NVS_ENCRYPTION` before
  opening or generating session material. With that configuration enabled, IDF
  initializes encrypted default NVS. Production must provision its key partition;
  this work enables no encryption, secure boot, eFuses, or flashing. See
  [Espressif's NVS encryption contract](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-reference/storage/nvs_encryption.html).
- Policy updates require every policy page to be drawn plus a fresh 3.8-second
  physical hold. Disconnect, KILL, OTA, expiry, hidden screen or release cancels
  confirmation through the existing clear-sign safety gates. There is no desk
  configuration message that silently raises a stored cap or enables auto signing.
- Policy contains integer micro-dollar `trade`/`day` caps, an explicit collateral
  `mint`, `maxLeverage:1`, the complete top-level `programs` allowlist, and
  default-off `autoTrade:0`/`market:""`. Maximum 16 programs. Auto signing requires
  the exact stored program/mint and swap market or transfer destination plus its
  amount ceiling. Policy replacement does **not** clear the debit journal.
- Only mainnet USDC and the v1 pm-AMM devnet six-decimal collateral mint are
  accepted denominations. Caps measure nominal dollar-token **input**, with no
  host prices or symbols. They are not a depeg oracle or a cap on SOL network
  fees. The policy review discloses the denomination and network-fee exclusion.
- Each instruction is checked against the allowlist and decoded exposure is
  summed with overflow checks. Supported exposure is SPL/Token-2022
  `transferChecked` and pm-AMM collateral-input swaps; a zero-price ComputeBudget
  may accompany them. Unchecked transfers, arbitrary tokens, unbounded priority
  fees, native SOL, rent-bearing ATA creation, unknown instructions, blind/table
  exposure, Jupiter routes without independent valuation, and Phoenix without
  verifiable leverage are refused even when blind review is enabled. The shipped
  pm-AMM builder currently includes ATA setup, so those full builder messages are
  deliberately refused. Clear review remains available for all V1 decoders.
- Manual signing requires every decoded page and an 800 ms hold; a matching
  pad-stored auto policy can authorize with zero hold. Firmware authorization
  rechecks this independently of the desk. It requires exactly one signer, the
  session public key as payer, and the same SHA-256 over the exact signed bytes.
- The rolling counter keeps up to 64 timestamped debits. A full journal refuses
  further signatures. Each successful signing authorization durably writes the
  entire updated NVS journal **before** Ed25519 signs; a refused transaction,
  missing receipt, crash after reservation, or network timeout never refunds it.
  NVS errors, malformed state and missing usage beside a policy fail closed.
- There is no independently trusted wall clock across power loss on this board.
  Age therefore advances by powered uptime, conservatively excluding all time
  powered off and all unsaved time before reboot. Each debit expires only after
  a full 24 hours counted this way. It is rolling rather than calendar-day reset,
  and reboot/time assertions from the desk cannot restore budget. A trusted RTC
  would be needed to reclaim exact wall-clock downtime safely.

### Desk API and simulator

`POST /wallet/mode {"mode":"pad"}` selects the persisted executor mode next to
`phone` and `session`. `GET /pad/session?device=...` returns the encrypted online
pad's public key and stored policy. `POST /pad/session {device,policy}` waits for
physical policy approval. Exactly one paired preferred live transport is required;
multiple pads require an explicit device for the management API. The executor
currently requires one connected pad. The link snapshot exposes `sessionSigner`.

Policy example (public parameters; use integer micro-dollar units):

```json
{"trade":10000000,"day":50000000,"autoTrade":0,"maxLeverage":1,
 "mint":"3WQ8hCqTNwjrh8WzE2XyoZoUrd1miPcwWfMkmFPUMEWZ","market":"",
 "programs":["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"]}
```

The executor still refreshes the quote, applies permissions/arming/expiry,
reserves its ledger, verifies RPC genesis and enforces the existing mainnet
acknowledgment. It sends `sign:true` in the authenticated clear upload, then
checks signer identity, exact hash and real Ed25519 before submitting that same
transaction. It re-gates after the pad response and again before submission.
A refused or disconnected pad never falls back to another wallet. Responses are
single-use, request/message-bound and connection-bound, with a timeout. The
review-only `/pad/clear-sign` path always forces `sign:false`. Auto signing is
published/logged and spoken through the desk voice path; voice failure emits a
`pad_signer_speech_error` event.

`firmware/test/run.sh` also builds `firmware/build/session-driver`.
`tools/padsim/session.mjs` connects the existing encrypted simulator to that
native process: it uses the production parser, approval, caps, rolling journal
and real Ed25519. Its ephemeral key exists only in process RAM. Simulated reboot
reconstructs accounting/policy from a public-only file while retaining that
in-memory identity; this does not prove physical NVS or hardware key recovery.
The tests build unsigned messages using the actual SPL SDK and a captured real
devnet mint/blockhash. No RPC responses or signatures are fabricated and no
transaction is broadcast. Run firmware tests before the desk suite.

Devnet broadcast is **BLOCKED** until a real pad is flashed/paired and its returned
session public key is funded with SOL and collateral in pre-existing token
accounts. `GET /pad/session` supplies the exact public key to fund; there is no
stable test identity to fund because simulator private material is never saved.
The full v3 funded-padsim broadcast criterion is consequently not claimed here.
Physical NVS power-cut atomicity, encrypted NVS provisioning, real hold timing,
TFT policy readability, and funded end-to-end execution still need hardware.

## V4 — Abilities SDK (2026-11-12)

**Compiled, not yet flashed.** V3-SPEC item 4 adds the pinned wasm3 interpreter,
two persistent ability slots, developer-approved signed installs, the desktop
Abilities screen, C/AssemblyScript templates and Market Pulse/Pomodoro samples.
[SDK instructions](../sdk/abilities/README.md) document the complete ABI and
external signing workflow. No private signing material is shipped or read.

The only host imports are `xorr.widget`, `xorr.macro`, `xorr.price` and
`xorr.chime`, authorized respectively by the four specified capabilities. No
signer, link/trade frame, native pointer, file, network or WASI import exists.
Macros affect the ability's own local view; they cannot synthesize physical
YES/KILL or create desk key frames. Price is a read of the current desk cache,
not a fabricated quote or an autonomous trade. Missing/stale data returns zero.

The pad stores one trusted developer public key after a fresh physical 800 ms
hold over the full displayed key. A timeout, hidden/unhealthy display, pairing,
kill, busy state or connection change cancels approval. Changing developer
removes the old abilities. The manifest signs identity, sorted capabilities,
WASM hash/size, ABI and resource limits through a domain-separated canonical
payload. The desk and pad independently verify Ed25519 and the exact digest.
Ordered uploads are connection-bound and expire after 30 s; only verified,
compiled modules reach the atomic NVS record. Boot re-verifies stored code.
Factory reset already erases the selected `profiles` NVS partition.

Resource limits cover bytecode size (32 KiB), per-module linear memory (1–4
64 KiB pages), a 16 KiB VM stack, parser/function/global counts, a shared 768 KiB
engine heap (including compiled code), per-invocation dispatch fuel, a separate
20 ms dispatch deadline and at most sixteen bounded host calls. The engine
allocator uses PSRAM on ESP32. Bytecode/staging/display buffers are separately
bounded and additional to the engine heap cap. All outputs are staged; traps
stop the module and discard those effects. One module's globals and outputs
are isolated from the other slot. Untrusted widget text has a labelled screen
and cannot cover a trusted signal, kill, pairing, factory or OTA screen.

Native attacks exercise forbidden signing/trade imports, undeclared imports,
forged signatures, changed code/limits, out-of-bounds native-host pointers and
WASM memory, recursion, infinite loops, memory growth, macro abuse, host-call
floods, malformed section envelopes, upload ordering/expiry and stale sessions.
The encrypted padsim deliberately bypasses the desk import check and proves
that the actual firmware interpreter refuses developer-signed signing access.
Both samples and both language templates run on that same engine. Test signing
identities are generated only in process memory; only public signed inputs
cross to the native driver. No test transaction is broadcast for V4.

ASan/UBSan exposed an upstream misaligned 64-bit constant-table access; the
vendored compiler now uses `memcpy`. Initializer execution also receives a
metered runtime context and propagates traps. All dispatch paths, including
loop back-edges, are metered; growth above the manifest's backing allocation
is refused. The [vendor provenance](xorrpad/src/wasm3/README.xorrpad.md) lists
all local hardening. This is regression evidence, not formal proof that an
interpreter has no vulnerabilities. Production engine security review, physical
NVS power-loss/reboot tests, TFT/hold readability, PSRAM pressure and actual
watchdog/audio latency remain hardware work. Developer revocation lists and
ability downgrade prevention are outside ABI 1. Offline ability execution and
autonomous polling are outside this step; no offline input becomes a trade.

Full working-tree and isolated staged-source build/test evidence is recorded
in [TESTING.md](../TESTING.md). Existing unfinished attestation and other edits
are deliberately excluded from the V4 commit.

## V5 — Offline price alerts (2026-11-12)

`GET/POST /pad/price-alerts` selects `device`; POST supplies `alerts`, up to eight
`{id,mint,usd,above}` rules. The encrypted link sends rules to NVS. An empty list
clears them; replacement explicitly rearms them. Fired state is persisted before
TFT/LED/chime notification, so a reboot cannot refire an acknowledged trigger.
Only the paired online pad can read/change its rules. No alert calls trade,
signal, signing or key-event code. Link/OTA/kill state is rechecked when a worker
result is consumed. Kill remains the highest-priority screen and LED.

The worker calls `https://api.jup.ag/price/v3?ids=...` with the Amazon Root CA 1
certificate in `certs.h`, certificate/hostname verification enabled, no redirects,
a bounded 16 KiB response and connection/read deadlines. Attempts, including
failed ones, are at least 30 seconds apart across desk reconnects and millis
wraparound. A reboot resets the scheduling clock. Prices identify the exact mint
and require positive finite USD and a positive block ID; repeated/older blocks
cannot trigger twice. The first qualifying quote fires; these are one-shot
level alerts, not edge-crossing orders. Jupiter prices describe last swaps, not
a guaranteed current executable quote; HTTPS authenticates the provider rather
than a signed oracle payload. No price is used to authorize a trade.

[Jupiter's current API guide](https://developers.jup.ag/docs/price/index.md) documents
keyless access. Live API and chain were verified for this step. Hermes now
requires provider credentials, so the keyless Jupiter endpoint is used.
`node tools/padsim/price-alerts.mjs --capture` produces the real native fixture
without credentials; omit `--capture` for a live pinned-root smoke check.

Compiled, not yet flashed. Wi-Fi/TLS clock establishment, worker memory pressure,
NVS power failure and physical TFT/LED/chime behavior still need the board.

## V5 — Multi-pad co-sign (2026-11-12)

Item 6 adds a persistent, default-off desk policy, a native-reviewed device-key
approval path, executor quorum checks for all three wallet modes, a Connect
crew-policy/status panel and two encrypted padsim instances. See
[the wire/API and trust boundary](../docs/v3/CREW-PROTOCOL.md). Approvals cover
raw SHA-256 of the exact clear-reviewed message. They never replace a Solana
wallet signature and are not an on-chain multisig. Blind reviews and auto-accept
are not allowed for crew approvals.

The collector accepts distinct pinned device identities, finishes at N valid
approvals and cancels the rest. A consumed native approval cannot be signed
twice. Pending signal ID, message hash, encrypted session, live preferred
transport, hold, expiry, signature and current policy are rechecked. Spending
gates and crew checks run again before wallet signing and before submission.
A second connected pad no longer makes pad-signer selection ambiguous when
`/wallet/mode` supplies its `device`.

The USD threshold remains a desk policy based on its gated quote; crew pads
display decoded raw transaction amounts. A compromised desk can disable its own
policy. This feature provides coordinated independent reviews under an honest
coordinator, not an enforced treasury contract. Firmware device keys stay on the
pad. Simulator device identities are generated only in RAM; the native driver
applies firmware review/hold rules and Node signs the approved hashes. No new
transaction is broadcast by the crew tests.

Both normal/release firmware builds, native gates, two-pad encrypted integration,
HTTP authorization/validation and real desktop/mobile rendering are covered.
Final counts/sizes and the isolated source verification are in TESTING.md.
Physical display, holds, Wi-Fi and NVS still require hardware; compiled, not
yet flashed. Existing unfinished attestation work is excluded from both V5
feature commits.
