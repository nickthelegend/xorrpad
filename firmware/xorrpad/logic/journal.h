// MIT · Copyright (c) 2026 Nivesh Gajengi
#pragma once
#include <ArduinoJson.h>
#include "journal-state.h"
namespace xorr {
inline void journalJson(JsonObject o,const JournalEntry &r){
 o["id"]=r.id;o["time"]=r.time;o["action"]=r.action;o["market"]=r.market;o["size"]=r.size;o["venue"]=r.venue;o["result"]=r.result;o["signature"]=r.signature;o["reason"]=r.reason;
}
inline bool journalEntry(JsonVariantConst d,JournalEntry &r){
 if(!d["time"].is<uint64_t>())return false;
 for(auto k:{"id","action","market","size","venue","result","signature","reason"})if(!d[k].is<const char*>())return false;
 JournalEntry n;n.time=d["time"];n.id=d["id"].as<std::string>();n.action=d["action"].as<std::string>();n.market=d["market"].as<std::string>();n.size=d["size"].as<std::string>();n.venue=d["venue"].as<std::string>();n.result=d["result"].as<std::string>();n.signature=d["signature"].as<std::string>();n.reason=d["reason"].as<std::string>();
 if(!Journal::valid(n))return false;r=n;return true;
}
inline void journalJson(JsonObject o,const Journal &j){o["version"]=1;o["revision"]=j.revision;auto a=o["entries"].to<JsonArray>();for(const auto &r:j.entries)journalJson(a.add<JsonObject>(),r);}
inline bool restoreJournal(JsonVariantConst d,Journal &out){
 if(d["version"]!=1 || !d["revision"].is<uint32_t>() || !d["entries"].is<JsonArrayConst>() || d["entries"].size()>32)return false;
 Journal j;for(auto v:d["entries"].as<JsonArrayConst>()){JournalEntry row;if(!journalEntry(v,row) || j.find(row.id))return false;j.entries.push_back(row);}j.revision=d["revision"];out=j;return true;
}
// Called only for authenticated link records. Unknown outcomes never imply a fill.
inline bool journalMessage(JsonVariantConst d,Journal &j,uint64_t now){
 std::string type=d["type"] | "",id=d["signalId"] | "";
 if(type=="signal" || type=="journal_decision"){
  JournalEntry r;r.id=id;r.time=now>=1700000000 && now<=4102444800ULL?now:0;
  r.action=std::string(d["side"] | "").substr(0,32);r.market=std::string(d["market"] | "").substr(0,96);r.venue=std::string(d["venue"] | "").substr(0,32);
  r.size=d["trusted"]["size"].is<const char*>()?d["trusted"]["size"].as<std::string>():d["sizeUsd"].as<std::string>();r.size=r.size.substr(0,48);
  r.result="awaiting";
  if(const auto *old=j.find(id)){r.time=old->time;r.result=old->result;r.reason=old->reason;r.signature=old->signature;}
  bool changed=j.put(r);
  if(type=="journal_decision"){std::string state=d["state"] | "";if(state=="executed")state="filled";
   // Filled requires a confirmed receipt signature, never merely a queue transition.
   if(state=="filled" && !d["signature"].is<const char*>())return changed;
   if(state=="filled" && d["signature"].as<std::string>().empty())return changed;
   changed=j.result(id,state,d["reason"] | "",d["signature"] | "") || changed;
  }return changed;
 }
 if(type=="signal_state"){
  std::string state=d["state"] | "";if(state=="executed")return false;
  return j.result(id,state,d["reason"] | "");
 }
 if(type=="receipt" && !id.empty() && d["signature"].is<const char*>() && !d["signature"].as<std::string>().empty())return j.result(id,"filled","",d["signature"] | "");
 return false;
}
}
