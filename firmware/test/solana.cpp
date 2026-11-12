#include "vendor/doctest.h"
#include "../xorrpad/logic/clear-sign.h"
#include <fstream>
#include <iterator>
using namespace xorr::solana;
struct Fixture {std::vector<uint8_t> bytes;std::vector<TableData> tables;std::string hash;};
static Fixture fixture(const char *name) {
  std::ifstream f(std::string("firmware/test/fixtures/")+name+".json");
  REQUIRE(f.good());std::string text((std::istreambuf_iterator<char>(f)),{});JsonDocument j;
  REQUIRE_FALSE(deserializeJson(j,text));Fixture out;std::string hex=j["message"];
  out.bytes.resize(hex.size()/2);REQUIRE(xorr::unhex(hex,out.bytes.data(),out.bytes.size()));out.hash=j["sha256"].as<std::string>();
  for(auto row:j["tables"].as<JsonArray>()){
    TableData t;REQUIRE(keyFromString(row["table"].as<std::string>(),t.table));t.owner=row["owner"].as<std::string>();
    hex=row["data"].as<std::string>();t.data.resize(hex.size()/2);REQUIRE(xorr::unhex(hex,t.data.data(),t.data.size()));
    for(auto key:row["resolved"].as<JsonArray>()){Key k;REQUIRE(keyFromString(key.as<std::string>(),k));t.resolved.push_back(k);}out.tables.push_back(t);
  }
  return out;
}
TEST_CASE("Solana real legacy and v0 SDK messages decode amount and destination") {
  for(auto name:{"system-legacy","system-v0"}){
    auto f=fixture(name);auto v=review(f.bytes,f.tables);REQUIRE(v.valid());CHECK_FALSE(v.blind);
    CHECK(v.message.v0==(std::string(name)=="system-v0"));REQUIRE(v.decoded.size()==3);
    CHECK(v.decoded[2].amount==123456789);CHECK(v.decoded[2].decimals==9);
    CHECK(v.decoded[2].destination=="So11111111111111111111111111111111111111112");
    auto h=xorr::sha(f.bytes.data(),f.bytes.size());CHECK(xorr::hex(h.data(),32)==f.hash);
    CHECK(v.message.fingerprint==xorr::base58(h.data(),32).substr(0,6));
  }
}
TEST_CASE("Solana real SPL and Token2022 transfer and checked layouts") {
  for(auto name:{"spl-transfer","spl-checked","token2022-transfer","token2022-checked"}){
    auto f=fixture(name);auto v=review(f.bytes);REQUIRE(v.valid());CHECK_FALSE(v.blind);REQUIRE(v.decoded.size()==1);
    CHECK(v.decoded[0].amount==123456);CHECK(v.decoded[0].decimals==(std::string(name).find("checked")!=std::string::npos?6:-1));
  }
}
TEST_CASE("Solana v1 pm-AMM builders decode live devnet swaps and setup") {
  for(auto name:{"pmamm-yes","pmamm-no"}){
    auto f=fixture(name);auto v=review(f.bytes,f.tables);REQUIRE(v.valid());CHECK_FALSE(v.blind);
    REQUIRE(v.decoded.back().name=="pm-AMM swap");CHECK(v.decoded.back().amount==1000000);CHECK(v.decoded.back().output>0);
    CHECK(v.decoded.back().inputMint=="3WQ8hCqTNwjrh8WzE2XyoZoUrd1miPcwWfMkmFPUMEWZ");
    CHECK(v.decoded.back().side==(std::string(name)=="pmamm-yes"?"USDC -> YES":"USDC -> NO"));
  }
}
TEST_CASE("Solana v1 Phoenix builder decodes real IOC packet options") {
  for(auto name:{"phoenix-long","phoenix-short"}){
    auto f=fixture(name);auto v=review(f.bytes,f.tables);REQUIRE(v.valid());CHECK_FALSE(v.blind);
    const auto &d=v.decoded.back();CHECK(d.name=="Phoenix place order");CHECK(d.amount>0);CHECK(d.price>0);
    CHECK(d.side==(std::string(name)=="phoenix-long"?"bid / long":"ask / short"));
  }
}
TEST_CASE("Solana v1 Jupiter capture parses real address lookup evidence") {
  auto f=fixture("jupiter-route");auto v=review(f.bytes,f.tables);REQUIRE(v.valid());
  CHECK(v.message.v0);bool route=false;for(const auto &d:v.decoded)if(d.name.find("Jupiter")!=std::string::npos){route=true;}CHECK(route);CHECK(v.blind);
}
TEST_CASE("Solana rejects every truncated real message") {
  auto f=fixture("system-v0");for(size_t n=0;n<f.bytes.size();n++){auto b=f.bytes;b.resize(n);CHECK_FALSE(parse(b).valid);}
}
TEST_CASE("Solana header rejects unknown version readonly payer and bad counts") {
  auto f=fixture("system-v0");for(auto value:{129,255}){auto b=f.bytes;b[0]=value;CHECK_FALSE(parse(b).valid);}
  auto b=f.bytes;b[1]=0;CHECK_FALSE(parse(b).valid);b=f.bytes;b[2]=1;CHECK_FALSE(parse(b).valid);b=f.bytes;b[3]=255;CHECK_FALSE(parse(b).valid);
}
TEST_CASE("Solana rejects trailing junk oversized and duplicate account keys") {
  auto f=fixture("system-v0");auto b=f.bytes;b.push_back(0);CHECK_FALSE(parse(b).valid);
  b.resize(1233);CHECK_FALSE(parse(b).valid);b=f.bytes;std::copy(b.begin()+5,b.begin()+37,b.begin()+37);CHECK_FALSE(parse(b).valid);
}
TEST_CASE("Solana compact u16 is canonical and bounded") {
  for(std::vector<uint8_t> b: {std::vector<uint8_t>{128,0}, {129,128,0},{255,255,4},{128},{128,128,128}}){Reader r{b.data(),b.size()};r.compact();CHECK_FALSE(r.ok);}
  std::vector<uint8_t>b={255,255,3};Reader r{b.data(),b.size()};CHECK(r.compact()==65535);CHECK(r.done());
}
TEST_CASE("Solana decoded known program cannot hide instruction suffix or new opcode") {
  auto f=fixture("system-legacy");auto m=parse(f.bytes);REQUIRE(m.valid);auto ix=m.instructions.back();ix.data.push_back(0);CHECK_FALSE(decode(m,ix).known);
  ix=m.instructions.back();ix.data[0]=99;CHECK_FALSE(decode(m,ix).known);ix=m.instructions.back();ix.accounts.pop_back();CHECK_FALSE(decode(m,ix).known);
}
TEST_CASE("Solana fingerprint changes with a transaction amount or blockhash") {
  auto f=fixture("system-legacy");auto original=parse(f.bytes);auto b=f.bytes;b.back()^=1;CHECK(parse(b).fingerprint!=original.fingerprint);
  b=f.bytes;b[4+32*original.staticCount]^=1;CHECK(parse(b).fingerprint!=original.fingerprint);
}
TEST_CASE("Solana lookup evidence cannot be omitted or desk resolution changed") {
  auto f=fixture("jupiter-route");REQUIRE_FALSE(f.tables.empty());
  CHECK_FALSE(parse(f.bytes).valid);auto tables=f.tables;tables[0].resolved[0][0]^=1;CHECK_FALSE(parse(f.bytes,tables).valid);
  tables=f.tables;tables[0].owner="11111111111111111111111111111111";CHECK_FALSE(parse(f.bytes,tables).valid);
  tables=f.tables;tables[0].data.resize(55);CHECK_FALSE(parse(f.bytes,tables).valid);
  tables=f.tables;tables[0].data[4]=0;CHECK_FALSE(parse(f.bytes,tables).valid);
  tables=f.tables;tables.push_back(tables[0]);CHECK_FALSE(parse(f.bytes,tables).valid);
}
TEST_CASE("Solana approval defaults blind off and needs every review row plus extra three seconds") {
  auto f=fixture("system-v0");auto v=review(f.bytes);v.blind=true;
  Approval a;a.configure(false,1);REQUIRE(a.offer(v,1));for(size_t i=0;i<v.rows.size();i++)a.visit(i);
  CHECK_FALSE(a.confirm(99999,1));a.configure(true,1);CHECK_FALSE(a.confirm(3799,1));CHECK(a.confirm(3800,1));
  CHECK_FALSE(a.confirm(99999,2));a.configure(false,2);CHECK_FALSE(a.confirm(99999,2));
}
TEST_CASE("Solana approval resets review on replacement and connection changes") {
  auto f=fixture("system-v0");auto v=review(f.bytes);Approval a;a.configure(false,7);REQUIRE(a.offer(v,7));
  CHECK_FALSE(a.confirm(800,7));for(size_t i=0;i<v.rows.size();i++)a.visit(i);CHECK_FALSE(a.confirm(799,7));CHECK(a.confirm(800,7));
  REQUIRE(a.offer(v,7));CHECK_FALSE(a.confirm(99999,7));CHECK_FALSE(a.offer(v,8));CHECK_FALSE(a.offer({},7));CHECK_FALSE(a.confirm(99999,7));
}
TEST_CASE("Solana key parsing rejects overflow noncanonical and invalid base58") {
  Key key;CHECK(keyFromString("11111111111111111111111111111111",key));CHECK_FALSE(keyFromString("0",key));CHECK_FALSE(keyFromString("111",key));CHECK_FALSE(keyFromString(std::string(44,'z'),key));
}

