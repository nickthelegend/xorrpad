#pragma once
#include "safety.h"
namespace xorr {
// NVS contains only the latch byte. A desk request/physical consent never
// survives a reboot, a link loss, another kill, or the 15-second window.
class KillSwitch {
  Hold killTimer, consentTimer;
  bool confirmDown = false, confirmed = false;
  uint32_t requestedAt = 0;
public:
  bool killed = false, requested = false;
  void cancelRearm() {
    requested = confirmed = false;
    consentTimer.release();
  }
  void restore(uint8_t saved, bool storageOK) {
    killed = !storageOK || saved != 0;
    cancelRearm();
  }
  uint8_t saved() const { return killed ? 1 : 0; }
  void kill() { killed = true; cancelRearm(); }
  void killKey(bool down, uint32_t now) {
    if (down) killTimer.press(now); else killTimer.release();
  }
  bool killDue(uint32_t now) { return killTimer.ready(now, 2000); }
  void request(bool online, uint32_t now) {
    cancelRearm();
    requested = killed && online;
    requestedAt = now;
  }
  void confirmKey(bool down, uint32_t now, bool online) {
    bool rising = down && !confirmDown;
    confirmDown = down;
    if (!down) consentTimer.release();
    else if (rising && requested && online) consentTimer.press(now);
  }
  bool window(uint32_t now, bool online) const {
    return killed && requested && online && uint32_t(now - requestedAt) < 15000;
  }
  bool tick(uint32_t now, bool online) {
    if (!window(now, online)) { cancelRearm(); return false; }
    if (!consentTimer.ready(now)) return false;
    confirmed = true;
    return true;
  }
  float progress(uint32_t now) const { return consentTimer.progress(now); }
  bool canComplete(uint32_t now, bool online) const {
    return window(now, online) && confirmed;
  }
  bool complete(uint32_t now, bool online, bool persisted) {
    if (!canComplete(now, online)) return false;
    if (!persisted) { kill(); return false; }
    killed = false;
    cancelRearm();
    return true;
  }
};
}
