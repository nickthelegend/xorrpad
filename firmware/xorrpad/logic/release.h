#pragma once
#include <cstdint>
namespace xorr {
// Debug consent belongs to one authenticated USB connection, never NVS.
class UsbDebugGate {
  bool enabled = false;
  uint32_t epoch = 0;
public:
  void configure(bool requested, bool secure, bool usb, uint32_t generation) {
    enabled = requested && secure && usb; epoch = generation;
  }
  bool check(bool secure, bool usb, uint32_t generation) {
    if (!secure || !usb || generation != epoch) enabled = false;
    return enabled;
  }
};
}
