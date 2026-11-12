// Public signed bundles only. Exact embedded interpreter and transfer validator.
#include "../xorrpad/logic/ability-install.h"
#include "../xorrpad/src/wasm3/xorr_heap.h"
#include <chrono>
#include <iostream>
uint32_t abilityClock(){using namespace std::chrono;return uint32_t(duration_cast<milliseconds>(steady_clock::now().time_since_epoch()).count());}
int main(){
  std::string line,trusted;
  xorr::abilities::Runtime slots[2];xorr::abilities::Manifest installed[2];
  xorr::abilities::Upload upload;
  while(std::getline(std::cin,line)){
    JsonDocument d,out;
    if(line.size()>80000 || deserializeJson(d,line)){std::cout<<"{\"ok\":false,\"error\":\"invalid bundle\"}"<<std::endl;continue;}
    std::string command=d["command"]|"run";bool ok=false;
    if(command=="trust"){
      uint8_t pk[32];std::string next=d["developerPublicKey"]|"";
      if(xorr::unhex(next,pk,32)){trusted=next;for(int i=0;i<2;++i){slots[i].close();installed[i]={};}upload.cancel();ok=true;}
    }else if(command=="status"){
      ok=true;out["developerPublicKey"]=trusted;
      for(int i=0;i<2;++i){auto s=out["slots"].add<JsonObject>();s["slot"]=i;s["running"]=slots[i].running();s["installed"]=!installed[i].id.empty();s["name"]=installed[i].name;s["error"]=slots[i].error;s["capabilities"]=installed[i].caps;}
    }else if(command=="begin")ok=upload.begin(d.as<JsonVariantConst>(),trusted,d["epoch"]|1,abilityClock());
    else if(command=="chunk")ok=upload.chunk(d.as<JsonVariantConst>(),d["epoch"]|1,abilityClock());
    else if(command=="end"){
      int i=upload.slot;
      if(upload.complete(trusted,d["epoch"]|1,abilityClock())){xorr::abilities::Runtime candidate;ok=candidate.open(upload.manifest,upload.bytes,trusted,abilityClock);if(!ok)out["error"]=candidate.error;candidate.close();if(ok)ok=slots[i].open(upload.manifest,upload.bytes,trusted,abilityClock);if(ok)installed[i]=upload.manifest;else if(!out["error"].is<const char*>())out["error"]=slots[i].error;}
      upload.cancel();
    }else if(command=="remove"&&d["slot"].is<int>()){
      int i=d["slot"];if(i>=0&&i<2){slots[i].close();installed[i]={};ok=true;}
    }else if(command=="tick"&&d["slot"].is<int>()){
      int i=d["slot"];xorr::abilities::Effects e;
      if(i>=0&&i<2){ok=slots[i].tick(d["seconds"]|0,d["price"].as<int64_t>(),e);out["error"]=slots[i].error;}
      out["widget"]=e.widget;out["macro"]=e.macro;out["chime"]=e.chime;
    }else if(command=="run"){
      xorr::abilities::Runtime runtime;xorr::abilities::Manifest m;
      std::string hex=d["wasm"]|"";std::vector<uint8_t> wasm(hex.size()/2);
      ok=m.parse(d["manifest"])&&xorr::unhex(hex,wasm.data(),wasm.size())&&runtime.open(m,wasm,d["trustedDeveloper"]|"",abilityClock);
      xorr::abilities::Effects effects;
      if(ok){for(auto seconds:d["ticks"].as<JsonArrayConst>()){ok=runtime.tick(seconds.as<uint32_t>(),d["price"].as<int64_t>(),effects);if(!ok)break;}}
      out["error"]=runtime.error;out["widget"]=effects.widget;out["macro"]=effects.macro;out["chime"]=effects.chime;
      runtime.close();out["heapUsed"]=xorr_wasm_heap_used();
    }
    out["ok"]=ok;if(!ok&&!out["error"].is<const char*>())out["error"]="ability install refused";
    serializeJson(out,std::cout);std::cout<<std::endl;
  }
}
