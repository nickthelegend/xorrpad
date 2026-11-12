import React, { useEffect, useRef, useState } from "react";
import { useDesk, useRead, State, Field, Sheet, money } from "../core";
import { PadTarget } from "./PadTarget";

function SessionPolicy({ device }) {
  const d = useDesk(), status = useRead("/pad/session?device=" + encodeURIComponent(device.device), 0, true);
  const options = useRead("/pad/options", 0, true);
  const [edit, setEdit] = useState(false), [busy, setBusy] = useState(false), [result, setResult] = useState({});
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function run(path, body, message) {
    if (busy) return;
    setBusy(true); setResult({});
    try {
      await d.api(path, body);
      if (alive.current) { setResult({ message }); setEdit(false); d.refresh(); }
    } catch (e) {
      if (alive.current) setResult({ error: e.message });
    } finally { if (alive.current) setBusy(false); }
  }
  const data = status.error ? null : status.data, policy = data?.policy;
  const disabled = busy || status.loading || !data;
  return <div className="pad-session">
    <State state={status} title="Could not read pad session" />
    <State state={options} title="Could not read blind signing setting" />
    {result.error && <State state={result} title="Pad request failed" />}
    {result.message && <p role="status">{result.message}</p>}
    {data && <>
      <p>Pad session public key</p><pre>{data.publicKey || "Not reported by pad"}</pre>
      <p>{data.configured ? "Policy approved on pad." : "Setup required: approve signing policy on pad"}</p>
      <p>Rolling daily spend: {data.spentToday == null ? "Not reported by this firmware" : money(Number(data.spentToday) / 1e6)}.</p>
      <p>The pad enforces a rolling 24 hours of powered time. Reboot and offline time do not refund the budget.</p>
      {policy && <details><summary>Approved session policy</summary><pre>{JSON.stringify(policy, null, 2)}</pre></details>}
    </>}
    <div className="actions">
      <button disabled={disabled} onClick={() => run("/wallet/mode", { mode: "pad", device: device.device }, "Pad signer selected. The pad decides each signature.")}>Use pad signer</button>
      <button disabled={disabled} onClick={() => setEdit(true)}>Edit pad session policy</button>
      <button disabled={busy || status.loading} onClick={d.refresh}>Read pad session</button>
    </div>
    <p>Pad signing forwards the exact clear-sign message to the pad. Funding, cluster and trade gates still apply.</p>
    {options.data && !options.error && <form onSubmit={(e) => {
      e.preventDefault();
      run("/pad/options", { allowBlindSigning: new FormData(e.currentTarget).get("blind") === "on" }, "Blind signing setting saved.");
    }} key={String(options.data.allowBlindSigning)}>
      <label className="check" style={{ minHeight: 44 }}><input type="checkbox" name="blind" defaultChecked={options.data.allowBlindSigning === true} disabled={busy} />Allow blind signing</label>
      <p style={{ color: "var(--bad)" }}>Warning: blind signing cannot decode unknown instructions. You may approve a transaction you cannot verify. Off by default; enabling requires a longer hold on the pad.</p>
      <button disabled={busy || options.loading}>Save blind signing setting</button>
    </form>}
    {edit && <Sheet title="Pad session policy" onClose={() => { if (!busy) setEdit(false); }}>
      <p>Caps are USD for the approved six-decimal dollar asset. The pad currently supports 1× leverage only. Venue access uses exact program public keys.</p>
      <p>Auto-accept requires both the cap and an exact market or destination match. Zero keeps it off. Review the complete policy and hold YES on the pad for 3.8 seconds.</p>
      <form onSubmit={(e) => {
        e.preventDefault(); const f = new FormData(e.currentTarget);
        const units = (name) => Math.round(Number(f.get(name)) * 1e6);
        const next = { trade: units("trade"), day: units("day"), autoTrade: units("autoTrade"), maxLeverage: Number(f.get("maxLeverage")),
          mint: String(f.get("mint")).trim(), market: String(f.get("market")).trim(), programs: String(f.get("programs")).split(/[\s,]+/).filter(Boolean) };
        if (![next.trade, next.day, next.autoTrade].every(Number.isSafeInteger) || next.day < next.trade || next.autoTrade > next.trade) {
          setResult({ error: "Daily cap must cover the per-trade cap; auto-accept cap cannot exceed the per-trade cap." }); return;
        }
        run("/pad/session", { device: device.device, policy: next }, "Session policy approved by the pad.");
      }}>
        {[['trade', 'Per-trade cap (USD)'], ['day', 'Per-day cap (USD)'], ['autoTrade', 'Auto-accept cap (USD, 0 = off)']].map(([name, label]) => <Field key={name} label={label}>
          <input name={name} type="number" min={name === "autoTrade" ? "0" : "0.000001"} step="0.000001" required disabled={busy} defaultValue={policy ? policy[name] / 1e6 : name === "autoTrade" ? 0 : ""} />
        </Field>)}
        <Field label="Max leverage"><select name="maxLeverage" disabled={busy}><option value="1">1× · supported by pad</option></select></Field>
        <Field label="Approved dollar asset mint"><input name="mint" required defaultValue={policy?.mint || ""} disabled={busy} /></Field>
        <Field label="Venue allowlist (program public keys)"><textarea name="programs" required defaultValue={policy?.programs?.join("\n") || ""} disabled={busy} /></Field>
        <Field label="Auto-accept market or destination"><input name="market" defaultValue={policy?.market || ""} disabled={busy} /></Field>
        {result.error && <State state={result} title="Policy could not be saved" />}
        {busy && <p role="status">Waiting for policy approval on the pad…</p>}
        <button className="primary" disabled={disabled}>Review policy on pad</button>
      </form>
    </Sheet>}
  </div>;
}

export function PadSession() {
  return <PadTarget label="Signer pad">{(device) => <SessionPolicy device={device} />}</PadTarget>;
}
