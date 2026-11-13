// MIT · Copyright (c) 2026 Nivesh Gajengi
#include "doctest.h"
#include "../xorrpad/logic/ambient.h"
#include "../xorrpad/logic/accessibility.h"
TEST_CASE("F6 ambient exactly sixty seconds only on Home, disabled and wrap-safe") {
 xorr::DisplayIdle idle;idle.wake(100);
 CHECK_FALSE(idle.ambientDue(60099,true));CHECK(idle.ambientDue(60100,true));
 CHECK_FALSE(idle.ambientDue(60100,false));CHECK_FALSE(idle.ambientDue(60100,true,false));
 idle.wake(UINT32_MAX-30000);CHECK(idle.ambientDue(29999,true));
}
TEST_CASE("F6 every first key consumes its complete gesture including YES NO and KILL") {
 for(int i=0;i<16;i++) {xorr::AmbientWake w;uint16_t bit=uint16_t(1)<<i;
  CHECK(w.key(bit,true,true));CHECK(w.key(bit,true,false));CHECK(w.key(bit,false,false));
  CHECK_FALSE(w.key(bit,true,false));CHECK_FALSE(w.key(bit,false,false));
 }
}
TEST_CASE("F6 knob wake consumes detent short click and entire held PTT release") {
 xorr::AmbientWake w;CHECK(w.knob(false,true,false,true));CHECK_FALSE(w.knob(false,true,false,false));
 CHECK(w.knob(true,false,false,true));CHECK(w.knob(true,true,false,false));
 CHECK(w.knob(false,false,false,false));CHECK(w.knob(false,true,true,false));
 CHECK_FALSE(w.knob(false,true,false,false));
 CHECK(w.knob(false,true,true,true));CHECK_FALSE(w.knob(false,true,true,false));
}
TEST_CASE("F6 ambient parses bounded live fields without inventing missing data") {
 JsonDocument d;d["epoch"]=1800000000;d["hours"]="NY";d["crew"]="Crew: unavailable";d["closes"].to<JsonArray>();
 xorr::Ambient a;REQUIRE(xorr::parseAmbient(d,a,50));CHECK(std::isnan(a.price));CHECK(std::isnan(a.pnl));CHECK(std::isnan(a.nextFunding));
 CHECK(a.fresh(90049));CHECK_FALSE(a.fresh(90050));
 d["closes"].as<JsonArray>().add(-1);CHECK_FALSE(xorr::parseAmbient(d,a,51));CHECK(a.receivedAt==50);
 d["closes"].clear();d["price"]=INFINITY;CHECK_FALSE(xorr::parseAmbient(d,a,51));
 d["price"]=1;for(int i=0;i<25;i++)d["closes"].as<JsonArray>().add(1);CHECK_FALSE(xorr::parseAmbient(d,a,51));
}
