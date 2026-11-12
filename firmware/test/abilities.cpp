#include "../xorrpad/logic/ability-install.h"
#include "../xorrpad/src/wasm3/xorr_heap.h"
#include "doctest.h"
#include <chrono>
#include <fstream>
#include <random>
using namespace xorr::abilities;
namespace {
uint32_t nowAbility(){using namespace std::chrono;return uint32_t(duration_cast<milliseconds>(steady_clock::now().time_since_epoch()).count());}
struct Bundle {
  JsonDocument json;Manifest m;std::vector<uint8_t> wasm;std::array<uint8_t,32> seed{},pk{};
  Bundle(const char* file="market-pulse",const char* caps="alerts.price,tft.widget") {
    std::ifstream input(std::string("sdk/abilities/out/")+file+".wasm",std::ios::binary);
    wasm.assign(std::istreambuf_iterator<char>(input),{});
    REQUIRE(!wasm.empty());
    std::random_device random;for(auto &b:seed)b=uint8_t(random());Ed25519::derivePublicKey(pk.data(),seed.data());
    json["abi"]=1;json["id"]=file;json["name"]="Test ability";json["version"]="1.0.0";json["memoryPages"]=2;json["fuel"]=10000;
    auto c=json["capabilities"].to<JsonArray>();std::string all=caps;size_t at=0;
    while(at<all.size()){auto end=all.find(',',at);c.add(all.substr(at,end-at));if(end==std::string::npos)break;at=end+1;}
    json["size"]=wasm.size();json["sha256"]=xorr::hex(xorr::sha(wasm.data(),wasm.size()).data(),32);json["developerPublicKey"]=xorr::hex(pk.data(),32);json["signature"]=std::string(128,'0');sign();
  }
  void sign(){REQUIRE(m.parse(json.as<JsonVariantConst>()));auto text=m.signedText();uint8_t sig[64];Ed25519::sign(sig,seed.data(),pk.data(),text.data(),text.size());json["signature"]=xorr::hex(sig,64);REQUIRE(m.parse(json.as<JsonVariantConst>()));}
};
}
TEST_CASE("ability capabilities contain no signing or trade import") {CHECK(capability("sign")==0);CHECK(capability("link.trade")==0);CHECK(capability("keys.macro")==Macro);}
TEST_CASE("ability manifest rejects unknown capability") {Bundle b;b.json["capabilities"].add("wallet.sign");CHECK_FALSE(b.m.parse(b.json.as<JsonVariantConst>()));}
TEST_CASE("ability manifest rejects duplicate capability") {Bundle b;b.json["capabilities"].add("tft.widget");CHECK_FALSE(b.m.parse(b.json.as<JsonVariantConst>()));}
TEST_CASE("ability manifest rejects unordered capabilities") {Bundle b;b.json["capabilities"][0]="tft.widget";b.json["capabilities"][1]="alerts.price";CHECK_FALSE(b.m.parse(b.json.as<JsonVariantConst>()));}
TEST_CASE("ability manifest rejects injected fields") {Bundle b;b.json["signing"]=true;CHECK_FALSE(b.m.parse(b.json.as<JsonVariantConst>()));}
TEST_CASE("ability manifest rejects canonical newline injection") {Bundle b;b.json["name"]="name\nwallet";CHECK_FALSE(b.m.parse(b.json.as<JsonVariantConst>()));}
TEST_CASE("ability memory pages bounded") {Bundle b;for(auto n:{0,5,65536}){b.json["memoryPages"]=n;CHECK_FALSE(b.m.parse(b.json.as<JsonVariantConst>()));}}
TEST_CASE("ability fuel bounded") {Bundle b;for(auto n:{0,99,100001}){b.json["fuel"]=n;CHECK_FALSE(b.m.parse(b.json.as<JsonVariantConst>()));}}
TEST_CASE("ability signature binds manifest capabilities and limits") {Bundle b;REQUIRE(b.m.verify(b.wasm,b.m.developer));b.m.fuel++;CHECK_FALSE(b.m.verify(b.wasm,b.m.developer));}
TEST_CASE("ability signature binds wasm bytes") {Bundle b;b.wasm.back()^=1;CHECK_FALSE(b.m.verify(b.wasm,b.m.developer));}
TEST_CASE("ability signature rejects untrusted developer") {Bundle b;CHECK_FALSE(b.m.verify(b.wasm,std::string(64,'0')));}
TEST_CASE("real wasm3 runs Market Pulse without invented price") {Bundle b;Runtime r;REQUIRE_MESSAGE(r.open(b.m,b.wasm,b.m.developer,nowAbility),r.error);Effects e;REQUIRE(r.tick(0,0,e));CHECK(e.widget.find("unavailable")!=std::string::npos);REQUIRE(r.tick(1,123450000,e));CHECK(e.widget=="Market Pulse: $123.45");r.close();CHECK(xorr_wasm_heap_used()==0);}
TEST_CASE("real wasm3 runs Pomodoro using elapsed time and chimes once") {Bundle b("pomodoro","audio.chime,tft.widget");Runtime r;REQUIRE_MESSAGE(r.open(b.m,b.wasm,b.m.developer,nowAbility),r.error);Effects e;REQUIRE(r.tick(10,0,e));CHECK(e.widget=="Pomodoro: focus 25:00");REQUIRE(r.tick(1510,0,e));CHECK(e.chime==1);REQUIRE(r.tick(1511,0,e));CHECK(e.chime==-1);}
TEST_CASE("wasm signing import escape refused") {Bundle b("sign-escape","tft.widget");Runtime r;CHECK_FALSE(r.open(b.m,b.wasm,b.m.developer,nowAbility));CHECK(r.error.find("import")!=std::string::npos);}
TEST_CASE("wasm link trade import escape refused") {Bundle b("trade-escape","keys.macro");Runtime r;CHECK_FALSE(r.open(b.m,b.wasm,b.m.developer,nowAbility));}
TEST_CASE("wasm undeclared capability import refused") {Bundle b("market-pulse","tft.widget");Runtime r;CHECK_FALSE(r.open(b.m,b.wasm,b.m.developer,nowAbility));}
TEST_CASE("wasm out of bounds host pointer refuses and discards effects") {Bundle b("pointer-escape","tft.widget");Runtime r;REQUIRE_MESSAGE(r.open(b.m,b.wasm,b.m.developer,nowAbility),r.error);Effects e;CHECK_FALSE(r.tick(0,0,e));CHECK(e.widget.empty());CHECK_FALSE(r.running());}
TEST_CASE("wasm out of bounds linear memory traps") {Bundle b("memory-escape","tft.widget");Runtime r;REQUIRE_MESSAGE(r.open(b.m,b.wasm,b.m.developer,nowAbility),r.error);Effects e;CHECK_FALSE(r.tick(0,0,e));}
TEST_CASE("wasm infinite loop fuel kill") {Bundle b("spin","tft.widget");Runtime r;REQUIRE_MESSAGE(r.open(b.m,b.wasm,b.m.developer,nowAbility),r.error);Effects e;CHECK_FALSE(r.tick(0,0,e));CHECK(r.error.find("fuel")!=std::string::npos);CHECK_FALSE(r.running());}
TEST_CASE("wasm recursion is bounded") {Bundle b("recurse","keys.macro");Runtime r;REQUIRE_MESSAGE(r.open(b.m,b.wasm,b.m.developer,nowAbility),r.error);Effects e;CHECK_FALSE(r.tick(1,0,e));}
TEST_CASE("wasm memory grow cannot exceed manifest cap") {Bundle b("grow","tft.widget");Runtime r;REQUIRE_MESSAGE(r.open(b.m,b.wasm,b.m.developer,nowAbility),r.error);Effects e;REQUIRE(r.tick(0,0,e));CHECK(e.widget=="bounded");}
TEST_CASE("wasm host call flood killed") {Bundle b("flood","tft.widget");Runtime r;REQUIRE_MESSAGE(r.open(b.m,b.wasm,b.m.developer,nowAbility),r.error);Effects e;CHECK_FALSE(r.tick(0,0,e));CHECK(e.widget.empty());}
TEST_CASE("wasm macro cannot emit trade actions") {Bundle b("macro-escape","keys.macro");Runtime r;REQUIRE_MESSAGE(r.open(b.m,b.wasm,b.m.developer,nowAbility),r.error);Effects e;CHECK_FALSE(r.tick(0,0,e));CHECK(e.macro==-1);}
TEST_CASE("ability watchdog refuses expired budget independently of fuel") {Budget b;b.clock=nowAbility;b.deadline=nowAbility();b.fuel=10000;CHECK(std::string(b.step())=="ability watchdog deadline");}
TEST_CASE("ability total engine heap bounded and reclaimed") {auto before=xorr_wasm_heap_used();CHECK(xorr_wasm_calloc(768*1024+1)==nullptr);CHECK(xorr_wasm_heap_used()==before);}
TEST_CASE("ability upload rejects ordering and connection changes") {Bundle b;JsonDocument d;d["slot"]=0;d["manifest"].set(b.json);Upload u;REQUIRE(u.begin(d.as<JsonVariantConst>(),b.m.developer,1,0));d["offset"]=0;d["data"]="00";CHECK_FALSE(u.chunk(d.as<JsonVariantConst>(),2,1));CHECK(u.slot==-1);}
TEST_CASE("ability upload expires without trusting partial content") {Bundle b;JsonDocument d;d["slot"]=0;d["manifest"].set(b.json);Upload u;REQUIRE(u.begin(d.as<JsonVariantConst>(),b.m.developer,1,0));CHECK_FALSE(u.complete(b.m.developer,1,30000));CHECK_FALSE(u.complete(b.m.developer,1,1));}

