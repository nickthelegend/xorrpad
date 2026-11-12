// Browser binding of the EXACT firmware ui.h + Adafruit_GFX. No replica drawing code.
#include "shim/Arduino.h"
#include <Adafruit_GFX.h>
#include "../../firmware/xorrpad/ui.h"
static PadState pad; static ChartState chart;
static GFXcanvas16 canvas(ui::W,ui::H);
extern "C" {
void screen_reset(){pad=PadState();chart=ChartState();}
void screen_set(const char *k,const char *v){
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
 B(ok) B(armed) B(pending) B(chainOk) B(remembers) B(hasPnl) B(autoAccept) B(marketOpen)
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
