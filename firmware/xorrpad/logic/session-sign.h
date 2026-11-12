#pragma once
#include "clear-sign.h"
#include <functional>
#include <limits>

namespace xorr::session {
constexpr uint64_t dayMs=86400000;
struct Policy {
  uint64_t trade=0,day=0,autoTrade=0; // micro-USD, one raw unit of the approved 6-decimal dollar asset
  uint32_t maxLeverage=1;
  std::string mint,market;
  std::vector<std::string> programs;
  bool valid()const {
    solana::Key key;
    if(mint!="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" && mint!="3WQ8hCqTNwjrh8WzE2XyoZoUrd1miPcwWfMkmFPUMEWZ")return false;
    if(!trade || day<trade || autoTrade>trade || maxLeverage!=1 || !solana::keyFromString(mint,key) || programs.empty() || programs.size()>16)return false;
    if(autoTrade && !solana::keyFromString(market,key))return false;
    for(size_t i=0;i<programs.size();i++){
      if(!solana::keyFromString(programs[i],key))return false;
      for(size_t j=0;j<i;j++)if(programs[i]==programs[j])return false;
    }
    return true;
  }
};
inline bool parsePolicy(JsonVariantConst d,Policy &p){
  p={};if(!d["trade"].is<uint64_t>() || !d["day"].is<uint64_t>() || !d["autoTrade"].is<uint64_t>() ||
    !d["maxLeverage"].is<uint32_t>() || !d["programs"].is<JsonArrayConst>())return false;
  p.trade=d["trade"];p.day=d["day"];p.autoTrade=d["autoTrade"];p.maxLeverage=d["maxLeverage"];
  p.mint=d["mint"] | "";p.market=d["market"] | "";
  for(auto v:d["programs"].as<JsonArrayConst>()){if(!v.is<const char*>())return false;p.programs.push_back(v.as<std::string>());}
  return p.valid();
}
inline void policyJson(JsonObject d,const Policy &p){
  d["trade"]=p.trade;d["day"]=p.day;d["autoTrade"]=p.autoTrade;d["maxLeverage"]=p.maxLeverage;d["mint"]=p.mint;d["market"]=p.market;
  auto a=d["programs"].to<JsonArray>();for(const auto &program:p.programs)a.add(program);
}
struct Exposure {bool ok=false,automatic=false;uint64_t amount=0;std::string error;};
inline Exposure exposure(const solana::Review &v,const Policy &p,const solana::Key &owner){
  Exposure e;auto fail=[&](const char *s){e.error=s;return e;};
  if(!p.valid() || !v.valid() || v.message.required!=1 || v.message.keys[0]!=owner)return fail("policy or signer");
  if(v.blind || v.decoded.size()!=v.message.instructions.size())return fail("unmeasurable blind exposure");
  bool trade=false,automatic=p.autoTrade>0;
  for(size_t i=0;i<v.decoded.size();i++){
    const auto &d=v.decoded[i];const auto &ix=v.message.instructions[i];
    auto program=solana::address(v.message.keys[ix.program]);
    if(std::find(p.programs.begin(),p.programs.end(),program)==p.programs.end())return fail("program allowlist");
    if(!d.known)return fail("unknown exposure");
    if(d.name=="Phoenix place order")return fail("Phoenix leverage absent from instruction");
    // No hidden rent payments, arbitrary SOL debits, approvals or unpriced asset sales.
    if(d.name=="ComputeBudget"){
      solana::Reader r{ix.data.data(),ix.data.size()};auto tag=r.le(1);
      if(tag==3 && r.le(8)!=0)return fail("unpriced priority fee");
      continue;
    }
    bool transfer=d.name=="SPL Token transferChecked" || d.name=="Token-2022 transferChecked";
    bool swap=d.name=="pm-AMM swap";
    if(!transfer && !swap)return fail("unpriced instruction");
    if(d.inputMint!=p.mint || d.decimals!=6 || !d.amount)return fail("unpriced asset");
    if(d.amount>UINT64_MAX-e.amount)return fail("amount overflow");
    e.amount+=d.amount;trade=true;
    automatic &= (swap?d.market:d.destination)==p.market;
  }
  if(!trade || e.amount>p.trade)return fail("per-trade cap");
  e.ok=true;e.automatic=automatic && e.amount<=p.autoTrade;return e;
}
inline Exposure authorize(const solana::Approval &approval,const Policy &p,const solana::Key &owner,uint32_t held,uint32_t epoch){
  auto e=exposure(approval.get(),p,owner);
  if(!e.ok)return e;
  if(!approval.allowed(epoch) || (!e.automatic && !approval.confirm(held,epoch))){e.ok=false;e.error="hold or pad auto policy required";}
  return e;
}
struct Debit {uint64_t age=0,amount=0;};
// Conservative rolling 24 hours of powered time. Reboot/offline time never refunds
// budget. Snapshot is atomically persisted BEFORE signing; failed sends stay charged.
class Counter {
public:
  std::vector<Debit> debits;
  uint64_t spent(uint64_t elapsed=0)const{
    uint64_t total=0;
    for(const auto &d:debits)if(d.age+std::min(elapsed,dayMs)<dayMs)total+=d.amount;
    return total;
  }
  bool restore(JsonVariantConst a){
    debits.clear();if(!a.is<JsonArrayConst>() || a.size()>64)return false;
    uint64_t total=0;
    for(auto d:a.as<JsonArrayConst>()){
      if(!d["age"].is<uint64_t>() || !d["amount"].is<uint64_t>())return false;
      Debit v{d["age"],d["amount"]};if(v.age>=dayMs || !v.amount || v.amount>UINT64_MAX-total)return false;
      total+=v.amount;debits.push_back(v);
    }return true;
  }
  void json(JsonArray rows)const{for(auto d:debits){auto row=rows.add<JsonObject>();row["age"]=d.age;row["amount"]=d.amount;}}
  bool reserve(uint64_t amount,uint64_t cap,uint64_t elapsed,const std::function<bool(const Counter&)> &persist){
    Counter next;
    for(auto d:debits){d.age+=std::min(elapsed,dayMs);if(d.age<dayMs)next.debits.push_back(d);}
    uint64_t spent=0;for(auto d:next.debits){if(d.amount>cap || spent>cap-d.amount)return false;spent+=d.amount;}
    if(!amount || amount>cap || spent>cap-amount || next.debits.size()>=64)return false;
    next.debits.push_back({0,amount});if(!persist(next))return false;debits=std::move(next.debits);return true;
  }
};
} // namespace xorr::session
