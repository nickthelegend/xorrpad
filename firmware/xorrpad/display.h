#pragma once
#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include "config.h"
#include "padstate.h"
#include "ui.h"

// ─────────────────────────────────────────────────────────────────────────────
// The display pod: a 2.8" ILI9341 (320x240, SPI — LCDwiki MSP2807) laid
// landscape in cad/part_display.py, its header on the right. Touch is unwired.
//
// This file is only the device. It owns the SPI bus, the panel, the off-screen
// canvas and the way up; every pixel it shows is drawn by ui.h, which knows
// nothing about hardware and can therefore be rendered on a laptop by
// tools/uipreview. Keeping the split honest is what makes the layout reviewable
// without a board on the desk.
//
// Every frame is composed on a PSRAM canvas and sent in one blit, so a redraw
// never flickers or shows half a frame.
// ─────────────────────────────────────────────────────────────────────────────
class Display {
public:
  static constexpr int W = ui::W, H = ui::H;

  bool begin() {
    if (TFT_BLK >= 0) { pinMode(TFT_BLK, OUTPUT); digitalWrite(TFT_BLK, LOW); }
    _spi = new SPIClass(FSPI);
    _spi->begin(TFT_SCK, -1, TFT_MOSI, TFT_CS);   // no MISO: the module's SDO stays unconnected
    _tft = new Adafruit_ILI9341(_spi, TFT_DC, TFT_CS, TFT_RST);
    _tft->begin(TFT_SPI_HZ);
    _tft->setRotation(_rotation);
    _canvas = new GFXcanvas16(W, H);              // 154 KB — lands in PSRAM
    _ok = _canvas && _canvas->getBuffer();
    if (_ok) testCard(); else _tft->fillScreen(ILI9341_RED);
    if (TFT_BLK >= 0) digitalWrite(TFT_BLK, HIGH);
    Serial.printf("display: ILI9341 %dx%d over SPI at %u MHz, rotation %u, canvas %s\n",
                  W, H, (unsigned)(TFT_SPI_HZ / 1000000), _rotation, _ok ? "ok" : "FAILED");
    return _ok;
  }

  void testCard() {
    if (!_ok) return;
    ui::drawBoot(*_canvas, _rotation);
    blit();
  }

  void draw(const PadState &pad, const ChartState &ch) {
    if (!_ok) return;
    const uint32_t t0 = millis();
    ui::drawFrame(*_canvas, pad, ch);
    blit();
    _frameMs = millis() - t0;
    _frames++;
    _chartN = (ch.ok && ch.symbol == pad.market) ? ch.n : 0;
  }

  // Landscape only — the pod lays the panel on its side; 1 and 3 are its two ways round.
  bool rotate(uint8_t r) {
    if (!_ok || (r != 1 && r != 3)) return false;
    _rotation = r;
    _tft->setRotation(r);
    return true;
  }

  String info() const {
    char b[176];
    snprintf(b, sizeof b, "display %s: ILI9341 %dx%d, rotation %u, %u MHz, %lu frames (last %lu ms), chart %u closes",
             _ok ? "ok" : "FAILED", W, H, _rotation, (unsigned)(TFT_SPI_HZ / 1000000),
             (unsigned long)_frames, (unsigned long)_frameMs, (unsigned)_chartN);
    return String(b);
  }

private:
  SPIClass *_spi = nullptr;
  Adafruit_ILI9341 *_tft = nullptr;
  GFXcanvas16 *_canvas = nullptr;
  bool _ok = false;
  uint8_t _rotation = TFT_ROTATION;
  uint16_t _chartN = 0;
  uint32_t _frames = 0, _frameMs = 0;

  void blit() { _tft->drawRGBBitmap(0, 0, _canvas->getBuffer(), W, H); }
};
