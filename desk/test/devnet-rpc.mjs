export async function rpc(method, params = []) {
  const r = await fetch(process.env.PMAMM_RPC || "https://api.devnet.solana.com", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`devnet HTTP ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}
