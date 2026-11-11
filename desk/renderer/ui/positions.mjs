import {
  $,
  esc,
  fmt,
  heading,
  panel,
  empty,
  loading,
  error,
  table,
  detail,
  safeLink,
} from "./shared.mjs";
export async function mount({ el, api, subscribe, signal }) {
  el.innerHTML =
    heading(
      "04",
      "The book. And the proof.",
      "Wallet holdings, venue positions and confirmed execution receipts.",
      "SOLANA / WALLET READS",
    ) +
    `<div class="stack">${panel("Spot wallet holdings", `<div id="spot-positions">${loading()}</div>`)}<div class="grid equal">${panel("Phoenix perpetuals", `<div id="perp-positions">${loading()}</div>`)}${panel("pm-AMM outcomes", `<div id="outcome-positions">${loading()}</div>`)}</div>${panel("Execution receipts", `<div class="panel-body"><p class="hint">Confirmed signatures from the live queue and persisted memory journal. Accepted proposals are not receipts.</p></div><div id="receipts">${loading()}</div>`)}</div>`;
  async function load(id, path, render) {
    try {
      const d = await api(path);
      if (!signal.aborted) $(id, el).innerHTML = render(d);
    } catch (e) {
      if (!signal.aborted) $(id, el).innerHTML = error(e);
    }
  }
  const jobs = [
    load("#spot-positions", "/portfolio", (d) => {
      if (d.chain?.error) return error(d.chain.error);
      const balances = Object.entries(d.balances || {});
      return balances.length
        ? table(
            ["Asset", "Balance", "Reference price"],
            balances.map(([s, q]) => [
              esc(s),
              fmt(q.amount, s, 8),
              fmt(d.prices?.[s], "USD"),
            ]),
          )
        : empty(
            d.chain?.address
              ? "No wallet holdings"
              : "Setup required: SOLANA_ADDRESS",
            d.chain?.address
              ? "The watched wallet returned no positive balances."
              : "Configure a watched Solana wallet on the desk.",
          );
    }),
    load("#perp-positions", "/perps/positions", (d) =>
      d.positions?.length
        ? table(
            ["Market", "Side", "Position", "Entry"],
            d.positions.map((p) => [
              esc(p.market),
              esc(p.side),
              fmt(p.baseUnits, p.market, 8),
              fmt(p.entryPrice, "USD"),
            ]),
          )
        : empty(
            "No perpetual positions",
            "The configured Phoenix authority has no open positions.",
          ),
    ),
    load("#outcome-positions", "/pm/positions", (d) =>
      d.positions?.length
        ? d.positions
            .map(
              (p) =>
                `<div class="row"><h3>${esc(p.name || p.market)}</h3><p class="mono">YES ${fmt(p.yes, "shares", 6)} · NO ${fmt(p.no, "shares", 6)}</p>${detail("Outcome position", p)}</div>`,
            )
            .join("")
        : empty(
            "No outcome positions",
            "The configured devnet owner holds no pm-AMM outcomes.",
          ),
    ),
  ];
  function receipt(r) {
    return `<div class="row"><div class="row-top"><h3>Confirmed execution</h3><span class="tag">${esc(r.cluster || "SOLANA")}</span></div><p class="mono">${esc(r.signature)}</p>${r.explorer ? safeLink(r.explorer, "View on explorer ↗") : ""}${detail("Receipt details", r)}</div>`;
  }
  async function allReceipts() {
    try {
      const results = await Promise.allSettled([
        api("/signals"),
        api("/memory"),
      ]);
      if (signal.aborted) return;
      const found = new Map();
      const collect = (v, depth = 0) => {
        if (!v || depth > 9) return;
        if (typeof v === "string") {
          try {
            collect(JSON.parse(v), depth + 1);
          } catch {}
          return;
        }
        if (typeof v !== "object") return;
        if (v.signature && v.explorer) found.set(v.signature, v);
        for (const [k, x] of Object.entries(v))
          if (!["unsignedTx", "signedTx"].includes(k)) collect(x, depth + 1);
      };
      for (const r of results) if (r.status === "fulfilled") collect(r.value);
      $("#receipts", el).innerHTML = found.size
        ? [...found.values()].map(receipt).join("")
        : results.every((r) => r.status === "rejected")
          ? error(results[0].reason)
          : empty(
              "No confirmed receipts",
              "Executed trades will leave a signature and explorer link here.",
            );
    } catch (e) {
      if (!signal.aborted) $("#receipts", el).innerHTML = error(e);
    }
  }
  const off = subscribe((e) => {
    if (e.type === "receipt") allReceipts();
  });
  await Promise.allSettled([...jobs, allReceipts()]);
  return off;
}
