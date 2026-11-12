// MIT · Copyright (c) 2026 Nivesh Gajengi
#pragma once
#include <string>
#include <vector>
#include <cstdint>
#include <cmath>
namespace xorr {
struct PerpPosition {
 std::string market,venue,side;double entry=NAN,mark=NAN,leverage=NAN,liq=NAN,distancePct=NAN,nextFunding=NAN;
};
struct Perps {std::vector<PerpPosition> positions;std::string message;uint32_t at=0;};
struct LiqGuard {
 bool active=false;std::string id,market,venue;double mark=0,liq=0,distancePct=0;uint32_t at=0;
 bool fresh(uint32_t now)const{return active && uint32_t(now-at)<30000;}
};
inline const char *liqKey(bool yes){return yes?"liq:yes":"liq:no";}
}
