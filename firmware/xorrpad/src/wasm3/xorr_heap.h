#pragma once
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif
void *xorr_wasm_calloc(size_t n);
void *xorr_wasm_realloc(void *p, size_t n);
void xorr_wasm_free(void *p);
size_t xorr_wasm_heap_used(void);

#ifdef __cplusplus
}
#endif
