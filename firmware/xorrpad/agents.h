#pragma once
#include <Arduino.h>
#include "config.h"

// ─────────────────────────────────────────────────────────────────────────────
// What each key does on the xorr-pad deck.
//
// This is a TRADING surface, not a chat surface. Every key here maps to a real
// control on the backend: an agent takes the baton, BASE runs the strategy
// book, and BUY/SELL raise a decision that only a ✓ can execute. Nothing on
// this pad can move money on its own — the gate lives on the backend and
// answers every key the same way whether it was pressed here or on screen.
//
// The ids are exactly the ones POST /key accepts. There is no translation layer
// and no local table of what a key "means": if it is not a real backend id, the
// backend says so and the pad shows the refusal.
// ─────────────────────────────────────────────────────────────────────────────

enum KeyRole {
  ROLE_NONE,     // unbound — no switch in this cell
  ROLE_MIC,      // hold to talk; POSTs the recording to /voice
  ROLE_AGENT,    // takes the baton
  ROLE_MARKET,   // brings a market in hand
  ROLE_ACTION,   // buy / sell / base / portfolio
  ROLE_CONFIRM,  // ✓ — the only key that can cause a fill
  ROLE_REFUSE,   // ✗
  ROLE_KILL,     // stop all trading. Held, not tapped — see HOLD_TO_KILL_MS.
};

struct KeyBind {
  KeyRole     role;
  const char *id;         // the id POST /key accepts; nullptr for MIC/NONE
  const char *label;      // what the keycap says, for the telnet log
  uint8_t     r, g, b;    // status-LED colour while this key owns the light
};

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: this grid is indexed by the SCANNED MATRIX CELL, not by where the
// keycap sits. On this build the two do not agree: row 0 lines up with its
// wires, but row 1's caps sit one column over from theirs, and row 1's last key
// is wired into matrix row 2. That was measured with firmware/keytest, not
// guessed.
//
// Measured 2026-09-07 (d3e2b4b). A merge on 2026-09-09 (441036d) replaced it
// with a grid written in cap order, for a deck with market keys this pad does
// not have — seven of the eight measured keys then sent the wrong id, and BUY
// ran SCAN. Restored here. The roles are the current ones, so KILL still needs
// its HOLD_TO_KILL_MS hold and ✓/✗ still drive the confirm path.
//
// Columns are indexed in config.h's order: COL_PINS = {18, 17, 8, 14}.
//
//   cap (seen from above)   cell    GPIO row · col   status
//   r0c0  knob              (0,3)   10 · 14          no switch
//   r0c1  DCA               (0,2)   10 · 8           measured
//   r0c2  GRID              (0,1)   10 · 17          measured
//   r0c3  MOMENTUM          (0,0)   10 · 18          measured
//   r1c0  REBALANCE         (1,2)   11 · 8           measured
//   r1c1  YIELD             (1,1)   11 · 17          measured
//   r1c2  RISK              (1,0)   11 · 18          measured
//   r1c3  BASE              (2,3)   12 · 14          measured
//   r2c0  BUY               (2,2)   12 · 8           measured
//   r2c1  SELL              (3,2)   13 · 8           COLD JOINT — never fired; cell is a guess
//   r2c2  ✓ YES             (2,1)   12 · 17          unverified
//   r2c3  ✗ NO              (2,0)   12 · 18          unverified
//   r3c0  PORTFOLIO         (3,3)   13 · 14          unverified
//   r3    MIC (centred)     (3,1)   13 · 17          unverified
//   r3c3  KILL              (3,0)   13 · 18          unverified
//   —     (no cap)          (1,3)   11 · 14          unused
//
// Unverified cells follow the pattern of the measured ones and have never been
// pressed. To prove one, flash firmware/keytest, send `d`, press the key, and
// place it by the GPIO PAIR keytest prints — not by its row/col numbers.
// keytest scans the columns in the opposite order (COL_PINS = {14, 8, 17, 18}),
// so a cell it reports as (r, c) belongs at KEYMAP[r][3 - c]. Pasting its
// printed table straight over this one mirrors every column.
// ─────────────────────────────────────────────────────────────────────────────
static const KeyBind KEYMAP[MATRIX_ROWS][MATRIX_COLS] = {
  // C0 · GPIO 18                                        C1 · GPIO 17                                       C2 · GPIO 8                                               C3 · GPIO 14
  {{ROLE_AGENT,  "momentum", "MOMENTUM",  30, 60,120}, {ROLE_AGENT,  "grid",  "GRID",     77, 50,120}, {ROLE_AGENT,  "dca",       "DCA",       110, 80, 20}, {ROLE_NONE,   nullptr,     nullptr,       0,  0,  0}},  // row 0 · GPIO 10 — measured
  {{ROLE_AGENT,  "risk",     "RISK",      70, 45,120}, {ROLE_AGENT,  "yield", "YIELD",    20,110, 70}, {ROLE_AGENT,  "rebalance", "REBALANCE",  30,100,120}, {ROLE_NONE,   nullptr,     nullptr,       0,  0,  0}},  // row 1 · GPIO 11 — measured
  {{ROLE_REFUSE, "no",       "REFUSE",   110, 20, 20}, {ROLE_CONFIRM,"yes",   "CONFIRM",   0,110, 30}, {ROLE_ACTION, "buy",       "BUY",        20, 90, 40}, {ROLE_ACTION, "base",      "BASE",       60, 60, 60}},  // row 2 · GPIO 12 — BUY, BASE measured; ✗ ✓ unverified
  {{ROLE_KILL,   "kill",     "KILL",     120,  0,  0}, {ROLE_MIC,    nullptr, "MIC",     110,  0,  0}, {ROLE_ACTION, "sell",      "SELL",       90, 30, 30}, {ROLE_ACTION, "portfolio", "PORTFOLIO",  50, 50, 50}},  // row 3 · GPIO 13 — unverified; SELL is the cold joint
};

// Agent colours match the orbs on screen (desktop/renderer AGENTS), dimmed for
// a WS2812 the same way the first four were: GRID from #C79BFF, REBALANCE from
// #5AD9E8. BASE takes the neutral SCAN used, because it runs the same book.
// Green and red are reserved for confirm and refuse — the same law the
// interface follows.
//
// KEYS_MIRRORED stays 0: the grid above is already in scan order, so there is
// nothing to reflect. Set it to 1 only if the tray is remounted rotated 180°,
// and re-measure afterwards rather than trusting the reflection.
#define KEYS_MIRRORED 0
inline const KeyBind &keyAt(uint8_t r, uint8_t c) {
#if KEYS_MIRRORED
  return KEYMAP[MATRIX_ROWS - 1 - r][MATRIX_COLS - 1 - c];
#else
  return KEYMAP[r][c];
#endif
}
