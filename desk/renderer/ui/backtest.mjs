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
  stat,
  detail,
  table,
  action,
} from "./shared.mjs";
export async function mount({ el, api, signal }) {
  el.innerHTML =
    heading(
      "08",
      "Put the idea through history.",
      "Replay strategies on real Pyth candles with the T6 fee, funding and execution assumptions.",
      "RESEARCH / NO TRANSACTIONS",
    ) +
    `<div class="grid"><div class="stack">${panel("Replay configuration", `<div id="backtest-config">${loading()}</div>`)}${panel("Research assumptions", '<div class="panel-body"><p class="muted">Oracle-price results are research estimates. Fees use current observed schedules; network fees, historical liquidity and liquidations are excluded. No history is invented or interpolated.</p><p class="hint">Prediction mode is a counterfactual pm-AMM curve. Liquidity is an explicit model input. Resolution uses the final candle rather than the keeper’s exact timestamp/confidence check.</p></div>')}</div><div class="stack" id="backtest-result">${panel("Replay results", empty("Give your idea a test.", "Select a completed date range, a venue and a strategy to begin."))}</div></div>`;
  try {
    const config = await api("/backtest");
    if (signal.aborted) return;
    $("#backtest-config", el).innerHTML =
      `<form class="panel-body" id="backtest-form"><div class="fields"><label>Replay mode<select name="kind"><option value="strategy">Strategy replay</option><option value="predict">Prediction curve experiment</option></select></label><label>Symbol<input name="symbol" required value="SOL"></label><label>From (UTC)<input name="from" type="datetime-local" required></label><label>To / expiry (UTC)<input name="to" type="datetime-local" required></label><label>Venue<select name="venue">${options(config.venues)}</select></label><label>Strategy<select name="strategy">${options(config.strategies)}</select></label><label>Candle resolution (minutes or D/W)<select name="resolution">${options(config.resolutions, config.defaults.resolution)}</select></label><label>Initial capital (USD)<input name="initialCash" type="number" min="0.01" step="any" value="${config.defaults.initialCash}" required></label><label>Trade notional (USD)<input name="tradeUsd" type="number" min="0.01" step="any" value="${config.defaults.tradeUsd}" required></label><label>Slippage (bps)<input name="slippageBps" type="number" min="0" max="9999" step="any" value="${config.defaults.slippageBps}" required></label><label class="prediction-only" hidden>Strike (USD)<input name="strike" type="number" min="0.01" step="any"></label><label class="prediction-only" hidden>Model liquidity (mUSDC)<input name="liquidityUsdc" type="number" min="0.01" step="any"></label><label class="wide" id="rule-label" hidden>Rule (T6 JSON expression)<textarea name="rule" placeholder='{"name":"My rule","side":"long","entry":[]}'></textarea></label></div><button class="primary">Run backtest</button><p class="hint">History source: ${esc(config.historySource)}. An unavailable upstream is shown as an error.</p></form>`;
    const f = $("#backtest-form", el);
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    f.elements.to.value = end.toISOString().slice(0, 16);
    f.elements.from.value = new Date(+end - 7 * 86400000)
      .toISOString()
      .slice(0, 16);
    f.elements.kind.onchange = () => {
      const pred = f.elements.kind.value === "predict";
      for (const l of el.querySelectorAll(".prediction-only")) {
        l.hidden = !pred;
        l.querySelector("input").required = pred;
      }
      f.elements.strategy.disabled = pred;
      f.elements.venue.disabled = pred;
      f.elements.tradeUsd.disabled = pred;
      $("#rule-label", el).hidden =
        pred || f.elements.strategy.value !== "rule";
    };
    f.elements.strategy.onchange = () =>
      ($("#rule-label", el).hidden = f.elements.strategy.value !== "rule");
    f.onsubmit = (e) => {
      e.preventDefault();
      action(e.submitter, async () => {
        const data = new FormData(f),
          pred = data.get("kind") === "predict";
        const input = {
          symbol: data.get("symbol"),
          from: Date.parse(data.get("from") + "Z") / 1000,
          to: Date.parse(data.get("to") + "Z") / 1000,
          resolution: data.get("resolution"),
          initialCash: Number(data.get("initialCash")),
          slippageBps: Number(data.get("slippageBps")),
        };
        if (input.to <= input.from) throw new Error("End must be after start");
        if (pred) {
          input.strike = Number(data.get("strike"));
          input.liquidityUsdc = Number(data.get("liquidityUsdc"));
        } else {
          input.venue = data.get("venue");
          input.strategy = data.get("strategy");
          input.tradeUsd = Number(data.get("tradeUsd"));
          if (input.strategy === "rule") {
            try {
              input.rule = JSON.parse(data.get("rule"));
            } catch {
              throw new Error("Rule must be valid JSON");
            }
          }
        }
        $("#backtest-result", el).innerHTML = panel(
          "Running replay",
          loading(),
        );
        try {
          const r = await api(pred ? "/backtest/predict" : "/backtest", input);
          if (signal.aborted) return;
          render(r);
        } catch (e) {
          if (!signal.aborted)
            $("#backtest-result", el).innerHTML = panel(
              "Replay unavailable",
              error(e),
            );
          throw e;
        }
      });
    };
    function render(r) {
      const curve = r.equityCurve || [];
      let graph = empty(
        "No equity observations",
        "The replay returned no curve.",
      );
      if (curve.length) {
        const lo = Math.min(...curve.map((p) => p.equity)),
          hi = Math.max(...curve.map((p) => p.equity)),
          from = curve[0].t,
          to = curve.at(-1).t;
        const points = curve
          .map(
            (p) =>
              `${20 + ((p.t - from) / (to - from || 1)) * 560},${180 - ((p.equity - lo) / (hi - lo || 1)) * 140}`,
          )
          .join(" ");
        graph = `<div class="panel-body"><div class="row-top mono"><span>${fmt(hi, "USD")}</span><span>${fmt(lo, "USD")} minimum</span></div><svg class="chart" viewBox="0 0 600 220" role="img" aria-label="Equity curve in USD over the requested UTC range"><path d="M20 190H580" stroke="var(--line)"/><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2"/></svg><div class="row-top hint"><span>${esc(new Date(from).toISOString())}</span><span>${esc(new Date(to).toISOString())}</span></div></div>`;
      }
      $("#backtest-result", el).innerHTML =
        `<div class="stats">${stat("Net PnL", fmt(r.pnl, "USD"))}${stat("Max drawdown", fmt(r.maxDrawdownPct, "%"))}${stat("Win rate", fmt(r.winRate == null ? null : r.winRate * 100, "%"))}${stat("Sharpe", fmt(r.sharpe, "ratio"))}${stat("Exposure", fmt(r.exposure * 100, "%"))}${stat("Completed trades", fmt(r.tradeCount, "trades", 0))}</div>${panel("Equity / USD", graph)}${panel(
          "Trade log",
          r.trades?.length
            ? table(
                ["Entry (UTC)", "Side", "PnL"],
                r.trades.map((t) => [
                  esc(new Date(t.entryTime).toISOString()),
                  esc(t.side || t.direction),
                  fmt(t.pnl, "USD"),
                ]),
              )
            : empty(
                "No completed trades",
                "No strategy entry completed in this range.",
              ),
        )}${panel("Provenance & assumptions", detail("Replay metadata", { history: r.history, fees: r.fees, funding: r.funding, warnings: r.warnings, assumptions: r.assumptions, question: r.question }))}`;
    }
  } catch (e) {
    if (!signal.aborted) $("#backtest-config", el).innerHTML = error(e);
  }
}
