# Pad simulator

Install desk dependencies (`npm ci --prefix desk`), then:

```
node tools/padsim/index.mjs --listen 8711
node --test desk/test/padlink*.test.mjs
```

TCP listens only on loopback, ports 8710–8729. The tests connect the actual
`PadLink` byte-stream adapter to it. Records are fragmented into small writes
to exercise CDC/BLE-style reassembly. Stdin accepts exact v1 NDJSON records;
stdout prints desk records. The simulator automatically sends hello and
acknowledges validated keymaps. It does not invent market or voice responses.

Both versions keep received funding records in `pad.fund`, portfolio records
in `pad.portfolio`, and the original messages in `pad.history`. They render no
fake QR or balances. Use the real firmware renderer in `tools/uipreview` for
screenshots. The desktop requests a funding screen with authenticated local
`POST /agent-wallet {"action":"fund"}`; `pad.key('fund')` exercises the same
request as the firmware's one-second PORTFOLIO hold. `pad.key('portfolio')`
requests balances. A connected v1 test peer must send its normal heartbeat
while waiting between reads; the desk expires inactive links after 15 seconds.

For a serial/PTY exercise, create a pair with `socat`:

```
socat -d -d pty,raw,echo=0 pty,raw,echo=0
node tools/padsim/index.mjs --pty <first-pty>
PORT=8710 HOST=127.0.0.1 XORR_PAD_SERIAL=<second-pty> node desk/main/server.mjs
```

Use the two paths printed by socat. Backend startup uses its existing token
and memory setup. The PTY uses the same installed `serialport` package as USB;
TCP/PTY tests do not prove USB electronics, BLE radio timing, mic capture, amp
playback or NVS survival across device power cycles.


The automated PTY test uses Python's standard `pty` module via
`pty_bridge.py`, then opens both real PTYs with `serialport`; no socat install
is required for that test. The manual socat recipe above is an alternative.

The live tests propose a real devnet pm-AMM outcome from a programmable key,
then accept it through the same queue/executor. Missing phone-wallet setup
must fail without a receipt. The funded-cycle test uses a dedicated local test
wallet in ignored `desk/.t4-devnet/` (never another wallet, never `.env`). It
checks real devnet genesis, SOL and mUSDC balances before signing. With less
than 0.01 devnet SOL or 1 mUSDC it prints only the public funding address and
skips. After funding, rerun the test command above to execute the real 1 mUSDC
key → signal → accept → confirmation → receipt path. It never sends mainnet.
A separate receipt-delivery check reads and replays a real historical devnet
confirmation; it is explicitly not evidence of a newly executed trade.

## Firmware v2 end-to-end tests

The CLI starts `PadSimulatorV2` by default. Pair through the desk using the
simulator's displayed QR/public identity and code. Protocol details are in
[FIRMWARE-PROTOCOL-V2.md](../../docs/v2/FIRMWARE-PROTOCOL-V2.md).

```sh
node --test --test-concurrency=1 desk/test/pad-v2*.test.mjs
npm test --prefix desk
firmware/test/run.sh
```

`pad-v2.e2e.test.mjs` runs real desk routes and cryptography over fragmented
TCP and CRC-protected serial records. It checks encrypted wire envelopes,
matching live-quote fingerprints, independent desk rejection of a wrong
fingerprint/short hold, hold cancellation, receipt delivery, signed OTA,
disk-backed kill across a new simulator instance, and replay rejection in both
directions. The receipt is a separately verified historical devnet transaction;
these tests do not claim that accepting their proposal produced a new fill.

The OTA case requires the existing compiled, signed public release artifacts
`firmware/build/artifacts/app.bin` and `manifest.json`, matching the pinned OTA
public key. It never opens a signing key or runs key generation/signing.
Missing artifacts fail the test; obtain them from an authorized release build.
It checks a valid transfer, missing/bad signatures, and corrupted image bytes.
Cryptographic protocol fixtures are test material, not market prices or fills.
Live quote/receipt cases require public devnet RPC access and a liquid market;
provider outages are reported as explicit skips, not simulated successes.

Disk persistence models NVS semantics only. Physical hold timing, BLE security
and throughput, flash writes, power-loss persistence and OTA boot/rollback need
the board. Firmware remains **compiled, not yet flashed**.

## Firmware v3 scenario runner

Build the native adapters with `firmware/test/run.sh`, compile the current
normal image to `firmware/build/v7-normal-out` (commands in firmware/README.md),
then run `node tools/padsim/v3.mjs`. It runs clear-sign, pad-signer, attestation,
abilities, offline-alert, crew and OTA test files sequentially to avoid port
collisions. OTA uses the new compiled image; `XORR_OTA_TEST_IMAGE` can explicitly
select another compiled image. The old public signed bootstrap artifacts are
still required by the OTA tests; no signing key is read.

