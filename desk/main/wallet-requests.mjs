/** Short-lived Solana Pay capabilities. This service builds; the phone wallet signs. */
import { randomBytes } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { svg } from "./qr.mjs";
const requests = new Map();
const TTL = 90000;
export function walletHandoff(owner, rebuild, { label, variable, path = "/wallet/request" }) {
  const base = process.env[variable];
  if (!base) return { requestUrl: null, setupRequired: `Setup required: ${variable} (public HTTPS desk URL for the phone wallet)` };
  const publicUrl = new URL(base);
  if (publicUrl.protocol !== "https:" || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash)
    throw new Error(`${variable} must be a public HTTPS URL without credentials, query or fragment`);
  for (const [id, entry] of requests) if (entry.expires < Date.now()) requests.delete(id);
  if (requests.size >= 256) throw new Error("too many pending wallet requests; retry after they expire");
  const id = randomBytes(24).toString("hex"), expires = Date.now() + TTL;
  requests.set(id, { owner, rebuild, expires, label, base: publicUrl.origin });
  const requestUrl = `solana:${encodeURIComponent(new URL(`${path}/${id}`, publicUrl).href)}`;
  return { requestUrl, qrSvg: svg(requestUrl), requestExpiresAt: new Date(expires).toISOString() };
}
export async function walletRequest(id, method, account) {
  const entry = requests.get(id);
  if (!entry || entry.expires < Date.now()) {
    requests.delete(id);
    return { status: 410, body: { error: "wallet request expired; build a fresh transaction" } };
  }
  if (method === "GET") return { status: 200, body: { label: entry.label, icon: `${entry.base}/favicon.ico` } };
  if (method !== "POST") return { status: 405, body: { error: "use GET or POST" } };
  let owner;
  try { owner = new PublicKey(account).toBase58(); } catch { return { status: 400, body: { error: "account must be a Solana public key" } }; }
  if (owner !== entry.owner) return { status: 400, body: { error: "wallet account differs from the transaction owner" } };
  const built = await entry.rebuild();
  return { status: 200, body: { transaction: built.unsignedTx, message: `${entry.label} · review and sign in your wallet` } };
}
