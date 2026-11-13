// MIT · Copyright (c) 2026 Nivesh Gajengi
#include "../xorrpad/logic/ambient.h"
#include "../xorrpad/logic/accessibility.h"
#include <iostream>
int main(){xorr::DisplayIdle idle;xorr::AmbientWake wake;bool visible=false;std::string line;
 while(std::getline(std::cin,line)){JsonDocument d,out;if(deserializeJson(d,line))return 2;
  uint32_t now=d["now"] | uint32_t(0);std::string cmd=d["command"] | "";bool consumed=false;
  if(cmd=="wake"){idle.wake(now);visible=false;}
  if(cmd=="tick")visible=idle.ambientDue(now,d["home"]==true,d["enabled"]!=false);
  if(cmd=="key"){consumed=wake.key(uint16_t(d["bit"] | 1),d["pressed"]==true,visible);idle.wake(now);visible=false;}
  if(cmd=="knob"){consumed=wake.knob(d["down"]==true,d["event"]==true,d["ended"]==true,visible);if(d["down"]==true || d["event"]==true){idle.wake(now);visible=false;}}
  out["consumed"]=consumed;out["visible"]=visible;serializeJson(out,std::cout);std::cout<<std::endl;
 }
}
