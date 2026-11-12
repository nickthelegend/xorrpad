#pragma once
#include "logic/clear-sign.h"
#include "padstate.h"
class ClearSigning {
  uint32_t connection=0;
  xorr::SignalState signal;
  xorr::Hold hold;
public:
  xorr::solana::Approval approval;
  xorr::solana::Upload upload;
  bool active=false;
  void reset(PadState &pad) {
    approval.reset();upload.reset();hold.release();active=false;pad.clearSigning=false;pad.clearRows.clear();
    pad.clearPage=0;pad.confirmDuration=800;
  }
  void sync(uint32_t epoch,bool secure,PadState &pad) {
    if(!secure || epoch!=connection){if(active){pad.pending=false;pad.signalId="";}reset(pad);connection=epoch;approval.configure(false,epoch);}
  }
  void page(int delta,PadState &pad){
    hold.release();pad.holdProgress=0;
    if(!active || pad.clearRows.empty())return;
    int next=std::max(0,std::min(int(pad.clearRows.size())-1,int(pad.clearPage)+delta));
    pad.clearPage=size_t(next);pad.clearReviewed=approval.allSeen();
  }
  bool message(JsonVariantConst d,uint32_t epoch,bool secure,bool blocked,PadState &pad){
    sync(epoch,secure,pad);String type=d["type"] | "";
    if((type=="config" || type=="ready") && secure)approval.configure(d["allowBlindSigning"].is<bool>() && d["allowBlindSigning"].as<bool>(),epoch);
    if(type=="signal")reset(pad);
    if(active && type=="signal_state")return true;
    if(!type.startsWith("clear_")){pad.blindAllowed=approval.allowed(epoch);return false;}
    if(!secure || blocked)return true;
    bool ok=false;
    if(type=="clear_begin"){
      reset(pad);pad.pending=false;pad.signalId="";signal.state=xorr::SignalState::Empty;
      ok=d["size"].is<uint32_t>() && upload.begin(d["size"],d["sha256"] | "",epoch,millis());
    }else if(type=="clear_chunk"){
      ok=d["offset"].is<uint32_t>() && upload.chunk(d["offset"],d["data"] | "",epoch,millis());
    }else if(type=="clear_end"){
      xorr::solana::Request request;ok=upload.finish(request,epoch,millis());
      if(ok)ok=approval.offer(std::move(request.value),epoch);
      if(ok){
        const auto &v=approval.get();active=true;pad.clearSigning=true;pad.blindSigning=v.blind;
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
  void shown(PadState &pad){if(active && pad.pending){approval.visit(pad.clearPage);pad.clearReviewed=approval.allSeen();}}
  bool answer(bool yes,uint32_t epoch,bool secure,PadState &pad,JsonDocument &out){
    if(!active || !secure || !pad.pending || !signal.live(millis()) ||
       (yes && !approval.confirm(hold.elapsed(millis()),epoch)))return false;
    out["type"]="clear_approval";out["signalId"]=signal.id;
    out["fingerprint"]=approval.get().message.fingerprint;out["messageHash"]=approval.get().message.hash;out["accepted"]=yes;
    out["blind"]=approval.get().blind;out["heldMs"]=hold.elapsed(millis());
    pad.pending=false;pad.signalState=yes?"accepted":"refused";reset(pad);return true;
  }
  void key(bool down,uint32_t epoch,bool visible){
    if(!down || !visible){hold.release();return;}
    if(approval.allowed(epoch) && approval.allSeen())hold.press(millis());
  }
  bool tick(uint32_t epoch,bool secure,bool visible,PadState &pad,JsonDocument &out){
    sync(epoch,secure,pad);
    if(!active)return false;
    if(!signal.live(millis())){pad.pending=false;reset(pad);return false;}
    if(!visible || !approval.allowed(epoch)){hold.release();pad.holdProgress=0;return false;}
    pad.holdProgress=hold.progress(millis(),approval.holdMs());
    return hold.elapsed(millis())>=approval.holdMs() && answer(true,epoch,secure,pad,out);
  }
};
