#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
namespace xorr {
struct LedColor { uint8_t r,g,b; };
inline LedColor ledScale(LedColor color,float level) {
  level=std::clamp(level,0.f,1.f);
  return {uint8_t(color.r*level),uint8_t(color.g*level),uint8_t(color.b*level)};
}
// Peak output is limited to 100/255 for this single close-range WS2812.
inline LedColor statusLed(uint32_t now,bool killed,bool error,bool pending,bool fill,float hold=-1,bool liqGuard=false) {
  if(killed)return {100,0,0};
  if(liqGuard)return ledScale({100,0,0},(now/180)%2?1.f:.15f);
  if(error)return {100,63,0}; // amber
  if(hold>=0)return ledScale({200,245,60},std::clamp(hold,0.08f,1.f)*100.f/255.f);
  if(pending) {
    float wave=(1-std::cos(float(now%1200)*6.283185307f/1200))*.5f;
    return ledScale({200,245,60},(25+75*wave)/255.f);
  }
  if(fill)return (now/120)%2?ledScale({13,216,126},100.f/255.f):LedColor{0,0,0};
  float breath=(1-std::cos(float(now%3000)*6.283185307f/3000))*.5f;
  return ledScale({47,91,255},(5+35*breath)/255.f);
}
}
