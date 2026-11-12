#pragma once
#include "audio.h"
#include "link.h"
#include "matrix.h"
#include "logic/factory.h"
#include <nvs_flash.h>
class Factory {
  xorr::FactoryProgress progress;
  xorr::FactoryProgress::Stage previous = xorr::FactoryProgress::Done;
  bool displayOK = false, audioOK = false, scanStarted = false;
  uint32_t reportAt = 0;
  String reportLine;
public:
  bool active = false, reported = false;
  String instruction;
  static bool raw(int number) {
    for (int r = 0; r < 4; ++r) for (int c = 0; c < 4; ++c) {
      if (xorr::cell(r, c) != number - 1) continue;
      digitalWrite(COL_PINS[c], LOW); delayMicroseconds(20);
      bool down = digitalRead(ROW_PINS[r]) == LOW;
      digitalWrite(COL_PINS[c], HIGH); return down;
    }
    return false;
  }
  void boot() {
    active = xorr::FactoryProgress::chord(raw(1), raw(14));
    if (active) progress.begin(millis());
  }
  static bool resetHeld() { return xorr::FactoryProgress::chord(raw(1), raw(13)); }
  void hardware(bool display, bool audio) { displayOK = display; audioOK = audio; }
  void key(int r, int c, bool down) { progress.key(r, c, down, millis()); }
  int currentStage() const { return progress.stage; }
  int micLevel() const { return min(100, int(progress.micLevel / 80)); }
  void tick(PadLink &link, Audio &audio, bool turn, bool press) {
    using P = xorr::FactoryProgress;
    link.factoryProvisioning = active;
    if (!active) return;
    if (reported) {
      // Reopening USB CDC must not lose the signed unit result.
      if (Serial && millis() - reportAt >= 2000) { Serial.print(reportLine); reportAt = millis(); }
      return;
    }
    progress.knob(turn, press, millis());
    if (progress.stage == P::Mic && audioOK) {
      int16_t samples[256]; size_t n = audio.readMic(samples, 256);
      progress.level(xorr::energy(samples, n), millis());
    }
    if (progress.stage != previous) {
      previous = progress.stage;
      if (previous == P::Speaker && audioOK)
        for (int f = 300; f <= 1800; f += 300) audio.beep(f, 80);
      if (previous == P::Radio) {
        WiFi.mode(WIFI_STA);
        scanStarted = WiFi.scanNetworks(true) != WIFI_SCAN_FAILED;
      }
    }
    switch (progress.stage) {
    case P::Keys: instruction = "Release boot keys; press all 14 keys"; break;
    case P::Knob: instruction = "Turn knob, then press it"; break;
    case P::Mic: instruction = "Speak into mic; level must exceed 600"; break;
    case P::Speaker: instruction = "Heard sweep? YES pass / NO fail"; break;
    case P::Tft: instruction = "Inspect bars/grid: YES pass / NO fail"; break;
    case P::Led: {
      instruction = "Observe red/green/blue: YES pass / NO fail";
      int phase = ((millis() - progress.stageAt) / 500) % 3;
      rgbLedWrite(STATUS_LED, phase == 0 ? 64 : 0, phase == 1 ? 64 : 0, phase == 2 ? 64 : 0);
      break;
    }
    case P::Radio: {
      instruction = "Wi-Fi scan / BLE advertising";
      int n = WiFi.scanComplete();
      auto *ad = NimBLEDevice::getAdvertising();
      progress.radio(scanStarted && n >= 0, ad && ad->isAdvertising(), millis());
      break;
    }
    case P::Done: break;
    }
    if (progress.stage != P::Done && !progress.expired(millis())) return;
    WiFi.scanDelete();
    JsonDocument result;
    result["serial"] = link.identity.device; result["fw"] = XORR_FW_VERSION;
    result["keys"] = progress.keys == 0x3fff;
    result["knob"] = progress.turned && progress.pressed;
    result["mic"] = audioOK && progress.mic; result["speaker"] = audioOK && progress.speaker;
    result["tft"] = displayOK && progress.tft; result["led"] = progress.led;
    result["wifi"] = progress.wifi; result["ble"] = progress.ble;
    bool pass = link.identity.ok && displayOK && audioOK && progress.pass();
    result["pass"] = pass;
    String payload; serializeJson(result, payload);
    JsonDocument frame; frame["v"] = 2; frame["type"] = "factory_result";
    frame["payload"] = payload; frame["pk"] = link.identity.ok ? secure::hex(link.identity.epub, 32) : "";
    frame["signature"] = link.identity.ok ? link.identity.sign(payload) : "";
    if (link.secureReady()) link.send(frame);
    reportLine = secure::line(frame, true); Serial.print(reportLine); reportAt = millis();
    instruction = pass ? "PASS - signed report sent; reset to exit" : "FAIL - inspect signed report; reset to exit";
    rgbLedWrite(STATUS_LED, pass ? 0 : 64, pass ? 64 : 0, 0); reported = true;
  }
};
