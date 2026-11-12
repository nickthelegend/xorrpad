import React, { useEffect, useRef, useState } from "react";
import { useDesk, useRead, State, Empty, Field } from "../core";
import { Icon } from "../brand/Icon";
import pulse from "../../../../sdk/abilities/samples/market-pulse.json";
import pomodoro from "../../../../sdk/abilities/samples/pomodoro.json";

function Capabilities({ value }) {
  const names = Array.isArray(value) ? value : String(value || "").split(",").filter(Boolean);
  return (
    <div className="actions" aria-label="Capabilities">
      {names.map((name) => <span className="badge" key={name}>{name}</span>)}
    </div>
  );
}

function AbilitySlot({ slot, busy, disabled, run }) {
  const [bundle, setBundle] = useState(null), [error, setError] = useState("");
  const revision = useRef(0);
  useEffect(() => () => { revision.current++; }, []);
  async function choose(file) {
    const current = ++revision.current;
    setBundle(null);
    setError("");
    if (!file) return;
    try {
      if (file.size > 70000) throw Error("Choose a bundle smaller than 70 KB");
      const candidate = JSON.parse(await file.text());
      if (current !== revision.current) return;
      const m = candidate?.manifest;
      if (!m || typeof m.name !== "string" || typeof m.version !== "string" ||
          !Array.isArray(m.capabilities) || !m.capabilities.every((c) => typeof c === "string") ||
          typeof m.developerPublicKey !== "string" || typeof candidate.wasm !== "string")
        throw Error("Choose a signed ability bundle");
      setBundle(candidate);
    } catch (e) {
      if (current === revision.current) setError(e.message);
    }
  }
  return (
    <div className="surface">
      <h3>Slot {slot.slot + 1} · {slot.installed ? slot.name : "Empty"}</h3>
      <p>{slot.installed ? slot.running ? "Running" : "Stopped" : "No ability installed"}</p>
      {slot.installed && <Capabilities value={slot.capabilities} />}
      {slot.error && <p role="alert">{slot.error}</p>}
      {slot.installed && (
        <button disabled={busy || disabled} onClick={() => run({ action: "remove", slot: slot.slot }, "Ability removed.")}>
          Remove from slot {slot.slot + 1}
        </button>
      )}
      <form onSubmit={(e) => {
        e.preventDefault();
        if (bundle) run({ action: "install", slot: slot.slot, bundle }, "Ability verified and installed.");
      }}>
        <Field label={`Signed bundle for slot ${slot.slot + 1} (.json)`}>
          <input type="file" accept=".json,application/json" disabled={busy || disabled}
            onChange={(e) => choose(e.target.files[0])} />
        </Field>
        {error && <State state={{ error }} title="Bundle could not be read" />}
        {bundle && (
          <div role="status">
            <h3>{bundle.manifest.name} · {bundle.manifest.version}</h3>
            <Capabilities value={bundle.manifest.capabilities} />
            <p>Bundle developer: {bundle.manifest.developerPublicKey}</p>
            <p>Signature and module will be verified by the desk and pad.</p>
          </div>
        )}
        <button className="primary" disabled={busy || disabled || !bundle}>
          {slot.installed ? "Verify & replace" : "Verify & install"} slot {slot.slot + 1}
        </button>
      </form>
    </div>
  );
}

