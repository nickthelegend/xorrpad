// Process-wide bound includes parser, compiled code, tables, stack and memory.
#include "xorr_heap.h"
#include <stdlib.h>
#include <string.h>
#ifdef ARDUINO
#include <esp_heap_caps.h>
#endif
#define XORR_HEAP_MAX (768u * 1024u)
typedef union { size_t size; long double align; void *pointer; } Header;
static size_t used;
size_t xorr_wasm_heap_used(void) { return used; }
void *xorr_wasm_calloc(size_t n) {
    if (n > XORR_HEAP_MAX - used) return NULL;
#ifdef ARDUINO
    Header *h = heap_caps_calloc(1, sizeof(Header) + n, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
#else
    Header *h = calloc(1, sizeof(Header) + n);
#endif
    if (!h) return NULL;
    h->size = n; used += n; return h + 1;
}
void xorr_wasm_free(void *p) {
    if (!p) return;
    Header *h = (Header *)p - 1; used -= h->size; free(h);
}
void *xorr_wasm_realloc(void *p, size_t n) {
    if (!p) return xorr_wasm_calloc(n);
    Header *h = (Header *)p - 1;
    if (n > XORR_HEAP_MAX - (used - h->size)) return NULL;
#ifdef ARDUINO
    Header *next = heap_caps_realloc(h, sizeof(Header) + n, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
#else
    Header *next = realloc(h, sizeof(Header) + n);
#endif
    if (!next) return NULL;
    used = used - next->size + n; next->size = n; return next + 1;
}
