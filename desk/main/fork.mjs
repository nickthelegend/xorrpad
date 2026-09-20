/**
 * fork.mjs — bring up the Base mainnet fork the desk app trades against.
 *
 * The app used to assume anvil was already running in another terminal. That is
 * fine on the machine that built it and useless everywhere else: a judge who
 * opens the app gets a window onto a backend whose every chain read fails, and
 * nothing on screen says why.
 *
 * Two rules here, and both matter:
 *
 *   - If something is already answering on the RPC port, USE IT and do not
 *     manage its lifetime. Killing a fork the operator started by hand — with
 *     their own state cache and pinned block — because this app happened to
 *     open is not ours to do.
 *   - If we start one, we own it, and we stop it on the way out. An orphaned
 *     anvil holding port 8545 makes the *next* launch silently attach to a
 *     stale chain, which is the same class of bug as a stale daemon serving
 *     old code.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync, copyFileSync, mkdirSync } from "node:fs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// bash cannot read a script out of app.asar, so the packaged app gets fork.sh
// as an unpacked resource. Source layout is checked second so a dev run is
// never affected by what a build produced.
const FORK_SH = [
  process.resourcesPath && path.join(process.resourcesPath, "fork.sh"),
  path.join(HERE, "..", "fork.sh"),
].find((f) => f && existsSync(f)) || path.join(HERE, "..", "fork.sh");

/** Does something answer JSON-RPC here? Returns the block number, or null. */
export async function probe(rpc, ms = 1500) {
  try {
    const r = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
      signal: AbortSignal.timeout(ms),
    });
    const j = await r.json();
    return j?.result ? Number(BigInt(j.result)) : null;
  } catch { return null; }
}

/**
 * Ensure a fork is listening, starting one if needed.
 *
 * Returns { block, started, stop() }. `started` says whether this process is the
 * owner — callers should only stop what they started.
 */
export async function ensureFork({ rpc = "http://127.0.0.1:8545", timeoutMs = 90_000,
                                  stateDir = null, log = console.log } = {}) {
  // A first launch has an empty state directory. Seeding it from the cache the
  // build shipped is the difference between a fork that is warm in a second and
  // one that spends minutes cold-fetching from a rate-limited public RPC — and
  // anvil, once rate-limited, stops answering upstream reads entirely.
  if (stateDir && process.resourcesPath) {
    for (const [res, dest] of [["fork-block", ".fork-block"], ["fork-state.json", ".fork-state.json"]]) {
      const from = path.join(process.resourcesPath, res);
      const to = path.join(stateDir, dest);
      try {
        if (existsSync(from) && !existsSync(to)) {
          mkdirSync(stateDir, { recursive: true });
          copyFileSync(from, to);
          log(`  seeded ${dest} from the shipped fork cache`);
        }
      } catch (e) { log(`  could not seed ${dest}: ${e.message}`); }
    }
  }

  const already = await probe(rpc);
  if (already !== null) {
    log(`  fork already up at ${rpc}, block ${already} — leaving it alone`);
    return { block: already, started: false, stop() {} };
  }

  log(`  no fork on ${rpc} — starting one (this takes a few seconds)`);
  const child = spawn("bash", [FORK_SH], {
    // Beside the script itself. `HERE/..` is a path INSIDE app.asar in a
    // packaged build — spawn fails on a cwd that is not a real directory, and
    // the failure surfaces as a modal dialog rather than anything on stdout.
    cwd: path.dirname(FORK_SH),
    stdio: ["ignore", "pipe", "pipe"],
    // A packaged app cannot write beside the script, so the pin and the state
    // cache go wherever the caller says (userData). Unset in a source run.
    env: stateDir
      ? { ...process.env,
          FORK_PIN: process.env.FORK_PIN || path.join(stateDir, ".fork-block"),
          FORK_STATE: process.env.FORK_STATE || path.join(stateDir, ".fork-state.json") }
      : process.env,
    detached: false,
  });

  let stderr = "";
  child.stdout.on("data", (d) => log("  [fork] " + String(d).trim()));
  child.stderr.on("data", (d) => { stderr += d; log("  [fork] " + String(d).trim()); });

  let exited = null;
  child.on("exit", (code) => { exited = code; });
  // A missing `anvil` is the single most likely failure, and node reports it as
  // an opaque spawn error. Name the tool and how to get it.
  child.on("error", (e) => { stderr += `\n${e.message}`; exited = -1; });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exited !== null) {
      const hint = /not found|ENOENT/i.test(stderr)
        ? "anvil is not installed or not on PATH — install Foundry: curl -L https://foundry.paradigm.xyz | bash && foundryup"
        : stderr.trim().split("\n").slice(-3).join(" ").slice(0, 300);
      throw new Error(`the Base fork failed to start (exit ${exited}). ${hint}`);
    }
    const block = await probe(rpc, 1000);
    if (block !== null) {
      log(`  fork up at ${rpc}, block ${block}`);
      return {
        block, started: true,
        stop() { try { child.kill("SIGTERM"); } catch { /* already gone */ } },
      };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  try { child.kill("SIGKILL"); } catch { /* nothing to kill */ }
  throw new Error(
    `the Base fork did not answer on ${rpc} within ${Math.round(timeoutMs / 1000)}s. ` +
    `It forks from a free public RPC, so a cold start on a slow network can exceed this.`);
}
