#pragma once
#include <Adafruit_GFX.h>
#include "padstate.h"

// ─────────────────────────────────────────────────────────────────────────────
// ui.h — every pixel the pad draws, and nothing that knows about hardware.
//
// This file talks to a GFXcanvas16 and reads PadState / ChartState. It has no
// SPI, no WiFi and no ESP32 in it, which is the point: tools/uipreview compiles
// this exact code on a laptop and writes out PNGs of the real frames, so the
// layout can be judged by looking at it instead of by flashing a board and
// squinting at a 2.8" panel across the desk.
//
// WHAT THIS SCREEN IS FOR
//
// It is read from two feet away, at a glance, by someone who is doing something
// else. So it answers three questions in descending size, and nothing else:
//
//   1. what is it worth        the price, as large as the panel allows
//   2. is anyone minding it    armed / stopped / waiting on you
//   3. is the exchange open    the banner across the bottom
//
// The third is the one that earns its place. These are tokenized shares: NVDAx
// trades at 3am on a Sunday, and the New York Stock Exchange does not. Most of
// the volume in this asset class happens while the listing that prices it is
// shut. A screen that showed a price without saying which of those two worlds
// it came from would be implying the market is open, so the banner is never
// absent and never subtle.
// ─────────────────────────────────────────────────────────────────────────────
namespace ui {

constexpr int W = 320, H = 240;

// The desk app's palette (DESIGN.md), in RGB565.
static constexpr uint16_t BG = 0x0000, INK = 0xFFFF, MUTE = 0x8C71, GRID = 0x2124;
static constexpr uint16_t UP = 0x2ECF, DOWN = 0xFA27, WARN = 0xEE29;   // #2BD87A #FF453A #E8C64A
static constexpr uint16_t UP_DIM = 0x09E4, DOWN_DIM = 0x3882;          // ~22% of up / down
static constexpr uint16_t BLUE = 0x0C3F;                               // #0A84FF
static constexpr uint16_t SOL  = 0x9A3F;                               // #9945FF, Solana violet
static constexpr uint16_t DIMWARN = 0x2140;                            // banner fill behind WARN

static constexpr int BANNER_H = 34;            // the hours bar owns the bottom



// ── small helpers ─────────────────────────────────────────────────────────
static int tw(uint8_t size, const char *s) { return (int)strlen(s) * 6 * size; }
static int th(uint8_t size) { return 8 * size; }

static void text(GFXcanvas16 &c, int x, int y, uint8_t size, uint16_t col, const char *s) {
  c.setTextSize(size); c.setTextColor(col); c.setCursor(x, y); c.print(s);
}
static void textR(GFXcanvas16 &c, int right, int y, uint8_t size, uint16_t col, const char *s) {
  text(c, right - tw(size, s), y, size, col, s);
}

/**
 * Fold a backend string to printable ASCII.
 *
 * The built-in GFX font is a 7-bit face: anything multi-byte renders as two or
 * three pieces of line-noise. The desk app writes English prose with em dashes
 * and middots in it, and a middot arriving here as a stray glyph in the middle
 * of "momentum . $50 of $300" is exactly the sort of thing that looks like a
 * hardware fault. Map what has an obvious equivalent, drop the rest.
 */
static String ascii(const String &in) {
  const int n = (int)in.length();
  // Worst case is a 2-byte source char becoming 3 output chars (" - ", "...").
  char *buf = (char *)malloc((size_t)n * 3 + 1);
  if (!buf) return in;
  int w = 0;
  auto put = [&](const char *t) { while (*t) buf[w++] = *t++; };
  for (int i = 0; i < n; i++) {
    unsigned char ch = (unsigned char)in[i];
    if (ch >= 0x20 && ch < 0x7F) { buf[w++] = (char)ch; continue; }
    if (ch < 0x80) { buf[w++] = ' '; continue; }          // control bytes
    const int extra = (ch >= 0xF0) ? 3 : (ch >= 0xE0) ? 2 : 1;
    // Decode just enough of the code point to recognise the punctuation we
    // actually receive from the desk app.
    long cp = ch & (0x7F >> (extra + 1));
    for (int k = 1; k <= extra && i + k < n; k++) cp = (cp << 6) | ((unsigned char)in[i + k] & 0x3F);
    i += extra;
    switch (cp) {
      case 0x00B7: case 0x2022: put(" - "); break;        // middot, bullet
      case 0x2014: case 0x2013: put("-");   break;        // em / en dash
      case 0x2018: case 0x2019: put("'");   break;
      case 0x201C: case 0x201D: put("\"");  break;
      case 0x2026: put("...");              break;
      case 0x2192: put("->");               break;
      default:     buf[w++] = '?';          break;
    }
  }
  buf[w] = 0;
  String out(buf);
  free(buf);
  return out;
}

/** Draw `s` clipped to `wpx`, ending in "..." when it does not fit. */
static void textClip(GFXcanvas16 &c, int x, int y, int wpx, uint8_t size, uint16_t col, const String &s) {
  const int per = wpx / (6 * size);
  if (per <= 0) return;
  String t = ascii(s);
  if ((int)t.length() > per)
    t = per > 3 ? t.substring(0, per - 3) + "..." : t.substring(0, per);
  text(c, x, y, size, col, t.c_str());
}

/** An outlined capsule. Returns its left edge, so pills can be laid right to left. */
static int pill(GFXcanvas16 &c, int right, int y, const char *t, uint16_t col, uint8_t size = 1) {
  const int padx = 6, h = th(size) + 8;
  const int w = tw(size, t) + padx * 2;
  const int x = right - w;
  c.drawRoundRect(x, y, w, h, h / 2, col);
  text(c, x + padx, y + 4, size, col, t);
  return x;
}

/** A filled capsule, for the one state that must not be missed. */
static int pillSolid(GFXcanvas16 &c, int right, int y, const char *t, uint16_t col, uint16_t ink, uint8_t size = 1) {
  const int padx = 6, h = th(size) + 8;
  const int w = tw(size, t) + padx * 2;
  const int x = right - w;
  c.fillRoundRect(x, y, w, h, h / 2, col);
  text(c, x + padx, y + 4, size, ink, t);
  return x;
}

static void fmtPrice(char *b, size_t n, float p) {
  if (p <= 0)          snprintf(b, n, "$--");
  else if (p >= 10000) snprintf(b, n, "$%.0f", p);
  else if (p >= 100)   snprintf(b, n, "$%.2f", p);
  else if (p >= 1)     snprintf(b, n, "$%.3f", p);
  else                 snprintf(b, n, "$%.4f", p);
}

/** Greedy word wrap into a fixed column, drawn from (x,y). Returns lines used. */
static int wrap(GFXcanvas16 &c, int x, int y, int wpx, uint8_t size, uint16_t col,
                const String &s, int maxLines) {
  const int perLine = wpx / (6 * size);
  if (perLine <= 0 || !s.length()) return 0;
  int line = 0, i = 0;
  while (i < (int)s.length() && line < maxLines) {
    int take = min(perLine, (int)s.length() - i);
    if (i + take < (int)s.length()) {                 // break on a space when we can
      int sp = take;
      while (sp > 0 && s[i + sp] != ' ') sp--;
      if (sp > perLine / 3) take = sp;
    }
    String seg = s.substring(i, i + take); seg.trim();
    text(c, x, y + line * (th(size) + 3), size, col, seg.c_str());
    i += take; line++;
    while (i < (int)s.length() && s[i] == ' ') i++;
  }
  return line;
}

// ── the hours banner ──────────────────────────────────────────────────────
// Always drawn, always at the bottom, never subtle. `tag` is the state in two
// or three words; `sub` is the sentence under it.
static void banner(GFXcanvas16 &c, uint16_t col, const char *tag, const String &sub) {
  const int y = H - BANNER_H;
  c.fillRect(0, y, W, BANNER_H, BG);
  c.drawFastHLine(0, y, W, col);
  c.fillRect(0, y + 1, 5, BANNER_H - 1, col);        // a colour stripe, readable in a photo
  text(c, 14, y + 6, 2, col, tag);
  // Clipped, not wrapped: the bar is one line tall by design, and a sentence
  // running off the right edge of a 320px panel reads as a broken screen.
  textClip(c, 14, y + 22, W - 28, 1, MUTE, sub);
}

/** Colour and wording for the exchange's state. Open is the quiet case. */
static uint16_t hoursColour(const String &st) {
  if (st == "OPEN") return UP;
  if (st == "CRYPTO") return BLUE;                    // no bell to be shut by
  if (st == "PRE" || st == "AFTER") return WARN;
  return SOL;                                        // weekend / holiday / overnight
}
static const char *hoursTag(const String &st) {
  if (st == "OPEN")      return "NYSE OPEN";
  if (st == "PRE")       return "PRE-MARKET";
  if (st == "AFTER")     return "AFTER HOURS";
  if (st == "WEEKEND")   return "WEEKEND";
  if (st == "HOLIDAY")   return "HOLIDAY";
  if (st == "OVERNIGHT") return "OVERNIGHT";
  if (st == "CRYPTO")    return "24/7";
  return "MARKET";
}

void drawHoursBanner(GFXcanvas16 &c, const PadState &pad) {
  if (!pad.hoursState.length()) {                    // backend too old to say
    banner(c, GRID, "MARKET", "the desk did not say whether the exchange is open");
    return;
  }
  const uint16_t col = hoursColour(pad.hoursState);
  const char *tag = hoursTag(pad.hoursState);
  String sub = pad.hoursNote.length() ? pad.hoursNote
                                      : String(pad.marketOpen ? "the exchange is open" : "this trades anyway");
  banner(c, col, tag, sub.c_str());
  if (pad.nyTime.length()) {
    String t = pad.nyTime + " NY";
    textR(c, W - 12, H - BANNER_H + 10, 1, col, t.c_str());
  }
}

// ── screens ───────────────────────────────────────────────────────────────

void drawOffline(GFXcanvas16 &c) {
  text(c, 14, 14, 3, MUTE, "xorr-pad");
  text(c, 14, 52, 1, GRID, "NO ANSWER FROM THE DESK");
  wrap(c, 14, 72, W - 28, 1, MUTE,
       "The pad is not making anything up while it cannot reach the backend. "
       "Check the desk app is running and the URL in settings.", 4);
  banner(c, DOWN, "OFFLINE", "no price here is current");
}

/**
 * The resting screen: what it is worth, who is minding it, is the floor open.
 */
void drawHome(GFXcanvas16 &c, const PadState &pad, const ChartState &ch) {
  // header — symbol left, state and venue pills right
  text(c, 12, 10, 3, INK, ascii(pad.market.length() ? pad.market : String("--")).c_str());

  int right = W - 12;
  if (!pad.armed)        right = pillSolid(c, right, 10, "STOPPED", DOWN, BG) - 6;
  else                   right = pill(c, right, 10, "ARMED", UP) - 6;
  if (pad.chain.length()) {
    String ch2 = pad.chain; ch2.toUpperCase();
    right = pill(c, right, 10, ch2.c_str(), pad.chain == "solana" ? SOL : BLUE) - 6;
  }

  // subtitle — the agent holding the baton, and what it can spend
  String sub = pad.agent.length() ? pad.agent : String("no agent");
  if (pad.dayLimit > 0) {
    sub += "  -  $"; sub += (pad.spentToday >= 0 ? pad.spentToday : 0);
    sub += " of $";  sub += pad.dayLimit; sub += " today";
  }
  if (!pad.remembers) sub = "memory wiped — running on fallback limits";
  textClip(c, 12, 40, W - 24, 1, pad.remembers ? MUTE : WARN, sub);

  // price — the chart's close when it is for this market, else /pad's
  const bool fresh = ch.ok && ch.symbol == pad.market;
  const float px = (fresh && ch.price > 0) ? ch.price : pad.price;
  char buf[40];
  fmtPrice(buf, sizeof buf, px);
  const uint8_t psize = strlen(buf) <= 7 ? 5 : 4;
  text(c, 12, 56, psize, px > 0 ? INK : MUTE, buf);

  // 24h move, and unrealised P&L under it
  int ry = 58;
  if (fresh && ch.hasChange) {
    snprintf(buf, sizeof buf, "%+.2f%%", ch.change24h);
    textR(c, W - 12, ry, 2, ch.change24h >= 0 ? UP : DOWN, buf);
    textR(c, W - 12, ry + 20, 1, MUTE, "24h");
    ry += 36;
  }
  if (pad.hasPnl) {
    snprintf(buf, sizeof buf, "%+.2f", pad.unrealised);
    textR(c, W - 12, ry, 1, pad.unrealised >= 0 ? UP : DOWN, buf);
    textR(c, W - 12, ry + 12, 1, GRID, "unreal.");
  }

  // chart — a line with the area under it, green if it ends above where it began
  const int X0 = 12, X1 = W - 12, Y0 = 118, Y1 = H - BANNER_H - 16;
  c.drawFastHLine(X0, Y1, X1 - X0, GRID);
  if (fresh && ch.n >= 2 && ch.hi > ch.lo) {
    const bool rising = ch.closes[ch.n - 1] >= ch.closes[0];
    const uint16_t line = rising ? UP : DOWN, fill = rising ? UP_DIM : DOWN_DIM;
    int pxx = -1, pyy = -1;
    for (int i = 0; i < ch.n; i++) {
      int x = X0 + (int)((long)(X1 - X0) * i / (ch.n - 1));
      int y = Y1 - (int)((ch.closes[i] - ch.lo) / (ch.hi - ch.lo) * (Y1 - Y0));
      if (pxx >= 0) {
        for (int xx = pxx + 1; xx <= x; xx++) {
          int yy = pyy + (y - pyy) * (xx - pxx) / (x - pxx);
          c.drawFastVLine(xx, yy, Y1 - yy, fill);
        }
        c.drawLine(pxx, pyy, x, y, line);
        c.drawLine(pxx, pyy - 1, x, y - 1, line);
      }
      pxx = x; pyy = y;
    }
    c.fillCircle(pxx, pyy, 3, line);
    fmtPrice(buf, sizeof buf, ch.hi); text(c, X0, Y0 - 10, 1, GRID, buf);
    fmtPrice(buf, sizeof buf, ch.lo); text(c, X0, Y1 + 4,  1, GRID, buf);
    snprintf(buf, sizeof buf, "%uh", (unsigned)(ch.n - 1));
    textR(c, X1, Y1 + 4, 1, GRID, buf);
  } else {
    const char *why = ch.error.length() ? ch.error.c_str()
                    : !pad.chainOk      ? "the chain is not answering"
                                        : "waiting for the chart";
    text(c, X0, (Y0 + Y1) / 2 - 4, 1, GRID, why);
  }

  drawHoursBanner(c, pad);
}

/**
 * A decision is waiting on a human. This screen exists because the pad never
 * signs anything on its own: it can reason its way to a trade, but a person
 * presses ✓. So the ask is the whole screen, not a pill in a corner.
 */
void drawConfirm(GFXcanvas16 &c, const PadState &pad, const ChartState &ch) {
  const bool sell = pad.verdict.startsWith("SELL") || pad.verdict.indexOf("SELL") >= 0;
  const uint16_t accent = sell ? DOWN : UP;

  c.fillRect(0, 0, W, 4, accent);
  pillSolid(c, W - 12, 12, "CONFIRM", accent, BG);

  // the ask, as large as it goes
  text(c, 12, 14, 3, accent, sell ? "SELL" : "BUY");
  text(c, 12, 46, 4, INK, pad.market.length() ? pad.market.c_str() : "--");

  char buf[48];
  const float px = (ch.ok && ch.symbol == pad.market && ch.price > 0) ? ch.price : pad.price;
  if (pad.dayLimit > 0 || px > 0) {
    if (px > 0) {
      char p[24]; fmtPrice(p, sizeof p, px);
      snprintf(buf, sizeof buf, "at %s", p);
      text(c, 12, 86, 2, MUTE, buf);
    }
  }

  // why it is being asked at all — the gate's own words, wrapped
  const int wy = 108;
  text(c, 12, wy, 1, GRID, "WHY");
  String why = pad.verdict.length() ? pad.verdict : String("the desk proposed this");
  wrap(c, 12, wy + 14, W - 24, 1, MUTE, ascii(why), 3);

  // the two targets, mirroring the green and red keys under the operator's hand
  const int by = H - BANNER_H - 44;
  c.drawRoundRect(12, by, 130, 34, 8, UP);
  text(c, 12 + (130 - tw(2, "YES")) / 2, by + 9, 2, UP, "YES");
  c.drawRoundRect(W - 12 - 130, by, 130, 34, 8, DOWN);
  text(c, W - 12 - 130 + (130 - tw(2, "NO")) / 2, by + 9, 2, DOWN, "NO");

  drawHoursBanner(c, pad);
}

/**
 * The boot card. Checks the wiring and the way up before there is any data:
 * palette bars, a border on the panel's very edge, and an arrow that must point
 * up the slant. Wrong way round? `rot 3` (or `rot 1`) on telnet.
 */
static void drawBoot(GFXcanvas16 &c, uint8_t rotation) {
  c.fillScreen(BG);
  const uint16_t bars[6] = {UP, DOWN, WARN, SOL, INK, MUTE};
  for (int i = 0; i < 6; i++) c.fillRect(i * W / 6, 0, W / 6 + 1, 8, bars[i]);
  c.drawRect(0, 0, W, H, GRID);
  c.setTextWrap(false);

  text(c, 14, 40, 4, INK, "xorr-pad");
  text(c, 14, 82, 1, MUTE, "tokenized equities, on your desk");

  text(c, 14, 118, 1, GRID, "DISPLAY");
  char b[48];
  snprintf(b, sizeof b, "ILI9341  %dx%d  rot %u", W, H, rotation);
  text(c, 14, 132, 1, MUTE, b);
  text(c, 14, 152, 1, GRID, "IF THE ARROW POINTS DOWN THE SLANT");
  text(c, 14, 166, 1, MUTE, "telnet in, type  rot 1  or  rot 3");

  c.fillTriangle(272, 40, 248, 82, 296, 82, UP);
  c.fillRect(264, 82, 17, 54, UP);
  text(c, 260, 144, 2, UP, "UP");

  banner(c, WARN, "CONNECTING", "joining wifi, then the desk");
}

/**
 * One frame. Which screen to show is a property of the state, not a mode the
 * firmware keeps: a pending decision outranks everything, and an unreachable
 * desk outranks a stale price.
 */
static void drawFrame(GFXcanvas16 &c, const PadState &pad, const ChartState &ch) {
  c.fillScreen(BG);
  c.setTextWrap(false);
  if (!pad.ok)          drawOffline(c);
  else if (pad.pending) drawConfirm(c, pad, ch);
  else                  drawHome(c, pad, ch);
}

}  // namespace ui
