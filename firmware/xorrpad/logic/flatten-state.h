// MIT · Copyright (c) 2026 Nivesh Gajengi
#pragma once
#include <string>
#include <vector>
#include "safety.h"
namespace xorr {
struct Flatten {
 std::string id,fingerprint,state,message,legId;
 std::vector<std::string> rows;uint32_t at=0,ttl=0;unsigned orders=0,perps=0,outcomes=0,page=0;
 bool visible()const{return !id.empty();}
 bool live(uint32_t now)const{return state=="awaiting" && ttl && uint32_t(now-at)<ttl;}
 bool review(const std::string &signal)const{return state=="executing" && !legId.empty() && signal==legId;}
};
class FlattenConfirm {
 Hold hold;uint32_t connection=0;bool released=true,used=false;
public:
 void offer(uint32_t epoch){hold.release();connection=epoch;released=true;used=false;}
 void key(bool down,bool visible,uint32_t epoch,uint32_t now){
  if(!down){hold.release();released=true;return;}
  if(visible && released && !used && connection==epoch)hold.press(now);
 }
 bool due(const Flatten &p,bool killed,bool rearming,bool online,uint32_t epoch,uint32_t now){
  if(!p.live(now) || !killed || rearming || !online || connection!=epoch){hold.release();return false;}
  if(used || hold.elapsed(now)<800)return false;used=true;hold.release();return true;
 }
 float progress(uint32_t now)const{return hold.progress(now,800);}
};
}
