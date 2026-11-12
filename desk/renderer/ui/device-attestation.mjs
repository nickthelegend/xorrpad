/** Portable XOR/desk attestation contract. No Node, Buffer or secret material. */
import { FACTORY_ROOTS } from "./attestation-roots.mjs";
const hex = (s, n) => typeof s === "string" && new RegExp(`^[0-9a-f]{${n * 2}}$`).test(s);
const bytes = s => Uint8Array.from(s.match(/../g), x => parseInt(x, 16));
export function certificateText(c) {
  if (!c || Object.keys(c).sort().join(",") !== "deviceKey,model,serial,signature,v" ||
      c.v !== 1 || c.model !== "xorrpad-esp32s3" ||
      !/^esp32-[0-9a-f]{12}$/.test(c.serial) || !hex(c.deviceKey, 32) ||
      !hex(c.signature, 64)) throw Error("Invalid device certificate");
  return `xorrpad-cert-v3\n1\n${c.deviceKey}\n${c.serial}\n${c.model}`;
}
export function attestationText(c, context) {
  const cert = certificateText(c);
  // Bind the proof to the exact v2 ECDH keys, random challenge and device nonce.
  const parts = typeof context === "string" ? context.split("|") : [];
  if (parts.length !== 6 || parts[0] !== "xorrpad-v2" || parts[1] !== c.serial ||
      !parts.slice(2).every(x => hex(x, 32))) throw Error("Invalid attestation challenge");
  return `xorrpad-attest-v3\n${cert}\n${c.signature}\n${context}`;
}
export function attestationState(verified = false, serial = "", reason = "Device certificate or challenge proof missing") {
  return verified && /^esp32-[0-9a-f]{12}$/.test(serial)
    ? { verified: true, label: `Genuine xorrpad #${serial}`, tone: "good", serial, reason: "Factory certificate and fresh device proof verified" }
    : { verified: false, label: "Unverified device", tone: "bad", reason };
}
export async function verifyAttestation({ certificate, signature }, { device, deviceKey, context }, roots = FACTORY_ROOTS, subtle = globalThis.crypto?.subtle) {
  try {
    if (!subtle) throw Error("Setup required: Ed25519 verifier");
    const text = attestationText(certificate, context);
    if (certificate.serial !== device || certificate.deviceKey !== deviceKey || !hex(signature, 64))
      throw Error("Device certificate does not match this connection");
    let trusted = false;
    for (const root of roots) {
      if (!hex(root, 32)) continue;
      const key = await subtle.importKey("raw", bytes(root), "Ed25519", false, ["verify"]);
      if (await subtle.verify("Ed25519", key, bytes(certificate.signature), new TextEncoder().encode(certificateText(certificate)))) { trusted = true; break; }
    }
    if (!trusted) throw Error(roots.length ? "Factory certificate verification failed" : "Setup required: trusted factory public key");
    const key = await subtle.importKey("raw", bytes(deviceKey), "Ed25519", false, ["verify"]);
    if (!await subtle.verify("Ed25519", key, bytes(signature), new TextEncoder().encode(text)))
      throw Error("Device challenge verification failed");
    return attestationState(true, device);
  } catch (e) {
    return attestationState(false, "", e.message);
  }
}
// XOR app state controller: reset on every BLE connection; consume each proof once.
// Render `state.label` with `state.tone` (bad = red), and announce state changes.
export class DeviceAttestation {
  state = attestationState();
  epoch = 0;
  constructor(roots = FACTORY_ROOTS, subtle = globalThis.crypto?.subtle) {
    this.roots = [...roots]; this.subtle = subtle;
  }
  reset() { ++this.epoch; this.expected = null; return this.state = attestationState(); }
  begin(expected) {
    this.reset(); this.expected = { ...expected };
    return this.state = attestationState(false, "", "Checking factory certificate and device challenge");
  }
  async finish(proof) {
    if (!this.expected) return this.state;
    const epoch = this.epoch, expected = this.expected;
    this.expected = null;
    const state = await verifyAttestation(proof, expected, this.roots, this.subtle);
    if (this.epoch === epoch) this.state = state;
    return this.state;
  }
}
