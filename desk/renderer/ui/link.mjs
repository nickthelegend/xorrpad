import {
  $,
  esc,
  heading,
  panel,
  empty,
  loading,
  error,
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
      "ESP32-S3 / PROTOCOL V2",
    ) +
    `<div class="grid"><div class="stack">${panel("Transport & firmware", '<div id="link-status">' + loading() + '</div><div id="link-devices"></div>')}
    ${panel("Pair this pad", `<form id="pair-pad" class="panel-body"><p>Scan the QR on the pad with the XOR app, or paste its pairing URL here. Enter the six digits shown on the TFT.</p><label>Pairing URL<input name="qr" type="url" required placeholder="xorrpad://pair?…" autocomplete="off"></label><label>Code on the pad<input name="code" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="off"></label><button class="primary">Pair securely</button><p class="hint">Bluetooth uses the same displayed passkey. Pairing codes stay in desk memory and must be entered again after restarting the desk or pad.</p><div id="pair-feedback" role="status"></div></form>`)}
    ${panel(
      "Pad settings",
      `<form id="pad-settings" class="panel-body"><label>Hold confirmation above USD<input name="holdThreshold" type="number" min="0" max="1000000" step="0.01" value="100" required></label><label>Brightness<input name="brightness" type="range" min="1" max="255" value="220"></label>${[
        ["night", "Night mode"],
        ["highContrast", "High contrast"],
        ["speakAmounts", "Speak the amount when confirming"],
        ["leftHanded", "Flip action keys for left-handed use"],
        ["legacyV1", "Enable legacy v1 link"],
        ["usbDebug", "Enable USB debug console"],
      ]
        .map(
          ([name, label]) =>
            `<label class="check"><input name="${name}" type="checkbox">${label}</label>`,
        )
        .join(
          "",
        )}<p class="hint">Above the threshold, hold YES for 800 ms. Legacy links use the v1 pad token and do not provide v2 encryption. USB debug is off by default.</p><button>Save pad settings</button></form>`,
    )}
    </div><div class="stack">${panel("Signed firmware update", `<form id="firmware-update" class="panel-body"><p>Select the release manifest and matching app image. The desk and pad both verify the signature.</p><label>Paired pad<select name="device" id="update-device" required></select></label><label>manifest.json<input name="manifest" type="file" accept=".json,application/json" required></label><div id="manifest-detail" role="status"></div><label>app.bin<input name="image" type="file" accept=".bin,application/octet-stream" required></label><button id="install-update" class="primary" disabled>Verify & install update</button><p class="hint">Keep USB power connected. Progress appears on the TFT and in device status. A failed boot health check rolls back within 60 seconds.</p><div id="update-feedback" role="status"></div></form>`)}
    ${panel("Profiles & layers", `<form id="profiles" class="panel-body"><p>Save up to eight profiles. Each keeps separate Spot, Perps and Predict keymaps.</p><label>Target pad<select name="device" id="profile-device"></select></label><p class="hint device-hint">Connect and pair a v2 pad to install updates or use a profile. Profiles can be saved while disconnected.</p><label>Profile<select name="profile" id="profile-select"></select></label><label>Layer<select name="layer"><option value="0">Spot</option><option value="1">Perps</option><option value="2">Predict</option></select></label><label>Profile name<input name="name" maxlength="20" placeholder="Scalper, Swing, Predictor…"></label><div class="actions"><button name="save" value="save">Save current keys to layer</button><button id="activate-profile" name="activate" value="activate" disabled>Use on pad</button></div><p class="hint">Program keys on the Pad screen, then save them into a profile layer. Bind profile:next or layer:next to cycle on the pad.</p></form>`)}
    ${panel("Connection guide", `<div class="panel-body"><h3>USB-C</h3><p>Use a data cable with the native USB port. Pair with the TFT code and QR before trading.</p><h3>BLE</h3><p>Use the optional desk Bluetooth adapter or XOR phone relay. LE Secure Connections protects Bluetooth; v2 frames are also encrypted. Voice uses 16 kHz mono Opus.</p><h3>Wi-Fi</h3><p>Use the captive portal to set Wi-Fi and the reachable desk URL. The ESP32 does not join Tailscale itself; use LAN or the configured HTTPS Funnel.</p><p>Links expire after 15 seconds. Offline inputs never queue trades. Hold KILL for 2 seconds to latch trading off across reboot.</p><button id="reconnect-desk">Change desk connection</button></div>`)}
    </div></div>`;
  let devices = [],
    profiles = [],
    settingsLoaded = false;
  function render(d) {
    devices = d.devices || [];
    $("#link-status", el).innerHTML =
      `<div class="panel-body">${["usb", "ble", "wifi"].map((t) => `<div class="row-top"><h3>${t === "usb" ? "USB-CDC" : t === "ble" ? "Bluetooth LE" : "Wi-Fi"}</h3><span class="tag">${devices.some((p) => p.link === t) ? "CONNECTED" : "NO VERIFIED DEVICE"}</span></div>`).join("")}<p class="hint">Observed ${esc(d.observedAt)}</p>${d.pairing?.length ? "<p>Pad found. Use its displayed code and QR to finish pairing.</p>" : ""}</div>`;
    $("#link-devices", el).innerHTML = devices.length
      ? devices
          .map(
            (p) =>
              `<div class="row"><div class="row-top"><h3>${esc(p.device)}</h3><span class="tag">FW ${esc(p.firmware)}</span></div><p>${esc(p.link)} · ${p.secure ? "Encrypted v2" : "Legacy v1"} · ${esc(p.lastSeen)}</p>${p.ota ? `<p>Update ${esc(p.ota.state)} · ${esc(p.ota.progress)}% ${esc(p.ota.error || "")}</p>` : ""}${p.killed ? `<p>Kill latch active</p><button data-rearm="${esc(p.device)}">Request rearm on pad</button>` : ""}${detail("Live status", p.status)}${p.telemetry ? detail("Health telemetry", p.telemetry) : ""}</div>`,
          )
          .join("")
      : empty(
          "Setup required: connect and pair a pad",
          "Connect USB, BLE or Wi-Fi, then use the QR and code shown on the TFT.",
        );
    const secure=devices.filter(p=>p.secure);
    for(const id of ['update-device','profile-device']){
      const select=$('#'+id,el),value=select.value;
      select.innerHTML=secure.length?secure.map(p=>`<option value="${esc(p.device)}">${esc(p.device)} · ${esc(p.link)}</option>`).join(''):'<option value="">No paired v2 pad connected</option>';
      if([...select.options].some(o=>o.value===value))select.value=value;
    }
    $('#install-update',el).disabled=!secure.length;
    $('#activate-profile',el).disabled=!secure.length||!profiles.length||$('#profile-select',el).value==='new';
    for (const b of el.querySelectorAll("[data-rearm]"))
      b.onclick = () =>
        action(b, async () => {
          await api("/pad/rearm", { device: b.dataset.rearm });
          notice("Hold YES on the pad for 800 ms within 15 seconds.");
        });
    if (!settingsLoaded && d.options) {
      const form = $("#pad-settings", el);
      for (const [k, v] of Object.entries(d.options)) {
        const field = form.elements.namedItem(k);
        if (field) {
          if (field.type === "checkbox") field.checked = v;
          else field.value = v;
        }
      }
      settingsLoaded = true;
    }
  }
  async function refresh() {
    try {
      const d = await api("/desk/link");
      if (!signal.aborted) render(d);
    } catch (e) {
      if (!signal.aborted) $("#link-status", el).innerHTML = error(e);
    }
  }
  async function loadProfiles() {
    profiles = await api("/pad/profiles");
    $("#profile-select", el).innerHTML =
      profiles
        .map((p, i) => `<option value="${i}">${esc(p.name)}</option>`)
        .join("") + '<option value="new">New profile</option>';
  }
  $("#pair-pad", el).onsubmit = (e) => {
    e.preventDefault();
    action(e.submitter, async () => {
      const f = new FormData(e.target),
        u = new URL(f.get("qr"));
      if (
        u.protocol !== "xorrpad:" ||
        u.hostname !== "pair" ||
        u.searchParams.get("v") !== "2" ||
        !/^[0-9a-f]{128}$/.test(u.searchParams.get("pk"))
      )
        throw Error("Paste the complete v2 pairing URL from the pad");
      const pk = u.searchParams.get("pk");
      await api("/pad/pair", {
        device: u.searchParams.get("id"),
        pk: pk.slice(0, 64),
        xpk: pk.slice(64),
        code: f.get("code"),
      });
      e.target.elements.code.value = "";
      $("#pair-feedback", el).textContent =
        "Pairing started. The pad will confirm the encrypted connection.";
      await refresh();
    });
  };
  $("#pad-settings", el).onsubmit = (e) => {
    e.preventDefault();
    action(e.submitter, async () => {
      const f = new FormData(e.target),
        body = {
          holdThreshold: Number(f.get("holdThreshold")),
          brightness: Number(f.get("brightness")),
        };
      for (const k of [
        "night",
        "highContrast",
        "speakAmounts",
        "leftHanded",
        "legacyV1",
        "usbDebug",
      ])
        body[k] = f.has(k);
      await api("/pad/options", body);
      notice("Pad settings saved.");
    });
  };
  let manifest;
  $("#firmware-update", el).elements.manifest.onchange = async (e) => {
    manifest = undefined;
    try {
      const m = JSON.parse(await e.target.files[0].text());
      const checked = await api("/pad/manifest", { manifest: m });
      manifest = m;
      $("#manifest-detail", el).innerHTML =
        `<p>Verified firmware <strong>${esc(checked.version)}</strong> · ${esc(checked.size)} bytes</p><p>${esc(checked.notes)}</p><p class="hint">Minimum desk ${esc(checked.minDeskVersion)}</p>`;
    } catch (e) {
      $("#manifest-detail", el).innerHTML = error(e);
    }
  };
  $("#firmware-update", el).onsubmit = (e) => {
    e.preventDefault();
    action(e.submitter, async () => {
      if (!manifest) throw Error("Select and verify manifest.json first");
      const file = e.target.elements.image.files[0];
      if (!file || file.size !== manifest.size)
        throw Error("Select the matching app.bin");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 16384)
        binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
      await api("/pad/ota", {
        device: e.target.elements.device.value,
        manifest,
        image: btoa(binary),
      });
      $("#update-feedback", el).textContent =
        "Update started. Follow progress in device status and on the TFT.";
    });
  };
  $('#profile-select',el).onchange=()=>{$('#activate-profile',el).disabled=!devices.some(p=>p.secure)||$('#profile-select',el).value==='new';};
  $("#profiles", el).onsubmit = (e) => {
    e.preventDefault();
    action(e.submitter, async () => {
      const f = new FormData(e.target),
        i = f.get("profile"),
        layer = Number(f.get("layer"));
      if (e.submitter.value === "activate") {
        if (i === "new") throw Error("Save the profile first");
        await api("/pad/profile", {
          device: $("#profile-device", el).value,
          profile: Number(i),
          layer,
        });
        notice("Profile selection sent to the pad.");
        return;
      }
      const map = await api("/pad/keymap"),
        name = String(f.get("name")).trim();
      if (i === "new") {
        if (!name) throw Error("Name the profile");
        profiles.push({
          name,
          layers: [
            structuredClone(map),
            structuredClone(map),
            structuredClone(map),
          ],
        });
      } else {
        if (name) profiles[Number(i)].name = name;
        profiles[Number(i)].layers[layer] = map;
      }
      await api("/pad/profiles", { profiles });
      await loadProfiles();
      notice("Profiles saved and synced.");
    });
  };
  $("#reconnect-desk", el).onclick = () => $("#connect").click();
  const off = subscribe((e) => {
    if (e.type === "pad_link") render(e);
    if (e.type === "ota_error") notice(e.error);
  });
  await Promise.all([refresh(), loadProfiles()]);
  const timer = setInterval(refresh, 5000);
  return () => {
    off();
    clearInterval(timer);
  };
}
