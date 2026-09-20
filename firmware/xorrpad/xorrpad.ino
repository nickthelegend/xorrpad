// ─────────────────────────────────────────────────────────────────────────────
// xorr-pad — an ESP32-S3 trading surface for the xorr-pad backend.
//
// A pad on the desk for taking real trades on Base. Every key here is a real
// control on the backend, and the backend is the only thing that decides: this
// firmware holds no opinion about what is armed, what is in hand, or what a
// trade is worth. It presses keys, shows what came back, and speaks.
//
// NOTHING ON THIS PAD CAN MOVE MONEY ON ITS OWN. BUY and SELL raise a decision;
// only ✓ can execute it, only while the backend says it is armed, and the same
// gate answers whether the key was pressed here or on screen.
//
// Boot flow:
//   1. No WiFi saved (or the reset key held at power-on) → raise the
//      "xorr-pad-setup" captive portal: pick a network, enter the backend URL
//      and pad token, save.
//   2. Join, remember it in flash, start the telnet debug console.
//   3. Poll GET /pad and say "connected" through the amp.
//   4. Run: agent and market keys take the baton and bring a market in hand;
//      BUY/SELL raise a decision; ✓ executes it; hold MIC to speak an order.
//
// Config & wiring: config.h.  Key map: agents.h.  Backend: xorr-pad/desktop.
// ─────────────────────────────────────────────────────────────────────────────

#include "config.h"
#include "settings.h"
#include "agents.h"
#include "matrix.h"
#include "audio.h"
#include "telnet.h"
#include "net.h"
#include "provision.h"
#include "display.h"

Display    screen;            // the display pod
ChartState chartNow;
uint32_t   nextChart   = 0;
bool       screenDirty = true;
uint32_t   screenHoldUntil = 0;       // the test card stays up until then

Matrix     matrix;
Audio      audio;
Telnet     telnet;
Net        net;
Provision  provision;
Settings   settings;

int16_t   *recBuf = nullptr;
const size_t REC_CAP = (size_t)AUDIO_SAMPLE_RATE * REC_SECONDS_MAX;
size_t     recLen = 0;
bool       recording = false;
uint32_t   recAutoStopAt = 0;          // 0 = manual (hold); else a ms deadline

// The backend's state, refreshed by the poll. The pad renders this and nothing
// of its own — if the two ever disagree, the backend is right.
PadState   pad;
uint32_t   nextPoll = 0;
uint8_t    keyR = 0, keyG = 20, keyB = 0;   // colour of the last key that owned the light
uint32_t   killHeldSince = 0;               // 0 = not held

inline void led(uint8_t r, uint8_t g, uint8_t b) { rgbLedWrite(STATUS_LED, r, g, b); }

// The status light, from real backend state. In order of what matters most:
//   disarmed        → hard red, steady. Nothing can trade.
//   decision waiting → amber, breathing. A ✓ is owed.
//   forgotten        → white, breathing. The store was wiped; it trades timid.
//   armed            → the agent's own colour, dim and steady.
//   no backend       → dark blue pulse. The pad is alone.
void ledFromState() {
  uint32_t t = millis();
  if (!pad.ok)            { uint8_t b = 8 + (t / 8 % 40); led(0, 0, b); return; }
  if (!pad.armed)         { led(90, 0, 0); return; }
  if (pad.pending)        { uint8_t b = 30 + (t / 6 % 70); led(b, (uint8_t)(b * 0.6f), 0); return; }
  if (!pad.remembers)     { uint8_t b = 20 + (t / 10 % 50); led(b, b, b); return; }
  led(keyR / 3, keyG / 3, keyB / 3);
}

// ── recording ────────────────────────────────────────────────────────────────
void startRecording(uint32_t autoStopMs = 0) {
  if (recording) return;
  // No "select an agent first" gate: the backend always has one holding the
  // baton, so a spoken order is never homeless. Refusing here would invent a
  // rule the backend does not have.
  recLen = 0;
  recording = true;
  recAutoStopAt = autoStopMs ? millis() + autoStopMs : 0;
  led(70, 0, 0);                        // red = recording
  audio.beep(1200, 70);
  telnet.logf("  ● recording…\n");
}