TEST_CASE("Solana v1 builder known Jupiter route decodes instruction amounts") {
  auto f=fixture("jupiter-known-route");auto v=review(f.bytes,f.tables);REQUIRE(v.valid());
  bool found=false;for(const auto &d:v.decoded)if(d.name.find("Jupiter")!=std::string::npos){found=true;CHECK(d.amount==10000000);CHECK(d.output>0);CHECK_FALSE(d.outputMint.empty());}CHECK(found);
}

static std::string requestJson() {
 auto f=fixture("system-v0");JsonDocument d;d["signalId"]="native-review";d["remainingMs"]=10000;
 d["message"]=xorr::hex(f.bytes.data(),f.bytes.size());d["tables"].to<JsonArray>();std::string s;serializeJson(d,s);return s;
}
TEST_CASE("Solana chunk upload binds exact bytes epoch timeout and remaining lifetime") {
 auto s=requestJson();auto hash=xorr::sha(s.data(),s.size());Upload u;Request r;
 REQUIRE(u.begin(s.size(),xorr::hex(hash.data(),32),4,100));
 REQUIRE(u.chunk(0,xorr::hex(reinterpret_cast<const uint8_t*>(s.data()),s.size()),4,101));
 REQUIRE(u.finish(r,4,200));CHECK(r.remainingMs==9900);CHECK(r.id=="native-review");CHECK(r.value.valid());
 CHECK_FALSE(u.finish(r,4,201));
}
TEST_CASE("Solana chunk upload refuses reordered corrupted oversized and stale data") {
 auto s=requestJson();auto h=xorr::sha(s.data(),s.size());auto hash=xorr::hex(h.data(),32);Upload u;Request r;
 CHECK_FALSE(u.begin(131073,hash,1,0));CHECK_FALSE(u.begin(s.size(),"bad",1,0));
 REQUIRE(u.begin(s.size(),hash,1,0));CHECK_FALSE(u.chunk(1,"00",1,1));
 REQUIRE(u.begin(s.size(),hash,1,0));CHECK_FALSE(u.chunk(0,"00",2,1));
 REQUIRE(u.begin(s.size(),hash,1,0));CHECK_FALSE(u.chunk(0,"00",1,30000));
 REQUIRE(u.begin(s.size(),hash,1,0));CHECK_FALSE(u.chunk(0,"0g",1,1));
 REQUIRE(u.begin(s.size(),hash,1,0));CHECK_FALSE(u.finish(r,1,1));
 REQUIRE(u.begin(s.size(),std::string(64,'0'),1,0));REQUIRE(u.chunk(0,xorr::hex(reinterpret_cast<const uint8_t*>(s.data()),s.size()),1,1));CHECK_FALSE(u.finish(r,1,2));
}
TEST_CASE("Solana review request rejects invalid JSON byte encoding and lifetime") {
 Request r;CHECK_FALSE(parseRequest("{}",r));auto s=requestJson();REQUIRE(parseRequest(s,r));
 JsonDocument d;REQUIRE_FALSE(deserializeJson(d,s));d["remainingMs"]=0;serializeJson(d,s=std::string());CHECK_FALSE(parseRequest(s,r));
 d["remainingMs"]=10000;d["message"]="ff";serializeJson(d,s=std::string());CHECK_FALSE(parseRequest(s,r));
}

