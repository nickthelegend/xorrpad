#include "../logic/ability-budget.h"
extern "C" const char *xorr_wasm_step(void *context) {
  return context ? static_cast<xorr::abilities::Budget *>(context)->step() : "ability missing budget";
}
