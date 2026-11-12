#pragma once
#include "safety.h"
#include <cstdint>
namespace xorr {
// Key numbering follows cell() / the fixed keymap, never desk remapping.
class FactoryProgress {
public:
  enum Stage { Keys, Knob, Mic, Speaker, Tft, Led, Radio, Done };
  Stage stage = Keys;
  uint16_t keys = 0;
  bool turned = false, pressed = false, mic = false, speaker = false,
       tft = false, led = false, wifi = false, ble = false;
  double micLevel = 0;
  uint32_t started = 0, stageAt = 0;
  static bool chord(bool first, bool last) { return first && last; }
  void begin(uint32_t now) { *this = FactoryProgress(); started = stageAt = now; }
  void advance(Stage next, uint32_t now) { stage = next; stageAt = now; }
  void key(int row, int col, bool down, uint32_t now) {
    if (!down || stage == Done) return;
    int i = cell(row, col);
    if (stage == Keys && i >= 0) {
      keys |= uint16_t(1) << i;
      if (keys == 0x3fff) advance(Knob, now);
    } else if (row == 2 && col == 1) {
      if (stage == Speaker) { speaker = true; advance(Tft, now); }
      else if (stage == Tft) { tft = true; advance(Led, now); }
      // Observe all three RGB phases before acknowledgment.
      else if (stage == Led && uint32_t(now - stageAt) >= 1500) {
        led = true; advance(Radio, now);
      }
    } else if (row == 2 && col == 0 && stage >= Speaker) advance(Done, now);
  }
  void knob(bool turn, bool press, uint32_t now) {
    if (stage != Knob) return;
    turned |= turn; pressed |= press;
    if (turned && pressed) advance(Mic, now);
  }
  void level(double value, uint32_t now) {
    if (stage != Mic) return;
    micLevel = value;
    if (value > 600) { mic = true; advance(Speaker, now); }
  }
  void radio(bool scanComplete, bool advertising, uint32_t now) {
    if (stage != Radio) return;
    wifi = scanComplete; ble = advertising;
    if (wifi && ble) advance(Done, now);
  }
  bool expired(uint32_t now) const { return uint32_t(now - started) >= 180000; }
  bool pass() const {
    return keys == 0x3fff && turned && pressed && mic && speaker && tft && led && wifi && ble;
  }
};
class FactoryReset {
  Hold hold;
public:
  bool active = false;
  bool tick(bool chord, uint32_t now) {
    active = chord;
    if (!chord) { hold.release(); return false; }
    hold.press(now);
    return hold.ready(now, 10000);
  }
  unsigned remaining(uint32_t now) const {
    return 10 - std::min(uint32_t(10), hold.elapsed(now) / 1000);
  }
};
}
