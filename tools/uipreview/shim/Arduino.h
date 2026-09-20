#pragma once
// ─────────────────────────────────────────────────────────────────────────────
// Just enough Arduino to compile ui.h and Adafruit_GFX on a laptop.
//
// Only what those two actually touch: a Print base class, an Arduino-shaped
// String, and the handful of macros GFX expects. Nothing here is emulated
// behaviour — it is the same code path the board takes, with the platform
// headers stubbed out from under it.
// ─────────────────────────────────────────────────────────────────────────────
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <string>
#include <algorithm>

#ifndef PROGMEM
#define PROGMEM
#endif
#define pgm_read_byte(a)  (*(const uint8_t *)(a))
#define pgm_read_word(a)  (*(const uint16_t *)(a))
#define pgm_read_dword(a) (*(const uint32_t *)(a))
#define pgm_read_pointer(a) ((void *)pgm_read_dword(a))
#define F(x) (x)
#ifndef _min
#define _min(a, b) ((a) < (b) ? (a) : (b))
#endif
#ifndef _max
#define _max(a, b) ((a) > (b) ? (a) : (b))
#endif

using std::min;
using std::max;

typedef uint8_t byte;
typedef bool boolean;

// GFX overloads getTextBounds on this AVR flash-string marker type. It is a
// distinct type on-target; here it only has to exist and not collide.
class __FlashStringHelper;

inline float radians(float deg) { return deg * 0.017453292519943295f; }
inline float degrees(float rad) { return rad * 57.29577951308232f; }

inline uint32_t millis() { return 0; }
inline void delay(uint32_t) {}
inline long random(long a, long b) { return a + (b > a ? std::rand() % (b - a) : 0); }
inline void yield() {}

/** Arduino's String, to the extent ui.h uses it. */
class String {
public:
  String() {}
  String(const char *s) : _s(s ? s : "") {}
  String(char c) : _s(1, c) {}   // Arduino has this; without it char picks the int overload
  String(const std::string &s) : _s(s) {}
  String(int v) { char b[24]; snprintf(b, sizeof b, "%d", v); _s = b; }
  String(unsigned v) { char b[24]; snprintf(b, sizeof b, "%u", v); _s = b; }
  String(float v) { char b[32]; snprintf(b, sizeof b, "%.2f", v); _s = b; }

  size_t length() const { return _s.size(); }
  const char *c_str() const { return _s.c_str(); }
  char operator[](int i) const { return _s[(size_t)i]; }

  bool operator==(const char *o) const { return _s == (o ? o : ""); }
  bool operator==(const String &o) const { return _s == o._s; }
  bool operator!=(const char *o) const { return !(*this == o); }

  String operator+(const String &o) const { return String(_s + o._s); }
  String operator+(const char *o) const { return String(_s + (o ? o : "")); }
  String &operator+=(const String &o) { _s += o._s; return *this; }
  String &operator+=(const char *o) { if (o) _s += o; return *this; }
  String &operator+=(int v) { char b[24]; snprintf(b, sizeof b, "%d", v); _s += b; return *this; }

  int indexOf(const char *n) const {
    auto p = _s.find(n ? n : "");
    return p == std::string::npos ? -1 : (int)p;
  }
  bool startsWith(const char *p) const {
    return p && _s.rfind(p, 0) == 0;
  }
  String substring(int a, int b) const {
    a = std::max(0, a); b = std::min((int)_s.size(), b);
    return b > a ? String(_s.substr((size_t)a, (size_t)(b - a))) : String();
  }
  void trim() {
    size_t a = _s.find_first_not_of(" \t\r\n");
    size_t b = _s.find_last_not_of(" \t\r\n");
    _s = (a == std::string::npos) ? "" : _s.substr(a, b - a + 1);
  }
  void toUpperCase() { for (auto &ch : _s) ch = (char)toupper((unsigned char)ch); }

private:
  std::string _s;
};

inline String operator+(const char *a, const String &b) { return String(a) + b; }

/** GFX draws text by calling write() on this. */
class Print {
public:
  virtual ~Print() {}
  virtual size_t write(uint8_t) = 0;
  virtual size_t write(const uint8_t *b, size_t n) {
    size_t w = 0; for (size_t i = 0; i < n; i++) w += write(b[i]); return w;
  }
  size_t print(const char *s) { return s ? write((const uint8_t *)s, strlen(s)) : 0; }
  size_t print(const String &s) { return print(s.c_str()); }
  size_t print(char ch) { return write((uint8_t)ch); }
  size_t print(int v) { char b[24]; snprintf(b, sizeof b, "%d", v); return print(b); }
  size_t print(unsigned v) { char b[24]; snprintf(b, sizeof b, "%u", v); return print(b); }
  size_t println(const char *s = "") { size_t n = print(s); n += write('\n'); return n; }
};
