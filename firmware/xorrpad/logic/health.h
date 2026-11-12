#pragma once
#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <string>
namespace xorr {
class TelemetryClock {
  uint32_t last=0;bool sent=false;
public:
  bool due(uint32_t now)const {return !sent || uint32_t(now-last)>=30000;}
  void accepted(uint32_t now){last=now;sent=true;}
};
inline const char *resetName(int reason) {
  switch(reason) {
    case 1:return "power_on"; case 2:return "external"; case 3:return "software";
    case 4:return "panic"; case 5:return "interrupt_watchdog"; case 6:return "task_watchdog";
    case 7:return "watchdog"; case 8:return "deep_sleep"; case 9:return "brownout";
    case 10:return "sdio"; case 11:return "usb"; case 12:return "jtag";
    case 13:return "efuse"; case 14:return "power_glitch"; case 15:return "cpu_lockup";
    default:return "unknown";
  }
}
inline std::string resetHistory(int reason,const std::string &old) {
  return (std::to_string(reason)+":"+resetName(reason)+","+old).substr(0,120);
}
// Flash is retained until an acknowledgment names this complete image.
class CrashUpload {
  size_t total=0, position=0;
  uint32_t epoch=0, waitingAt=0;int via=0;
  bool waiting=false;
  std::string digest;
public:
  bool begin(size_t bytes,const std::string &id) {
    if(!bytes || bytes>262144 || id.size()!=64)return false;
    for(char c:id)if(!((c>='0'&&c<='9')||(c>='a'&&c<='f')))return false;
    total=bytes;digest=id;position=0;waiting=false;return true;
  }
  void connection(bool online,int transport,uint32_t generation) {
    if(!online || via!=transport || epoch!=generation) {position=0;waiting=false;}
    via=online?transport:0;epoch=generation;
  }
  size_t offset()const{return position;}
  size_t size()const{return total;}
  const std::string &id()const{return digest;}
  size_t next(uint32_t now) {
    if(waiting && uint32_t(now-waitingAt)>=30000) {position=0;waiting=false;}
    return via && !waiting ? std::min(size_t(512),total-position):0;
  }
  bool accepted(size_t bytes,uint32_t now) {
    if(!bytes || bytes>512 || waiting || position+bytes>total)return false;
    position+=bytes;
    if(position==total){waiting=true;waitingAt=now;}
    return true;
  }
  bool saved(const std::string &id,size_t bytes)const {
    return waiting && position==total && id==digest && bytes==total;
  }
  void erased(){total=position=0;waiting=false;digest.clear();}
};
}
