import React, { useState } from "react";
import { useDesk, useRead, State } from "../core";
import { LoopVideo } from "../brand/LoopVideo";
import { Icon } from "../brand/Icon";
import { BlurWords } from "../brand/BlurWords";
export function Connect() {
  const d = useDesk(),
    link = useRead("/desk/link", 5000),
    system = useRead("/desk/connection", 30000);
  const [transport, setTransport] = useState("usb"),
    [searching, setSearching] = useState(false),
    [searched, setSearched] = useState(false);
  const found = link.data?.devices?.filter((x) => x.link === transport) || [];
  return (
    <section className="page connect-page">
      <div className="page-heading">
        <div>
          <h1>
            <BlurWords text={"Good things connect."} immediate />
          </h1>
          <p>One calm setup. Then your whole desk, at your fingertips.</p>
        </div>
        <span className="badge">USB first. Wireless when you need it.</span>
      </div>
      <div className="pairing-layout">
        <div className="pairing-theater">
          <LoopVideo
            sources={[{ src: "/desktop/media/rings.webm", type: "video/webm" }]}
            poster="/desktop/media/rings.jpg"
            className="rings-film"
          />
          <div className="pairing-copy">
            <span className="badge">
              {found.length ? "Verified device" : "Let’s find your pad"}
            </span>
            <h2>{found.length ? found[0].device : "A little closer."}</h2>
            <p>
              {found.length
                ? `${found[0].link.toUpperCase()} · Firmware ${found[0].firmware}`
                : "Connect xorrpad to the machine running your desk."}
            </p>
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
                <Icon name={id === "usb" ? "bolt" : "wave"} />
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
            {searching ? "Reading available transports…" : "Find my pad"}
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
          {found.length ? (
            <div className="found-device">
              <span className="status-dot live" />
              <div>
                <b>{found[0].device}</b>
                <p>
                  Firmware {found[0].firmware} · Last seen{" "}
                  {new Date(found[0].lastSeen).toLocaleTimeString()}
                </p>
                <a className="subtle-link" href="#device">
                  Customize this pad <Icon name="arrowUpRight" />
                </a>
              </div>
            </div>
          ) : (
            <p>
              Setup required: a valid v1 hello from your pad. We’ll show it here
              when the handshake is verified.
            </p>
          )}
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
            <summary>Firmware 1.0.0 release notes</summary>
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
