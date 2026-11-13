// MIT · Copyright (c) 2026 Nivesh Gajengi
#include "../xorrpad/logic/ambient.h"
#include "../xorrpad/logic/accessibility.h"
#include <iostream>
#include <fstream>
#include "../xorrpad/logic/journal.h"
int main(int argc,char **argv){xorr::Journal journal;
 auto load=[&](){if(argc<2)return;std::ifstream f(argv[1]);if(!f.good())return;JsonDocument d;if(deserializeJson(d,f) || !xorr::restoreJournal(d,journal))journal.healthy=false;};
 auto save=[&](){if(argc<2)return;std::string tmp=std::string(argv[1])+".tmp";std::ofstream f(tmp);JsonDocument d;xorr::journalJson(d.to<JsonObject>(),journal);serializeJson(d,f);f.close();if(!f || std::rename(tmp.c_str(),argv[1]))journal.healthy=false;};load();
xorr::DisplayIdle idle;xorr::AmbientWake wake;bool visible=false;std::string line;
 while(std::getline(std::cin,line)){JsonDocument d,out;if(deserializeJson(d,line))return 2;
  uint32_t now=d["now"] | uint32_t(0);std::string cmd=d["command"] | "";bool consumed=false;
  if(cmd=="wake"){idle.wake(now);visible=false;}
  if(cmd=="tick")visible=idle.ambientDue(now,d["home"]==true,d["enabled"]!=false);
  if(cmd=="key"){consumed=wake.key(uint16_t(d["bit"] | 1),d["pressed"]==true,visible);idle.wake(now);visible=false;}
  if(cmd=="knob"){consumed=wake.knob(d["down"]==true,d["event"]==true,d["ended"]==true,visible);if(d["down"]==true || d["event"]==true){idle.wake(now);visible=false;}}
  if(cmd=="journal"){if(xorr::journalMessage(d["message"],journal,d["epoch"] | uint64_t(0)))save();}
  if(cmd=="result"){if(journal.result(d["id"] | "",d["result"] | "",d["reason"] | ""))save();}
  if(cmd=="scroll")journal.scroll(d["delta"] | 0);
  if(cmd=="reboot"){journal={};load();}
  xorr::journalJson(out["journal"].to<JsonObject>(),journal);out["healthy"]=journal.healthy;out["selected"]=journal.selected;
  out["consumed"]=consumed;out["visible"]=visible;serializeJson(out,std::cout);std::cout<<std::endl;
 }
}
