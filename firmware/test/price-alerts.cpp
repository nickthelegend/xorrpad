#include "../xorrpad/logic/price-alerts.h"
#include "doctest.h"
#include <fstream>
using namespace xorr::prices;
static const std::string mint="So11111111111111111111111111111111111111112";
static JsonDocument live(){std::ifstream f("firmware/test/fixtures/jupiter-price-v3.json");std::string s((std::istreambuf_iterator<char>(f)),{});JsonDocument d;CHECK_FALSE(deserializeJson(d,s));return d;}
static JsonDocument rules(){JsonDocument d;auto r=d.to<JsonArray>().add<JsonObject>();r["id"]="sol-price";r["mint"]=mint;r["usd"]=100.;r["above"]=true;return d;}
TEST_CASE("offline price scheduler requires offline wifi idle and minimum thirty seconds"){
 Poll p;CHECK_FALSE(p.due(0,true,true,true));CHECK_FALSE(p.due(0,false,false,true));CHECK_FALSE(p.due(0,false,true,false));CHECK(p.due(0,false,true,true));p.attempt(0);CHECK_FALSE(p.due(29999,false,true,true));CHECK(p.due(30000,false,true,true));
}
TEST_CASE("price poll failed attempts and reconnect cannot bypass cooldown"){
 Poll p;p.attempt(500);CHECK_FALSE(p.due(1000,true,true,true));CHECK_FALSE(p.due(30499,false,true,true));CHECK(p.due(30500,false,true,true));
}
TEST_CASE("price poll wraps millis safely"){Poll p;p.attempt(UINT32_MAX-10000);CHECK_FALSE(p.due(19998,false,true,true));CHECK(p.due(19999,false,true,true));}
TEST_CASE("captured Jupiter response uses mint and price block"){
 auto d=live();Quote q;REQUIRE(quote(d,mint,q));CHECK(q.usd>0);CHECK(q.block>0);CHECK_FALSE(quote(d,"missing",q));
}
TEST_CASE("price parser rejects malformed numeric price and block"){
 auto d=live();Quote q;d[mint]["usdPrice"]="1";CHECK_FALSE(quote(d,mint,q));d=live();d[mint]["usdPrice"]=-1;CHECK_FALSE(quote(d,mint,q));d=live();d[mint]["blockId"]=0;CHECK_FALSE(quote(d,mint,q));d=live();d[mint]["blockId"]="123";CHECK_FALSE(quote(d,mint,q));
}
TEST_CASE("desk alert settings roundtrip and persist fired state"){
 auto d=rules();std::vector<Alert> a;REQUIRE(parse(d,a));CHECK(a.size()==1);a[0].fired=true;JsonDocument disk;json(disk.to<JsonArray>(),a);std::vector<Alert> restored;REQUIRE(parse(disk,restored,true));CHECK(restored[0].fired);CHECK_FALSE(hit(restored[0],{101,1}));
}
TEST_CASE("desk cannot set fired state on new rules"){auto d=rules();d[0]["fired"]=true;std::vector<Alert> a;REQUIRE(parse(d,a));CHECK_FALSE(a[0].fired);}
TEST_CASE("invalid alert config never replaces previous rules"){
 auto d=rules();std::vector<Alert> a;REQUIRE(parse(d,a));d[0]["usd"]=-1;CHECK_FALSE(parse(d,a));CHECK(a[0].usd==100);
}
TEST_CASE("alert rules reject url injection duplicate ids and excess count"){
 auto d=rules();std::vector<Alert> a;d[0]["mint"]="https://bad.example/path?ids=SOL";CHECK_FALSE(parse(d,a));d=rules();d.as<JsonArray>().add(d[0]);CHECK_FALSE(parse(d,a));d=rules();for(int i=0;i<8;++i){auto r=d.as<JsonArray>().add<JsonObject>();r["id"]=std::to_string(i);r["mint"]=mint;r["usd"]=1;r["above"]=true;}CHECK_FALSE(parse(d,a));
}
TEST_CASE("alert rules reject missing direction NaN infinity and unsafe ids"){
 std::vector<Alert> a;auto d=rules();d[0].remove("above");CHECK_FALSE(parse(d,a));d=rules();d[0]["usd"]=NAN;CHECK_FALSE(parse(d,a));d=rules();d[0]["usd"]=INFINITY;CHECK_FALSE(parse(d,a));d=rules();d[0]["id"]="bad\nlabel";CHECK_FALSE(parse(d,a));
}
TEST_CASE("alerts trigger above below inclusively and never on replayed blocks"){
 Alert a{"sol",mint,100,true,false,5};CHECK(hit(a,{100,6}));CHECK_FALSE(hit(a,{99,6}));CHECK_FALSE(hit(a,{110,5}));a.above=false;CHECK(hit(a,{100,6}));CHECK_FALSE(hit(a,{101,6}));a.fired=true;CHECK_FALSE(hit(a,{99,7}));
}
TEST_CASE("clear alerts accepted while corrupt persisted records refused"){
 JsonDocument d;d.to<JsonArray>();std::vector<Alert> a;CHECK(parse(d,a));d=rules();CHECK_FALSE(parse(d,a,true));
}
