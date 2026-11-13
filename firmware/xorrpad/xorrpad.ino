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
#include "clear-sign.h"
#include "price-alerts.h"
#include "abilities.h"
#include "agents.h"
#include "keymap.h"
#include "link.h"
#include "matrix.h"
#include "factory.h"
#include "audio.h"
#include "telnet.h"
#include "logic/release.h"
#include <esp_log.h>
#include "net.h"
#include "provision.h"
#include "display.h"
#include "presentation.h"
#include "accessibility.h"
#include "logic/status-led.h"
#include "ota.h"
#include "logic/kill-switch.h"
#include "logic/decision-confirm.h"
#include "profiles.h"
#include "knob.h"
#include "health.h"
#include "tilt-guard.h"

Factory factory;
xorr::FactoryReset factoryReset;
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
PadLink    padlink;
Health health;
Ota ota;
Accessibility accessibility;
bool amountSpoken=false;
uint32_t rebootAt=0;
Profiles profiles;
Knob knob;
xorr::KnobControl knobControl;

void onTelnetCommand(const String &line);
xorr::UsbDebugGate usbDebugGate;
bool telnetStarted=false, keymapShown=false;
PadLink::Transport recTransport=PadLink::NONE;
bool recStreaming=false;
uint32_t recEpoch=0;
xorr::VoicePlayback playback;
xorr::VoiceGate voiceGate;

int16_t   *recBuf = nullptr;
const size_t REC_CAP = (size_t)AUDIO_SAMPLE_RATE * REC_SECONDS_MAX;
size_t     recLen = 0;
bool       recording = false;
uint32_t   recAutoStopAt = 0;          // 0 = manual (hold); else a ms deadline

// The backend's state, refreshed by the poll. The pad renders this and nothing
// of its own — if the two ever disagree, the backend is right.
PadState   pad;
xorr::KillSwitch killSwitch;
PadLink::Transport rearmTransport = PadLink::NONE;
ClearSigning clearSigning;
xorr::DecisionConfirm decisionConfirm;
Abilities abilities;
PriceAlerts priceAlerts;
TiltGuard tiltGuard;

bool persistKill(bool killed) {
  Preferences p;
  if (!p.begin("xorrsafety", false)) return false;
  bool ok = p.putUChar("killed", killed ? 1 : 0) == 1;
  p.end();
  return ok;
}
void showKillState() {
  pad.killed = padlink.killed = killSwitch.killed;
  pad.rearmRequested = killSwitch.requested;
  pad.rearmProgress = killSwitch.progress(millis());
  if (killSwitch.killed) { pad.armed = pad.autoAccept = pad.pending = false; }
}
void latchKill() {
  killSwitch.kill();decisionConfirm.reset();
  persistKill(true); // Local disarm precedes every network operation.
  padlink.stopInputs();
  recording = recStreaming = false;
  pad.listening=false;
  recLen = 0;
  pad.signalId = "";
  pad.receiptUntil = pad.keymapUntil = 0;
  showKillState();
  rgbLedWrite(STATUS_LED, 100, 0, 0);
  screenHoldUntil = 0;
  screenDirty = true;
  JsonDocument d; d["type"] = padlink.secureReady() ? "kill" : "key";
  d["action"] = "kill"; d["edge"] = "down"; d["id"] = padlink.eventId();
  padlink.send(d);
  audio.chime(xorr::Chime::Kill);
}
uint32_t   nextPoll = 0;
uint8_t    keyR = 0, keyG = 20, keyB = 0;   // colour of the last key that owned the light

inline void led(uint8_t r, uint8_t g, uint8_t b) {
  if(killSwitch.killed)rgbLedWrite(STATUS_LED,100,0,0);
  else rgbLedWrite(STATUS_LED,r,g,b);
}

// One language, ordered by urgency. KILL always wins.
void ledFromState() {
  uint32_t now=millis();
  if(!killSwitch.killed && pad.alertsOnly && (int32_t)(pad.alertUntil-now)>0){led(0,100,40);return;}
  auto color=xorr::statusLed(now,killSwitch.killed,pad.errorCode.length(),
    pad.ok && pad.pending,(int32_t)(pad.receiptUntil-now)>0,-1,pad.liqGuard.fresh(now));
  led(color.r,color.g,color.b);
}

