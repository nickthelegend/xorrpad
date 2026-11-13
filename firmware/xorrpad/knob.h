#pragma once
#include "config.h"
#include "logic/knob.h"
class Knob {
  xorr::Encoder encoder;
  xorr::KnobButton button;
public:
  enum Event {None,Turn,Click,TalkStart,TalkEnd};
  int delta=0;
  void begin() {
    pinMode(KNOB_A,INPUT_PULLUP);pinMode(KNOB_B,INPUT_PULLUP);pinMode(KNOB_SW,INPUT_PULLUP);
    encoder.begin((digitalRead(KNOB_A)<<1)|digitalRead(KNOB_B));
  }
  bool down()const{return digitalRead(KNOB_SW)==LOW;}
  Event tick() {
    int turn=encoder.sample((digitalRead(KNOB_A)<<1)|digitalRead(KNOB_B));
    auto e=button.sample(digitalRead(KNOB_SW)==LOW,millis());
    if(e==xorr::KnobButton::Click)return Click;
    if(e==xorr::KnobButton::TalkStart)return TalkStart;
    if(e==xorr::KnobButton::TalkEnd)return TalkEnd;
    if(turn){delta=turn;return Turn;}
    return None;
  }
};
