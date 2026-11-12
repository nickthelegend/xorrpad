#pragma once
#include <ArduinoJson.h>
#include <cmath>
#include "presentation.h"

namespace xorr {
inline bool parsePortfolio(JsonVariantConst d, Portfolio &out) {
  Portfolio next; next.visible=true;
  next.message=d["message"] | std::string();
  if(!next.message.empty()) {
    if(next.message!="Create your agent wallet in XOR Desktop")return false;
    out=next;return true;
  }
  next.cluster=d["cluster"] | std::string();
  if(next.cluster!="devnet" && next.cluster!="mainnet-beta")return false;
  if(!d["rows"].is<JsonArrayConst>() || d["rows"].size()>5)return false;
  if(!d["totalUsd"].isNull()) {
    if(!d["totalUsd"].is<double>())return false;
    next.totalUsd=d["totalUsd"].as<double>();
    if(!std::isfinite(next.totalUsd) || next.totalUsd<0)return false;
    next.hasTotal=true;
  }
  for(auto r:d["rows"].as<JsonArrayConst>()) {
    if(!r["symbol"].is<const char*>() || !r["amount"].is<double>())return false;
    PortfolioRow row;row.symbol=r["symbol"].as<std::string>().substr(0,44);row.amount=r["amount"];
    if(row.symbol.empty() || !std::isfinite(row.amount) || row.amount<0)return false;
    if(!r["usd"].isNull()) {
      if(!r["usd"].is<double>())return false;
      row.usd=r["usd"];if(!std::isfinite(row.usd) || row.usd<0)return false;row.hasUsd=true;
    }
    next.rows.push_back(row);
  }
  out=next;return true;
}
}
