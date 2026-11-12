#pragma once
#include <cmath>
#include <string>
#include <vector>
namespace xorr {
inline const char *predictKey(bool enabled,bool pending,bool yes) {
  return enabled && !pending ? (yes?"predict:yes":"predict:no") : (yes?"yes":"no");
}
struct PredictMarket {
  std::string market, question;
  double probability=0, change24h=0;
  bool hasChange=false;
  uint32_t closesIn=0;
};
struct OutcomePosition { std::string question; double yes=0,no=0; };
struct Predict {
  bool enabled=false, positionsVisible=false;
  std::string message, positionsMessage;
  std::vector<PredictMarket> markets;
  std::vector<OutcomePosition> positions;
  size_t selected=0;
  uint32_t receivedAt=0,total=0,offset=0,validForMs=30000;
  double sizeUsd=1;
  void scroll(int delta) {
    if(markets.empty())return;
    int n=int(markets.size());selected=size_t((int(selected)+delta%n+n)%n);
  }
  bool fresh(uint32_t now)const{return enabled && !markets.empty() && uint32_t(now-receivedAt)<validForMs;}
};
} // namespace xorr
