#include "doctest.h"
#include "../xorrpad/logic/kill-switch.h"
#include "../xorrpad/logic/flatten.h"

TEST_CASE("F4 flatten parser accepts only a bounded reduce-only plan with all rows accounted for") {
 JsonDocument d;d["id"]="test-plan";d["state"]="awaiting";d["fingerprint"]=std::string(64,'a');d["reduceOnly"]=true;
 d["remainingMs"]=60000;d["orders"]=1;d["perps"]=1;d["outcomes"]=1;
 auto rows=d["rows"].to<JsonArray>();rows.add("LAYOUT TEST cancel");rows.add("LAYOUT TEST close perp");rows.add("LAYOUT TEST sell shares");
 xorr::Flatten p;REQUIRE(xorr::parseFlatten(d,p,UINT32_MAX-1000));CHECK(p.live(58998));CHECK_FALSE(p.live(58999));
 d["reduceOnly"]=false;CHECK_FALSE(xorr::parseFlatten(d,p,0));CHECK(p.id=="test-plan");
 d["reduceOnly"]=true;d["orders"]=2;CHECK_FALSE(xorr::parseFlatten(d,p,0));d["orders"]=1;
 d["remainingMs"]=60001;CHECK_FALSE(xorr::parseFlatten(d,p,0));d["remainingMs"]=60000;
 d["state"]="open";CHECK_FALSE(xorr::parseFlatten(d,p,0));d["state"]="executing";
 d["legId"]="accepted-child";d["legReduceOnly"]=false;REQUIRE(xorr::parseFlatten(d,p,0));CHECK_FALSE(p.review("accepted-child"));
 d["legReduceOnly"]=true;REQUIRE(xorr::parseFlatten(d,p,0));CHECK(p.review("accepted-child"));CHECK_FALSE(p.review("other"));
}
TEST_CASE("F4 flatten YES requires a fresh 800ms hold; NO and every blocked state keep kill latched") {
 xorr::KillSwitch kill;kill.kill();xorr::Flatten p;p.id="test";p.state="awaiting";p.ttl=60000;
 xorr::FlattenConfirm c;c.offer(1);CHECK_FALSE(c.due(p,true,false,true,1,800));
 c.key(true,true,1,1000);CHECK_FALSE(c.due(p,true,false,true,1,1799));CHECK(c.due(p,true,false,true,1,1800));
 CHECK_FALSE(c.due(p,true,false,true,1,1801));CHECK(kill.killed);
 for(int i=0;i<5;++i){c.offer(1);c.key(true,true,1,0);CHECK_FALSE(c.due(p,i!=0,i==1,i!=2,i==3?2:1,i==4?60000:800));CHECK(kill.killed);}
 c.offer(1);c.key(true,true,1,0);c.key(false,true,1,799);CHECK_FALSE(c.due(p,true,false,true,1,800));
 p.state="refused";c.key(true,true,1,1000);CHECK_FALSE(c.due(p,true,false,true,1,1800));CHECK(kill.killed);
 p.state="awaiting";p.at=UINT32_MAX-1000;c.offer(2);c.key(true,true,2,UINT32_MAX-100);CHECK(c.due(p,true,false,true,2,699));CHECK(kill.killed);
}
using xorr::KillSwitch;
TEST_CASE("S3 kill fires at two seconds without waiting for release") {
  KillSwitch s; s.killKey(true, 0);
  CHECK_FALSE(s.killDue(1999)); CHECK(s.killDue(2000));
  CHECK_FALSE(s.killDue(3000)); s.kill(); CHECK(s.killed);
}
TEST_CASE("S3 short kill taps cannot accumulate") {
  KillSwitch s; s.killKey(true, 0); s.killKey(false, 1500);
  s.killKey(true, 1600); CHECK_FALSE(s.killDue(3500)); CHECK(s.killDue(3600));
}
TEST_CASE("S3 kill hold tolerates clock wrap") {
  KillSwitch s; s.killKey(true, 0xffffff00u);
  CHECK_FALSE(s.killDue(1743)); CHECK(s.killDue(1744));
}
TEST_CASE("S3 latch byte restores across reboot without desk consent") {
  KillSwitch s; s.kill(); s.request(true, 0);
  KillSwitch reboot; reboot.restore(s.saved(), true);
  CHECK(reboot.killed); CHECK_FALSE(reboot.requested);
  CHECK_FALSE(reboot.complete(800, true, true));
}
TEST_CASE("S3 failed or corrupt NVS reads fail closed") {
  KillSwitch s; s.restore(0, false); CHECK(s.killed);
  s.restore(2, true); CHECK(s.killed); s.restore(0, true); CHECK_FALSE(s.killed);
}
TEST_CASE("S3 killed pad cannot offer or answer signals offline or online") {
  KillSwitch s; s.kill(); xorr::SignalState signal;
  CHECK_FALSE(signal.offer("a", 0, 10000, s.killed));
  REQUIRE(signal.offer("a", 0, 10000, false));
  CHECK_FALSE(signal.answer("a", true, 1, true, s.killed, true));
  CHECK_FALSE(signal.answer("a", true, 1, false, s.killed, true));
}
TEST_CASE("S3 offline desk request cannot authorize rearm") {
  KillSwitch s; s.kill(); s.request(false, 0);
  s.confirmKey(true, 0, true); CHECK_FALSE(s.tick(800, true));
  CHECK_FALSE(s.complete(800, true, true));
}
TEST_CASE("S3 completion before physical confirmation is refused") {
  KillSwitch s; s.kill(); s.request(true, 0);
  CHECK_FALSE(s.complete(800, true, true)); CHECK(s.killed);
}
TEST_CASE("S3 rearm hold is fresh and lasts eight hundred milliseconds") {
  KillSwitch s; s.kill(); s.confirmKey(true, 0, true); s.request(true, 1);
  s.confirmKey(true, 2, true); CHECK_FALSE(s.tick(1000, true));
  s.confirmKey(false, 1001, true); s.confirmKey(true, 1002, true);
  CHECK_FALSE(s.tick(1801, true)); CHECK(s.tick(1802, true));
  CHECK_FALSE(s.tick(1803, true));
}
TEST_CASE("S3 consent remains valid after release while desk response travels") {
  KillSwitch s; s.kill(); s.request(true, 0); s.confirmKey(true, 1, true);
  REQUIRE(s.tick(801, true)); s.confirmKey(false, 802, true);
  CHECK(s.complete(900, true, true)); CHECK_FALSE(s.killed);
}
TEST_CASE("S3 failed NVS clear keeps the device killed") {
  KillSwitch s; s.kill(); s.request(true, 0); s.confirmKey(true, 1, true);
  REQUIRE(s.tick(801, true)); CHECK_FALSE(s.complete(802, true, false));
  CHECK(s.killed); CHECK_FALSE(s.requested);
}
TEST_CASE("S3 request expires exactly at deadline even without a tick") {
  KillSwitch s; s.kill(); s.request(true, 0); s.confirmKey(true, 1, true);
  REQUIRE(s.tick(801, true)); CHECK_FALSE(s.complete(15000, true, true));
  CHECK(s.killed);
}
TEST_CASE("S3 link loss revokes physical consent") {
  KillSwitch s; s.kill(); s.request(true, 0); s.confirmKey(true, 1, true);
  REQUIRE(s.tick(801, true)); s.tick(802, false);
  CHECK_FALSE(s.complete(803, true, true)); CHECK_FALSE(s.requested);
}
TEST_CASE("S3 second kill cancels in-flight rearm completion") {
  KillSwitch s; s.kill(); s.request(true, 0); s.confirmKey(true, 1, true);
  REQUIRE(s.tick(801, true)); s.kill(); CHECK_FALSE(s.complete(802, true, true));
}
TEST_CASE("S3 rearm window tolerates clock wrap") {
  KillSwitch s; s.kill(); s.request(true, 0xffffff00u);
  s.confirmKey(true, 0xffffff01u, true); REQUIRE(s.tick(545, true));
  CHECK(s.complete(546, true, true));
}
