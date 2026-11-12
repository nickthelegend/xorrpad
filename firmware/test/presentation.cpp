#include "doctest.h"
#include "../xorrpad/logic/presentation.h"
#include <numeric>
#include "../xorrpad/logic/accessibility.h"

TEST_CASE("reply scrolling preserves the entire bounded reply, including long words") {
  std::string reply(2000, 'x');
  auto lines=xorr::replyLines(reply);
  std::string joined;
  for(auto &line:lines) { CHECK(line.size()<=24); joined+=line; }
  CHECK(joined==reply);
  CHECK(xorr::replyPages(lines.size())==11);
  CHECK(xorr::replyPage(6000,0,lines.size())==1);
  CHECK(xorr::replyPage(66000,0,lines.size())==0);
}
TEST_CASE("reply starts on its first page at arrival and survives the clock wrapping") {
  CHECK(xorr::replyPage(1000000,1000000,24)==0);
  CHECK(xorr::replyPage(3999,UINT32_MAX-2000,24)==1);
  CHECK(xorr::replyPages(0)==1);
  CHECK(xorr::replyPages(8)==1);
  CHECK(xorr::replyPages(9)==2);
  auto lines=xorr::replyLines("first\n\nthird");
  REQUIRE(lines.size()==3); CHECK(lines[1].empty()); CHECK(lines[2]=="third");
}
TEST_CASE("TFT colors retain each specified RGB565 channel") {
  CHECK(xorr::night==0x0000); CHECK(xorr::ink==0xf79d);
  CHECK(xorr::lime==0xcfa7); CHECK(xorr::mint==0x0ecf);
  CHECK(xorr::cobalt==0x2adf); CHECK(xorr::lavender==0xb53f);
}

TEST_CASE("idle policy has exact two and ten minute boundaries and wakes after wrap") {
  xorr::DisplayIdle idle;
  CHECK(idle.brightness(119999,220,false)==220);
  CHECK(idle.brightness(120000,220,false)==27);
  CHECK(idle.brightness(599999,220,false)==27);
  CHECK(idle.brightness(600000,220,false)==0);
  idle.wake(UINT32_MAX-10);
  CHECK(idle.brightness(20,220,false)==220);
  idle.wake(900000);
  CHECK(idle.brightness(900000,220,false)==220);
}
TEST_CASE("night mode and desk brightness clamp without making dim equal blank") {
  xorr::DisplayIdle idle;
  CHECK(idle.brightness(0,255,true)==40);
  CHECK(idle.brightness(120000,255,true)==5);
  CHECK(idle.brightness(120000,1,false)==1);
  CHECK(idle.brightness(0,-10,false)==1);
  CHECK(idle.brightness(0,1000,false)==255);
  CHECK(idle.brightness(600000,255,true)==0);
}
TEST_CASE("left handed key mapping is a permutation and never moves a fixed cell") {
  for(unsigned mask=0;mask<16;++mask) {
    bool movable[4];for(int c=0;c<4;++c)movable[c]=mask&(1<<c);
    unsigned seen=0;
    for(uint8_t c=0;c<4;++c) {
      auto dest=xorr::leftColumn(c,movable);
      CHECK(dest<4);CHECK(xorr::leftColumn(dest,movable)==c);
      if(!movable[c])CHECK(dest==c);
      seen|=1<<dest;
    }
    CHECK(seen==15);
  }
  bool firstRows[]={true,true,true,false};
  CHECK(xorr::leftColumn(0,firstRows)==2);
  CHECK(xorr::leftColumn(2,firstRows)==0);
  bool safetyRow[]={false,false,true,true};
  CHECK(xorr::leftColumn(0,safetyRow)==0);
  CHECK(xorr::leftColumn(1,safetyRow)==1);
  CHECK(xorr::leftColumn(2,safetyRow)==3);
}

#include "../xorrpad/logic/status-led.h"
TEST_CASE("killed LED wins over errors, pending signals, fill and hold") {
  for(uint32_t t=0;t<4000;t+=100) {
    auto color=xorr::statusLed(t,true,true,true,true,.5f);
    CHECK(color.r==100);CHECK(color.g==0);CHECK(color.b==0);
  }
}
TEST_CASE("LED palette animates smoothly and fill has a fully dark phase") {
  auto idle=xorr::statusLed(0,false,false,false,false);
  auto peak=xorr::statusLed(1500,false,false,false,false);
  CHECK(idle.b>0);CHECK(peak.b>idle.b);CHECK(peak.b>peak.g);CHECK(peak.g>peak.r);
  auto pending=xorr::statusLed(600,false,false,true,true);
  CHECK(pending.g>pending.r);CHECK(pending.r>pending.b);
  auto off=xorr::statusLed(0,false,false,false,true);
  CHECK(off.r==0);CHECK(off.g==0);CHECK(off.b==0);
  auto fill=xorr::statusLed(120,false,false,false,true);
  CHECK(fill.g>fill.b);CHECK(fill.b>fill.r);
  auto amber=xorr::statusLed(120,false,true,true,true);
  CHECK(amber.r==100);CHECK(amber.g==63);CHECK(amber.b==0);
  auto start=xorr::statusLed(0,false,false,true,false,0);
  auto end=xorr::statusLed(0,false,false,true,false,1);
  CHECK(end.g>start.g);
}
