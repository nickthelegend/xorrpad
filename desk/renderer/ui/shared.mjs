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
export const empty = (title, description) =>
  `<div class="empty"><strong>${esc(title)}</strong><span>${esc(description)}</span></div>`;
export const loading = () =>
  '<div class="loading" role="status">Loading workspace data…</div>';
export const error = (e) =>
  `<div class="error" role="alert">${esc(e.message || e)}</div>`;
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
