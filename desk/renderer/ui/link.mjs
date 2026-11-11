import {
  $,
  esc,
  heading,
  panel,
  empty,
  loading,
  error,
  stat,
  detail,
  action,
  notice,
} from "./shared.mjs";
export async function mount({ el, api, subscribe, signal }) {
  el.innerHTML =
    heading(
      "09",
      "Stay connected.",
      "USB first. BLE next. Wi-Fi when you need room to move.",
      "ESP32-S3 / PROTOCOL V1",
    ) +
    `<div class="grid"><div class="stack">${panel("Transport status", `<div id="link-status">${loading()}</div>`)}${panel("Device & firmware", `<div id="link-devices">${loading()}</div>`)}${panel("Desk connection", '<div class="panel-body"><p class="muted">The browser connects with the desk’s pad token. Provider keys remain on the machine running Electron.</p><button id="reconnect-desk">Change desk connection</button></div>')}</div><div class="stack">${panel("Provisioning guide", `<div class="panel-body"><span class="eyebrow">01 / USB-C</span><h3>Plug in. Keep the desk open.</h3><p class="muted">Use a data-capable USB-C cable. Firmware must enable ESP32-S3 USB CDC on boot. The desk discovers Espressif devices at 115200 baud; a valid v1 hello confirms the link.</p><span class="eyebrow">02 / BLE</span><h3>Pair a trusted relay.</h3><p class="muted">The pad exposes Nordic UART. The desk’s optional BLE adapter or XOR phone relay carries the authenticated v1 records. BLE does not sign wallet transactions.</p><span class="eyebrow">03 / WI-FI</span><h3>Provision from the pad portal.</h3><p class="muted">Open the pad’s captive portal, enter your Wi-Fi credentials, and set the reachable desk URL and matching pad token. The ESP32 does not join Tailscale directly: use LAN, USB, a relay, or the configured HTTPS Funnel URL.</p><p class="hint">A 100.x tailnet IP alone is not reachable from the pad. Do not put provider API keys on the device.</p></div>`)}${panel("Connection behavior", '<div class="panel-body"><p class="muted">USB wins over BLE, then Wi-Fi. Links expire after 15 seconds without a response. Keymaps are pushed on hello and after every edit. Trade inputs are never replayed after a disconnect.</p><a class="button" href="#pad">Open key programmer →</a></div>')}</div></div>`;
  function render(d) {
    const devices = d.devices || [];
    $("#link-status", el).innerHTML = `<div class="panel-body">${[
      "usb",
      "ble",
      "wifi",
    ]
      .map((t) => {
        const found = devices.filter((p) => p.link === t);
        return `<div class="row-top" style="padding:14px 0"><h3>${t === "usb" ? "USB-CDC" : t === "ble" ? "Bluetooth LE" : "Wi-Fi"}</h3><span class="tag">${found.length ? "CONNECTED" : "NO VERIFIED DEVICE"}</span></div>`;
      })
      .join(
        "",
      )}<p class="hint">Observed ${esc(d.observedAt)}. Only completed device handshakes appear connected.</p></div>`;
    $("#link-devices", el).innerHTML = devices.length
      ? devices
          .map(
            (p) =>
              `<div class="row"><div class="row-top"><h3>${esc(p.device)}</h3><span class="tag">FW ${esc(p.firmware)}</span></div><p>Transport ${esc(p.link)} · Last seen ${esc(p.lastSeen)}</p>${detail("Live device status", p.status)}</div>`,
          )
          .join("")
      : empty(
          "Setup required: connect a pad",
          "Firmware version is unavailable until the ESP32-S3 sends a valid hello.",
        );
  }
  async function refresh() {
    try {
      const d = await api("/desk/link");
      if (!signal.aborted) render(d);
    } catch (e) {
      if (!signal.aborted) {
        $("#link-status", el).innerHTML = error(e);
        $("#link-devices", el).innerHTML = error(e);
      }
    }
  }
  $("#reconnect-desk", el).onclick = () => $("#connect").click();
  const off = subscribe((e) => {
    if (e.type === "pad_link") render(e);
  });
  await refresh();
  const timer = setInterval(refresh, 5000);
  return () => {
    off();
    clearInterval(timer);
  };
}
