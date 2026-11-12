#include "xorr.h"
#if ATTACK==1
__attribute__((import_module("xorr"),import_name("sign"))) int escape(void);
void tick(uint32_t s){(void)s;escape();}
#elif ATTACK==2
__attribute__((import_module("link"),import_name("trade"))) int escape(void);
void tick(uint32_t s){(void)s;escape();}
#elif ATTACK==3
void tick(uint32_t s){(void)s;xorr_widget("staged",6);xorr_widget((char*)0xfffffff0,64);}
#elif ATTACK==4
void tick(uint32_t s){volatile uint32_t *p=(uint32_t*)(0x40000+s);*p=42;xorr_widget("escaped",7);}
#elif ATTACK==5
void tick(uint32_t s){(void)s;for(;;)__asm__ volatile("");}
#elif ATTACK==6
__attribute__((noinline)) uint32_t again(volatile uint32_t n){volatile char local[64];local[0]=(char)n;return n+again(n+1)+local[0];}
void tick(uint32_t s){xorr_macro(again(s));}
#elif ATTACK==7
void tick(uint32_t s){(void)s;int result=__builtin_wasm_memory_grow(0,4);if(result==-1)xorr_widget("bounded",7);else xorr_widget("escaped",7);}
#elif ATTACK==8
void tick(uint32_t s){(void)s;for(int i=0;i<17;i++)xorr_widget("flood",5);}
#elif ATTACK==9
void tick(uint32_t s){(void)s;xorr_macro(14);}
#endif
