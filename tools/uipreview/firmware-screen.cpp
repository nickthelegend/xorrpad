// Browser binding of the EXACT firmware ui.h + Adafruit_GFX. No replica drawing code.
#include "shim/Arduino.h"
#include <Adafruit_GFX.h>
#include "../../firmware/xorrpad/ui.h"
static PadState pad; static ChartState chart;
static GFXcanvas16 canvas(ui::W,ui::H);
extern "C" {
void screen_reset(){pad=PadState();chart=ChartState();}
void screen_set(const char *k,const char *v){
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
int main(){screen_reset();auto p=screen_render();fwrite(p,2,320*240,stdout);}
#endif