void stopAndSend() {
  if (!recording) return;
  recording = false;
  led(70, 40, 0);                       // amber = thinking
  audio.beep(700, 70);
  float secs = (float)recLen / AUDIO_SAMPLE_RATE;
  if (recLen < AUDIO_SAMPLE_RATE / 4) { // < 0.25 s
    telnet.logf("  … too short (%.2fs), ignored\n", secs);
    return;
  }
  telnet.logf("  … captured %.1fs, sending\n", secs);
  String heard, said, action;
  bool ok = net.talk(recBuf, recLen, audio, heard, said, action);
  if (ok) {
    telnet.logf("  heard : %s\n  action: %s\n  said  : %s\n",
                heard.c_str(), action.c_str(), said.c_str());
    // A spoken order leaves a decision waiting on a ✓ — the poll will pick it
    // up and the light will start breathing amber on its own.
    nextPoll = 0;
  } else {
    telnet.logf("  ✗ voice request failed (backend at %s?)\n", settings.backendUrl);
    audio.beep(300, 220);
  }
}

// ── keys ─────────────────────────────────────────────────────────────────────
// Send one key id and report what came back. A refusal is not a failure: the
// backend says "disarmed" or "not in the allowlist" and the pad says it too,
// out loud, rather than blinking something the operator has to interpret.
void sendKey(const KeyBind &kb) {
  keyR = kb.r; keyG = kb.g; keyB = kb.b;
  String err;
  if (net.key(kb.id, err)) {
    telnet.logf("  ▸ %s\n", kb.label);
    audio.beep(1200, 45);
  } else {
    telnet.logf("  ✗ %s refused: %s\n", kb.label, err.c_str());
    audio.beep(300, 160);
    if (err.length()) net.speak(err, audio);
  }
  nextPoll = 0;                       // reflect the new state immediately
}

void onKey(uint8_t r, uint8_t c, bool pressed) {
  const KeyBind &kb = keyAt(r, c);
  if (pressed)   // diagnostic: raw position + current mapping, for remapping
    telnet.logf("  [KEY] row=%u col=%u  = %s\n", r, c, kb.label ? kb.label : "unbound");

  switch (kb.role) {
    case ROLE_MIC:
      if (pressed) startRecording(); else stopAndSend();
      return;

    // The kill switch is the one key a brush against must not fire. Hold it.
    case ROLE_KILL:
      if (pressed) { killHeldSince = millis(); telnet.logf("  (hold to stop trading…)\n"); }
      else {
        uint32_t held = killHeldSince ? millis() - killHeldSince : 0;
        killHeldSince = 0;
        if (held >= HOLD_TO_KILL_MS) { sendKey(kb); net.speak("Trading stopped.", audio); }
        else telnet.logf("  … released after %ums — hold %ums to stop trading\n",
                         held, (unsigned)HOLD_TO_KILL_MS);
      }
      return;

    case ROLE_AGENT: case ROLE_MARKET: case ROLE_ACTION:
    case ROLE_CONFIRM: case ROLE_REFUSE:
      if (pressed) sendKey(kb);
      return;

    default:
      if (pressed) telnet.logf("  %s (unbound)\n", matrix.name[r][c]);
  }
}

