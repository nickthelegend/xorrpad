#include "doctest.h"
#include "../xorrpad/logic/profiles.h"
using namespace xorr;
namespace {
LayerMap mapFor(uint32_t revision=7) {
  LayerMap m;m.revision=revision;
  const char *actions[]={"momentum","grid","dca","risk","yield","rebalance","no","yes","buy","base","kill","mic","sell","portfolio"};
  for(int r=0;r<4;++r)for(int c=0;c<4;++c){int i=cell(r,c);if(i>=0)m.keys.push_back({r,c,actions[i],actions[i]});}
  return m;
}
ProfileSnapshot snapshot(size_t count=8) {
  ProfileSnapshot s;
  for(size_t i=0;i<count;++i){StoredProfile p;p.name="Profile "+std::to_string(i);for(int l=0;l<3;++l)p.layers[l]=mapFor(i*3+l);s.profiles.push_back(p);}
  return s;
}
JsonDocument names(size_t count=8) {
  JsonDocument d;auto a=d.to<JsonArray>();for(size_t i=0;i<count;++i)a.add("Profile "+std::to_string(i));return d;
}
JsonDocument message(unsigned i,unsigned l) {
  JsonDocument d;d["profile"]=i;d["layer"]=l;writeLayer(d["map"].to<JsonObject>(),mapFor(i*3+l));return d;
}
}
TEST_CASE("S3 eight profiles preserve all three maps and revisions across storage serialization") {
  auto s=snapshot();s.active=7;s.layer=2;s.profiles[7].layers[2].keys[0].action="layer:next";
  ProfileSnapshot reboot;REQUIRE(ProfileSnapshot::parse(s.serialize(),reboot));
  CHECK(reboot.active==7);CHECK(reboot.layer==2);CHECK(reboot.profiles.size()==8);
  CHECK(reboot.profiles[7].layers[2].keys[0].action=="layer:next");
  for(unsigned i=0;i<8;++i)for(unsigned l=0;l<3;++l)CHECK(reboot.profiles[i].layers[l].revision==i*3+l);
}
TEST_CASE("S3 profile limits are one through eight") {
  CHECK(snapshot(1).valid());CHECK(snapshot(8).valid());
  CHECK_FALSE(snapshot(0).valid());CHECK_FALSE(snapshot(9).valid());
}
TEST_CASE("S3 invalid stored selection is rejected without mutating installed data") {
  auto old=snapshot(1);auto json=old.serialize();JsonDocument d;REQUIRE_FALSE(deserializeJson(d,json));
  d["active"]=1;std::string text;serializeJson(d,text);
  CHECK_FALSE(ProfileSnapshot::parse(text,old));CHECK(old.serialize()==json);
  d["active"]=0;d["layer"]=3;text.clear();serializeJson(d,text);
  CHECK_FALSE(ProfileSnapshot::parse(text,old));CHECK(old.serialize()==json);
}
TEST_CASE("S3 malformed truncated oversized and wrong-version storage fail closed") {
  ProfileSnapshot out;CHECK_FALSE(ProfileSnapshot::parse("{",out));
  CHECK_FALSE(ProfileSnapshot::parse(std::string(65537,' '),out));
  JsonDocument d;REQUIRE_FALSE(deserializeJson(d,snapshot(1).serialize()));
  d["v"]=2;std::string json;serializeJson(d,json);CHECK_FALSE(ProfileSnapshot::parse(json,out));
}
TEST_CASE("S3 names reject duplicates controls and excessive lengths") {
  auto s=snapshot(2);s.profiles[1].name=s.profiles[0].name;CHECK_FALSE(s.valid());
  s.profiles[1].name="bad\nname";CHECK_FALSE(s.valid());
  s.profiles[1].name=std::string(21,'a');CHECK_FALSE(s.valid());
  s.profiles[1].name="";CHECK_FALSE(s.valid());
}
TEST_CASE("S3 storage requires every layer and every protected control") {
  auto s=snapshot(1);s.profiles[0].layers[2].keys.clear();CHECK_FALSE(s.valid());
  s=snapshot(1);s.profiles[0].layers[1].keys[10].action="buy";CHECK_FALSE(s.valid());
}
TEST_CASE("S3 metadata must be an array of one to eight distinct string names") {
  ProfileSync sync;auto d=names();CHECK(sync.begin(d.as<JsonVariantConst>()));
  d=names(9);CHECK_FALSE(sync.begin(d.as<JsonVariantConst>()));
  d.clear();d.to<JsonArray>();CHECK_FALSE(sync.begin(d.as<JsonVariantConst>()));
  d.add("a");d.add("a");CHECK_FALSE(sync.begin(d.as<JsonVariantConst>()));
  d.clear();d.add(12);CHECK_FALSE(sync.begin(d.as<JsonVariantConst>()));
}
TEST_CASE("S3 interrupted sync cannot replace the previous installed snapshot") {
  auto old=snapshot();auto stored=old.serialize();ProfileSync sync;auto n=names();REQUIRE(sync.begin(n.as<JsonVariantConst>()));
  for(unsigned i=0;i<8;++i)for(unsigned l=0;l<3;++l){if(i==7&&l==2)continue;auto d=message(i,l);REQUIRE(sync.map(d.as<JsonVariantConst>()));}
  CHECK_FALSE(sync.ready());CHECK_FALSE(sync.candidate(old).valid());
  ProfileSnapshot reboot;REQUIRE(ProfileSnapshot::parse(stored,reboot));CHECK(reboot.serialize()==old.serialize());
}
TEST_CASE("S3 out-of-order desk sync completes only after all twenty-four maps") {
  ProfileSync sync;auto n=names();REQUIRE(sync.begin(n.as<JsonVariantConst>()));
  for(int i=7;i>=0;--i)for(int l=2;l>=0;--l){auto d=message(i,l);REQUIRE(sync.map(d.as<JsonVariantConst>()));}
  CHECK(sync.ready());CHECK(sync.candidate(snapshot()).valid());
}
TEST_CASE("S3 repeated map does not count as another layer") {
  ProfileSync sync;auto n=names(1);REQUIRE(sync.begin(n.as<JsonVariantConst>()));
  auto d=message(0,0);for(int i=0;i<24;++i)REQUIRE(sync.map(d.as<JsonVariantConst>()));CHECK_FALSE(sync.ready());
}
TEST_CASE("S3 new metadata cancels the previous partial sync") {
  ProfileSync sync;auto n=names(1);REQUIRE(sync.begin(n.as<JsonVariantConst>()));
  auto d=message(0,0);REQUIRE(sync.map(d.as<JsonVariantConst>()));REQUIRE(sync.begin(n.as<JsonVariantConst>()));
  d=message(0,1);REQUIRE(sync.map(d.as<JsonVariantConst>()));d=message(0,2);REQUIRE(sync.map(d.as<JsonVariantConst>()));CHECK_FALSE(sync.ready());
}
TEST_CASE("S3 sync preserves selection by name when desk reorders profiles") {
  auto old=snapshot(2);old.active=1;old.layer=2;ProfileSync sync;
  JsonDocument n;n.add("Profile 1");n.add("Profile 0");REQUIRE(sync.begin(n.as<JsonVariantConst>()));
  for(unsigned i=0;i<2;++i)for(unsigned l=0;l<3;++l){auto d=message(i,l);REQUIRE(sync.map(d.as<JsonVariantConst>()));}
  auto next=sync.candidate(old);CHECK(next.active==0);CHECK(next.layer==2);
}
TEST_CASE("S3 removed active profile selects the first Spot layer") {
  auto old=snapshot(2);old.active=1;old.layer=2;ProfileSync sync;auto n=names(1);REQUIRE(sync.begin(n.as<JsonVariantConst>()));
  for(unsigned l=0;l<3;++l){auto d=message(0,l);REQUIRE(sync.map(d.as<JsonVariantConst>()));}
  CHECK(sync.candidate(old).active==0);CHECK(sync.candidate(old).layer==0);
}
TEST_CASE("S3 map indices require bounded integers and a metadata declaration") {
  ProfileSync sync;auto d=message(0,0);CHECK_FALSE(sync.map(d.as<JsonVariantConst>()));
  auto n=names(1);REQUIRE(sync.begin(n.as<JsonVariantConst>()));d["profile"]=-1;CHECK_FALSE(sync.map(d.as<JsonVariantConst>()));
  d["profile"]=0;d["layer"]=3;CHECK_FALSE(sync.map(d.as<JsonVariantConst>()));
  d["layer"]="0";CHECK_FALSE(sync.map(d.as<JsonVariantConst>()));
}
TEST_CASE("S3 keymap revision cells and text require exact types") {
  auto d=message(0,0);LayerMap out;
  d["map"]["revision"]="7";CHECK_FALSE(readLayer(d["map"],out));
  d=message(0,0);d["map"]["keys"][0]["row"]="0";CHECK_FALSE(readLayer(d["map"],out));
  d=message(0,0);d["map"]["keys"][0]["label"]=4;CHECK_FALSE(readLayer(d["map"],out));
}
TEST_CASE("S3 native parser enforces immutable mic kill yes and no cells in every layer") {
  for(unsigned index:{6u,7u,10u,11u}) {
    auto d=message(0,0);d["map"]["keys"][index]["action"]="buy";LayerMap out;CHECK_FALSE(readLayer(d["map"],out));
  }
}

TEST_CASE("S3 maximum-length eight-profile storage fits the bounded snapshot") {
  auto s=snapshot();
  for(size_t i=0;i<s.profiles.size();++i) {
    s.profiles[i].name=std::string(19,'p')+char('0'+i);
    for(auto &layer:s.profiles[i].layers)for(auto &key:layer.keys) {
      if(key.action!="kill" && key.action!="mic" && key.action!="yes" && key.action!="no")key.action=std::string(96,'a');
      key.label=std::string(16,'"');
    }
  }
  auto bytes=s.serialize();REQUIRE_FALSE(bytes.empty());CHECK(bytes.size()<=65536);
  ProfileSnapshot reboot;CHECK(ProfileSnapshot::parse(bytes,reboot));CHECK(reboot.serialize()==bytes);
}
