#include "doctest.h"
#include "../xorrpad/logic/factory.h"
using namespace xorr;
static void keys(FactoryProgress &p) {
  for(int r=0;r<4;r++)for(int c=0;c<4;c++)p.key(r,c,true,100);
}
TEST_CASE("factory requires both physical chord keys") {
  CHECK_FALSE(FactoryProgress::chord(true,false));
  CHECK_FALSE(FactoryProgress::chord(false,true));
  CHECK(FactoryProgress::chord(true,true));
  CHECK(cell(0,0)==0); CHECK(cell(3,2)==12); CHECK(cell(3,3)==13);
  CHECK(cell(0,3)==-1); CHECK(cell(1,3)==-1);
}
TEST_CASE("factory counts unique physical keys and ignores unused cells and releases") {
  FactoryProgress p;p.begin(0);
  p.key(0,0,false,1);p.key(0,3,true,1);CHECK(p.keys==0);
  for(int i=0;i<20;i++)p.key(0,0,true,1);
  CHECK(p.keys==1);CHECK(p.stage==FactoryProgress::Keys);CHECK_FALSE(p.pass());
  keys(p);CHECK(p.keys==0x3fff);CHECK(p.stage==FactoryProgress::Knob);
}
TEST_CASE("factory cannot preapprove later stages") {
  FactoryProgress p;p.begin(0);p.knob(true,true,0);p.level(1000,0);p.radio(true,true,0);
  CHECK_FALSE(p.turned);CHECK_FALSE(p.mic);CHECK_FALSE(p.wifi);
  keys(p);p.knob(true,false,100);CHECK(p.stage==FactoryProgress::Knob);
  p.knob(false,true,101);CHECK(p.stage==FactoryProgress::Mic);
  p.level(600,102);CHECK(p.micLevel==600);CHECK_FALSE(p.mic);
  p.level(601,103);CHECK(p.stage==FactoryProgress::Speaker);
  CHECK_FALSE(p.speaker);CHECK_FALSE(p.tft);CHECK_FALSE(p.led);
}
TEST_CASE("factory observes RGB and completes only with scan and advertising") {
  FactoryProgress p;p.begin(0);keys(p);p.knob(true,true,100);p.level(1000,101);
  p.key(2,1,true,102);CHECK(p.speaker);CHECK(p.stage==FactoryProgress::Tft);
  p.key(2,1,true,103);CHECK(p.tft);CHECK(p.stage==FactoryProgress::Led);
  p.key(2,1,true,1602);CHECK_FALSE(p.led);
  p.key(2,1,true,1603);CHECK(p.led);CHECK(p.stage==FactoryProgress::Radio);
  p.radio(true,false,1604);CHECK_FALSE(p.pass());
  p.radio(false,true,1605);CHECK_FALSE(p.pass());
  p.radio(true,true,1606);CHECK(p.pass());CHECK(p.stage==FactoryProgress::Done);
}
TEST_CASE("factory NO rejects visual or audio inspection") {
  for(auto stage:{FactoryProgress::Speaker,FactoryProgress::Tft,FactoryProgress::Led}) {
    FactoryProgress p;p.begin(0);p.stage=stage;p.key(2,0,true,2);
    CHECK(p.stage==FactoryProgress::Done);CHECK_FALSE(p.pass());
  }
}
TEST_CASE("factory timeout and repeated run are bounded across millis wrap") {
  FactoryProgress p;p.begin(0xffffff00);
  CHECK_FALSE(p.expired(uint32_t(0xffffff00+179999u)));
  CHECK(p.expired(uint32_t(0xffffff00+180000u)));
  keys(p);p.begin(5);CHECK(p.keys==0);CHECK(p.stage==FactoryProgress::Keys);
}
TEST_CASE("factory reset needs uninterrupted ten second physical hold and fires once") {
  FactoryReset r;CHECK_FALSE(r.tick(true,0));CHECK(r.remaining(0)==10);
  CHECK_FALSE(r.tick(true,9999));CHECK(r.remaining(9999)==1);
  CHECK(r.tick(true,10000));CHECK(r.remaining(10000)==0);
  CHECK_FALSE(r.tick(true,11000));CHECK_FALSE(r.tick(false,11001));CHECK_FALSE(r.active);
  CHECK_FALSE(r.tick(true,12000));CHECK(r.remaining(12000)==10);
}
TEST_CASE("factory reset cancellation cannot accumulate time and handles wrap") {
  FactoryReset r;CHECK_FALSE(r.tick(true,0));CHECK_FALSE(r.tick(false,9000));
  CHECK_FALSE(r.tick(true,9001));CHECK_FALSE(r.tick(true,10000));
  r.tick(false,11000);r.tick(true,0xffffff00);
  CHECK_FALSE(r.tick(true,uint32_t(0xffffff00+9999u)));
  CHECK(r.tick(true,uint32_t(0xffffff00+10000u)));
}
