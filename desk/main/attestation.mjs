import { verify } from "node:crypto";
import { publicKey } from "./pad-v2.mjs";
import { certificateText, attestationText, attestationState } from "../renderer/ui/device-attestation.mjs";
import { FACTORY_ROOTS } from "../renderer/ui/attestation-roots.mjs";
export { FACTORY_ROOTS };
export function verifyDeviceAttestation(proof, expected, roots = FACTORY_ROOTS) {
  try {
    const c = proof.certificate, text = attestationText(c, expected.context);
    if (c.serial !== expected.device || c.deviceKey !== expected.deviceKey ||
        !/^[0-9a-f]{128}$/.test(proof.signature)) throw Error("Device certificate does not match this connection");
    if (!roots.some(root => /^[0-9a-f]{64}$/.test(root) && verify(null, Buffer.from(certificateText(c)), publicKey(root, "ed25519"), Buffer.from(c.signature, "hex"))))
      throw Error(roots.length ? "Factory certificate verification failed" : "Setup required: trusted factory public key");
    if (!verify(null, Buffer.from(text), publicKey(c.deviceKey, "ed25519"), Buffer.from(proof.signature, "hex")))
      throw Error("Device challenge verification failed");
    return attestationState(true, c.serial);
  } catch (e) { return attestationState(false, "", e.message); }
}
