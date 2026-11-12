#pragma once
#include "logic/attestation.h"
#include "factory-public-key.h"
#include "secure.h"
namespace secure {
class Attestation {
  xorr::DeviceCertificate cert;
public:
  bool loaded = false;
  bool matches(Identity &i, const xorr::DeviceCertificate &c) {
    return i.ok && c.verify(XORR_FACTORY_PUBLIC_KEY, i.device.c_str(), xorr::hex(i.epub, 32));
  }
  void begin(Identity &i) {
    loaded = false;
    Preferences p;
    if (!p.begin("xorrattest", true)) return;
    String raw = p.getString("cert", ""); p.end();
    JsonDocument d;
    if (raw.length() <= 768 && !deserializeJson(d, raw) &&
        xorr::parseCertificate(d.as<JsonVariantConst>(), cert)) loaded = matches(i, cert);
  }
  bool provision(Identity &i, JsonVariantConst d) {
    xorr::DeviceCertificate next;
    if (!xorr::parseCertificate(d, next) || !matches(i, next)) return false;
    JsonDocument doc; xorr::writeCertificate(doc.to<JsonObject>(), next);
    String raw; serializeJson(doc, raw);
    Preferences p;
    if (!p.begin("xorrattest", false)) return false;
    bool ok = p.putString("cert", raw) == raw.length(); p.end();
    if (ok) { cert = next; loaded = true; }
    return ok;
  }
  void proof(Identity &i, JsonDocument &d, const std::string &context) {
    if (!loaded || !matches(i, cert)) return;
    auto text = cert.challengeText(context);
    if (text.empty()) return;
    xorr::writeCertificate(d["certificate"].to<JsonObject>(), cert);
    d["attestationSignature"] = i.sign(String(text.c_str()));
  }
};
}
