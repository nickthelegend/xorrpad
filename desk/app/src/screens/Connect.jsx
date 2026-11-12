import React, { useEffect, useState } from "react";
import { useDesk, useRead, State, Field } from "../core";
import { LoopVideo } from "../brand/LoopVideo";
import { Icon } from "../brand/Icon";
import { BlurWords } from "../brand/BlurWords";
import { attestationState } from "../../../renderer/ui/device-attestation.mjs";

const shortDevice = (id) => "xorrpad · " + id.slice(-6);

function verification(peer) {
  return peer.secure && peer.attestation?.verified === true
    ? attestationState(true, peer.attestation.serial)
    : attestationState(false, "", peer.attestation?.reason);
}

export function Connect() {
  const d = useDesk(),
    link = useRead("/desk/link", 2000),
    status = useRead("/desk/status", 15000),
    system = useRead("/desk/connection", 30000);
  const [transport, setTransport] = useState("usb"),
    [searching, setSearching] = useState(false),
    [searched, setSearched] = useState(false),
    [pairDevice, setPairDevice] = useState(""),
    [code, setCode] = useState(""),
    [pairing, setPairing] = useState(false),
    [pairState, setPairState] = useState(null);
  const found = link.data?.devices?.filter((x) => x.link === transport) || [];
  const offers = link.data?.pairing || [];
  const candidate = offers.find((x) => x.device === pairDevice) || offers[0];
  const identity = found[0] && verification(found[0]);
  useEffect(() => setCode(""), [candidate?.device]);
  useEffect(() => {
    if (!pairing || !pairState?.device) return;
    if (link.data?.devices?.some((peer) => peer.device === pairState.device && peer.secure)) {
      setPairing(false);
      setPairState({ confirmed: pairState.device, data: "Encrypted pairing confirmed by the pad." });
    }
  }, [link.data, pairing, pairState]);
  useEffect(() => {
    if (pairState?.confirmed && (link.error || (link.data &&
      !link.data.devices?.some((peer) => peer.device === pairState.confirmed && peer.secure)))) {
      setPairState(null);
    }
  }, [link.data, link.error, pairState]);
  useEffect(() => {
    if (!pairState?.device) return;
    const timer = setTimeout(() => {
      setPairing(false);
      setPairState({ error: "Setup required: pairing was not confirmed by the pad. Check its current code, try again and reconnect the pad." });
    }, 12000);
    return () => clearTimeout(timer);
  }, [pairState?.device]);
  return (
    <section className="page connect-page">
      <div className="page-heading">
        <div>
          <h1>
            <BlurWords text={"Good things take one cable."} immediate />
          </h1>
          <p>One calm setup. Then your whole desk, at your fingertips.</p>
        </div>
        <span className="badge">USB first. Wireless when you need it.</span>
      </div>
      <div className="pairing-layout">
        <div className="pairing-theater">
          <LoopVideo
            sources={[
              { src: "/desktop/media/pad/turntable.webm", type: "video/webm" },
              { src: "/desktop/media/pad/turntable.mp4", type: "video/mp4" },
            ]}
            poster="/desktop/media/pad/turntable-poster.png"
            className="rings-film"
          />
          <div className="pairing-copy">
            <span
              className="badge"
              style={identity && !identity.verified ? { color: "var(--bad)", borderColor: "var(--bad)" } : undefined}
              role="status"
            >
              {!found.length && (
                <img
                  className="connection-empty-art"
                  src="/desktop/media/art/empty-pad.png"
                  alt=""
                />
              )}
              {identity ? identity.label : "Let’s find your pad"}
            </span>
            <h2>{found.length ? shortDevice(found[0].device) : "A little closer."}</h2>
            {found.length > 0 && <small className="block font-mono text-xs break-all" title={found[0].device}>{found[0].device}</small>}
            <p>
              {found.length
                ? `${found[0].link.toUpperCase()} · Firmware ${found[0].firmware}`
                : "Connect xorrpad to the machine running your desk."}
            </p>
            {identity && <p>{identity.reason}</p>}
          </div>
        </div>
        <div className="pairing-steps">
          <div className="step-heading">
            <span>01</span>
            <h2>Choose your connection.</h2>
          </div>
          <div className="transport-options">
            {[
              ["usb", "USB-C", "The direct connection."],
              ["ble", "Bluetooth", "Pair a trusted phone relay."],
              ["wifi", "Wi-Fi", "A little more freedom."],
            ].map(([id, name, desc]) => (
              <button
                key={id}
                aria-pressed={transport === id}
                onClick={() => {
                  setTransport(id);
                  setSearched(false);
                }}
              >
                <img
                  className="transport-art"
                  src={
                    "/desktop/media/art/" +
                    (id === "ble" ? "bluetooth" : id) +
                    ".png"
                  }
                  alt=""
                />
                <div>
                  <b>{name}</b>
                  <small>{desc}</small>
                </div>
                <i />
              </button>
            ))}
          </div>
          <button
            className="primary"
            disabled={searching}
            onClick={async () => {
              setSearching(true);
              await d.run(async () => {
                await d.api("/desk/discover", {});
                d.refresh();
                setSearched(true);
              });
              setSearching(false);
            }}
          >
            {searching ? "Reading available transports…" : "Connect a pad"}
            <Icon name="arrowUpRight" />
          </button>
          <State state={link} />
          {searched && !found.length && (
            <p className="setup-note">
              Setup required:{" "}
              {transport === "usb"
                ? "connect the flashed ESP32-S3 with a data-capable USB-C cable"
                : transport === "ble"
                  ? "pair the pad through the trusted XOR phone relay or desk BLE adapter"
                  : "provision the pad with a reachable desk URL and matching pad token"}
              . No verified {transport.toUpperCase()} handshake yet.
            </p>
          )}
          <div className="step-heading">
            <span>02</span>
            <h2>Make it official.</h2>
          </div>
          {found.map((peer) => {
            const attestation = verification(peer);
            return (
              <div className="found-device" key={peer.device + peer.link}>
                <span className="status-dot live" />
                <div>
                  <b>{shortDevice(peer.device)}</b>
                  <small className="block font-mono text-xs break-all" title={peer.device}>{peer.device}</small>
                  <p>
                    {peer.link.toUpperCase()} · {peer.secure ? "Encrypted v2" : "Legacy v1 · not encrypted"}
                    <br />
                    Firmware {peer.firmware} · Last seen {new Date(peer.lastSeen).toLocaleTimeString()}
                  </p>
                  <span
                    className="badge"
                    style={!attestation.verified ? { color: "var(--bad)", borderColor: "var(--bad)" } : undefined}
                    role="status"
                  >
                    {attestation.label}
                  </span>
                  <p>{attestation.reason}</p>
                  <a className="button" href="#device">
                    Customize this pad <Icon name="arrowUpRight" />
                  </a>
                </div>
              </div>
            );
          })}
          {candidate ? (
            <form onSubmit={async (e) => {
              e.preventDefault();
              setPairing(true);
              setPairState(null);
              try {
                await d.api("/pad/pair", { ...candidate, code });
                setPairState({ device: candidate.device, data: "Pairing started. Confirm the connection on the pad; waiting for its encrypted handshake." });
              } catch (error) {
                setPairState({ error: error.message });
                setPairing(false);
              } finally {
                setCode("");
              }
            }}>
              <p>Enter the six-digit code shown on the pad, then confirm on the pad.</p>
              <Field label="Pad to pair">
                <select value={candidate.device} disabled={pairing} onChange={(e) => {
                  setPairDevice(e.target.value);
                  setCode("");
                  setPairState(null);
                }}>
                  {offers.map((offer) => <option key={offer.device} value={offer.device}>{offer.device}</option>)}
                </select>
              </Field>
              <Field label="Code on the pad">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  minLength={6}
                  maxLength={6}
                  autoComplete="off"
                  spellCheck={false}
                  required
                  disabled={pairing}
                  aria-describedby="pair-code-note"
                />
              </Field>
              <p id="pair-code-note">The code stays in memory. Pair again after restarting the desk or pad.</p>
              <button className="primary" disabled={pairing}>
                {pairing ? "Starting encrypted pairing…" : "Pair securely"}
                <Icon name="arrowUpRight" />
              </button>
            </form>
          ) : !found.length && (
            <p>No pad connected. Connect a pad over USB, Bluetooth or Wi-Fi to pair.</p>
          )}
          <State state={pairState} title="Pairing needs attention." />
          {pairState?.data && <p role="status">{pairState.data}</p>}
          <div className="step-heading">
            <span>03</span>
            <h2>Ready for what’s next.</h2>
          </div>
          <p>
            {system.data?.firmware.setupRequired || "Reading firmware status…"}
          </p>
          <button disabled title="A signed firmware package is required">
            Update firmware <Icon name="arrowUpRight" />
          </button>
          <details>
            <summary>Firmware {found[0]?.firmware || system.data?.firmware.version || "version unavailable"} release notes</summary>
            <ul>
              {system.data?.firmware.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </details>
        </div>
      </div>
      <div className="connection-details">
        <section>
          <Icon name="wave" />
          <h3>Give Wi-Fi a home.</h3>
          <p>
            Open the pad’s captive portal, choose your network, and enter the
            reachable desk URL with its matching pad token. Use LAN or a trusted
            phone relay.
          </p>
          <p>
            A 100.x tailnet IP alone is not reachable from ESP32. Never put
            model keys on the pad.
          </p>
        </section>
        <section>
          <Icon name="users" />
          <h3>Your desk, wherever it lives.</h3>
          <State state={system} />
          <State state={status} />
          {status.data && (
            <div className="connection-line">
              <span>Desk status checked</span>
              <b>{new Date(status.data.observedAt).toLocaleTimeString()}</b>
            </div>
          )}
          {system.data && (
            <>
              <div className="connection-line">
                <span>Desk host</span>
                <b>{system.data.host.name}</b>
              </div>
              <div className="connection-line">
                <span>Backend</span>
                <b className="success">Reachable</b>
              </div>
              <div className="connection-line">
                <span>Tailscale</span>
                <b>
                  {system.data.tailscale.online
                    ? "Online"
                    : system.data.tailscale.state || "Not configured"}
                </b>
              </div>
              {system.data.tailscale.setupRequired && (
                <p className="setup-note">
                  {system.data.tailscale.setupRequired}
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
}
