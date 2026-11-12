#pragma once
#include "keymap.h"
#include "logic/profiles.h"
class Profiles {
  xorr::ProfileSnapshot saved;
  xorr::ProfileSync sync;
  bool dirty=false, attempted=false;
  uint32_t attemptedAt=0;
  bool persist(const xorr::ProfileSnapshot &next) {
    auto json=next.serialize();if(json.empty())return false;
    Preferences p;if(!p.begin("xorrprofiles",false,"profiles"))return false;
    bool ok=p.putBytes("snapshot",json.data(),json.size())==json.size();p.end();return ok;
  }
  bool apply(const xorr::ProfileSnapshot &next) {
    if(!next.valid())return false;
    JsonDocument d;xorr::writeLayer(d.to<JsonObject>(),next.profiles[next.active].layers[next.layer]);
    return applyKeymap(d.as<JsonVariantConst>(),false);
  }
public:
  bool voice=false;
  uint8_t active()const{return saved.active;}
  uint8_t layer()const{return saved.layer;}
  const char *name()const{return saved.profiles.empty()?"Scalper":saved.profiles[saved.active].name.c_str();}
  const char *layerName()const{return voice?"Voice":saved.layer==0?"Spot":saved.layer==1?"Perps":"Predict";}
  void begin() {
    Preferences p;
    if(p.begin("xorrprofiles",true,"profiles")) {
      size_t n=p.getBytesLength("snapshot");
      if(n && n<=65536) {
        std::string json(n,'\0');
        if(p.getBytes("snapshot",json.data(),n)==n)xorr::ProfileSnapshot::parse(json,saved);
      }
      p.end();
    }
    if(saved.valid()) {apply(saved);return;}
    // Until a desk sync, all three layers retain the installed v1 keymap.
    xorr::StoredProfile fallback;fallback.name="Scalper";
    for(auto &l:fallback.layers) {
      l.revision=keymapRevision;
      for(int r=0;r<4;++r)for(int c=0;c<4;++c)if(KEYMAP[r][c].role!=ROLE_NONE)
        l.keys.push_back({r,c,actionIds[r][c].c_str(),keyLabels[r][c].c_str()});
    }
    saved.profiles={fallback};saved.active=saved.layer=0;
  }
  bool metadata(JsonVariantConst d) {dirty=attempted=false;return sync.begin(d["names"]);}
  bool map(JsonVariantConst d, bool busy=false) {
    if(!sync.map(d))return false;
    if(sync.ready())dirty=true;
    return refresh(busy);
  }
  bool refresh(bool busy) {
    if(!dirty || busy)return true;
    uint32_t now=millis();
    if(attempted && uint32_t(now-attemptedAt)<5000)return false;
    attempted=true;attemptedAt=now;
    auto next=sync.candidate(saved);
    if(!next.valid() || !persist(next))return false;
    if(!apply(next))return false;
    saved=std::move(next);sync.cancel();dirty=attempted=false;voice=false;return true;
  }
  bool select(int i,int l,bool busy=false) {
    if(busy || dirty || i<0 || size_t(i)>=saved.profiles.size() || l<0 || l>2)return false;
    auto next=saved;next.active=i;next.layer=l;
    if(!persist(next) || !apply(next))return false;
    saved=std::move(next);voice=false;return true;
  }
  bool next(bool busy=false) {return select((saved.active+1)%saved.profiles.size(),saved.layer,busy);}
  bool nextLayer(bool busy=false) {return select(saved.active,(saved.layer+1)%3,busy);}
};
