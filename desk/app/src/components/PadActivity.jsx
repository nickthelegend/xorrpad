import React, { useEffect, useRef, useState } from "react";
import { useDesk, useRead, State, Empty, Field, Sheet, money } from "../core";
import { PadTarget } from "./PadTarget";

function ClearReview({ device }) {
  const d = useDesk(), alive = useRef(true);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [result, setResult] = useState({});
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  return <>
    <button onClick={() => { setResult({}); setOpen(true); }}>Review unsigned transaction on pad</button>
    {result.pending && <div role="status"><p>Review sent to pad with a two-minute deadline. Its decision appears in the results below when received.</p><pre>Fingerprint: {result.fingerprint}{"\n"}Message hash: {result.messageHash}</pre></div>}
    {open && <Sheet title="Clear-sign review" onClose={() => setOpen(false)}>
      <p>The pad decodes the exact unsigned transaction. Review every page and hold YES for 800 ms, or press NO. This review does not sign or broadcast a transaction.</p>
      <form onSubmit={async (e) => {
        e.preventDefault(); if (busy) return;
        const f = new FormData(e.currentTarget); setBusy(true); setResult({});
        try {
          const r = await d.api("/pad/clear-sign", { device: device.device, unsignedTx: String(f.get("unsignedTx")).trim(), cluster: f.get("cluster"), inputMint: String(f.get("inputMint")).trim() || undefined, signalId: crypto.randomUUID(), remainingMs: 120000 });
          if (alive.current) { setResult({ ...r, pending: true }); setOpen(false); }
        } catch (e) { if (alive.current) setResult({ error: e.message }); }
        finally { if (alive.current) setBusy(false); }
      }}>
        <Field label="Unsigned transaction (base64)"><textarea name="unsignedTx" required maxLength={1644} disabled={busy} /></Field>
        <Field label="Transaction cluster"><select aria-label="Transaction cluster" name="cluster" disabled={busy}><option value="devnet">Devnet</option><option value="mainnet-beta">Mainnet</option></select></Field>
        <Field label="Input mint (optional public key)"><input name="inputMint" disabled={busy} /></Field>
        {result.error && <State state={result} title="Clear-sign request failed" />}
        <button className="primary" disabled={busy}>{busy ? "Preparing clear-sign review…" : "Send review to pad"}</button>
      </form>
    </Sheet>}
  </>;
}

