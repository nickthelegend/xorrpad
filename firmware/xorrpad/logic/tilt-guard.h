// MIT · Copyright (c) 2026 Nivesh Gajengi
#pragma once
#include <ArduinoJson.h>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <deque>
#include <string>
namespace xorr::tilt {
struct Settings {
 double dailyLossUsd=0; unsigned maxTradesHour=0,losingCloses=0,cooldownMinutes=15;
 bool enabled()const{return dailyLossUsd>0 || maxTradesHour || losingCloses;}
};
inline bool settings(JsonVariantConst d,Settings &s) {
 if(!d.is<JsonObjectConst>() || d.size()!=4 || !d["dailyLossUsd"].is<double>() ||
    !std::isfinite(d["dailyLossUsd"].as<double>()) || d["dailyLossUsd"].as<double>()<0 || d["dailyLossUsd"].as<double>()>1000000000 ||
    !d["maxTradesHour"].is<unsigned>() || d["maxTradesHour"].as<unsigned>()>1000 ||
    !d["losingCloses"].is<unsigned>() || d["losingCloses"].as<unsigned>()>1000 ||
    !d["cooldownMinutes"].is<unsigned>() || d["cooldownMinutes"].as<unsigned>()<1 || d["cooldownMinutes"].as<unsigned>()>10080)return false;
 s={d["dailyLossUsd"],d["maxTradesHour"],d["losingCloses"],d["cooldownMinutes"]};return true;
}
inline void json(JsonObject d,const Settings &s){d["dailyLossUsd"]=s.dailyLossUsd;d["maxTradesHour"]=s.maxTradesHour;d["losingCloses"]=s.losingCloses;d["cooldownMinutes"]=s.cooldownMinutes;}
struct Guard {
 Settings config;bool healthy=true;uint64_t last=0,day=0,lossUntil=0,hourUntil=0,streakUntil=0;
 double realized=0;unsigned streak=0,untimed=0;std::deque<uint64_t> trades;
 std::deque<std::string> accepted,fills,missing;
 static bool utc(uint64_t now){return now>=1700000000 && now<4102444800ULL;}
 bool clock(uint64_t now)const{return utc(now) && now>=last;}
 uint64_t until()const{return std::max({lossUntil,hourUntil,streakUntil});}
 void advance(uint64_t now) {
  if(!clock(now))return;
  last=now;
  while(untimed){trades.push_back(now);--untimed;if(trades.size()>1000)trades.pop_front();}
  if(day!=now/86400){if(day)missing.clear();day=now/86400;realized=0;lossUntil=0;}
  while(!trades.empty() && trades.front()+3600<=now)trades.pop_front();
  if(hourUntil<=now)hourUntil=0;
  if(streakUntil<=now)streakUntil=0;
  evaluate(now);
 }
 void evaluate(uint64_t now) {
  if(config.dailyLossUsd>0 && realized<=-config.dailyLossUsd)lossUntil=(now/86400+1)*86400;
  if(config.maxTradesHour && trades.size()>=config.maxTradesHour)
   hourUntil=std::max(hourUntil,trades[trades.size()-config.maxTradesHour]+3600);
  if(config.losingCloses && streak>=config.losingCloses){streakUntil=std::max(streakUntil,now+config.cooldownMinutes*60);streak=0;}
 }
 bool blocked(uint64_t now)const{return !healthy || ((!missing.empty() && (config.dailyLossUsd>0 || config.losingCloses))) || ((config.enabled() || until()) && !clock(now)) || until()>now;}
 std::string reason(uint64_t now)const {
  if(!healthy)return "Setup required: tilt storage";
  if(!missing.empty() && (config.dailyLossUsd>0 || config.losingCloses))return "Setup required: close PnL";
  if((config.enabled() || until()) && !clock(now))return "Setup required: UTC time";
  if(lossUntil>now)return "Daily loss limit";
  if(streakUntil>now)return "Losing closes";
  if(hourUntil>now)return "Trades per hour";
  return "Ready";
 }
 static bool seen(const std::deque<std::string> &q,const std::string &id){return std::find(q.begin(),q.end(),id)!=q.end();}
 static void remember(std::deque<std::string> &q,const std::string &id){q.push_back(id);if(q.size()>128)q.pop_front();}
 // Called locally BEFORE emitting an approval. Repeated review/sign steps count once.
 bool accept(const std::string &id,bool reduceOnly,uint64_t now) {
  advance(now);
  if(id.empty() || id.size()>128)return false;
  if(seen(accepted,id))return healthy || reduceOnly;
  if(!reduceOnly && blocked(now))return false;
  remember(accepted,id);
  // An unsynced clock is allowed only with every limit disabled; never invent UTC.
  if(clock(now)){trades.push_back(now);if(trades.size()>1000)trades.pop_front();evaluate(now);}
  else untimed=std::min(1000u,untimed+1);
  return true;
 }
 bool unknown(const std::string &id,uint64_t now) {
  if(id.empty() || id.size()>128 || seen(fills,id))return false;
  advance(now);if(seen(missing,id))return false;
  if(missing.size()==128){healthy=false;return false;}missing.push_back(id);streak=0;return true;
 }
 bool fill(const std::string &id,double pnl,bool closed,uint64_t now) {
  if(id.empty() || id.size()>128 || !std::isfinite(pnl) || !closed || !clock(now) || seen(fills,id))return false;
  advance(now);missing.erase(std::remove(missing.begin(),missing.end(),id),missing.end());remember(fills,id);realized+=pnl;
  if(!std::isfinite(realized)){healthy=false;return false;}
  streak=pnl<0?streak+1:0;evaluate(now);return true;
 }
 void json(JsonObject d)const {
  d["version"]=1;tilt::json(d["settings"].to<JsonObject>(),config);
  d["last"]=last;d["day"]=day;d["lossUntil"]=lossUntil;d["hourUntil"]=hourUntil;d["streakUntil"]=streakUntil;
  d["realized"]=realized;d["streak"]=streak;d["untimed"]=untimed;
  auto a=d["trades"].to<JsonArray>();for(auto n:trades)a.add(n);
  auto b=d["accepted"].to<JsonArray>();for(auto &s:accepted)b.add(s);
  auto m=d["missing"].to<JsonArray>();for(auto &s:missing)m.add(s);
  auto c=d["fills"].to<JsonArray>();for(auto &s:fills)c.add(s);
 }
 bool restore(JsonVariantConst d) {
  Guard g;
  bool ok=d["version"]==1 && settings(d["settings"],g.config) && d["realized"].is<double>() && std::isfinite(d["realized"].as<double>()) && d["streak"].is<unsigned>() && d["untimed"].is<unsigned>() && d["untimed"].as<unsigned>()<=1000;
  for(auto k:{"last","day","lossUntil","hourUntil","streakUntil"})ok=ok && d[k].is<uint64_t>();
  if(ok){g.last=d["last"];g.day=d["day"];g.lossUntil=d["lossUntil"];g.hourUntil=d["hourUntil"];g.streakUntil=d["streakUntil"];g.realized=d["realized"];g.streak=d["streak"];g.untimed=d["untimed"];
   ok=(!g.last || utc(g.last)) && g.day<=g.last/86400 && g.until()<4103050000ULL;
  }
  for(auto k:{"trades","accepted","fills","missing"})ok=ok && d[k].is<JsonArrayConst>() && d[k].size()<=size_t(std::string(k)=="trades"?1000:128);
  if(ok){for(auto n:d["trades"].as<JsonArrayConst>()){if(!n.is<uint64_t>() || !utc(n.as<uint64_t>()) || n.as<uint64_t>()>g.last || (!g.trades.empty() && n.as<uint64_t>()<g.trades.back())){ok=false;break;}g.trades.push_back(n);}
   for(auto k:{"accepted","fills","missing"})for(auto n:d[k].as<JsonArrayConst>()){auto id=n.as<std::string>();if(!n.is<const char*>() || id.empty() || id.size()>128){ok=false;break;}remember(std::string(k)=="accepted"?g.accepted:std::string(k)=="fills"?g.fills:g.missing,id);}
  }
  if(!ok){healthy=false;return false;}*this=std::move(g);return true;
 }
};
}
