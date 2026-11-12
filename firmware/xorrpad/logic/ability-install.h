#pragma once
#include "abilities.h"
namespace xorr {namespace abilities {
struct Upload {
  Manifest manifest;std::vector<uint8_t> bytes;
  uint32_t epoch=0,at=0;int slot=-1;
  void cancel(){slot=-1;bytes.clear();}
  bool live(uint32_t connection,uint32_t now)const{return slot>=0&&connection==epoch&&uint32_t(now-at)<30000;}
  bool begin(JsonVariantConst d,const std::string &trusted,uint32_t connection,uint32_t now) {
    cancel();Manifest m;
    if(!d["slot"].is<int>() || d["slot"].as<int>()<0 || d["slot"].as<int>()>1 || !m.parse(d["manifest"]) || m.developer!=trusted)return false;
    uint8_t pk[32],signature[64];auto text=m.signedText();
    if(!unhex(trusted,pk,32)||!unhex(m.signature,signature,64)||!Ed25519::verify(signature,pk,text.data(),text.size()))return false;
    slot=d["slot"];manifest=m;epoch=connection;at=now;bytes.reserve(m.size);return true;
  }
  bool chunk(JsonVariantConst d,uint32_t connection,uint32_t now) {
    std::string s=d["data"]|"";
    if(!live(connection,now)||!d["offset"].is<uint32_t>()||d["offset"].as<uint32_t>()!=bytes.size()||s.empty()||s.size()>512||s.size()%2||s.size()/2>manifest.size-bytes.size()){cancel();return false;}
    std::vector<uint8_t> chunk(s.size()/2);if(!unhex(s,chunk.data(),chunk.size())){cancel();return false;}
    bytes.insert(bytes.end(),chunk.begin(),chunk.end());return true;
  }
  bool complete(const std::string&trusted,uint32_t connection,uint32_t now)const{return live(connection,now)&&manifest.verify(bytes,trusted);}
};
}}