function CrewPolicy({ policy, devices, onClose }) {
  const d = useDesk(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const members = new Map(policy.members.map((m) => [m.device, m]));
  for (const p of devices) if (p.secure && p.devicePublicKey && !members.has(p.device))
    members.set(p.device, { device: p.device, publicKey: p.devicePublicKey, name: p.device });
  return <Sheet title="Crew co-sign policy" onClose={onClose}>
    <p>Trades strictly above the threshold require independent reviews on N of your crew's pads. Each approval requires every review page and an 800 ms hold.</p>
    <form onSubmit={async (e) => {
      e.preventDefault(); if (busy) return; const f = new FormData(e.currentTarget);
      setBusy(true); setError("");
      try {
        await d.api("/pad/crew", { enabled: f.get("enabled") === "true", aboveUsd: Number(f.get("aboveUsd")), required: Number(f.get("required")), members: f.getAll("member").map((id) => members.get(id)) });
        d.refresh(); d.notify("Crew policy saved."); onClose();
      } catch (e) { setError(e.message); } finally { setBusy(false); }
    }}>
      <Field label="Require crew approvals"><select name="enabled" aria-label="Require crew approvals" defaultValue={String(policy.enabled)} disabled={busy}><option value="false">Off</option><option value="true">On</option></select></Field>
      <Field label="For trades above (USD)"><input name="aboveUsd" type="number" min="0" step="0.01" required defaultValue={policy.aboveUsd} disabled={busy} /></Field>
      <Field label="Approvals required"><input name="required" type="number" min="2" max="8" step="1" required defaultValue={policy.required} disabled={busy} /></Field>
      <fieldset><legend>Crew pads</legend>
        {[...members.values()].map((m) => <label className="check" style={{ minHeight: 44 }} key={m.device}>
          <input type="checkbox" name="member" value={m.device} defaultChecked={policy.members.some((p) => p.device === m.device)} disabled={busy} />
          <span>{m.name}{devices.some((p) => p.device === m.device && p.secure && p.devicePublicKey === m.publicKey) ? "" : " (offline / pair identity again)"}<pre>{m.publicKey}</pre></span>
        </label>)}
        {!members.size && <p>Setup required: pair at least two crew pads.</p>}
      </fieldset>
      {error && <State state={{ error }} title="Crew policy could not be saved" />}
      <button className="primary" disabled={busy}>Save crew policy</button>
    </form>
  </Sheet>;
}

export function PadActivity() {
  const d = useDesk(), crew = useRead("/pad/crew", 3000, true), link = useRead("/desk/link", 3000, true);
  const [editing, setEditing] = useState(false);
  const records = [...(d.padEvents || [])].reverse();
  return <section className="pad-activity" aria-label="Pad activity">
    <div className="section-title ability-list-title"><h2>Clear-sign results</h2><span className="badge">{d.online ? "Live events" : "Event stream disconnected"}</span></div>
    <p>Results received in this desktop session. A review approval is not a transaction signature or a confirmed fill.</p>
    <PadTarget label="Review pad">{(device) => <ClearReview device={device} />}</PadTarget>
    {!records.length && <p>No clear-sign results received in this desktop session.</p>}
    {records.map((r) => <article className="surface" key={r.recordId}>
      <h3>{r.type === "clear_approval" ? r.accepted ? "Review approved" : "Review refused" : r.ok ? "Signed on pad" : "Signing refused"}</h3>
      <p>{r.device} · {r.at ? new Date(r.at).toLocaleString() : "Time unavailable"}{r.automatic ? " · Auto-accepted by pad policy" : ""}</p>
      <pre>Request: {r.signalId || r.id}{"\n"}Fingerprint: {r.fingerprint || "Not reported by pad"}{"\n"}Message hash: {r.messageHash || "Not reported by pad"}</pre>
      {r.error && <p role="alert">{r.error}</p>}
      {(r.accepted === false || r.ok === false) && !r.error && <p>Reason not reported by pad.</p>}
      <h4>Decoded on pad</h4>
      {r.decoded?.length ? <pre>{r.decoded.join("\n")}</pre> : <p>Decoded instructions not reported by this firmware.</p>}
      {r.decodedTruncated && <p>Additional decoded pages were not included in the pad's response.</p>}
      <details><summary>View actual pad result</summary><pre>{JSON.stringify(r, null, 2)}</pre></details>
    </article>)}
    <div className="section-title ability-list-title"><h2>Crew co-sign</h2>
      <button disabled={!crew.data || !!crew.error || !!link.error} onClick={() => setEditing(true)}>Edit crew policy</button>
    </div>
    <State state={crew} title="Could not read crew policy and rounds" />
    <State state={link} title="Could not read crew pads" />
    {crew.data && !crew.error && <>
      <p>{crew.data.policy.enabled ? `Above ${money(crew.data.policy.aboveUsd)}, require ${crew.data.policy.required} crew approvals.` : "Crew co-sign is off."}</p>
      <p>{crew.data.policy.members.map((m) => m.name).join(", ") || "No crew members configured."}</p>
      {!crew.data.rounds.length && <p>No crew approvals requested in this desk session.</p>}
      {[...crew.data.rounds].reverse().map((r) => <article className="surface" key={r.roundId}>
        <h3>{r.signalId} · {r.state}</h3>
        <p>{r.approvals.length} of {r.required} approvals · {r.approvals.map((a) => a.name).join(", ") || "Waiting for pads"}</p>
        <pre>Message hash: {r.messageHash}</pre>
        <p>Deadline: {new Date(r.expiresAt).toLocaleString()}</p>
      </article>)}
      {editing && <CrewPolicy policy={crew.data.policy} devices={link.data?.devices || []} onClose={() => setEditing(false)} />}
    </>}
  </section>;
}
