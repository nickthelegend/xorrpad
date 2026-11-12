#pragma once
#include <ArduinoJson.h>
#include "presentation.h"

namespace xorr {
inline bool parseFund(JsonVariantConst d, Fund &out) {
  if(!d["address"].is<const char*>() || !d["uri"].is<const char*>() || !d["cluster"].is<const char*>())return false;
  Fund next;next.address=d["address"].as<std::string>();next.uri=d["uri"].as<std::string>();next.cluster=d["cluster"].as<std::string>();
  if(next.address.size()<32 || next.address.size()>44 || next.address.find_first_not_of("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz")!=std::string::npos)return false;
  if(next.cluster!="devnet" && next.cluster!="mainnet-beta")return false;
  if(next.uri!="solana:"+next.address+"?label=xorrpad%20agent")return false;
  next.visible=true;out=next;return true;
}

// Short press requests balances on release; a hold requests funding once at 1s.
// Unsigned subtraction also handles millis() wrapping.
struct PortfolioKey {
  enum Action { None, Portfolio, Fund };
  bool down=false,fired=false,skipShort=false;uint32_t started=0;
  void press(uint32_t now,bool dismissing=false) {down=true;fired=false;started=now;skipShort=dismissing;}
  Action tick(uint32_t now) {
    if(!down || fired || uint32_t(now-started)<1000)return None;
    fired=true;return Fund;
  }
  Action release(uint32_t now) {
    if(!down)return None;
    auto action=tick(now);down=false;
    return action!=None?action:(!fired && !skipShort?Portfolio:None);
  }
  void cancel() {down=false;}
};
}
