export const $ = (s, root = document) => root.querySelector(s);
export const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const fmt = (v, unit, digits = 2) =>
  v == null || !Number.isFinite(Number(v))
    ? "Unavailable"
    : `${Number(v).toLocaleString("en-US", { maximumFractionDigits: digits })} ${unit}`;
export const heading = (n, title, description, tag = "") =>
  `<div class="page-heading"><div><div class="eyebrow">XOR WORKSPACE / ${n}</div><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${tag ? `<span class="tag">${esc(tag)}</span>` : ""}</div>`;
export const panel = (title, body, id = "", tag = "") =>
  `<section class="panel" ${id ? `id="${id}"` : ""}><div class="panel-head"><h2>${esc(title)}</h2>${tag ? `<span class="tag">${esc(tag)}</span>` : ""}</div>${body}</section>`;
const emptyScenes = {
  pad: [
    '<rect x="15" y="12" width="98" height="58" rx="8"/><path d="M24 24h50v18H24zM84 24h18M84 34h18M24 53h15m10 0h15m10 0h15m10 0h5"/>',
    "Open connection guide",
    "#link",
  ],
  trade: [
    '<path d="M14 65V15m0 50h102M30 48l20-15 18 7 29-24M97 16v14m0-14H83M30 58h16m10 0h16m10 0h16"/>',
    "Review order ticket",
    '#ticket [name="market"]',
  ],
  predict: [
    '<path d="M64 12v13m0 32v13M20 41h22m44 0h22M44 41l20-20 20 20-20 20zM21 31v20m86-20v20"/>',
    "Check keeper again",
    "retry",
  ],
  positions: [
    '<rect x="20" y="22" width="88" height="43" rx="6"/><path d="M26 22v-9h65v9M82 36h26v16H82zM34 38h28m-28 12h18"/>',
    "Review wallet setup",
    "#link",
  ],
  chats: [
    '<path d="M17 13h76v40H44L27 67V53H17zM37 27h36M37 39h23M94 27h17v38H87l-9 8v-8H61"/>',
    "Start a conversation",
    "#new-chat",
  ],
  agent: [
    '<rect x="43" y="20" width="42" height="42" rx="5"/><path d="M53 12v8m22-8v8M53 62v8m22-8v8M35 30h8m42 0h8M35 51h8m42 0h8M55 33h18v16H55z"/>',
    "Configure provider",
    "#settings-form input",
  ],
  permissions: [
    '<path d="M64 10l32 12v20c0 16-32 30-32 30S32 58 32 42V22zM49 40l10 10 22-23"/>',
    "Reload permissions",
    "retry",
  ],
  backtest: [
    '<path d="M20 14v50h90M31 51l16-19 18 12 30-27M79 17h16v16M31 70h64"/>',
    "Choose a replay range",
    '#backtest-form [name="from"]',
  ],
  link: [
    '<path d="M53 46l22-22m-32 2l8-8a18 18 0 0125 25l-8 8m-15 7l-8 8a18 18 0 01-25-25l8-8M90 51v17m-8-8h16"/>',
    "Change desk connection",
    "#reconnect-desk",
  ],
};
export function empty(title, description, opts = {}) {
  const page =
    typeof location === "undefined" ? "trade" : location.hash.slice(1) || "pad";
  const [drawing, label, target] = emptyScenes[page] || emptyScenes.trade;
  const reason = /Setup required:/i.test(title + " " + description)
    ? description
    : "Setup required: " + description;
  const dest = opts.target || target;
  const control =
    dest === "retry"
      ? `<button data-empty-retry>${esc(opts.label || label)}</button>`
      : (dest.startsWith("#") && !/^#[a-z]+$/.test(dest)) ||
          ["#new-chat", "#reconnect-desk", "#connect"].includes(dest)
        ? `<button data-empty-target="${esc(dest)}">${esc(opts.label || label)}</button>`
        : `<a class="button" href="${esc(dest)}">${esc(opts.label || label)}</a>`;
  return `<div class="empty"><svg class="empty-art" viewBox="0 0 128 82" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawing}</svg><strong>${esc(title)}</strong><span>${esc(reason)}</span><div class="actions">${control}</div></div>`;
}
export const loading = () =>
  '<div class="loading" role="status">Loading workspace data…</div>';
export const error = (e) => {
  const message = String(e.message || e);
  return message.startsWith("Setup required:")
    ? '<div class="setup-alert" role="alert">' +
        empty(
          "Your workspace needs setup",
          message,
          /pad token/.test(message)
            ? { target: "#connect", label: "Connect desk" }
            : {},
        ) +
        "</div>"
    : `<div class="error" role="alert">${esc(message)}</div>`;
};
export const detail = (title, data) =>
  `<details><summary>${esc(title)}</summary><pre>${esc(JSON.stringify(data, null, 2))}</pre></details>`;
export const stat = (label, value) =>
  `<div class="stat"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
export const options = (values, selected) =>
  values
    .map(
      (v) =>
        `<option value="${esc(typeof v === "object" ? v.id : v)}" ${(typeof v === "object" ? v.id : v) === selected ? "selected" : ""}>${esc(typeof v === "object" ? v.name : v)}</option>`,
    )
    .join("");
export function notice(message) {
  const el = $("#notice");
  el.textContent = message;
  el.style.display = "block";
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => (el.style.display = "none"), 6500);
}
export async function action(button, fn) {
  button.disabled = true;
  try {
    return await fn();
  } catch (e) {
    notice(e.message);
    return null;
  } finally {
    button.disabled = false;
  }
}
export async function loadInto(el, fn) {
  el.innerHTML = loading();
  try {
    el.innerHTML = await fn();
  } catch (e) {
    el.innerHTML = error(e);
  }
}
export function safeLink(url, label) {
  try {
    const u = new URL(url, location.origin);
    if (!["http:", "https:"].includes(u.protocol)) return "";
    return `<a class="button" href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
  } catch {
    return "";
  }
}
export function table(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
