// MIT · Copyright (c) 2026 Nivesh Gajengi
#pragma once
#include <ArduinoJson.h>
#include "perps-state.h"
namespace xorr {
inline bool perpNumber(JsonVariantConst v,double &out,bool optional=true) {
 if(v.isNull() && optional){out=NAN;return true;}
 if(!v.is<double>() || !std::isfinite(v.as<double>()) || v.as<double>()<0)return false;
 out=v.as<double>();return true;
}
inline bool parsePerps(JsonVariantConst d,Perps &out,uint32_t now) {
 if(!d["positions"].is<JsonArrayConst>() || d["positions"].size()>6)return false;
 Perps next;next.at=now;next.message=d["message"] | "";
 if(next.message.size()>240)return false;
 for(auto row:d["positions"].as<JsonArrayConst>()) {
  PerpPosition p;
  if(!row["market"].is<const char*>() || !row["venue"].is<const char*>() || !row["side"].is<const char*>())return false;
  p.market=row["market"].as<std::string>();p.venue=row["venue"].as<std::string>();p.side=row["side"].as<std::string>();
  if(p.market.empty() || p.market.size()>24 || (p.venue!="phoenix" && p.venue!="jupperps") || (p.side!="long" && p.side!="short"))return false;
  if(!perpNumber(row["entry"],p.entry) || !perpNumber(row["mark"],p.mark) || !perpNumber(row["leverage"],p.leverage) ||
   !perpNumber(row["liq"],p.liq) || !perpNumber(row["distancePct"],p.distancePct) || !perpNumber(row["nextFunding"],p.nextFunding))return false;
  next.positions.push_back(p);
 }
 out=std::move(next);return true;
}
inline bool parseLiqGuard(JsonVariantConst d,LiqGuard &out,uint32_t now) {
 if(!d["active"].is<bool>())return false;
 if(!d["active"].as<bool>()){out=LiqGuard();return true;}
 LiqGuard g;g.active=true;g.at=now;
 if(!d["id"].is<const char*>() || !d["market"].is<const char*>() ||
  d["proposal"]["reduceOnly"]!=true || d["proposal"]["reducePct"]!=50 ||
  !perpNumber(d["mark"],g.mark,false) || !perpNumber(d["liq"],g.liq,false) ||
  !perpNumber(d["distancePct"],g.distancePct,false) || g.mark<=0 || g.liq<=0)return false;
 g.id=d["id"].as<std::string>();g.market=d["market"].as<std::string>();g.venue=d["proposal"]["venue"] | "";
 if(g.id.empty() || g.id.size()>96 || g.market.empty() || g.market.size()>24 || (g.venue!="phoenix" && g.venue!="jupperps"))return false;
 out=std::move(g);return true;
}
}
