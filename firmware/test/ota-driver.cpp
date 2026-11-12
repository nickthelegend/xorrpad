#include "../xorrpad/logic/ota.h"
#include <iostream>
static bool bytes(JsonVariantConst chunks,std::vector<uint8_t> &out) {
  if(!chunks.is<JsonArrayConst>()) return false;
  for(auto part:chunks.as<JsonArrayConst>()) {
    std::string hex=part|"";size_t at=out.size();
    if(hex.empty() || hex.size()>1024 || hex.size()%2 || at+hex.size()/2>0x300000) return false;
    out.resize(at+hex.size()/2);
    if(!xorr::unhex(hex,out.data()+at,hex.size()/2)) return false;
  }
  return true;
}
int main() {
  std::string line;
  while(std::getline(std::cin,line)) {
    JsonDocument d,out;bool ok=!deserializeJson(d,line);xorr::Manifest m;
    std::string manifest;serializeJson(d["manifest"],manifest);
    uint8_t pk[32];ok=ok && xorr::parseManifest(manifest,m) && xorr::unhex(d["publicKey"]|"",pk,32) && m.verify(pk);
    out["bucket"]=xorr::rolloutBucket(d["device"]|"pad");
    ok=ok && xorr::otaEligible(m,d["device"]|"pad",d["channel"]|"stable");
    std::vector<uint8_t> base,patch,image;
    if(ok && m.delta.present) {
      ok=bytes(d["base"],base) && bytes(d["patch"],patch) &&
        base.size()==m.delta.baseSize && patch.size()==m.delta.size && std::string(d["version"]|"")==m.delta.fromVersion;
      auto h=xorr::sha(base.data(),base.size());ok=ok && xorr::hex(h.data(),32)==m.delta.baseSha256;
      h=xorr::sha(patch.data(),patch.size());ok=ok && xorr::hex(h.data(),32)==m.delta.sha256;
      xorr::DeltaPatcher decoder;decoder.begin(m.delta.baseSize,m.size);
      for(size_t at=0;ok && at<patch.size();at+=7) ok=decoder.feed(patch.data()+at,std::min(size_t(7),patch.size()-at),
        [&](uint32_t pos,uint8_t *data,size_t n){std::copy_n(base.data()+pos,n,data);return true;},
        [&](const uint8_t *data,size_t n){image.insert(image.end(),data,data+n);return true;});
      h=xorr::sha(image.data(),image.size());ok=ok && decoder.complete() && image.size()==m.size && xorr::hex(h.data(),32)==m.sha256 && m.verify(pk);
    }
    out["ok"]=ok;serializeJson(out,std::cout);std::cout<<std::endl;
  }
}
