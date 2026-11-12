import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
export const Desk = createContext(null);
export const useDesk = () => useContext(Desk);
export function useRead(path, interval = 15000, keepData = false) {
  const { api, revision } = useDesk();
  const [state, set] = useState({ loading: true });
  useEffect(() => {
    const c = new AbortController();
    let running = false;
    const load = async () => {
      if (running) return;
      running = true;
      try {
        const data = await api(path, undefined, { signal: c.signal });
        if (!c.signal.aborted) set({ data, loading: false });
      } catch (e) {
        if (!c.signal.aborted) set({ error: e.message, loading: false });
      } finally {
        running = false;
      }
    };
    set((previous) =>
      keepData ? { ...previous, loading: true } : { loading: true },
    );
    load();
    const t = interval ? setInterval(load, interval) : null;
    return () => {
      c.abort();
      clearInterval(t);
    };
  }, [path, api, revision, interval, keepData]);
  return state;
}
export const money = (n, unit = "USD") =>
  Number.isFinite(Number(n)) && n != null
    ? Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }) +
      " " +
      unit
    : "Unavailable";
export function State({
  state,
  title = "A little setup. A lot of possibility.",
  action,
}) {
  if (state?.loading)
    return (
      <div className="state" role="status">
        <span className="loading-orbit" />
        Reading your desk…
      </div>
    );
  if (state?.error)
    return (
      <div className="state">
        <h3>{title}</h3>
        <p role="alert">{state.error}</p>
        {action}
      </div>
    );
  return null;
}
export function Empty({ title, children, action, art = "empty-positions" }) {
  return (
    <div className="state empty-state">
      <div className="empty-orbit" aria-hidden="true">
        <img src={"/desktop/media/art/" + art + ".png"} alt="" loading="lazy" />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Sheet({ title, children, onClose }) {
  useEffect(() => {
    const fn = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = [
          ...document.querySelectorAll(
            ".sheet button:not(:disabled),.sheet a[href],.sheet input,.sheet select,.sheet textarea",
          ),
        ].filter((n) => n.getClientRects().length);
        if (nodes.length) {
          if (e.shiftKey && document.activeElement === nodes[0]) {
            e.preventDefault();
            nodes.at(-1).focus();
          } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
            e.preventDefault();
            nodes[0].focus();
          }
        }
      }
    };
    window.addEventListener("keydown", fn);
    const old = document.activeElement;
    const el = document.querySelector(".sheet");
    el?.focus();
    return () => {
      window.removeEventListener("keydown", fn);
      old?.focus?.();
    };
  }, []);
  return (
    <div className="sheet-shade" onClick={onClose}>
      <aside
        className="sheet"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Close sheet">
            Close
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}
export function Provider({ children }) {
  const [token, setToken] = useState(
      new URLSearchParams(location.search).get("token") || "",
    ),
    [revision, bump] = useState(0),
    [message, setMessage] = useState(null),
    [event, setEvent] = useState(null),
    [online, setOnline] = useState(false);
  const notify = useCallback(
    (text) => setMessage({ text, id: crypto.randomUUID() }),
    [],
  );
  const api = useCallback(
    async (path, body, opts = {}) => {
      if (!token)
        throw Error("Setup required: connect desk with your pad token");
      const r = await fetch((import.meta.env.DEV ? "/api" : "") + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          authorization: "Bearer " + token,
          "content-type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: opts.signal
          ? AbortSignal.any([opts.signal, AbortSignal.timeout(120000)])
          : AbortSignal.timeout(120000),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error || `Desk HTTP ${r.status}`);
      return j;
    },
    [token],
  );
  useEffect(() => {
    if (!token) return;
    let ws,
      t,
      closed = false;
    const open = () => {
      ws = new WebSocket(location.origin.replace(/^http/, "ws") + "/events", [
        "xorrpad",
        "pad-token." + token,
      ]);
      ws.onopen = () => setOnline(true);
      ws.onmessage = (e) => {
        try {
          setEvent(JSON.parse(e.data));
        } catch {}
      };
      ws.onclose = () => {
        setOnline(false);
        if (!closed) t = setTimeout(open, 5000);
      };
    };
    open();
    return () => {
      closed = true;
      clearTimeout(t);
      ws?.close();
    };
  }, [token]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);
  const refresh = () => bump((n) => n + 1);
  const run = async (fn) => {
    try {
      return await fn();
    } catch (e) {
      notify(e.message);
      return null;
    }
  };
  return (
    <Desk.Provider
      value={{
        api,
        token,
        setToken,
        revision,
        refresh,
        notify,
        run,
        event,
        online,
      }}
    >
      {children}
      {message && (
        <div className="notice" role="status">
          <span>{message.text}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setMessage(null)}
          >
            Close
          </button>
        </div>
      )}
    </Desk.Provider>
  );
}
