# Firmware v3 — V1 clear signing

V3-SPEC item 1 only. **Compiled, not yet flashed.** This is an incremental
implementation, not the completed eight-item v3 release. The existing 2.0.0
firmware label and v2/legacy paths remain until the full v3 release is ready.
There is no new wallet key, signing, submission, attestation or cap enforcement
in this step. An approval records the exact message digest; it does not execute
a trade. Item 2 must consume that same message without rebuilding it.

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