// Messages are applied on loop(), including BLE callbacks queued by link.h.
bool usbDebugAllowed() {
  return usbDebugGate.check(padlink.secureReady(), padlink.active() == PadLink::USB,
                            padlink.connectionEpoch());
}
void onPadMessage(JsonVariantConst d) {
  if (factory.active || factoryReset.active) return;
  tiltGuard.message(d,padlink.secureReady(),pad);
  JsonDocument alertResponse;
  if(priceAlerts.message(d,padlink.secureReady(),alertResponse)){padlink.send(alertResponse);return;}
  JsonDocument abilityResponse;
  bool abilityIdle=health.displayUp && !padlink.blePairing && !accessibility.idle.blank(millis()) && !killSwitch.killed && !ota.busy && !pad.pending && !recording && !clearSigning.active && !pad.errorCode.length() && !pad.pairCode.length();
  if(abilities.message(d,padlink.connectionEpoch(),padlink.secureReady(),abilityIdle,pad,abilityResponse)){padlink.send(abilityResponse);screenDirty=true;screenHoldUntil=0;return;}
  if(abilities.reviewing() && d["type"]!="kill_sync")return;
  if(d["type"]=="pulse")abilities.priceAt=millis();
  if(clearSigning.message(d,padlink.connectionEpoch(),padlink.secureReady(),killSwitch.killed || ota.busy,pad)) {
    screenDirty=true;screenHoldUntil=0;return;
  }
  String debugType = d["type"] | "";
  if (debugType == "config" || debugType == "ready") {
    usbDebugGate.configure(d["usbDebug"] | false, padlink.secureReady(),
                           padlink.active() == PadLink::USB, padlink.connectionEpoch());
    telnet.usbDebug = usbDebugAllowed();
  }
  if (debugType == "debug") {
    if (usbDebugAllowed()) onTelnetCommand(d["command"] | "");
    return;
  }
  std::string priorGuard=pad.liqGuard.id;bool hadGuard=pad.liqGuard.fresh(millis());
  presentationMessage(d,pad,chartNow);
  if(d["type"]=="liq_guard" && pad.liqGuard.fresh(millis())) {
    accessibility.idle.wake(millis());screenHoldUntil=0;
    if(!hadGuard || priorGuard!=pad.liqGuard.id)audio.chime(xorr::Chime::LiqAlarm);
  }
  String type=d["type"] | "";
  if((type=="fund" && pad.fund.visible) || (type=="portfolio" && pad.portfolio.visible) || (type=="outcome_positions" && pad.predict.positionsVisible)) {
    accessibility.idle.wake(millis());screenHoldUntil=0;
  }
  if(type=="signal")amountSpoken=false;
  if(type=="config" || type=="ready") {
    if(padlink.secureReady() && !accessibility.patch(d)) {
      pad.errorCode="UI_SETTINGS";pad.errorFix="Retry desk display settings";
    }
    pad.highContrast=accessibility.highContrast();
    accessibility.labels(pad);
  }
  if(type.startsWith("ota_")) {
    if(!padlink.secureReady()) return;
    bool ok=ota.message(d);
    pad.updating=ota.busy || (ok && type=="ota_end");pad.otaProgress=ota.progress;
    JsonDocument result;result["type"]="ota_result";result["id"]=d["id"];result["ok"]=ok;result["error"]=ota.error;result["channel"]=ota.selectedChannel();padlink.send(result);
    if(!ok){pad.errorCode="OTA_REFUSED";pad.errorFix=ota.error;}
    else if(type=="ota_end")rebootAt=millis()+1500;
    screenHoldUntil=0;screenDirty=true;return;
  }
  if(type=="error")audio.chime(xorr::Chime::Error);
  if(type=="crash_saved") health.crashSaved(d);
  else if (type == "kill_sync") { latchKill(); }
  else if (type == "profiles" || type == "profile_map" || type == "profile_select") {
    bool ok=false;
    if(padlink.secureReady()) {
      if(type=="profiles")ok=profiles.metadata(d);
      else if(type=="profile_map")ok=profiles.map(d,pad.pending || recording);
      else if(d["profile"].is<int>() && d["layer"].is<int>())
        ok=profiles.select(d["profile"],d["layer"],pad.pending || recording);
    }
    JsonDocument ack;ack["type"]="profile_state";ack["ok"]=ok;
    ack["profile"]=profiles.active();ack["layer"]=profiles.layer();padlink.send(ack);
  }
  else if (type == "rearm_request" && padlink.secureReady()) {
    killSwitch.request(true, millis()); rearmTransport=padlink.active(); showKillState();
  } else if (type == "rearm_complete") {
    uint32_t now=millis();
    bool online=padlink.secureReady() && !padlink.blePairing && rearmTransport==padlink.active();
    if(killSwitch.canComplete(now,online))killSwitch.complete(now,online,persistKill(false));
    showKillState();
  } else if(type=="keymap") {
    uint32_t previousRevision=keymapRevision;
    bool ok=applyKeymap(d);
    JsonDocument ack;ack["type"]="keymap_state";ack["revision"]=d["revision"];ack["ok"]=ok;padlink.send(ack);
    if(ok && (!keymapShown || previousRevision!=keymapRevision)){
      int i=0;for(int r=0;r<4;r++)for(int c=0;c<4;c++)if(liveKeys[r][c].role!=ROLE_NONE)pad.keyLabels[i++]=accessibility.key(r,c).label;
      pad.keymapUntil=millis()+4000;keymapShown=true;
    }
  } else if(type=="status") {
    pad.ok=true;pad.armed=!killSwitch.killed && (d["armed"] | false);pad.autoAccept=!killSwitch.killed && (d["autoAccept"] | false);
    pad.market=d["market"].as<String>();pad.agent=d["agent"].as<String>();pad.venue=d["venue"].as<String>();pad.link=padlink.name();
    if(d["remembers"].is<bool>())pad.remembers=d["remembers"];
  } else if(type=="signal") {
    if(killSwitch.killed)return;
    if(padlink.secureReady() && !decisionConfirm.offer(d,padlink.connectionEpoch())) {
      pad.pending=false;pad.errorCode="QUOTE_REQUIRED";pad.errorFix="Refresh the executable quote";return;
    }
    pad.holdRequired=decisionConfirm.needsHold();
    pad.signalId=d["signalId"].as<String>();pad.signalState="awaiting";
    pad.signalDeadline=millis()+min((uint32_t)86400000,d["remainingMs"].as<uint32_t>());
    pad.pending=d["remainingMs"].as<uint32_t>()>0;pad.market=d["market"].as<String>();
    pad.verdict=d["side"].as<String>()+" $"+String(d["sizeUsd"].as<float>(),2)+" "+d["why"].as<String>();
    pad.venue=d["venue"].as<String>();pad.receiptUntil=0;
  } else if(type=="signal_state") {
    if(d["signalId"].as<String>()==pad.signalId){pad.signalState=d["state"].as<String>();pad.pending=!killSwitch.killed && pad.signalState=="awaiting";}
  } else if(type=="receipt") {
    audio.chime(xorr::Chime::Fill);
    pad.pending=false;pad.receiptSignature=d["signature"].as<String>();pad.receiptExplorer=d["explorer"].as<String>();pad.receiptUntil=millis()+15000;
  } else if(type=="result" && d["ok"]==false) {
    pad.lastKeyLabel=d["error"].as<String>();pad.labelUntil=millis()+5000;
    if(pad.predict.enabled) {pad.errorCode="PREDICT_REQUEST";pad.errorFix=pad.lastKeyLabel;}
  } else if (type == "tts") {
    if (!d["stream"].is<const char*>() || !d["seq"].is<uint32_t>() ||
        !d["end"].is<bool>() || !d["sampleRate"].is<int>()) {playback.reset();return;}
    bool opus=d["codec"]=="opus";
    String codec=d["codec"] | "pcm";
    std::vector<uint8_t> bytes;
    if (!secure::decode(d[opus?"data":"pcm"] | "",bytes,opus?256:512)) {
      playback.reset();return;
    }
    int16_t pcm[xorr::voiceFrame];
    int n=playback.decode(d["stream"].as<std::string>(),d["seq"],codec.c_str(),
        d["sampleRate"],bytes.data(),bytes.size(),d["end"],padlink.active()==PadLink::BLE,pcm);
    if(n>0) audio.writeSpk(pcm,n);
  }

  screenDirty=true;
}

