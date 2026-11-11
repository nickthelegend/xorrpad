import {
  $,
  esc,
  fmt,
  heading,
  panel,
  loading,
  error,
  options,
  notice,
  action,
} from "./shared.mjs";
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
const locked = new Set(["mic", "kill", "yes", "no"]);
export async function mount({ el, api, subscribe, signal }) {
  el.innerHTML =
    heading(
      "01",
      "Your desk, in hardware.",
      "Program a key. Turn an idea into an action. Every trade still passes through your permissions.",
      "14 KEYS / 1 KNOB",
    ) +
    `<div class="grid"><div class="stack">${panel("Pad mirror", `<div id="mirror">${loading()}</div>`, "", "ESP32-S3")}${panel("Selected key", `<div id="key-settings">${loading()}</div>`)}</div><div class="stack">${panel("Action library", `<div class="panel-body"><p class="muted">Drag an action onto a key, or select a key and choose an action below.</p><div class="action-library">${actions.map((a) => `<button class="action-item" draggable="true" data-action="${a}">${esc(a[0].toUpperCase() + a.slice(1))}<small>KEY ACTION ↗</small></button>`).join("")}</div></div>`)}${panel("A deliberate safety layer", '<div class="panel-body"><h3>Four controls stay where they belong.</h3><p class="muted">Accept, Refuse, hold-to-talk and hold-to-kill keep their measured positions. Assignments push to every connected pad after the desk validates the full keymap.</p><a class="button" href="#permissions">Review permissions →</a></div>')}</div></div>`;
  let map,
    selected = 0,
    link = { devices: [] },
    pressed,
    pressedTimer,
    receipt,
    receiptAt = 0,
    knobAngle = 0,
    knobSize = null;
  const entries = new Map();
  function screen() {
    const d = link.devices[0],
      s = d?.status;
    const pending = [...entries.values()]
      .filter((e) => e.state === "awaiting" && e.expiresAt > Date.now())
      .at(-1);
    const head = `<span class="eyebrow">${d ? esc(d.link.toUpperCase()) + " / " + esc(d.firmware) : "NO PAD CONNECTED"}</span>`;
    if (pending) {
      const p = pending.proposal,
        v = p.verdict,
        a = p.signal;
      return (
        head +
        `<div class="tft-confirm"><span>${esc(a.side)}</span><b>CONFIRM</b></div><strong>${esc(a.kind === "predict" ? (a.outcomeSide || "").toUpperCase() + " OUTCOME" : a.symbol || a.market)}</strong><span class="mono">${fmt(v.sizeUsd, a.kind === "predict" ? "mUSDC" : "USD")} · ${Math.max(0, Math.ceil((pending.expiresAt - Date.now()) / 1000))}s left</span><span class="tft-meta">WHY · ${esc((v.why || []).join(" · "))}</span><span class="tft-answers"><span>✓ YES</span><span>✗ NO</span></span><span class="tft-meta">${esc(a.venue || p.routing?.best?.venue || "")} · Press ✓ / ✗</span>`
      );
    }
    if (receipt && Date.now() - receiptAt < 15000)
      return (
        head +
        `<strong>CONFIRMED</strong><span class="tft-meta mono">${esc(receipt.signature)}</span>`
      );
    if (!d)
      return (
        head +
        '<strong>Awaiting device</strong><span class="mono">Setup required: connect pad</span>'
      );
    return (
      head +
      `<strong>${esc(s.market || "No market")}</strong><span class="mono">${fmt(s.sizeUsd, "USD")}</span><span class="tft-meta">${esc(s.agent || "")} · ${s.armed ? "ARMED" : "DISARMED"} · ${s.autoAccept ? "AUTO" : "MANUAL"}</span>`
    );
  }
  function paintScreen() {
    const t = $(".tft", el);
    if (t) {
      const html = screen();
      if (t.innerHTML !== html) t.innerHTML = html;
    }
  }
  function mirror() {
    const focused = document.activeElement?.dataset?.key;
    const d = link.devices[0],
      s = d?.status;
    $("#mirror", el).innerHTML =
      `<div class="device-wrap"><div class="device"><div class="device-top"><div class="tft" aria-live="polite">${screen()}</div><div><div class="knob" aria-label="Physical size knob"><span class="knob-marker" style="transform:rotate(${knobAngle}deg)"></span></div><span class="eyebrow">SIZE / USD</span></div></div><div class="key-grid">${map.keys.map((k, i) => `<button class="pad-key ${selected === i ? "selected" : ""} ${pressed === i ? "pressed" : ""}" style="grid-row:${k.row + 1};grid-column:${k.col + 1}" data-key="${i}" aria-pressed="${selected === i}" aria-label="Key row ${k.row + 1}, column ${k.col + 1}: ${esc(k.label)}"><span>${String(i + 1).padStart(2, "0")} ${locked.has(k.action) ? "· FIXED" : ""}</span>${esc(k.label)}</button>`).join("")}</div><div class="device-caption"><span>XOR / PAD</span><span>${d ? esc(d.device) : "USB · BLE · WI-FI"}</span></div></div></div><div class="hero-note"><span>${d ? "Live transport: " + esc(d.link) : "Setup required: connect the ESP32-S3 pad"}</span><span>Keymap revision ${map.revision}</span></div>`;
    for (const b of el.querySelectorAll("[data-key]")) {
      b.onclick = () => {
        selected = Number(b.dataset.key);
        mirror();
        settings();
        const key = map.keys[selected];
        const pending = [...entries.values()]
          .filter((e) => e.state === "awaiting" && e.expiresAt > Date.now())
          .at(-1);
        if (pending && ["yes", "no"].includes(key.action))
          window.dispatchEvent(
            new CustomEvent("xorr-answer-signal", {
              detail: { id: pending.id, accept: key.action === "yes" },
            }),
          );
      };
      b.ondragover = (e) => {
        if (!locked.has(map.keys[Number(b.dataset.key)].action))
          e.preventDefault();
      };
      b.ondrop = (e) => {
        e.preventDefault();
        selected = Number(b.dataset.key);
        mirror();
        settings();
        choose(e.dataTransfer.getData("text/plain"));
      };
    }
    if (focused !== undefined)
      $(`[data-key="${focused}"]`, el)?.focus({ preventScroll: true });
  }
  function settings() {
    const k = map.keys[selected],
      fixed = locked.has(k.action);
    $("#key-settings", el).innerHTML =
      `<form class="panel-body" id="key-form"><div class="fields"><label>Key ${selected + 1} · label<input name="label" maxlength="16" pattern="[ -~]{1,16}" required value="${esc(k.label)}"></label><label>Action<select name="action" ${fixed ? "disabled" : ""}>${options([...new Set([k.action, ...actions])], k.action)}</select></label>${!fixed ? '<label class="wide">Custom action (optional)<input name="custom" placeholder="pmamm:market-public-key:yes" maxlength="96"></label>' : ""}</div><div class="actions"><button class="primary">Save & push keymap</button><span class="hint">${fixed ? "Safety action is fixed. You can edit its label." : "Changes apply after saving."}</span></div></form>`;
    $("#key-form", el).onsubmit = (e) => {
      e.preventDefault();
      action(e.submitter, async () => {
        const f = new FormData(e.target);
        const next = structuredClone(map);
        next.revision++;
        next.keys[selected] = {
          ...k,
          label: f.get("label"),
          action: fixed ? k.action : f.get("custom") || f.get("action"),
        };
        map = await api("/pad/keymap", next);
        mirror();
        settings();
        notice("Keymap saved and pushed to connected pads");
      });
    };
  }
  function choose(a) {
    if (locked.has(map.keys[selected].action)) {
      notice("Select a programmable key first");
      return;
    }
    const form = $("#key-form", el);
    const field = form.elements.action;
    if ([...field.options].some((o) => o.value === a)) {
      field.value = a;
      form.elements.label.value = a.toUpperCase();
      notice("Action selected. Save & push to apply.");
    }
  }
  for (const b of el.querySelectorAll("[data-action]")) {
    b.ondragstart = (e) =>
      e.dataTransfer.setData("text/plain", b.dataset.action);
    b.onclick = () => map && choose(b.dataset.action);
  }
  async function refresh() {
    try {
      link = await api("/desk/link");
      if (map && !signal.aborted) mirror();
    } catch (e) {
      if (!signal.aborted) $("#mirror", el).innerHTML = error(e);
    }
  }
  const off = subscribe((e) => {
    if (e.type === "snapshot") {
      entries.clear();
      for (const entry of e.signals || []) entries.set(entry.id, entry);
      paintScreen();
    }
    if (e.type === "signal") {
      entries.set(e.signal.id, e.signal);
      if (e.signal.state === "awaiting") receipt = null;
      paintScreen();
    }
    if (e.type === "receipt") {
      receipt = e.receipt;
      receiptAt = Date.now();
      paintScreen();
    }

    if (e.type === "pad_link") {
      link = e;
      map && mirror();
    }
    if (e.type === "pad" && map) {
      const m = e.message;
      if (m.type === "key") {
        pressed = map.keys.findIndex((k) => k.row === m.row && k.col === m.col);
        if (pressed < 0)
          pressed = map.keys.findIndex((k) => k.action === m.action);
        mirror();
        clearTimeout(pressedTimer);
        pressedTimer = setTimeout(() => {
          pressed = null;
          if (!signal.aborted) mirror();
        }, 220);
      }
      if (m.type === "knob") {
        const d = link.devices.find((d) => d.device === e.device);
        const previous = knobSize ?? d?.status?.sizeUsd ?? m.sizeUsd;
        knobAngle += Math.sign(m.sizeUsd - previous) * 18;
        knobSize = m.sizeUsd;
        if (d) d.status.sizeUsd = m.sizeUsd;
        const marker = $(".knob-marker", el);
        if (marker) marker.style.transform = `rotate(${knobAngle}deg)`;
        paintScreen();
      }
      if (m.type === "keymap_state") refresh();
    }
  });
  try {
    const [keymap, queue] = await Promise.all([
      api("/pad/keymap"),
      api("/signals"),
    ]);
    map = keymap;
    for (const entry of queue.signals) entries.set(entry.id, entry);
    if (!signal.aborted) {
      mirror();
      settings();
      await refresh();
    }
  } catch (e) {
    if (!signal.aborted) {
      $("#mirror", el).innerHTML = error(e);
      $("#key-settings", el).innerHTML = error(e);
    }
  }
  const timer = setInterval(refresh, 5000);
  const screenTimer = setInterval(paintScreen, 1000);
  return () => {
    off();
    clearInterval(timer);
    clearInterval(screenTimer);
    clearTimeout(pressedTimer);
  };
}
