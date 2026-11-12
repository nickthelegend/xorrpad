import { test } from "node:test";
import assert from "node:assert/strict";
import {
  keypair,
  rawPublic,
  transcript,
  sessionKeys,
  SecureSession,
  fingerprint,
  canonicalSignal,
  trustedSignal,
  crc32,
  wire,
  verifyManifest,
  manifestText,
  signHandshake,
  verifyHandshake,
} from "../main/pad-v2.mjs";
import { sign, randomBytes } from "node:crypto";
const signal = {
  fee: "0.25",
  market: "SOL",
  price: "150.5",
  side: "buy",
  signalId: "signal-1",
  size: "100",
  venue: "Jupiter",
};
test("CRC IEEE", () => assert.equal(crc32("123456789"), "cbf43926"));
test("canonical fingerprint independent of insertion order", () =>
  assert.equal(
    fingerprint(signal),
    fingerprint(Object.fromEntries(Object.entries(signal).reverse())),
  ));
test("fingerprint binds every field", () => {
  for (const k of Object.keys(signal))
    assert.notEqual(
      fingerprint(signal),
      fingerprint({
        ...signal,
        [k]:
          k === "side"
            ? "sell"
            : k === "fee"
              ? "0.5"
              : k === "price"
                ? "151"
                : k === "size"
                  ? "101"
                  : signal[k] + "x",
      }),
    );
});
test("invalid quote fails closed", () =>
  assert.throws(() => canonicalSignal({ ...signal, price: "" })));
test("trusted signal uses the executable route and prediction outcome", () => {
  const trusted = trustedSignal({
    id: signal.signalId,
    proposal: {
      signal: { symbol: "SOL", side: "BUY", outcomeSide: "yes", venue: "requested" },
      verdict: { sizeUsd: 100 },
      routing: { best: { venue: "executed", effectivePrice: 150.5, fees: { usd: 0.25 } } },
    },
  });
  assert.deepEqual(trusted, { ...signal, venue: "executed", side: "yes" });
  for (const side of ["long", "short"]) assert.doesNotThrow(() => canonicalSignal({ ...signal, side }));
  assert.equal(fingerprint(signal), "AgrJHn");
});
function sessions(serial = false) {
  const d = keypair(),
    p = keypair(),
    t = transcript(
      "unit-1",
      rawPublic(p.publicKey),
      rawPublic(d.publicKey),
      "00".repeat(32),
    );
  const dk = sessionKeys(d.privateKey, rawPublic(p.publicKey), "123456", t),
    pk = sessionKeys(p.privateKey, rawPublic(d.publicKey), "123456", t);
  assert.deepEqual(dk, pk);
  return [
    new SecureSession(dk.desk, dk.pad, { serial }),
    new SecureSession(pk.pad, pk.desk, { serial }),
  ];
}
test("X25519 encrypted bidirectional signal and ack", () => {
  const [a, b] = sessions();
  assert.deepEqual(b.open(JSON.parse(a.seal({ type: "signal", signal }))), {
    type: "signal",
    signal,
  });
  a.open(JSON.parse(b.seal({ type: "ack" })));
  assert.equal(a.pending.size, 0);
});
test("serial encrypted frame CRC", () => {
  const [a, b] = sessions(true);
  const m = JSON.parse(a.seal({ type: "signal", signal }));
  assert.equal(b.open(m).type, "signal");
  m.crc = "00000000";
  assert.throws(() => b.open(m), /CRC/);
});
test("replay rejected", () => {
  const [a, b] = sessions();
  const m = JSON.parse(a.seal({ type: "key", action: "yes" }));
  b.open(m);
  assert.throws(() => b.open(m), /replayed/);
});
test("ciphertext tamper rejected", () => {
  const [a, b] = sessions();
  const m = JSON.parse(a.seal({ type: "key" }));
  m.body = Buffer.from("tamper").toString("base64");
  assert.throws(() => b.open(m));
  assert.equal(b.received, 0);
});
test("ack tamper rejected", () => {
  const [a, b] = sessions();
  const m = JSON.parse(a.seal({ type: "key" }));
  m.ack = 1;
  assert.throws(() => b.open(m));
});
test("tag tamper rejected", () => {
  const [a, b] = sessions();
  const m = JSON.parse(a.seal({ type: "key" }));
  m.tag = "00".repeat(16);
  assert.throws(() => b.open(m));
});
test("wrong pairing code cannot decrypt", () => {
  const [a, b] = sessions();
  b.rx = randomBytes(32);
  assert.throws(() => b.open(JSON.parse(a.seal({ type: "ready" }))));
});
test("handshake signed by pinned identity", () => {
  const p = keypair("ed25519");
  const sig = signHandshake("transcript", p.privateKey);
  assert(verifyHandshake("transcript", sig, rawPublic(p.publicKey)));
  assert(!verifyHandshake("tampered", sig, rawPublic(p.publicKey)));
});
test("retry exponential and bounded", () => {
  const [a] = sessions();
  let now = 0;
  a.now = () => now;
  const line = a.seal({ type: "signal" });
  assert.deepEqual(a.retry(), []);
  now = 250;
  assert.deepEqual(a.retry(), [line]);
  now = 749;
  assert.deepEqual(a.retry(), []);
  now = 750;
  assert.deepEqual(a.retry(), [line]);
});
test("OTA real Ed25519 accepts correct image and rejects bad signature/hash", () => {
  const p = keypair("ed25519"),
    image = Buffer.from("firmware test image");
  const m = {
    version: "2.0.0",
    size: image.length,
    sha256: awaitHash(image),
    minDeskVersion: "1.0.0",
    notes: "test",
  };
  m.signature = sign(null, Buffer.from(manifestText(m)), p.privateKey).toString(
    "hex",
  );
  assert(verifyManifest(m, image, rawPublic(p.publicKey)));
  assert.throws(
    () =>
      verifyManifest(
        { ...m, signature: "00".repeat(64) },
        image,
        rawPublic(p.publicKey),
      ),
    /signature/,
  );
  assert.throws(
    () => verifyManifest(m, Buffer.from("bad"), rawPublic(p.publicKey)),
    /hash/,
  );
  assert.throws(
    () =>
      verifyManifest(
        { ...m, notes: "tampered" },
        image,
        rawPublic(p.publicKey),
      ),
    /signature/,
  );
});
import { sha } from "../main/pad-v2.mjs";
function awaitHash(b) {
  return sha(b).toString("hex");
}
