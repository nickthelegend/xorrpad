#pragma once
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include "config.h"
#include "settings.h"
#include "audio.h"
#include "certs.h"

#include "padstate.h"

// Talks to the xorr-pad backend — the Mac's LAN IP over plain HTTP, or a
// Tailscale Funnel URL over HTTPS. The backend runs the gate, signs the swaps
// and does STT → brain → TTS, handing back raw 16 kHz PCM with a Content-Length
// that we stream straight to the amp as it downloads.
//
// Transport is chosen per request from the saved URL's scheme (settings.secure()):
// https → WiFiClientSecure pinned to ISRG Root X1 (certs.h); http → WiFiClient.
// When a pad token is set it rides on every request as a Bearer header.
class Net {
public:
  void begin(Settings *s) { _s = s; }
  bool wifiUp() { return WiFi.status() == WL_CONNECTED; }

  // GET /pad — one cheap poll carrying everything the LED and the caps need.
  // Deliberately does not touch the chain on the server side, so a Base hiccup
  // dims nothing here.
  bool pad(PadState &st) {
    HTTPClient http; WiFiClient plain; WiFiClientSecure tls;
    if (!beginReq(http, plain, tls, url("/pad"))) return false;
    auth(http);
    http.setTimeout(8000);
    int code = http.GET();
    if (code != 200) { http.end(); return false; }
    String b = http.getString();
    http.end();

    st.ok        = true;
    st.armed     = jsonBool(b, "armed");
    st.pending   = jsonBool(b, "pending");
    st.chainOk   = jsonBool(b, "chainOk");
    st.remembers = jsonBool(b, "remembers");
    st.agent     = jsonStr(b, "agent");
    st.market    = jsonStr(b, "market");
    st.mode      = jsonStr(b, "mode");
    st.verdict   = jsonStr(b, "verdict");
    st.price      = jsonNum(b, "price", 0);
    st.spentToday = (int)jsonNum(b, "spentToday", -1);
    st.dayLimit   = (int)jsonNum(b, "dayLimit", -1);
    st.hasPnl     = hasField(b, "unrealised") && !jsonNull(b, "unrealised");
    st.unrealised = st.hasPnl ? jsonNum(b, "unrealised", 0) : 0;
    st.chain      = jsonStr(b, "chain");
    st.venue      = jsonStr(b, "venue");
    st.hoursState = jsonStr(b, "hoursState");
    st.hoursNote  = jsonStr(b, "hoursNote");
    st.nyTime     = jsonStr(b, "nyTime");
    st.marketOpen = jsonBool(b, "marketOpen");
    return true;
  }

  // GET /pad/chart — flat JSON with one numeric array, parsed by hand like /pad.
  bool chart(ChartState &st) {
    HTTPClient http; WiFiClient plain; WiFiClientSecure tls;
    if (!beginReq(http, plain, tls, url("/pad/chart"))) return false;
    auth(http);
    http.setTimeout(8000);
    int code = http.GET();
    if (code != 200) { http.end(); return false; }
    String b = http.getString();
    http.end();

    st.ok        = true;
    st.symbol    = jsonStr(b, "symbol");
    st.error     = jsonStr(b, "error");
    st.price     = jsonNum(b, "price", 0);
    st.hasChange = hasField(b, "change24h") && !jsonNull(b, "change24h");
    st.change24h = st.hasChange ? jsonNum(b, "change24h", 0) : 0;
    st.hi        = jsonNum(b, "hi", 0);
    st.lo        = jsonNum(b, "lo", 0);
    st.n = 0;
    int at = b.indexOf("\"closes\":[");
    if (at >= 0) {
      const char *p = b.c_str() + at + 10;
      while (*p && *p != ']' && st.n < sizeof(st.closes) / sizeof(st.closes[0])) {
        char *end;
        float v = strtof(p, &end);
        if (end == p) break;
        st.closes[st.n++] = v;
        p = end;
        while (*p == ',' || *p == ' ') p++;
      }
    }
    return true;
  }

