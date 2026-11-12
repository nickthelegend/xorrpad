#include "xorr.h"
static uint32_t started=0;static int active=0,notified=0;
void tick(uint32_t seconds) {
  if(!active){started=seconds;active=1;}
  uint32_t elapsed=seconds-started;
  if(elapsed>=25*60){
    xorr_widget("Pomodoro: take a five minute break",33);
    if(!notified){xorr_chime(1);notified=1;}
    return;
  }
  uint32_t left=25*60-elapsed;
  char text[]="Pomodoro: focus 25:00";
  text[16]=(char)('0'+left/60/10);text[17]=(char)('0'+left/60%10);
  text[19]=(char)('0'+left%60/10);text[20]=(char)('0'+left%60%10);
  xorr_widget(text,sizeof(text)-1);
}