bool sendLinkedKey(const String &action) {
  if(action=="yes" && !tiltGuard.allows(pad) && !presentationLiqVisible(pad)) {screenDirty=true;audio.chime(xorr::Chime::Refuse);return true;}
  if(clearSigning.active && (action=="yes" || action=="no"))return true;
  if((action=="yes" || action=="no") && presentationLiqVisible(pad)) {
    if(!padlink.secureReady())return true;
    JsonDocument d;d["type"]="key";d["id"]=padlink.eventId();d["edge"]="down";
    d["action"]=xorr::liqKey(action=="yes");d["guardId"]=pad.liqGuard.id;padlink.send(d);
    pad.liqGuard.active=false;screenDirty=true;return true;
  }
  if((action=="yes" || action=="no") && !pad.pending && pad.predict.enabled) {
    if(!presentationPredictVisible(pad) || !pad.predict.fresh(millis()) || !padlink.secureReady())return true;
    JsonDocument d;d["type"]="key";d["id"]=padlink.eventId();d["edge"]="down";
    d["action"]=xorr::predictKey(true,false,action=="yes");
    d["market"]=pad.predict.markets[pad.predict.selected].market;padlink.send(d);return true;
  }
  if(action=="yes" && !presentationConfirmationVisible(pad))return true;
  if (action == "yes" && padlink.blePairing)
    return true;
  if(killSwitch.killed && action!="kill")return true;
  if(!padlink.ready())return false;
  JsonDocument d;d["type"]="key";d["id"]=padlink.eventId();d["action"]=action;d["edge"]="down";
  if(action=="yes" && padlink.secureReady())return true; // trusted tap/hold is emitted from loop()
  if(action=="yes" || action=="no") {
    if(!pad.pending || (int32_t)(pad.signalDeadline-millis())<=0)return true;
    d["signalId"]=pad.signalId;
  }
  padlink.send(d);return true;
}

