#include "xorr.h"
// All numbers derive from the current desk price cache; no fabricated ticker.
void tick(uint32_t seconds) {
  (void)seconds;
  int64_t price=xorr_price();
  if(price<=0){xorr_widget("Market Pulse: price unavailable",31);return;}
  char text[64]="Market Pulse: $";
  int n=15;int64_t whole=price/1000000;
  char digits[20];int count=0;
  do{digits[count++]=(char)('0'+whole%10);whole/=10;}while(whole&&count<19);
  while(count)text[n++]=digits[--count];
  text[n++]='.';text[n++]=(char)('0'+price/100000%10);text[n++]=(char)('0'+price/10000%10);
  xorr_widget(text,n);
}
