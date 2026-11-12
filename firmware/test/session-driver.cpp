// Native pad simulator: production parser, approval, policy, counter and Ed25519.
// Only public accounting is written to disk. Ephemeral signing material stays in RAM.
#include "../xorrpad/logic/session-sign.h"
#include <Ed25519.h>
#include <iostream>
#include <fstream>
#include <cstdlib>
using namespace xorr;
int main(int argc,char **argv){
 if(argc!=2)return 1;
 uint8_t seed[32],pub[32];arc4random_buf(seed,32);Ed25519::derivePublicKey(pub,seed);
 solana::Key owner;std::copy(pub,pub+32,owner.begin());session::Policy policy;session::Counter counter;
 solana::Approval approval;solana::Request request;std::string text;
 auto load=[&](){std::ifstream file(argv[1]);if(!file.good())return true;std::string disk((std::istreambuf_iterator<char>(file)),{});JsonDocument d;return !deserializeJson(d,disk) && counter.restore(d["usage"]) && session::parsePolicy(d["policy"],policy);};
 auto save=[&](const session::Counter &next){JsonDocument d;d.to<JsonObject>();next.json(d["usage"].to<JsonArray>());session::policyJson(d["policy"].to<JsonObject>(),policy);std::string disk;serializeJson(d,disk);std::string tmp=std::string(argv[1])+".tmp";std::ofstream f(tmp);f<<disk;f.close();return bool(f) && std::rename(tmp.c_str(),argv[1])==0;};
 bool healthy=load();
 while(std::getline(std::cin,text)){
  JsonDocument in,out;out["ok"]=false;
  if(deserializeJson(in,text))return 3;
  std::string command=in["command"] | "";
  if(command=="status"){
   out["ok"]=healthy;out["publicKey"]=solana::address(owner);out["configured"]=healthy && policy.valid();
   if(healthy)out["spentToday"]=counter.spent();
   if(policy.valid())session::policyJson(out["policy"].to<JsonObject>(),policy);
  }
  else if(command=="policy"){
   session::Policy next;bool ok=healthy && in["heldMs"].as<unsigned>()>=3800 && session::parsePolicy(in["policy"],next);
   if(ok){policy=next;ok=save(counter);}out["ok"]=ok;
  }else if(command=="prepare"){
   std::string json;serializeJson(in["request"],json);bool ok=healthy && solana::parseRequest(json,request);
   approval.configure(in["allowBlind"] | false,1);if(ok)ok=approval.offer(request.value,1);
   out["ok"]=ok;out["rows"]=request.value.rows.size();
  }else if(command=="reboot"){counter={};healthy=load();approval.reset();out["ok"]=healthy;}
  else if(command=="sign"){
   if(in["reviewed"] | false)for(size_t i=0;i<approval.get().rows.size();i++)approval.visit(i);
   auto e=session::authorize(approval,policy,owner,in["heldMs"] | 0,1);out["error"]=e.error;
   if(healthy && e.ok && counter.reserve(e.amount,policy.day,0,save)){
    uint8_t signature[64];Ed25519::sign(signature,seed,pub,request.bytes.data(),request.bytes.size());
    out["ok"]=true;out["signature"]=hex(signature,64);out["publicKey"]=solana::address(owner);out["messageHash"]=request.value.message.hash;out["automatic"]=e.automatic;
   }approval.reset();
  }
  std::string result;serializeJson(out,result);std::cout<<result<<std::endl;
 }
 memset(seed,0,sizeof seed);
}