function PadAbilities({ device }) {
  const d = useDesk(), status = useRead("/pad/abilities?device=" + encodeURIComponent(device.device), 0, true);
  const [busy, setBusy] = useState(false), [result, setResult] = useState({});
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  async function run(body, message) {
    if (busy) return;
    const current = generation.current;
    setBusy(true);
    setResult({});
    try {
      await d.api("/pad/abilities", { device: device.device, ...body });
      if (current === generation.current) {
        setResult({ message });
        d.refresh();
      }
    } catch (e) {
      if (current === generation.current) setResult({ error: e.message });
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  const data = status.data, disabled = !data || !!status.error || status.loading || data.reviewing;
  return (
    <>
      <button disabled={busy || status.loading} onClick={() => d.refresh()}>Refresh abilities</button>
      <State state={status} title="Could not read on-pad abilities" />
      {result.error && <State state={{ error: result.error }} title="Ability request failed" />}
      {result.message && <p role="status">{result.message}</p>}
      <div className="device-controls">
        <div className="surface">
          <h3>Trusted developer key</h3>
          {data && !status.error && (
            <>
              <p>{data.developerPublicKey || "Setup required: trust your developer on the pad."}</p>
              {data.reviewing && <p role="status">Developer approval pending on pad.</p>}
            </>
          )}
          <p>Compare the full public key with a trusted source and the pad. Hold YES on the pad for 800 ms, then refresh abilities. NO cancels.</p>
          <p>Changing the trusted developer removes both installed abilities.</p>
          <form onSubmit={(e) => {
            e.preventDefault();
            run({ action: "developer", developerPublicKey: new FormData(e.currentTarget).get("publicKey") },
              "Developer review requested. Compare the complete key on the pad, hold YES for 800 ms, then refresh abilities.");
          }}>
            <Field label="Developer public key">
              <input name="publicKey" pattern="[0-9a-f]{64}" maxLength={64} required
                autoComplete="off" spellCheck={false} disabled={busy || disabled} />
            </Field>
            <button disabled={busy || disabled}>Review developer on pad</button>
          </form>
        </div>
        <div className="surface">
          <h3>SDK install examples</h3>
          {[pulse, pomodoro].map((sample) => (
            <div key={sample.id}>
              <h3>{sample.name}</h3>
              <p>{sample.id === "market-pulse"
                ? "Shows the current desk market price; missing or stale prices are unavailable."
                : "A 25-minute uptime timer with a completion chime. Reboot or reinstall restarts it."}</p>
              <Capabilities value={sample.capabilities} />
            </div>
          ))}
          <p>Build these samples with sdk/abilities/build.sh. Follow sdk/abilities/README.md to prepare and externally sign a bundle, then choose its .bundle.json in either slot.</p>
          <p>Examples are not pre-signed or automatically trusted.</p>
        </div>
        {data && !status.error && [0, 1].map((index) => {
          const slot = data.slots?.find((s) => s.slot === index);
          return slot ? <AbilitySlot key={index} slot={slot} busy={busy}
            disabled={disabled || !data.developerPublicKey} run={run} />
            : <div className="surface" key={index}><h3>Slot {index + 1}</h3><p>Pad has not reported this slot. Refresh abilities.</p></div>;
        })}
      </div>
    </>
  );
}

export function OnPadAbilities() {
  const link = useRead("/desk/link", 3000, true), [selected, setSelected] = useState("");
  const devices = link.data?.devices || [];
  const device = selected ? devices.find((p) => p.device === selected) : devices[0];
  useEffect(() => {
    if (!selected && devices[0]) setSelected(devices[0].device);
  }, [selected, devices[0]?.device]);
  return (
    <section className="on-pad-abilities" aria-labelledby="on-pad-title">
      <div className="section-title ability-list-title">
        <h2 id="on-pad-title">On-pad abilities</h2>
      </div>
      <p className="permission-line"><Icon name="shieldCheck" /> Abilities can never sign or trade</p>
      <State state={link} title="Could not read connected pads" />
      {!link.error && devices.length > 0 && (
        <Field label="Ability pad">
          <select aria-label="Ability pad" value={device?.device || ""} onChange={(e) => setSelected(e.target.value)}>
            {!device && <option value="" disabled>Select a connected pad</option>}
            {[...new Map(devices.map((p) => [p.device, p])).values()].map((p) => <option key={p.device} value={p.device}>{p.device}</option>)}
          </select>
        </Field>
      )}
      {!link.error && !device && !link.loading && (
        <Empty title={devices.length ? "Selected pad disconnected" : "No pad connected"} art="empty-pad" action={<a className="button" href="#connect">Connect a pad</a>}>
          Connect and pair your pad to manage its trusted developer and two ability slots.
        </Empty>
      )}
      {!link.error && device && (
        <>
          {device.secure && !device.killed ? <PadAbilities key={device.device} device={device} /> : (
            <State state={{ error: "Setup required: select one paired, online, rearmed pad" }}
              action={<a className="button" href={device.killed ? "#device" : "#connect"}>{device.killed ? "Re-arm pad" : "Connect a pad"}</a>} />
          )}
        </>
      )}
    </section>
  );
}
