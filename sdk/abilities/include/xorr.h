#ifndef XORR_ABILITY_H
#define XORR_ABILITY_H
#include <stdint.h>
// Price: current market micro-dollars, 0 means unavailable/stale. No network access.
__attribute__((import_module("xorr"),import_name("price"))) int64_t xorr_price(void);
__attribute__((import_module("xorr"),import_name("widget"))) int xorr_widget(const char *text,int length);
// Local UI only: 0 dismiss widget, 1 show widget, 2 reset local view. Never keys/trades.
__attribute__((import_module("xorr"),import_name("macro"))) int xorr_macro(int action);
// 0 soft notification, 1 timer complete. One chime per invocation.
__attribute__((import_module("xorr"),import_name("chime"))) int xorr_chime(int sound);
#endif
