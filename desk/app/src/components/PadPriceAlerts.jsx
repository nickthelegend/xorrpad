import React, { useEffect, useRef, useState } from "react";
import { useDesk, useRead, State, Field, Sheet, money } from "../core";
import { PadTarget } from "./PadTarget";

const solMint = "So11111111111111111111111111111111111111112";
function AlertRules({ device, market, kind }) {
  const d = useDesk(), state = useRead("/pad/price-alerts?device=" + encodeURIComponent(device.device), 0, true);
  const [busy, setBusy] = useState(false), [result, setResult] = useState({});
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const alerts = state.error ? null : state.data?.alerts;
  const disabled = busy || state.loading || !alerts;
  const rules = () => alerts.map(({ id, mint, usd, above }) => ({ id, mint, usd, above }));
  async function save(next) {
    if (busy) return;
    setBusy(true); setResult({});
    try {
      await d.api("/pad/price-alerts", { device: device.device, alerts: next });
      if (alive.current) { setResult({ message: "Price alerts saved on pad. Nothing will trade." }); d.refresh(); }
    } catch (e) { if (alive.current) setResult({ error: e.message }); }
    finally { if (alive.current) setBusy(false); }
  }
  const defaultMint = kind !== "predict" && market.toUpperCase() === "SOL" ? solMint
    : kind === "spot" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(market) ? market : "";
  return <div className="pad-price-alerts">
    <State state={state} title="Could not read pad price alerts" />
    {result.error && <State state={result} title="Price alerts could not be saved" />}
    {result.message && <p role="status">{result.message}</p>}
    <button disabled={busy || state.loading} onClick={d.refresh}>Read pad alerts</button>
    {alerts && <>
      <p>{alerts.length} of 8 alerts stored on this pad. Saving changes re-arms the remaining alerts.</p>
      {!alerts.length && <p>No price alerts stored on this pad.</p>}
      {alerts.map((a) => <article key={a.id}>
        <h3>{a.above ? "At or above" : "At or below"} {money(a.usd)}</h3>
        <pre>{a.mint}</pre><p>{a.fired ? "Fired" : "Armed"} · <small className="font-mono text-xs" title={a.id} aria-label={a.id}>{a.id.length > 14 ? a.id.slice(0, 8) + "…" + a.id.slice(-6) : a.id}</small></p>
        <button disabled={disabled} onClick={() => save(rules().filter((r) => r.id !== a.id))} title={a.id} aria-label={"Remove alert " + a.id}>Remove alert</button>
      </article>)}
      <form onSubmit={(e) => {
        e.preventDefault(); const f = new FormData(e.currentTarget);
        save([...rules(), { id: crypto.randomUUID().replaceAll("-", "").slice(0, 32), mint: String(f.get("mint")).trim(), usd: Number(f.get("usd")), above: f.get("direction") === "above" }]);
      }}>
        <h3>Add alert for {market || "selected market"}</h3>
        <p>Alerts use token USD prices. For perpetuals or outcomes, choose the underlying token mint; contract prices and outcome probabilities are not supported.</p>
        <Field label="Alert token mint"><input name="mint" required pattern="[1-9A-HJ-NP-Za-km-z]{32,44}" defaultValue={defaultMint} disabled={disabled} /></Field>
        <Field label="Alert direction"><select aria-label="Alert direction" name="direction" disabled={disabled}><option value="above">At or above</option><option value="below">At or below</option></select></Field>
        <Field label="Alert price (USD)"><input name="usd" type="number" min="0.000001" max="1000000000000" step="any" required disabled={disabled} /></Field>
        <button className="primary" disabled={disabled || alerts.length >= 8}>Save alert on pad</button>
      </form>
    </>}
  </div>;
}
export function PadPriceAlerts({ market, kind, onClose }) {
  return <Sheet title={"Alert on pad · " + (market || "Market")} onClose={onClose}>
    <div className="pad-price-alerts">
    <p>Stored on the pad. Alerts can still fire when the desk is off, with pad power, Wi-Fi and network time available. Nothing will trade.</p>
    <PadTarget label="Alert pad">{(device) => <AlertRules device={device} market={market} kind={kind} />}</PadTarget>
    </div>
  </Sheet>;
}