// ── recording ────────────────────────────────────────────────────────────────
void startRecording(uint32_t autoStopMs = 0) {
  if (!recBuf || recording || killSwitch.killed ||
      (!padlink.ready() && !padlink.legacy))
    return;
  // No "select an agent first" gate: the backend always has one holding the
  // baton, so a spoken order is never homeless. Refusing here would invent a
  // rule the backend does not have.
  recEpoch=padlink.connectionEpoch();
  recTransport = padlink.active();
  recStreaming = padlink.ready();
  if (!padlink.newVoice()) {
    pad.lastKeyLabel="Voice codec unavailable";pad.labelUntil=millis()+4000;
    audio.chime(xorr::Chime::Error);return;
  }
  voiceGate.reset();
  for(auto &bar:pad.waveform) bar=0;
  recLen = 0;
  recording = true;
  pad.listening = true;
  screenHoldUntil=0;screenDirty=true;
  recAutoStopAt = autoStopMs ? millis() + autoStopMs : 0;
  ledFromState();
  audio.beep(1200, 70);
  telnet.logf("  ● recording…\n");
}

void stopAndSend() {
  if (!recording)
    return;
  recording = false;
  pad.listening = false;screenDirty=true;
  ledFromState();
  audio.beep(700, 70);
  float secs = (float)recLen / AUDIO_SAMPLE_RATE;
  if (recStreaming) {
    if (padlink.active()==recTransport && !padlink.voice(nullptr,0,true)) {
      pad.lastKeyLabel="Voice congested: retry";pad.labelUntil=millis()+4000;
      audio.chime(xorr::Chime::Error);
    }
    nextPoll = 0;
    return;
  }
  if (recLen < AUDIO_SAMPLE_RATE / 4) { // < 0.25 s
    telnet.logf("  … too short (%.2fs), ignored\n", secs);
    return;
  }
  telnet.logf("  … captured %.1fs, sending\n", secs);
  String heard, said, action;
  bool ok = net.talk(recBuf, recLen, audio, heard, said, action);
  if (ok) {
    telnet.logf("  heard : %s\n  action: %s\n  said  : %s\n", heard.c_str(),
                action.c_str(), said.c_str());
    // A spoken order leaves a decision waiting on a ✓ — the poll will pick it
    // up and the light will start breathing amber on its own.
    nextPoll = 0;
  } else {
    telnet.logf("  ✗ voice request failed (backend at %s?)\n",
                settings.backendUrl);
    audio.chime(xorr::Chime::Error);
  }
}

// ── keys ─────────────────────────────────────────────────────────────────────
// Send one key id and report what came back. A refusal is not a failure: the
// backend says "disarmed" or "not in the allowlist" and the pad says it too,
// out loud, rather than blinking something the operator has to interpret.
void sendKey(const KeyBind &kb) {
  if(killSwitch.killed)return;
  if(kb.role==ROLE_CONFIRM && !tiltGuard.allows(pad) && !presentationLiqVisible(pad)){audio.chime(xorr::Chime::Refuse);return;}
  keyR = kb.r; keyG = kb.g; keyB = kb.b;
  pad.lastKeyLabel=kb.label;pad.labelUntil=millis()+1800;screenDirty=true;
  if(sendLinkedKey(kb.id)){audio.chime(kb.role==ROLE_REFUSE?xorr::Chime::Refuse:xorr::Chime::Accept);return;}
  if(!padlink.legacy){pad.lastKeyLabel="offline: nothing will execute";pad.labelUntil=millis()+4000;return;}
  if((kb.role==ROLE_CONFIRM || kb.role==ROLE_REFUSE) && pad.signalId.length()){
    pad.lastKeyLabel="Signal link offline";pad.labelUntil=millis()+4000;return;
  }
  if(kb.role==ROLE_CONFIRM && !tiltGuard.accept(std::string(padlink.eventId().c_str())))return;
  String err;
  if (net.key(kb.id, err)) {
    telnet.logf("  ▸ %s\n", kb.label);
    audio.chime(xorr::Chime::Accept);
  } else {
    telnet.logf("  ✗ %s refused: %s\n", kb.label, err.c_str());
    audio.chime(xorr::Chime::Error);
    if (err.length()) net.speak(err, audio);
  }
  nextPoll = 0;                       // reflect the new state immediately
}