  // POST /key {id} — the whole deck goes through one route. `err` carries the
  // backend's own refusal so the pad can show it rather than inventing one.
  bool key(const String &id, String &err) {
    HTTPClient http; WiFiClient plain; WiFiClientSecure tls;
    if (!beginReq(http, plain, tls, url("/key"))) { err = "no route to the backend"; return false; }
    auth(http);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(45000);          // a ✓ signs and waits for a mine
    int code = http.POST(String("{\"id\":\"") + id + "\"}");
    String body = (code > 0) ? http.getString() : String();
    http.end();
    if (code != 200) { err = code > 0 ? ("backend said " + String(code)) : "no answer"; return false; }
    // 200 with ok:false is a refusal, not a failure — "disarmed", "nothing
    // pending", "not in the allowlist". Hand the words straight through.
    if (body.indexOf("\"ok\":false") >= 0) { err = jsonStr(body, "error"); return false; }
    return true;
  }

  // POST /voice (raw PCM) → stream the spoken reply to the amp. There is no
  // agent query: the backend already knows who holds the baton, and a pad that
  // second-guessed it could trade through the wrong one.
  bool talk(const int16_t *pcm, size_t samples,
            Audio &audio, String &transcript, String &reply, String &action) {
    HTTPClient http; WiFiClient plain; WiFiClientSecure tls;
    if (!beginReq(http, plain, tls, url("/voice"))) return false;
    auth(http);
    http.addHeader("Content-Type", "application/octet-stream");
    const char *keys[] = {"X-Transcript", "X-Reply", "X-Action"};
    http.collectHeaders(keys, 3);
    http.setTimeout(60000);

    int code = http.POST((uint8_t *)pcm, samples * sizeof(int16_t));
    if (code != 200) { http.end(); return false; }
    transcript = urlDec(http.header("X-Transcript"));
    reply      = urlDec(http.header("X-Reply"));
    action     = http.header("X-Action");
    streamToSpeaker(http, audio);
    http.end();
    return true;
  }

  // GET /speak?text=… → play it (connected cue, telnet `say`).
  bool speak(const String &text, Audio &audio) {
    HTTPClient http; WiFiClient plain; WiFiClientSecure tls;
    if (!beginReq(http, plain, tls, url("/speak") + "?text=" + urlEnc(text))) return false;
    auth(http);
    http.setTimeout(30000);
    int code = http.GET();
    if (code != 200) { http.end(); return false; }
    streamToSpeaker(http, audio);
    http.end();
    return true;
  }

private:
  Settings *_s = nullptr;

  // backendUrl + path, tolerating a trailing slash on the base.
  String url(const char *path) {
    String b = _s->backendUrl;
    while (b.endsWith("/")) b.remove(b.length() - 1);
    return b + path;
  }

  // Point the HTTPClient at either a plain or a TLS client, by the URL's scheme.
  // Both clients are stack-local in the caller so they outlive the request; the
  // unused one is never connected, so it costs nothing.
  bool beginReq(HTTPClient &http, WiFiClient &plain, WiFiClientSecure &tls, const String &fullUrl) {
    http.setConnectTimeout(10000);
    http.setReuse(false);
    if (_s->secure()) {
      tls.setCACert(ISRG_ROOT_X1);   // verify the Funnel cert — refuse a MITM
      tls.setHandshakeTimeout(15);   // fail fast if the URL is wrong/unreachable
      return http.begin(tls, fullUrl);
    }
    return http.begin(plain, fullUrl);
  }

  void auth(HTTPClient &http) {
    if (_s->padToken[0]) http.addHeader("Authorization", String("Bearer ") + _s->padToken);
  }

