#pragma once
#include "crypto.h"
#include <functional>
namespace xorr {
// SHA-256 interpreted as a big-endian integer, modulo 100 (all 32 bytes).
inline unsigned rolloutBucket(const std::string &deviceId) {
  auto hash = sha(deviceId.data(), deviceId.size());
  unsigned n = 0;
  for (auto b : hash) n = (n * 256 + b) % 100;
  return n;
}
inline bool otaEligible(const Manifest &m, const std::string &deviceId, const std::string &channel) {
  return !deviceId.empty() && (channel == "stable" || channel == "beta") &&
    (m.channel.empty() || ((m.channel == "stable" || channel == "beta") &&
                          rolloutBucket(deviceId) < m.rolloutPercent));
}
// Streaming COPY/ADD patcher. Only 512 bytes of working memory, no arbitrary
// seek/write, every base read and target write bounded by signed image sizes.
class DeltaPatcher {
  enum State { Magic, Op, Copy, AddLength, Literal, Done, Failed } state = Magic;
  uint8_t header[8]{};
  uint32_t have = 0, left = 0, baseSize = 0, targetSize = 0, written = 0;
  bool fail() { state = Failed; return false; }
  static uint32_t u32(const uint8_t *p) {
    return uint32_t(p[0]) | uint32_t(p[1]) << 8 | uint32_t(p[2]) << 16 | uint32_t(p[3]) << 24;
  }
public:
  using Reader = std::function<bool(uint32_t, uint8_t *, size_t)>;
  using Writer = std::function<bool(const uint8_t *, size_t)>;
  void begin(uint32_t base, uint32_t target) {
    *this = DeltaPatcher{}; baseSize = base; targetSize = target;
  }
  bool feed(const uint8_t *p, size_t n, const Reader &read, const Writer &write) {
    if (!n || state == Failed || state == Done) return fail();
    static const uint8_t magic[8] = {'X','O','R','R','D','1','\r','\n'};
    while (n) {
      if (state == Magic) {
        if (*p++ != magic[have++]) return fail();
        --n; if (have == 8) { state = Op; have = 0; }
      } else if (state == Op) {
        uint8_t op = *p++; --n; have = 0;
        if (op == 0) state = Copy;
        else if (op == 1) state = AddLength;
        else if (op == 255 && written == targetSize && !n) state = Done;
        else return fail();
      } else if (state == Copy || state == AddLength) {
        header[have++] = *p++; --n;
        if (have != (state == Copy ? 8u : 4u)) continue;
        uint32_t at = state == Copy ? u32(header) : 0;
        left = u32(header + (state == Copy ? 4 : 0));
        if (!left || left > targetSize - written) return fail();
        if (state == AddLength) { state = Literal; continue; }
        if (at > baseSize || left > baseSize - at) return fail();
        uint8_t buf[512];
        while (left) {
          size_t take = std::min(left, uint32_t(sizeof buf));
          if (!read(at, buf, take) || !write(buf, take)) return fail();
          at += take; left -= take; written += take;
        }
        state = Op;
      } else if (state == Literal) {
        size_t take = std::min(size_t(left), n);
        if (!write(p, take)) return fail();
        p += take; n -= take; written += take; left -= take;
        if (!left) state = Op;
      } else return fail();
    }
    return state != Failed;
  }
  bool complete() const { return state == Done && written == targetSize; }
};
} // namespace xorr
