#!/usr/bin/env node
// Operator-only offline issuance. Agent validation never reads a factory key.
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { externalPath } from "./factory-paths.mjs";
import { certificateText } from "../desk/renderer/ui/device-attestation.mjs";
export function issueCertificate({ deviceKey, serial, model = "xorrpad-esp32s3" }, factoryKey) {
  const c = { v: 1, deviceKey, serial, model, signature: "0".repeat(128) };
  const text = certificateText(c);
  if (factoryKey.asymmetricKeyType !== "ed25519") throw Error("Ed25519 factory key required");
  c.signature = sign(null, Buffer.from(text), factoryKey).toString("hex");
  return c;
}
function main() {
  const [identityFile, outputFile] = process.argv.slice(2);
  if (!identityFile || !outputFile || !process.env.XORR_FACTORY_KEY)
    throw Error("Setup required: XORR_FACTORY_KEY external path; factory-cert.mjs public-identity.json external-certificate.json");
  // Validate every path before opening private material. No values are printed.
  const keyPath = externalPath(process.env.XORR_FACTORY_KEY), out = externalPath(outputFile);
  const identity = JSON.parse(readFileSync(identityFile, "utf8"));
  certificateText({ ...identity, v: 1, model: identity.model || "xorrpad-esp32s3", signature: "0".repeat(128) });
  const c = issueCertificate(identity, createPrivateKey(readFileSync(keyPath)));
  writeFileSync(out, JSON.stringify(c) + "\n", { flag: "wx", mode: 0o644 });
  console.log("Issued public device certificate outside repository.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch { console.error("Factory certificate issuance failed; check external paths, public identity and Ed25519 key configuration."); process.exitCode = 1; }
}
