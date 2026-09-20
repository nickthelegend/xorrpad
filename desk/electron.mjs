/**
 * electron.mjs — the desk app.
 *
 * One process: it starts the trading backend (bound to 0.0.0.0 so the pad can
 * reach it over Wi-Fi), starts the Sibyl memory sidecar, and opens the window.
 * The LAN URL is printed and shown in the title so you know what to type into
 * the pad's captive portal.
 */
import { app, BrowserWindow, shell, dialog } from "electron";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Credentials before anything imports a module that reads them. Launched from
// Finder rather than a shell there is no environment at all, so without this the
// packaged app starts with no Deepgram key and no pad token and only says so
// when someone holds the mic key.
const HERE = path.dirname(fileURLToPath(import.meta.url));
for (const f of [
  // Source checkout: two levels up from desktop/main. Packaged: HERE is inside
  // app.asar, so the repo copy is not reachable and userData is where a key the
  // operator entered on first run lives.
  path.join(HERE, "..", "..", ".env"),
  process.resourcesPath && path.join(process.resourcesPath, ".env"),
  path.join(app.getPath("userData"), ".env"),
].filter(Boolean)) {
  try { process.loadEnvFile(f); } catch { /* absent is normal — first run has neither */ }
}

const PORT = Number(process.env.PORT || 8080);
// A blank token means the backend mints a random one per boot, and the pad —
// provisioned once with the old value — starts getting 401s with no clue why.
const TOKEN = process.env.PAD_TOKEN || "xorrpad-dev";
process.env.PAD_TOKEN = TOKEN;
const IS_FORK = (process.env.CHAIN_MODE || "fork") === "fork";
// Where /setup writes what the operator types. The backend will not write
// anywhere else.
process.env.XORR_USER_DATA = app.getPath("userData");
// Nothing to speak with means first run — send the window to setup instead of
// to a desk whose mic fails silently.
const NEEDS_SETUP = !process.env.DEEPGRAM_API_KEY;

// AFTER the environment is settled, never before: server.mjs reads PAD_TOKEN at
// module scope, so importing it first captures `undefined` and the backend mints
// a random token that nothing else in the system knows.
const { start } = await import("./server.mjs");
const { ensureFork } = await import("./fork.mjs");

function lanAddress() {
  for (const list of Object.values(networkInterfaces()))
    for (const n of list || [])
      if (n.family === "IPv4" && !n.internal) return n.address;
  return "127.0.0.1";
}

let win, backend, fork;

async function boot() {
  try {
    // The fork has to be answering before the backend boots: start() reads the
    // chain to warm its caches, and a backend that came up against a dead node
    // shows an empty portfolio rather than an error.
    if (IS_FORK) fork = await ensureFork({
      rpc: process.env.RPC_URL || "http://127.0.0.1:8545",
      stateDir: app.getPath("userData"),
    });
    backend = await start();
  } catch (e) {
    // Opening a window onto a backend this app did not start would let the
    // operator confirm trades against the wrong server. Say what happened and
    // stop instead.
    dialog.showErrorBox("xorr-pad could not start", String(e.message || e));
    app.quit();
    return;
  }
  const lan = `http://${lanAddress()}:${PORT}`;
  console.log(`\n  point the pad's captive portal at:  ${lan}`);
  console.log(`  pad token:                          ${TOKEN}\n`);

  win = new BrowserWindow({
    width: 1440, height: 940, minWidth: 860, minHeight: 620, backgroundColor: "#000000",
    title: `xorr-pad — pad connects to ${lan}`,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL(NEEDS_SETUP
    ? `http://127.0.0.1:${PORT}/setup`
    : `http://127.0.0.1:${PORT}/?token=${encodeURIComponent(TOKEN)}`);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
}

app.whenReady().then(boot);
app.on("window-all-closed", () => {
  backend?.srv?.close();
  backend?.mem?.stop();
  // Only ours. A fork the operator started by hand keeps running.
  if (fork?.started) fork.stop();
  app.quit();
});
