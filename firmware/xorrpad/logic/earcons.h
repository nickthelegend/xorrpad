// MIT · Copyright (c) 2026 Nivesh Gajengi
#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <ArduinoJson.h>
namespace xorr {
enum class Chime {
#define EARCON(kind, name, a, b, c, d, peak) kind,
#include "earcons-table.h"
#undef EARCON
};
struct Cue { int hz, ms; };
struct Earcon { const char *name; std::array<Cue,2> cues; int peak; };
inline Earcon earcon(Chime kind) {
 switch(kind) {
#define EARCON(kind, name, a, b, c, d, peak) case Chime::kind: return {#name, {{{a,b},{c,d}}}, peak};
#include "earcons-table.h"
#undef EARCON
 }
 return {"",{{{0,0},{0,0}}},0};
}
inline std::array<Cue,2> chime(Chime kind){return earcon(kind).cues;}
constexpr unsigned earconRate=16000;
inline unsigned earconLength(Chime kind){auto c=chime(kind);return (c[0].ms+c[1].ms)*earconRate/1000;}
// 3ms raised-cosine edges suppress clicks. Phase restarts at each note.
inline int16_t earconSample(Chime kind,unsigned index) {
 auto e=earcon(kind);
 for(auto c:e.cues){
  unsigned n=c.ms*earconRate/1000;
  if(index<n){
   double edge=std::min(1.,double(std::min(index,n-1-index))/48.);
   double envelope=(1.-std::cos(3.141592653589793*edge))*.5;
   return int16_t(e.peak*envelope*std::sin(6.283185307179586*c.hz*index/earconRate));
  }
  index-=n;
 }
 return 0;
}
struct SoundOptions {
 int volume=80;bool mute=false,knobTick=false;int quietStart=-1,quietEnd=-1;
 bool allowed(Chime kind,int utcMinute)const{
  if(mute || volume==0 || (kind==Chime::Tick && !knobTick))return false;
  if(quietStart<0)return true;
  if(utcMinute<0)return false; // Unknown clock: respect configured quiet hours.
  return !(quietStart==quietEnd || (quietStart<quietEnd ? utcMinute>=quietStart && utcMinute<quietEnd : utcMinute>=quietStart || utcMinute<quietEnd));
 }
};
inline bool soundOptions(JsonVariantConst d,SoundOptions &out){
 if(!d.is<JsonObjectConst>() || d.size()!=4)return false;
 for(JsonPairConst p:d.as<JsonObjectConst>()){
  const char *k=p.key().c_str();
  if(strcmp(k,"volume") && strcmp(k,"mute") && strcmp(k,"knobTick") && strcmp(k,"quietHours"))return false;
 }
 if(!d["volume"].is<int>() || d["volume"].as<int>()<0 || d["volume"].as<int>()>100 || !d["mute"].is<bool>() || !d["knobTick"].is<bool>())return false;
 SoundOptions next;next.volume=d["volume"];next.mute=d["mute"];next.knobTick=d["knobTick"];
 if(!d["quietHours"].isNull()){
  auto q=d["quietHours"];
  if(!q.is<JsonObjectConst>() || q.size()!=2 || !q["startMinute"].is<int>() || !q["endMinute"].is<int>())return false;
  next.quietStart=q["startMinute"];next.quietEnd=q["endMinute"];
  if(next.quietStart<0 || next.quietStart>1439 || next.quietEnd<0 || next.quietEnd>1439)return false;
 }
 out=next;return true;
}
}
