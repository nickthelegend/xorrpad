import { $, esc, heading, empty, error, notice, action } from "./shared.mjs";
const icons = {
  pad: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12M15 9v12M3 15h18"/>',
  trade: '<path d="M4 17l6-6 4 3 6-9M14 5h6v6"/>',
  predict: '<path d="M12 3l9 9-9 9-9-9zM12 8v8M8 12h8"/>',
  positions: '<path d="M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1"/>',
  chats: '<path d="M4 4h16v12H9l-5 4zM8 8h8M8 12h5"/>',
  agent:
    '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4M10 10h4v4h-4z"/>',
  permissions:
    '<path d="M12 2l8 4v6c0 5-8 10-8 10S4 17 4 12V6zM8 12l3 3 5-6"/>',
  backtest: '<path d="M4 3v17h17M7 15l4-5 4 3 5-7"/>',
  link: '<path d="M8 8l3-3a5 5 0 017 7l-3 3M16 16l-3 3a5 5 0 01-7-7l3-3M8 16l8-8"/>',
};
const pages = [
  ["pad", "Pad"],
  ["trade", "Trade"],
  ["predict", "Predict"],
  ["positions", "Positions & receipts"],
  ["chats", "Chats"],
  ["agent", "Agent"],
  ["permissions", "Permissions"],
  ["backtest", "Backtest"],
  ["link", "Link"],
].map(([id, name]) => [
  id,
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${icons[id]}</svg>`,
  name,
]);
$("#navigation").innerHTML = pages
  .map(
    ([id, icon, name]) =>
      `<a href="#${id}" data-page="${id}"><span class="nav-icon" aria-hidden="true">${icon}</span>${name}</a>`,
  )
  .join("");
let audio,
  audioAt = 0;
window.addEventListener("xorr-enable-audio", () => {
  audio ??= new AudioContext({ sampleRate: 16000 });
  audio.resume().catch(() => notice("Enable audio in browser settings"));
});
function play(e) {
  if (
    !audio ||
    audio.state !== "running" ||
    !["speech_chunk", "speech"].includes(e.type) ||
    !e.pcm
  )
    return;
  try {
    const raw = Uint8Array.from(atob(e.pcm), (c) => c.charCodeAt(0));
    if (!raw.length || raw.length % 2) return;
    const pcm = new DataView(raw.buffer),
      buffer = audio.createBuffer(1, raw.length / 2, e.sampleRate || 16000),
      out = buffer.getChannelData(0);
    for (let i = 0; i < out.length; i++)
      out[i] = pcm.getInt16(i * 2, true) / 32768;
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    audioAt = Math.max(audioAt, audio.currentTime + 0.02);
    source.start(audioAt);
    audioAt += buffer.duration;
  } catch {
    notice("Audio stream could not be played");
  }
}
let token = new URLSearchParams(location.search).get("token") || "",
  socket,
  retry,
  cleanup,
  controller,
  currentPage;
let theme = "floor";
try {
  theme = localStorage.getItem("xorr-theme") || theme;
} catch {}
if (!["floor", "paper", "neon"].includes(theme)) theme = "floor";
document.documentElement.dataset.theme = theme;
$("#theme").value = theme;
$("#theme").onchange = (e) => {
  document.documentElement.dataset.theme = e.target.value;
  try {
    localStorage.setItem("xorr-theme", e.target.value);
  } catch {}
};
const events = new EventTarget();
async function api(
  path,
  body,
  {
    method = body === undefined ? "GET" : "POST",
    signal = controller?.signal,
  } = {},
) {
  if (!token) throw new Error("Setup required: connect with your pad token");
  const r = await fetch(path, {
    method,
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(90000)])
      : AbortSignal.timeout(90000),
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(
      r.status === 401
        ? "Setup required: valid pad token"
        : data.error || `Desk HTTP ${r.status}`,
    );
  return data;
}
function subscribe(fn) {
  const cb = (e) => fn(e.detail);
  events.addEventListener("data", cb);
  return () => events.removeEventListener("data", cb);
}
function stream() {
  clearTimeout(retry);
  if (socket) {
    socket.onclose = null;
    socket.close();
  }
  if (!token) return;
  try {
    socket = new WebSocket(location.origin.replace(/^http/, "ws") + "/events", [
      "xorrpad",
      "pad-token." + token,
    ]);
  } catch {
    $("#connection").textContent = "Invalid pad token";
    return;
  }
  socket.onopen = () => {
    $("#connection").textContent = "Desk connected";
    $("#connection").classList.add("live");
  };
  socket.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      play(data);
      events.dispatchEvent(new CustomEvent("data", { detail: data }));
    } catch {}
  };
  socket.onclose = () => {
    $("#connection").textContent = "Reconnecting";
    $("#connection").classList.remove("live");
    retry = setTimeout(stream, 5000);
  };
  socket.onerror = () => {
    $("#connection").textContent = "Connection unavailable";
  };
}
async function render() {
  cleanup?.();
  cleanup = null;
  controller?.abort();
  controller = new AbortController();
  const own = controller;
  const id = location.hash.slice(1) || "pad";
  const page = pages.find((p) => p[0] === id) || pages[0];
  currentPage = page[0];
  document.title = `${page[2]} / XOR Desk`;
  $("#crumb").textContent = page[2];
  for (const a of document.querySelectorAll("[data-page]"))
    a.toggleAttribute("aria-current", false);
  $(`[data-page="${page[0]}"]`).setAttribute("aria-current", "page");
  document.body.classList.remove("nav-open");
  $("#menu").setAttribute("aria-expanded", "false");
  const main = $("#content");
  delete main.dataset.ready;
  const view = document.createElement("div");
  main.replaceChildren(view);
  view.innerHTML = heading("—", page[2], "Preparing workspace…");
  try {
    const module = await import(`./${page[0]}.mjs`);
    if (own.signal.aborted) return;
    const dispose = await module.mount({
      el: view,
      api: (path, body, opts = {}) =>
        api(path, body, { ...opts, signal: own.signal }),
      subscribe: (fn) => {
        const off = subscribe(fn);
        own.signal.addEventListener("abort", off, { once: true });
        return off;
      },
      signal: own.signal,
    });
    if (own.signal.aborted) dispose?.();
    else {
      cleanup = dispose;
      main.dataset.ready = page[0];
    }
  } catch (e) {
    if (!own.signal.aborted) {
      view.innerHTML =
        heading("—", page[2], "Your workspace is unavailable.") + error(e);
      main.dataset.ready = page[0];
    }
  }
}
$(".skip").onclick = (e) => {
  e.preventDefault();
  $("#content").focus();
};
$("#menu").onclick = () => {
  const open = document.body.classList.toggle("nav-open");
  $("#menu").setAttribute("aria-expanded", String(open));
};
$("#connect").onclick = () => {
  $("#auth").showModal();
  $("#token").focus();
};
$("#cancel-auth").onclick = () => $("#auth").close();
$("#auth-form").onsubmit = async (e) => {
  e.preventDefault();
  const field = $("#token"),
    candidate = field.value.trim();
  await action(e.submitter, async () => {
    const r = await fetch("/signals", {
      headers: { authorization: "Bearer " + candidate },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error("Setup required: valid pad token");
    token = candidate;
    field.value = "";
    $("#auth").close();
    stream();
    await render();
    notice("Desk connected");
  });
};
$("#classic").onclick = (e) => {
  e.preventDefault();
  location.href =
    "/classic" + (token ? "?token=" + encodeURIComponent(token) : "");
};
$("#panic").onclick = (e) =>
  action(e.currentTarget, async () => {
    await api("/panic", {});
    notice("All trading disarmed");
  });
window.addEventListener("hashchange", render);
stream();
render();
