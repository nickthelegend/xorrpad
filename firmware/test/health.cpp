#include "doctest.h"
#include "../xorrpad/logic/health.h"
using namespace xorr;
TEST_CASE("telemetry immediate, exact 30s cadence, failed sends and wrap") {
  TelemetryClock t;CHECK(t.due(0));CHECK(t.due(1));t.accepted(1);
  CHECK_FALSE(t.due(30000));CHECK(t.due(30001));t.accepted(0xfffffff0);
  CHECK_FALSE(t.due(29983));CHECK(t.due(29984));
}
TEST_CASE("reset log identifies brownout and watchdog with bounded history") {
  CHECK(std::string(resetName(9))=="brownout");CHECK(std::string(resetName(6))=="task_watchdog");
  CHECK(std::string(resetName(99))=="unknown");
  auto log=resetHistory(9,std::string(120,'x'));CHECK(log.size()==120);CHECK(log.substr(0,11)=="9:brownout,");
}
TEST_CASE("crash bounds, ack binding and erase only after complete image") {
  CrashUpload c;std::string id(64,'a');
  CHECK_FALSE(c.begin(0,id));CHECK_FALSE(c.begin(262145,id));CHECK_FALSE(c.begin(100,"bad"));
  REQUIRE(c.begin(513,id));c.connection(true,2,1);CHECK(c.next(0)==512);
  CHECK_FALSE(c.saved(id,513));CHECK(c.accepted(512,0));CHECK(c.offset()==512);
  CHECK(c.next(1)==1);CHECK_FALSE(c.accepted(2,1));CHECK(c.accepted(1,1));
  CHECK(c.next(2)==0);CHECK_FALSE(c.saved(std::string(64,'b'),513));CHECK_FALSE(c.saved(id,512));
  CHECK(c.saved(id,513));c.erased();CHECK(c.size()==0);CHECK(c.next(3)==0);
}
TEST_CASE("disconnect, failover and same-transport re-pair restart crash at zero") {
  for(int change:{0,1,2}) {
    CrashUpload c;REQUIRE(c.begin(1024,std::string(64,'a')));c.connection(true,2,10);
    CHECK(c.accepted(512,0));
    if(change==0)c.connection(false,2,10);
    else if(change==1)c.connection(true,3,10);
    else c.connection(true,2,11);
    CHECK(c.offset()==0);CHECK_FALSE(c.saved(std::string(64,'a'),1024));
  }
}
TEST_CASE("lost crash_saved retries after 30 seconds including timer wrap") {
  CrashUpload c;REQUIRE(c.begin(512,std::string(64,'a')));c.connection(true,3,1);
  CHECK(c.accepted(512,0xfffffff0));CHECK(c.next(29983)==0);CHECK(c.next(29984)==512);CHECK(c.offset()==0);
}
