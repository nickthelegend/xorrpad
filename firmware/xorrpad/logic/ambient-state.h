// MIT · Copyright (c) 2026 Nivesh Gajengi
#pragma once
#include <cstdint>
#include <cmath>
#include <string>
#include <vector>
namespace xorr {
struct Ambient {
 bool visible=false;uint32_t receivedAt=0;uint64_t epoch=0;
 double price=NAN,pnl=NAN,nextFunding=NAN;std::vector<double> closes;
 std::string hours,crew;
 bool fresh(uint32_t now)const{return epoch>=1700000000 && uint32_t(now-receivedAt)<90000;}
};
// Suppress the entire wake gesture, including a long knob press and its release.
struct AmbientWake {
 uint16_t keys=0;bool knobHeld=false;
 bool key(uint16_t bit,bool pressed,bool visible){
  if(!pressed){bool consumed=keys&bit;keys&=~bit;return consumed;}
  if(visible){keys|=bit;return true;}return (keys&bit)!=0;
 }
 bool knob(bool down,bool event,bool ended,bool visible){
  if(visible && (down || event)){knobHeld=down && !ended;return true;}
  if(knobHeld){if(ended)knobHeld=false;return true;}return false;
 }
};
}
