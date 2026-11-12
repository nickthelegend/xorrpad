#pragma once
#include <cstdint>
namespace xorr {
inline unsigned preferredTransport(uint32_t now, const uint32_t seen[4], const bool usable[4]) {
  for (unsigned i = 3; i > 0; --i)
    if (usable[i] && seen[i] && uint32_t(now - seen[i]) < 15000) return i;
  return 0;
}
}
