#pragma once
#include "ota-public-key.h"
#include "secure.h"
#include "logic/ota.h"
#include <Preferences.h>
#include <esp_ota_ops.h>
// Arduino 3.3.10 must defer its default auto-validation until our loop health
// check.
extern "C" bool verifyRollbackLater(void) { return true; }
class Ota {
  const esp_partition_t *target = nullptr;
  esp_ota_handle_t handle = 0;
  SHA256 digest, patchDigest;
  xorr::DeltaPatcher patcher;
  bool delta = false;
  std::string channel = "stable";
  const esp_partition_t *base = nullptr;
  uint32_t received = 0;
  xorr::Manifest manifest;
  uint32_t offset = 0, started = 0;
  bool pending = false;

public:
  String error;
  bool busy = false;
  uint8_t progress = 0;
  const char *selectedChannel() const { return channel.c_str(); }
  void begin() {
    Preferences prefs;
    if (prefs.begin("xorrota", true)) {
      String saved = prefs.getString("channel", "stable");
      channel = saved == "beta" ? "beta" : "stable";
      prefs.end();
    }
    started = millis();
    esp_ota_img_states_t s;
    if (esp_ota_get_state_partition(esp_ota_get_running_partition(), &s) ==
        ESP_OK)
      pending = s == ESP_OTA_IMG_PENDING_VERIFY;
  }
  void health(bool display, bool keys, bool handshake) {
    if (!pending)
      return;
    if (display && keys && handshake) {
      if (esp_ota_mark_app_valid_cancel_rollback() == ESP_OK)
        pending = false;
    } else if (millis() - started >= 60000)
      esp_ota_mark_app_invalid_rollback_and_reboot();
  }
  void abort(const String &reason) {
    if (busy)
      esp_ota_abort(handle);
    busy = false;
    error = reason;
  }
  bool message(JsonVariantConst d) {
    String type = d["type"] | "";
    error = "";
    if (type == "ota_status" || type == "ota_channel") {
      if (busy) { error = "OTA_BUSY: wait for current update"; return false; }
      if (type == "ota_status") return true;
      String selected = d["channel"] | "";
      if (selected != "stable" && selected != "beta") { error = "OTA_CHANNEL: choose stable or beta"; return false; }
      Preferences prefs;
      if (!prefs.begin("xorrota", false)) { error = "OTA_NVS: retry channel selection"; return false; }
      bool saved = prefs.putString("channel", selected) == selected.length();
      prefs.end();
      if (!saved) { error = "OTA_NVS: retry channel selection"; return false; }
      channel = selected.c_str(); return true;
    }
    if (type == "ota_begin") {
      if (busy) {
        error = "OTA_BUSY: wait for current update";
        return false;
      }
      String json;
      serializeJson(d["manifest"], json);
      if (!xorr::parseManifest(json.c_str(), manifest)) {
        error = "OTA_MANIFEST: use a complete signed manifest";
        return false;
      }
      uint8_t pk[32];
      if (!xorr::unhex(XORR_OTA_PUBLIC_KEY, pk, 32) || !manifest.verify(pk)) {
        error = "OTA_SIGNATURE: use a signed release";
        return false;
      }
      char id[32]; snprintf(id, sizeof id, "esp32-%012llx", ESP.getEfuseMac());
      if (!xorr::otaEligible(manifest, id, channel)) { error = "OTA_ROLLOUT: release not available for this pad/channel"; return false; }
      if (!d["delta"].isUnbound() && !d["delta"].is<bool>()) { error = "OTA_DELTA: choose full or delta"; return false; }
      delta = d["delta"] | false;
      base = esp_ota_get_running_partition();
      if (delta) {
        if (!manifest.delta.present || manifest.delta.fromVersion != XORR_FW_VERSION ||
            !base || manifest.delta.baseSize > base->size) { error = "OTA_BASE: use the full image"; return false; }
        SHA256 hash; uint8_t bytes[512], result[32];
        for (uint32_t at = 0; at < manifest.delta.baseSize;) {
          size_t n = std::min(uint32_t(sizeof bytes), manifest.delta.baseSize - at);
          if (esp_partition_read(base, at, bytes, n) != ESP_OK) { error = "OTA_BASE: cannot read installed image"; return false; }
          hash.update(bytes,n); at += n;
        }
        hash.finalize(result,32);
        if (xorr::hex(result,32) != manifest.delta.baseSha256) { error = "OTA_BASE: use the full image"; return false; }
        patcher.begin(manifest.delta.baseSize, manifest.size);
      }
      target = esp_ota_get_next_update_partition(nullptr);
      if (!target || manifest.size > target->size) {
        error = "OTA_SIZE: use the correct board image";
        return false;
      }
      if (esp_ota_begin(target, manifest.size, &handle) != ESP_OK) {
        error = "OTA_FLASH: retry on stable USB power";
        return false;
      }
      digest.reset();
      offset = received = 0;
      patchDigest.reset();
      busy = true;
      progress = 0;
      return true;
    }
    if (!busy) {
      error = "OTA_STATE: begin the update again";
      return false;
    }
    if (type == "ota_chunk") {
      std::vector<uint8_t> b;
      uint32_t total = delta ? manifest.delta.size : manifest.size;
      if (!d["offset"].is<uint32_t>() || d["offset"].as<uint32_t>() != received ||
          !secure::decode(d["data"] | "", b, 512) || b.empty() || b.size() > total - received) {
        abort("OTA_ORDER: restart update"); return false;
      }
      auto write = [this](const uint8_t *bytes, size_t n) {
        if (n > manifest.size - offset || esp_ota_write(handle,bytes,n) != ESP_OK) return false;
        digest.update(bytes,n); offset += n; return true;
      };
      if (delta) {
        patchDigest.update(b.data(),b.size());
        if (!patcher.feed(b.data(),b.size(),[this](uint32_t at,uint8_t *bytes,size_t n) {
              return esp_partition_read(base,at,bytes,n) == ESP_OK;
            },write)) { abort("OTA_PATCH: redownload patch or use full image"); return false; }
      } else if (!write(b.data(),b.size())) { abort("OTA_WRITE: retry on stable power"); return false; }
      received += b.size();
      progress = received * 100 / total;
      return true;
    }
    if (type == "ota_end") {
      uint8_t hash[32], pk[32];
      if (delta) {
        patchDigest.finalize(hash,32);
        if (received != manifest.delta.size || !patcher.complete() || xorr::hex(hash,32) != manifest.delta.sha256) {
          abort("OTA_PATCH: patch hash mismatch"); return false;
        }
      }
      // Recheck BOTH signatures after receiving bytes, before boot selection.
      if (!xorr::unhex(XORR_OTA_PUBLIC_KEY,pk,32) || !manifest.verify(pk)) {
        abort("OTA_SIGNATURE: release verification failed"); return false;
      }
      digest.finalize(hash, 32);
      if (offset != manifest.size || xorr::hex(hash, 32) != manifest.sha256) {
        abort("OTA_HASH: redownload release");
        return false;
      }
      if (esp_ota_end(handle) != ESP_OK) {
        busy = false;
        error = "OTA_IMAGE: use an ESP32-S3 image";
        return false;
      }
      busy = false;
      if (esp_ota_set_boot_partition(target) != ESP_OK) {
        error = "OTA_BOOT: retry update";
        return false;
      }
      progress = 100;
      return true;
    }
    abort("OTA_TYPE: restart update");
    return false;
  }
};
