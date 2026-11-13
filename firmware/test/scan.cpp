// MIT · Copyright (c) 2026 Nivesh Gajengi
#include "doctest.h"
#include "../xorrpad/logic/scan.h"
TEST_CASE("F8 scan is read-only, expires at eight seconds and consumes dismissal across millis wrap") {
 JsonDocument d;d["summary"]="Setup required: local parser vector";d["markets"].to<JsonArray>();d["top"]=nullptr;
 xorr::Scan s;REQUIRE(xorr::parseScan(d,s,UINT32_MAX-3999));
 CHECK(s.fresh(3999));CHECK_FALSE(s.fresh(4000));
 CHECK(s.dismiss(3999));CHECK_FALSE(s.dismiss(3999));CHECK_FALSE(s.fresh(3999));
}
TEST_CASE("F8 scan parser bounds payloads and leaves the previous answer intact on malformed data") {
 JsonDocument d;d["summary"]="Local no-setup vector";auto markets=d["markets"].to<JsonArray>();auto m=markets.add<JsonObject>();m["symbol"]="LOCAL";m["error"]="Setup required: local feed unavailable";
 xorr::Scan s;REQUIRE(xorr::parseScan(d,s,10));CHECK(s.markets[0].error=="Setup required: local feed unavailable");CHECK(s.top.empty());
 d["top"]["symbol"]="LOCAL";d["top"]["side"]="BUY";d["top"]["strategy"]="local vector";d["top"]["rationale"]="Parser vector only";
 REQUIRE(xorr::parseScan(d,s,11));CHECK(s.top=="BUY LOCAL / local vector");
 d["checkedCount"]=3;d["unavailableCount"]=20;REQUIRE(xorr::parseScan(d,s,11));CHECK(s.checkedCount==3);CHECK(s.unavailableCount==20);
 d["checkedCount"]=-1;CHECK_FALSE(xorr::parseScan(d,s,12));d["checkedCount"]=3;
 d["top"]["symbol"]=1;CHECK_FALSE(xorr::parseScan(d,s,12));CHECK(s.receivedAt==11);
 d["top"]=nullptr;d["summary"]=std::string(513,'x');CHECK_FALSE(xorr::parseScan(d,s,12));
 d["summary"]="local";m["error"]=nullptr;CHECK_FALSE(xorr::parseScan(d,s,12));
 m["error"]="";for(int i=0;i<16;i++)markets.add<JsonObject>();CHECK_FALSE(xorr::parseScan(d,s,12));
}
