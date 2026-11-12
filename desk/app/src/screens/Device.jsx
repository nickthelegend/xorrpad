import React, { useState, useEffect } from "react";
import { useDesk, useRead, State, Sheet, Field, money } from "../core";
import { BlurWords } from "../brand/BlurWords";
import { Icon } from "../brand/Icon";
const fixed = ["mic", "kill", "yes", "no"];
const actions = [
  "momentum",
  "grid",
  "dca",
  "risk",
  "yield",
  "rebalance",
  "buy",
  "sell",
  "base",
  "portfolio",
];
export function Device() {
  const d = useDesk(),
    link = useRead("/desk/link", 5000),
    map = useRead("/pad/keymap"),
    profiles = useRead("/desk/profiles"),
    queue = useRead("/signals"),
    abilities = useRead("/abilities");
  const [edit, setEdit] = useState(null),
    [label, setLabel] = useState(""),
    [action, setAction] = useState(""),
    [pressed, setPressed] = useState(null),
    [angle, setAngle] = useState(0),
    [last, setLast] = useState(null),
    [now, setNow] = useState(Date.now());
  const device = link.data?.devices?.[0],
    pending = queue.data?.signals
      ?.filter((s) => s.state === "awaiting" && s.expiresAt > now)
      .at(-1);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const e = d.event;
    if (e?.type === "pad") {
      if (e.message.type === "key") {
        setPressed(e.message.action);
        const t = setTimeout(() => setPressed(null), 240);
        return () => clearTimeout(t);
      }
      if (e.message.type === "knob") {
        setAngle(
          (a) =>
            a +
            Math.sign(
              e.message.sizeUsd - (last ?? device?.status.sizeUsd ?? 0),
            ) *
              18,
        );
        setLast(e.message.sizeUsd);
      }
    }
    if (["signal", "snapshot", "pad_link", "profile"].includes(e?.type))
      d.refresh();
  }, [d.event]);
  function choose(k) {
    setEdit(k);
    setLabel(k.label);
    setAction(k.action);
  }
  return (
    <section className="device-page">
      <div className="profile-pills" aria-label="Device profile">
        {["Scalper", "Swing", "Predictor", "Custom"].map((p) => (
          <button
            aria-pressed={profiles.data?.active === p}
            key={p}
            onClick={() =>
              d.run(async () => {
                await d.api("/desk/profiles", { name: p });
                d.refresh();
                d.notify(
                  p +
                    " profile saved. " +
                    (device
                      ? "Keymap pushed to connected pad."
                      : "Syncs when your pad connects."),
                );
              })
            }
          >
            {p}
          </button>
        ))}
      </div>
      <div className="device-intro">
        <div>
          <h1>
            <BlurWords text={"Your edge, at your fingertips."} immediate />
          </h1>
          <p>Your pad. Your abilities. Your rules.</p>
        </div>
        <a className="subtle-link" href="#connect">
          {device ? "Manage connection" : "Meet your pad"}{" "}
          <Icon name="arrowUpRight" />
        </a>
      </div>
      <div className="device-stage">
        <div className="brand-aura" />
        <div className="device-island">
          <span className={"status-dot " + (device ? "live" : "")} />
          {device ? (
            <>
              <b>{device.link.toUpperCase()}</b>
              <span>{device.device}</span>
              <span>FW {device.firmware}</span>
            </>
          ) : (
            <>
              <b>No pad connected</b>
              <a href="#connect">
                Let’s connect <Icon name="arrowUpRight" />
              </a>
            </>
          )}
          {pending && (
            <span className="pending-label">
              Decision waiting · {Math.ceil((pending.expiresAt - now) / 1000)}s
            </span>
          )}
        </div>
        <div className="pad-perspective">
          <div className="premium-pad">
            <div className="pad-surface">
              <div className="pad-top">
                <div className="device-tft" aria-label="Live pad screen">
                  {pending ? (
                    <>
                      <div className="tft-row">
                        <span>{pending.proposal.signal.side}</span>
                        <b>
                          CONFIRM ·{" "}
                          {Math.ceil((pending.expiresAt - now) / 1000)}s
                        </b>
                      </div>
                      <strong>{pending.proposal.signal.symbol}</strong>
                      <span>{money(pending.proposal.verdict.sizeUsd)}</span>
                      <small>{pending.proposal.verdict.why.join(" · ")}</small>
                      <div className="tft-row">
                        <span>YES</span>
                        <span>NO</span>
                      </div>
                    </>
                  ) : device ? (
                    <>
                      <div className="tft-row">
                        <span>LIVE / {device.link}</span>
                        <span>
                          {device.status.armed ? "ARMED" : "DISARMED"}
                        </span>
                      </div>
                      <strong>{device.status.market || "No market"}</strong>
                      <span>{money(device.status.sizeUsd)}</span>
                      <small>
                        {device.status.agent} ·{" "}
                        {device.status.autoAccept ? "AUTO" : "MANUAL"}
                      </small>
                    </>
                  ) : (
                    <>
                      <span className="tft-brand">
                        xorr<span>↗</span>
                      </span>
                      <strong>Make it yours.</strong>
                      <small>
                        Setup required: connect your pad
                        <br />
                        USB · BLE · Wi-Fi
                      </small>
                    </>
                  )}
                </div>
                <button
                  className="premium-knob"
                  aria-label="Configure size knob"
                  onClick={() => setEdit("knob")}
                >
                  <span style={{ transform: `rotate(${angle}deg)` }} />
                  <i />
                </button>
              </div>
              <div className="premium-keys">
                {(
                  map.data?.keys ||
                  Array.from({ length: 14 }, (_, i) => ({
                    row:
                      i < 6 ? Math.floor(i / 3) : Math.floor((i - 6) / 4) + 2,
                    col: i < 6 ? i % 3 : (i - 6) % 4,
                    label: "—",
                    action: "unavailable",
                  }))
                ).map((k, i) => (
                  <button
                    key={i}
                    style={{ gridRow: k.row + 1, gridColumn: k.col + 1 }}
                    className={`physical-key key-${k.action} ${pressed === k.action ? "depressed" : ""} ${edit?.row === k.row && edit?.col === k.col ? "selected" : ""}`}
                    disabled={!map.data}
                    aria-label={"Configure key " + (i + 1) + ": " + k.label}
                    onClick={() => choose(k)}
                  >
                    <small>{String(i + 1).padStart(2, "0")}</small>
                    <span>
                      {edit?.row === k.row && edit?.col === k.col
                        ? label
                        : k.label}
                    </span>
                    {fixed.includes(k.action) && (
                      <Icon
                        name={
                          k.action === "mic"
                            ? "wave"
                            : k.action === "kill"
                              ? "shield"
                              : "check"
                        }
                      />
                    )}
                  </button>
                ))}
              </div>
              <div className="pad-engraving">
                <b>xorrpad</b>
                <span>ONE PAD. EVERY VENUE.</span>
              </div>
            </div>
          </div>
        </div>
        <div className="device-floor" />
        <div className="device-caption">
          <span>
            <Icon name="bolt" />
            Select a key to give it an ability
          </span>
          <span>14 keys. One deliberate decision.</span>
        </div>
      </div>
      <div className="device-bottom">
        <a href="#abilities">
          <span className="round-icon">
            <Icon name="bolt" />
          </span>
          <div>
            <b>A new kind of shortcut.</b>
            <span>Discover abilities for your pad.</span>
          </div>
          <Icon name="arrowUpRight" />
        </a>
        <div>
          <img src="/desktop/media/pad.jpg" alt="The real xorrpad prototype" />
          <span>
            Built for your desk.
            <small>ESP32-S3 · compiled, not yet flashed</small>
          </span>
        </div>
      </div>
      {map.error && <State state={map} />}{" "}
      {edit && (
        <Sheet
          title={
            edit === "knob" ? "Tune your size knob" : "Make this key yours"
          }
          onClose={() => setEdit(null)}
        >
          {edit === "knob" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                d.run(async () => {
                  const r = await d.api("/size", {
                    usd: Number(new FormData(e.currentTarget).get("usd")),
                  });
                  d.notify(
                    "Size " +
                      money(r.sizeUsd) +
                      (r.cappedBy ? " · capped by remembered limit" : ""),
                  );
                  d.refresh();
                  setEdit(null);
                });
              }}
            >
              <p>The desk clamps size to your remembered trade limit.</p>
              <Field label="Size (USD)">
                <input
                  name="usd"
                  type="number"
                  min="0.01"
                  step="any"
                  defaultValue={device?.status.sizeUsd || 50}
                  required
                />
              </Field>
              <button className="primary">Save size</button>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                d.run(async () => {
                  const keys = map.data.keys.map((k) =>
                    k.row === edit.row && k.col === edit.col
                      ? { ...k, label, action }
                      : k,
                  );
                  await d.api("/pad/keymap", {
                    revision: map.data.revision + 1,
                    keys,
                  });
                  d.notify(
                    device
                      ? "Key saved and pushed."
                      : "Key saved locally. Syncs on connection.",
                  );
                  d.refresh();
                  setEdit(null);
                });
              }}
            >
              <div className="key-preview">{label || "KEY"}</div>
              <p>
                Preview only until you save. Safety controls keep their action.
              </p>
              <Field label="Key label">
                <input
                  maxLength={16}
                  pattern="[ -~]{1,16}"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  required
                />
              </Field>
              <Field label="Action or installed ability">
                <select
                  disabled={fixed.includes(edit.action)}
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                >
                  {[
                    ...new Set([
                      edit.action,
                      ...actions,
                      ...(abilities.data?.abilities
                        .filter((a) => a.installed)
                        .map((a) => "ability:" + a.id) || []),
                    ]),
                  ].map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </Field>
              <a
                className="subtle-link"
                href="#abilities"
                onClick={() => setEdit(null)}
              >
                Find an ability <Icon name="arrowUpRight" />
              </a>
              <button className="primary">
                Save & push key <Icon name="arrowUpRight" />
              </button>
            </form>
          )}
        </Sheet>
      )}
    </section>
  );
}
