#pragma once
#include <Preferences.h>
#include <ArduinoJson.h>
#include "keymap.h"
#include "padstate.h"
#include "logic/accessibility.h"

class Accessibility {
  uint8_t level=220;
  bool night=false,contrast=false,speak=false,left=false;
  uint16_t suppressed=0;
public:
  xorr::DisplayIdle idle;
  bool speakAmounts()const{return speak;}
  bool highContrast()const{return contrast;}
  int brightness(uint32_t now)const{return idle.brightness(now,level,night);}
  bool patch(JsonVariantConst d,bool persist=true) {
    const char *flags[]={"night","highContrast","speakAmounts","leftHanded"};
    for(auto flag:flags)if(!d[flag].isNull() && !d[flag].is<bool>())return false;
    if(!d["brightness"].isNull() && (!d["brightness"].is<int>() || d["brightness"].as<int>()<1 || d["brightness"].as<int>()>255))return false;
    uint8_t nextLevel=d["brightness"] | int(level);
    bool nextNight=d["night"] | night,nextContrast=d["highContrast"] | contrast,
      nextSpeak=d["speakAmounts"] | speak,nextLeft=d["leftHanded"] | left;
    bool changed=nextLevel!=level || nextNight!=night || nextContrast!=contrast || nextSpeak!=speak || nextLeft!=left;
    if(persist && changed) {
      JsonDocument doc;doc["brightness"]=nextLevel;doc["night"]=nextNight;doc["highContrast"]=nextContrast;
      doc["speakAmounts"]=nextSpeak;doc["leftHanded"]=nextLeft;
      String json;serializeJson(doc,json);Preferences prefs;
      if(!prefs.begin("xorrui",false))return false;
      bool ok=prefs.putString("settings",json)==json.length();prefs.end();if(!ok)return false;
    }
    level=nextLevel;night=nextNight;contrast=nextContrast;speak=nextSpeak;left=nextLeft;return true;
  }
  void begin() {
    Preferences prefs;
    if(prefs.begin("xorrui",true)) {
      String json=prefs.getString("settings","");prefs.end();JsonDocument doc;
      if(json.length()<=256 && !deserializeJson(doc,json))patch(doc.as<JsonVariantConst>(),false);
    }
    idle.wake(millis());
  }
  const KeyBind &key(uint8_t r,uint8_t c)const {
    if(!left)return keyAt(r,c);
    bool movable[4];
    for(uint8_t col=0;col<4;++col) {
      auto role=keyAt(r,col).role;
      movable[col]=role==ROLE_ACTION || role==ROLE_AGENT || role==ROLE_MARKET;
    }
    return keyAt(r,xorr::leftColumn(c,movable));
  }
  void labels(PadState &pad)const {
    int i=0;
    for(uint8_t r=0;r<4;++r)for(uint8_t c=0;c<4;++c)
      if(keyAt(r,c).role!=ROLE_NONE)pad.keyLabels[i++]=key(r,c).label;
  }
  // A wake/dismiss gesture cannot also accept a trade that was hidden.
  bool keyEvent(uint8_t r,uint8_t c,bool pressed,PadState &pad) {
    uint16_t bit=uint16_t(1)<<(r*4+c);
    if(!pressed){bool consumed=suppressed&bit;suppressed&=~bit;return consumed;}
    bool hidden=idle.blank(millis()) || pad.errorCode.length() || (!pad.pending && pad.reply.length());
    idle.wake(millis());pad.errorCode="";pad.reply="";
    auto role=keyAt(r,c).role;
    if(hidden && role!=ROLE_KILL && role!=ROLE_REFUSE){suppressed|=bit;return true;}
    return false;
  }
};
