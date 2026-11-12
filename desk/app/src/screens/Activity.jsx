import React, { useState, useMemo } from "react";
import { useDesk, useRead, State, Empty, money } from "../core";
import { Icon } from "../brand/Icon";
import { BlurWords } from "../brand/BlurWords";
const parse = (v) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return {};
  }
};
export function Activity() {
  const d = useDesk(),
    queue = useRead("/signals"),
    memory = useRead("/memory"),
    chats = useRead("/chats");
  const [filter, setFilter] = useState("all");
  const entries = useMemo(() => {
    const rows = [],
      seen = new Set();
    const receipt = (r, at) => {
      if (!r?.signature || !r.explorer || seen.has(r.signature)) return;
      seen.add(r.signature);
      rows.push({
        id: r.signature,
        kind: "receipt",
        at: r.confirmedAt || r.at || at,
        title: "Execution confirmed",
        text: r.signature,
        detail: r,
        url: r.explorer,
        cluster: r.cluster,
      });
    };
    for (const s of queue.data?.signals || []) {
      const a = s.proposal.signal;
      rows.push({
        id: s.id,
        kind: "signal",
        at: s.updatedAt || s.createdAt,
        title: `${a.side} ${a.symbol || a.market}`,
        text: s.state,
        detail: s,
        cluster: s.proposal.routing?.best?.network,
      });
      if (s.state === "executed") receipt(s.receipt, s.updatedAt);
    }
    for (const e of memory.data?.journal_recent || []) {
      const acted = parse(e.acted),
        forward = parse(e.forward);
      if (acted?.executed) receipt(forward?.receipt, e.ts);
    }
    for (const c of chats.data || [])
      rows.push({
        id: c.id,
        kind: "chat",
        at: c.updatedAt,
        title: c.title,
        text: `${c.provider} · ${c.messageCount} messages`,
        detail: c,
      });
    return rows.sort(
      (a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0),
    );
  }, [queue.data, memory.data, chats.data]);
  const visible = entries.filter((e) => filter === "all" || e.kind === filter);
  return (
    <section className="page activity-page">
      <div className="page-heading">
        <div>
          <h1>
            <BlurWords
              text={"Every decision.\nA trace you can trust."}
              immediate
            />
          </h1>
          <p>
            Confirmed receipts, signal decisions and conversations. One honest
            history.
          </p>
        </div>
        <div className="activity-seal" aria-hidden="true">
          <i />
          <Icon name="receipt" />
          <i />
        </div>
      </div>
      <div className="activity-filters">
        {[
          ["all", "Everything"],
          ["receipt", "Receipts"],
          ["signal", "Signals"],
          ["chat", "Conversations"],
        ].map(([id, name]) => (
          <button
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            key={id}
          >
            {name}
          </button>
        ))}
        <span>Recent on this desk</span>
      </div>
      {[queue, memory, chats].some((r) => r.loading) && (
        <State state={{ loading: true }} />
      )}
      {[queue, memory, chats]
        .filter((r) => r.error)
        .map((r, i) => (
          <State state={r} key={i} />
        ))}
      {!visible.length && ![queue, memory, chats].some((r) => r.loading) && (
        <div className="activity-empty">
          <Empty
            title="The story starts with your next move."
            action={
              <div className="actions">
                <a className="button primary" href="#markets">
                  Explore Markets <Icon name="arrowUpRight" />
                </a>
                <a className="button" href="#agent">
                  Talk to your agent
                </a>
              </div>
            }
          >
            Setup required: make a real proposal, start a conversation, or
            verify a confirmed transaction. No activity is invented to fill the
            page.
          </Empty>
          <img src="/desktop/media/vault.webp" alt="" />
        </div>
      )}
      <div className="activity-timeline">
        {visible.map((e, i) => (
          <article key={e.kind + e.id}>
            <div className="timeline-time">
              {i === 0 ||
              new Date(e.at).toDateString() !==
                new Date(visible[i - 1].at).toDateString() ? (
                <b>
                  {Number.isFinite(Date.parse(e.at))
                    ? new Date(e.at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })
                    : "Date unavailable"}
                </b>
              ) : null}
              <span>
                {Number.isFinite(Date.parse(e.at))
                  ? new Date(e.at).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Time unavailable"}
              </span>
            </div>
            <div className={"timeline-dot " + e.kind}>
              <Icon
                name={
                  e.kind === "receipt"
                    ? "receipt"
                    : e.kind === "chat"
                      ? "users"
                      : "trendingUp"
                }
              />
            </div>
            <div className="timeline-content">
              <div className="section-title">
                <span className="activity-kind">
                  {e.kind === "receipt"
                    ? "Confirmed receipt"
                    : e.kind === "chat"
                      ? "Conversation"
                      : "Signal decision"}
                </span>
                {e.cluster && <span className="badge">{e.cluster}</span>}
              </div>
              <h3>{e.title}</h3>
              <p>{e.text}</p>
              {e.url && (
                <a
                  className="subtle-link"
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Verify on Explorer <Icon name="arrowUpRight" />
                </a>
              )}
              {e.kind === "chat" && (
                <a
                  className="subtle-link"
                  href={"#agent?chat=" + encodeURIComponent(e.id)}
                >
                  Continue conversation <Icon name="arrowUpRight" />
                </a>
              )}
              <details>
                <summary>View actual record</summary>
                <pre>{JSON.stringify(e.detail, null, 2)}</pre>
              </details>
            </div>
          </article>
        ))}
      </div>
      <p className="timeline-note">
        A quote, acceptance or built transaction is not a confirmed fill.
        Receipt entries require a verified signature.
      </p>
    </section>
  );
}
