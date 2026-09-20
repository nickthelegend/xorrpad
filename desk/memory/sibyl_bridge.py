"""sibyl_bridge.py — the xorr-pad's memory, spoken over stdio.

Sibyl Memory ships a Python client and an MCP server, but no JS SDK, so the
Electron/Node side talks to this process in newline-delimited JSON:

    ->  {"id": 1, "op": "set_state", "args": {"key": "baton", "body": {...}}}
    <-  {"id": 1, "ok": true, "result": null}

Everything is a real write to the real store (SQLite under ~/.sibyl-memory by
default, or SIBYL_DB). Nothing here is simulated.

The schema the pad relies on:
    state:baton                  active agent / market / size
    reference:risk/limits        max per trade, max per day, token allowlist
    entity:position/<SYMBOL>     qty, avg entry, opened_at
    entity:rule/<id>             a learned rule + whether it was accepted
    entity:watchlist/<SYMBOL>    markets being watched
    journal (write_event)        every signal, decision and fill
"""
from __future__ import annotations

import json
import os
import sys
import traceback
from pathlib import Path

from sibyl_memory_client import MemoryClient, Storage

DB = os.environ.get("SIBYL_DB") or str(Path.home() / ".sibyl-memory" / "memory.db")


def _open():
    Path(DB).parent.mkdir(parents=True, exist_ok=True)
    return MemoryClient(Storage(DB))


mem = _open()


# ---- composite reads the agent loop actually uses -------------------------

def recall_brief(_args):
    """Everything a fresh session needs before it may trade.

    This is the call that makes memory load-bearing: limits, open positions,
    accepted rules and the active baton, in one shot, for prompt injection and
    for decide().
    """
    # Today's executed spend, over a real window. Counting from "the last 50
    # events" silently under-counts the moment the day has more than 50.
    spent_today = 0.0
    try:
        from datetime import datetime, timezone
        # LOCAL midnight, expressed in UTC. "Today" means the operator's day, and
        # decide.mjs's fallback counts from local midnight too — a UTC window here
        # would make the two paths disagree by up to a day's worth of trades.
        midnight = (datetime.now().astimezone()
                    .replace(hour=0, minute=0, second=0, microsecond=0)
                    .astimezone(timezone.utc).isoformat().replace("+00:00", "Z"))
        for e in (mem.read_events(limit=1000, since=midnight) or []):
            acted = e.get("acted")
            if isinstance(acted, str):
                try: acted = json.loads(acted)
                except Exception: acted = None
            if isinstance(acted, dict) and acted.get("executed"):
                try: spent_today += float(acted.get("usd") or 0)
                except Exception: pass
    except Exception:
        spent_today = None

    limits = mem.get_reference("risk/limits")
    if limits and isinstance(limits.get("body"), str):
        try:
            limits = json.loads(limits["body"])
        except Exception:
            limits = None
    elif limits:
        limits = limits.get("body")

    positions = {}
    for e in mem.list_entities("position", limit=100):
        positions[e["name"]] = e.get("body")

    rules = []
    for e in mem.list_entities("rule", limit=100):
        b = e.get("body") or {}
        if b.get("accepted"):
            rules.append({"id": e["name"], **b})

    watch = [e["name"] for e in mem.list_entities("watchlist", limit=100)]
    baton = (mem.get_state("baton") or {}).get("body")

    return {"limits": limits, "positions": positions, "rules": rules,
            "watchlist": watch, "baton": baton, "spent_today": spent_today,
            "journal_recent": mem.read_events(limit=10)}


def stats(_a):
    return {"db": DB, "exists": os.path.exists(DB),
            "size_bytes": os.path.getsize(DB) if os.path.exists(DB) else 0,
            "tier": mem.free_tier_status()}


def wipe(_a):
    """Delete the store outright — the demo's 'what breaks without memory'."""
    global mem
    try:
        mem.local.close()
    except Exception:
        pass
    removed = []
    for suffix in ("", "-wal", "-shm"):
        p = DB + suffix
        if os.path.exists(p):
            os.remove(p)
            removed.append(p)
    mem = _open()
    return {"removed": removed}


