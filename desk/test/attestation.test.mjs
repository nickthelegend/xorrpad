import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { keypair, rawPublic, signHandshake, transcript, challenge } from "../main/pad-v2.mjs";
import { verifyDeviceAttestation } from "../main/attestation.mjs";
import { certificateText, attestationText, verifyAttestation, DeviceAttestation, attestationState } from "../renderer/ui/device-attestation.mjs";
import { deviceVerification } from "../renderer/ui/link.mjs";
import { issueCertificate } from "../../firmware/factory-cert.mjs";
import { PadLink } from "../main/padlink.mjs";
import { PadSimulatorV2 } from "../../tools/padsim/v2.mjs";
const repo = path.resolve(import.meta.dirname, "../..");
function unit() {
  const factory = keypair("ed25519"), identity = keypair("ed25519");
  const device = "esp32-123456abcdef", deviceKey = rawPublic(identity.publicKey);
  const certificate = issueCertificate({ serial: device, deviceKey }, factory.privateKey);
  const context = transcript(device, challenge(), challenge(), challenge(), challenge());
  const proof = { certificate, signature: signHandshake(attestationText(certificate, context), identity.privateKey) };
  return { factory, identity, roots: [rawPublic(factory.publicKey)], expected: { device, deviceKey, context }, proof };
}
const native = (proof, expected, roots) => {
  const result = spawnSync(path.join(repo, "firmware/build/attestation-driver"), [], {
    input: JSON.stringify({ ...proof, ...expected, root: roots[0] }) + "\n", encoding: "utf8",
  });
  assert.equal(result.status, 0, "run firmware/test/run.sh first");
  return result.stdout.trim() === "verified";
};
async function verdict(u, pass) {
  assert.equal(verifyDeviceAttestation(u.proof, u.expected, u.roots).verified, pass);
  assert.equal((await verifyAttestation(u.proof, u.expected, u.roots)).verified, pass);
  assert.equal(native(u.proof, u.expected, u.roots), pass);
}
test("factory chain and challenge verify identically in firmware, desk and portable XOR verifier", async () => {
  await verdict(unit(), true);
});
test("tampered certificate fields and signature fail in all three real verifiers", async () => {
  for (const field of ["deviceKey", "serial", "model", "signature", "v"]) {
    const u = unit(), c = u.proof.certificate;
    c[field] = field === "v" ? 2 : field === "serial" ? "esp32-000000000000" : field === "model" ? "clone" : "0".repeat(field === "signature" ? 128 : 64);
    await verdict(u, false);
  }
});
test("foreign factory, self-signed clone, missing certificate and key substitution fail", async () => {
  const foreign = unit(); foreign.roots = unit().roots; await verdict(foreign, false);
  const clone = unit();
  clone.proof.certificate = issueCertificate({ deviceKey: clone.expected.deviceKey, serial: clone.expected.device }, clone.identity.privateKey);
  clone.proof.signature = signHandshake(attestationText(clone.proof.certificate, clone.expected.context), clone.identity.privateKey);
  await verdict(clone, false);
  const missing = unit(); delete missing.proof.certificate; await verdict(missing, false);
  const substituted = unit(); substituted.expected.deviceKey = unit().expected.deviceKey; await verdict(substituted, false);
});
test("fresh challenge, nonce and ECDH keys reject replayed connection proofs", async () => {
  for (const index of [2, 3, 4, 5]) {
    const u = unit(), parts = u.expected.context.split("|"); parts[index] = challenge();
    u.expected.context = parts.join("|"); await verdict(u, false);
  }
  const u = unit(); u.proof.signature = "0".repeat(128); await verdict(u, false);
});
test("strict certificate schema, encodings, device binding and absent trust fail closed", async () => {
  for (const mutate of [u => u.proof.certificate.extra = true, u => u.proof.certificate.v = "1", u => u.expected.device = "other", u => u.expected.context += "|extra", u => u.proof.signature += "00"]) {
    const u = unit(); mutate(u); await verdict(u, false);
  }
  const u = unit();
  assert.equal(verifyDeviceAttestation(u.proof, u.expected).verified, false);
  assert.match((await verifyAttestation(u.proof, u.expected)).reason, /Setup required/);
  assert.equal((await verifyAttestation(u.proof, u.expected, u.roots, null)).verified, false);
  assert.throws(() => certificateText({}), /certificate/);
});
test("XOR controller resets genuine state on disconnect and consumes only one proof", async () => {
  const u = unit(), controller = new DeviceAttestation(u.roots);
  assert.equal(controller.state.label, "Unverified device");
  controller.begin(u.expected);
  assert.equal((await controller.finish(u.proof)).label, `Genuine xorrpad #${u.expected.device}`);
  controller.reset();
  assert.equal((await controller.finish(u.proof)).verified, false);
  controller.begin(u.expected);
  const pending = controller.finish(u.proof); controller.reset();
  assert.equal((await pending).verified, false, "late verifier result cannot restore disconnected genuine status");
});
test("desk verification UI labels genuine, unverified and legacy devices explicitly", () => {
  const u = unit(), attestation = verifyDeviceAttestation(u.proof, u.expected, u.roots);
  assert.match(deviceVerification({ secure: true, attestation }), /Genuine xorrpad #esp32-123456abcdef/);
  for (const p of [{}, { secure: false, attestation }, { secure: true, attestation: attestationState() }]) {
    const html = deviceVerification(p); assert.match(html, /Unverified device/); assert.match(html, /data-verified="false"/);
  }
  assert.doesNotMatch(deviceVerification({ secure: true, attestation: { reason: '<script>bad</script>' } }), /<script>/);
});
test("offline factory keygen rejects repo and symlink destinations without opening any key", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "xorr-factory-path-"));
  const run = out => spawnSync("sh", [path.join(repo, "firmware/factory-keygen.sh"), out], { encoding: "utf8" });
  try {
    const inside = path.join(repo, "firmware", "must-not-create-factory-key");
    assert.notEqual(run(inside).status, 0); assert.equal(existsSync(inside), false);
    symlinkSync(repo, path.join(dir, "repo"));
    assert.notEqual(run(path.join(dir, "repo", "must-not-create")).status, 0);
    const outside = path.join(dir, "offline");
    assert.equal(run(outside).status, 0);
    assert.equal(statSync(path.join(outside, "factory-ed25519.pem")).mode & 0o777, 0o600);
    assert.equal(statSync(outside).mode & 0o777, 0o700);
    assert.notEqual(run(outside).status, 0, "never overwrite authority");
    const ignored = spawnSync("git", ["check-ignore", "firmware/factory-keys/material", "factory-ed25519.pem", "unit.device-cert.json"], { cwd: repo });
    assert.equal(ignored.status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
async function wait(fn) {
  for (let n = 0; n < 300; ++n) { if (fn()) return; await delay(10); }
  throw Error("attestation integration timeout");
}
for (const serial of [false, true]) for (const mode of ["genuine", "foreign", "missing"]) {
  test(`real encrypted padsim ${serial ? "USB CRC" : "TCP"} attestation ${mode}`, async () => {
    const u = unit(), dir = mkdtempSync(path.join(tmpdir(), "xorr-attest-link-"));
    const bridge = new PadLink({ dir, factoryRoots: mode === "foreign" ? unit().roots : u.roots });
    const pad = new PadSimulatorV2({ device: u.expected.device, identity: u.identity, certificate: mode === "missing" ? undefined : u.proof.certificate, serial, fragmentBytes: 73 });
    pad.firmware="3.0.0";
    let peer;
    try {
      await pad.listen(8728);
      peer = bridge.attach(net.createConnection(8728, "127.0.0.1"), serial ? "usb" : "tcp");
      await wait(() => bridge.pendingPairings.has(pad.device)); bridge.pair(pad.pairing);
      await wait(() => bridge.snapshot().devices.length === 1);
      assert.equal(bridge.snapshot().devices[0].attestation.verified, mode === "genuine");
      assert.equal(bridge.snapshot().devices[0].firmware,"3.0.0");
      assert.equal(bridge.snapshot().devices[0].secure, true, "v2 compatibility remains");
      bridge.remove(peer); assert.equal(bridge.snapshot().devices.length, 0);
    } finally { bridge.close(); await pad.close(); rmSync(dir, { recursive: true, force: true }); }
  });
}
