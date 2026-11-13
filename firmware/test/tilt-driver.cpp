// MIT · Copyright (c) 2026 Nivesh Gajengi
// Public discipline accounting only: no keys, signing or external service fixtures.
#include "../xorrpad/logic/tilt-guard.h"
#include <iostream>
#include <fstream>
#include <ctime>
int main(int argc,char **argv){
 if(argc!=2)return 1;xorr::tilt::Guard g;std::string line;
 auto load=[&](){std::ifstream f(argv[1]);if(!f.good())return;std::string raw((std::istreambuf_iterator<char>(f)),{});JsonDocument d;if(deserializeJson(d,raw) || !g.restore(d))g.healthy=false;};
 auto save=[&](){JsonDocument d;g.json(d.to<JsonObject>());std::string raw;serializeJson(d,raw);std::string tmp=std::string(argv[1])+".tmp";std::ofstream f(tmp);f<<raw;f.close();if(!f || std::rename(tmp.c_str(),argv[1]))g.healthy=false;};load();
 while(std::getline(std::cin,line)){
  JsonDocument d,out;if(deserializeJson(d,line))return 2;
  uint64_t now=d["now"] | uint64_t(std::time(nullptr));std::string cmd=d["command"] | "";bool ok=true;
  g.advance(now);
  if(cmd=="settings"){xorr::tilt::Settings s;ok=xorr::tilt::settings(d["settings"],s);if(ok){g.config=s;g.evaluate(now);save();}}
  else if(cmd=="accept"){ok=g.accept(d["id"] | "",d["reduceOnly"]==true,now);if(ok)save();}
  else if(cmd=="fill"){ok=d["pnl"].is<double>()?g.fill(d["id"] | "",d["pnl"],d["closed"]==true,now):(d["closed"]==true && g.unknown(d["id"] | "",now));if(ok)save();}
  else if(cmd=="reboot"){g={};load();g.advance(now);}
  out["ok"]=ok && g.healthy;out["blocked"]=g.blocked(now);out["reason"]=g.reason(now);out["remainingSeconds"]=g.clock(now) && g.until()>now?g.until()-now:0;out["durationSeconds"]=out["remainingSeconds"];out["tradesHour"]=g.trades.size()+g.untimed;out["realizedPnlUsd"]=g.realized;out["losingCloses"]=g.streak;out["unknownCloses"]=g.missing.size();out["healthy"]=g.healthy;out["clockReady"]=g.clock(now);xorr::tilt::json(out["settings"].to<JsonObject>(),g.config);serializeJson(out,std::cout);std::cout<<std::endl;
 }
}
