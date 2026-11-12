#pragma once
#include <algorithm>
#include <cstdint>
#include <string>
#include <vector>

namespace xorr {
constexpr uint16_t rgb565(uint32_t rgb) {
  return uint16_t(((rgb >> 8) & 0xf800) | ((rgb >> 5) & 0x07e0) | ((rgb >> 3) & 0x001f));
}
constexpr uint16_t night = rgb565(0x030304), ink = rgb565(0xf3f0e8),
  lime = rgb565(0xc8f53c), mint = rgb565(0x0dd87e),
  cobalt = rgb565(0x2f5bff), lavender = rgb565(0xb7a6ff);

inline bool confirmationVisible(bool online,bool pending,bool factory,bool killed,bool updating,bool error,bool pairing) {
  return online && pending && !factory && !killed && !updating && !error && !pairing;
}

// Fixed-width pages keep every character, including long words and line breaks.
inline std::vector<std::string> replyLines(const std::string &s, size_t columns = 24) {
  std::vector<std::string> lines;
  if (!columns) return lines;
  size_t start=0;
  while(start<s.size()) {
    size_t newline=s.find('\n',start);
    size_t end=std::min(start+columns,s.size());
    bool hard=newline!=std::string::npos && newline<end;
    if(hard)end=newline;
    else if(end<s.size()) {
      size_t space=s.rfind(' ',end-1);
      if(space!=std::string::npos && space>=start)end=space+1;
    }
    lines.push_back(s.substr(start,end-start));
    start=end+(hard?1:0);
  }
  return lines;
}
inline size_t replyPages(size_t lines) { return std::max(size_t(1), (lines + 7) / 8); }
inline size_t replyPage(uint32_t now, uint32_t started, size_t lines) {
  return (uint32_t(now - started) / 6000) % replyPages(lines);
}
} // namespace xorr
