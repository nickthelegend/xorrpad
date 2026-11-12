import React, { useState, useEffect, useRef } from "react";
import { useDesk, Sheet, Empty } from "./core";
import { Icon } from "./brand/Icon";
export function CommandPalette() {
  const d = useDesk(),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(0),
    input = useRef();
  const actions = [
    ...["Device", "Abilities", "Connect", "Agent", "Markets", "Activity"].map(
      (name) => ({
        name: "Open " + name,
        category: "Workspace",
        icon: name === "Device" ? "users" : "arrowUpRight",
        run: () => (location.hash = name.toLowerCase()),
      }),
    ),
    {
      name: "Review signal decisions",
      category: "Trade safely",
      icon: "shieldCheck",
      run: () => window.dispatchEvent(new Event("open-signals")),
    },
    {
      name: "Disarm all trading",
      category: "Safety",
      icon: "shield",
      run: () =>
        d.run(async () => {
          await d.api("/panic", {});
          d.notify("All trading disarmed");
        }),
    },
    {
      name: "Open permission policy",
      category: "Settings",
      icon: "lock",
      run: () =>
        (location.href =
          "/v1" +
          (d.token ? "?token=" + encodeURIComponent(d.token) : "") +
          "#permissions"),
    },
    {
      name: "Open real-history backtest",
      category: "Research",
      icon: "repeat",
      run: () =>
        (location.href =
          "/v1" +
          (d.token ? "?token=" + encodeURIComponent(d.token) : "") +
          "#backtest"),
    },
  ];
  const filtered = actions.filter((a) =>
    (a.name + " " + a.category).toLowerCase().includes(query.toLowerCase()),
  );
  useEffect(() => {
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((s) => !s);
        setQuery("");
        setActive(0);
      }
    };
    const show = () => {
      setOpen(true);
      setQuery("");
      setActive(0);
    };
    window.addEventListener("keydown", key);
    window.addEventListener("open-palette", show);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("open-palette", show);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    input.current?.focus();
    return () => previous?.focus?.();
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById("command-" + active)?.scrollIntoView({block: "nearest"});
  }, [open, active, query]);
  function choose(a) {
    setOpen(false);
    a.run();
  }
  if (!open) return null;
  return (
    <div className="palette-shade" onClick={() => setOpen(false)}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.max(0, Math.min(a + 1, filtered.length - 1)));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          }
          if (e.key === "Enter" && filtered[active]) {
            e.preventDefault();
            choose(filtered[active]);
          }
          if (e.key === "Tab") {
            e.preventDefault();
            input.current?.focus();
          }
        }}
      >
        <div className="palette-search">
          <Icon name="bolt" />
          <input
            ref={input}
            role="combobox"
            aria-label="Search screens and actions"
            aria-expanded="true"
            aria-controls="command-options"
            aria-activedescendant={
              filtered[active] ? "command-" + active : undefined
            }
            placeholder="Where would you like to go?"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
          />
          <button onClick={() => setOpen(false)}>Esc</button>
        </div>
        <div id="command-options" role="listbox">
          {filtered.map((a, i) => (
            <button
              id={"command-" + i}
              role="option"
              aria-selected={active === i}
              key={a.name}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(a)}
            >
              <Icon name={a.icon} />
              <div>
                <b>{a.name}</b>
                <small>{a.category}</small>
              </div>
              <span>↵</span>
            </button>
          ))}
          {!filtered.length && (
            <Empty title="No matching command.">
              Try a screen name, “signals”, “permissions” or “disarm”.
            </Empty>
          )}
        </div>
        <div className="palette-foot">
          <span>↑ ↓ to move · Enter to open</span>
          <span>⌘ K anywhere</span>
        </div>
      </section>
    </div>
  );
}
