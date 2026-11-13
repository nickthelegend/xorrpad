#pragma once
#include <ESP_I2S.h>   // Arduino-ESP32 core 3.x
#include "config.h"
#include <Preferences.h>
#include <time.h>
#include <functional>
#include "logic/voice.h"

// Two independent I2S peripherals: INMP441 mic (RX) and MAX98357A amp (TX).
// Record and playback are sequential in hold-to-talk, so they never fight.
class Audio {
public:
  int volume = 80;
  xorr::SoundOptions sounds;
  std::function<void(xorr::Chime)> onChime;
  xorr::Chime active=xorr::Chime::Accept;
  unsigned cursor=0;
  bool playing=false,speakerUp=false,configured=false;
  int utcMinute()const {time_t t=time(nullptr);if(t<1700000000)return -1;struct tm utc;gmtime_r(&t,&utc);return utc.tm_hour*60+utc.tm_min;}
  bool configure(JsonVariantConst d,bool persist=true){
    xorr::SoundOptions next;if(!xorr::soundOptions(d,next))return false;
    if(configured && next.volume==sounds.volume && next.mute==sounds.mute && next.knobTick==sounds.knobTick && next.quietStart==sounds.quietStart && next.quietEnd==sounds.quietEnd && volume==next.volume)return true;
    if(persist){String raw;serializeJson(d,raw);Preferences p;if(!p.begin("xorrsound",false))return false;
      bool ok=p.putString("settings",raw)==raw.length();p.end();if(!ok)return false;}
    sounds=next;volume=next.volume;playing=false;configured=true;return true;
  }
  I2SClass mic;
  I2SClass spk;

  bool begin() {
    Preferences prefs;
    if(prefs.begin("xorrsound",true)){String raw=prefs.getString("settings","");prefs.end();JsonDocument d;if(raw.length()<=512 && !deserializeJson(d,raw))configure(d.as<JsonVariantConst>(),false);}
    spk.setPins(SPK_BCLK, SPK_LRC, SPK_DIN, -1, -1);
    bool okS = spk.begin(I2S_MODE_STD, AUDIO_SAMPLE_RATE,
                         I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO);

    mic.setPins(MIC_SCK, MIC_WS, -1, MIC_SD, -1);
    bool okM = mic.begin(I2S_MODE_STD, AUDIO_SAMPLE_RATE,
                         I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO);
    speakerUp=okS;return okS && okM;
  }

  // Read one block of mic samples. Returns the sample count.
  size_t readMic(int16_t* buf, size_t maxSamples) {
    size_t bytes = mic.readBytes((char*)buf, maxSamples * sizeof(int16_t));
    return bytes / sizeof(int16_t);
  }

  // Push PCM to the speaker (blocking — this is the back-pressure that paces
  // the streamed download in net.h).
  void writeSpk(const int16_t* buf, size_t samples) {
    int16_t scaled[256];
    while(samples) {
      size_t n = std::min(samples, size_t(256));
      int gain=sounds.allowed(xorr::Chime::Accept,utcMinute())?volume:0;
      for(size_t i=0;i<n;++i) scaled[i]=xorr::voiceScale(buf[i],gain);
      spk.write((uint8_t*)scaled,n*sizeof(int16_t));
      buf+=n;samples-=n;
    }
  }

  void chime(xorr::Chime kind) {
    if(kind==xorr::Chime::Tick && (!sounds.knobTick || playing))return;
    if(playing && (active==xorr::Chime::Kill || active==xorr::Chime::LiqAlarm) && kind!=xorr::Chime::Kill && kind!=xorr::Chime::LiqAlarm)return;
    if(onChime)onChime(kind);
    if(!speakerUp || !sounds.allowed(kind,utcMinute()))return;
    active=kind;cursor=0;playing=true;
  }

  // At most 8ms of PCM per loop; never wait for a whole cue before scanning keys.
  void tick(){
    if(!playing)return;
    if(!sounds.allowed(active,utcMinute())){playing=false;return;}
    int16_t pcm[128];unsigned n=std::min(128u,xorr::earconLength(active)-cursor);
    for(unsigned i=0;i<n;++i)pcm[i]=xorr::earconSample(active,cursor++);
    writeSpk(pcm,n);if(cursor>=xorr::earconLength(active))playing=false;
  }
  // A short sine cue. Used for start/stop/error feedback.
  void beep(float hz, uint32_t ms, int16_t amp = 8000) {
    uint32_t n = (AUDIO_SAMPLE_RATE * ms) / 1000;
    for (uint32_t i = 0; i < n; i++) {
      float t = (float)i / AUDIO_SAMPLE_RATE;
      int16_t s = (int16_t)(amp * sinf(2.0f * PI * hz * t));
      writeSpk(&s, 1);
    }
  }
};
