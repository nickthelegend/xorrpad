#pragma once
#include "logic/ability-install.h"
#include "padstate.h"
#include <Preferences.h>
// Two bounded, independent slots. Storage is the existing reset-wiped profiles NVS.
class Abilities {
  using Manifest=xorr::abilities::Manifest;
  using Runtime=xorr::abilities::Runtime;
  struct Slot {Runtime runtime;Manifest manifest;String error;bool installed=false,visible=true;} slots[2];
  Preferences nvs;bool storage=false;
  std::string developer,pendingDeveloper;
  uint32_t reviewEpoch=0,reviewAt=0,nextTick=0;
  bool reviewShown=false;
  xorr::Hold hold;
  xorr::abilities::Upload upload;
  std::string encodedManifest;
  void cancelReview(PadState &pad){pendingDeveloper.clear();hold.release();reviewShown=false;pad.abilityReview=false;}
  bool load(int slot,const std::string &record) {
    if(record.size()<3)return false;
    size_t n=uint8_t(record[0])+(uint8_t(record[1])<<8);
    if(n>1024 || n+2>=record.size())return false;
    JsonDocument d;Manifest m;
    if(deserializeJson(d,record.data()+2,n)||!m.parse(d.as<JsonVariantConst>()))return false;
    std::vector<uint8_t> bytes(record.begin()+2+n,record.end());
    auto &s=slots[slot];s.installed=false;s.runtime.close();
    if(!s.runtime.open(m,bytes,developer,clock)){s.error=s.runtime.error.c_str();return false;}
    s.manifest=m;s.installed=true;s.visible=true;s.error="";return true;
  }
  static uint32_t clock(){return millis();}
public:
  uint32_t priceAt=0;
  bool reviewing()const{return !pendingDeveloper.empty();}
  void begin(){
    storage=nvs.begin("xorrability",false,"profiles");if(!storage)return;
    developer=nvs.getString("developer").c_str();uint8_t pk[32];
    if(!xorr::unhex(developer,pk,32)){developer.clear();return;}
    for(int i=0;i<2;++i){String key="slot"+String(i);size_t n=nvs.getBytesLength(key.c_str());if(n>0&&n<=xorr::abilities::MaxWasm+1026){std::string data(n,'\0');if(nvs.getBytes(key.c_str(),data.data(),n)==n)load(i,data);}}
  }
  void status(JsonDocument &d){
    d["developerPublicKey"]=developer;d["reviewing"]=reviewing();
    for(int i=0;i<2;++i){auto v=d["slots"].add<JsonObject>();auto &s=slots[i];v["slot"]=i;v["installed"]=s.installed;v["running"]=s.runtime.running();v["name"]=s.manifest.name;v["error"]=s.error.length()?s.error:String(s.runtime.error.c_str());v["capabilities"]=s.manifest.caps;}
  }
  bool message(JsonVariantConst d,uint32_t epoch,bool secure,bool idle,PadState &pad,JsonDocument &response){
    String type=d["type"]|"";if(!type.startsWith("ability_"))return false;
    response["type"]="ability_result";response["id"]=d["id"];bool ok=false;
    if(!secure || !storage){response["error"]="Setup required: paired encrypted link and ability storage";upload.cancel();return true;}
    if(type=="ability_status"){ok=true;status(response);}
    else if(type=="ability_developer" && idle && !reviewing()){
      std::string key=d["developerPublicKey"]|"";uint8_t bytes[32];
      if(xorr::unhex(key,bytes,32)){
        pendingDeveloper=key;reviewEpoch=epoch;reviewAt=millis();reviewShown=false;hold.release();
        pad.abilityReview=true;pad.abilityDeveloper=key.c_str();ok=true;
      }
    }else if(type=="ability_begin" && idle && !reviewing()){
      ok=upload.begin(d,developer,epoch,millis());
      if(ok){encodedManifest.clear();serializeJson(d["manifest"],encodedManifest);if(encodedManifest.size()>1024){upload.cancel();ok=false;}}
    }else if(type=="ability_chunk" && idle && !reviewing())ok=upload.chunk(d,epoch,millis());
    else if(type=="ability_end" && idle && !reviewing()){
      int slot=upload.slot;
      if(upload.complete(developer,epoch,millis())){
        std::string record;record+=char(encodedManifest.size()&255);record+=char(encodedManifest.size()>>8);record+=encodedManifest;
        record.append(reinterpret_cast<const char*>(upload.bytes.data()),upload.bytes.size());
        // Validate/run ABI compilation before committing anything durable.
        Runtime candidate;
        ok=candidate.open(upload.manifest,upload.bytes,developer,clock);candidate.close();
        if(ok){String key="slot"+String(slot);ok=nvs.putBytes(key.c_str(),record.data(),record.size())==record.size();if(ok)ok=load(slot,record);}
      }
      upload.cancel();
    }else if(type=="ability_remove" && idle && !reviewing() && d["slot"].is<int>()){
      int i=d["slot"];if(i>=0&&i<2){String key="slot"+String(i);ok=!nvs.isKey(key.c_str())||nvs.remove(key.c_str());if(ok){slots[i].runtime.close();slots[i].installed=false;slots[i].manifest=Manifest{};pad.abilityWidget="";}}
    }
    response["ok"]=ok;if(!ok&&!response["error"].is<const char*>())response["error"]="Ability refused: check developer trust, manifest, upload order and idle pad";
    return true;
  }
  void shown(bool visible){reviewShown=visible;if(!visible)hold.release();}
  void key(bool yes,bool pressed,PadState &pad){
    if(!yes&&pressed){cancelReview(pad);return;}
    if(yes){if(pressed&&reviewShown)hold.press(millis());else hold.release();}
  }
  void tick(uint32_t epoch,bool secure,bool safe,PadState &pad,int &chime){
    chime=-1;uint32_t now=millis();
    if(upload.slot>=0&&(!secure||!safe||!upload.live(epoch,now)))upload.cancel();
    if(reviewing()){
      bool valid=secure&&safe&&epoch==reviewEpoch&&uint32_t(now-reviewAt)<30000;
      if(!valid){cancelReview(pad);return;}
      if(!reviewShown)hold.release();
      pad.holdProgress=hold.progress(now);
      if(hold.ready(now,800)){
        // Changing a developer removes all previous abilities, including durable blobs.
        for(int i=0;i<2;++i){slots[i].runtime.close();slots[i].installed=false;String key="slot"+String(i);if(nvs.isKey(key.c_str())&&!nvs.remove(key.c_str())){cancelReview(pad);return;}}
        if(nvs.putString("developer",pendingDeveloper.c_str())==pendingDeveloper.size())developer=pendingDeveloper;
        pad.abilityWidget="";cancelReview(pad);
      }
      return;
    }
    if(!safe || !secure || int32_t(now-nextTick)<0)return;
    nextTick=now+1000;
    bool fresh=priceAt&&uint32_t(now-priceAt)<15000&&std::isfinite(pad.price)&&pad.price>0&&pad.price<9e12;
    int64_t price=fresh?int64_t(double(pad.price)*1000000):0;
    int selected=int((now/5000)%2);
    for(int i=0;i<2;++i){auto &s=slots[i];if(!s.runtime.running())continue;
      xorr::abilities::Effects e;if(!s.runtime.tick(now/1000,price,e)){s.error=s.runtime.error.c_str();if(i==selected)pad.abilityWidget="";continue;}
      if(e.macro==0)s.visible=false;else if(e.macro>=1)s.visible=true;
      if(e.chime>=0)chime=e.chime;
      if(i==selected || !slots[selected].runtime.running()){pad.abilityWidget=s.visible?String(e.widget.c_str()):"";pad.abilityName=s.manifest.name.c_str();}
    }
  }
};
