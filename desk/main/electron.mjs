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

import { Credentials } from './credentials.mjs';
// Defer keychain access and backend imports until ready, without blocking ESM startup.
const PORT = Number(process.env.PORT || 8710);
let TOKEN, NEEDS_SETUP;

function lanAddress() {
  for (const list of Object.values(networkInterfaces()))
    for (const n of list || [])
      if (n.family === "IPv4" && !n.internal) return n.address;
  return "127.0.0.1";
}

let win, backend;

async function boot() {
  try {
    process.env.XORR_USER_DATA = app.getPath('userData');
    process.env.PORT = String(PORT);
    const credentials = new Credentials();
    TOKEN = await credentials.get('pad-token') || process.env.PAD_TOKEN || 'xorrpad-dev';
    process.env.PAD_TOKEN = TOKEN;
    NEEDS_SETUP = !(await credentials.get('deepgram'));
    const {start} = await import('./server.mjs');
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


  win = new BrowserWindow({
    width: 1440, height: 940, minWidth: 1280, minHeight: 800, backgroundColor: "#030304",
    title: `xorr-pad — pad connects to ${lan}`,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL(`http://127.0.0.1:${PORT}/?token=${encodeURIComponent(TOKEN)}`);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
}

app.whenReady().then(boot);
app.on("window-all-closed", () => {
  backend?.srv?.close();
  backend?.mem?.stop();
  app.quit();
});
