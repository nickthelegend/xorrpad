#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { certificateText } from "../desk/renderer/ui/device-attestation.mjs";
import { pathToFileURL } from "node:url";
import { checkCRC, verifyHandshake, wire } from "../desk/main/pad-v2.mjs";
export const checks = ["keys", "knob", "mic", "speaker", "tft", "led", "wifi", "ble"];
export function verifyFactory(frame, expected, pinnedKey) {
  if (!/^esp32-[0-9a-f]{12}$/.test(expected)) throw Error("expected eFuse serial required");
  const report = checkCRC(frame);
  if (report.v !== 2 || report.type !== "factory_result" ||
      typeof report.payload !== "string" || report.payload.length > 2048 ||
      (pinnedKey && report.pk !== pinnedKey) ||
      !verifyHandshake(report.payload, report.signature, report.pk))
    throw Error("invalid factory signature or envelope");
  const r = JSON.parse(report.payload);
  if (r.serial !== expected) throw Error("serial number mismatch");
  if (!["2.0.0","3.0.0"].includes(r.fw) || typeof r.pass !== "boolean" ||
      checks.some(k => typeof r[k] !== "boolean")) throw Error("incomplete factory report");
  if (r.pass !== checks.every(k => r[k])) throw Error("inconsistent factory verdict");
  return r;
}
// Bounded framing accepts boot diagnostics, but malformed reports never pass.
export class FactoryLines {
  pending = "";
  constructor(onReport) { this.onReport = onReport; }
  feed(bytes) {
    for (const ch of bytes.toString("utf8")) {
      if (ch === "\n") {
        const line = this.pending.trim(); this.pending = "";
        if (!line.startsWith("{")) continue;
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (["factory_result", "factory_cert_result"].includes(m.type)) this.onReport(m);
      } else {
        this.pending += ch;
        if (this.pending.length > 4095) throw Error("oversized serial record");
      }
    }
  }
}
async function main() {
  const [port, expected, pinnedKey] = process.argv.slice(2);
  if (!port || !/^esp32-[0-9a-f]{12}$/.test(expected || ""))
    throw Error("Usage: factory.mjs SERIAL_PORT esp32-<12 hex eFuse MAC> [ED25519_PUBLIC_KEY]");
  if (pinnedKey && !/^[0-9a-f]{64}$/.test(pinnedKey)) throw Error("invalid public key pin");
  let certificate;
  if (process.env.XORR_DEVICE_CERT) {
    certificate = JSON.parse(readFileSync(process.env.XORR_DEVICE_CERT, "utf8"));
    certificateText(certificate);
    if (certificate.serial !== expected || (pinnedKey && certificate.deviceKey !== pinnedKey)) throw Error("certificate unit mismatch");
  }
  let provisioned = !certificate, provisionTimer;
  const { SerialPort } = await import("../desk/node_modules/serialport/dist/index.js");
  const serial = new SerialPort({ path: port, baudRate: 115200 });
  let finished = false;
  const finish = (error, r) => {
    if (finished) return;
    finished = true; clearTimeout(timer); clearInterval(provisionTimer);
    if (error) console.error(`FAIL ${expected}: ${error.message}`);
    else {
      for (const k of checks) console.log(`${r[k] ? "PASS" : "FAIL"} ${expected} ${k}`);
      console.log(`${r.pass ? "PASS" : "FAIL"} ${expected}`);
    }
    process.exitCode = error || !r?.pass ? 1 : 0;
    if (serial.isOpen) serial.close();
  };
  const timer = setTimeout(() => finish(Error("factory report timed out")), 240000);
  serial.on("open", () => {
    if (finished) { serial.close(); return; }
    if (certificate) provisionTimer = setInterval(() => {
      if (!finished && !provisioned) serial.write(wire({ v: 2, type: "factory_cert", certificate }, true));
    }, 1000);
    console.log(`Testing ${expected}: hold 01+14 while resetting; follow TFT; YES passes, NO fails.`);
  });
  const lines = new FactoryLines(m => {
    try {
      if (m.type === "factory_cert_result") {
        const result = checkCRC(m);
        if (!certificate || result.v !== 2 || result.ok !== true) throw Error("device certificate provisioning failed");
        provisioned = true; clearInterval(provisionTimer); return;
      }
      if (!provisioned) return; // Wait for durable NVS certificate acknowledgment.
      finish(null, verifyFactory(m, expected, pinnedKey));
    }
    catch (e) { finish(e); }
  });
  serial.on("data", b => { try { if (!finished) lines.feed(b); } catch (e) { finish(e); } });
  serial.on("error", () => finish(Error("serial port error")));
  serial.on("close", () => { if (!finished) finish(Error("serial port disconnected")); });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(e => { console.error(`FAIL ${process.argv[3] || "unknown-unit"}: ${e.message}`); process.exitCode = 1; });
