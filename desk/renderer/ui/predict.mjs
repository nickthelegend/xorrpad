import {
  $,
  esc,
  fmt,
  heading,
  panel,
  empty,
  loading,
  error,
  stat,
  detail,
  action,
  safeLink,
} from "./shared.mjs";
import { routeView } from "./trade.mjs";
export async function mount({ el, api, signal }) {
  el.innerHTML =
    heading(
      "03",
      "Trade the outcome.",
      "Real pm-AMM markets on Solana devnet. Read the odds, the liquidity and the resolution evidence.",
      "DEVNET / mUSDC",
    ) +
    `<div id="prediction-stats">${loading()}</div><div class="grid"><div class="stack">${panel("Open pm-AMM markets", `<div id="pm-markets">${loading()}</div>`)}${panel("Our keeper markets", `<div id="pm-ours">${loading()}</div>`)}</div><div class="stack">${panel("Outcome ticket", `<form class="panel-body" id="prediction-ticket"><label>Market public key<input name="market" required autocomplete="off"></label><label>Outcome<select name="side"><option value="yes">YES</option><option value="no">NO</option></select></label><label>Collateral (devnet mUSDC)<input type="number" name="size" min="0.000001" step="any" value="1" required></label><button class="primary">Quote outcome</button><button type="button" id="pm-propose" disabled>Create outcome proposal</button><p class="hint">mUSDC is devnet collateral. Accept proposals from the Trade signals queue.</p><div id="pm-route"></div></form>`)}${panel("Pyth resolution evidence", `<div id="pm-resolutions">${loading()}</div>`)}</div></div>`;
  async function load(id, path, render) {
    try {
      const data = await api(path);
      if (!signal.aborted) $(id, el).innerHTML = render(data);
    } catch (e) {
      if (!signal.aborted) $(id, el).innerHTML = error(e);
    }
  }
  function markets(d, ours = false) {
    return d.markets?.length
      ? d.markets
          .map(
            (m) =>
              `<div class="row"><div class="row-top"><h3>${esc(m.name || m.market)}</h3><span class="tag">${ours ? (m.resolved ? "RESOLVED" : "KEEPER") : "OPEN"}</span></div><p class="mono">${esc(m.market)}</p><p>YES ${fmt(m.yesPrice == null ? null : m.yesPrice * 100, "%")} · Liquidity ${fmt(m.liquidity, "mUSDC")}</p><p>Expiry ${esc(m.endTime || new Date(m.endTs * 1000).toLocaleString())}</p>${!m.resolved ? `<button data-market="${esc(m.market)}">Select outcome →</button>` : ""}${detail("On-chain market details", m)}</div>`,
          )
          .join("")
      : empty(
          ours ? "No keeper markets" : "No open markets",
          ours
            ? "The configured keeper has not published a market."
            : "There are no active pm-AMM markets in the returned devnet account set.",
        );
  }
  const jobs = [
    load("#pm-markets", "/pm/markets", (d) => markets(d)),
    load("#pm-ours", "/pm/ours", (d) => markets(d, true)),
    load("#pm-resolutions", "/pm/resolutions", (d) =>
      d.resolutions?.length
        ? d.resolutions
            .map(
              (r) =>
                `<div class="row"><h3>${esc(r.market)}</h3><p>Resolved ${esc(r.outcome ?? r.result ?? "See signed evidence")}</p>${safeLink("https://explorer.solana.com/tx/" + encodeURIComponent(r.resolveSignature) + "?cluster=devnet", "Resolution transaction ↗")}${detail("Pyth evidence / Hermes payload", r)}</div>`,
            )
            .join("")
        : empty(
            "No published resolutions",
            "The keeper will publish its Pyth evidence after a market resolves.",
          ),
    ),
    load(
      "#prediction-stats",
      "/pm/stats",
      (d) =>
        `<div class="stats">${stat("Keeper markets", fmt(d.markets, "markets", 0))}${stat("Unique traders", fmt(d.uniqueTraderWallets, "wallets", 0))}${stat("Gross volume", fmt(d.volumeUsdc, "mUSDC"))}${stat("Creator fees", fmt(d.creatorFeesUsdc, "mUSDC"))}</div>${d.setupRequired ? error(d.setupRequired) : ""}<p class="hint">${esc(d.source)} · ${d.complete ? "Complete history" : "Partial history; totals unavailable"}</p>`,
    ),
  ];
  const form = $("#prediction-ticket", el);
  let quoted,
    sequence = 0;
  const input = () => {
    const f = new FormData(form);
    return {
      kind: "predict",
      market: f.get("market"),
      side: f.get("side"),
      size: Number(f.get("size")),
    };
  };
  el.onclick = (e) => {
    const b = e.target.closest("[data-market]");
    if (b) {
      form.elements.market.value = b.dataset.market;
      quoted = null;
      sequence++;
      $("#pm-propose", el).disabled = true;
      $("#pm-route", el).innerHTML = "";
      form.elements.side.focus();
    }
  };
  form.oninput = () => {
    quoted = null;
    sequence++;
    $("#pm-propose", el).disabled = true;
    $("#pm-route", el).innerHTML = "";
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    const n = ++sequence,
      o = input();
    $("#pm-route", el).innerHTML = loading();
    action(e.submitter, async () => {
      try {
        const r = await api("/route?" + new URLSearchParams(o));
        if (n !== sequence || signal.aborted) return;
        $("#pm-route", el).innerHTML = routeView(r);
        quoted = r.best ? o : null;
        $("#pm-propose", el).disabled = !quoted;
      } catch (e) {
        if (n === sequence && !signal.aborted)
          $("#pm-route", el).innerHTML = error(e);
        throw e;
      }
    });
  };
  $("#pm-propose", el).onclick = (e) =>
    action(e.currentTarget, async () => {
      if (!quoted) throw new Error("Quote the outcome first");
      const r = await api("/signals", {
        ...quoted,
        reason: "Desk outcome ticket",
      });
      $("#pm-route", el).insertAdjacentHTML(
        "beforeend",
        `<div class="row">Proposal ${esc(r.signalState)} · ${esc((r.verdict?.why || []).join(" · "))}<br><a class="button" href="#trade">Review signals →</a></div>`,
      );
    });
  await Promise.allSettled(jobs);
}