TEST_CASE("Solana Jupiter ordinary route mint is proven by ATA derivation") {
 std::ifstream file("firmware/test/fixtures/jupiter-known-route.json");std::string s((std::istreambuf_iterator<char>(file)),{});
 JsonDocument d;REQUIRE_FALSE(deserializeJson(d,s));d["signalId"]="route-proof";d["remainingMs"]=120000;
 std::string request;serializeJson(d,request);Request r;REQUIRE(parseRequest(request,r));
 bool route=false;for(const auto &decoded:r.value.decoded)if(decoded.name=="Jupiter v6 route"){
  route=true;CHECK(decoded.known);CHECK(decoded.inputMint=="So11111111111111111111111111111111111111112");CHECK(decoded.amount==10000000);
 }CHECK(route);CHECK(r.value.blind); // Unauthenticated address tables always need blind consent.
 d["mintProofs"][0]["mint"]="11111111111111111111111111111111";
 serializeJson(d,request=std::string());CHECK_FALSE(parseRequest(request,r));
}
TEST_CASE("Solana account index and compact account counts reject out of bounds") {
 auto f=fixture("system-v0");auto m=parse(f.bytes);REQUIRE(m.valid);
 Reader reader{f.bytes.data(),f.bytes.size()};reader.at=4;reader.compact();reader.at+=32*m.staticCount+32;
 reader.compact();auto position=reader.at;auto b=f.bytes;b[position]=255;CHECK_FALSE(parse(b).valid);
 b=f.bytes;b[position+2]=255;CHECK_FALSE(parse(b).valid);
}
TEST_CASE("Solana u64 amounts retain maximum precision without floating point") {
 auto f=fixture("system-legacy");auto m=parse(f.bytes);auto ix=m.instructions.back();
 std::fill(ix.data.begin()+4,ix.data.end(),255);auto d=decode(m,ix);REQUIRE(d.known);CHECK(d.amount==UINT64_MAX);
}
TEST_CASE("Solana malformed Phoenix options and flags require blind signing") {
 auto f=fixture("phoenix-long");auto m=parse(f.bytes);auto ix=m.instructions.back();
 auto original=ix;ix.data[10]=2;CHECK_FALSE(decode(m,ix).known);
 ix=original;ix.data.back()=2;CHECK_FALSE(decode(m,ix).known);
 ix=original;ix.data[ix.data.size()-2]=128;CHECK(decode(m,ix).known);
 ix=original;ix.data[ix.data.size()-2]=64;CHECK_FALSE(decode(m,ix).known);
}
