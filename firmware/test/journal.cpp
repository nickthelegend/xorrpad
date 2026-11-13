// MIT · Copyright (c) 2026 Nivesh Gajengi
#include "doctest.h"
#include "../xorrpad/logic/journal.h"
static xorr::JournalEntry row(int i){xorr::JournalEntry r;r.id="decision-"+std::to_string(i);r.action="BUY";r.market="LOCAL TEST";r.size="1";r.venue="local vector";r.time=1800000000;r.result="awaiting";return r;}
TEST_CASE("F7 journal evicts oldest at 32 and scrolls newest first across both boundaries") {
 xorr::Journal j;for(int i=0;i<40;i++)REQUIRE(j.put(row(i)));
 REQUIRE(j.entries.size()==32);CHECK(j.entries.front().id=="decision-8");CHECK(j.current()->id=="decision-39");
 j.scroll(1);CHECK(j.current()->id=="decision-38");j.scroll(-2);CHECK(j.current()->id=="decision-8");j.scroll(1);CHECK(j.current()->id=="decision-39");
 CHECK_FALSE(j.result("decision-0","failed"));
}
TEST_CASE("F7 outcomes update the same ID and confirmed signature survives duplicate and late states") {
 xorr::Journal j;REQUIRE(j.put(row(1)));auto rev=j.revision;CHECK_FALSE(j.put(row(1)));CHECK(j.revision==rev);
 for(auto result:{"blocked","accepted","signed","failed","refused","expired"})CHECK(j.result("decision-1",result,"local reason"));
 REQUIRE(j.result("decision-1","filled","","PUBLIC-LOCAL-TEST-SIGNATURE"));CHECK_FALSE(j.result("decision-1","expired"));
 CHECK(j.entries.size()==1);CHECK(j.current()->signature=="PUBLIC-LOCAL-TEST-SIGNATURE");
 JsonDocument d;xorr::journalJson(d.to<JsonObject>(),j);xorr::Journal restored;REQUIRE(xorr::restoreJournal(d,restored));CHECK(restored.entries==j.entries);CHECK(restored.revision==j.revision);
 d["entries"][0]["result"]="executed";CHECK_FALSE(xorr::restoreJournal(d,restored));CHECK(restored.entries==j.entries);
}
TEST_CASE("F7 journal rejects oversized corrupt duplicate storage and unhealthy writes") {
 xorr::Journal j;auto r=row(0);r.id=std::string(129,'x');CHECK_FALSE(j.put(r));r=row(0);r.time=1;CHECK_FALSE(j.put(r));r=row(0);r.reason=std::string(193,'x');CHECK_FALSE(j.put(r));
 REQUIRE(j.put(row(1)));JsonDocument d;xorr::journalJson(d.to<JsonObject>(),j);d["entries"].as<JsonArray>().add(d["entries"][0]);CHECK_FALSE(xorr::restoreJournal(d,j));CHECK(j.entries.size()==1);
 d["entries"][0]["size"]=10;CHECK_FALSE(xorr::restoreJournal(d,j));j.healthy=false;CHECK_FALSE(j.put(row(2)));CHECK(j.entries.size()==1);
}
TEST_CASE("F7 authenticated-message adapter preserves metadata and never mistakes signing for a fill") {
 JsonDocument d;d["type"]="signal";d["signalId"]="decision";d["side"]="BUY";d["market"]="LOCAL TEST";d["sizeUsd"]=5.;d["venue"]="local vector";
 xorr::Journal j;REQUIRE(xorr::journalMessage(d,j,0));CHECK(j.current()->time==0);CHECK(j.current()->size=="5");
 d.clear();d["type"]="signal_state";d["signalId"]="decision";d["state"]="signed";REQUIRE(xorr::journalMessage(d,j,1800000000));CHECK(j.current()->result=="signed");
 d["state"]="executed";CHECK_FALSE(xorr::journalMessage(d,j,1800000000));CHECK(j.current()->result=="signed");
 d["type"]="receipt";CHECK_FALSE(xorr::journalMessage(d,j,1800000000));d["signature"]="LOCAL-PUBLIC-SIGNATURE";REQUIRE(xorr::journalMessage(d,j,1800000000));CHECK(j.current()->result=="filled");
}
