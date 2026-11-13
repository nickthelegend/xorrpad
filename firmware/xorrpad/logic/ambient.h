// MIT · Copyright (c) 2026 Nivesh Gajengi
#pragma once
#include <ArduinoJson.h>
#include "ambient-state.h"
namespace xorr {
inline bool parseAmbient(JsonVariantConst d,Ambient &out,uint32_t now){
 if(!d["epoch"].is<uint64_t>() || d["epoch"].as<uint64_t>()<1700000000 ||
    !d["closes"].is<JsonArrayConst>() || d["closes"].size()>24 ||
    !d["hours"].is<const char*>() || !d["crew"].is<const char*>() ||
    d["hours"].as<std::string>().size()>100 || d["crew"].as<std::string>().size()>100)return false;
 Ambient a;a.visible=out.visible;a.epoch=d["epoch"];a.receivedAt=now;
 for(auto k:{"price","pnl","nextFunding"})if(!d[k].isNull() && (!d[k].is<double>() || !std::isfinite(d[k].as<double>())))return false;
 a.price=d["price"].isNull()?NAN:d["price"].as<double>();a.pnl=d["pnl"].isNull()?NAN:d["pnl"].as<double>();a.nextFunding=d["nextFunding"].isNull()?NAN:d["nextFunding"].as<double>();
 if((std::isfinite(a.price) && a.price<=0) || (std::isfinite(a.nextFunding) && a.nextFunding<1700000000))return false;
 for(auto v:d["closes"].as<JsonArrayConst>()){if(!v.is<double>() || !std::isfinite(v.as<double>()) || v.as<double>()<=0)return false;a.closes.push_back(v);}
 a.hours=d["hours"].as<std::string>();a.crew=d["crew"].as<std::string>();out=a;return true;
}
}
