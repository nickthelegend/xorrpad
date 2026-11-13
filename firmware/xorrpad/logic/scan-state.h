// MIT · Copyright (c) 2026 Nivesh Gajengi
#pragma once
#include <cstdint>
#include <string>
#include <vector>
namespace xorr {
struct ScanMarket {std::string symbol,error;};
struct Scan {
 bool visible=false;uint32_t receivedAt=0;unsigned checkedCount=0,unavailableCount=0;
 std::string summary,top;std::vector<ScanMarket> markets;
 bool dismiss(uint32_t now){bool consumed=fresh(now);visible=false;return consumed;}
 bool fresh(uint32_t now)const{return visible && uint32_t(now-receivedAt)<8000;}
};
}
