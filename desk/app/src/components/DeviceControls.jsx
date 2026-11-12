import React, { useEffect, useRef, useState } from "react";
import { useDesk, useRead, State, Empty, Field } from "../core";

async function encoded(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 16384)
    binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(binary);
}

export function DeviceControls({
  device,
  profiles,
  selection,
  setSelection,
  keymap,
}) {
  const d = useDesk(),
    options = useRead("/pad/options", 15000, true);
  const [result, setResult] = useState({}),
    [busy, setBusy] = useState(false);
  const [manifest, setManifest] = useState(null),
    [channel, setChannel] = useState("");
  const [ota, setOta] = useState(device?.ota),
    [name, setName] = useState("");
  const generation = useRef(0),
    manifestRequest = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      manifestRequest.current++;
    },
    [],
  );
  useEffect(() => {
    if (device?.ota) setOta(device.ota);
  }, [device?.ota]);
  useEffect(() => {
    const e = d.event;
    if (!e || !device || e.device !== device.device) return;
    if (e.type === "ota_progress") setOta(e);
    if (e.type === "ota_error") {
      setOta({ state: "error", error: e.error });
      setResult({ error: e.error });
    }
  }, [d.event, device?.device]);
  async function run(fn) {
    if (busy) return;
    const current = generation.current;
    setBusy(true);
    setResult({});
    try {
      const message = await fn();
      if (current === generation.current) setResult({ message });
    } catch (e) {
      if (current === generation.current) setResult({ error: e.message });
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  if (!device)
    return (
      <div className="surface">
        <Empty
          title="No pad connected"
          action={
            <a className="button" href="#connect">
              Connect a pad
            </a>
          }
        >
          Connect your pad to manage firmware, safety, profiles and options.
        </Empty>
      </div>
    );
  const paired = device.secure,
    saved = profiles.data || [],
    chosen = saved[selection.profile];
  const active = device.profile;
  return (
    <div className="device-controls">
      <div className="surface">
        <h2>Firmware</h2>
        <p>Installed version: {device.firmware || "Unavailable"}</p>
        {!paired && (
          <p>
            Setup required: pair this pad to update firmware and select
            profiles.
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            run(async () => {
              if (!manifest)
                throw Error("Select and verify manifest.json first");
              const image = form.elements.image.files[0],
                patch = form.elements.patch.files[0];
              if (!image || image.size !== manifest.size)
                throw Error("Select the matching app.bin");
              if (image.size > 3145728)
                throw Error("Select an app.bin under 3 MB");
              if (
                patch &&
                (!manifest.delta || patch.size !== manifest.delta.size)
              )
                throw Error("Select the delta.bin matching this manifest");
              await d.api("/pad/ota", {
                device: device.device,
                manifest,
                image: await encoded(image),
                ...(patch ? { patch: await encoded(patch) } : {}),
              });
              return "Update requested. Waiting for pad progress.";
            });
          }}
        >
          <Field label="Signed manifest.json">
            <input
              name="manifest"
              type="file"
              accept=".json,application/json"
              disabled={busy || !paired}
              onChange={async (e) => {
                const file = e.target.files[0],
                  request = ++manifestRequest.current;
                setManifest(null);
                setResult({});
                if (!file) return;
                try {
                  if (file.size > 65536)
                    throw Error("Select a manifest.json under 64 KB");
                  const value = JSON.parse(await file.text());
                  const checked = await d.api("/pad/manifest", {
                    manifest: value,
                  });
                  if (request === manifestRequest.current) setManifest(checked);
                } catch (e) {
                  if (request === manifestRequest.current)
                    setResult({ error: e.message });
                }
              }}
            />
          </Field>
          {manifest && (
            <p role="status">
              Verified firmware {manifest.version} · {manifest.size} bytes ·{" "}
              {manifest.channel || "stable"} · rollout{" "}
              {manifest.rolloutPercent ?? 100}%<br />
              {manifest.notes}
            </p>
          )}
          <Field label="Firmware app.bin">
            <input
              name="image"
              type="file"
              accept=".bin"
              disabled={busy || !paired}
              required
            />
          </Field>
          <Field label="Optional delta.bin">
            <input
              name="patch"
              type="file"
              accept=".bin"
              disabled={busy || !paired}
            />
          </Field>
          <p>
            The desk verifies the image and optional delta. A nonmatching base
            version uses the full image.
          </p>
          <button
            className="primary"
            disabled={
              busy || !paired || !manifest || ota?.state === "uploading"
            }
          >
            Update firmware
          </button>
        </form>
        {ota && (
          <div role="status">
            <p>
              OTA: {ota.state}
              {Number.isFinite(ota.progress)
                ? ` · ${ota.progress}% transferred`
                : ""}
            </p>
            {Number.isFinite(ota.progress) && (
              <progress
                aria-label="Firmware transfer"
                max="100"
                value={ota.progress}
              />
            )}
            {ota.error && <p role="alert">{ota.error}</p>}
            {ota.state === "rebooting" && (
              <p>
                Transfer complete. Waiting for the pad to reboot; installed
                version is read from the connection.
              </p>
            )}
          </div>
        )}
        {!d.online && <p>Progress stream disconnected. Reconnecting…</p>}
        <Field label="OTA channel">
          <select
            value={channel}
            disabled={busy || !paired}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option value="" disabled>
              Read this pad’s channel
            </option>
            <option value="stable">Stable</option>
            <option value="beta">Beta</option>
          </select>
        </Field>
        <div className="actions">
          <button
            disabled={busy || !paired}
            onClick={() =>
              run(async () => {
                const r = await d.api(
                  "/pad/ota-channel?device=" +
                    encodeURIComponent(device.device),
                );
                setChannel(r.channel);
                return "Pad channel: " + r.channel;
              })
            }
          >
            Read channel
          </button>
          <button
            disabled={busy || !paired || !channel}
            onClick={() =>
              run(async () => {
                const r = await d.api("/pad/ota-channel", {
                  device: device.device,
                  channel,
                });
                setChannel(r.channel);
                return "Pad channel saved: " + r.channel;
              })
            }
          >
            Save channel
          </button>
        </div>
        <p>Beta is an opt-in saved on this pad.</p>
      </div>
      <div className="surface">
        <h2>Kill latch</h2>
        <p role="status">
          {device.killed ? "Kill latch active" : "Kill latch clear"}
        </p>
        <p>
          Re-arm requires an 800 ms hold on YES on the pad. The desk cannot
          clear the latch alone.
        </p>
        <button
          disabled={busy || !paired || !device.killed}
          onClick={() =>
            run(async () => {
              const r = await d.api("/pad/rearm", { device: device.device });
              return r.pending;
            })
          }
        >
          Re-arm
        </button>
        <h2>Pad profiles</h2>
        <p>
          8 profile slots · 3 layers each. Select a saved layer, then select a
          key above to edit it. Profiles sync to paired pads.
        </p>
        <State state={profiles} />
        {profiles.data && (
          <>
            {!saved.length && (
              <p>
                No pad profiles saved. Create one from your current desk keymap.
              </p>
            )}
            <Field label="Pad profile">
              <select
                value={selection.profile}
                disabled={busy}
                onChange={(e) =>
                  setSelection({
                    ...selection,
                    profile: Number(e.target.value),
                  })
                }
              >
                {Array.from({ length: 8 }, (_, i) => (
                  <option key={i} value={i} disabled={i > saved.length}>
                    {i + 1}. {saved[i]?.name || "Empty slot"}
                  </option>
                ))}
              </select>
            </Field>
            <div className="profile-pills" aria-label="Profile layer">
              {[0, 1, 2].map((layer) => (
                <button
                  key={layer}
                  aria-pressed={selection.layer === layer}
                  disabled={busy}
                  onClick={() => setSelection({ ...selection, layer })}
                >
                  Layer {layer + 1}
                </button>
              ))}
            </div>
            {active ? (
              <p role="status">
                Pad reports: profile {active.profile + 1}, layer{" "}
                {active.layer + 1} · {active.ok ? "active" : "refused"}
              </p>
            ) : (
              <p>Pad has not reported an active profile.</p>
            )}
            {chosen ? (
              <button
                disabled={busy || !paired}
                onClick={() =>
                  run(async () => {
                    await d.api("/pad/profile", {
                      device: device.device,
                      ...selection,
                    });
                    return "Profile selection sent. Waiting for pad confirmation.";
                  })
                }
              >
                Activate selected layer
              </button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(async () => {
                    const map = await d.api("/pad/keymap");
                    await d.api("/pad/profiles", {
                      profiles: [
                        ...saved,
                        {
                          name: name.trim(),
                          layers: [
                            structuredClone(map),
                            structuredClone(map),
                            structuredClone(map),
                          ],
                        },
                      ],
                    });
                    d.refresh();
                    setName("");
                    return "Profile saved and sent to paired pads.";
                  });
                }}
              >
                <Field label="New profile name">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={20}
                    required
                  />
                </Field>
                <button disabled={busy || !keymap || !name.trim()}>
                  Create profile from current keys
                </button>
              </form>
            )}
          </>
        )}
        <h2>Pad options</h2>
        <p>Display options apply to all connected pads.</p>
        <State state={options} />
        {options.data && (
          <form
            key={`${options.data.brightness}-${options.data.night}`}
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              run(async () => {
                await d.api("/pad/options", {
                  brightness: Number(form.get("brightness")),
                  liqGuardPct: Number(form.get("liqGuardPct")),
                  night: form.get("night") === "true",
                });
                d.refresh();
                return "Pad options saved.";
              });
            }}
          >
            <Field label="Brightness (1–255)">
              <input
                name="brightness"
                type="number"
                min="1"
                max="255"
                step="1"
                defaultValue={options.data.brightness}
                required
              />
            </Field>
            <Field label="Liquidation guard distance (%)">
              <input name="liqGuardPct" type="number" min="0.1" max="100" step="0.1" defaultValue={options.data.liqGuardPct} required />
            </Field>
            <p>Within this distance, YES proposes a 50% reduce-only close for review. Missing venue liquidation prices stay unavailable.</p>
            <Field label="Night mode">
              <select name="night" defaultValue={String(options.data.night)}>
                <option value="false">Off</option>
                <option value="true">On</option>
              </select>
            </Field>
            <button disabled={busy}>Save pad options</button>
          </form>
        )}
      </div>
      {result.error && (
        <State state={{ error: result.error }} title="Device request failed" />
      )}
      {result.message &&
        !(
          ota &&
          result.message === "Update requested. Waiting for pad progress."
        ) && <p role="status">{result.message}</p>}
    </div>
  );
}
