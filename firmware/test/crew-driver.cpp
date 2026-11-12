// Public inputs only; native clear review/hold gate. Simulator's device identity
// remains in its own process memory and signs only the consumed 32-byte hash.
#include "../xorrpad/logic/crew.h"
#include <iostream>
using namespace xorr;
int main(){solana::Approval approval;solana::Upload upload;uint32_t epoch=1,now=0,deadline=0;std::string line;
 approval.configure(false,epoch);
 while(std::getline(std::cin,line)){
  JsonDocument in,out;out["ok"]=false;if(deserializeJson(in,line))return 1;
  std::string command=in["command"] | "";
  if(command=="begin"){approval.reset();out["ok"]=upload.begin(in["size"] | 0,in["sha256"] | "",epoch,now);}
  else if(command=="chunk")out["ok"]=upload.chunk(in["offset"] | 0,in["data"] | "",epoch,now);
  else if(command=="end"){
   solana::Request request;bool ok=upload.finish(request,epoch,now) && request.cosign && !request.sign && !request.value.blind;
   if(ok){deadline=now+request.remainingMs;ok=approval.offer(request.value,epoch);}out["ok"]=ok;out["rows"]=approval.get().rows.size();out["messageHash"]=approval.get().message.hash;
  }else if(command=="approve"){
   if(in["reviewed"] | false)for(size_t i=0;i<approval.get().rows.size();++i)approval.visit(i);
   uint8_t digest[32];bool ok=now<deadline && crew::consume(approval,in["heldMs"] | 0,epoch,digest);
   out["ok"]=ok;if(ok)out["messageHash"]=hex(digest,32);
  }else if(command=="disconnect"){++epoch;approval.configure(false,epoch);upload.reset();out["ok"]=true;}
  else if(command=="advance"){now+=in["ms"].as<uint32_t>();out["ok"]=true;}
  else if(command=="cancel"){approval.reset();upload.reset();out["ok"]=true;}
  std::string result;serializeJson(out,result);std::cout<<result<<std::endl;
 }
}
