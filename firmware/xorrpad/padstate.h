#pragma once
#include <Arduino.h>

// ─────────────────────────────────────────────────────────────────────────────
// What the pad knows, as plain data.
//
// Split out of net.h so the drawing code can be compiled and looked at on a
// laptop. ui.h renders these two structs and nothing else — no WiFi, no SPI —
// which is what makes tools/uipreview able to produce a PNG of exactly the
// frame the panel will show. A UI you can only inspect by flashing it is a UI
// you will not inspect.
// ─────────────────────────────────────────────────────────────────────────────

// Everything the pad reads back from the xorr-pad backend in one poll. This is
// the whole model the firmware holds: it keeps no opinion of its own about what
// is armed or what is in hand, because the backend is the only thing that knows.
struct PadState {
  bool   ok        = false;   // did the poll succeed at all
  bool   armed     = false;
  bool   pending   = false;   // a decision is waiting on a ✓
  bool   chainOk   = false;
  bool   remembers = false;   // the store still has limits — false after a wipe
  String agent, market, mode, verdict;
  float  price      = 0;
  float  unrealised = 0;      // NaN-free: `hasPnl` says whether it means anything
  bool   hasPnl     = false;
  int    spentToday = -1, dayLimit = -1;
  // The venue in hand, and whether the exchange behind the asset is open.
  // A tokenized share trades around the clock; the company's listing does not.
  String chain, venue, hoursState, hoursNote, nyTime;
  bool   marketOpen = false;
};

// GET /pad/chart — the market in hand as hourly closes, for the display pod.
struct ChartState {
  bool    ok = false;
  String  symbol, error;
  float   price = 0, change24h = 0, hi = 0, lo = 0;
  bool    hasChange = false;
  uint8_t n = 0;
  float   closes[169];
};
