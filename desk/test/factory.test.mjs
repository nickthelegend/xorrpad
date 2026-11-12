import { test } from "node:test";
import assert from "node:assert/strict";
import { keypair, rawPublic, signHandshake, wire } from "../main/pad-v2.mjs";
import { checks, verifyFactory, FactoryLines } from "../../firmware/factory.mjs";
const serial = "esp32-123456abcdef";
const key = keypair("ed25519");
const pk = rawPublic(key.publicKey);
function frame(overrides = {}) {
  const r = { serial, fw: "2.0.0", ...Object.fromEntries(checks.map(k => [k, true])), pass: true, ...overrides };
  const payload = JSON.stringify(r);
  return JSON.parse(wire({ v: 2, type: "factory_result", payload, pk, signature: signHandshake(payload, key.privateKey) }, true));
}
test("factory verifies a real Ed25519 report, CRC, unit identity and optional public key pin", () => {
  assert.equal(verifyFactory(frame(), serial, pk).pass, true);
  assert.equal(verifyFactory(frame({fw:"3.0.0"}), serial, pk).pass, true);
  assert.throws(() => verifyFactory(frame(), "esp32-000000000000"), /serial/);
  assert.throws(() => verifyFactory(frame(), serial, "0".repeat(64)), /signature/);
  assert.throws(() => verifyFactory(frame(), ""), /serial/);
});
test("factory rejects changed payloads, signatures, CRC and incomplete reports", () => {
  for (const field of ["payload", "signature", "pk", "crc"]) {
    const m = frame(); m[field] += "0"; assert.throws(() => verifyFactory(m, serial));
  }
  for (const change of [{fw:"1.0.0"},{keys:undefined},{mic:1},{pass:undefined},{pass:false},{wifi:false}])
    assert.throws(() => verifyFactory(frame(change), serial));
  const wrong = frame(); wrong.type = "telemetry";
  assert.throws(() => verifyFactory(JSON.parse(wire(wrong, true)), serial));
});
test("factory returns signed FAIL for every incomplete hardware check", () => {
  for (const k of checks) {
    const r = verifyFactory(frame({ [k]:false, pass:false }), serial);
    assert.equal(r.pass, false); assert.equal(r[k], false);
  }
});
test("factory serial framing survives fragmented boot output and bounds unterminated records", () => {
  const seen = [], lines = new FactoryLines(m => seen.push(verifyFactory(m, serial)));
  const bytes = "boot diagnostics\r\n{invalid\n" + JSON.stringify(frame()) + "\r\n";
  for (let i=0; i<bytes.length; i+=7) lines.feed(Buffer.from(bytes.slice(i,i+7)));
  assert.equal(seen.length,1); assert.equal(seen[0].serial,serial);
  assert.throws(() => lines.feed(Buffer.alloc(4096,65)), /oversized/);
});
test("factory rejects forged signatures even after an attacker recomputes serial CRC", () => {
  for (const field of ["payload", "signature", "pk"]) {
    const { crc, ...m } = frame();
    if (field === "payload") m.payload = m.payload.replace('"mic":true', '"mic":false');
    if (field === "signature") m.signature = "00".repeat(64);
    if (field === "pk") m.pk = rawPublic(keypair("ed25519").publicKey);
    assert.throws(() => verifyFactory(JSON.parse(wire(m, true)), serial), /signature/);
  }
});
