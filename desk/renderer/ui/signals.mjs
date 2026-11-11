/** One persistent queue across routes. All answers use the server's expiry and gate. */
import { $, esc, empty, notice, action } from "./shared.mjs";
import { signalView, bindSignals, walletView } from "./trade.mjs";
export function mountSignals({ api, subscribe }) {
  const root = document.createElement("div");
  root.id = "global-signals";
  root.innerHTML = `<section id="signal-toast" hidden aria-label="Incoming trade signal" aria-live="polite"><div class="signal-toast-head"><strong>Decision waiting</strong><button id="dismiss-signal" aria-label="Dismiss signal notification">Hide</button></div><div id="signal-toast-body"></div><button id="view-signals">Open signal drawer</button></section><aside id="signal-drawer" aria-label="Signals and wallet requests" hidden><div class="panel-head"><h2>Signals & decisions</h2><button id="close-signals">Close</button></div><div id="global-signal-list"></div><div id="signal-wallet"></div></aside>`;
  document.body.append(root);
  const trigger = document.createElement("button");
  trigger.id = "signal-trigger";
  trigger.textContent = "Signals";
  trigger.setAttribute("aria-controls", "signal-drawer");
  trigger.setAttribute("aria-expanded", "false");
  $(".topbar").insertBefore(trigger, $("#connect"));
  const entries = new Map();
  let dismissed = null;
  const drawer = $("#signal-drawer", root);
  function open(value = true) {
    drawer.hidden = !value;
    trigger.setAttribute("aria-expanded", String(value));
    if (value) $("#close-signals", root).focus();
    else trigger.focus();
  }
  trigger.onclick = () => open(drawer.hidden);
  $("#view-signals", root).onclick = () => open();
  $("#close-signals", root).onclick = () => open(false);
  function render() {
    const list = [...entries.values()].reverse(),
      waiting = list.filter(
        (s) => s.state === "awaiting" && s.expiresAt > Date.now(),
      ),
      latest = waiting[0];
    trigger.textContent = `Signals${waiting.length ? " · " + waiting.length : ""}`;
    $("#global-signal-list", root).innerHTML = list.length
      ? list.slice(0, 32).map(signalView).join("")
      : empty(
          "No decisions waiting",
          "Create a quote-backed proposal from the order ticket.",
          { target: "#trade", label: "Open Trade" },
        );
    const toast = $("#signal-toast", root);
    toast.hidden = !latest || latest.id === dismissed;
    $("#signal-toast-body", root).innerHTML = latest ? signalView(latest) : "";
    for (const surface of [
      $("#global-signal-list", root),
      $("#signal-toast-body", root),
    ])
      bindSignals(surface, api, refresh, $("#signal-wallet", root));
    $("#dismiss-signal", root).onclick = () => {
      dismissed = latest?.id;
      toast.hidden = true;
    };
    countdowns();
  }
  async function refresh() {
    try {
      const data = await api("/signals");
      entries.clear();
      for (const s of data.signals) entries.set(s.id, s);
      render();
    } catch (e) {
      $("#global-signal-list", root).textContent = e.message;
    }
  }
  function countdowns() {
    for (const node of document.querySelectorAll("[data-countdown]")) {
      const seconds = Math.max(
        0,
        Math.ceil((Number(node.dataset.countdown) - Date.now()) / 1000),
      );
      node.textContent = seconds ? `${seconds}s left` : "Expired";
      for (const b of node
        .closest("[data-signal]")
        ?.querySelectorAll("[data-accept],[data-refuse]") || [])
        if (!seconds) b.disabled = true;
    }
    const latest = [...entries.values()].find(
      (s) => s.state === "awaiting" && s.expiresAt > Date.now(),
    );
    if (!latest) $("#signal-toast", root).hidden = true;
  }
  const off = subscribe((e) => {
    if (e.type === "snapshot") {
      entries.clear();
      for (const s of e.signals || []) entries.set(s.id, s);
      render();
    }
    if (e.type === "signal") {
      entries.set(e.signal.id, e.signal);
      render();
    }
    if (e.type === "wallet_request") {
      open();
      walletView($("#signal-wallet", root), e, api, e.id);
    }
    if (["execution_error", "signal_error"].includes(e.type)) notice(e.error);
  });
  const answer = (e) => {
    const { id, accept } = e.detail || {};
    if (!entries.has(id)) return;
    action(trigger, async () => {
      const r = await api(
        `/signals/${encodeURIComponent(id)}/${accept ? "accept" : "refuse"}`,
        {},
      );
      notice(r.execution?.error || r.setupRequired || `Signal ${r.state}`);
      if (r.execution?.transaction) {
        open();
        walletView($("#signal-wallet", root), r.execution, api, id);
      }
      await refresh();
    });
  };
  window.addEventListener("xorr-answer-signal", answer);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !drawer.hidden) open(false);
  });
  const timer = setInterval(countdowns, 1000),
    reconcile = setInterval(refresh, 15000);
  refresh();
  return () => {
    off();
    clearInterval(timer);
    clearInterval(reconcile);
    window.removeEventListener("xorr-answer-signal", answer);
    root.remove();
    trigger.remove();
  };
}
