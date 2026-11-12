#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <string>
#include <opus.h>

namespace xorr {
constexpr int voiceRate = 16000, voiceFrame = 320, voiceBitrate = 24000;
class VoiceGate {
  size_t tail = 0;
public:
  void reset() { tail = 0; }
  int process(int16_t *pcm, size_t count) {
    if (!count) return 0;
    double sum = 0;
    for (size_t i=0; i<count; ++i) sum += double(pcm[i])*pcm[i];
    if (std::sqrt(sum/count) >= 600) tail = 4000; // 250 ms hangover
    for (size_t i=0; i<count; ++i) {
      if (!tail || std::abs(int(pcm[i])) < 500) pcm[i] = 0;
      if (tail) --tail;
    }
    sum = 0;
    for (size_t i=0; i<count; ++i) sum += double(pcm[i])*pcm[i];
    return std::min(60, int(std::sqrt(sum/count)/200));
  }
};
inline int voiceVolume(int current, int steps) {
  return int(std::max<int64_t>(0, std::min<int64_t>(100, int64_t(current)+int64_t(steps)*5)));
}
inline int16_t voiceScale(int16_t sample, int volume) {
  return int32_t(sample)*std::clamp(volume,0,100)/100;
}
enum class Chime { Accept, Refuse, Fill, Error, Kill, LiqAlarm };
struct Cue { int hz, ms; };
inline std::array<Cue,2> chime(Chime kind) {
  switch(kind) {
    case Chime::Accept: return {{{1000,40},{1400,60}}};
    case Chime::Refuse: return {{{700,50},{450,70}}};
    case Chime::Fill: return {{{1400,50},{1900,90}}};
    case Chime::LiqAlarm: return {{{1800,140},{650,180}}};
    case Chime::Kill: return {{{350,100},{180,160}}};
    default: return {{{250,60},{250,100}}};
  }
}
// The same library and frame accumulator run on the ESP32 and in native tests.
class VoiceEncoder {
  OpusEncoder *codec = nullptr;
  int16_t pending[voiceFrame] = {};
  size_t used = 0;
public:
  VoiceEncoder() = default;
  VoiceEncoder(const VoiceEncoder &) = delete;
  VoiceEncoder &operator=(const VoiceEncoder &) = delete;
  ~VoiceEncoder() { if(codec) opus_encoder_destroy(codec); }
  bool reset() {
    used = 0;
    int error = OPUS_OK;
    if(!codec) codec = opus_encoder_create(voiceRate,1,OPUS_APPLICATION_VOIP,&error);
    return codec && error == OPUS_OK &&
      opus_encoder_ctl(codec,OPUS_RESET_STATE) == OPUS_OK &&
      opus_encoder_ctl(codec,OPUS_SET_BITRATE(voiceBitrate)) == OPUS_OK &&
      opus_encoder_ctl(codec,OPUS_SET_VBR(0)) == OPUS_OK &&
      opus_encoder_ctl(codec,OPUS_SET_COMPLEXITY(3)) == OPUS_OK;
  }
  template<class Emit> bool push(const int16_t *pcm, size_t count, bool end, Emit emit) {
    if(!codec || (!pcm && count)) return false;
    for(size_t i=0; i<count; ++i) {
      pending[used++] = pcm[i];
      if(used == voiceFrame && !flush(emit)) return false;
    }
    if(end && used) {
      std::fill(pending+used,pending+voiceFrame,0);
      return flush(emit);
    }
    return true;
  }
private:
  template<class Emit> bool flush(Emit emit) {
    uint8_t packet[128];
    int n = opus_encode(codec,pending,voiceFrame,packet,sizeof packet);
    used = 0;
    return n>0 && emit(packet,size_t(n));
  }
};
class VoicePlayback {
  OpusDecoder *codec = nullptr;
  std::string stream, format;
  uint32_t next = 0;
public:
  VoicePlayback() = default;
  VoicePlayback(const VoicePlayback &) = delete;
  VoicePlayback &operator=(const VoicePlayback &) = delete;
  ~VoicePlayback() { if(codec) opus_decoder_destroy(codec); }
  void reset() { stream.clear(); next=0; }
  int decode(const std::string &id, uint32_t seq, const std::string &encoding,
             int rate, const uint8_t *data, size_t bytes, bool end, bool ble,
             int16_t *out) {
    auto fail=[&](){reset();return -1;};
    if(id.empty() || id.size()>96 || rate!=voiceRate || (!data && bytes) ||
       (encoding!="opus" && encoding!="pcm") || (ble && encoding!="opus") ||
       (!bytes && !end)) return fail();
    if(seq==0) {
      stream=id;format=encoding;next=0;
      if(codec && opus_decoder_ctl(codec,OPUS_RESET_STATE)!=OPUS_OK) return fail();
    }
    if(stream.empty() || stream!=id || next!=seq || format!=encoding) return fail();
    int n=0;
    if(encoding=="opus") {
      if(bytes>256) return fail();
      int error=OPUS_OK;
      if(!codec) codec=opus_decoder_create(voiceRate,1,&error);
      if(!codec || error!=OPUS_OK) return fail();
      if(bytes) {
        if(opus_packet_get_nb_samples(data,int(bytes),voiceRate)!=voiceFrame) return fail();
        n=opus_decode(codec,data,int(bytes),out,voiceFrame,0);
        if(n!=voiceFrame) return fail();
      }
    } else {
      if(bytes>512 || bytes%2) return fail();
      n=int(bytes/2);
      for(int i=0;i<n;++i) out[i]=int16_t(uint16_t(data[2*i]) | uint16_t(data[2*i+1])<<8);
    }
    ++next;
    if(end) reset();
    return n;
  }
};
}