The runner then pairs an encrypted native-backed pad on loopback 8725, verifies
real devnet genesis and mint state, approves its stored policy, and clear-reviews
and signs a live SDK `transferChecked` message. The transfer is one base unit of
the real devnet collateral **to the signer's own associated token account**.
It independently verifies Ed25519 and broadcasts those exact bytes only when
the signer has at least 0.01 devnet SOL and one collateral base unit in its ATA.
The funding instruction requests 1 mUSDC for convenience. It creates no token
account, requests no airdrop, and submits nothing on mainnet.

The exact public signer/ATA are printed before the balance check. To fund this
ephemeral identity while it exists, run
`node tools/padsim/v3.mjs --funding-wait=300` (0–3,600 seconds), or add
`--broadcast-only` to run only the live path. Private material stays in native
process RAM; only public policy/accounting reaches the temporary directory.
The address cannot be reused after process exit. Simulated reboot retains the
RAM identity and reloads accounting; it does not establish physical NVS recovery.

`V3 TOTAL` reports regression tests/pass/fail/skip totals and explicit BLOCKED
reasons. Missing funding/provider access is BLOCKED, never a passed broadcast;
a failing regression, invalid signature or wrong genesis exits nonzero.
Attestation tests missing from a committed checkout are also explicitly BLOCKED;
an uncommitted working-tree test does not establish committed feature delivery.
Do not run the runner alongside the desk suite because they share test ports.

Firmware v4 F1: `PredictPadSimulator` from `predict.mjs` extends the encrypted
native-session simulator. It receives actual `predict` / `outcome_positions`
records, pages the market catalogue with `scroll(delta)`, and maps an idle
`key('yes')` or `key('no')` to a proposal. With a decision pending those same
keys retain trusted acceptance/refusal and hold checks. An empty/stale feed
cannot propose; an outcome card consumes its closing key. The real-route
scenario and 1440/375 captures run in `desk/test/pad-predict.test.mjs`.


Firmware v4 F2 extends `PredictPadSimulator` with actual `perps` and `liq_guard`
records. A first YES/NO on a fresh guard sends `liq:yes`/`liq:no` plus its episode
ID. Pending signal confirmation keeps the existing native-signing path. Stale
alerts cannot propose. `desk/test/pad-perps.test.mjs` checks pure boundary vectors,
permissions, integer half-close sizes, live-or-Setup HTTP, encrypted delivery and
1440/375 desktop captures. External API responses are never mocked; no funded
perp position or live reduction is claimed.

Firmware v4 F3: `TiltPadSimulator` from `tilt.mjs` extends the Predict simulator
and delegates discipline settings, approvals, fills and reboot state to the real
`firmware/build/tilt-driver` C++ executable. Pass a temporary `sessionStateFile`;
its `.tilt.json` companion holds public counters/deadlines only. No existing key
file is read. `pad.reportTilt()` sends authenticated firmware state; counters
cannot be reset over the desk link. Explicit `now` arguments belong only to the
native test driver for UTC rollover tests, never to desk protocol messages.
Run `bash firmware/test/run.sh` first to build the driver, then the focused
`desk/test/pad-tilt.test.mjs` scenario. Its local reservation/close vectors are
accounting tests, not claims of external financial data or executed trades.


F4: `FlattenPadSimulator` (`flatten.mjs`) extends the F3 native-accounting pad.
After its unchanged `kill(2000)`, the encrypted desk sends a `flatten` record.
`key('yes', {heldMs:800})` answers only a live reduce-only awaiting plan;
`key('no')` keeps the latch on. Ordinary keys stay blocked. Re-arm continues
through `pressConfirm()` / `confirm()` after a desk request. The native signing
review is available only for the executing plan's granted child ID. Run
`SIBYL_PY=$PWD/.venv/bin/python node --test --test-concurrency=1 desk/test/pad-flatten.test.mjs`.


F5: `PadSimulatorV2` persists `sounds` from authenticated config, exposes
`chime(kind)` and records whether local policy makes it audible. Notifications
use the real encrypted link, and the desktop's 3D mirror plays WebAudio from the
production shared table. The F3 extension also emits a cooldown transition.
Build `earcon-driver` with `bash firmware/test/run.sh` before running
`desk/test/pad-earcons.test.mjs`; this compares every native PCM sample to the
browser synthesis input and verifies actual WebAudio playback, mute, settings,
state reload and screenshots. Explicit audio events never fabricate a trade.

F6: `AmbientPadSimulator` in `ambient.mjs` extends the existing flatten/tilt/
signing simulator. Its `idle(now)` and physical `key`/`knob` gestures delegate
to `firmware/build/ambient-driver` (production C++ idle and wake gates). Tests
advance its public monotonic clock explicitly; no external API is intercepted.
`pad_view` records expose Home/Ambient to the mirror without action authority.