// ── telnet commands ──────────────────────────────────────────────────────────
void onTelnetCommand(const String &line) {
  String cmd = line; cmd.toLowerCase();
  if (cmd == "help") {
    telnet.println("help · status · pad · map · ip · heap · key <id> · say <t> · talk · url <u> · token <t> · screen · testcard · rot <1|3> · reset-wifi · reboot");
  } else if (cmd == "screen") {
    telnet.println(screen.info());
    telnet.logf("pad %s · market %s · chart %s %s\n", pad.ok ? "ok" : "no backend", pad.market.c_str(),
                chartNow.ok ? chartNow.symbol.c_str() : "none", chartNow.error.c_str());
  } else if (cmd == "testcard") {
    screen.testCard();
    screenHoldUntil = millis() + 15000;
    telnet.println("test card up for 15 s");
  } else if (cmd.startsWith("rot ")) {
    int r = line.substring(4).toInt();
    if (screen.rotate(r)) {
      screen.testCard();
      screenHoldUntil = millis() + 8000;
      telnet.logf("display rotation %d — test card up for 8 s (set TFT_ROTATION in config.h to keep it)\n", r);
    } else {
      telnet.println("rot 1 or rot 3 — the pod holds the panel landscape");
    }
  } else if (cmd == "status") {
    telnet.logf("wifi %s  ip %s  rssi %ddBm  heap %u  psram %u\n",
                WiFi.isConnected() ? "up" : "down", WiFi.localIP().toString().c_str(),
                WiFi.RSSI(), ESP.getFreeHeap(), ESP.getFreePsram());
    telnet.logf("backend %s  (%s, token %s)\n",
                settings.backendUrl, settings.secure() ? "https" : "http",
                settings.padToken[0] ? "set" : "none");
    telnet.logf("pad: %s · %s in hand · agent %s · %s%s\n",
                pad.ok ? (pad.armed ? "ARMED" : "STOPPED") : "no backend",
                pad.market.c_str(), pad.agent.c_str(),
                pad.pending ? "a decision is waiting on a ✓" : "nothing in hand",
                pad.remembers ? "" : " · MEMORY WIPED");
  } else if (cmd == "map") {
    for (uint8_t r = 0; r < MATRIX_ROWS; r++) {
      char line[128] = "";
      for (uint8_t c = 0; c < MATRIX_COLS; c++) {
        const KeyBind &k = keyAt(r, c);
        const char *nm = k.label ? k.label : "-";
        strncat(line, nm, sizeof(line) - strlen(line) - 4);
        strncat(line, " | ", sizeof(line) - strlen(line) - 1);
      }
      telnet.logf("  r%u: %s\n", r, line);
    }
  } else if (cmd == "ip") {
    telnet.println(WiFi.localIP().toString());
  } else if (cmd == "heap") {
    telnet.logf("heap %u  psram %u\n", ESP.getFreeHeap(), ESP.getFreePsram());
  } else if (cmd == "pad") {
    PadState st;
    if (!net.pad(st)) { telnet.println("backend did not answer"); }
    else telnet.logf("armed=%d pending=%d chain=%d remembers=%d agent=%s market=%s price=%.4f spent=%d/%d\n",
                     st.armed, st.pending, st.chainOk, st.remembers,
                     st.agent.c_str(), st.market.c_str(), st.price, st.spentToday, st.dayLimit);
  } else if (cmd.startsWith("key ")) {
    String id = line.substring(4); id.trim();
    String err;
    telnet.logf(net.key(id, err) ? "  ▸ %s ok\n" : "  ✗ %s refused: ", id.c_str());
    if (err.length()) telnet.logf("%s\n", err.c_str());
    nextPoll = 0;
  } else if (cmd.startsWith("say ")) {
    String t = line.substring(4);
    telnet.logf("speaking: %s\n", t.c_str());
    if (!net.speak(t, audio)) telnet.logf("  speak failed\n");
  } else if (cmd == "talk") {
    telnet.logf("hands-free talk (%dms)…\n", TELNET_TALK_MS);
    startRecording(TELNET_TALK_MS);
  } else if (cmd.startsWith("url ")) {
    String u = line.substring(4); u.trim();          // original case — URLs matter
    settings.set(u.c_str(), settings.padToken);      // repoint backend, keep token + WiFi
    telnet.logf("backend URL → %s\n", settings.backendUrl);
    PadState st;
    if (net.pad(st)) {
      telnet.logf("  ✓ reachable (%s, %s)\n", st.mode.c_str(), st.armed ? "armed" : "stopped");
      net.speak("Backend connected.", audio);
    } else {
      telnet.logf("  ✗ not reachable yet — check the IP/port and that the backend is running\n");
    }
  } else if (cmd.startsWith("token ")) {
    String t = line.substring(6); t.trim();
    settings.set(settings.backendUrl, t.c_str());
    telnet.logf("pad token %s\n", t.length() ? "set" : "cleared");
  } else if (cmd == "reset-wifi") {
    telnet.println("wiping WiFi + settings, rebooting into the portal…");
    provision.resetWifi(); Settings::erase();
    delay(400); ESP.restart();
  } else if (cmd == "reboot") {
    telnet.println("rebooting…"); delay(200); ESP.restart();
  } else {
    telnet.println("unknown — 'help'");
  }
}

// K1 held at power-on? (used to force re-provisioning). Reads the matrix raw.
bool talkKeyHeldAtBoot() {
  digitalWrite(COL_PINS[TALK_COL], LOW);
  delayMicroseconds(20);
  bool held = digitalRead(ROW_PINS[TALK_ROW]) == LOW;
  digitalWrite(COL_PINS[TALK_COL], HIGH);
  return held;
}

