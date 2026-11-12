#pragma once
#include "crypto.h"
#include <ArduinoJson.h>
#include "ability-budget.h"
#include "../src/wasm3/wasm3.h"
#include "../src/wasm3/m3_env.h"
#include <cstring>
namespace xorr { namespace abilities {
constexpr size_t MaxWasm=32768;
enum Capability : uint8_t { Widget=1, Macro=2, Price=4, Chime=8 };
inline uint8_t capability(const std::string &s) {
  return s=="tft.widget"?Widget:s=="keys.macro"?Macro:s=="alerts.price"?Price:s=="audio.chime"?Chime:0;
}
inline bool plain(const std::string &s,size_t min,size_t max,bool spaces=false) {
  if(s.size()<min || s.size()>max)return false;
  for(unsigned char c:s)if(!((c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='.'||c=='-'||c=='_'||(spaces&&c==' ')))return false;
  return true;
}
// Bound and canonicalize the section envelope before invoking the engine parser.
inline bool envelope(const std::vector<uint8_t> &wasm) {
  static const uint8_t header[]={0,97,115,109,1,0,0,0};
  if(wasm.size()<8 || wasm.size()>MaxWasm || memcmp(wasm.data(),header,8))return false;
  size_t at=8;uint16_t seen=0;uint8_t previous=0;
  auto leb=[&](uint32_t &value){value=0;for(int shift=0;shift<35;shift+=7){if(at>=wasm.size())return false;auto b=wasm[at++];if(shift==28 && b>15)return false;value|=uint32_t(b&127)<<shift;if(!(b&128))return true;}return false;};
  while(at<wasm.size()){
    uint8_t id=wasm[at++];uint32_t size=0;
    // ABI 1 has no tables, start, elements or proposal sections.
    // Data-count (12) precedes code (10) in the WASM section ordering.
    if(id>12 || id==4 || id==8 || id==9 || !leb(size) || size>wasm.size()-at)return false;
    uint8_t rank=id==12?10:id>=10?id+1:id;
    if(id){if(rank<=previous || (seen&(1u<<id)))return false;seen|=1u<<id;previous=rank;}
    at+=size;
  }
  return true;
}
struct Manifest {
  std::string id,name,version,sha256,developer,signature,caps;
  uint32_t size=0,pages=0,fuel=0;
  uint8_t permissions=0;
  std::string signedText() const {
    return "xorrpad-ability-v1\n"+id+"\n"+name+"\n"+version+"\n"+caps+"\n"+std::to_string(pages)+"\n"+std::to_string(fuel)+"\n"+sha256+"\n"+std::to_string(size)+"\n"+developer;
  }
  bool parse(JsonVariantConst d) {
    *this=Manifest{};
    if(!d.is<JsonObjectConst>() || d.size()!=11 || !d["abi"].is<int>() || d["abi"]!=1 || !d["size"].is<uint32_t>() || !d["memoryPages"].is<uint32_t>() || !d["fuel"].is<uint32_t>() || !d["capabilities"].is<JsonArrayConst>())return false;
    for(const char *field:{"id","name","version","sha256","developerPublicKey","signature"})if(!d[field].is<const char*>())return false;
    id=d["id"].as<std::string>();name=d["name"].as<std::string>();version=d["version"].as<std::string>();
    sha256=d["sha256"].as<std::string>();developer=d["developerPublicKey"].as<std::string>();signature=d["signature"].as<std::string>();
    size=d["size"];pages=d["memoryPages"];fuel=d["fuel"];
    std::string last;
    for(auto c:d["capabilities"].as<JsonArrayConst>()) {
      if(!c.is<const char*>())return false;
      auto s=c.as<std::string>();auto bit=capability(s);
      if(!bit || (!last.empty()&&s<=last))return false;
      if(!caps.empty())caps+=",";
      caps+=s;permissions|=bit;last=s;
    }
    uint8_t key[32],sig[64],hash[32];
    return plain(id,1,32)&&plain(name,1,32,true)&&plain(version,1,16)&&permissions && size>=8&&size<=MaxWasm&&pages>=1&&pages<=4&&fuel>=100&&fuel<=100000&&unhex(developer,key,32)&&unhex(signature,sig,64)&&unhex(sha256,hash,32);
  }
  bool verify(const std::vector<uint8_t>&wasm,const std::string &trustedDeveloper) const {
    uint8_t pk[32],sig[64];auto text=signedText();
    return developer==trustedDeveloper&&wasm.size()==size&&hex(sha(wasm.data(),wasm.size()).data(),32)==sha256&&unhex(developer,pk,32)&&unhex(signature,sig,64)&&Ed25519::verify(sig,pk,text.data(),text.size());
  }
};
// Each invocation stages output; no host pointer, trade frame, key or signer is exposed.
struct Effects {std::string widget;int macro=-1,chime=-1;};
class Runtime {
  IM3Environment env=nullptr;IM3Runtime rt=nullptr;IM3Function tickFn=nullptr;
  std::vector<uint8_t> bytes;Manifest manifest;
  Effects staged;
  uint32_t calls=0;
  int64_t price=0;
  static Runtime *self(IM3Runtime runtime){auto b=static_cast<Budget*>(m3_GetUserData(runtime));return static_cast<Context*>(b)->owner;}
  struct Context:Budget {Runtime *owner=nullptr;} context;
  static const void *widget(IM3Runtime runtime,IM3ImportContext,uint64_t *sp,void*) {
    auto s=self(runtime);uint32_t offset=uint32_t(sp[1]),length=uint32_t(sp[2]),n=0;
    auto memory=m3_GetMemory(runtime,&n,0);
    if(++s->calls>16 || !(s->manifest.permissions&Widget) || !memory || length>96 || offset>n || length>n-offset)return "ability widget denied";
    std::string text(reinterpret_cast<char*>(memory+offset),length);
    for(unsigned char c:text)if(c<32||c>126)return "ability widget text denied";
    s->staged.widget=text;sp[0]=0;return nullptr;
  }
  static const void *macro(IM3Runtime runtime,IM3ImportContext,uint64_t *sp,void*) {
    auto s=self(runtime);uint32_t value=uint32_t(sp[1]);
    if(++s->calls>16 || !(s->manifest.permissions&Macro) || value>2 || s->staged.macro!=-1)return "ability local macro denied";
    s->staged.macro=int(value);sp[0]=0;return nullptr;
  }
  static const void *getPrice(IM3Runtime runtime,IM3ImportContext,uint64_t *sp,void*) {
    auto s=self(runtime);if(++s->calls>16 || !(s->manifest.permissions&Price))return "ability price denied";
    sp[0]=uint64_t(s->price);return nullptr;
  }
  static const void *chime(IM3Runtime runtime,IM3ImportContext,uint64_t *sp,void*) {
    auto s=self(runtime);uint32_t value=uint32_t(sp[1]);
    if(++s->calls>16 || !(s->manifest.permissions&Chime) || value>1 || s->staged.chime!=-1)return "ability chime denied";
    s->staged.chime=int(value);sp[0]=0;return nullptr;
  }
  bool fail(const char *s){error=s?s:"ability refused";close();return false;}
public:
  std::string error;
  Runtime()=default;Runtime(const Runtime&)=delete;Runtime&operator=(const Runtime&)=delete;
  ~Runtime(){close();}
  void close(){tickFn=nullptr;if(rt)m3_FreeRuntime(rt);if(env)m3_FreeEnvironment(env);rt=nullptr;env=nullptr;bytes.clear();}
  bool running()const{return tickFn;}
  bool open(const Manifest &m,const std::vector<uint8_t>&wasm,const std::string &trusted,uint32_t(*clock)()) {
    close();error.clear();if(!envelope(wasm))return fail("ability module envelope refused");
    if(!m.verify(wasm,trusted))return fail("ability developer signature or digest refused");
    manifest=m;bytes=wasm;context.owner=this;context.clock=clock;context.fuel=m.fuel;context.deadline=clock()+20;
    env=m3_NewEnvironment();if(!env)return fail("ability environment memory");
    rt=m3_NewRuntime(env,16384,static_cast<Budget*>(&context));if(!rt)return fail("ability runtime memory");
    rt->memoryLimit=m.pages*65536;
    IM3Module module=nullptr;auto result=m3_ParseModule(env,&module,bytes.data(),uint32_t(bytes.size()));
    if(result)return fail(result);
    // No imported memories/globals/tables, table elements or module start code.
    if(module->memoryImported || module->startFunction>=0 || module->numElementSegments || module->table0Size || module->numFunctions>128 || module->numGlobals>64 || module->memoryInfo.initPages>m.pages){m3_FreeModule(module);return fail("ability module resources refused");}
    for(uint32_t i=0;i<module->numGlobals;++i)if(module->globals[i].imported){m3_FreeModule(module);return fail("ability imported global refused");}
    for(uint32_t i=0;i<module->numFuncImports;++i){
      auto &f=module->functions[i];std::string name=f.import.fieldUtf8?f.import.fieldUtf8:"";
      uint8_t cap=name=="widget"?Widget:name=="macro"?Macro:name=="price"?Price:name=="chime"?Chime:0;
      if(!f.import.moduleUtf8 || strcmp(f.import.moduleUtf8,"xorr") || !cap || !(m.permissions&cap)){m3_FreeModule(module);return fail("ability import capability refused");}
    }
    result=m3_LoadModule(rt,module);if(result){m3_FreeModule(module);return fail(result);}
    module->memoryInfo.maxPages=m.pages;rt->memory.maxPages=m.pages;
    struct Binding {const char *name,*signature;M3RawCall call;uint8_t cap;};
    for(auto b:{Binding{"widget","i(ii)",widget,Widget},{"macro","i(i)",macro,Macro},{"price","I()",getPrice,Price},{"chime","i(i)",chime,Chime}}){
      if(m.permissions&b.cap){result=m3_LinkRawFunction(module,"xorr",b.name,b.signature,b.call);if(result && result!=m3Err_functionLookupFailed)return fail(result);}
    }
    context.fuel=m.fuel;context.deadline=clock()+20;
    result=m3_FindFunction(&tickFn,rt,"tick");if(result)return fail(result);
    if(m3_GetArgCount(tickFn)!=1 || m3_GetArgType(tickFn,0)!=c_m3Type_i32 || m3_GetRetCount(tickFn)!=0)return fail("ability tick ABI refused");
    result=m3_CompileModule(module);if(result)return fail(result);
    return true;
  }
  bool tick(uint32_t seconds,int64_t priceMicro,Effects &effects) {
    effects=Effects{};if(!running())return false;
    calls=0;staged=Effects{};price=priceMicro;
    context.fuel=manifest.fuel;context.deadline=context.clock()+20;
    const void *args[]={&seconds};auto result=m3_Call(tickFn,1,args);
    if(!result && int32_t(context.clock()-context.deadline)>=0)result="ability watchdog deadline";
    if(result)return fail(result);
    effects=staged;return true;
  }
};
}}
