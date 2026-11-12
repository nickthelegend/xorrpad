#pragma once
#include <ArduinoJson.h>
#include "predict-state.h"
namespace xorr {
inline bool predictNumber(JsonVariantConst v,double &out) {
  if(!v.is<double>())return false;
  out=v.as<double>();return std::isfinite(out);
}
inline bool parsePredict(JsonVariantConst d,Predict &out,uint32_t now) {
  if(!d["enabled"].is<bool>() || d["cluster"]!="devnet" || !d["markets"].is<JsonArrayConst>() || d["markets"].size()>6)return false;
  Predict next;next.enabled=d["enabled"];next.receivedAt=now;
  next.validForMs=d["validForMs"] | 30000u;if(next.validForMs>30000)return false;
  next.total=d["total"] | uint32_t(d["markets"].size());next.offset=d["offset"] | 0u;
  next.sizeUsd=d["sizeUsd"] | out.sizeUsd;
  if(!std::isfinite(next.sizeUsd) || next.sizeUsd<=0)return false;
  next.message=d["message"] | std::string();if(next.message.size()>120)return false;
  std::string selected=out.markets.empty()?"":out.markets[out.selected].market;
  for(auto row:d["markets"].as<JsonArrayConst>()) {
    PredictMarket m;
    if(!row["market"].is<const char*>() || !row["question"].is<const char*>() ||
       !predictNumber(row["probability"],m.probability) || m.probability<0 || m.probability>1 || !row["closesIn"].is<uint32_t>())return false;
    m.market=row["market"].as<std::string>();m.question=row["question"].as<std::string>();
    if(m.market.size()<32 || m.market.size()>44 || m.question.empty() || m.question.size()>180)return false;
    for(char c:m.market)if(std::string("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz").find(c)==std::string::npos)return false;
    m.closesIn=row["closesIn"];
    if(!row["change24h"].isNull()) {if(!predictNumber(row["change24h"],m.change24h))return false;m.hasChange=true;}
    if(m.market==selected)next.selected=next.markets.size();
    next.markets.push_back(m);
  }
  if(d["selected"].is<unsigned>() && d["selected"].as<unsigned>()<next.markets.size())next.selected=d["selected"].as<unsigned>();
  next.positionsVisible=next.enabled && out.positionsVisible;next.positions=out.positions;next.positionsMessage=out.positionsMessage;
  out=std::move(next);return true;
}
inline bool parseOutcomePositions(JsonVariantConst d,Predict &out) {
  if(d["cluster"]!="devnet" || !d["positions"].is<JsonArrayConst>() || d["positions"].size()>8)return false;
  std::vector<OutcomePosition> rows;
  for(auto r:d["positions"].as<JsonArrayConst>()) {
    OutcomePosition p;
    if(!r["name"].is<const char*>() || !predictNumber(r["yes"],p.yes) || !predictNumber(r["no"],p.no) || p.yes<0 || p.no<0)return false;
    p.question=r["name"].as<std::string>().substr(0,180);rows.push_back(p);
  }
  std::string message=d["message"] | std::string();if(message.size()>120)return false;
  out.positions=std::move(rows);out.positionsMessage=message;out.positionsVisible=true;return true;
}
} // namespace xorr