def full_store(args):
    """Everything Sibyl is holding, tier by tier.

    recall_brief() is the decision-shaped view: limits, positions, rules, baton.
    This is the *whole* store — every entity in every category, the references
    and state keys behind them, the journal itself rather than a count, and the
    engine's own stats. It exists so the operator can see what the agent knows,
    not a summary of it.
    """
    limit = int(args.get("limit") or 60)
    out = {"entities": {}, "references": {}, "state": {}, "journal": [], "archived": [], "stats": None}

    for category in ("position", "rule", "watchlist"):
        try:
            rows = mem.list_entities(category) or []
        except Exception:
            rows = []
        items = []
        for r in rows:
            body = r.get("body") if isinstance(r, dict) else None
            if isinstance(body, str):
                try:
                    body = json.loads(body)
                except Exception:
                    pass
            items.append({"name": r.get("name") or r.get("key"), "body": body,
                          "status": r.get("status"), "ts": r.get("ts") or r.get("updated_at")})
        if items:
            out["entities"][category] = items

    for key in ("risk/limits",):
        try:
            ref = mem.get_reference(key)
        except Exception:
            ref = None
        if ref:
            body = ref.get("body") if isinstance(ref, dict) else ref
            if isinstance(body, str):
                try:
                    body = json.loads(body)
                except Exception:
                    pass
            out["references"][key] = body

    for key in ("baton",):
        try:
            st = mem.get_state(key)
        except Exception:
            st = None
        if st:
            body = st.get("body") if isinstance(st, dict) else st
            if isinstance(body, str):
                try:
                    body = json.loads(body)
                except Exception:
                    pass
            out["state"][key] = body

    try:
        for e in (mem.read_events(limit=limit) or []):
            row = {"ts": e.get("ts")}
            for f in ("evaluated", "acted", "forward"):
                v = e.get(f)
                if isinstance(v, str):
                    try:
                        v = json.loads(v)
                    except Exception:
                        pass
                if v:
                    row[f] = v
            out["journal"].append(row)
    except Exception:
        pass

    try:
        out["archived"] = list_archived({"limit": 20})
    except Exception:
        out["archived"] = []

    try:
        out["stats"] = stats(None)
    except Exception:
        out["stats"] = None
    return out


def archive_entity(a):
    """Retire an entity into archived_entities instead of destroying it.

    Closing a position used to hard-delete it, so the store could not answer
    "what did I used to hold?" — which for a trading agent throws away the only
    record that a trade ever happened. Archiving keeps it, with the reason.
    """
    return mem.archive_entity(a["category"], a["name"], a.get("reason"))


def list_archived(a):
    """Everything that was retired, newest first. Read straight from the tier."""
    limit = int(a.get("limit") or 50)
    rows = []
    with mem.storage.connection() as conn:
        cur = conn.execute(
            "SELECT category, name, body, archive_reason, archived_at "
            "FROM archived_entities WHERE tenant_id = ? "
            "ORDER BY archived_at DESC LIMIT ?",
            (mem.get_tenant(), limit))
        for category, name, body, reason, archived_at in cur.fetchall():
            try:
                body = json.loads(body) if isinstance(body, str) else body
            except Exception:
                pass
            rows.append({"category": category, "name": name, "body": body,
                         "reason": reason, "archived_at": archived_at})
    return rows


def search_tiers(a):
    """FTS5 search, optionally scoped to specific tiers, with the verdict.

    The verdict is the point: Sibyl distinguishes NO_MATCH ("I know things,
    none of them match") from EMPTY_STORE ("I know nothing at all"). An agent
    that says "no record" without knowing which of those it means is guessing.
    """
    tiers = a.get("tiers") or None
    res = mem.search(a["query"], limit=int(a.get("limit") or 20),
                     tiers=tuple(tiers) if tiers else None)
    try:
        from sibyl_memory_client import refine_zero
        res = refine_zero(mem, res)
    except Exception:
        pass
    hits = [dict(h) if not isinstance(h, dict) else h for h in (res.hits if hasattr(res, "hits") else res)]
    verdict = getattr(res, "verdict", None)
    return {
        "hits": hits,
        "verdict": {
            "code": getattr(getattr(verdict, "code", None), "name", None),
            "explain": explain_verdict(verdict),
        } if verdict is not None else None,
    }


