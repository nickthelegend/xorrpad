#pragma once
#include "logic/pairing.h"
#include "logic/protocol.h"
#include <ArduinoJson.h>
#include <ChaChaPoly.h>
#include <Curve25519.h>
#include <Preferences.h>
#include <deque>
#include <esp_random.h>
#include <mbedtls/base64.h>
namespace secure {
inline String b64(const uint8_t *p, size_t n) {
  std::vector<unsigned char> b((n + 2) / 3 * 4 + 1);
  size_t len = 0;
  if (mbedtls_base64_encode(b.data(), b.size(), &len, p, n))
    return "";
  return String((char *)b.data(), len);
}
inline bool decode(const String &s, std::vector<uint8_t> &b,
                   size_t max = 4096) {
  if (s.length() > ((max + 2) / 3) * 4)
    return false;
  b.resize(s.length() * 3 / 4 + 3);
  size_t n = 0;
  if (mbedtls_base64_decode(b.data(), b.size(), &n, (const uint8_t *)s.c_str(),
                            s.length()) ||
      n > max)
    return false;
  b.resize(n);
  return true;
}
inline String hex(const uint8_t *p, size_t n) {
  return String(xorr::hex(p, n).c_str());
}
inline String line(JsonDocument &d, bool serial) {
  return String(xorr::protocolLine(d, serial).c_str());
}
inline bool check(JsonDocument &d, bool serial) {
  return xorr::protocolCRC(d, serial);
}
class Identity {
  uint8_t xsecret[32], esecret[32];

public:
  uint8_t xpub[32], epub[32];
  String device, code;
  bool ok = false;
  bool begin() {
    Preferences p;
    if (!p.begin("xorridentity", false))
      return false;
    if (p.getBytesLength("x") == 32 && p.getBytesLength("ed") == 32) {
      p.getBytes("x", xsecret, 32);
      p.getBytes("ed", esecret, 32);
    } else {
      esp_fill_random(xsecret, 32);
      esp_fill_random(esecret, 32);
      if (p.putBytes("x", xsecret, 32) != 32 ||
          p.putBytes("ed", esecret, 32) != 32) {
        p.end();
        return false;
      }
    }
    p.end();
    Curve25519::eval(xpub, xsecret, nullptr);
    Ed25519::derivePublicKey(epub, esecret);
    char id[32], c[7];
    snprintf(id, sizeof id, "esp32-%012llx", ESP.getEfuseMac());
    device = id;
    snprintf(c, sizeof c, "%06lu", (unsigned long)(esp_random() % 1000000));
    code = c;
    ok = true;
    return true;
  }
  String qr() const {
    return "xorrpad://pair?id=" + device + "&pk=" + hex(epub, 32) +
           hex(xpub, 32) + "&v=2";
  }
  String sign(const String &s) {
    uint8_t sig[64];
    Ed25519::sign(sig, esecret, epub, s.c_str(), s.length());
    return hex(sig, 64);
  }
  bool derive(const uint8_t remote[32], const std::string &text,
              uint8_t desk[32], uint8_t pad[32]) {
    return xorr::pairingKeys(xsecret, remote, code.c_str(), text, desk, pad);
  }
};
class Session : public xorr::FrameSession {
public:
  bool established = false, offered = false;
  String offerNonce;
  String nonce() {
    if (!offerNonce.length()) {
      uint8_t bytes[32];
      esp_fill_random(bytes, sizeof bytes);
      offerNonce = hex(bytes, sizeof bytes);
    }
    return offerNonce;
  }
  std::deque<String> queue;
  void reset() {
    established = offered = false;
    clear();
    offerNonce = "";
    queue.clear();
  }
  bool pair(Identity &i, JsonVariantConst d, String &signature) {
    uint8_t remote[32], deskKey[32], padKey[32];
    String desk = d["deskpk"] | "", challenge = d["challenge"] | "";
    String offeredNonce = d["nonce"] | "";
    if (offered || established || !offerNonce.length() || offeredNonce != offerNonce ||
        !xorr::unhex(desk.c_str(), remote, 32)) return false;
    auto text = xorr::pairingText(i.device.c_str(), hex(i.xpub, 32).c_str(),
                                  desk.c_str(), challenge.c_str(), offeredNonce.c_str());
    if (text.empty() || !i.derive(remote, text, deskKey, padKey)) return false;
    reset();
    keys(padKey, deskKey);
    memset(padKey, 0, 32);
    memset(deskKey, 0, 32);
    signature = i.sign(String(text.c_str()));
    offered = true;
    at = millis();
    return true;
  }
  String seal(JsonDocument &doc, bool serial, bool reliable = true) {
    if (sent == 0xffffffffu) { reset(); return ""; }
    return String(xorr::FrameSession::seal(doc, serial, millis(), reliable).c_str());
  }
  int open(JsonDocument &frame, JsonDocument &plain, bool serial) {
    if (!offered && !established) return 0;
    return xorr::FrameSession::open(frame, plain, serial);
  }
  String retry() {
    if (exhausted(millis())) { reset(); return ""; }
    return String(xorr::FrameSession::retry(millis()).c_str());
  }
};
} // namespace secure
