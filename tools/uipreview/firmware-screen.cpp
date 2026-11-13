// Browser binding of the EXACT firmware ui.h + Adafruit_GFX. No replica drawing code.
#include "shim/Arduino.h"
#include <Adafruit_GFX.h>
#include "../../firmware/xorrpad/ui.h"
static PadState pad; static ChartState chart;
static GFXcanvas16 canvas(ui::W,ui::H);
extern "C" {
void screen_reset(){pad=PadState();chart=ChartState();}
void screen_set(const char *k,const char *v){
 if(!strcmp(k,"scanSummary")){pad.scan.summary=v;pad.scan.visible=true;return;}
 if(!strcmp(k,"scanChecked")){pad.scan.checkedCount=atoi(v);return;}
 if(!strcmp(k,"scanUnavailable")){pad.scan.unavailableCount=atoi(v);return;}
 if(!strcmp(k,"scanTop")){pad.scan.top=v;return;}
 if(!strncmp(k,"scanMarket",10)){pad.scan.markets.push_back({v,""});return;}
 if(!strcmp(k,"journalVisible")){pad.journal.visible=atoi(v)!=0;return;}
 if(!strcmp(k,"journalHealthy")){pad.journal.healthy=atoi(v)!=0;return;}
 if(!strcmp(k,"journalSelected")){pad.journal.selected=atoi(v);return;}
 if(!strncmp(k,"journalRow",10)){
  char *end=nullptr;long index=strtol(k+10,&end,10);if(index<0 || index>=32)return;
  pad.journal.entries.resize(std::max(pad.journal.entries.size(),size_t(index+1)));auto &r=pad.journal.entries[index];
  if(!strcmp(end,"Id"))r.id=v;else if(!strcmp(end,"Time"))r.time=strtoull(v,nullptr,10);
  else if(!strcmp(end,"Action"))r.action=v;else if(!strcmp(end,"Market"))r.market=v;else if(!strcmp(end,"Size"))r.size=v;
  else if(!strcmp(end,"Venue"))r.venue=v;else if(!strcmp(end,"Result"))r.result=v;else if(!strcmp(end,"Signature"))r.signature=v;else if(!strcmp(end,"Reason"))r.reason=v;return;
 }
 if(!strcmp(k,"ambientVisible")){pad.ambient.visible=atoi(v)!=0;return;}
 if(!strcmp(k,"ambientEpoch")){pad.ambient.epoch=strtoull(v,nullptr,10);return;}
 if(!strcmp(k,"ambientPrice")){pad.ambient.price=strlen(v)?atof(v):NAN;return;}
 if(!strcmp(k,"ambientPnl")){pad.ambient.pnl=strlen(v)?atof(v):NAN;return;}
 if(!strcmp(k,"ambientFunding")){pad.ambient.nextFunding=strlen(v)?atof(v):NAN;return;}
 if(!strcmp(k,"ambientHours")){pad.ambient.hours=v;return;}
 if(!strcmp(k,"ambientCrew")){pad.ambient.crew=v;return;}
 if(!strncmp(k,"ambientClose",12) && pad.ambient.closes.size()<24){pad.ambient.closes.push_back(atof(v));return;}
 if(!strcmp(k,"flattenId")){pad.flatten.id=v;return;}
 if(!strcmp(k,"flattenState")){pad.flatten.state=v;return;}
 if(!strcmp(k,"flattenMessage")){pad.flatten.message=v;return;}
 if(!strcmp(k,"flattenOrders")){pad.flatten.orders=atoi(v);return;}
 if(!strcmp(k,"flattenPerps")){pad.flatten.perps=atoi(v);return;}
 if(!strcmp(k,"flattenOutcomes")){pad.flatten.outcomes=atoi(v);return;}
 if(!strcmp(k,"flattenRemaining")){pad.flatten.ttl=atoi(v);return;}
 if(!strcmp(k,"flattenPage")){pad.flatten.page=atoi(v);return;}
 if(!strncmp(k,"flattenRow",10) && atoi(k+10)<32){size_t i=atoi(k+10);pad.flatten.rows.resize(std::max(pad.flatten.rows.size(),i+1));pad.flatten.rows[i]=v;return;}
 if(!strcmp(k,"tiltAllowed")){pad.tiltAllowed=atoi(v)!=0;return;}
 if(!strcmp(k,"tiltBlocked")){pad.tiltBlocked=atoi(v)!=0;return;}
 if(!strcmp(k,"tiltReason")){pad.tiltReason=v;return;}
 if(!strcmp(k,"tiltRemaining")){pad.tiltRemaining=atoi(v);return;}
 if(!strcmp(k,"tiltDuration")){pad.tiltDuration=atoi(v);return;}
 if(!strcmp(k,"liqActive")){pad.liqGuard.active=atoi(v)!=0;return;}
 if(!strcmp(k,"liqMarket")){pad.liqGuard.market=v;return;}
 if(!strcmp(k,"liqVenue")){pad.liqGuard.venue=v;return;}
 if(!strcmp(k,"liqMark")){pad.liqGuard.mark=atof(v);return;}
 if(!strcmp(k,"liqPrice")){pad.liqGuard.liq=atof(v);return;}
 if(!strcmp(k,"liqDistance")){pad.liqGuard.distancePct=atof(v);return;}
 if(!strcmp(k,"perpsMessage")){pad.perps.message=v;return;}
 if(!strcmp(k,"positionsScreen")){pad.positionsVisible=atoi(v)!=0;return;}
 if(!strncmp(k,"perpRow",7) && k[7]>='0' && k[7]<='5') {
  size_t i=k[7]-'0';pad.perps.positions.resize(std::max(pad.perps.positions.size(),i+1));auto &r=pad.perps.positions[i];
  if(!strcmp(k+8,"Market"))r.market=v;
  else if(!strcmp(k+8,"Venue"))r.venue=v;
  else if(!strcmp(k+8,"Side"))r.side=v;
  else if(!strcmp(k+8,"Entry"))r.entry=strlen(v)?atof(v):NAN;
  else if(!strcmp(k+8,"Mark"))r.mark=strlen(v)?atof(v):NAN;
  else if(!strcmp(k+8,"Leverage"))r.leverage=strlen(v)?atof(v):NAN;
  else if(!strcmp(k+8,"Liq"))r.liq=strlen(v)?atof(v):NAN;
  else if(!strcmp(k+8,"Distance"))r.distancePct=strlen(v)?atof(v):NAN;
  else if(!strcmp(k+8,"Funding"))r.nextFunding=strlen(v)?atof(v):NAN;return;
 }
 if(!strcmp(k,"predictEnabled")){pad.predict.enabled=atoi(v)!=0;return;}
 if(!strcmp(k,"predictSize")){pad.predict.sizeUsd=atof(v);return;}
 if(!strcmp(k,"predictTotal")){pad.predict.total=atoi(v);return;}
 if(!strcmp(k,"predictOffset")){pad.predict.offset=atoi(v);return;}
 if(!strcmp(k,"predictMessage")){pad.predict.message=v;return;}
 if(!strcmp(k,"predictQuestion")){pad.predict.markets.resize(1);pad.predict.markets[0].question=v;return;}
 if(!strcmp(k,"predictProbability")){pad.predict.markets.resize(1);pad.predict.markets[0].probability=atof(v);return;}
 if(!strcmp(k,"predictClosesIn")){pad.predict.markets.resize(1);pad.predict.markets[0].closesIn=atoi(v);return;}
 if(!strcmp(k,"predictChange")){pad.predict.markets.resize(1);pad.predict.markets[0].hasChange=strlen(v)>0;pad.predict.markets[0].change24h=atof(v);return;}
 if(!strcmp(k,"outcomeVisible")){pad.predict.positionsVisible=atoi(v)!=0;return;}
 if(!strcmp(k,"outcomeMessage")){pad.predict.positionsMessage=v;return;}
 if(!strcmp(k,"outcomeQuestion")){pad.predict.positions.resize(1);pad.predict.positions[0].question=v;return;}
 if(!strcmp(k,"outcomeYes")){pad.predict.positions.resize(1);pad.predict.positions[0].yes=atof(v);return;}
 if(!strcmp(k,"outcomeNo")){pad.predict.positions.resize(1);pad.predict.positions[0].no=atof(v);return;}
 if(!strncmp(k,"outcomeRow",10) && k[10]>='0' && k[10]<='7') {
   size_t i=k[10]-'0';pad.predict.positions.resize(std::max(pad.predict.positions.size(),i+1));auto &r=pad.predict.positions[i];
   if(!strcmp(k+11,"Question"))r.question=v;
   else if(!strcmp(k+11,"Yes"))r.yes=atof(v);
   else if(!strcmp(k+11,"No"))r.no=atof(v);return;
 }
 if(!strcmp(k,"fundVisible")){pad.fund.visible=atoi(v)!=0;return;}
 if(!strcmp(k,"fundAddress")){pad.fund.address=v;return;}
 if(!strcmp(k,"fundUri")){pad.fund.uri=v;return;}
 if(!strcmp(k,"fundCluster")){pad.fund.cluster=v;return;}
 if(!strcmp(k,"portfolioVisible")){pad.portfolio.visible=atoi(v)!=0;return;}
 if(!strcmp(k,"portfolioMessage")){pad.portfolio.message=v;return;}
 if(!strcmp(k,"portfolioCluster")){pad.portfolio.cluster=v;return;}
 if(!strcmp(k,"portfolioTotal")){pad.portfolio.hasTotal=strlen(v)>0;pad.portfolio.totalUsd=atof(v);return;}
 if(!strncmp(k,"portfolioRow",12) && k[12]>='0' && k[12]<='4'){
   size_t i=k[12]-'0';pad.portfolio.rows.resize(std::max(pad.portfolio.rows.size(),i+1));auto &r=pad.portfolio.rows[i];
   if(!strcmp(k+13,"Symbol"))r.symbol=v;
   else if(!strcmp(k+13,"Amount"))r.amount=atof(v);
   else if(!strcmp(k+13,"Usd")){r.hasUsd=strlen(v)>0;r.usd=atof(v);}return;
 }

#define S(name) if(!strcmp(k,#name)){pad.name=String(v);return;}
 S(agent) S(market) S(mode) S(verdict) S(chain) S(venue) S(hoursState) S(hoursNote) S(nyTime) S(link) S(signalId) S(receiptSignature) S(receiptExplorer) S(lastKeyLabel)
#undef S
#define B(name) if(!strcmp(k,#name)){pad.name=atoi(v)!=0;return;}
 B(killed) B(rearmRequested) B(signalReduceOnly) B(ok) B(armed) B(pending) B(chainOk) B(remembers) B(hasPnl) B(autoAccept) B(marketOpen)
#undef B
#define N(name) if(!strcmp(k,#name)){pad.name=atof(v);return;}
 N(price) N(unrealised) N(spentToday) N(dayLimit) N(signalDeadline) N(receiptUntil) N(labelUntil)
#undef N
}
void screen_close(float value){if(chart.n<169)chart.closes[chart.n++]=value;}
void screen_chart(const char *symbol,float price,float change,int hasChange){chart.symbol=String(symbol);chart.price=price;chart.change24h=change;chart.hasChange=hasChange;chart.ok=chart.n>0;chart.hi=-1e30f;chart.lo=1e30f;for(int i=0;i<chart.n;i++){chart.hi=std::max(chart.hi,chart.closes[i]);chart.lo=std::min(chart.lo,chart.closes[i]);}}
uint16_t *screen_render(){ui::drawFrame(canvas,pad,chart);return canvas.getBuffer();}
}
#ifdef SCREEN_NATIVE_TEST
int main(int argc,char **argv){screen_reset();if(argc>1 && !strcmp(argv[1],"--state")) {
 for(int i=2;i<argc;++i){std::string arg=argv[i];auto eq=arg.find('=');if(eq!=std::string::npos)screen_set(arg.substr(0,eq).c_str(),arg.substr(eq+1).c_str());}
 } else if(argc>1){screen_set("ok","1");screen_set("market","SOL");screen_set("price",argv[1]);screen_set("chain","solana");screen_set("chainOk","1");screen_set("agent","Custom");screen_set("link","STUDIO SNAPSHOT");screen_set("remembers","1");screen_set("armed","0");screen_set("hoursState","CRYPTO");screen_set("marketOpen","1");screen_set("hoursNote","public price snapshot");if(argc>2&&strlen(argv[2])){char *csv=strdup(argv[2]);for(char *v=strtok(csv,",");v;v=strtok(nullptr,","))screen_close(atof(v));free(csv);screen_chart("SOL",atof(argv[1]),argc>3?atof(argv[3]):0,argc>3);}}auto p=screen_render();fwrite(p,2,320*240,stdout);}
#endif
