import {
  $,
  esc,
  heading,
  panel,
  loading,
  error,
  options,
  action,
  notice,
} from "./shared.mjs";
const caps = [
  ["maxTradeUsd", "Per-trade cap", "USD"],
  ["maxDayUsd", "Daily cap", "USD"],
  ["alwaysAskAboveUsd", "Always ask above", "USD"],
  ["maxLeverage", "Leverage cap", "×"],
  ["maxOpenPositions", "Open position cap", "positions"],
  ["cooldownSeconds", "Cooldown", "seconds"],
];
const split = (v) =>
  v
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
export async function mount({ el, api, signal }) {
  el.innerHTML =
    heading(
      "07",
      "Set the boundaries.",
      "Explicit permissions. Measured exposure. The gate rechecks every accepted trade.",
      "AUTO-ACCEPT OFF BY DEFAULT",
    ) + `<div id="policy">${loading()}</div>`;
  try {
    let policy = await api("/permissions");
    if (signal.aborted) return;
    $("#policy", el).innerHTML =
      `<form id="policy-form"><div class="grid"><div class="stack">${panel("Exposure caps", `<div class="panel-body fields">${caps.map(([k, label, unit]) => `<label>${label} (${unit})<input name="${k}" type="number" step="${k === "maxOpenPositions" ? "1" : "any"}" min="${k === "maxLeverage" ? 1 : 0}" required value="${policy[k]}"></label>`).join("")}</div>`)}${panel(
        "Markets & venues",
        `<div class="panel-body fields"><label>Market access<select name="marketMode">${options(
          [
            { id: "all", name: "All markets except denylist" },
            { id: "list", name: "Only markets listed below" },
          ],
          policy.marketAllowlist === null ? "all" : "list",
        )}</select></label><label>Venue access<select name="venueMode">${options(
          [
            { id: "all", name: "All venues" },
            { id: "list", name: "Only venues listed below" },
          ],
          policy.venueAllowlist === null ? "all" : "list",
        )}</select></label><label>Allowed markets (comma-separated)<input name="marketAllowlist" value="${esc((policy.marketAllowlist || []).join(", "))}" placeholder="SOL, ETH"></label><label>Allowed venues (comma-separated)<input name="venueAllowlist" value="${esc((policy.venueAllowlist || []).join(", "))}" placeholder="jupiter, phoenix"></label><label class="wide">Denied markets (comma-separated)<input name="marketDenylist" value="${esc(policy.marketDenylist.join(", "))}"></label><p class="hint wide">An empty “only listed” allowlist permits no markets or venues.</p></div>`,
      )}</div><div class="stack">${panel("Auto-accept scope", `<div class="panel-body"><p class="muted">Both the venue and product must be enabled. All caps, cooldowns, quiet hours and memory rules still apply. Every automatic acceptance is logged and spoken.</p><h3>Venues</h3>${[...new Set(["jupiter", "meteora", "phoenix", "jupperps", "pmamm", ...Object.keys(policy.autoAccept.venues)])].map((v) => `<label class="check"><input type="checkbox" data-auto-venue="${esc(v)}" ${policy.autoAccept.venues[v] ? "checked" : ""}>${esc(v)}</label>`).join("")}<h3 style="margin-top:20px">Products</h3>${[...new Set(["spot", "perp", "predict", ...Object.keys(policy.autoAccept.kinds)])].map((k) => `<label class="check"><input type="checkbox" data-auto-kind="${esc(k)}" ${policy.autoAccept.kinds[k] ? "checked" : ""}>${esc(k)}</label>`).join("")}</div>`)}${panel("Quiet hours", `<div class="panel-body"><label class="check"><input type="checkbox" name="quietEnabled" ${policy.quietHours ? "checked" : ""}> Refuse trades during quiet hours</label><div class="fields"><label>Start<input name="quietStart" type="time" value="${esc(policy.quietHours?.start || "22:00")}"></label><label>End<input name="quietEnd" type="time" value="${esc(policy.quietHours?.end || "07:00")}"></label><label class="wide">IANA time zone<input name="quietZone" value="${esc(policy.quietHours?.timeZone || "UTC")}"></label></div></div>`)}</div></div><div class="actions"><button class="primary">Save permission policy</button><span class="muted">Applies immediately to the desk, pad and phone.</span></div><div id="policy-result" aria-live="polite"></div></form>`;
    $("#policy-form", el).onsubmit = (e) => {
      e.preventDefault();
      action(e.submitter, async () => {
        const f = new FormData(e.target);
        const next = structuredClone(policy);
        for (const [k] of caps) next[k] = Number(f.get(k));
        next.marketAllowlist =
          f.get("marketMode") === "all"
            ? null
            : split(f.get("marketAllowlist"));
        next.venueAllowlist =
          f.get("venueMode") === "all" ? null : split(f.get("venueAllowlist"));
        next.marketDenylist = split(f.get("marketDenylist"));
        next.autoAccept = { venues: {}, kinds: {} };
        for (const c of el.querySelectorAll("[data-auto-venue]"))
          next.autoAccept.venues[c.dataset.autoVenue] = c.checked;
        for (const c of el.querySelectorAll("[data-auto-kind]"))
          next.autoAccept.kinds[c.dataset.autoKind] = c.checked;
        next.quietHours = f.has("quietEnabled")
          ? {
              start: f.get("quietStart"),
              end: f.get("quietEnd"),
              timeZone: f.get("quietZone"),
            }
          : null;
        try {
          policy = await api("/permissions", next);
          $("#policy-result", el).textContent = "Permission policy saved.";
          notice("Permission policy saved");
        } catch (e) {
          $("#policy-result", el).innerHTML = error(e);
          throw e;
        }
      });
    };
  } catch (e) {
    if (!signal.aborted) $("#policy", el).innerHTML = error(e);
  }
}
