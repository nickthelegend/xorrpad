// MIT · Copyright (c) 2026 Nivesh Gajengi
#pragma once
#include <ArduinoJson.h>
#include "flatten-state.h"
namespace xorr {
inline bool parseFlatten(JsonVariantConst d,Flatten &out,uint32_t now) {
 if(d["reduceOnly"]!=true || !d["id"].is<const char*>() || !d["state"].is<const char*>() || !d["rows"].is<JsonArrayConst>() || d["rows"].size()>32)return false;
 Flatten p;p.id=d["id"].as<std::string>();p.state=d["state"].as<std::string>();p.fingerprint=d["fingerprint"] | "";
 if(p.id.empty() || p.id.size()>64 || (p.state!="building" && p.state!="awaiting" && p.state!="setup" && p.state!="empty" && p.state!="executing" && p.state!="refused" && p.state!="complete" && p.state!="failed"))return false;
 if(p.state=="awaiting" && (p.fingerprint.size()!=64 || !d["remainingMs"].is<uint32_t>() || !d["remainingMs"].as<uint32_t>() || d["remainingMs"].as<uint32_t>()>60000))return false;
 for(const char *k:{"orders","perps","outcomes"})if(!d[k].is<unsigned>() || d[k].as<unsigned>()>32)return false;
 p.orders=d["orders"];p.perps=d["perps"];p.outcomes=d["outcomes"];
 if(p.orders+p.perps+p.outcomes!=d["rows"].size())return false;
 for(auto row:d["rows"].as<JsonArrayConst>()){if(!row.is<const char*>())return false;auto s=row.as<std::string>();if(s.empty() || s.size()>96)return false;p.rows.push_back(s);}
 if(p.state=="awaiting" && p.rows.empty())return false;
 p.message=d["message"] | "";if(p.message.size()>500)return false;
 if(p.state=="executing" && d["legReduceOnly"]==true){p.legId=d["legId"] | "";if(p.legId.size()>96)return false;}
 p.ttl=d["remainingMs"] | 0u;p.at=now;out=std::move(p);return true;
}
}