def explain_verdict(v):
    try:
        from sibyl_memory_client import explain
        return explain.explain(v) if hasattr(explain, "explain") else None
    except Exception:
        return None


def events_between(a):
    """The journal over a bounded window — the temporal tier used as one.

    Daily spend used to be computed by pulling the last N events and filtering
    in JavaScript, which silently under-counts once the day has more than N.
    Asking the store for a range is both correct and what the API is for.
    """
    return mem.read_events(limit=int(a.get("limit") or 500),
                           since=a.get("since"), until=a.get("until"))


def search_entities_op(a):
    """Entity-scoped FTS, used to stop a duplicate rule being accepted twice."""
    return mem.search_entities(a["query"], limit=int(a.get("limit") or 20),
                               category=a.get("category"))


def set_entity_status(a):
    """Move an entity through its lifecycle (proposed -> active -> retired)."""
    return mem.set_entity(a["category"], a["name"], a["body"], status=a.get("status"))


OPS = {
    "get_state":      lambda a: mem.get_state(a["key"]),
    "set_state":      lambda a: mem.set_state(a["key"], a["body"]),
    "get_entity":     lambda a: mem.get_entity(a["category"], a["name"]),
    "set_entity":     lambda a: mem.set_entity(a["category"], a["name"], a["body"],
                                               status=a.get("status")),
    "list_entities":  lambda a: mem.list_entities(a.get("category"), limit=a.get("limit", 100)),
    "search_entities": lambda a: [dict(h) for h in mem.search_entities(a["query"], limit=a.get("limit", 20))],
    "delete_entity":  lambda a: mem.delete_entity(a["category"], a["name"]),
    "get_reference":  lambda a: mem.get_reference(a["key"]),
    "set_reference":  lambda a: mem.set_reference(a["key"], a["body"]),
    "write_event":    lambda a: mem.write_event(evaluated=a.get("evaluated"),
                                                acted=a.get("acted"),
                                                forward=a.get("forward"),
                                                extra=a.get("extra")),
    "read_events":    lambda a: mem.read_events(limit=a.get("limit", 50)),
    "search":         lambda a: [dict(h) for h in mem.search(a["query"], limit=a.get("limit", 20))],
    "learn":          lambda a: _learn(a),
    "recall_brief":   recall_brief,
    "stats":          stats,
    "wipe":           wipe,
    "full_store":     full_store,
    "archive_entity": archive_entity,
    "list_archived":  list_archived,
    "search_tiers":   search_tiers,
    "events_between": events_between,
    "search_entities": search_entities_op,
    "set_entity_status": set_entity_status,
    "ping":           lambda a: "pong",
    # Which store did this bridge actually open? The server resolves it from
    # SIBYL_DB and silently falls back to the home directory, so anything that
    # wants to read or write the same memory has to be able to ask rather than
    # guess. A test that guessed wrong manipulated an empty database for weeks
    # and reported the product as broken.
    "where":          lambda a: {"db": str(DB)},
}


def _learn(a):
    """Reflection: let Sibyl propose rules from the journal."""
    try:
        report = mem.learn(**(a.get("kwargs") or {}))
        return {"ran": True, "report": str(report)}
    except Exception as e:                       # learner needs a summarizer/tier
        return {"ran": False, "reason": f"{type(e).__name__}: {e}"}


def main():
    sys.stderr.write(f"sibyl_bridge up, db={DB}\n")
    sys.stderr.flush()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception:
            continue
        rid, op, args = req.get("id"), req.get("op"), req.get("args") or {}
        try:
            if op not in OPS:
                raise KeyError(f"unknown op '{op}'")
            out = {"id": rid, "ok": True, "result": OPS[op](args)}
        except Exception as e:
            out = {"id": rid, "ok": False,
                   "error": f"{type(e).__name__}: {e}",
                   "trace": traceback.format_exc(limit=3)}
        sys.stdout.write(json.dumps(out, default=str) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
