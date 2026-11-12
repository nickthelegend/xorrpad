#include "doctest.h"
#include "../xorrpad/logic/voice.h"
#include <vector>
using namespace xorr;
TEST_CASE("voice gate starts silent, including boot and new utterances") {
  VoiceGate g;int16_t quiet[320];std::fill_n(quiet,320,499);
  CHECK(g.process(quiet,320)==0);for(auto v:quiet)CHECK(v==0);
  CHECK(g.process(nullptr,0)==0);
}
TEST_CASE("VAD opens on energy, gates noise and closes after 250ms") {
  VoiceGate g;int16_t block[320];std::fill_n(block,320,1000);
  CHECK(g.process(block,320)==5);CHECK(block[0]==1000);
  std::fill_n(block,320,550);g.process(block,320);CHECK(block[0]==550);
  for(int i=0;i<13;++i){std::fill_n(block,320,550);g.process(block,320);}
  CHECK(block[319]==0);g.reset();std::fill_n(block,320,550);CHECK(g.process(block,320)==0);
}
TEST_CASE("waveform clamps and full scale negative samples do not overflow") {
  VoiceGate g;int16_t a[]={-32768,32767,300,-300};
  CHECK(g.process(a,4)==60);CHECK(a[0]==-32768);CHECK(a[2]==0);CHECK(a[3]==0);
}
TEST_CASE("volume knob clamps and shared gain preserves signed PCM") {
  CHECK(voiceVolume(80,10)==100);CHECK(voiceVolume(5,-5)==0);
  CHECK(voiceVolume(80,-1)==75);CHECK(voiceScale(-32768,50)==-16384);
  CHECK(voiceScale(32767,100)==32767);CHECK(voiceScale(1234,0)==0);
}
TEST_CASE("five chimes have distinct bounded frequency sequences") {
  std::vector<int> signatures;
  for(auto k:{Chime::Accept,Chime::Refuse,Chime::Fill,Chime::Error,Chime::Kill}) {
    auto c=chime(k);int signature=c[0].hz*10000+c[1].hz;
    CHECK(std::find(signatures.begin(),signatures.end(),signature)==signatures.end());
    signatures.push_back(signature);CHECK(c[0].ms+c[1].ms<=300);
  }
}
TEST_CASE("real Opus frame accumulator encodes 24kbps and decodes 16k mono") {
  VoiceEncoder enc;REQUIRE(enc.reset());VoicePlayback play;
  int16_t pcm[16000];for(int i=0;i<16000;++i)pcm[i]=int16_t(12000*std::sin(i*0.12));
  std::vector<std::vector<uint8_t>> packets;
  auto emit=[&](const uint8_t *p,size_t n){packets.emplace_back(p,p+n);return true;};
  for(int i=0;i<16000;i+=256)REQUIRE(enc.push(pcm+i,std::min(256,16000-i),false,emit));
  REQUIRE(enc.push(nullptr,0,true,emit));REQUIRE(packets.size()==50);
  size_t bytes=0;int16_t out[320];double energy=0;
  for(size_t i=0;i<packets.size();++i) {
    auto &p=packets[i];bytes+=p.size();
    REQUIRE(play.decode("speech",i,"opus",16000,p.data(),p.size(),false,true,out)==320);
    for(auto v:out)energy+=double(v)*v;
  }
  CHECK(bytes*8==24000);CHECK(energy>1000000);
  CHECK(play.decode("speech",50,"opus",16000,nullptr,0,true,true,out)==0);
}
TEST_CASE("Opus pads partial final frame and resets independent recordings") {
  VoiceEncoder enc;REQUIRE(enc.reset());int16_t pcm[321]={};int frames=0;
  auto emit=[&](const uint8_t*,size_t){++frames;return true;};
  CHECK(enc.push(pcm,321,true,emit));CHECK(frames==2);
  CHECK(enc.reset());frames=0;CHECK(enc.push(nullptr,0,true,emit));CHECK(frames==0);
  CHECK(enc.push(pcm,320,false,[](const uint8_t*,size_t){return false;})==false);
}
TEST_CASE("TTS rejects codec, rate, sequence, transport and PCM size errors") {
  VoicePlayback p;int16_t out[320];uint8_t pcm[]={0,128,255,127};
  CHECK(p.decode("a",0,"pcm",16000,pcm,4,false,false,out)==2);
  CHECK(out[0]==-32768);CHECK(out[1]==32767);
  CHECK(p.decode("a",2,"pcm",16000,pcm,4,false,false,out)==-1);
  CHECK(p.decode("a",1,"pcm",16000,pcm,4,true,false,out)==-1);
  CHECK(p.decode("a",0,"pcm",16000,pcm,4,true,true,out)==-1);
  CHECK(p.decode("a",0,"pcm",24000,pcm,4,true,false,out)==-1);
  CHECK(p.decode("a",0,"mp3",16000,pcm,4,true,false,out)==-1);
  CHECK(p.decode("a",0,"pcm",16000,pcm,3,true,false,out)==-1);
  CHECK(p.decode("a",0,"pcm",16000,nullptr,0,false,false,out)==-1);
  CHECK(p.decode("",0,"pcm",16000,pcm,4,true,false,out)==-1);
}
TEST_CASE("TTS malformed Opus aborts stream and permits fresh PCM fallback") {
  VoicePlayback p;int16_t out[320];uint8_t invalid[]={255,255,255},pcm[]={1,0};
  CHECK(p.decode("bad",0,"opus",16000,invalid,3,false,true,out)==-1);
  CHECK(p.decode("fresh",0,"pcm",16000,pcm,2,true,false,out)==1);CHECK(out[0]==1);
}
TEST_CASE("liquidation alarm is distinct from every existing earcon and bounded") {
 auto alarm=chime(Chime::LiqAlarm);
 CHECK(alarm[0].ms+alarm[1].ms==320);
 for(auto k:{Chime::Accept,Chime::Refuse,Chime::Fill,Chime::Error,Chime::Kill}) {
  auto old=chime(k);CHECK(alarm[0].hz!=old[0].hz);CHECK(alarm[1].hz!=old[1].hz);
 }
}
