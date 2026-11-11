# T2 signals, permission policy and signing

Phone-wallet mode remains the default. Every venue adapter still only reads or
builds unsigned transactions. The optional `Executor` owns local signing,
submission, confirmation and receipt persistence.

## Policy

`permissions.json` lives under Electron's `userData`; Node uses
`XORR_USER_DATA`, or the platform app data directory. It contains only validated
public policy fields. Unknown fields are refused. Authenticated `GET /permissions`
reads the policy; `POST /permissions` replaces it (omitted fields get defaults).

| Field | Default / meaning |
|---|---|
| `autoAccept` | `{ "venues": {}, "kinds": {} }`; the selected venue **and** kind must both be `true` |
| `maxTradeUsd`, `maxDayUsd` | 100, 300; permission caps refuse rather than enlarge a memory-sized trade |
| `maxLeverage`, `maxOpenPositions` | 10, 10; open positions include pending execution reservations |
| `marketAllowlist`, `marketDenylist` | `null` (memory still restricts markets), `[]`; deny wins |
| `venueAllowlist` | `null`; optional additional venue restriction |
| `cooldownSeconds` | 0; counts executed journal entries and outstanding reservations |
| `quietHours` | `null`, or `{ "start": "23:00", "end": "07:00", "timeZone": "Asia/Kolkata" }` |
| `alwaysAskAboveUsd` | 100; larger trades require manual acceptance even if auto-accept is enabled |

Market names match the gate's exact `symbol`, including qualified catalog names
and `pmamm:<market public key>:<yes|no>`. Quiet hours use a named IANA timezone
(UTC if omitted), start inclusive and end exclusive. Equal endpoints mean a
full day. Memory vetoes run first. Memory can shrink a proposal; permission
policy can only restrict it. Verdicts include `ruleId`, the applied `rules`,
`why`, and `autoAccept`. Corrupt policy fails closed.

## Queue and events

`POST /signals` (or existing `/propose`) accepts the same `{kind, market, side,
size, leverage}` intent. `GET /signals` returns the queue. Native clients use
`Authorization: Bearer <PAD_TOKEN>` or `x-pad-token`, including on the WebSocket
upgrade. Browser clients can connect using subprotocols
`["xorrpad", "pad-token.<PAD_TOKEN>"]` when the token is a valid subprotocol
string. The server echoes only `xorrpad`. Query-string tokens are not accepted
on `/events`.

`/events` sends an initial queue snapshot, then `signal`, `speech`,
`wallet_request`, `submitted` and `receipt` events. Speech contains real Deepgram
PCM (base64, mono 16 kHz) and text for clients to play. If speech is unavailable,
automatic acceptance falls back to `awaiting` with a setup/error message. Signal
transitions and their deciding rules are journaled. A receipt contains the
confirmed signature, Explorer link, venue, cluster, USD size and confirmation
time; the same signature/link is available from `/pad`.

Manual and automatic paths are:

```text
proposed → awaiting → accepted → signed → executed | failed
         → auto_accepted → accepted
         → refused
awaiting / auto_accepted / accepted → refused | expired
accepted → failed
```

Refused and expired entries cannot sign. `POST /signals/:id/accept` refreshes
routing and gates the original approved size. `POST /signals/:id/refuse`
refuses it. Both require pad-token auth; wrong methods return 405. The default
expiry is 60 seconds, configured with `XORR_SIGNAL_TTL_SECONDS` (up to 86400).
Expiry also bounds an accepted unsigned phone request. Panic, kill and memory
wipe void waiting/unsigned accepted signals; a transaction already submitted
cannot be cancelled. The pad's YES/NO keys use the same queue.

## Session wallet and execution

Authenticated `GET /session-wallet` returns only `{publicKey}`. Local-machine
`POST /session-wallet` creates a wallet, or imports `secretKey` as a 64-byte JSON
array or base64 string. It never overwrites an existing wallet. Creation/import
and wallet-mode changes are local only. Do not place imports in shell history.
`GET /wallet/mode` reads the mode; local `POST /wallet/mode` with
`{"mode":"session"}` opts in (`"phone"` restores the default).

Electron requires working `safeStorage` encryption and never falls back to a
plaintext backend. Node uses the ignored `session-wallet.node.key`, created
with mode 0600; loading rejects group/world-readable files, symlinks and foreign
ownership. Private material is never returned or logged. Session signing needs
an accepted, unexpired gate capability bound to the exact message; it checks
permissions again immediately before signing. RPC genesis must match the
selected cluster. Mainnet local signing refuses unless the environment contains
exactly `XORR_ALLOW_MAINNET=I_ACKNOWLEDGE_REAL_FUNDS`.

Execution uses a process-wide trade lock, refreshes the gate before build and
sign/send, reserves budget durably, sends with preflight, confirms, and writes
receipts to the memory journal and `receipt` entities. `execution-ledger.json`
contains public accounting/receipt data, never keys. Unconfirmed or ambiguous
submissions keep their budget and position reservation, including across
restart; they are not retried automatically. Historical position reservations
are conservative until reconciled with actual positions. Inspect chain status
before manually changing the public ledger. A memory error after a confirmed
transaction returns/emits the real receipt with `memoryError`; durable ledger
evidence remains available for reconciliation.

Phone mode builds an exact unsigned message and a Solana Pay request URL using
the existing public HTTPS URL variables. The wallet can return a signed base64
transaction via authenticated `POST /signals/:id/sign` with `signedTx`, which
is signature-checked and sent/confirmed. If the phone already submitted it,
post `signature` instead: the executor requires a successful confirmed on-chain
transaction matching the exact accepted message. A signature for another
transaction cannot produce a receipt. Public TLS and phone end-to-end behavior
still need a reachable configured phone wallet.

## Verification

Targeted checks:

```sh
node --test desk/test/permissions.test.mjs desk/test/signals.test.mjs \
  desk/test/session-wallet.test.mjs desk/test/executor.test.mjs \
  desk/test/signals.http.test.mjs desk/test/session-wallet.live.test.mjs
```

The live signature test builds a real pm-AMM devnet transaction and verifies
its actual Ed25519 signature locally, without broadcasting. No API responses,
quotes or chain receipts are mocked. Pure unit parameters exercise individual
rules, state transitions and public ledger accounting. The live funded cycle
is separate: `node desk/test/t2-devnet.mjs`. Funding details and measured counts
are in [TESTING.md](../../TESTING.md#v1-t2-step-5--session-wallet-devnet-proof-blocked).
