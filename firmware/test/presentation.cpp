#include "doctest.h"
#include "../xorrpad/logic/presentation.h"
#include <numeric>

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
