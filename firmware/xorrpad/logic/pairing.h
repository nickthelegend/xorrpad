#pragma once
#include "crypto.h"
#include <Curve25519.h>
#include <SHA256.h>
#include <cstring>

namespace xorr {
inline std::string pairingText(const std::string &device, const std::string &pad,
                               const std::string &desk, const std::string &challenge,
                               const std::string &nonce) {
  if (device.empty() || device.size() > 64) return "";
  for (char c : device)
    if (!(c >= 'a' && c <= 'z') && !(c >= 'A' && c <= 'Z') &&
        !(c >= '0' && c <= '9') && c != '_' && c != '-') return "";
  uint8_t bytes[32];
  for (const auto &key : {pad, desk, challenge, nonce})
    if (!unhex(key, bytes, 32)) return "";
  return "xorrpad-v2|" + device + "|" + pad + "|" + desk + "|" + challenge + "|" + nonce;
}
inline bool pairingKeys(const uint8_t secret[32], const uint8_t remote[32],
                        const std::string &code, const std::string &text,
                        uint8_t desk[32], uint8_t pad[32]) {
  if (text.empty() || code.size() != 6) return false;
  for (char c : code) if (c < '0' || c > '9') return false;
  uint8_t shared[32];
  if (!Curve25519::eval(shared, secret, remote)) return false;
  uint8_t any = 0;
  for (auto b : shared) any |= b;
  if (!any) return false;
  // Hash incrementally; do not leave copies of the ECDH secret in strings.
  for (const char *direction : {"desk", "pad"}) {
    SHA256 h;
    h.update(shared, 32);
    h.update(code.data(), code.size());
    h.update(text.data(), text.size());
    h.update(direction, strlen(direction));
    h.finalize(direction[0] == 'd' ? desk : pad, 32);
  }
  memset(shared, 0, sizeof shared);
  return true;
}
} // namespace xorr