TEST_CASE("ability rejects malformed and duplicate section envelopes before parsing") {
  Bundle b;Runtime r;
  auto bytes=b.wasm;bytes[0]=1;CHECK_FALSE(envelope(bytes));
  bytes=b.wasm;bytes.insert(bytes.end(),{1,1,0});CHECK_FALSE(envelope(bytes));
  bytes=b.wasm;bytes.insert(bytes.end(),{4,1,0});CHECK_FALSE(envelope(bytes));
  bytes=b.wasm;bytes.insert(bytes.end(),{8,1,0});CHECK_FALSE(envelope(bytes));
  bytes=b.wasm;bytes.insert(bytes.end(),{11,255,255,255,255,127});CHECK_FALSE(envelope(bytes));
}
TEST_CASE("ability runtime accepts C and AssemblyScript templates") {
  for(const char* name:{"ability","assemblyscript"}){
    Bundle b(name,"tft.widget");Runtime r;REQUIRE_MESSAGE(r.open(b.m,b.wasm,b.m.developer,nowAbility),r.error);
    Effects e;REQUIRE(r.tick(0,0,e));CHECK(e.widget=="My ability");
  }
}
TEST_CASE("ability state and effects are isolated between runtimes") {
  Bundle b("pomodoro","audio.chime,tft.widget");Runtime first,second;
  REQUIRE(first.open(b.m,b.wasm,b.m.developer,nowAbility));REQUIRE(second.open(b.m,b.wasm,b.m.developer,nowAbility));
  Effects e;REQUIRE(first.tick(1,0,e));REQUIRE(first.tick(1501,0,e));CHECK(e.chime==1);
  REQUIRE(second.tick(1501,0,e));CHECK(e.chime==-1);CHECK(e.widget=="Pomodoro: focus 25:00");
}
TEST_CASE("ability upload accepts complete signed bytes only with exact offset") {
  Bundle b;JsonDocument d;d["slot"]=1;d["manifest"].set(b.json);Upload u;
  REQUIRE(u.begin(d.as<JsonVariantConst>(),b.m.developer,7,0));
  for(size_t at=0;at<b.wasm.size();at+=256){size_t n=std::min(size_t(256),b.wasm.size()-at);d["offset"]=at;d["data"]=xorr::hex(b.wasm.data()+at,n);REQUIRE(u.chunk(d.as<JsonVariantConst>(),7,1));}
  CHECK(u.complete(b.m.developer,7,2));CHECK_FALSE(u.complete(b.m.developer,8,2));
  u.bytes.back()^=1;CHECK_FALSE(u.complete(b.m.developer,7,2));
}
