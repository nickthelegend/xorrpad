#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { releaseManifest } from "./release-manifest.mjs";
const [imagePath, out] = process.argv.slice(2);
if (!process.env.XORR_SIGNING_KEY)
  throw Error("Setup required: XORR_SIGNING_KEY path outside repository");
const privateKey = createPrivateKey(readFileSync(process.env.XORR_SIGNING_KEY));
const image = readFileSync(imagePath),
  publicKey = createPublicKey(privateKey);
const pinned = readFileSync(
  new URL("./ota-public-key.hex", import.meta.url),
  "utf8",
).trim();
if (
  publicKey
    .export({ format: "der", type: "spki" })
    .subarray(-32)
    .toString("hex") !== pinned
)
  throw Error("Signing key does not match baked public key");
const {manifest:m,patch} = releaseManifest(image,privateKey,{
  version:process.env.XORR_FW_VERSION || '2.0.0',
  channel:process.env.XORR_OTA_CHANNEL || 'stable',
  rolloutPercent:Number(process.env.XORR_OTA_ROLLOUT_PERCENT ?? 100),
  notes:process.env.XORR_RELEASE_NOTES || 'Firmware v3',
  base:process.env.XORR_OTA_BASE_IMAGE ? readFileSync(process.env.XORR_OTA_BASE_IMAGE) : undefined,
  fromVersion:process.env.XORR_OTA_FROM_VERSION,
  legacy:process.env.XORR_OTA_LEGACY==='1',
});
if(patch) writeFileSync(out + '/delta.bin',patch);
writeFileSync(out + "/manifest.json", JSON.stringify(m, null, 2) + "\n");
writeFileSync(out + "/app.sha256", m.sha256 + "  app.bin\n");
writeFileSync(out + "/app.sig", m.signature + "\n");
