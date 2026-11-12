#include "doctest.h"
#include "../xorrpad/logic/knob.h"
using namespace xorr;
TEST_CASE("S3 knob press cycles size leverage slippage size") {
  KnobControl k;CHECK(k.mode==KnobControl::Size);k.cycle();CHECK(k.mode==KnobControl::Leverage);
  k.cycle();CHECK(k.mode==KnobControl::Slippage);k.cycle();CHECK(k.mode==KnobControl::Size);
}
TEST_CASE("S3 first rotation never accelerates even at boot") {
  KnobControl k;CHECK(k.turn(1,1)==101);
}
TEST_CASE("S3 acceleration boundaries are forty and one hundred milliseconds") {
  CHECK(acceleration(39)==10);CHECK(acceleration(40)==4);CHECK(acceleration(99)==4);CHECK(acceleration(100)==1);
}
TEST_CASE("S3 fast and medium rotation accelerate in both directions") {
  KnobControl k;CHECK(k.turn(1,1000)==101);CHECK(k.turn(1,1039)==111);
  CHECK(k.turn(-1,1079)==107);CHECK(k.turn(-1,1179)==106);
}
TEST_CASE("S3 knob modes keep independent bounded values") {
  KnobControl k;k.cycle();for(int i=0;i<100;++i)k.turn(1,i);CHECK(k.values[1]==100);
  k.cycle();for(int i=0;i<600;++i)k.turn(1,i);CHECK(k.values[2]==5000);
  CHECK(k.values[0]==100);k.cycle();k.values[0]=1000000;CHECK(k.turn(1,1000)==1000000);
  for(int mode=0;mode<3;++mode){k.values[k.mode]=1;CHECK(k.turn(-1,2000+mode)==1);k.cycle();}
}
TEST_CASE("S3 invalid knob deltas cannot jump settings") {
  KnobControl k;CHECK(k.turn(400,0)==100);CHECK(k.turn(0,0)==100);
}
TEST_CASE("S3 rotation interval handles clock wrap") {
  KnobControl k;k.turn(1,0xfffffff0u);CHECK(k.turn(1,16)==111);
}
TEST_CASE("S3 encoder emits one detent for a complete quadrature sequence") {
  Encoder e;e.begin(0);CHECK(e.sample(2)==0);CHECK(e.sample(3)==0);CHECK(e.sample(1)==0);CHECK(e.sample(0)==1);
  CHECK(e.sample(1)==0);CHECK(e.sample(3)==0);CHECK(e.sample(2)==0);CHECK(e.sample(0)==-1);
}
TEST_CASE("S3 encoder bounce reversals and invalid transitions cannot invent detents") {
  Encoder e;e.begin(0);CHECK(e.sample(2)==0);CHECK(e.sample(0)==0);
  CHECK(e.sample(3)==0);CHECK(e.sample(1)==0);CHECK(e.sample(0)==0);
  CHECK(e.sample(2)==0);CHECK(e.sample(3)==1);
}
TEST_CASE("S3 short knob press emits one click after debounce") {
  KnobButton b;CHECK(b.sample(true,0)==KnobButton::None);CHECK(b.sample(true,19)==KnobButton::None);
  CHECK(b.sample(true,20)==KnobButton::None);CHECK(b.sample(false,100)==KnobButton::None);
  CHECK(b.sample(false,120)==KnobButton::Click);CHECK(b.sample(false,121)==KnobButton::None);
}
TEST_CASE("S3 long knob press starts PTT once and ends without cycling") {
  KnobButton b;b.sample(true,0);b.sample(true,20);CHECK(b.sample(true,619)==KnobButton::None);
  CHECK(b.sample(true,620)==KnobButton::TalkStart);CHECK(b.sample(true,900)==KnobButton::None);
  b.sample(false,1000);CHECK(b.sample(false,1020)==KnobButton::TalkEnd);CHECK(b.sample(false,1021)==KnobButton::None);
}
TEST_CASE("S3 button bounce cannot create a press or a voice event") {
  KnobButton b;b.sample(true,0);b.sample(false,10);CHECK(b.sample(false,30)==KnobButton::None);
  CHECK(b.sample(false,700)==KnobButton::None);
}
TEST_CASE("S3 releasing before long-press boundary cannot start voice during debounce") {
  KnobButton b;b.sample(true,0);b.sample(true,20);b.sample(false,619);
  CHECK(b.sample(false,620)==KnobButton::None);CHECK(b.sample(false,639)==KnobButton::Click);
}
TEST_CASE("S3 button debounce and PTT handle clock wrap") {
  KnobButton b;b.sample(true,0xfffffff0u);b.sample(true,4);CHECK(b.sample(true,604)==KnobButton::TalkStart);
}
