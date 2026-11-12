#pragma once
#include "clear-sign.h"
namespace xorr::crew {
// Returns the raw message SHA256 once, after full clear review and physical hold.
// The thin adapter signs precisely these 32 bytes with the pairing/device key.
inline bool consume(solana::Approval &approval,uint32_t held,uint32_t epoch,uint8_t digest[32]){
  if(approval.get().blind || !approval.confirm(held,epoch) ||
     !unhex(approval.get().message.hash,digest,32))return false;
  approval.reset();return true;
}
}
