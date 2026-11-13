#pragma once
#include "logic/clear-sign.h"
#include "padstate.h"
#include "session-sign.h"
#include <deque>
#include <functional>
#include "logic/crew.h"
class ClearSigning {
  uint32_t connection=0;
  xorr::SignalState signal;
  xorr::Hold hold;
  SessionSigning signer;
  bool signing=false,cosigning=false,configuring=false;
  std::string policyRequest;
  xorr::session::Policy proposed;
  std::vector<bool> policySeen;
  std::vector<uint8_t> signingBytes;
  std::deque<std::string> responses;
  void queue(JsonDocument &d){std::string text;serializeJson(d,text);if(responses.size()<4)responses.push_back(text);}
  bool seen()const{return configuring?!policySeen.empty() && std::all_of(policySeen.begin(),policySeen.end(),[](bool b){return b;}):approval.allSeen();}
public:
  std::function<std::string(const uint8_t*,size_t)> deviceSigner;
  std::function<bool(const std::string&)> authorize;
  xorr::solana::Approval approval;
  xorr::solana::Upload upload;
  bool active=false;
  void reset(PadState &pad) {
    approval.reset();upload.reset();hold.release();active=false;signing=cosigning=configuring=false;signingBytes.clear();policySeen.clear();pad.clearSigning=false;pad.sessionPolicy=false;pad.clearRows.clear();
    pad.clearPage=0;pad.confirmDuration=800;
  }
  void sync(uint32_t epoch,bool secure,PadState &pad) {
    if(!secure || epoch!=connection){if(active){pad.pending=false;pad.signalId="";}reset(pad);responses.clear();connection=epoch;approval.configure(false,epoch);}
  }
  void page(int delta,PadState &pad){
    hold.release();pad.holdProgress=0;
    if(!active || pad.clearRows.empty())return;
    int next=std::max(0,std::min(int(pad.clearRows.size())-1,int(pad.clearPage)+delta));
    pad.clearPage=size_t(next);pad.clearReviewed=seen();
  }
  bool message(JsonVariantConst d,uint32_t epoch,bool secure,bool blocked,PadState &pad){
    sync(epoch,secure,pad);String type=d["type"] | "";
    if((type=="config" || type=="ready") && secure)approval.configure(d["allowBlindSigning"].is<bool>() && d["allowBlindSigning"].as<bool>(),epoch);
    if(type=="session_status" || type=="session_policy"){
      if(!secure || blocked)return true;
      JsonDocument response;
      if(type=="session_status"){signer.status(response);response["requestId"]=d["requestId"];queue(response);return true;}
      reset(pad);pad.pending=false;
      if(!xorr::session::parsePolicy(d["policy"],proposed)){
        response["type"]="session_state";response["ok"]=false;response["requestId"]=d["requestId"];response["error"]="invalid policy";queue(response);return true;
      }
      pad.sessionPolicy=true;policyRequest=d["requestId"] | "";configuring=active=true;pad.clearSigning=pad.pending=pad.blindSigning=true;
      pad.signalId="session-policy";pad.signalState="awaiting";pad.signalDeadline=millis()+60000;
      signal.offer("session-policy",millis(),60000,false);
      pad.clearRows={"STORE SIGNING POLICY", "caps in micro-USD / six-decimal dollar asset", "asset "+proposed.mint,
        "per trade "+std::to_string(proposed.trade),"rolling day "+std::to_string(proposed.day),
        "leverage 1x; Phoenix refused (absent from bytes)","auto max "+std::to_string(proposed.autoTrade),"auto market "+proposed.market};
      for(const auto &p:proposed.programs)pad.clearRows.push_back("allow program "+p);
      pad.clearRows.push_back("Hold 3.8s to store; caps include token input, exclude network fee");
      policySeen.assign(pad.clearRows.size(),false);pad.clearPage=0;pad.clearReviewed=false;
      pad.confirmDuration=3800;pad.holdRequired=true;pad.holdProgress=0;pad.ok=true;pad.autoAccept=false;pad.errorCode="";
      return true;
    }
    if(type=="clear_cancel" && secure){reset(pad);pad.pending=false;return true;}
    if(type=="signal")reset(pad);
    if(active && type=="signal_state")return true;
    if(!type.startsWith("clear_")){pad.blindAllowed=approval.allowed(epoch);return false;}
    if(!secure || blocked)return true;
    bool ok=false;
    if(type=="clear_begin"){
      if(pad.killed && !pad.flatten.review(d["signalId"] | ""))return true;
      reset(pad);pad.pending=false;pad.signalId="";signal.state=xorr::SignalState::Empty;
      ok=d["size"].is<uint32_t>() && upload.begin(d["size"],d["sha256"] | "",epoch,millis());
    }else if(type=="clear_chunk"){
      ok=d["offset"].is<uint32_t>() && upload.chunk(d["offset"],d["data"] | "",epoch,millis());
    }else if(type=="clear_end"){
      xorr::solana::Request request;ok=upload.finish(request,epoch,millis());
      if(ok && pad.killed && !pad.flatten.review(request.id))ok=false;
      if(ok && request.cosign){
        if(request.value.blind)ok=false;
        else request.value.rows.push_back("CREW APPROVAL / device signs message hash only");
      }
      if(ok)ok=approval.offer(std::move(request.value),epoch);
      if(ok){
        const auto &v=approval.get();signing=request.sign;cosigning=request.cosign;signingBytes=std::move(request.bytes);active=true;pad.clearSigning=true;pad.blindSigning=v.blind;
        pad.clearRows=v.rows;pad.clearPage=0;pad.clearReviewed=false;
        pad.confirmDuration=approval.holdMs();pad.holdRequired=true;pad.holdProgress=0;
        pad.fingerprint=v.message.fingerprint.c_str();pad.signalId=request.id.c_str();pad.signalState="awaiting";
        pad.signalDeadline=millis()+request.remainingMs;
        pad.pending=signal.offer(request.id,millis(),request.remainingMs,false);
        pad.ok=true;pad.reply="";pad.receiptUntil=0;pad.errorCode="";pad.keymapUntil=0;
        pad.autoAccept=false;
      }
    }
    if(!ok){reset(pad);pad.pending=false;signal.state=xorr::SignalState::Refused;pad.errorCode="CLEAR_REFUSED";pad.errorFix="Refresh transaction and lookup evidence";}
    pad.blindAllowed=approval.allowed(epoch);return true;
  }
  void shown(PadState &pad){if(active && pad.pending){if(configuring){if(pad.clearPage<policySeen.size())policySeen[pad.clearPage]=true;}else approval.visit(pad.clearPage);pad.clearReviewed=seen();}}
  bool answer(bool yes,uint32_t epoch,bool secure,PadState &pad,JsonDocument &out){
    if(!active || !secure || !pad.pending || !signal.live(millis()) ||
       (yes && !(configuring?seen() && hold.elapsed(millis())>=3800:approval.confirm(hold.elapsed(millis()),epoch))))return false;
    if(configuring){
      bool ok=yes && signer.configure(proposed);signer.status(out);out["requestId"]=policyRequest;out["ok"]=ok;
      if(!ok)out["error"]="policy refused or storage failed";
      pad.pending=false;reset(pad);return true;
    }
    if(yes && authorize && !authorize(signal.id)){hold.release();pad.holdProgress=0;return false;}
    if(cosigning){
      out["type"]="crew_approval";out["signalId"]=signal.id;out["messageHash"]=approval.get().message.hash;
      out["heldMs"]=hold.elapsed(millis());out["blind"]=false;out["ok"]=false;
      uint8_t digest[32];
      if(yes && deviceSigner && xorr::crew::consume(approval,hold.elapsed(millis()),epoch,digest)){
        auto signature=deviceSigner(digest,32);out["ok"]=signature.size()==128;out["signature"]=signature;
      }
      if(!out["ok"].as<bool>())out["error"]="crew approval refused on pad";
      pad.pending=false;reset(pad);return true;
    }
    if(signing){
      out["type"]="session_signature";out["ok"]=false;
      if(yes)signer.sign(approval,signingBytes,hold.elapsed(millis()),epoch,out);else out["error"]="refused on pad";
      out["signalId"]=signal.id;out["messageHash"]=approval.get().message.hash;
      xorr::solana::reviewTelemetry(approval.get(),out);
      out["automatic"]=false;pad.pending=false;reset(pad);return true;
    }
    out["type"]="clear_approval";out["signalId"]=signal.id;
    out["fingerprint"]=approval.get().message.fingerprint;out["messageHash"]=approval.get().message.hash;out["accepted"]=yes;
    out["blind"]=approval.get().blind;out["heldMs"]=hold.elapsed(millis());
    if(!yes)out["error"]="refused on pad";
    xorr::solana::reviewTelemetry(approval.get(),out);
    pad.pending=false;pad.signalState=yes?"accepted":"refused";reset(pad);return true;
  }
  void key(bool down,uint32_t epoch,bool visible){
    if(!down || !visible){hold.release();return;}
    if((configuring || approval.allowed(epoch)) && seen())hold.press(millis());
  }
  bool tick(uint32_t epoch,bool secure,bool visible,PadState &pad,JsonDocument &out){
    sync(epoch,secure,pad);
    if(secure && !responses.empty()){deserializeJson(out,responses.front());responses.pop_front();return true;}
    if(!active)return false;
    if(!signal.live(millis())){pad.pending=false;reset(pad);return false;}
    if(signing && secure && !pad.killed && approval.allowed(epoch)){
      auto e=signer.check(approval.get());
      if(!e.ok || e.automatic){
        if(e.ok && authorize && !authorize(signal.id)){hold.release();pad.holdProgress=0;return false;}
        signer.sign(approval,signingBytes,hold.elapsed(millis()),epoch,out);out["signalId"]=signal.id;
        out["messageHash"]=approval.get().message.hash;out["automatic"]=e.ok && e.automatic;
        xorr::solana::reviewTelemetry(approval.get(),out);
        pad.pending=false;reset(pad);return true;
      }
    }
    if(!visible || (!configuring && !approval.allowed(epoch))){hold.release();pad.holdProgress=0;return false;}
    pad.holdProgress=hold.progress(millis(),configuring?3800:approval.holdMs());
    return hold.elapsed(millis())>=(configuring?3800:approval.holdMs()) && answer(true,epoch,secure,pad,out);
  }
};
