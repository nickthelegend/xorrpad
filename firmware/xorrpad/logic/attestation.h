#pragma once
#include "pairing.h"
namespace xorr {
struct DeviceCertificate {
  std::string deviceKey, serial, model, signature;
  int version = 0;
  std::string text() const {
    uint8_t pk[32], sig[64];
    if (version != 1 || model != "xorrpad-esp32s3" || serial.size() != 18 ||
        serial.substr(0, 6) != "esp32-" || !unhex(serial.substr(6), sig, 6) ||
        !unhex(deviceKey, pk, 32) || !unhex(signature, sig, 64)) return "";
    return "xorrpad-cert-v3\n1\n" + deviceKey + "\n" + serial + "\n" + model;
  }
  bool verify(const uint8_t root[32], const std::string &device,
              const std::string &pk) const {
    auto t = text(); uint8_t sig[64]; bool configured = false;
    for (size_t i = 0; i < 32; ++i) configured |= root[i] != 0;
    return configured && !t.empty() && serial == device && deviceKey == pk &&
      unhex(signature, sig, 64) && Ed25519::verify(sig, root, t.data(), t.size());
  }
  bool verifyProof(const uint8_t root[32], const std::string &device,
                   const std::string &pk, const std::string &context,
                   const std::string &signatureHex) const {
    uint8_t key[32], sig[64]; auto t = challengeText(context);
    return verify(root, device, pk) && !t.empty() && unhex(pk, key, 32) &&
      unhex(signatureHex, sig, 64) && Ed25519::verify(sig, key, t.data(), t.size());
  }
  std::string challengeText(const std::string &context) const {
    auto t = text();
    // Reuse strict v2 transcript validation, including device and all four keys/nonces.
    std::vector<std::string> parts; size_t at = 0, end;
    while ((end = context.find('|', at)) != std::string::npos) {
      parts.push_back(context.substr(at, end - at)); at = end + 1;
    }
    parts.push_back(context.substr(at));
    if (t.empty() || parts.size() != 6 || parts[0] != "xorrpad-v2" ||
        parts[1] != serial || pairingText(parts[1], parts[2], parts[3], parts[4], parts[5]) != context) return "";
    return "xorrpad-attest-v3\n" + t + "\n" + signature + "\n" + context;
  }
};
inline bool parseCertificate(JsonVariantConst d, DeviceCertificate &c) {
  if (!d.is<JsonObjectConst>() || d.size() != 5 || !d["v"].is<int>() ||
      !d["deviceKey"].is<const char *>() || !d["serial"].is<const char *>() ||
      !d["model"].is<const char *>() || !d["signature"].is<const char *>()) return false;
  DeviceCertificate next{d["deviceKey"], d["serial"], d["model"], d["signature"], d["v"]};
  if (next.text().empty()) return false;
  c = next; return true;
}
inline void writeCertificate(JsonVariant d, const DeviceCertificate &c) {
  d["v"] = c.version; d["deviceKey"] = c.deviceKey; d["serial"] = c.serial;
  d["model"] = c.model; d["signature"] = c.signature;
}
}

namespace xorr {
// Public phone challenge; bind it to the live BLE offer, never desk-provided identity fields.
inline std::string phoneAttestationContext(const std::string&device,const std::string&xpk,
                                           const std::string&nonce,JsonVariantConst request){
  if(!request.is<JsonObjectConst>()||request.size()!=5||request["v"]!=2||request["type"]!="attest_request"||
     !request["clientKey"].is<const char*>()||!request["challenge"].is<const char*>()||
     !request["nonce"].is<const char*>()||request["nonce"].as<std::string>()!=nonce)return "";
  return pairingText(device,xpk,request["clientKey"],request["challenge"],nonce);
}
}
