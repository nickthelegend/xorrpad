import React, { useMemo, useState } from "react";
import { useDesk, useRead, State, Empty, money } from "../core";
import { Icon } from "../brand/Icon";
import { svg } from "../../../main/qr.mjs";

const missingWallet = "Create your agent wallet in XOR Desktop";
export function AgentWallet() {
  const d = useDesk();
  const wallet = useRead("/agent-wallet", 30000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const data = wallet.data;
  const qr = useMemo(() => data?.solanaPay
    ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg(data.solanaPay))
    : null, [data?.solanaPay]);
  const missing = wallet.error === missingWallet;
  async function action(name) {
    setBusy(true);
    setError("");
    try {
      const result = await d.api("/agent-wallet", { action: name });
      d.notify(name === "create" ? "Agent wallet created. Send SOL or USDC to fund your agent."
        : `Funding QR sent to ${result.sent} ${result.sent === 1 ? "pad" : "pads"}.`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); d.refresh(); }
  }
  return <section className="surface agent-wallet mb-5" aria-label="Agent wallet" aria-busy={busy}>
    <div className="section-title">
      <h2>Agent wallet</h2>
      <button disabled={busy || wallet.loading} onClick={() => { setError(""); d.refresh(); }}>Refresh</button>
    </div>
    {!missing && <State state={wallet} title="Agent wallet unavailable" />}
    {missing && <Empty art="empty-positions" title="Your agent’s own wallet.">
      {missingWallet}
    </Empty>}
    {missing && <button className="primary" disabled={busy} onClick={() => action("create")}>
      {busy ? "Creating agent wallet…" : "Create agent wallet"}
    </button>}
    {data && <>
      <p><span className="badge">{data.cluster}</span> · {data.source === "pad" ? "Pad wallet" : "Desktop wallet"}</p>
      <p className="font-mono break-all" data-wallet-address>{data.address}</p>
      <div className="actions">
        <button onClick={() => d.run(async () => {
          await navigator.clipboard.writeText(data.address);
          d.notify("Agent address copied.");
        })}>Copy address <Icon name="copy" /></button>
        <button disabled={busy} onClick={() => action("fund")}>Show QR on pad</button>
      </div>
      <img className="block mx-auto my-5 max-w-full" src={qr} width="222" height="222" alt="Solana Pay funding QR for your agent wallet" />
      <p>Send SOL or USDC to fund your agent.</p>
      <h3>Balances · {data.cluster}</h3>
      <dl>
        {Object.values(data.balances).map(row => <div key={row.mint} className="flex flex-wrap justify-between gap-2 py-2">
          <dt className="min-w-0 break-all">{row.symbol}</dt>
          <dd className="m-0 text-right">
            <span>{row.amount.toLocaleString("en-US", { maximumFractionDigits: Math.min(20, row.decimals) })}</span>
            <small className="block">{row.usd == null ? "USD unavailable" : money(row.usd)}</small>
          </dd>
        </div>)}
      </dl>
      <p>Total: {money(data.totalUsd)}</p>
      <p className="setup-note">{data.valuation}</p>
      {data.priceErrors?.map(message => <p key={message} role="status">{message}</p>)}
      <small>Live balances · {new Date(data.observedAt).toLocaleString()}</small>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
