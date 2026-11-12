#include "vendor/doctest.h"
#include "../xorrpad/logic/ota.h"
using namespace xorr;
static std::vector<uint8_t> patchBytes() {
  return {'X','O','R','R','D','1','\r','\n',0,0,0,0,0,4,0,0,0,1,2,0,0,0,'x','y',255};
}
TEST_CASE("OTA rollout hash consumes all SHA256 bytes") {
  CHECK(rolloutBucket("esp32-000000000001") == 2);
  CHECK(rolloutBucket("esp32-000000000002") == 33);
}
TEST_CASE("OTA beta is opt in and rollout percentage has strict boundary") {
  Manifest m; m.channel="beta";m.rolloutPercent=100;
  CHECK_FALSE(otaEligible(m,"pad","stable")); CHECK(otaEligible(m,"pad","beta"));
  m.channel="stable";m.rolloutPercent=rolloutBucket("pad");
  CHECK_FALSE(otaEligible(m,"pad","stable")); ++m.rolloutPercent;
  CHECK(otaEligible(m,"pad","stable"));m.rolloutPercent=0;CHECK_FALSE(otaEligible(m,"pad","beta"));
  CHECK_FALSE(otaEligible(m,"","stable")); CHECK_FALSE(otaEligible(m,"pad","other"));
}
TEST_CASE("OTA streaming patch spans every possible chunk boundary") {
  auto p=patchBytes();const std::string base="abcd";
  for(size_t chunk=1;chunk<=p.size();++chunk) {
    DeltaPatcher d;d.begin(base.size(),6);std::string out;
    for(size_t at=0;at<p.size();at+=chunk) REQUIRE(d.feed(p.data()+at,std::min(chunk,p.size()-at),
      [&](uint32_t pos,uint8_t *bytes,size_t n){memcpy(bytes,base.data()+pos,n);return true;},
      [&](const uint8_t *bytes,size_t n){out.append(reinterpret_cast<const char *>(bytes),n);return true;}));
    CHECK(d.complete());CHECK(out=="abcdxy");
  }
}
TEST_CASE("OTA patch rejects truncation, trailing bytes, overflow and invalid opcodes") {
  auto good=patchBytes();
  for(size_t length=0;length<good.size();++length) {
    DeltaPatcher d;d.begin(4,6);
    if(length)d.feed(good.data(),length,[](uint32_t,uint8_t*,size_t){return true;},[](const uint8_t*,size_t){return true;});
    CHECK_FALSE(d.complete());
  }
  for(auto mutation : {0,8,9,13,18,25}) {
    auto p=good;if(mutation==25)p.push_back(0);else p[mutation]=254;
    DeltaPatcher d;d.begin(4,6);
    CHECK_FALSE(d.feed(p.data(),p.size(),[](uint32_t,uint8_t*,size_t){return true;},[](const uint8_t*,size_t){return true;}));
    CHECK_FALSE(d.complete());
  }
}
TEST_CASE("OTA patch fails closed on base read or flash write failure") {
  auto p=patchBytes();DeltaPatcher d;d.begin(4,6);
  CHECK_FALSE(d.feed(p.data(),p.size(),[](uint32_t,uint8_t*,size_t){return false;},[](const uint8_t*,size_t){return true;}));
  d.begin(4,6);CHECK_FALSE(d.feed(p.data(),p.size(),[](uint32_t,uint8_t*,size_t){return true;},[](const uint8_t*,size_t){return false;}));
}
TEST_CASE("OTA manifest refuses untyped channel and rollout metadata") {
  Manifest m;
  for(auto json : {"{\"size\":1,\"channel\":null}","{\"size\":1,\"channel\":\"\",\"rolloutPercent\":100}",
    "{\"size\":1,\"channel\":\"stable\",\"rolloutPercent\":-1}","{\"size\":1,\"rolloutPercent\":100}"}) CHECK_FALSE(parseManifest(json,m));
  CHECK_FALSE(otaVersion("3.0.0\nbeta"));CHECK_FALSE(otaVersion("3..0"));CHECK(otaVersion("3.0.0"));
}
