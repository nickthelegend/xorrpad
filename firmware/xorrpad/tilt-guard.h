// MIT · Copyright (c) 2026 Nivesh Gajengi
#pragma once
#include <Preferences.h>
#include <time.h>
#include "logic/tilt-guard.h"
#include "padstate.h"
class TiltGuard {
 uint32_t reported=0,epoch=0;String signalId;bool reduction=false;
public:
 xorr::tilt::Guard state;
 uint64_t now()const{auto t=time(nullptr);return t>0?uint64_t(t):0;}
 // A blob in the existing 256 KiB profiles partition avoids NVS's 4 KiB string limit.
 bool save(){
  JsonDocument d;state.json(d.to<JsonObject>());std::string raw;serializeJson(d,raw);
  if(raw.empty() || raw.size()>65536)return state.healthy=false;
  Preferences p;if(!p.begin("xorrtilt",false,"profiles"))return state.healthy=false;
  bool ok=p.putBytes("state",raw.data(),raw.size())==raw.size();p.end();
  if(!ok)state.healthy=false;return ok;
 }
 void begin(){
  Preferences p;if(!p.begin("xorrtilt",false,"profiles")){state.healthy=false;return;}
  bool exists=p.isKey("state");size_t n=exists?p.getBytesLength("state"):0;
  std::string raw;
  if(exists){if(!n || n>65536)state.healthy=false;else{raw.resize(n);if(p.getBytes("state",raw.data(),n)!=n)state.healthy=false;}}
  p.end();
  if(exists && state.healthy){JsonDocument d;if(deserializeJson(d,raw) || !state.restore(d))state.healthy=false;}
  else if(!exists)save();
 }
 bool blocked(){state.advance(now());return state.blocked(now());}
 bool allows(const PadState &pad){return pad.sessionPolicy || !blocked() || (reduction && signalId==pad.signalId) || (state.healthy && xorr::tilt::Guard::seen(state.accepted,std::string(pad.signalId.c_str())));}
 bool accept(const std::string &id){bool reduce=reduction && signalId==id.c_str();if(xorr::tilt::Guard::seen(state.accepted,id))return state.healthy || reduce;if(!state.accept(id,reduce,now()))return false;bool ok=save();return ok || reduce;}
 void message(JsonVariantConst d,bool secure,PadState &pad){
  if(!secure)return;
  if(d["type"]=="signal"){signalId=d["signalId"] | "";reduction=d["reduceOnly"]==true;}
  if((d["type"]=="config" || d["type"]=="ready") && !d["tiltGuard"].isNull()){
   xorr::tilt::Settings next;if(xorr::tilt::settings(d["tiltGuard"],next) && state.healthy){state.advance(now());state.config=next;if(state.clock(now()))state.evaluate(now());save();}
  }
  if(d["type"]=="receipt" && d["closed"]==true){
   // Signature, never a desk timestamp, deduplicates confirmed close receipts.
   bool changed=state.clock(now()) && d["realizedPnlUsd"].is<double>() && std::isfinite(d["realizedPnlUsd"].as<double>())?state.fill(d["signature"] | "",d["realizedPnlUsd"],true,now()):state.unknown(d["signature"] | "",now());
   if(changed)save();
  }
  update(pad);
 }
 void update(PadState &p){state.advance(now());p.tiltBlocked=state.blocked(now());p.tiltAllowed=p.sessionPolicy || (reduction && signalId==p.signalId) || (state.healthy && xorr::tilt::Guard::seen(state.accepted,std::string(p.signalId.c_str())));p.tiltReason=state.reason(now()).c_str();p.tiltRemaining=state.clock(now()) && state.until()>now()?state.until()-now():0;p.tiltDuration=std::max<uint32_t>(p.tiltRemaining,p.tiltDuration);if(!p.tiltBlocked)p.tiltDuration=0;}
 template<class Link> void tick(Link &link,PadState &p){update(p);if(!link.secureReady())return;if(epoch==link.connectionEpoch() && millis()-reported<1000)return;epoch=link.connectionEpoch();reported=millis();JsonDocument d;d["type"]="tilt_state";d["blocked"]=p.tiltBlocked;d["reason"]=p.tiltReason;d["remainingSeconds"]=p.tiltRemaining;d["durationSeconds"]=p.tiltDuration;d["tradesHour"]=state.trades.size()+state.untimed;d["realizedPnlUsd"]=state.realized;d["losingCloses"]=state.streak;d["unknownCloses"]=state.missing.size();d["clockReady"]=state.clock(now());d["healthy"]=state.healthy;xorr::tilt::json(d["settings"].to<JsonObject>(),state.config);link.send(d);}
};
