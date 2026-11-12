#include "vendor/doctest.h"
#include "../xorrpad/logic/session-sign.h"
#include <fstream>
using namespace xorr::session;
static xorr::solana::Request captured(const char *name){
  std::ifstream f(std::string("firmware/test/fixtures/")+name+".json");REQUIRE(f.good());
  std::string text((std::istreambuf_iterator<char>(f)),{});JsonDocument d;REQUIRE_FALSE(deserializeJson(d,text));
  d["signalId"]="session-native";d["remainingMs"]=120000;serializeJson(d,text=std::string());
  xorr::solana::Request r;REQUIRE(xorr::solana::parseRequest(text,r));return r;
}
static Policy policy(const xorr::solana::Review &v){
  Policy p;p.trade=2000000;p.day=3000000;p.maxLeverage=1;p.mint=v.decoded.back().inputMint;
  for(const auto &ix:v.message.instructions){auto a=xorr::solana::address(v.message.keys[ix.program]);if(std::find(p.programs.begin(),p.programs.end(),a)==p.programs.end())p.programs.push_back(a);}
  return p;
}
TEST_CASE("session caps use real pm-AMM instruction input, not desk amount"){
  auto r=captured("pmamm-yes");auto p=policy(r.value);auto owner=r.value.message.keys[0];
  // ATA creation needs an independently bounded rent charge: deliberately refused.
  CHECK_FALSE(exposure(r.value,p,owner).ok);
  auto t=captured("session-usdc-transfer");p=policy(t.value);owner=t.value.message.keys[0];
  REQUIRE(exposure(t.value,p,owner).ok);CHECK(exposure(t.value,p,owner).amount==123456);
  p.trade=123455;CHECK_FALSE(exposure(t.value,p,owner).ok);
}
TEST_CASE("session rejects unauthorized programs assets signers and unchecked amounts"){
 auto r=captured("session-usdc-transfer");auto p=policy(r.value);auto k=r.value.message.keys[0];
 p.programs={"11111111111111111111111111111111"};CHECK_FALSE(exposure(r.value,p,k).ok);
 p=policy(r.value);p.mint="11111111111111111111111111111111";CHECK_FALSE(exposure(r.value,p,k).ok);
 p=policy(r.value);k[0]^=1;CHECK_FALSE(exposure(r.value,p,k).ok);
 r=captured("spl-transfer");CHECK_FALSE(exposure(r.value,p,r.value.message.keys[0]).ok);
}
TEST_CASE("session refuses real Phoenix without instruction leverage even with allowlist"){
 auto r=captured("phoenix-long");auto p=policy(r.value);p.mint="3WQ8hCqTNwjrh8WzE2XyoZoUrd1miPcwWfMkmFPUMEWZ";
 auto e=exposure(r.value,p,r.value.message.keys[0]);CHECK_FALSE(e.ok);CHECK(e.error=="Phoenix leverage absent from instruction");
}
TEST_CASE("session automatic acceptance requires pad policy and exact swap market"){
 auto r=captured("session-usdc-transfer");auto p=policy(r.value);p.autoTrade=200000;p.market="11111111111111111111111111111111";
 REQUIRE(p.valid());CHECK_FALSE(exposure(r.value,p,r.value.message.keys[0]).automatic);
 p.market=r.value.decoded.back().destination;CHECK(exposure(r.value,p,r.value.message.keys[0]).automatic);
 p.autoTrade=0;CHECK_FALSE(exposure(r.value,p,r.value.message.keys[0]).automatic);
}
TEST_CASE("session blind and malformed reviews cannot evade caps"){
 auto r=captured("session-usdc-transfer");auto p=policy(r.value);auto k=r.value.message.keys[0];r.value.blind=true;
 CHECK_FALSE(exposure(r.value,p,k).ok);r.value.blind=false;r.value.decoded.clear();CHECK_FALSE(exposure(r.value,p,k).ok);
}
TEST_CASE("session policy roundtrip validates exact integers allowlist and default off"){
 auto r=captured("session-usdc-transfer");auto p=policy(r.value);JsonDocument d;policyJson(d.to<JsonObject>(),p);Policy restored;
 REQUIRE(parsePolicy(d.as<JsonVariantConst>(),restored));CHECK(restored.autoTrade==0);CHECK(restored.day==p.day);
 for(auto field:{"trade","day","maxLeverage","programs"}){JsonDocument bad;bad.set(d);bad.remove(field);CHECK_FALSE(parsePolicy(bad.as<JsonVariantConst>(),restored));}
 d["maxLeverage"]=2;CHECK_FALSE(parsePolicy(d.as<JsonVariantConst>(),restored));
}
TEST_CASE("session rolling daily cap survives serialized reboot and failed signature delivery"){
 Counter c;std::string disk;auto save=[&](const Counter &v){JsonDocument d;v.json(d.to<JsonArray>());serializeJson(d,disk=std::string());return true;};
 REQUIRE(c.reserve(60,100,0,save));JsonDocument d;REQUIRE_FALSE(deserializeJson(d,disk));Counter reboot;
 REQUIRE(reboot.restore(d.as<JsonVariantConst>()));CHECK_FALSE(reboot.reserve(41,100,0,save));
 REQUIRE(reboot.reserve(40,100,dayMs-1,save));CHECK_FALSE(reboot.reserve(1,100,0,save));
 REQUIRE(reboot.reserve(60,100,1,save));CHECK_FALSE(reboot.reserve(1,100,0,save));
}
TEST_CASE("session counter never signs before durable write and rejects overflow corruption"){
 Counter c;CHECK_FALSE(c.reserve(1,100,0,[](const Counter&){return false;}));CHECK(c.debits.empty());
 auto save=[](const Counter&){return true;};REQUIRE(c.reserve(UINT64_MAX,UINT64_MAX,0,save));CHECK_FALSE(c.reserve(1,UINT64_MAX,0,save));
 JsonDocument d;deserializeJson(d,"[{\"age\":0,\"amount\":0}]");CHECK_FALSE(c.restore(d.as<JsonVariantConst>()));
 CHECK_FALSE(c.reserve(0,100,0,save));
}
TEST_CASE("session counter capacity fails closed and expires after full powered day"){
 Counter c;auto save=[](const Counter&){return true;};for(int i=0;i<64;i++)REQUIRE(c.reserve(1,100,0,save));
 CHECK_FALSE(c.reserve(1,100,0,save));CHECK(c.reserve(100,100,dayMs,save));
}
TEST_CASE("session authorization requires full review fresh hold or pad stored matching auto policy"){
 auto r=captured("session-usdc-transfer");auto p=policy(r.value);auto k=r.value.message.keys[0];xorr::solana::Approval a;
 a.configure(false,7);REQUIRE(a.offer(r.value,7));CHECK_FALSE(authorize(a,p,k,800,7).ok);
 for(size_t i=0;i<r.value.rows.size();i++)a.visit(i);
 CHECK_FALSE(authorize(a,p,k,799,7).ok);CHECK(authorize(a,p,k,800,7).ok);CHECK_FALSE(authorize(a,p,k,800,8).ok);
 p.autoTrade=123456;p.market=r.value.decoded.back().destination;
 REQUIRE(a.offer(r.value,7));CHECK(authorize(a,p,k,0,7).ok);p.market=p.mint;CHECK_FALSE(authorize(a,p,k,0,7).ok);
}
