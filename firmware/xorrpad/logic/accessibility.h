#pragma once
#include <algorithm>
#include <cstdint>
namespace xorr {
struct DisplayIdle {
  uint32_t last=0;
  void wake(uint32_t now){last=now;}
  bool blank(uint32_t now)const{return uint32_t(now-last)>=600000;}
  int brightness(uint32_t now,int value,bool night)const {
    if(blank(now))return 0;
    int level=std::clamp(value,1,255);
    if(night)level=std::min(level,40);
    return uint32_t(now-last)>=120000?std::max(1,level/8):level;
  }
};
// Reverse only the occupied action cells. Safety keys and matrix holes stay put.
inline uint8_t leftColumn(uint8_t column,const bool movable[4]) {
  if(column>=4 || !movable[column])return column;
  uint8_t columns[4],count=0,index=0;
  for(uint8_t c=0;c<4;++c)if(movable[c]){if(c==column)index=count;columns[count++]=c;}
  return columns[count-1-index];
}
}
