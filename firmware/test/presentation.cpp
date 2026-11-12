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
