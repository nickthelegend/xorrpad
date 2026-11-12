#pragma once
#include <stdint.h>
namespace xorr { namespace abilities {
struct Budget {
  uint32_t fuel=0, deadline=0;
  uint32_t (*clock)()=nullptr;
  const char *step() {
    if (!fuel) return "ability fuel exhausted";
    --fuel;
    if (!clock || int32_t(clock()-deadline)>=0) return "ability watchdog deadline";
    return nullptr;
  }
};
}}