  // Read the PCM body and push it to I2S. The backend sends a Content-Length, so
  // there are no chunk markers to trip over; we carry an odd byte across reads to
  // keep 16-bit samples aligned. Works the same over TLS (the stream is just the
  // decrypted body).
  void streamToSpeaker(HTTPClient &http, Audio &audio) {
    WiFiClient *stream = http.getStreamPtr();
    int total = http.getSize();     // Content-Length, or -1 if unknown
    int remaining = total;
    uint8_t buf[1024];
    uint8_t carry = 0; bool haveCarry = false;
    uint32_t idle = millis();

    while (total < 0 ? (stream->connected() || stream->available()) : remaining > 0) {
      int avail = stream->available();
      if (avail > 0) {
        idle = millis();
        int off = 0;
        if (haveCarry) { buf[0] = carry; off = 1; haveCarry = false; }
        int want = (int)sizeof(buf) - off;
        if (total >= 0 && want > remaining) want = remaining;
        if (want <= 0) want = 1;
        int n = stream->readBytes(buf + off, min(avail, want));
        if (total >= 0) remaining -= n;
        int bytes = off + n;
        int samples = bytes / 2;
        if (bytes & 1) { carry = buf[bytes - 1]; haveCarry = true; }
        if (samples) audio.writeSpk((int16_t *)buf, samples);
      } else {
        if (!stream->connected() && !stream->available()) break;
        if (millis() - idle > 12000) break;     // stalled — bail
        delay(2);
      }
    }
  }

  static String urlEnc(const String &s) {
    static const char *hex = "0123456789ABCDEF";
    String o;
    for (size_t i = 0; i < s.length(); i++) {
      char c = s[i];
      if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') o += c;
      else if (c == ' ') o += "%20";
      else { o += '%'; o += hex[(c >> 4) & 0xF]; o += hex[c & 0xF]; }
    }
    return o;
  }

  static String urlDec(const String &s) {
    String o;
    for (size_t i = 0; i < s.length(); i++) {
      char c = s[i];
      if (c == '%' && i + 2 < s.length()) {
        auto h = [](char x) -> int {
          if (x >= '0' && x <= '9') return x - '0';
          if (x >= 'A' && x <= 'F') return x - 'A' + 10;
          if (x >= 'a' && x <= 'f') return x - 'a' + 10;
          return 0;
        };
        o += (char)((h(s[i + 1]) << 4) | h(s[i + 2]));
        i += 2;
      } else o += c;
    }
    return o;
  }

  static bool hasField(const String &json, const char *key) {
    return json.indexOf(String("\"") + key + "\":") >= 0;
  }
  static bool jsonNull(const String &json, const char *key) {
    int a = json.indexOf(String("\"") + key + "\":");
    return a >= 0 && json.substring(a).indexOf("null") == String(String("\"") + key + "\":").length();
  }
  static bool jsonBool(const String &json, const char *key) {
    int a = json.indexOf(String("\"") + key + "\":");
    if (a < 0) return false;
    return json.substring(a + String(String("\"") + key + "\":").length(), a + 40).startsWith("true");
  }
  // Numbers, including negatives — unrealised P&L is signed and the sign is the
  // whole point of the light.
  static float jsonNum(const String &json, const char *key, float dflt) {
    String needle = String("\"") + key + "\":";
    int a = json.indexOf(needle);
    if (a < 0) return dflt;
    a += needle.length();
    while (a < (int)json.length() && json[a] == ' ') a++;
    int b = a;
    if (b < (int)json.length() && (json[b] == '-' || json[b] == '+')) b++;
    while (b < (int)json.length() && (isdigit(json[b]) || json[b] == '.')) b++;
    if (b == a) return dflt;                       // null, or not a number
    return json.substring(a, b).toFloat();
  }

  // Minimal "key":"value" scrape — enough without dragging in a JSON lib.
  static String jsonStr(const String &json, const char *key) {
    String needle = String("\"") + key + "\":\"";
    int a = json.indexOf(needle);
    if (a < 0) return "";
    a += needle.length();
    int b = json.indexOf('"', a);
    return b < 0 ? "" : json.substring(a, b);
  }
};
