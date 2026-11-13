// MIT · Copyright (c) 2026 Nivesh Gajengi
#pragma once
#include <Preferences.h>
#include <time.h>
#include "logic/journal.h"
#include "padstate.h"
class TradeJournal {
 uint32_t saved=0,syncRevision=0,syncEpoch=0;int syncIndex=-1;bool sent=false;
public:
 bool save(PadState &p){
  JsonDocument d;xorr::journalJson(d.to<JsonObject>(),p.journal);std::string raw;serializeJson(d,raw);
  Preferences prefs;if(raw.size()>32768 || !prefs.begin("xorrjournal",false,"profiles")){p.journal.healthy=false;return false;}
  bool ok=prefs.putBytes("state",raw.data(),raw.size())==raw.size();prefs.end();saved=p.journal.revision;if(!ok)p.journal.healthy=false;return ok;
 }
 void begin(PadState &p){
  Preferences prefs;if(!prefs.begin("xorrjournal",false,"profiles")){p.journal.healthy=false;return;}
  bool exists=prefs.isKey("state");size_t n=exists?prefs.getBytesLength("state"):0;std::string raw;
  if(exists){if(!n || n>32768)p.journal.healthy=false;else{raw.resize(n);if(prefs.getBytes("state",raw.data(),n)!=n)p.journal.healthy=false;}}prefs.end();
  if(exists && p.journal.healthy){JsonDocument d;if(deserializeJson(d,raw) || !xorr::restoreJournal(d,p.journal))p.journal.healthy=false;}
  else if(!exists)save(p);saved=p.journal.revision;
 }
 void message(JsonVariantConst d,bool secure,PadState &p){if(!secure)return;auto t=time(nullptr);if(xorr::journalMessage(d,p.journal,t>0?uint64_t(t):0))save(p);}
 void response(JsonVariantConst d,PadState &p){
  std::string id=d["signalId"] | "",type=d["type"] | "";if(!p.journal.find(id))return;
  std::string value;
  if(type=="clear_approval")value=d["accepted"]==true?"accepted":"refused";
  else if(type=="session_signature" || type=="crew_approval")value=d["ok"]==true?"signed":"failed";
  if(!value.empty() && p.journal.result(id,value,d["error"] | ""))save(p);
 }
 void result(PadState &p,const std::string &value,const std::string &reason=""){if(p.journal.result(p.signalId.c_str(),value,reason))save(p);}
 template<class Link> void tick(Link &link,PadState &p){
  if(p.journal.revision!=saved)save(p);
  if(!link.secureReady())return;
  if(syncEpoch!=link.connectionEpoch() || syncRevision!=p.journal.revision){syncEpoch=link.connectionEpoch();syncRevision=p.journal.revision;syncIndex=-1;sent=false;}
  if(sent)return;JsonDocument d;d["revision"]=syncRevision;
  if(syncIndex<0){d["type"]="journal_begin";d["count"]=p.journal.entries.size();d["healthy"]=p.journal.healthy;syncIndex=0;}
  else if(size_t(syncIndex)<p.journal.entries.size()){d["type"]="journal_entry";d["index"]=syncIndex;xorr::journalJson(d["entry"].to<JsonObject>(),p.journal.entries[syncIndex++]);}
  else{d["type"]="journal_end";sent=true;}
  link.send(d);
 }
};
