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
