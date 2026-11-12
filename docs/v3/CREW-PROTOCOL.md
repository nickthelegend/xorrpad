# Crew approval protocol (v3 item 6)

The authenticated desk API `GET /pad/crew` returns `{policy,rounds}`.
`POST /pad/crew` replaces the public policy:

- `enabled`: boolean, off by default.
- `aboveUsd`: finite nonnegative USD threshold; only sizes **strictly above** it
  need crew approval.
- `required`: integer 2–8.
- `members`: up to eight `{device,publicKey,name}` entries. `publicKey` is the
  lowercase hexadecimal Ed25519 **device/pairing public identity** (32 bytes).
  Device IDs and identities must be distinct. Enabling requires enough members
  and a current pairing for every configured identity.

Connect → Crew approvals edits this policy and shows the names of approvers.
Pairing is ephemeral; after a desk restart, pair crew pads again. The policy
persists, so missing pads block large trades rather than disabling the policy.
If several pads are connected, `POST /wallet/mode` can select the session signer
with `{mode:"pad",device:<paired device ID>}`. Phone/session-wallet modes also
pass through the crew gate.

The executor builds once, reserves the gate budget and uploads that exact
unsigned message to online crew pads through encrypted v2 frames. The standard
clear-sign request has `cosign:true`, `sign:false` and a random round signal ID.
Both modes true, nonboolean modes and any blind review are refused. The pad
shows its parsed instruction pages, hash fingerprint and crew-approval context.
All pages must have been drawn; a fresh 800 ms hold approves. NO refuses.

An approval is an encrypted `crew_approval` frame with `signalId`, `messageHash`,
`ok`, `heldMs`, `blind:false` and (on success) `signature`. The signature is
Ed25519 over the **raw 32 SHA-256 bytes**, not their hex text and not a Solana
transaction signature. The adapter uses the pad's device identity without
exporting it. This operation cannot authorize a transaction by itself.

The desk requires the pending round, exact message hash, original encrypted
session, preferred live transport, unexpired deadline, adequate hold and a valid
signature under the pinned member identity. One pad cannot count twice. Once
N distinct approvals arrive, remaining requests are cancelled. Refusal, expiry,
disconnect or an insufficient online quorum fails closed. Duplicate or stale
packets cannot count toward another round, including another round over the same
transaction bytes. Approval rounds are ephemeral and bounded to 50 status rows.

Before the wallet receives signing access, and again before submission, the
executor checks the accepted signal, arming/permissions, exact transaction hash,
current crew policy, quorum and deadline. A policy change invalidates old crew
receipts. Approvals are never substituted for the existing wallet signature or
on-pad spending caps. The threshold uses the desk's gated USD size, so a fully
compromised coordinating desk is outside this software policy's trust boundary;
this is not an on-chain Solana multisig account.

`tools/padsim/crew.mjs` runs separate simulated pads with real v2 pairing and
Ed25519 identities generated only in memory. Their native drivers run the same
firmware parser, bounded upload, reviewed-page and hold/consumption logic. Node
signs the consumed message hashes with each simulated device identity. Tests
use the captured real SPL builder transaction; no invented market quotes or
trade broadcast is involved. Physical TFT, hold timing and identity storage
remain compiled, not yet flashed.
