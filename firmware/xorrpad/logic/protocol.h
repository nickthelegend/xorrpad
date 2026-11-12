#pragma once
#include "crypto.h"
#include <ArduinoJson.h>
#include <ChaChaPoly.h>
#include <cstring>

namespace xorr {
inline std::string base64(const uint8_t *data, size_t n) {
  static const char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string out;
  for (size_t i = 0; i < n; i += 3) {
    uint32_t bits = uint32_t(data[i]) << 16;
    if (i + 1 < n) bits |= uint32_t(data[i + 1]) << 8;
    if (i + 2 < n) bits |= data[i + 2];
    out += alphabet[bits >> 18]; out += alphabet[(bits >> 12) & 63];
    out += i + 1 < n ? alphabet[(bits >> 6) & 63] : '=';
    out += i + 2 < n ? alphabet[bits & 63] : '=';
  }
  return out;
}
inline bool unbase64(const std::string &s, std::vector<uint8_t> &out) {
  if (s.size() > 5464 || s.size() % 4) return false;
  auto value = [](char c) -> int {
    if (c >= 'A' && c <= 'Z') return c - 'A';
    if (c >= 'a' && c <= 'z') return c - 'a' + 26;
    if (c >= '0' && c <= '9') return c - '0' + 52;
    return c == '+' ? 62 : c == '/' ? 63 : -1;
  };
  out.clear();
  for (size_t i = 0; i < s.size(); i += 4) {
    int a = value(s[i]), b = value(s[i + 1]);
    int c = s[i + 2] == '=' ? 0 : value(s[i + 2]);
    int d = s[i + 3] == '=' ? 0 : value(s[i + 3]);
    if (a < 0 || b < 0 || c < 0 || d < 0) return false;
    uint32_t bits = (a << 18) | (b << 12) | (c << 6) | d;
    out.push_back(bits >> 16);
    if (s[i + 2] != '=') out.push_back(bits >> 8);
    if (s[i + 3] != '=') out.push_back(bits);
  }
  return out.size() <= 4096 && base64(out.data(), out.size()) == s;
}
inline std::string protocolLine(JsonDocument &d, bool serial) {
  std::string s;
  serializeJson(d, s);
  if (serial) {
    auto crc = crc32(s);
    uint8_t b[4] = {uint8_t(crc >> 24), uint8_t(crc >> 16), uint8_t(crc >> 8), uint8_t(crc)};
    s.pop_back(); s += ",\"crc\":\"" + hex(b, 4) + "\"}";
  }
  return s + '\n';
}
inline bool protocolCRC(JsonDocument &d, bool serial) {
  if (!serial) return true;
  std::string crc = d["crc"] | "";
  uint8_t bytes[4];
  if (!unhex(crc, bytes, 4)) return false;
  d.remove("crc");
  std::string s; serializeJson(d, s);
  return crc32(s) == (uint32_t(bytes[0]) << 24 | uint32_t(bytes[1]) << 16 |
                      uint32_t(bytes[2]) << 8 | bytes[3]);
}
// Control frames may overtake a lost reliable frame. Track replay separately
// from the cumulative acknowledgment of reliable data.
struct ReplayWindow {
  uint32_t high = 0;
  uint64_t bits = 0;
  bool accept(uint32_t seq) {
    if (!seq) return false;
    if (seq > high) {
      auto gap = seq - high;
      bits = gap >= 64 ? 1 : (bits << gap) | 1;
      high = seq; return true;
    }
    auto gap = high - seq;
    if (gap >= 64 || (bits & (uint64_t(1) << gap))) return false;
    bits |= uint64_t(1) << gap; return true;
  }
};
class FrameSession {
  uint8_t tx[32] = {}, rx[32] = {};
  ReplayWindow replay;
public:
  uint32_t sent = 0, received = 0, pendingSeq = 0, at = 0;
  unsigned tries = 0;
  std::string pending;
  void clear() {
    sent = received = pendingSeq = at = tries = 0;
    pending.clear(); replay = {};
    memset(tx, 0, 32); memset(rx, 0, 32);
  }
  void keys(const uint8_t transmit[32], const uint8_t receive[32]) {
    clear(); memcpy(tx, transmit, 32); memcpy(rx, receive, 32);
  }
  std::string seal(JsonDocument &doc, bool serial, uint32_t now, bool reliable = true) {
    std::string type = doc["type"] | "";
    reliable = reliable && type != "ack" && type != "ping";
    if (sent == 0xffffffffu || (reliable && !pending.empty())) return "";
    uint32_t seq = sent + 1;
    uint8_t nonce[12] = {}, tag[16];
    for (int i = 0; i < 4; ++i) nonce[8+i] = uint8_t(seq >> (8*i));
    std::string plain; serializeJson(doc, plain);
    std::vector<uint8_t> cipher(plain.size());
    ChaChaPoly c; c.setKey(tx, 32); c.setIV(nonce, 12);
    auto aad = "2|" + std::to_string(seq) + "|" + std::to_string(received);
    c.addAuthData(aad.data(), aad.size());
    c.encrypt(cipher.data(), (const uint8_t *)plain.data(), plain.size());
    c.computeTag(tag, 16);
    JsonDocument frame;
    frame["v"] = 2; frame["seq"] = seq; frame["ack"] = received;
    frame["type"] = "encrypted";
    frame["body"] = base64(cipher.data(), cipher.size()); frame["tag"] = hex(tag, 16);
    auto out = protocolLine(frame, serial);
    if (out.size() > 4096) return "";
    sent = seq;
    if (reliable) { pending = out; pendingSeq = seq; at = now; tries = 0; }
    return out;
  }
  // 1 fresh, 2 authenticated replay (ack again, never execute), 0 invalid.
  int open(JsonDocument &frame, JsonDocument &plain, bool serial) {
    if (!protocolCRC(frame, serial) || frame["v"] != 2 ||
        frame["type"] != "encrypted" || !frame["seq"].is<uint32_t>() ||
        !frame["ack"].is<uint32_t>()) return 0;
    uint32_t seq = frame["seq"], ack = frame["ack"];
    uint8_t tag[16], nonce[12] = {};
    if (!seq || ack > sent || !unhex(frame["tag"] | "", tag, 16)) return 0;
    std::vector<uint8_t> cipher;
    if (!unbase64(frame["body"] | "", cipher)) return 0;
    std::vector<uint8_t> out(cipher.size());
    for (int i = 0; i < 4; ++i) nonce[8+i] = uint8_t(seq >> (8*i));
    ChaChaPoly c; c.setKey(rx, 32); c.setIV(nonce, 12);
    auto aad = "2|" + std::to_string(seq) + "|" + std::to_string(ack);
    c.addAuthData(aad.data(), aad.size()); c.decrypt(out.data(), cipher.data(), cipher.size());
    if (!c.checkTag(tag, 16) || deserializeJson(plain, out.data(), out.size()) ||
        !plain.is<JsonObject>() || !plain["type"].is<const char *>()) return 0;
    if (ack >= pendingSeq) pending.clear();
    if (!replay.accept(seq)) return 2;
    std::string type = plain["type"];
    if (type != "ack" && type != "ping") {
      if (seq <= received) return 2;
      received = seq;
    }
    return 1;
  }
  bool exhausted(uint32_t now) const {
    return !pending.empty() && tries >= 6 && uint32_t(now - at) >= backoff(tries);
  }
  std::string retry(uint32_t now) {
    if (pending.empty() || uint32_t(now - at) < backoff(tries) || exhausted(now)) return "";
    ++tries; at = now; return pending;
  }
};
} // namespace xorr
