import { mountChart } from "./price-chart.mjs";
import {
  $,
  esc,
  fmt,
  heading,
  panel,
  empty,
  loading,
  error,
  options,
  action,
  notice,
  detail,
  table,
  safeLink,
} from "./shared.mjs";
export function routeView(r) {
  const row = (q, best = false) =>
    `<div class="row ${best ? "route-best" : ""}"><div class="row-top"><h3>${esc(q.venue)}</h3><span class="tag">${best ? "BEST ROUTE" : esc(q.status)}</span></div>${q.status === "quoted" ? `<div class="fields"><div><span class="eyebrow">EFFECTIVE PRICE</span><p class="mono">${fmt(q.effectivePrice, r.kind === "predict" ? "mUSDC / share" : "USD")}</p></div><div><span class="eyebrow">FEES</span><p class="mono">${fmt(q.fees?.usd, r.kind === "predict" ? "mUSDC" : "USD")}</p></div></div><p>${esc(q.fees?.basis)}</p><p>Impact ${fmt(q.impact, "%")} · ${esc(q.network)}</p>${q.quote?.amountOut != null ? `<p>Net output ${fmt(q.quote.amountOut, r.side === "buy" ? r.market : "USDC", 8)}</p>` : ""}` : `<p>${esc(q.error || "No quote available")}</p>`}<p>${esc((q.why || []).join(" · "))}</p></div>`;
  return `${r.best ? row(r.best, true) : empty("No executable route", "Review the venue responses below.")} ${(r.alternatives || []).map((q) => row(q)).join("")}<div class="row muted mono">Observed ${esc(r.observedAt)} · Input ${fmt(r.size, r.sizeUnit, 8)}</div>`;
}
export function signalView(s) {
  const p = s.proposal || {},
    v = p.verdict || {},
    a = { ...p.signal, venue: s.trusted?.venue || p.routing?.best?.venue || p.signal?.venue };
  return `<div class="row" data-signal="${esc(s.id)}"><div class="row-top"><h3>${esc(a.side)} ${esc(a.symbol || a.market)}</h3><span class="tag">${esc(s.state)}</span></div><p class="mono">${fmt(v.sizeUsd, a.kind === "predict" ? "mUSDC" : "USD")} · ${esc(a.venue || p.routing?.best?.venue || "route pending")}</p><p>${esc((v.why || []).join(" · "))}</p>${s.fingerprint ? `<p class="mono">Signal fingerprint <strong>${esc(s.fingerprint)}</strong> · Price ${esc(s.trusted.price)} · Fee ${esc(s.trusted.fee)}</p>` : ""}<p class="mono">Expires ${esc(new Date(s.expiresAt).toLocaleString())} · <span data-countdown="${s.expiresAt}">${Math.max(0, Math.ceil((s.expiresAt - Date.now()) / 1000))}s left</span></p>${s.state === "awaiting" ? `<div class="actions"><button class="primary" data-accept="${esc(s.id)}" data-fingerprint="${esc(s.fingerprint||'')}">Accept</button><button data-refuse="${esc(s.id)}">Refuse</button></div>` : ""}${s.receipt?.explorer ? safeLink(s.receipt.explorer, "View receipt ↗") : ""}</div>`;
}
export function bindSignals(root, api, refresh, handoff = root) {
  for (const b of root.querySelectorAll("[data-accept],[data-refuse]"))
    b.onclick = () =>
      action(b, async () => {
        const id = b.dataset.accept || b.dataset.refuse;
        const result = await api(
          `/signals/${encodeURIComponent(id)}/${b.dataset.accept ? "accept" : "refuse"}`,
          b.dataset.accept&&b.dataset.fingerprint?{fingerprint:b.dataset.fingerprint}:{},
        );
        notice(
          result.execution?.error ||
            result.setupRequired ||
            `Signal ${result.state}`,
        );
        if (result.execution?.transaction)
          walletView(handoff, result.execution, api, id);
        else await refresh();
      });
}
export function walletView(root, result, api, id) {
  let target = $("#wallet-handoff", root);
  if (!target) {
    target = document.createElement("div");
    target.id = "wallet-handoff";
    root.append(target);
  }
  const tx = result.transaction;
  target.innerHTML = panel(
    "Sign with your phone",
    `<div class="panel-body"><p>${esc(result.setupRequired || result.note || "Review and sign in your phone wallet.")}</p>${tx.requestUrl ? `<a class="button" href="${esc(tx.requestUrl.startsWith("solana:") ? tx.requestUrl : "#")}">Open wallet request ↗</a>` : ""}<p class="hint">${esc(tx.requestExpiresAt || "")}</p><form id="complete-signature"><label>Submitted transaction signature<input name="signature" required autocomplete="off"></label><button class="primary">Verify receipt</button></form></div>`,
  );
  $("#complete-signature", target).onsubmit = (e) => {
    e.preventDefault();
    action(e.submitter, async () => {
      const r = await api(`/signals/${encodeURIComponent(id)}/sign`, {
        signature: new FormData(e.target).get("signature"),
      });
      notice(r.error || "Receipt verified");
      target.innerHTML = detail("Execution receipt", r);
    });
  };
}
export async function mount({ el, api, subscribe, signal }) {
  el.innerHTML =
    heading(
      "02",
      "Find your next move.",
      "Compare venues, inspect execution, then send a proposal through the gate.",
      "LIVE READS / MANUAL BY DEFAULT",
    ) +
    `<div class="grid trade-terminal"><div class="stack">${panel("Price action", `<div id="market-chart"></div>`)}${panel("Market directory", `<div class="panel-body"><label>Search markets<input type="search" id="market-search" placeholder="Search a symbol or venue"></label><p class="hint">Visible spot rows quote 50 USDC through Jupiter, refreshed every 15 seconds. Perpetual marks come from the venue.</p></div><div id="market-list">${loading()}</div>`)}${panel("Route comparison", empty("Start with a quote", "Choose a market and request an aggregated route."), "route-card")}</div>${panel("Order ticket", `<form class="panel-body" id="ticket"><label>Product<select name="kind">${options(["spot", "perp"])}</select></label><label>Market<input name="market" value="SOL" required maxlength="96" autocomplete="off"></label><div class="fields"><label>Direction<select name="side">${options(["buy", "sell"])}</select></label><label>Size (USD collateral / spot notional)<input type="number" name="size" value="50" min="0.01" step="any" required></label></div><label id="leverage-label" hidden>Leverage (×)<input type="number" name="leverage" value="1" min="1" step="any"></label><button class="primary" id="quote">Compare routes</button><button type="button" id="propose" disabled>Create trade proposal</button><p class="hint">Quotes are read-only. A proposal is gated again before acceptance and signing. Mainnet requires the configured real-funds acknowledgement.</p><div id="ticket-result" aria-live="polite"></div></form>`, "", "GATED")}</div><div class="grid equal trade-below">${panel("Positions", `<div id="trade-positions">${loading()}</div>`)}${panel("Signals queue", `<div id="signals-list">${loading()}</div>`)}</div>`;
  const form = $("#ticket", el);
  let selectedVenue = "jupiter";
  const chart = mountChart({
    root: $("#market-chart", el),
    api,
    signal,
    selection: () => ({
      market: form.elements.market.value,
      kind: form.elements.kind.value,
      venue: selectedVenue,
    }),
  });
  const changeMarket = () => chart.update();
  form.elements.market.addEventListener("change", changeMarket);
  api("/portfolio")
    .then((d) => {
      if (signal.aborted) return;
      const rows = Object.entries(d.balances || {});
      $("#trade-positions", el).innerHTML = d.chain?.error
        ? error(d.chain.error)
        : rows.length
          ? table(
              ["Asset", "Balance"],
              rows.map(([s, b]) => [esc(s), fmt(b.amount, s, 8)]),
            )
          : empty(
              "No spot positions",
              "Setup required: configure SOLANA_ADDRESS or fund your watched wallet.",
              { target: "#link", label: "Review wallet setup" },
            );
    })
    .catch((e) => {
      if (!signal.aborted) $("#trade-positions", el).innerHTML = error(e);
    });
  let catalog = [],
    request = 0,
    quotedInput;
  const input = () => {
    const f = new FormData(form);
    return {
      kind: f.get("kind"),
      market: f.get("market"),
      side: f.get("side"),
      size: Number(f.get("size")),
      leverage: Number(f.get("leverage")),
    };
  };
  const invalidate = () => {
    request++;
    quotedInput = null;
    $("#propose", el).disabled = true;
    $("#route-card", el).innerHTML =
      '<div class="panel-head"><h2>Route comparison</h2></div>' +
      empty("Quote required", "Compare routes after changing your order.");
  };
  form.oninput = invalidate;
  form.elements.kind.onchange = () => {
    form.elements.side.innerHTML = options(
      form.elements.kind.value === "spot" ? ["buy", "sell"] : ["long", "short"],
    );
    $("#leverage-label", el).hidden = form.elements.kind.value !== "perp";
    selectedVenue = form.elements.kind.value === "spot" ? "jupiter" : "phoenix";
    invalidate();
    chart.update();
  };
  const visible = new Set(),
    spotCache = new Map();
  let quoteTimer,
    quoting = false;
  async function visibleQuotes() {
    if (quoting || signal.aborted) return;
    const symbols = [
      ...new Set([...visible].map((node) => node.dataset.spotRow)),
    ]
      .filter(
        (s) => !spotCache.has(s) || Date.now() - spotCache.get(s).at >= 15000,
      )
      .slice(0, 12);
    if (!symbols.length) return;
    quoting = true;
    try {
      const d = await api(
        "/spot/quotes?" + new URLSearchParams({ symbols: symbols.join(",") }),
      );
      if (signal.aborted) return;
      for (const q of d.quotes)
        spotCache.set(q.symbol, { ...q, at: Date.now() });
    } catch (e) {
      for (const symbol of symbols)
        spotCache.set(symbol, {
          price: null,
          error: e.message,
          at: Date.now(),
        });
    } finally {
      quoting = false;
    }
    if (signal.aborted) return;
    for (const cell of el.querySelectorAll("[data-spot]")) {
      const q = spotCache.get(cell.dataset.spot);
      if (q) {
        cell.textContent = q.error
          ? "Quote failed: " + q.error
          : fmt(q.price, "USD", 6);
        cell.title = q.observedAt
          ? "Observed " + q.observedAt + " · 50 USDC input"
          : "";
      }
    }
  }
  const visibility = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      clearTimeout(quoteTimer);
      quoteTimer = setTimeout(visibleQuotes, 100);
    },
    { root: $("#market-list", el) },
  );
  const quoteRefresh = setInterval(visibleQuotes, 15000);
  function directory() {
    visibility.disconnect();
    visible.clear();
    const q = $("#market-search", el).value.toLowerCase();
    const rows = catalog
      .filter((r) =>
        `${r.venue} ${r.kind} ${r.symbol}`.toLowerCase().includes(q),
      )
      .slice(0, 60);
    $("#market-list", el).innerHTML = rows.length
      ? table(
          ["Market / venue", "Product", "Mark", ""],
          rows.map((r, i) => [
            `${esc(r.symbol)}<br><span class="muted">${esc(r.venue)}</span>`,
            esc(r.kind),
            r.kind === "spot"
              ? `<span data-spot="${esc(r.symbol)}">${spotCache.has(r.symbol) ? esc(spotCache.get(r.symbol).error ? "Quote failed: " + spotCache.get(r.symbol).error : fmt(spotCache.get(r.symbol).price, "USD", 6)) : "Fetching live quote…"}</span>`
              : r.price == null
                ? "No mark"
                : fmt(r.price, "USD"),
            `<button data-pick="${i}">Select</button>`,
          ]),
        )
      : empty(
          "No markets found",
          "Try a different symbol or refresh your connection.",
        );
    for (const cell of el.querySelectorAll("[data-spot]")) {
      const row = cell.closest("tr");
      row.dataset.spotRow = cell.dataset.spot;
      visibility.observe(row);
    }
    for (const b of el.querySelectorAll("[data-pick]"))
      b.onclick = () => {
        const r = rows[Number(b.dataset.pick)];
        form.elements.kind.value = r.kind;
        form.elements.kind.onchange();
        form.elements.market.value = r.symbol;
        selectedVenue = r.venue;
        chart.update();
        form.elements.market.focus();
      };
  }
  $("#market-search", el).oninput = directory;
  async function markets() {
    try {
      const { venues } = await api("/venues?markets=1");
      if (signal.aborted) return;
      catalog = venues
        .filter((v) => v.kind !== "predict")
        .flatMap((v) =>
          (v.markets || []).map((m) => ({
            venue: v.venue,
            kind: v.kind,
            symbol: typeof m === "string" ? m : m.market,
            price: m.markPrice ?? null,
            catalog: v.venue === "jupiter",
          })),
        );
      catalog.sort((a, b) => {
        const rank = (s) =>
          ["SOL", "BTC", "ETH"].indexOf(s) < 0
            ? 9
            : ["SOL", "BTC", "ETH"].indexOf(s);
        return (
          rank(a.symbol) - rank(b.symbol) ||
          a.symbol.localeCompare(b.symbol) ||
          a.venue.localeCompare(b.venue)
        );
      });
      directory();
      const errors = venues.filter((v) => !v.ok);
      if (errors.length)
        $("#market-list", el).insertAdjacentHTML(
          "beforeend",
          errors
            .map(
              (v) =>
                `<div class="row muted">${esc(v.venue)}: ${esc(v.error)}</div>`,
            )
            .join(""),
        );
    } catch (e) {
      if (!signal.aborted) $("#market-list", el).innerHTML = error(e);
    }
  }
  form.onsubmit = (e) => {
    e.preventDefault();
    const n = ++request,
      o = input();
    $("#route-card", el).innerHTML =
      '<div class="panel-head"><h2>Route comparison</h2></div>' + loading();
    action(e.submitter, async () => {
      try {
        let size = o.size;
        if (o.kind === "spot" && o.side === "sell") {
          const ref = await api(
            "/route?" + new URLSearchParams({ ...o, side: "buy" }),
          );
          if (!ref.best)
            throw new Error(
              "Setup required: live reference price for sell sizing",
            );
          size /= ref.best.price;
        }
        const r = await api("/route?" + new URLSearchParams({ ...o, size }));
        if (n !== request || signal.aborted) return;
        $("#route-card", el).innerHTML =
          '<div class="panel-head"><h2>Route comparison</h2><span class="tag">LIVE QUOTE</span></div>' +
          routeView(r);
        quotedInput = r.best ? o : null;
        $("#propose", el).disabled = !r.best;
      } catch (e) {
        if (n === request && !signal.aborted)
          $("#route-card", el).innerHTML =
            '<div class="panel-head"><h2>Route comparison</h2></div>' +
            error(e);
        throw e;
      }
    });
  };
  $("#propose", el).onclick = (e) =>
    action(e.currentTarget, async () => {
      if (!quotedInput) throw new Error("Compare routes first");
      const r = await api("/signals", {
        ...quotedInput,
        reason: "Desk order ticket",
      });
      $("#ticket-result", el).innerHTML =
        `<p>${esc(r.signalState)} · ${esc((r.verdict?.why || []).join(" · "))}</p>`;
      await refreshSignals();
    });
  async function refreshSignals() {
    try {
      const { signals } = await api("/signals");
      if (signal.aborted) return;
      $("#signals-list", el).innerHTML = signals.length
        ? signals.slice().reverse().map(signalView).join("")
        : empty(
            "Your queue is clear",
            "Signals from strategies, chat, voice and pad keys appear here.",
          );
      bindSignals($("#signals-list", el), api, refreshSignals);
    } catch (e) {
      if (!signal.aborted) $("#signals-list", el).innerHTML = error(e);
    }
  }
  const off = subscribe((e) => {
    if (["signal", "snapshot", "receipt"].includes(e.type)) refreshSignals();
    if (e.type === "wallet_request") walletView(el, e, api, e.id);
  });
  await Promise.allSettled([markets(), refreshSignals()]);
  const timer = setInterval(refreshSignals, 10000);
  return () => {
    off();
    chart.dispose();
    visibility.disconnect();
    clearTimeout(quoteTimer);
    clearInterval(quoteRefresh);
    clearInterval(timer);
  };
}
