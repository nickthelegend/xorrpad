// ─────────────────────────────────────────────────────────────────────────────
// preview.cpp — render the pad's real screens on a laptop, as PNGs.
//
// This compiles firmware/xorrpad/ui.h — the same file the ESP32 runs, not a
// mock of it — against Adafruit_GFX and a tiny Arduino shim. Every frame it
// writes is pixel-for-pixel what the panel will show.
//
// The point is to be able to judge a layout by looking at it. Flashing a board
// to find out that a price overlaps a pill is a slow way to learn something a
// PNG would have told you in a second.
//
//   make && ./preview out/
// ─────────────────────────────────────────────────────────────────────────────
#include "shim/Arduino.h"
#include <Adafruit_GFX.h>
#include "../../firmware/xorrpad/ui.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <cmath>

// ── a minimal PNG writer (zlib "stored" blocks — no dependencies) ────────────
static uint32_t crcTable[256];
static void initCrc() {
  for (uint32_t n = 0; n < 256; n++) {
    uint32_t c = n;
    for (int k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320u ^ (c >> 1) : c >> 1;
    crcTable[n] = c;
  }
}
static uint32_t crc(const uint8_t *b, size_t n, uint32_t c = 0xFFFFFFFFu) {
  for (size_t i = 0; i < n; i++) c = crcTable[(c ^ b[i]) & 0xFF] ^ (c >> 8);
  return c;
}
static void be32(std::vector<uint8_t> &v, uint32_t x) {
  v.push_back(x >> 24); v.push_back(x >> 16); v.push_back(x >> 8); v.push_back(x);
}
static void chunk(std::vector<uint8_t> &out, const char *type, const std::vector<uint8_t> &data) {
  be32(out, (uint32_t)data.size());
  std::vector<uint8_t> td(type, type + 4);
  td.insert(td.end(), data.begin(), data.end());
  out.insert(out.end(), td.begin(), td.end());
  be32(out, crc(td.data(), td.size()) ^ 0xFFFFFFFFu);
}

/** Write the canvas as a PNG, scaled `scale`x with nearest-neighbour. */
static bool writePng(const char *path, const uint16_t *px, int w, int h, int scale) {
  const int W = w * scale, H = h * scale;
  std::vector<uint8_t> raw;
  raw.reserve((size_t)H * (W * 3 + 1));
  for (int y = 0; y < H; y++) {
    raw.push_back(0);                                  // filter: none
    for (int x = 0; x < W; x++) {
      uint16_t c = px[(y / scale) * w + (x / scale)];
      uint8_t r = (c >> 11) & 0x1F, g = (c >> 5) & 0x3F, b = c & 0x1F;
      raw.push_back((uint8_t)((r * 255 + 15) / 31));
      raw.push_back((uint8_t)((g * 255 + 31) / 63));
      raw.push_back((uint8_t)((b * 255 + 15) / 31));
    }
  }
  // zlib stream with stored (uncompressed) deflate blocks
  std::vector<uint8_t> z{0x78, 0x01};
  size_t off = 0;
  while (off < raw.size()) {
    size_t n = std::min<size_t>(65535, raw.size() - off);
    z.push_back(off + n >= raw.size() ? 1 : 0);
    z.push_back(n & 0xFF); z.push_back(n >> 8);
    z.push_back(~n & 0xFF); z.push_back((~n >> 8) & 0xFF);
    z.insert(z.end(), raw.begin() + off, raw.begin() + off + n);
    off += n;
  }
  uint32_t a = 1, b = 0;
  for (uint8_t c : raw) { a = (a + c) % 65521; b = (b + a) % 65521; }
  be32(z, (b << 16) | a);

  std::vector<uint8_t> out{0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};
  std::vector<uint8_t> ihdr;
  be32(ihdr, W); be32(ihdr, H);
  ihdr.push_back(8); ihdr.push_back(2); ihdr.push_back(0); ihdr.push_back(0); ihdr.push_back(0);
  chunk(out, "IHDR", ihdr);
  chunk(out, "IDAT", z);
  chunk(out, "IEND", {});

  FILE *f = fopen(path, "wb");
  if (!f) return false;
  fwrite(out.data(), 1, out.size(), f);
  fclose(f);
  return true;
}

// ── the scenarios worth looking at ───────────────────────────────────────────
struct Scene { const char *file; const char *note; };

static void fillChart(ChartState &ch, const char *sym, float base, float drift, int n = 48) {
  ch.ok = true; ch.symbol = sym; ch.n = (uint8_t)n; ch.hasChange = true;
  ch.change24h = drift * 100;
  float lo = 1e9f, hi = -1e9f;
  for (int i = 0; i < n; i++) {
    float t = (float)i / (n - 1);
    float v = base * (1 + drift * t) + base * 0.006f * sinf(i * 0.7f) + base * 0.003f * sinf(i * 2.3f);
    ch.closes[i] = v;
    lo = std::min(lo, v); hi = std::max(hi, v);
  }
  ch.lo = lo; ch.hi = hi; ch.price = ch.closes[n - 1];
}

int main(int argc, char **argv) {
  initCrc();
  const char *dir = argc > 1 ? argv[1] : "out";
  const int scale = argc > 2 ? atoi(argv[2]) : 2;
  char cmd[512]; snprintf(cmd, sizeof cmd, "mkdir -p '%s'", dir); int _ = system(cmd); (void)_;

  GFXcanvas16 c(ui::W, ui::H);
  int made = 0;
  auto shot = [&](const char *name, const char *note) {
    char p[512]; snprintf(p, sizeof p, "%s/%s.png", dir, name);
    if (writePng(p, c.getBuffer(), ui::W, ui::H, scale)) {
      printf("  %-22s %s\n", name, note);
      made++;
    } else printf("  FAILED to write %s\n", p);
  };

  // 1. boot
  ui::drawBoot(c, 1);
  shot("01-boot", "wiring + orientation check, before any data");

  // 2. home, weekend — the case the whole product is about
  {
    PadState p; ChartState ch;
    p.ok = true; p.armed = true; p.remembers = true; p.chainOk = true;
    p.agent = "momentum\u00b7live"; p.market = "NVDAx"; p.chain = "solana"; p.venue = "jupiter";
    p.price = 221.67f; p.spentToday = 50; p.dayLimit = 300;
    p.hasPnl = true; p.unrealised = 12.40f;
    p.hoursState = "WEEKEND"; p.marketOpen = false; p.nyTime = "15:17";
    p.hoursNote = "shut on the NYSE - this trades anyway";
    fillChart(ch, "NVDAx", 218.0f, 0.017f);
    ui::drawFrame(c, p, ch);
    shot("02-home-weekend", "NYSE shut, the pad quotes anyway");
  }

  // 3. home, open, falling
  {
    PadState p; ChartState ch;
    p.ok = true; p.armed = true; p.remembers = true; p.chainOk = true;
    p.agent = "risk"; p.market = "TSLAx"; p.chain = "solana";
    p.price = 364.14f; p.spentToday = 220; p.dayLimit = 300;
    p.hasPnl = true; p.unrealised = -31.08f;
    p.hoursState = "OPEN"; p.marketOpen = true; p.nyTime = "11:02";
    p.hoursNote = "the exchange is open and so are we";
    fillChart(ch, "372.0", 372.0f, -0.021f);
    ch.symbol = "TSLAx";
    ui::drawFrame(c, p, ch);
    shot("03-home-open-down", "market open, position under water");
  }

  // 4. confirm — the gate
  {
    PadState p; ChartState ch;
    p.ok = true; p.armed = true; p.remembers = true; p.chainOk = true; p.pending = true;
    p.signalId="layout-preview";p.signalDeadline=45000;p.autoAccept=true;
    p.agent = "momentum"; p.market = "NVDAx"; p.chain = "solana";
    p.price = 221.67f; p.verdict = "BUY: limits recalled from memory (max $100/trade); NYSE is closed and this trades anyway";
    p.hoursState = "AFTER"; p.marketOpen = false; p.nyTime = "17:44";
    // Existing native/JS canonical conformance vector, never a live quote.
    p.market="SOL";p.venue="Jupiter";p.signalSide="buy";p.signalSize="100";
    p.signalPrice="150.5";p.signalFee="0.25";p.fingerprint="AgrJHn";
    p.hoursNote = "shut on the NYSE - this trades anyway";
    fillChart(ch, "NVDAx", 219.0f, 0.012f);
    ui::drawFrame(c, p, ch);
    shot("04-confirm-buy", "canonical conformance vector layout, not a live quote");
  }

  // 5. stopped + memory wiped
  {
    PadState p; ChartState ch;
    p.ok = true; p.armed = false; p.remembers = false; p.chainOk = true;
    p.agent = "momentum"; p.market = "SPYx"; p.chain = "solana"; p.price = 768.04f;
    p.hoursState = "OVERNIGHT"; p.marketOpen = false; p.nyTime = "03:20";
    p.hoursNote = "shut on the NYSE - this trades anyway";
    fillChart(ch, "SPYx", 766.0f, 0.003f);
    ui::drawFrame(c, p, ch);
    shot("05-stopped-wiped", "kill switch on, memory gone");
  }

  // 7. offline
  {
    PadState p; ChartState ch;
    ui::drawFrame(c, p, ch);
    shot("07-offline", "no answer from the desk — says so, invents nothing");
  }

  // 8. no chart yet
  {
    PadState p; ChartState ch;
    p.ok = true; p.armed = true; p.remembers = true; p.chainOk = true;
    p.agent = "dca"; p.market = "AAPLx"; p.chain = "solana"; p.price = 335.63f;
    p.hoursState = "WEEKEND"; p.nyTime = "15:17";
    p.hoursNote = "shut on the NYSE - this trades anyway";
    ui::drawFrame(c, p, ch);
    shot("08-no-chart", "price known, history not yet in");
  }

  // Pure layout fixtures: real default labels and a historical devnet signature.
  {
    PadState p;ChartState ch;p.ok=true;p.keymapUntil=4000;
    const char *labels[]={"MOMENTUM","GRID","DCA","RISK","YIELD","REBALANCE","NO","YES","BUY","BASE","KILL","MIC","SELL","PORTFOLIO"};
    for(int i=0;i<14;i++)p.keyLabels[i]=labels[i];
    ui::drawFrame(c,p,ch);shot("09-keymap","all 14 programmable key labels");
    p.keymapUntil=0;p.receiptUntil=15000;
    p.receiptSignature="5hFEx7T33RLSekreevbuEZ1khnJojRi97eJ3EWndjpACwvxcFhtBfyPbRS8NQrcRtTW7ACcaCo2Be5kyxsqPnoKU";
    p.receiptExplorer=String("https://explorer.solana.com/tx/")+p.receiptSignature+"?cluster=devnet";
    ui::drawFrame(c,p,ch);shot("10-receipt","historical devnet receipt layout, not a new trade");
  }

  // P1 layout-only states. They contain no invented live quote or fill.
  {
    PadState p; ChartState ch; p.ok=true;
    p.reply="The pad keeps every character in an agent reply, including the last line. Replies scroll in eight-line pages every six seconds. A receipt or pending signal takes priority. Press a key to return to Market Pulse.";
    ui::drawFrame(c,p,ch);shot("11-agent-reply","layout text, first reply page");
    p.highContrast=true;
    ui::drawFrame(c,p,ch);shot("12-high-contrast","same reply with white text on night");
    p.reply="";p.positionCount=0;
    ui::drawPositions(c,p,0);shot("13-positions-empty","truthful empty portfolio");
    p.positionCount=-1;p.listening=true;
    ui::drawFrame(c,p,ch);shot("14-listening","quiet microphone waveform");
    p.listening=false;p.updating=true;p.otaProgress=0;
    ui::drawFrame(c,p,ch);shot("15-ota","update progress at start");
    p.updating=false;p.errorCode="DISPLAY_RAM";p.errorFix="Enable OPI PSRAM; reboot";
    ui::drawFrame(c,p,ch);shot("16-error","error code and one-line fix");
    p.errorCode="";p.killed=true;p.pairCode="------";
    ui::drawFrame(c,p,ch);shot("17-killed","latched kill instructions");
    std::vector<uint16_t> killed(c.getBuffer(),c.getBuffer()+ui::W*ui::H);
    p.pending=p.updating=p.listening=true;
    ui::drawFrame(c,p,ch);
    if(!std::equal(killed.begin(),killed.end(),c.getBuffer())) return 2;
  }

  // V3 layout exercise: public destination from system-v0.json; no trade execution.
  {
    PadState p;ChartState ch;p.ok=p.pending=p.clearSigning=p.blindAllowed=true;p.signalDeadline=120000;
    p.fingerprint="4Sf2XH"; // SHA-256/base58 of the captured system-v0 message.
    p.clearRows={"to So11111111111111111111111111111111111111112"};
    ui::drawFrame(c,p,ch);shot("18-clear-review","full transaction address review");
    p.blindSigning=true;p.blindAllowed=false;
    ui::drawFrame(c,p,ch);shot("19-blind-disabled","red blind-sign refusal");
    p.blindAllowed=p.clearReviewed=true;p.holdProgress=0.5;
    ui::drawFrame(c,p,ch);shot("20-blind-hold","extra three-second physical hold");
  }

  printf("\n%d frames -> %s/ (at %dx)\n", made, dir, scale);
  return made ? 0 : 1;
}
