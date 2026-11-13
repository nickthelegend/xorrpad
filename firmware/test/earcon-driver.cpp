// MIT · Copyright (c) 2026 Nivesh Gajengi
#include "../xorrpad/logic/earcons.h"
#include <iostream>
#include <string>
int main(){std::string line;while(std::getline(std::cin,line)){
 JsonDocument d,out;if(deserializeJson(d,line)){std::cout<<"{}\n";continue;}
 xorr::SoundOptions s;bool ok=xorr::soundOptions(d["sounds"],s),found=false;auto pcm=out["pcm"].to<JsonArray>();
#define EARCON(kind,name,a,b,c,e,peak) \
 if(d["kind"]==#name){found=true;if(ok && s.allowed(xorr::Chime::kind,d["minute"] | -1))for(unsigned i=0;i<xorr::earconLength(xorr::Chime::kind);++i)pcm.add(int(xorr::earconSample(xorr::Chime::kind,i))*s.volume/100);}
#include "../xorrpad/logic/earcons-table.h"
#undef EARCON
 out["ok"]=ok && found;serializeJson(out,std::cout);std::cout<<std::endl;
}}
