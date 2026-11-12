#pragma once
#include "solana.h"
#include <ArduinoJson.h>
namespace xorr::solana {
struct Request { std::string id;uint32_t remainingMs=0;bool sign=false;std::vector<uint8_t> bytes;Review value; };
inline bool parseRequest(const std::string &json,Request &out) {
  out={};if(json.size()>131072)return false;JsonDocument d;
  if(deserializeJson(d,json) || !d["signalId"].is<const char*>() || !d["remainingMs"].is<uint32_t>() ||
    !d["message"].is<const char*>() || !d["tables"].is<JsonArray>())return false;
  out.id=d["signalId"].as<std::string>();out.remainingMs=d["remainingMs"];
  if(out.id.empty() || out.id.size()>96 || !out.remainingMs || out.remainingMs>86400000)return false;
  std::string hex=d["message"];if(hex.empty() || hex.size()>2464 || hex.size()%2)return false;
  std::vector<uint8_t> bytes(hex.size()/2);if(!unhex(hex,bytes.data(),bytes.size()))return false;
  std::vector<TableData> tables;if(d["tables"].size()>32)return false;
  for(auto row:d["tables"].as<JsonArray>()) {
    TableData t;
    if(!row["table"].is<const char*>() || !row["data"].is<const char*>() ||
       !row["owner"].is<const char*>() || !row["resolved"].is<JsonArray>() ||
       !keyFromString(row["table"].as<std::string>(),t.table))return false;
    t.owner=row["owner"].as<std::string>();hex=row["data"].as<std::string>();
    if(hex.size()>2*(56+256*32) || hex.size()%2 || row["resolved"].size()>256)return false;
    t.data.resize(hex.size()/2);if(!unhex(hex,t.data.data(),t.data.size()))return false;
    for(auto value:row["resolved"].as<JsonArray>()){Key k;if(!value.is<const char*>() || !keyFromString(value.as<std::string>(),k))return false;t.resolved.push_back(k);}
    tables.push_back(std::move(t));
  }
  std::vector<MintProof> proofs;
  if(!d["mintProofs"].isNull() && (!d["mintProofs"].is<JsonArray>() || d["mintProofs"].size()>32))return false;
  for(auto row:d["mintProofs"].as<JsonArray>()){
    MintProof p;
    if(!row["bump"].is<uint8_t>() || !keyFromString(row["account"] | "",p.account) ||
       !keyFromString(row["mint"] | "",p.mint) || !keyFromString(row["owner"] | "",p.owner) ||
       !keyFromString(row["program"] | "",p.program))return false;
    p.bump=row["bump"];if(!verifyMintProof(p))return false;proofs.push_back(p);
  }
  if(!d["sign"].isNull() && !d["sign"].is<bool>())return false;
  out.sign=d["sign"] | false;out.bytes=bytes;out.value=review(bytes,tables,proofs);return out.value.valid();
}
class Upload {
  std::string data,digest;size_t total=0;uint32_t epoch=0,since=0;
public:
  void reset(){data.clear();total=0;digest.clear();}
  bool live(uint32_t connection,uint32_t now)const{return total && connection==epoch && now-since<30000;}
  bool begin(size_t size,const std::string &hash,uint32_t connection,uint32_t now){
    reset();uint8_t tmp[32];if(!size || size>131072 || !unhex(hash,tmp,32))return false;
    total=size;digest=hash;epoch=connection;since=now;return true;
  }
  bool chunk(size_t offset,const std::string &hex,uint32_t connection,uint32_t now){
    if(!live(connection,now) || offset!=data.size() || hex.empty() || hex.size()>1536 || hex.size()%2 || hex.size()/2>total-data.size()){reset();return false;}
    std::vector<uint8_t> b(hex.size()/2);if(!unhex(hex,b.data(),b.size())){reset();return false;}
    data.append(reinterpret_cast<const char*>(b.data()),b.size());return true;
  }
  bool finish(Request &out,uint32_t connection,uint32_t now){
    if(!live(connection,now) || data.size()!=total){reset();return false;}
    auto h=sha(data.data(),data.size());bool ok=xorr::hex(h.data(),32)==digest && parseRequest(data,out);
    if(ok){auto elapsed=now-since;if(elapsed>=out.remainingMs)ok=false;else out.remainingMs-=elapsed;}
    reset();return ok;
  }
};
} // namespace xorr::solana
