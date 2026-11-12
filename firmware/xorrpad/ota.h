#pragma once
#include <esp_ota_ops.h>
#include "secure.h"
#include "ota-public-key.h"
// Arduino 3.3.10 must defer its default auto-validation until our loop health check.
extern "C" bool verifyRollbackLater(void){return true;}
class Ota {
 const esp_partition_t *target=nullptr;esp_ota_handle_t handle=0;SHA256 digest;xorr::Manifest manifest;uint32_t offset=0,started=0;bool pending=false;
public:
 String error;bool busy=false;uint8_t progress=0;
 void begin(){started=millis();esp_ota_img_states_t s;if(esp_ota_get_state_partition(esp_ota_get_running_partition(),&s)==ESP_OK)pending=s==ESP_OTA_IMG_PENDING_VERIFY;}
 void health(bool display,bool keys,bool handshake){if(!pending)return;if(display&&keys&&handshake){if(esp_ota_mark_app_valid_cancel_rollback()==ESP_OK)pending=false;}else if(millis()-started>=60000)esp_ota_mark_app_invalid_rollback_and_reboot();}
 void abort(const String&reason){if(busy)esp_ota_abort(handle);busy=false;error=reason;}
 bool message(JsonVariantConst d){String type=d["type"]|"";error="";
  if(type=="ota_begin"){
   if(busy){error="OTA_BUSY: wait for current update";return false;}auto m=d["manifest"];manifest.version=m["version"]|"";manifest.sha256=m["sha256"]|"";manifest.signature=m["signature"]|"";manifest.minDesk=m["minDeskVersion"]|"";manifest.notes=m["notes"]|"";manifest.size=m["size"]|0u;
   uint8_t pk[32];if(!xorr::unhex(XORR_OTA_PUBLIC_KEY,pk,32)||!manifest.verify(pk)){error="OTA_SIGNATURE: use a signed release";return false;}
   target=esp_ota_get_next_update_partition(nullptr);if(!target||manifest.size>target->size){error="OTA_SIZE: use the correct board image";return false;}
   if(esp_ota_begin(target,manifest.size,&handle)!=ESP_OK){error="OTA_FLASH: retry on stable USB power";return false;}digest.reset();offset=0;busy=true;progress=0;return true;
  }
  if(!busy){error="OTA_STATE: begin the update again";return false;}
  if(type=="ota_chunk"){
   std::vector<uint8_t>b;if(d["offset"]!=offset||!secure::decode(d["data"]|"",b,512)||b.empty()||offset+b.size()>manifest.size){abort("OTA_ORDER: restart update");return false;}
   if(esp_ota_write(handle,b.data(),b.size())!=ESP_OK){abort("OTA_WRITE: retry on stable power");return false;}digest.update(b.data(),b.size());offset+=b.size();progress=offset*100/manifest.size;return true;
  }
  if(type=="ota_end"){
   uint8_t hash[32];digest.finalize(hash,32);if(offset!=manifest.size||xorr::hex(hash,32)!=manifest.sha256){abort("OTA_HASH: redownload release");return false;}
   if(esp_ota_end(handle)!=ESP_OK){busy=false;error="OTA_IMAGE: use an ESP32-S3 image";return false;}busy=false;
   if(esp_ota_set_boot_partition(target)!=ESP_OK){error="OTA_BOOT: retry update";return false;}progress=100;return true;
  }abort("OTA_TYPE: restart update");return false;
 }
};
