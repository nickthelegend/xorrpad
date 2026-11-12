#pragma once
#include <WiFi.h>
#include <WiFiManager.h>   // Library Manager: "WiFiManager" by tzapu
#include "config.h"
#include "settings.h"

// Captive-portal provisioning.
//
// On boot we try the saved Wi-Fi. If there's none (first run) or it won't join,
// the pad raises the "xorr-pad-setup" access point and serves a portal: connect
// a phone or laptop to it and a page pops up listing the networks around you,
// plus fields for the xorr-pad backend URL and the pad token. Save, and the pad
// joins your Wi-Fi and remembers everything in flash — so this happens once, or
// after the reset gesture.
//
// The backend URL is CHECKED before it is written. A pad that cheerfully saves
// "192.168.1.5" without a scheme, or a typo'd host, boots into a state where
// every request fails and the only symptom is a light that never goes green —
// with the portal already closed and no way in but the reset gesture.
class Provision {
public:
  // Starts the portal without blocking USB/BLE; poll() services it in loop().
  bool run(Settings &s) {
    _settings=&s;
    _wm.setDebugOutput(false);
    _url=new WiFiManagerParameter("url", "Backend URL (http://LAN:port or https://machine.ts.net)",s.backendUrl,120);
    _token=new WiFiManagerParameter("token", "Pad token",s.padToken,90);
    _wm.setTitle("xorr-pad");
    _wm.addParameter(_url);
    _wm.addParameter(_token);
    _wm.setConfigPortalBlocking(false);
    _wm.setSaveParamsCallback([this](){ saveParams(); });
    _wm.setConnectTimeout(1);
    _wm.setConfigPortalTimeout(0);          // stay open until configured
    _wm.setBreakAfterConfig(true);

    bool ok = strlen(PORTAL_AP_PASS)
                ? _wm.autoConnect(PORTAL_AP_NAME, PORTAL_AP_PASS)
                : _wm.autoConnect(PORTAL_AP_NAME);

    return ok && WiFi.status() == WL_CONNECTED;
  }

  void poll() { _wm.process(); }

  // Wipe the saved Wi-Fi so the next boot re-opens the portal.
  void resetWifi() { _wm.resetSettings(); }

  /**
   * Is this something the firmware can actually reach?
   *
   * Deliberately strict about the two mistakes that produce a silently dead
   * pad: a missing scheme (the HTTP client needs one to pick a transport) and
   * an empty host. Everything past the host is the backend's problem, not ours.
   */
  static bool validUrl(const char *u) {
    if (!u || !*u) return false;
    String s(u);
    s.trim();
    const bool http  = s.startsWith("http://");
    const bool https = s.startsWith("https://");
    if (!http && !https) return false;              // no scheme → no transport
    String host = s.substring(http ? 7 : 8);
    int slash = host.indexOf('/');
    if (slash >= 0) host = host.substring(0, slash);
    if (!host.length()) return false;               // "http://" and nothing else
    int colon = host.indexOf(':');
    if (colon == 0) return false;                   // "http://:8080"
    if (colon > 0) {                                // a port, if present, is digits
      String port = host.substring(colon + 1);
      if (!port.length()) return false;
      for (size_t i = 0; i < port.length(); i++) if (!isdigit(port[i])) return false;
      host = host.substring(0, colon);
    }
    // A host has to contain something host-shaped, not a space or a stray quote.
    for (size_t i = 0; i < host.length(); i++) {
      char c = host[i];
      if (!(isalnum(c) || c == '.' || c == '-' || c == '_')) return false;
    }
    return true;
  }

private:
  WiFiManager _wm;
  Settings *_settings=nullptr;
  WiFiManagerParameter *_url=nullptr,*_token=nullptr;
  void saveParams() {
    const char *given=_url->getValue();
    _settings->set(validUrl(given) ? given : _settings->backendUrl,_token->getValue());
  }
};
