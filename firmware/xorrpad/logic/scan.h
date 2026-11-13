// MIT · Copyright (c) 2026 Nivesh Gajengi
#pragma once
#include <ArduinoJson.h>
#include "scan-state.h"
namespace xorr {
inline bool parseScan(JsonVariantConst d,Scan &out,uint32_t now) {
 auto bounded=[](JsonVariantConst v,size_t n){return v.is<const char*>() && std::string(v.as<const char*>()).size()<=n;};
 if(!bounded(d["summary"],512) || !d["markets"].is<JsonArrayConst>() || d["markets"].size()>16)return false;
 Scan next;next.summary=d["summary"].as<const char*>();if(next.summary.empty())return false;
 for(auto row:d["markets"].as<JsonArrayConst>()){
  if(!bounded(row["symbol"],24) || !bounded(row["error"],96))return false;
  if(std::string(row["error"].as<const char*>()).empty())++next.checkedCount;else ++next.unavailableCount;
  next.markets.push_back({row["symbol"].as<const char*>(),row["error"].as<const char*>()});
 }
 for(auto key:{"checkedCount","unavailableCount"})if(!d[key].isNull() && (!d[key].is<unsigned>() || d[key].as<unsigned>()>10000))return false;
 if(!d["checkedCount"].isNull())next.checkedCount=d["checkedCount"];
 if(!d["unavailableCount"].isNull())next.unavailableCount=d["unavailableCount"];
 auto top=d["top"];
 if(!top.isNull()){
  if(!bounded(top["symbol"],24) || !bounded(top["side"],16) || !bounded(top["strategy"],64) || !bounded(top["rationale"],256))return false;
  next.top=std::string(top["side"].as<const char*>())+" "+top["symbol"].as<const char*>()+" / "+top["strategy"].as<const char*>();
 }
 next.visible=true;next.receivedAt=now;out=next;return true;
}
}
