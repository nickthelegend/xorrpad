#pragma once
#include "logic/session-sign.h"
#include <Preferences.h>
#include <esp_random.h>
#include <esp_flash_encrypt.h>

class SessionSigning {
  Preferences nvs;
  uint8_t seed[32]{},pub[32]{};
  bool started=false,healthy=false;
  uint32_t checkpoint=0;
  xorr::session::Counter counter;
public:
  xorr::session::Policy policy;
  bool begin(){
    if(started)return healthy;
    started=true;
#if !defined(CONFIG_NVS_ENCRYPTION) || !CONFIG_NVS_ENCRYPTION
    // Flash encryption alone does not protect NVS. Do not open/create a key.
    if(esp_flash_encryption_enabled())return false;
#endif
    checkpoint=millis();if(!nvs.begin("xorrsession",false))return false;
    if(!nvs.isKey("seed")){
      // A counter/policy without its key is corruption, not permission to reset.
      if(nvs.isKey("usage") || nvs.isKey("policy"))return false;
      esp_fill_random(seed,32);
      if(nvs.putBytes("seed",seed,32)!=32)return false;
    }else if(nvs.getBytesLength("seed")!=32 || nvs.getBytes("seed",seed,32)!=32)return false;
    Ed25519::derivePublicKey(pub,seed);
    JsonDocument d;
    if(nvs.isKey("policy") && !nvs.isKey("usage"))return false;
    if(nvs.isKey("usage") && (deserializeJson(d,nvs.getString("usage")) || !counter.restore(d.as<JsonVariantConst>())))return false;
    if(nvs.isKey("policy") && (deserializeJson(d,nvs.getString("policy")) || !xorr::session::parsePolicy(d.as<JsonVariantConst>(),policy)))return false;
    healthy=true;return true;
  }
  std::string publicKey()const{return xorr::base58(pub,32);}
  bool configure(const xorr::session::Policy &p){
    if(!begin() || !p.valid())return false;
    if(!nvs.isKey("usage") && nvs.putString("usage","[]")!=2){healthy=false;return false;}
    JsonDocument d;xorr::session::policyJson(d.to<JsonObject>(),p);if(d.overflowed()){healthy=false;return false;}String text;serializeJson(d,text);
    if(nvs.putString("policy",text)!=text.length()){healthy=false;return false;}
    policy=p;return true;
  }
  void status(JsonDocument &d){
    d["type"]="session_state";d["ok"]=begin();d["publicKey"]=healthy?publicKey():"";
    d["configured"]=healthy && policy.valid();
    if(policy.valid())xorr::session::policyJson(d["policy"].to<JsonObject>(),policy);
  }
  xorr::session::Exposure check(const xorr::solana::Review &v){
    if(!begin())return {false,false,0,"NVS unavailable"};
    xorr::solana::Key owner;std::copy(pub,pub+32,owner.begin());
    return xorr::session::exposure(v,policy,owner);
  }
  bool sign(const xorr::solana::Approval &approval,const std::vector<uint8_t> &bytes,uint32_t held,uint32_t epoch,JsonDocument &out){
    const auto &v=approval.get();auto e=check(v);
    if(e.ok){xorr::solana::Key owner;std::copy(pub,pub+32,owner.begin());e=xorr::session::authorize(approval,policy,owner,held,epoch);}out["type"]="session_signature";out["ok"]=false;
    if(!e.ok){out["error"]=e.error;return false;}
    auto hash=xorr::sha(bytes.data(),bytes.size());
    if(xorr::hex(hash.data(),32)!=v.message.hash){out["error"]="message changed";return false;}
    auto now=millis();
    bool reserved=counter.reserve(e.amount,policy.day,uint32_t(now-checkpoint),[&](const xorr::session::Counter &next){
      JsonDocument d;next.json(d.to<JsonArray>());if(d.overflowed()){healthy=false;return false;}String text;serializeJson(d,text);
      if(nvs.putString("usage",text)!=text.length()){healthy=false;return false;}return true;
    });
    if(!reserved){out["error"]="daily cap or durable storage refused";return false;}
    checkpoint=now;uint8_t sig[64];Ed25519::sign(sig,seed,pub,bytes.data(),bytes.size());
    out["ok"]=true;out["signature"]=xorr::hex(sig,64);out["publicKey"]=publicKey();
    out["messageHash"]=v.message.hash;out["chargedMicroUsd"]=e.amount;return true;
  }
};
