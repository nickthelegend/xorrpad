import React, { useEffect, useState } from "react";
import { useRead, State, Empty, Field } from "../core";

// Keep the user's selection after disconnect. Never redirect a pending write.
export function PadTarget({ label, children }) {
  const link = useRead("/desk/link", 3000, true), [selected, setSelected] = useState("");
  const devices = [...new Map((link.data?.devices || []).map((p) => [p.device, p])).values()];
  const device = selected ? devices.find((p) => p.device === selected) : devices[0];
  useEffect(() => {
    if (!selected && devices[0]) setSelected(devices[0].device);
  }, [selected, devices[0]?.device]);
  return <>
    <State state={link} title="Could not read connected pads" />
    {!link.error && !!devices.length && <Field label={label}>
      <select aria-label={label} value={device?.device || ""} onChange={(e) => setSelected(e.target.value)}>
        {!device && <option value="" disabled>Select a connected pad</option>}
        {devices.map((p) => <option key={p.device} value={p.device}>{p.device}</option>)}
      </select>
    </Field>}
    {!link.error && !link.loading && !device && <Empty art="empty-pad"
      title={devices.length ? "Selected pad disconnected" : "No pad connected"}
      action={<a className="button" href="#connect">Connect a pad</a>}>
      Connect and pair a pad to continue.
    </Empty>}
    {!link.error && device && (device.secure && !device.killed
      ? <React.Fragment key={device.device}>{children(device)}</React.Fragment>
      : <State state={{ error: "Setup required: select one paired, online, rearmed pad" }}
          action={<a className="button" href={device.killed ? "#device" : "#connect"}>{device.killed ? "Re-arm pad" : "Connect a pad"}</a>} />)}
  </>;
}
