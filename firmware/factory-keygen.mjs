#!/usr/bin/env node
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync, lstatSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { externalPath } from "./factory-paths.mjs";
try {
  if (process.argv.length > 3) throw Error("Usage: factory-keygen.sh [external directory]");
  const out = externalPath(process.argv[2] || path.join(os.homedir(), ".local/share/xorrpad/factory"));
  const names = ["factory-ed25519.pem", "factory-ed25519-public.pem", "factory-ed25519-public.hex"];
  for (const name of names) {
    try { lstatSync(path.join(out, name)); throw Error("Factory output already exists; refusing overwrite"); }
    catch (e) { if (e.code !== "ENOENT") throw e; }
  }
  mkdirSync(out, { recursive: true, mode: 0o700 });
  externalPath(out);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const contents = [privateKey.export({ format: "pem", type: "pkcs8" }), publicKey.export({ format: "pem", type: "spki" }), publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex") + "\n"];
  names.forEach((name, i) => writeFileSync(path.join(out, name), contents[i], { flag: "wx", mode: i === 0 ? 0o600 : 0o644 }));
  console.log("Created offline factory material outside the repository. Keep the private file offline; distribute only the public trust root.");
} catch (e) { console.error(e.message); process.exitCode = 1; }
