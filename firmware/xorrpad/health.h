#pragma once
#include "link.h"
#include "logic/health.h"
#include <driver/temperature_sensor.h>
#include <esp_core_dump.h>
#include <esp_system.h>
#include <esp_task_wdt.h>
#include <esp_timer.h>
#if !CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH || !CONFIG_ESP_BROWNOUT_DET
#error "S4 requires an ESP32 SDK built with flash core dumps and brownout detection"
#endif
class Health {
  temperature_sensor_handle_t sensor=nullptr;
  xorr::TelemetryClock telemetry;
  xorr::CrashUpload crash;
  const esp_partition_t *partition=nullptr;
  size_t imageOffset=0;
  bool watchdog=false;
public:
  int resetReason=0;
  bool keysScanned=false,displayUp=false;
  String resetLog;
  void begin(bool display) {
    displayUp=display;resetReason=esp_reset_reason();
    Preferences p;
    if(p.begin("xorrhealth",false)) {
      resetLog=xorr::resetHistory(resetReason,p.getString("resets","").c_str()).c_str();
      p.putString("resets",resetLog);p.end();
    }
    // Legacy voice HTTP may legitimately block for 60s. Idle tasks still run;
    // a stuck loop panics after 90s and the SDK writes the flash core dump.
    esp_task_wdt_config_t cfg={.timeout_ms=90000,.idle_core_mask=(1u<<portNUM_PROCESSORS)-1,.trigger_panic=true};
    auto err=esp_task_wdt_init(&cfg);
    if(err==ESP_ERR_INVALID_STATE)err=esp_task_wdt_reconfigure(&cfg);
    if(err==ESP_OK)watchdog=esp_task_wdt_status(nullptr)==ESP_OK || esp_task_wdt_add(nullptr)==ESP_OK;
    temperature_sensor_config_t config=TEMPERATURE_SENSOR_CONFIG_DEFAULT(10,80);
    if(temperature_sensor_install(&config,&sensor)==ESP_OK) {
      if(temperature_sensor_enable(sensor)!=ESP_OK)sensor=nullptr;
    }
    // SDK brownout ISR performs the reset. Log it on the next stable boot;
    // never attempt NVS/flash writes from a low-voltage interrupt.
    partition=esp_partition_find_first(ESP_PARTITION_TYPE_DATA,ESP_PARTITION_SUBTYPE_DATA_COREDUMP,nullptr);
    size_t address=0,bytes=0;
    if(!partition || esp_core_dump_image_check()!=ESP_OK ||
       esp_core_dump_image_get(&address,&bytes)!=ESP_OK || address<partition->address ||
       !bytes || bytes>262144 || address-partition->address+bytes>partition->size)return;
    imageOffset=address-partition->address;
    SHA256 hash;uint8_t block[512],digest[32];
    for(size_t offset=0;offset<bytes;) {
      size_t n=std::min(sizeof block,bytes-offset);
      if(esp_partition_read(partition,imageOffset+offset,block,n)!=ESP_OK)return;
      hash.update(block,n);offset+=n;
    }
    hash.finalize(digest,sizeof digest);crash.begin(bytes,xorr::hex(digest,sizeof digest));
  }
  void crashSaved(JsonVariantConst d) {
    if(d["dump"].is<const char*>() && d["size"].is<uint32_t>() &&
       crash.saved(d["dump"].as<std::string>(),d["size"]) && esp_core_dump_image_erase()==ESP_OK)crash.erased();
  }
  void tick(PadLink &link) {
    if(watchdog)esp_task_wdt_reset();
    bool online=link.secureReady();
    crash.connection(online,link.active(),link.connectionEpoch());
    if(!online)return;
    uint32_t now=millis();
    if(telemetry.due(now)) {
      JsonDocument d;d["type"]="telemetry";d["uptime"]=uint64_t(esp_timer_get_time()/1000000);
      d["heap"]=ESP.getFreeHeap();d["psram"]=ESP.getFreePsram();
      d["rssi"]=WiFi.isConnected()?WiFi.RSSI():0;
      float c;
      if(sensor && temperature_sensor_get_celsius(sensor,&c)==ESP_OK && std::isfinite(c))d["temperature"]=c;
      else d["temperature"]=nullptr;
      d["link"]=link.name();d["fw"]=XORR_FW_VERSION;
      d["resetReason"]=resetReason;d["resetName"]=xorr::resetName(resetReason);
      d["resetLog"]=resetLog;d["brownout"]=resetReason==ESP_RST_BROWNOUT;
      d["watchdog"]=watchdog;
      if(link.send(d))telemetry.accepted(now);
    }
    size_t n=crash.next(now);
    if(n && link.idle()) {
      uint8_t bytes[512];
      if(!partition || esp_partition_read(partition,imageOffset+crash.offset(),bytes,n)!=ESP_OK)return;
      JsonDocument d;d["type"]="crash";d["dump"]=crash.id();d["size"]=crash.size();
      d["offset"]=crash.offset();d["data"]=secure::b64(bytes,n);
      d["end"]=crash.offset()+n==crash.size();
      if(link.send(d))crash.accepted(n,now);
    }
  }
};
