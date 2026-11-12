#include "xorr.h"
void tick(uint32_t seconds) {
  (void)seconds;
  const char text[]="My ability";
  xorr_widget(text,sizeof(text)-1);
}
