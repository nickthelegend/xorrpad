// MIT · Copyright (c) 2026 Nivesh Gajengi
#include "../xorrpad/logic/tilt-guard.h"
#include "doctest.h"
using xorr::tilt::Guard;
static constexpr uint64_t utc=1794528000; // UTC midnight; explicit native test vector
static Guard reboot(const Guard &g){JsonDocument d;g.json(d.to<JsonObject>());std::string bytes;serializeJson(d,bytes);JsonDocument disk;REQUIRE_FALSE(deserializeJson(disk,bytes));Guard next;REQUIRE(next.restore(disk));return next;}
TEST_CASE("F3 hourly limit reserves locally once and survives serialized reboot"){
 Guard g;g.config.maxTradesHour=2;
 CHECK(g.accept("one",false,utc));CHECK(g.accept("one",false,utc+1));CHECK(g.trades.size()==1);
 CHECK(g.accept("two",false,utc+10));CHECK(g.blocked(utc+10));
 auto n=reboot(g);CHECK_FALSE(n.accept("three",false,utc+11));CHECK(n.accept("reduce",true,utc+11));
 n.advance(utc+3609);CHECK(n.blocked(utc+3609));n.advance(utc+3610);CHECK_FALSE(n.blocked(utc+3610));n.advance(utc+3611);CHECK_FALSE(n.blocked(utc+3611));
}
TEST_CASE("F3 daily realized loss latches until next UTC day even after settings disabled or profit"){
 Guard g;g.config.dailyLossUsd=10;CHECK(g.fill("sig-one",-10,true,utc+86300));CHECK(g.blocked(utc+86300));
 CHECK_FALSE(g.fill("sig-one",-10,true,utc+86301));CHECK(g.realized==-10);
 g.config.dailyLossUsd=0;CHECK(g.fill("sig-two",50,true,utc+86302));CHECK(g.blocked(utc+86302));
 auto n=reboot(g);n.advance(utc+86399);CHECK(n.blocked(utc+86399));n.advance(utc+86400);CHECK_FALSE(n.blocked(utc+86400));CHECK(n.realized==0);
}
TEST_CASE("F3 losing closes cooldown cannot be shortened by desk settings or reboot"){
 Guard g;g.config.losingCloses=2;g.config.cooldownMinutes=5;
 CHECK(g.fill("a",-1,true,utc));CHECK(g.fill("b",1,true,utc+1));CHECK(g.streak==0);
 CHECK(g.fill("c",-1,true,utc+2));CHECK(g.fill("d",-1,true,utc+3));CHECK(g.until()==utc+303);
 g.config={0,0,0,1};auto n=reboot(g);n.advance(utc+302);CHECK(n.blocked(utc+302));n.advance(utc+303);CHECK_FALSE(n.blocked(utc+303));
}
TEST_CASE("F3 unknown pnl open fills invalid settings and corrupt storage fail safely"){
 Guard g;g.config.dailyLossUsd=1;
 CHECK_FALSE(g.fill("a",NAN,true,utc));CHECK_FALSE(g.fill("b",INFINITY,true,utc));CHECK_FALSE(g.fill("c",-100,false,utc));CHECK(g.realized==0);
 CHECK(g.blocked(0));CHECK_FALSE(g.accept("new",false,0));CHECK(g.accept("reduce",true,0));
 CHECK(g.accept("a",false,utc));CHECK(g.blocked(utc-1));CHECK_FALSE(g.accept("b",false,utc-1));
 JsonDocument d;g.json(d.to<JsonObject>());d["settings"]["maxTradesHour"]=-1;Guard n;CHECK_FALSE(n.restore(d));CHECK(n.blocked(utc));CHECK(n.accept("reduce",true,utc));
 g.json(d.to<JsonObject>());d["trades"][0]="bad";CHECK_FALSE(n.restore(d));
}
TEST_CASE("F3 UTC day rollover does not clear independent hourly or streak cooldown"){
 Guard g;g.config={1,1,1,5};CHECK(g.accept("one",false,utc+86390));CHECK(g.fill("sig",-1,true,utc+86391));
 auto n=reboot(g);n.advance(utc+86400);CHECK(n.lossUntil==0);CHECK(n.blocked(utc+86400));CHECK(n.hourUntil==utc+89990);CHECK(n.streakUntil==utc+86691);
}
TEST_CASE("F3 tighter settings trip existing counts but relaxed settings preserve deadlines"){
 Guard g;CHECK(g.accept("one",false,utc));CHECK(g.accept("two",false,utc+1));g.config.maxTradesHour=1;g.evaluate(utc+2);CHECK(g.hourUntil==utc+3601);
 g.config.maxTradesHour=0;g.advance(utc+3);CHECK(g.blocked(utc+3));auto n=reboot(g);CHECK(n.trades.size()==2);CHECK(n.accepted.size()==2);
}
TEST_CASE("F3 missing confirmed close PnL is Setup required rather than fabricated zero loss"){
 Guard g;g.config.dailyLossUsd=10;CHECK(g.unknown("missing-close",utc));CHECK(g.blocked(utc));CHECK(g.reason(utc)=="Setup required: close PnL");
 auto n=reboot(g);CHECK(n.missing.size()==1);CHECK(n.accept("reduce",true,utc+1));CHECK(n.fill("missing-close",-11,true,utc+2));CHECK(n.missing.empty());CHECK(n.blocked(utc+2));
 n.advance(utc+86400);CHECK_FALSE(n.blocked(utc+86400));
}
TEST_CASE("F3 accepts without UTC with disabled limits retain conservative hourly accounting on reboot"){
 Guard g;CHECK(g.accept("offline-yes",false,0));CHECK(g.untimed==1);auto n=reboot(g);n.config.maxTradesHour=1;n.advance(utc);CHECK(n.trades.size()==1);CHECK(n.blocked(utc));CHECK_FALSE(n.accept("next",false,utc));n.advance(utc+3600);CHECK_FALSE(n.blocked(utc+3600));
}
TEST_CASE("F3 failed persistence cannot turn a retry into an approval"){
 Guard g;CHECK(g.accept("reserved",false,utc));g.healthy=false;CHECK_FALSE(g.accept("reserved",false,utc));CHECK(g.accept("reduce",true,utc));
}

TEST_CASE("F3 maximum bounded accounting fits its NVS blob and roundtrips without truncation"){
 Guard g;
 for(int i=0;i<1000;i++)REQUIRE(g.accept(std::to_string(i)+std::string(120,'a'),false,utc));
 for(int i=0;i<128;i++)REQUIRE(g.fill(std::to_string(i)+std::string(120,'f'),0,true,utc));
 for(int i=0;i<128;i++)REQUIRE(g.unknown(std::to_string(i)+std::string(120,'m'),utc));
 JsonDocument d;g.json(d.to<JsonObject>());std::string raw;serializeJson(d,raw);CHECK(raw.size()>4000);CHECK(raw.size()<65536);
 auto n=reboot(g);CHECK(n.trades.size()==1000);CHECK(n.accepted.size()==128);CHECK(n.fills.size()==128);CHECK(n.missing.size()==128);
}