xorr::PortfolioKey portfolioKey;
uint16_t dismissedKeys=0;
void walletKeyAction(xorr::PortfolioKey::Action action) {
  if(action==xorr::PortfolioKey::None)return;
  if(!sendLinkedKey(action==xorr::PortfolioKey::Fund?"fund":"portfolio")) {
    pad.lastKeyLabel="Connect XOR Desktop to view your wallet";pad.labelUntil=millis()+4000;
  }
  screenDirty=true;
}
void onKey(uint8_t r, uint8_t c, bool pressed) {
  if (factory.active) { factory.key(r,c,pressed); return; }
  if (factoryReset.active) return;
  bool consumed=accessibility.keyEvent(r,c,pressed,pad);
  screen.brightness(accessibility.brightness(millis()));
  screenDirty=true;screenHoldUntil=0;
  if(consumed)return;
  const KeyBind &kb=accessibility.key(r,c);
  const uint16_t bit=uint16_t(1)<<(r*4+c);
  if(!pressed && (dismissedKeys&bit)){dismissedKeys&=~bit;return;}
  bool walletVisible=presentationWalletVisible(pad);
  bool portfolio=kb.id && String(kb.id)=="portfolio";
  if(pressed && walletVisible) {
    bool wasFund=pad.fund.visible;
    if(pad.predict.positionsVisible && padlink.secureReady()) {
      JsonDocument d;d["type"]="key";d["id"]=padlink.eventId();d["action"]="predict:close";d["edge"]="down";padlink.send(d);
    }
    pad.fund.visible=false;pad.portfolio.visible=false;pad.predict.positionsVisible=false;
    portfolioKey.cancel();
    // KILL retains its safety action; other keys only dismiss the wallet card.
    if(kb.role!=ROLE_KILL) {
      if(portfolio && !wasFund)portfolioKey.press(millis(),true);
      else dismissedKeys|=bit;
      return;
    }
  }
  if(pressed && !portfolio)portfolioKey.cancel();
  if(abilities.reviewing() && kb.role!=ROLE_KILL){
    if(kb.role==ROLE_CONFIRM || kb.role==ROLE_REFUSE)abilities.key(kb.role==ROLE_CONFIRM,pressed,pad);
    return;
  }
  if(clearSigning.active && (kb.role==ROLE_CONFIRM || kb.role==ROLE_REFUSE)){
    bool safe=padlink.secureReady() && !padlink.blePairing && !killSwitch.killed && !ota.busy && health.displayUp && millis()>=screenHoldUntil;
    if(kb.role==ROLE_CONFIRM)clearSigning.key(pressed,padlink.connectionEpoch(),safe && tiltGuard.allows(pad) && presentationConfirmationVisible(pad));
    else if(pressed){JsonDocument result;if(clearSigning.answer(false,padlink.connectionEpoch(),safe,pad,result))padlink.send(result);}
    return;
  }
  if (pressed)   // diagnostic: raw position + current mapping, for remapping
    telnet.logf("  [KEY] row=%u col=%u  = %s\n", r, c, kb.label ? kb.label : "unbound");

  if(kb.role==ROLE_KILL) { killSwitch.killKey(pressed,millis()); return; }
  if(kb.role==ROLE_CONFIRM) {
    killSwitch.confirmKey(pressed,millis(),padlink.secureReady() && !padlink.blePairing);
    if(killSwitch.killed)return;
    decisionConfirm.key(pressed,tiltGuard.allows(pad) && presentationConfirmationVisible(pad) && !pad.clearSigning && padlink.secureReady() &&
      !padlink.blePairing && millis()>=screenHoldUntil,millis());
    if(pressed && pad.pending && padlink.secureReady() && !padlink.blePairing && accessibility.speakAmounts() && !amountSpoken) {
      amountSpoken=true;JsonDocument d;d["type"]="speak_amount";d["signalId"]=pad.signalId;padlink.send(d);
    }
  }
  if(killSwitch.killed)return;
  if(kb.role==ROLE_REFUSE && pressed)decisionConfirm.reset();
  if(portfolio) {
    if(pressed && pad.tiltBlocked){pad.pending=false;decisionConfirm.reset();}
    if(pressed)portfolioKey.press(millis());
    else walletKeyAction(portfolioKey.release(millis()));
    return;
  }
  if(pressed && kb.id) {
    String action=kb.id;
    if(action=="profile:next") {profiles.next(pad.pending || recording);return;}
    if(action=="layer:next") {profiles.nextLayer(pad.pending || recording);return;}
    if(action=="voice") {profiles.voice=!profiles.voice;return;}
  }
  switch (kb.role) {
    case ROLE_MIC:
      if (pressed) startRecording(); else stopAndSend();
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
  if (XORR_RELEASE && !usbDebugAllowed()) return;
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
    if(id=="kill") { latchKill(); return; }
    if(killSwitch.killed) { telnet.println("Kill latch active"); return; }
    String control=id;control.toLowerCase();
    if(control=="yes" && (tiltGuard.blocked() || !tiltGuard.accept(std::string(padlink.eventId().c_str())))){
      telnet.println("Tilt guard: new trade approval refused");return;
    }
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
  telnet.debugAllowed = usbDebugAllowed;
  if (XORR_RELEASE) esp_log_level_set("*", ESP_LOG_NONE);
  Serial.begin(115200);
  uint32_t s = millis(); while (!Serial && millis() - s < 1200) {}
  led(0, 0, 60);                        // blue = booting

  matrix.begin();
  factory.boot();
  Preferences safety;
  bool safetyOK=safety.begin("xorrsafety",false);
  bool readable=safetyOK && (!safety.isKey("killed") || safety.getType("killed")==PT_U8);
  killSwitch.restore(readable?safety.getUChar("killed",0):1,readable);
  if(safetyOK)safety.end();
  showKillState();
  tiltGuard.begin();tiltGuard.update(pad);
  clearSigning.authorize=[&](const std::string &id){return tiltGuard.accept(id);};
  ota.begin();
  loadKeymap();
  profiles.begin();
  knob.begin();
  accessibility.begin();
  pad.highContrast=accessibility.highContrast();
  health.begin(screen.begin());                       // shows the test card while WiFi comes up
  screen.brightness(accessibility.brightness(millis()));
  screenHoldUntil = millis() + 3000;
  bool audioOK = audio.begin();
  factory.hardware(health.displayUp, audioOK);
  if (!audioOK) if (!XORR_RELEASE) Serial.println("!! audio init failed");
  recBuf = (int16_t *)ps_malloc(REC_CAP * sizeof(int16_t));
  if (!recBuf) if (!XORR_RELEASE) Serial.println("!! PSRAM alloc failed — enable Tools → PSRAM: OPI PSRAM");

  settings.load();
  net.begin(&settings, &padlink.legacy);
  padlink.begin(&settings,onPadMessage);
  if (factory.active) { WiFi.mode(WIFI_STA); return; }
  abilities.begin();
  priceAlerts.begin();
  clearSigning.deviceSigner=[](const uint8_t *hash,size_t n){return std::string(padlink.identity.sign(String(reinterpret_cast<const char*>(hash),n)).c_str());};
  if (!XORR_RELEASE) Serial.printf("xorrpad firmware %s\n",XORR_FW_VERSION);

  bool forcePortal = talkKeyHeldAtBoot();
  if (forcePortal) {
    if (!XORR_RELEASE) Serial.println("K1 held → re-provisioning");
    provision.resetWifi();
    led(60, 0, 60);                     // magenta = portal
  } else {
    led(0, 40, 40);                     // cyan = connecting / portal
  }

  if (!XORR_RELEASE) Serial.printf("provisioning… (join \"%s\" if the portal opens)\n", PORTAL_AP_NAME);
  bool up = provision.run(settings);    // portal stays available while USB/BLE work

  if (!up) {
    if (!XORR_RELEASE) Serial.println("!! WiFi not connected");
    ledFromState();
    return;                             // loop() will still scan keys / poll
  }

  if (!XORR_RELEASE) Serial.printf("WiFi up: %s\n", WiFi.localIP().toString().c_str());
  if (!XORR_RELEASE) { telnet.begin(TELNET_PORT);telnetStarted=true; }
  telnet.onCommand(onTelnetCommand);
  if (!XORR_RELEASE) Serial.printf("telnet:  telnet %s %u\n", WiFi.localIP().toString().c_str(), TELNET_PORT);
  if (!XORR_RELEASE) Serial.printf("backend: %s  (token %s)\n", settings.backendUrl, settings.padToken[0] ? "set" : "none");

  // Announce we're up — through the amp, from the backend's own TTS, and say
  // something true rather than a generic chime: whether it is armed, and what
  // it still remembers. A pad that says "connected" while the store is wiped
  // has told the operator nothing they needed.
  if (!killSwitch.killed && net.pad(pad)) {
    if (!XORR_RELEASE) Serial.printf("backend ok (%s, %s)\n", pad.mode.c_str(), pad.armed ? "armed" : "stopped");
    String hello = String("xorr pad connected. ") +
                   (pad.armed ? "Armed, " : "Trading is stopped, ") +
                   pad.market + " in hand." +
                   (pad.remembers ? "" : " Memory is wiped — it will refuse anything but the smallest trade.");
    if (!net.speak(hello, audio)) audio.beep(1320, 120);
  } else {
    if (!XORR_RELEASE) Serial.println("!! backend not reachable — check the URL in the portal (reset-wifi to change)");
    audio.beep(880, 60); audio.beep(660, 120);   // fell-back chime
  }
  ledFromState();
  if (!XORR_RELEASE) Serial.println("Ready. An agent or market key sets the hand; BUY/SELL propose; ✓ executes.");
}

// Reset is physical only. Suspend input/network work throughout the countdown.
bool serviceFactoryReset() {
  static bool failed = false;
  bool due = factoryReset.tick(Factory::resetHeld(), millis());
  if (!factoryReset.active && !failed) return false;
  accessibility.idle.wake(millis());screen.brightness(accessibility.brightness(millis()));
  matrix.scan(nullptr); // Consume chord edges without dispatching actions.
  if (esp_task_wdt_status(nullptr) == ESP_OK) esp_task_wdt_reset();
  padlink.stopInputs();
  recording = recStreaming = pad.listening = false;
  pad.pending = pad.armed = pad.autoAccept = false; pad.signalId = "";
  killSwitch.confirmKey(false,millis(),false);
  PadState reset;
  reset.factory = true;
  reset.factoryInstruction = failed ? "RESET FAILED - keep unit offline; reboot and retry"
      : "Hold 01+13: " + String(factoryReset.remaining(millis())) + "s; release to cancel";
  screen.draw(reset, chartNow);
  rgbLedWrite(STATUS_LED, 64, 20, 0);
  if (due && !failed) {
    WiFi.disconnect(true, true);
    WiFi.mode(WIFI_OFF);
    NimBLEDevice::deinit(true);
    nvs_flash_deinit_partition("profiles");
    nvs_flash_deinit();
    esp_err_t profilesErased = nvs_flash_erase_partition("profiles");
    esp_err_t nvsErased = nvs_flash_erase();
    if (profilesErased == ESP_OK && nvsErased == ESP_OK) ESP.restart();
    failed = true; // Never resume trade inputs or claim success after a failed wipe.
  }
  return true;
}

void loop() {
  telnet.usbDebug = usbDebugAllowed();
  if (!factory.active && serviceFactoryReset()) { delay(1); return; }
  if (factory.active) {
    matrix.scan(onKey);
    auto event = knob.tick();
    padlink.tick();
    health.keysScanned = true;
    health.tick(padlink);
    factory.tick(padlink, audio, event == Knob::Turn, event == Knob::Click);
    PadState test;
    test.factory = true; test.factoryInstruction = factory.instruction;
    test.factoryStage = factory.currentStage(); test.factoryMic = factory.micLevel();
    static uint32_t drawAt = 0;
    if (millis() - drawAt >= 100) { drawAt = millis(); screen.draw(test, chartNow); }
    delay(1); return;
  }

  health.tick(padlink);
  ota.health(health.displayUp,health.keysScanned,padlink.secureReady());
  if(rebootAt && (int32_t)(millis()-rebootAt)>=0 && padlink.idle())ESP.restart();
  padlink.killed = killSwitch.killed;
  provision.poll();padlink.tick();
  if(killSwitch.killDue(millis()))latchKill();
  if(killSwitch.tick(millis(),padlink.secureReady() && !padlink.blePairing && rearmTransport==padlink.active())) {
    JsonDocument d; d["type"]="rearm_confirm"; d["heldMs"]=800; padlink.send(d);
  }
  showKillState();
  tiltGuard.tick(padlink,pad);
  static bool wasCooling=false;
  if(pad.tiltBlocked && !wasCooling){accessibility.idle.wake(millis());screenHoldUntil=0;screenDirty=true;audio.chime(xorr::Chime::Refuse);}
  wasCooling=pad.tiltBlocked;
  profiles.refresh(pad.pending || recording);
  pad.profile=profiles.name();pad.layer=profiles.layerName();
  static String reportedProfile;static uint32_t profileEpoch=0;
  String profileState=pad.profile+"/"+pad.layer;
  if(padlink.secureReady() && (profileState!=reportedProfile || profileEpoch!=padlink.connectionEpoch())) {
    reportedProfile=profileState;profileEpoch=padlink.connectionEpoch();
    JsonDocument d;d["type"]="profile_state";d["ok"]=true;d["profile"]=profiles.active();d["layer"]=profiles.layer();padlink.send(d);
  }
  pad.highContrast=accessibility.highContrast();
  screen.brightness(accessibility.brightness(millis()));
  auto event=knob.tick();
  bool wakeKnob=event!=Knob::None && accessibility.idle.blank(millis());
  if(event!=Knob::None){accessibility.idle.wake(millis());screen.brightness(accessibility.brightness(millis()));screenDirty=true;}
  if(wakeKnob && event!=Knob::TalkEnd)event=Knob::None;
  if(clearSigning.active && pad.pending && event==Knob::Turn){clearSigning.page(knob.delta,pad);event=Knob::None;}
  if(event==Knob::TalkStart)startRecording();
  else if(event==Knob::TalkEnd)stopAndSend();
  else if(event==Knob::Click) {
    knobControl.cycle();pad.lastKeyLabel=String(knobControl.name())+" "+String(knobControl.values[knobControl.mode],0);pad.labelUntil=millis()+1800;
  }
  else if(event==Knob::Turn) {
    if(profiles.voice){audio.volume=xorr::voiceVolume(audio.volume,knob.delta);pad.lastKeyLabel="Volume "+String(audio.volume)+"%";pad.labelUntil=millis()+1800;}
    else if(presentationPredictVisible(pad)) {
      pad.predict.scroll(knob.delta);pad.labelUntil=0;
      JsonDocument d;d["type"]="knob";d["id"]=padlink.eventId();d["mode"]="predict";d["delta"]=knob.delta;padlink.send(d);
    }
    else if(!killSwitch.killed && padlink.ready() && !pad.pending && !recording) {
      double value=knobControl.turn(knob.delta,millis());
      pad.lastKeyLabel=String(knobControl.name())+" "+String(value,0);pad.labelUntil=millis()+1800;
      JsonDocument d;d["type"]="knob";d["id"]=padlink.eventId();
      d["mode"]=knobControl.name();d["value"]=value;d["sizeUsd"]=knobControl.values[0];padlink.send(d);
    }
  }
  pad.knobMode=knobControl.name();pad.knobValue=knobControl.values[knobControl.mode];
  pad.pairCode = padlink.secureReady() && !padlink.blePairing ? "" : padlink.identity.code;
  pad.pairQr = padlink.identity.qr();
  if(!XORR_RELEASE && WiFi.isConnected() && !telnetStarted){telnet.begin(TELNET_PORT);telnet.onCommand(onTelnetCommand);telnetStarted=true;}
  static uint32_t tickScreen=0;
  if(millis()-tickScreen>=250){tickScreen=millis();screenDirty=true;}
  if(pad.pending && pad.signalId.length() && (int32_t)(pad.signalDeadline-millis())<=0){pad.pending=false;pad.signalState="expired";}
  if(!padlink.ready() && !padlink.legacy)pad.ok=false;
  {JsonDocument result;
    bool safe=padlink.secureReady() && !padlink.blePairing && !killSwitch.killed && !ota.busy && health.displayUp && millis()>=screenHoldUntil;
    if(clearSigning.tick(padlink.connectionEpoch(),safe,presentationConfirmationVisible(pad),pad,result)){padlink.send(result);audio.chime(xorr::Chime::Accept);}
  }
  bool decisionVisible=tiltGuard.allows(pad) && presentationConfirmationVisible(pad) && !pad.clearSigning && padlink.secureReady() &&
    !padlink.blePairing && millis()>=screenHoldUntil;
  if(!pad.clearSigning)pad.holdProgress=decisionConfirm.progress(millis());
  if(decisionConfirm.due(decisionVisible,padlink.connectionEpoch(),millis())) {
    if(!tiltGuard.accept(decisionConfirm.signal().id)){decisionConfirm.reset();screenDirty=true;return;}
    JsonDocument d;d["type"]="key";d["id"]=padlink.eventId();d["action"]="yes";d["edge"]="down";
    d["signalId"]=decisionConfirm.signal().id;d["fingerprint"]=xorr::fingerprint(decisionConfirm.signal());
    d["heldMs"]=decisionConfirm.heldMs(millis());padlink.send(d);
  }
  int abilityChime=-1;
  abilities.tick(padlink.connectionEpoch(),padlink.secureReady(),health.displayUp && !padlink.blePairing && !accessibility.idle.blank(millis()) && !killSwitch.killed && !ota.busy && !pad.pending && !recording && !pad.listening && !clearSigning.active && !pad.errorCode.length() && !pad.pairCode.length() && !killSwitch.requested,pad,abilityChime);
  if(abilityChime>=0)audio.chime(abilityChime?xorr::Chime::Fill:xorr::Chime::Accept);
  matrix.scan(onKey);
  if(killSwitch.killed || ota.busy || pad.pending || recording || !padlink.ready())portfolioKey.cancel();
  else walletKeyAction(portfolioKey.tick(millis()));
  health.keysScanned=true;
  telnet.poll();

  // One cheap poll a second keeps the light honest — armed, waiting on a ✓,
  // or forgotten. Skipped while recording so the mic never stutters.
  if (!killSwitch.killed && !recording && !padlink.ready() && WiFi.isConnected() && millis() >= nextPoll) {
    nextPoll = millis() + PAD_POLL_MS;
    PadState fresh;
    if (net.pad(fresh)) {fresh.highContrast=accessibility.highContrast();pad = fresh;} else pad.ok = false;
    screenDirty = true;
  }
  if(priceAlerts.tick(padlink.ready() || (padlink.legacy && pad.ok),WiFi.isConnected(),
      !killSwitch.killed && !ota.busy && !recording && !pad.pending && !clearSigning.active,pad)){
    accessibility.idle.wake(millis());audio.chime(xorr::Chime::Fill);screenDirty=true;
  }
  ledFromState();

  // The display pod. The chart is hourly candles, so it is fetched once a
  // minute — or at once when the market in hand changes — while the screen
  // redraws after every poll so the price and the state stay live.
  if (!recording && WiFi.isConnected() && !pad.alertsOnly && !pad.pending && millis() >= nextChart) {
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
  if (screenDirty && millis() >= screenHoldUntil) {
    screenDirty = false;
    screen.draw(pad, chartNow);
    abilities.shown(health.displayUp && !accessibility.idle.blank(millis()) && pad.abilityReview && !pad.killed && !pad.updating && !pad.errorCode.length() && !pad.pairCode.length());
    if(health.displayUp && presentationConfirmationVisible(pad))clearSigning.shown(pad);
  }

  if (recording && recBuf) {
    int16_t block[256];
    size_t n = audio.readMic(block, 256);
    if(recStreaming && (!padlink.ready() || padlink.active()!=recTransport || padlink.connectionEpoch()!=recEpoch)) {
      recording=pad.listening=false;pad.lastKeyLabel="Voice link lost";
      pad.labelUntil=millis()+4000;screenDirty=true;playback.reset();return;
    }
    int level=voiceGate.process(block,n);
    for(int i=0;i<31;++i) pad.waveform[i]=pad.waveform[i+1];
    pad.waveform[31]=level;
    if(recStreaming && n && !padlink.voice(block,n,false)) {
      recording=pad.listening=false;pad.lastKeyLabel="Voice congested: retry";
      pad.labelUntil=millis()+4000;screenDirty=true;audio.chime(xorr::Chime::Error);return;
    }
    for (size_t i = 0; i < n && recLen < REC_CAP; i++) recBuf[recLen++] = block[i];
    if (recLen >= REC_CAP) { telnet.logf("  (max length)\n"); stopAndSend(); }
    else if (recAutoStopAt && millis() >= recAutoStopAt) stopAndSend();
  }
}
