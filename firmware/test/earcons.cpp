// MIT · Copyright (c) 2026 Nivesh Gajengi
#include "doctest.h"
#include "../xorrpad/logic/earcons.h"
#include "../xorrpad/logic/status-led.h"
#include <vector>
using namespace xorr;
TEST_CASE("all eight earcons render distinct bounded PCM with silent edges"){
 std::vector<std::vector<int16_t>> renders;
#define EARCON(kind,name,a,b,c,d,peak) \
 {auto k=Chime::kind;std::vector<int16_t> pcm;int maximum=0; \
 CHECK(earconLength(k)==(b+d)*16); \
 for(unsigned i=0;i<earconLength(k);++i){auto sample=earconSample(k,i);pcm.push_back(sample);maximum=std::max(maximum,std::abs(int(sample)));} \
 CHECK(maximum<=peak);CHECK(maximum>peak*.85);CHECK(pcm.front()==0);CHECK(pcm.back()==0); \
 CHECK(earconSample(k,earconLength(k))==0); \
 for(const auto &prior:renders)CHECK(pcm!=prior);renders.push_back(pcm);}
#include "../xorrpad/logic/earcons-table.h"
#undef EARCON
 CHECK(renders.size()==8);
}
TEST_CASE("sound policy respects mute volume default detents UTC wrap and unavailable clock"){
 SoundOptions s;CHECK(s.allowed(Chime::Accept,0));CHECK_FALSE(s.allowed(Chime::Tick,0));
 s.knobTick=true;CHECK(s.allowed(Chime::Tick,0));s.mute=true;CHECK_FALSE(s.allowed(Chime::Kill,0));s.mute=false;s.volume=0;CHECK_FALSE(s.allowed(Chime::Fill,0));s.volume=80;
 s.quietStart=1320;s.quietEnd=420;
 for(int t:{-1,0,419,1320,1439})CHECK_FALSE(s.allowed(Chime::LiqAlarm,t));
 for(int t:{420,1000,1319})CHECK(s.allowed(Chime::LiqAlarm,t));
 s.quietStart=600;s.quietEnd=660;CHECK(s.allowed(Chime::Fill,599));CHECK_FALSE(s.allowed(Chime::Fill,600));CHECK(s.allowed(Chime::Fill,660));
 s.quietEnd=600;CHECK_FALSE(s.allowed(Chime::Fill,900));
}
TEST_CASE("sound options validate atomically and LED alarm priority survives silence"){
 JsonDocument d;deserializeJson(d,R"({"volume":65,"mute":true,"knobTick":false,"quietHours":{"startMinute":1320,"endMinute":420}})");SoundOptions s;
 CHECK(soundOptions(d.as<JsonVariantConst>(),s));CHECK(s.volume==65);CHECK(s.mute);
 d["volume"]=101;CHECK_FALSE(soundOptions(d.as<JsonVariantConst>(),s));CHECK(s.volume==65);
 d["volume"]=65;d["quietHours"]["startMinute"]=-1;CHECK_FALSE(soundOptions(d.as<JsonVariantConst>(),s));
 auto low=soundStatusLed(0,true,false,false,false,false),high=soundStatusLed(1200,true,false,false,false,false);CHECK(high.r>low.r);CHECK(high.g>low.g);CHECK(high.b==0);
 auto alarm=soundStatusLed(180,true,true,true,true,true);CHECK(alarm.r==100);CHECK(alarm.g==0);CHECK(alarm.b==0);
 CHECK(soundStatusLed(0,false,true,false,false,false).r<alarm.r);
}
