#pragma once
#include "crypto.h"
#include <ArduinoJson.h>
namespace xorr {
// A signal arrival resets the hold. A proposal key already down cannot approve it.
class DecisionConfirm {
  Signal trusted;Hold hold;uint32_t epoch=0,duration=0;bool valid=false;
public:
  void reset(){valid=false;hold.release();}
  bool offer(JsonVariantConst d,uint32_t connection) {
    reset();auto t=d["trusted"];
    trusted={t["fee"] | "",t["market"] | "",t["price"] | "",t["side"] | "",t["signalId"] | "",t["size"] | "",t["venue"] | ""};
    if(!trusted.valid() || trusted.id!=(d["signalId"] | "") || fingerprint(trusted)!=(d["fingerprint"] | ""))return false;
    double threshold=d["holdThreshold"] | 100.;duration=strtod(trusted.size.c_str(),nullptr)>threshold?800:0;epoch=connection;valid=true;return true;
  }
  void key(bool down,bool visible,uint32_t now){if(down && visible && valid)hold.press(now);else hold.release();}
  bool due(bool visible,uint32_t connection,uint32_t now) {
    if(!visible || connection!=epoch){hold.release();return false;}
    return valid && hold.ready(now,duration);
  }
  uint32_t heldMs(uint32_t now)const{return hold.elapsed(now);}
  float progress(uint32_t now)const{return duration?hold.progress(now,duration):0;}
  bool needsHold()const{return duration>0;}
  const Signal &signal()const{return trusted;}
};
}
