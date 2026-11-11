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
