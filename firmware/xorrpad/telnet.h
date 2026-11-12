#pragma once
#include <Arduino.h>
#include "config.h"
#if !XORR_RELEASE
#include <WiFi.h>
#endif

// A tiny telnet server: mirror every log line to a connected client, and accept
// one-line commands back. Lets you watch the pad and drive it over WiFi with
// plain `telnet <ip>` — no USB cable, which the S3's flaky CDC makes precious.
class Telnet {
public:
  bool usbDebug=false;
  bool (*debugAllowed)() = nullptr;
  typedef void (*CmdHandler)(const String &line);

  void begin(uint16_t port) {
#if !XORR_RELEASE
    if (!_server) _server = new WiFiServer(port); // heap so the port comes from NVS
    _server->begin();
    _server->setNoDelay(true);
#else
    (void)port;
#endif
  }
  void onCommand(CmdHandler cb) {
#if !XORR_RELEASE
    _cb = cb;
#else
    (void)cb;
#endif
  }

  void poll() {
#if !XORR_RELEASE
    if (!_server) return;
    if (_server->hasClient()) {
      WiFiClient nc = _server->accept();   // (was available(); renamed in core 3.x)
      if (_client && _client.connected()) {
        nc.println("busy — a client is already attached");
        nc.stop();
      } else {
        _client = nc;
        _client.setNoDelay(true);
        _client.print("\r\norchestrator-pad · type 'help'\r\n> ");
      }
    }
    if (_client && _client.connected()) {
      while (_client.available()) {
        char ch = _client.read();
        if (ch == '\r') continue;
        if (ch == '\n') {
          String line = _line;
          _line = "";
          line.trim();
          if (line.length() && _cb) _cb(line);
          if (_client && _client.connected()) _client.print("> ");
        } else if (_line.length() < 220) {
          _line += ch;
        }
      }
    }
#endif
  }

  void logf(const char *fmt, ...) {
    if(XORR_RELEASE && (!usbDebug || !debugAllowed || !debugAllowed()))return;
    char buf[256];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    Serial.print(buf);
#if !XORR_RELEASE
    if (_client && _client.connected()) _client.print(buf);
#endif
  }
  void println(const String &s) {
    if(XORR_RELEASE && (!usbDebug || !debugAllowed || !debugAllowed()))return;
    Serial.println(s);
#if !XORR_RELEASE
    if (_client && _client.connected()) _client.println(s);
#endif
  }

private:
#if !XORR_RELEASE
  WiFiServer *_server = nullptr;
  WiFiClient _client;
  String _line;
  CmdHandler _cb = nullptr;
#endif
};
