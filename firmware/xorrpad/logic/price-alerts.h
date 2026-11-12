#pragma once
#include <ArduinoJson.h>
#include <cmath>
#include <string>
#include <vector>
#include <cstdint>
namespace xorr::prices {
constexpr uint32_t POLL_MS=30000;
constexpr size_t MAX_ALERTS=8;
struct Alert {std::string id,mint;double usd=0;bool above=true,fired=false;uint64_t block=0;};
inline bool identifier(const std::string &s,size_t min,size_t max,bool mint=false){
  if(s.size()<min || s.size()>max)return false;
  for(char c:s)if(mint?std::string("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz").find(c)==std::string::npos:
    !((c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='-'||c=='_'))return false;
  return true;
}
inline bool parse(JsonVariantConst rows,std::vector<Alert> &out,bool restore=false){
  if(!rows.is<JsonArrayConst>() || rows.size()>MAX_ALERTS)return false;
  std::vector<Alert> next;
  for(auto row:rows.as<JsonArrayConst>()){
    Alert a;
    if(!row["id"].is<const char*>() || !row["mint"].is<const char*>() || !row["usd"].is<double>() || !row["above"].is<bool>())return false;
    a.id=row["id"].as<std::string>();a.mint=row["mint"].as<std::string>();a.usd=row["usd"];a.above=row["above"];
    if(!identifier(a.id,1,32) || !identifier(a.mint,32,44,true) || !std::isfinite(a.usd) || a.usd<=0 || a.usd>1e12)return false;
    for(const auto &old:next)if(old.id==a.id)return false;
    if(restore){if(!row["fired"].is<bool>())return false;a.fired=row["fired"];}
    next.push_back(a);
  }
  out=std::move(next);return true;
}
inline void json(JsonArray rows,const std::vector<Alert> &alerts){
  for(const auto &a:alerts){auto r=rows.add<JsonObject>();r["id"]=a.id;r["mint"]=a.mint;r["usd"]=a.usd;r["above"]=a.above;r["fired"]=a.fired;}
}
struct Quote {double usd=0;uint64_t block=0;};
inline bool quote(JsonVariantConst response,const std::string &mint,Quote &out){
  auto row=response[mint];
  if(!row["usdPrice"].is<double>() || !row["blockId"].is<uint64_t>())return false;
  out={row["usdPrice"].as<double>(),row["blockId"].as<uint64_t>()};
  return std::isfinite(out.usd) && out.usd>0 && out.usd<=1e12 && out.block>0;
}
inline bool hit(const Alert &a,const Quote &q){
  return !a.fired && q.block>a.block && std::isfinite(q.usd) && q.usd>0 && (a.above?q.usd>=a.usd:q.usd<=a.usd);
}
class Poll {
  uint32_t last=0;bool attempted=false;
public:
  bool due(uint32_t now,bool desk,bool wifi,bool idle){return !desk && wifi && idle && (!attempted || uint32_t(now-last)>=POLL_MS);}
  void attempt(uint32_t now){last=now;attempted=true;}
};
}
