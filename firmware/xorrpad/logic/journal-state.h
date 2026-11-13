// MIT · Copyright (c) 2026 Nivesh Gajengi
#pragma once
#include <cstdint>
#include <string>
#include <vector>
#include <algorithm>
namespace xorr {
struct JournalEntry {
 std::string id,action,market,size,venue,result,signature,reason;uint64_t time=0;
 bool operator==(const JournalEntry &r)const{return id==r.id && time==r.time && action==r.action && market==r.market && size==r.size && venue==r.venue && result==r.result && signature==r.signature && reason==r.reason;}
};
struct Journal {
 std::vector<JournalEntry> entries;bool healthy=true,visible=false;size_t selected=0;uint32_t revision=0;
 static bool valid(const JournalEntry &r){return !r.id.empty() && r.id.size()<=128 && r.action.size()<=32 && r.market.size()<=96 && r.size.size()<=48 && r.venue.size()<=32 && r.signature.size()<=96 && r.reason.size()<=192 &&
  (r.result!="filled" || !r.signature.empty()) && (r.time==0 || (r.time>=1700000000 && r.time<=4102444800ULL)) &&
  (r.result=="awaiting" || r.result=="accepted" || r.result=="signed" || r.result=="filled" || r.result=="refused" || r.result=="expired" || r.result=="failed" || r.result=="blocked");}
 const JournalEntry *find(const std::string &id)const{for(const auto &r:entries)if(r.id==id)return &r;return nullptr;}
 bool put(JournalEntry r){
  if(!healthy || !valid(r))return false;
  for(auto &old:entries)if(old.id==r.id){
   if(old==r || (old.result=="filled" && r.result!="filled"))return false;
   old=r;++revision;return true;
  }
  if(entries.size()==32)entries.erase(entries.begin());entries.push_back(r);selected=std::min(selected,entries.size()-1);++revision;return true;
 }
 bool result(const std::string &id,const std::string &value,const std::string &reason="",const std::string &signature=""){
  const auto *old=find(id);if(!old)return false;auto row=*old;row.result=value;row.reason=reason.substr(0,192);row.signature=signature.substr(0,96);return put(row);
 }
 void scroll(int delta){if(entries.empty()){selected=0;return;}int n=entries.size();selected=(int(selected)+delta%n+n)%n;}
 const JournalEntry *current()const{return entries.empty()?nullptr:&entries[entries.size()-1-std::min(selected,entries.size()-1)];}
};
}
