#pragma once
#include "safety.h"
namespace xorr {
class KnobControl {
  bool turned=false;
  uint32_t last=0;
public:
  enum Mode {Size,Leverage,Slippage};
  Mode mode=Size;
  double values[3]={100,1,50};
  void cycle(){mode=Mode((mode+1)%3);}
  const char *name()const{return mode==Size?"size":mode==Leverage?"leverage":"slippage";}
  double turn(int delta,uint32_t now) {
    if(delta!=1 && delta!=-1)return values[mode];
    uint32_t interval=turned?uint32_t(now-last):1000;
    turned=true;last=now;
    return values[mode]=knob(values[mode],delta,interval,1,mode==Size?1000000:mode==Leverage?100:5000);
  }
};
class Encoder {
  int prev=0,accum=0;
public:
  void begin(int state){prev=state&3;accum=0;}
  int sample(int state) {
    state&=3;
    if((prev^state)==3) {prev=state;accum=0;return 0;}
    static const int8_t table[16]={0,-1,1,0,1,0,0,-1,-1,0,0,1,0,1,-1,0};
    accum+=table[(prev<<2)|state];prev=state;
    if(std::abs(accum)<4)return 0;
    int delta=accum>0?1:-1;accum=0;return delta;
  }
};
class KnobButton {
  bool raw=false,pressed=false,talking=false;
  uint32_t changed=0;
  Hold hold;
public:
  enum Event {None,Click,TalkStart,TalkEnd};
  Event sample(bool down,uint32_t now) {
    if(down!=raw){raw=down;changed=now;}
    if(uint32_t(now-changed)>=20 && pressed!=raw) {
      pressed=raw;
      if(pressed)hold.press(now);
      else {
        hold.release();
        if(talking){talking=false;return TalkEnd;}
        return Click;
      }
    }
    // Do not start PTT during release debounce.
    if(raw && hold.ready(now,600)){talking=true;return TalkStart;}
    return None;
  }
};
}
