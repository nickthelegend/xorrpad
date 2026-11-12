import React, { useState, useEffect } from "react";
import { useDesk, useRead, Sheet, Empty, Field, money } from "./core";
import { Icon } from "./brand/Icon";
export function SignalCard({ signal: s, onAnswer }) {
  const d = useDesk(),
    [now, setNow] = useState(Date.now()),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const a = s.proposal.signal,
    v = s.proposal.verdict,
    left = Math.max(0, Math.ceil((s.expiresAt - now) / 1000));
  async function answer(accept) {
    setBusy(true);
    await d.run(async () => {
      const r = await d.api(
        `/signals/${s.id}/${accept ? "accept" : "refuse"}`,
        {},
      );
      d.notify(
        r.execution?.error || r.execution?.setupRequired || "Signal " + r.state,
      );
      if (r.execution?.transaction)
        window.dispatchEvent(
          new CustomEvent("wallet-handoff", {
            detail: { id: s.id, result: r.execution },
          }),
        );
      onAnswer?.();
    });
    setBusy(false);
  }
  return (
    <article className="signal-card">
      <div className="section-title">
        <b>
          {a.reduceOnly ? `Reduce ${a.reducePct}% · ` : ""}{a.side} {a.symbol || a.market}
        </b>
        <span className="badge">
          {s.state === "awaiting" ? left + "s left" : s.state}
        </span>
      </div>
      <p>
        {money(v.sizeUsd, a.kind === "predict" ? "mUSDC" : "USD")} ·{" "}
        {a.venue || s.proposal.routing?.best?.venue || "Venue unavailable"}
      </p>
      <small>{v.why.join(" · ")}</small>
      {s.state === "awaiting" && (
        <div className="actions">
          <button
            className="primary"
            disabled={busy || !left}
            onClick={() => answer(true)}
          >
            Accept <Icon name="check" />
          </button>
          <button disabled={busy || !left} onClick={() => answer(false)}>
            Refuse
          </button>
        </div>
      )}
      {s.receipt?.explorer && (
        <a href={s.receipt.explorer} target="_blank" rel="noreferrer">
          Confirmed receipt <Icon name="arrowUpRight" />
        </a>
      )}
    </article>
  );
}
export function GlobalSignals() {
  const d = useDesk(),
    r = useRead("/signals"),
    [signals, setSignals] = useState([]),
    [open, setOpen] = useState(false),
    [hidden, setHidden] = useState(null),
    [wallet, setWallet] = useState(null);
  useEffect(() => {
    if (r.data) setSignals(r.data.signals);
  }, [r.data]);
  useEffect(() => {
    const e = d.event;
    if (e?.type === "snapshot") setSignals(e.signals);
    if (e?.type === "signal")
      setSignals((s) => [...s.filter((x) => x.id !== e.signal.id), e.signal]);
    if (e?.type === "wallet_request") {
      setWallet({ id: e.id, result: e });
      setOpen(true);
    }
    if (e?.type === "ability_error") d.notify(e.error);
  }, [d.event]);
  useEffect(() => {
    const fn = (e) => {
      setWallet(e.detail);
      setOpen(true);
    };
    const view = () => setOpen(true);
    window.addEventListener("wallet-handoff", fn);
    window.addEventListener("open-signals", view);
    return () => {
      window.removeEventListener("wallet-handoff", fn);
      window.removeEventListener("open-signals", view);
    };
  }, []);
  const waiting = signals.filter(
      (s) => s.state === "awaiting" && s.expiresAt > Date.now(),
    ),
    latest = waiting.at(-1);
  return (
    <>
      {waiting.length > 0 && (
        <button className="signal-indicator" onClick={() => setOpen(true)}>
          {waiting.length} decision{waiting.length > 1 ? "s" : ""} waiting{" "}
          <Icon name="arrowUpRight" />
        </button>
      )}
      {latest && latest.id !== hidden && !open && (
        <div className="signal-toast" aria-live="polite">
          <div className="section-title">
            <b>A decision, not a surprise.</b>
            <button
              aria-label="Hide signal notification"
              onClick={() => setHidden(latest.id)}
            >
              Hide
            </button>
          </div>
          <SignalCard signal={latest} onAnswer={() => d.refresh()} />
          <button onClick={() => setOpen(true)}>All signals</button>
        </div>
      )}
      {open && (
        <Sheet title="Your call." onClose={() => setOpen(false)}>
          <p>
            Each acceptance is checked again against memory, permissions and
            expiry.
          </p>
          {wallet && (
            <div className="wallet-handoff">
              <h3>Review in your phone wallet.</h3>
              <p>{wallet.result.setupRequired || wallet.result.note}</p>
              {wallet.result.transaction.requestUrl && (
                <a
                  className="button primary"
                  href={wallet.result.transaction.requestUrl}
                >
                  Open wallet request <Icon name="arrowUpRight" />
                </a>
              )}
              <details>
                <summary>Unsigned transaction</summary>
                <pre>{wallet.result.transaction.unsignedTx}</pre>
              </details>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const signature = new FormData(e.currentTarget).get(
                    "signature",
                  );
                  d.run(async () => {
                    const r = await d.api(`/signals/${wallet.id}/sign`, {
                      signature,
                    });
                    d.notify(
                      r.receipt?.signature
                        ? "Confirmed receipt verified"
                        : r.error || "Receipt verification returned",
                    );
                    d.refresh();
                  });
                }}
              >
                <Field label="Submitted transaction signature">
                  <input name="signature" required autoComplete="off" />
                </Field>
                <button>Verify receipt</button>
              </form>
            </div>
          )}
          {signals.length ? (
            signals
              .slice()
              .reverse()
              .map((s) => (
                <SignalCard
                  key={s.id}
                  signal={s}
                  onAnswer={() => d.refresh()}
                />
              ))
          ) : (
            <Empty
              title="Your queue is clear."
              action={
                <a
                  className="button"
                  href="#markets"
                  onClick={() => setOpen(false)}
                >
                  Open Markets
                </a>
              }
            >
              Setup required: create a quote-backed proposal to see a decision
              here.
            </Empty>
          )}
        </Sheet>
      )}
    </>
  );
}
