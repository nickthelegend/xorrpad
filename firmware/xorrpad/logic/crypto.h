#pragma once
#include "safety.h"
#include <ArduinoJson.h>
#ifdef XORR_NATIVE
#include <openssl/evp.h>
#else
#include <SHA256.h>
#include <Ed25519.h>
#endif
namespace xorr {
inline std::array<uint8_t,32> sha(const void *p,size_t n){std::array<uint8_t,32>d{};
#ifdef XORR_NATIVE
unsigned int len=32;EVP_Digest(p,n,d.data(),&len,EVP_sha256(),nullptr);
#else
SHA256 h;h.update(p,n);h.finalize(d.data(),32);
#endif
return d;}
inline std::string hex(const uint8_t*p,size_t n){std::string s;const char*h="0123456789abcdef";for(size_t i=0;i<n;i++){s+=h[p[i]>>4];s+=h[p[i]&15];}return s;}
inline bool unhex(const std::string&s,uint8_t*p,size_t n){if(s.size()!=n*2)return false;auto v=[](char c){return c>='0'&&c<='9'?c-'0':c>='a'&&c<='f'?c-'a'+10:-1;};for(size_t i=0;i<n;i++){int a=v(s[2*i]),b=v(s[2*i+1]);if(a<0||b<0)return false;p[i]=a*16+b;}return true;}
inline std::string fingerprint(const Signal&s){auto c=s.canonical();auto d=sha(c.data(),c.size());return base58(d.data(),32).substr(0,6);}
inline bool verifyOtaSignature(const uint8_t sig[64], const uint8_t pk[32], const std::string &text) {
#ifdef XORR_NATIVE
  auto key=EVP_PKEY_new_raw_public_key(EVP_PKEY_ED25519,nullptr,pk,32);
  auto ctx=EVP_MD_CTX_new();
  bool ok=key && ctx && EVP_DigestVerifyInit(ctx,nullptr,nullptr,nullptr,key)==1 &&
    EVP_DigestVerify(ctx,sig,64,reinterpret_cast<const unsigned char *>(text.data()),text.size())==1;
  EVP_MD_CTX_free(ctx);EVP_PKEY_free(key);return ok;
#else
  return Ed25519::verify(sig,pk,text.data(),text.size());
#endif
}
inline bool otaVersion(const std::string &v) {
  if (v.empty() || v.size() > 48) return false;
  unsigned dots = 0, digits = 0;
  for (char c : v) {
    if (c == '.' && digits) { ++dots; digits = 0; }
    else if (c >= '0' && c <= '9') ++digits;
    else return false;
  }
  return dots == 2 && digits;
}
struct Manifest {
  std::string version, sha256, signature, minDesk, notes, channel;
  uint32_t size = 0, rolloutPercent = 100;
  struct Delta {
    std::string format, fromVersion, baseSha256, sha256, signature;
    uint32_t baseSize = 0, size = 0;
    bool present = false;
    std::string text() const {
      return format + "\n" + fromVersion + "\n" + baseSha256 + "\n" +
        std::to_string(baseSize) + "\n" + sha256 + "\n" + std::to_string(size);
    }
  } delta;
  std::string signedText() const {
    std::string text = (channel.empty() ? "xorrpad-ota-v2\n" : "xorrpad-ota-v3\n") + version + "\n" + sha256 + "\n" +
           std::to_string(size) + "\n" + minDesk + "\n" + notes;
    if (!channel.empty()) text += "\n" + channel + "\n" + std::to_string(rolloutPercent) + "\n" +
      (delta.present ? delta.text() + "\n" + delta.signature : "none");
    return text;
  }
  std::string patchText() const {
    return "xorrpad-delta-v1\n" + version + "\n" + sha256 + "\n" + std::to_string(size) + "\n" +
      channel + "\n" + std::to_string(rolloutPercent) + "\n" + delta.text();
  }
  bool valid() const {
    uint8_t d[32], sig[64];
    if (!(channel.empty() ? version == "2.0.0" && !delta.present :
          otaVersion(version) && (channel == "stable" || channel == "beta") && rolloutPercent <= 100)) return false;
    if (delta.present && (delta.format != "xorr-delta-v1" || !otaVersion(delta.fromVersion) ||
        !delta.baseSize || delta.baseSize > 0x300000 || !delta.size || delta.size >= size ||
        !unhex(delta.baseSha256, d, 32) || !unhex(delta.sha256, d, 32) || !unhex(delta.signature, sig, 64))) return false;
    return size > 0 && size <= 0x300000 && minDesk == "1.0.0" && notes.size() <= 512 &&
      notes.find('\n') == std::string::npos && unhex(sha256, d, 32) && unhex(signature, sig, 64);
  }
  bool verify(const uint8_t pk[32]) const {
    uint8_t sig[64];
    if (!valid() || !unhex(signature, sig, 64)) return false;
    auto text = signedText();
    if (!verifyOtaSignature(sig, pk, text)) return false;
    if (!delta.present) return true;
    unhex(delta.signature, sig, 64); text = patchText();
    return verifyOtaSignature(sig, pk, text);
  }
};
inline bool parseManifest(const std::string &json, Manifest &m) {
  JsonDocument d;
  if (json.size() > 4096 || deserializeJson(d, json) || !d["size"].is<uint32_t>()) return false;
  m = Manifest{};
  m.version = d["version"] | ""; m.sha256 = d["sha256"] | "";
  m.signature = d["signature"] | ""; m.minDesk = d["minDeskVersion"] | "";
  m.notes = d["notes"] | ""; m.size = d["size"];
  if (!d["channel"].isUnbound()) {
    if (!d["channel"].is<const char *>() || !d["rolloutPercent"].is<uint32_t>()) return false;
    m.channel = d["channel"].as<const char *>(); m.rolloutPercent = d["rolloutPercent"];
    if (m.channel.empty()) return false;
  } else if (!d["rolloutPercent"].isUnbound() || !d["delta"].isUnbound()) return false;
  if (!d["delta"].isUnbound()) {
    auto x = d["delta"];
    if (!x.is<JsonObjectConst>() || !x["size"].is<uint32_t>() || !x["baseSize"].is<uint32_t>()) return false;
    m.delta.present = true; m.delta.size = x["size"]; m.delta.baseSize = x["baseSize"];
    m.delta.format = x["format"] | ""; m.delta.fromVersion = x["fromVersion"] | "";
    m.delta.baseSha256 = x["baseSha256"] | ""; m.delta.sha256 = x["sha256"] | "";
    m.delta.signature = x["signature"] | "";
  }
  return m.valid();
}
}