// ── lifecycle ────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  uint32_t s = millis(); while (!Serial && millis() - s < 1200) {}
  led(0, 0, 60);                        // blue = booting

  matrix.begin();
  screen.begin();                       // shows the test card while WiFi comes up
  screenHoldUntil = millis() + 3000;
  if (!audio.begin()) Serial.println("!! audio init failed");
  recBuf = (int16_t *)ps_malloc(REC_CAP * sizeof(int16_t));
  if (!recBuf) Serial.println("!! PSRAM alloc failed — enable Tools → PSRAM: OPI PSRAM");

  settings.load();
  net.begin(&settings);

  bool forcePortal = talkKeyHeldAtBoot();
  if (forcePortal) {
    Serial.println("K1 held → re-provisioning");
    provision.resetWifi();
    led(60, 0, 60);                     // magenta = portal
  } else {
    led(0, 40, 40);                     // cyan = connecting / portal
  }

  Serial.printf("provisioning… (join \"%s\" if the portal opens)\n", PORTAL_AP_NAME);
  bool up = provision.run(settings);    // blocks in the portal until configured

  if (!up) {
    Serial.println("!! WiFi not connected");
    led(80, 0, 0);
    return;                             // loop() will still scan keys / poll
  }

  Serial.printf("WiFi up: %s\n", WiFi.localIP().toString().c_str());
  telnet.begin(TELNET_PORT);
  telnet.onCommand(onTelnetCommand);
  Serial.printf("telnet:  telnet %s %u\n", WiFi.localIP().toString().c_str(), TELNET_PORT);
  Serial.printf("backend: %s  (token %s)\n", settings.backendUrl, settings.padToken[0] ? "set" : "none");

  // Announce we're up — through the amp, from the backend's own TTS, and say
  // something true rather than a generic chime: whether it is armed, and what
  // it still remembers. A pad that says "connected" while the store is wiped
  // has told the operator nothing they needed.
  if (net.pad(pad)) {
    Serial.printf("backend ok (%s, %s)\n", pad.mode.c_str(), pad.armed ? "armed" : "stopped");
    String hello = String("xorr pad connected. ") +
                   (pad.armed ? "Armed, " : "Trading is stopped, ") +
                   pad.market + " in hand." +
                   (pad.remembers ? "" : " Memory is wiped — it will refuse anything but the smallest trade.");
    if (!net.speak(hello, audio)) audio.beep(1320, 120);
  } else {
    Serial.println("!! backend not reachable — check the URL in the portal (reset-wifi to change)");
    audio.beep(880, 60); audio.beep(660, 120);   // fell-back chime
  }
  ledFromState();
  Serial.println("Ready. An agent or market key sets the hand; BUY/SELL propose; ✓ executes.");
}

void loop() {
  matrix.scan(onKey);
  telnet.poll();

  // One cheap poll a second keeps the light honest — armed, waiting on a ✓,
  // or forgotten. Skipped while recording so the mic never stutters.
  if (!recording && millis() >= nextPoll) {
    nextPoll = millis() + PAD_POLL_MS;
    PadState fresh;
    if (net.pad(fresh)) pad = fresh; else pad.ok = false;
    screenDirty = true;
  }
  ledFromState();

  // The display pod. The chart is hourly candles, so it is fetched once a
  // minute — or at once when the market in hand changes — while the screen
  // redraws after every poll so the price and the state stay live.
  if (!recording && millis() >= nextChart) {
    nextChart = millis() + CHART_POLL_MS;
    ChartState fresh;
    if (net.chart(fresh)) {
      chartNow = fresh;
      telnet.logf("  chart %s: %u closes, $%.2f, %+.2f%% 24h %s\n", fresh.symbol.c_str(),
                  (unsigned)fresh.n, fresh.price, fresh.change24h, fresh.error.c_str());
    } else {
      chartNow.ok = false;
      telnet.logf("  chart unavailable %s\n", fresh.error.c_str());
    }
    screenDirty = true;
  }
  if (pad.ok && chartNow.ok && chartNow.symbol != pad.market) nextChart = 0;
  if (!recording && screenDirty && millis() >= screenHoldUntil) {
    screenDirty = false;
    screen.draw(pad, chartNow);
  }

  // Held long enough? Fire the kill switch without waiting for the release, so
  // the operator sees it stop under their finger.
  if (killHeldSince && millis() - killHeldSince >= HOLD_TO_KILL_MS) {
    killHeldSince = 0;
    String err;
    if (net.key("kill", err)) { telnet.logf("  ▸ TRADING STOPPED\n"); net.speak("Trading stopped.", audio); }
    else telnet.logf("  ✗ kill refused: %s\n", err.c_str());
    nextPoll = 0;
  }

  if (recording && recBuf) {
    int16_t block[256];
    size_t n = audio.readMic(block, 256);
    for (size_t i = 0; i < n && recLen < REC_CAP; i++) recBuf[recLen++] = block[i];
    if (recLen >= REC_CAP) { telnet.logf("  (max length)\n"); stopAndSend(); }
    else if (recAutoStopAt && millis() >= recAutoStopAt) stopAndSend();
  }
}
