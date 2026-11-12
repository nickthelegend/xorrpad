#pragma once
// Native/WASM adapter for the board's esp_qrcode API. Same encoder and options;
// no placeholder modules. Only ui.h's translation unit includes this adapter.
#include <vector>
#include "../vendor/qrcode/qrcodegen.c"
using esp_qrcode_handle_t = const uint8_t *;
struct esp_qrcode_config_t {
  void (*display_func)(esp_qrcode_handle_t);
  int max_qrcode_version, qrcode_ecc_level;
};
constexpr int ESP_OK=0, ESP_FAIL=-1, ESP_QRCODE_ECC_LOW=0;
inline int esp_qrcode_get_size(esp_qrcode_handle_t qr) { return qrcodegen_getSize(qr); }
inline bool esp_qrcode_get_module(esp_qrcode_handle_t qr,int x,int y) { return qrcodegen_getModule(qr,x,y); }
inline int esp_qrcode_generate(esp_qrcode_config_t *cfg,const char *text) {
  std::vector<uint8_t> qr(qrcodegen_BUFFER_LEN_FOR_VERSION(cfg->max_qrcode_version)), temp(qr.size());
  if(!qrcodegen_encodeText(text,temp.data(),qr.data(),qrcodegen_Ecc(cfg->qrcode_ecc_level),
      qrcodegen_VERSION_MIN,cfg->max_qrcode_version,qrcodegen_Mask_AUTO,true))return ESP_FAIL;
  cfg->display_func(qr.data());return ESP_OK;
}
