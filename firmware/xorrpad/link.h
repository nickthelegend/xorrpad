#pragma once
#include <ArduinoJson.h>
#ifndef CONFIG_BT_NIMBLE_SM_SC_ONLY
#define CONFIG_BT_NIMBLE_SM_SC_ONLY 1
#endif
#include "certs.h"
#include "config.h"
#include "secure.h"
#include "attestation.h"
#include "logic/link-policy.h"
#include "settings.h"
#include <HTTPClient.h>
#include <NimBLEDevice.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <mbedtls/base64.h>
#include "logic/voice.h"

// BLE callbacks only enqueue bytes; JSON, NVS, HTTP and I2S run on loop().
class PadLink : public NimBLECharacteristicCallbacks,
                public NimBLEServerCallbacks {
public:
  typedef void (*Handler)(JsonVariantConst);
  enum Transport { NONE = 0, WIFI = 1, BLE = 2, USB = 3 };
  secure::Identity identity;
  secure::Attestation attestation;
  bool factoryProvisioning = false;
  bool legacy = false, killed = false;
  volatile bool blePairing = false;
  uint32_t onPassKeyDisplay() override {
    blePairing = true;
    return identity.code.toInt();
  }
  bool idle() const {
    auto via = active();
    return via != NONE && _sessions[via].queue.empty() &&
           !_sessions[via].pending.size();
  }
  uint32_t connectionEpoch() const {return _connectionEpoch;}
  bool secureReady() const {
    return active() != NONE && _sessions[active()].established;
  }
  void begin(Settings *settings, Handler handler) {
    NimBLEDevice::init(
        "xorrpad"); // Start radio entropy before generating identity keys.
    ble_hs_cfg.sm_sc_only = 1;
    if (!identity.begin())
      return;
    attestation.begin(identity);
    Preferences cfg;
    cfg.begin("xorrv2", true);
    legacy = cfg.getBool("legacy", false);
    cfg.end();
    _settings = settings;
    _handler = handler;
    char id[32];
    snprintf(id, sizeof id, "esp32-%012llx", ESP.getEfuseMac());
    _device = id;
    snprintf(id, sizeof id, "%08lx", (unsigned long)esp_random());
    _boot = id;
    _queue = xQueueCreate(32, sizeof(Packet));
    NimBLEDevice::setMTU(247);
    NimBLEDevice::setSecurityAuth(true, true, true);
    NimBLEDevice::setSecurityIOCap(BLE_HS_IO_DISPLAY_ONLY);
    NimBLEDevice::setSecurityPasskey(identity.code.toInt());
    _server = NimBLEDevice::createServer();
    _server->setCallbacks(this, false);
    _server->advertiseOnDisconnect(true);
    NimBLEService *service =
        _server->createService("6e400001-b5a3-f393-e0a9-e50e24dcca9e");
    _tx = service->createCharacteristic("6e400003-b5a3-f393-e0a9-e50e24dcca9e",
                                        NIMBLE_PROPERTY::NOTIFY | NIMBLE_PROPERTY::READ_ENC |
                                            NIMBLE_PROPERTY::READ_AUTHEN);
    NimBLECharacteristic *rx = service->createCharacteristic(
        "6e400002-b5a3-f393-e0a9-e50e24dcca9e",
        NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_ENC |
            NIMBLE_PROPERTY::WRITE_AUTHEN);
    rx->setCallbacks(this);
    _tx->setCallbacks(this);
    service->start();
    auto *ad = NimBLEDevice::getAdvertising();
    ad->addServiceUUID(service->getUUID());
    ad->start();
  }
  void onConnect(NimBLEServer *server, NimBLEConnInfo &info) override {
    if (server->getConnectedCount() > 1)
      server->disconnect(info.getConnHandle());
  }
  void onAuthenticationComplete(NimBLEConnInfo &info) override {
    blePairing = false;
    if (!info.isEncrypted() || !info.isAuthenticated() ||
        info.getSecKeySize() != 16)
      _server->disconnect(info.getConnHandle());
    else
      _subscribed = _subscribeRequested;
  }
  void onWrite(NimBLECharacteristic *c, NimBLEConnInfo &info) override {
    if (!info.isEncrypted() || !info.isAuthenticated())
      return;
    auto value = c->getValue();
    Packet p;
    p.n = min((size_t)512, (size_t)value.size());
    memcpy(p.data, value.data(), p.n);
    _mtu = info.getMTU();
    if (!_queue || value.size() > 512 || xQueueSend(_queue, &p, 0) != pdTRUE)
      _overflow = true;
  }
  void onSubscribe(NimBLECharacteristic *, NimBLEConnInfo &info,
                   uint16_t sub) override {
    _subscribeRequested = sub != 0;
    _subscribed = _subscribeRequested && info.isEncrypted() && info.isAuthenticated();
    if (_subscribeRequested && !_subscribed)
      NimBLEDevice::startSecurity(info.getConnHandle());
    _mtu = info.getMTU();
  }
  Transport active() const {
    bool usable[4] = {false, WiFi.isConnected() && eligible(WIFI),
                       _subscribed && _server && _server->getConnectedCount() && eligible(BLE),
                       bool(Serial) && eligible(USB)};
    return (Transport)xorr::preferredTransport(millis(), _seen, usable);
  }
  const char *name() const {
    switch (active()) {
    case USB:
      return "usb";
    case BLE:
      return "ble";
    case WIFI:
      return "wifi";
    default:
      return "offline";
    }
  }
  bool ready() const { return active() != NONE; }
  String eventId() { return _boot + ":" + String(++_sequence); }
  // A kill supersedes unsent inputs and retries; keep sequence counters intact.
  void stopInputs() {
    killed = true;
    for (auto &s : _sessions) { s.queue.clear(); s.pending.clear(); }
    _out = "";
    newVoice();
  }
  bool send(JsonDocument &doc) {
    String type = doc["type"] | "";
    if (killed && (type == "knob" || type == "voice" ||
        (type == "key" && doc["action"] != "kill"))) return false;
    Transport via = active();
    if (via == NONE)
      return false;
    if (_sessions[via].established) {
      String payload;
      serializeJson(doc, payload);
      auto &s = _sessions[via];
      if(s.queue.size()>=32)return false;
      s.queue.push_back(payload);
      flush(via);
      return true;
    }
    if (legacy) {
      doc["v"] = 1;
      String line;
      serializeJson(doc, line);
      line += '\n';
      write(via, line);
      return true;
    }
    return false;
  }
  void tick() {
    if (!_server || !identity.ok)
      return;
    Transport chosen = active();
    if (chosen != _previous) {
      _out = "";
      for (int i = 1; i < 4; i++)
        if (i != chosen) {
          _sessions[i].queue.clear();
          _sessions[i].pending.clear();
        }
      _previous = chosen;
    }
    while (Serial.available())
      feed(USB, (char)Serial.read());
    if (_overflow) {
      _overflow = false;
      _line[BLE] = "";
      _seen[BLE] = 0;
      _sessions[BLE].reset();
    }
    Packet p;
    while (_queue && xQueueReceive(_queue, &p, 0) == pdTRUE)
      for (size_t i = 0; i < p.n; i++)
        feed(BLE, p.data[i]);
    if (!_server->getConnectedCount()) {
      _subscribed = false;
      _subscribeRequested = false;
      blePairing = false;
      _seen[BLE] = 0;
    }
    const uint32_t now = millis();
    for (int i = 1; i < 4; i++) {
      bool disconnected = (i == USB && !Serial) ||
                          (i == BLE && !_subscribed) ||
                          (i == WIFI && !WiFi.isConnected());
      if (disconnected || (_seen[i] && now - _seen[i] >= 15000)) {
        _seen[i] = 0;
        _sessions[i].reset();
        _line[i] = "";
        continue;
      }
      if (_sessions[i].offered && !_sessions[i].established && now - _sessions[i].at >= 10000)
        _sessions[i].reset();
      String retry = _sessions[i].retry();
      if (retry.length())
        write((Transport)i, retry);
      if (!_sessions[i].established && !legacy) _seen[i] = 0;
      flush((Transport)i);
    }
    if (now - _helloAt >= 5000 || !_helloAt) {
      _helloAt = now;
      for (int i = 1; i < 4; i++) {
        Transport via = (Transport)i;
        if (via == USB && !Serial)
          continue;
        if (via == BLE && !_subscribed)
          continue;
        if (via == WIFI && !WiFi.isConnected())
          continue;
        if (legacy && !_sessions[i].offered) {
          JsonDocument old;
          old["v"] = 1;
          old["type"] = "hello";
          old["device"] = identity.device;
          old["fw"] = "1.0.0";
          String legacyLine;
          serializeJson(old, legacyLine);
          write(via, legacyLine + '\n');
        }
        if (_sessions[i].established) {
          JsonDocument ping;
          ping["type"] = "ping";
          write(via, _sessions[i].seal(ping, via == USB, false));
          continue;
        }
        JsonDocument doc;
        doc["v"] = 2;
        doc["type"] = "hello";
        doc["device"] = identity.device;
        doc["fw"] = XORR_FW_VERSION;
        doc["pk"] = secure::hex(identity.epub, 32);
        doc["xpk"] = secure::hex(identity.xpub, 32);
        doc["nonce"] = _sessions[i].nonce();
        write(via, secure::line(doc, via == USB));
      }
    }

    if (WiFi.isConnected() && now - _wifiAt >= _wifiDelay) {
      _wifiAt = now;
      if (!_out.length())
        return;
      HTTPClient http;
      WiFiClient plain;
      WiFiClientSecure tls;
      String url = String(_settings->backendUrl);
      while (url.endsWith("/"))
        url.remove(url.length() - 1);
      url += "/padlink?device=" + _device;
      http.setConnectTimeout(1000);
      http.setTimeout(2000);
      bool ok;
      if (_settings->secure()) {
        tls.setCACert(ISRG_ROOT_X1);
        ok = http.begin(tls, url);
      } else
        ok = http.begin(plain, url);
      if (ok) {
        http.addHeader("X-Xorr-Protocol", "2");
        if (legacy && _settings->padToken[0])
          http.addHeader("Authorization",
                         String("Bearer ") + _settings->padToken);
        http.addHeader("Content-Type", "application/x-ndjson");
        // Do not replay inputs after an uncertain HTTP result.
        String body = _out;
        _out = "";
        if (http.POST(body) == 200) {
          String reply = http.getString();
          for (size_t i = 0; i < reply.length(); i++)
            feed(WIFI, reply[i]);
          if (_seen[WIFI]) {
            _wifiDelay = 1000;
            _wifiFailures = 0;
          } else
            _wifiDelay = xorr::backoff(++_wifiFailures);
        } else
          _wifiDelay = xorr::backoff(++_wifiFailures);
        http.end();
      } else
      {
        _out = "";
        _wifiDelay = xorr::backoff(++_wifiFailures);
      }
    }
  }
  bool voice(const int16_t *pcm, size_t samples, bool end) {
    if (!ready() || killed) return false;
    if (!_voiceStream.length()) {_voiceStream=eventId();_voiceSeq=0;}
    const bool opus = secureReady();
    auto emit = [&](const uint8_t *data, size_t n) {
      auto via=active();
      if(via==NONE || (_sessions[via].established && _sessions[via].queue.size()>=32)) return false;
      JsonDocument d;d["type"]="voice";d["id"]=eventId();
      d["stream"]=_voiceStream;d["seq"]=_voiceSeq++;d["end"]=false;
      d["sampleRate"]=xorr::voiceRate;d["codec"]="opus";
      d["data"]=secure::b64(data,n);send(d);return true;
    };
    if(opus && !_voiceEncoder.push(pcm,samples,end,emit)) return false;
    if(!opus && active()==BLE) return false;
    if(!opus || end) {
      auto via=active();
      if(via==NONE || (_sessions[via].established && _sessions[via].queue.size()>=32)) return false;
      JsonDocument d;d["type"]="voice";d["id"]=eventId();
      d["stream"]=_voiceStream;d["seq"]=_voiceSeq++;d["end"]=end;
      d["sampleRate"]=xorr::voiceRate;
      if(opus) {d["codec"]="opus";d["data"]="";}
      else d["pcm"]=secure::b64((const uint8_t*)pcm,samples*2);
      send(d);
    }
    if(end) _voiceStream="";
    return true;
  }
  bool newVoice() {
    _voiceStream="";
    return !secureReady() || _voiceEncoder.reset();
  }

private:
  bool eligible(Transport via) const {
    return _sessions[via].established || (legacy && !_sessions[via].offered);
  }
  uint32_t _connectionEpoch=0;
  Transport _previous = NONE;
  uint32_t _attestWindow=0;unsigned _attestAttempts=0;
  secure::Session _sessions[4];
  void flush(Transport via) {
    auto &s = _sessions[via];
    if (!s.established || s.pending.size() || s.queue.empty())
      return;
    JsonDocument d;
    if (deserializeJson(d, s.queue.front())) {
      s.queue.pop_front();
      return;
    }
    s.queue.pop_front();
    write(via, s.seal(d, via == USB));
  }
  xorr::VoiceEncoder _voiceEncoder;
  struct Packet {
    size_t n;
    char data[512];
  };
  QueueHandle_t _queue = nullptr;
  volatile bool _overflow = false, _subscribed = false, _subscribeRequested = false;
  volatile uint16_t _mtu = 23;
  NimBLEServer *_server = nullptr;
  NimBLECharacteristic *_tx = nullptr;
  Settings *_settings = nullptr;
  Handler _handler = nullptr;
  String _device, _boot, _line[4], _out, _voiceStream;
  bool _discard[4] = {false};
  uint32_t _seen[4] = {0}, _pairWindow = 0, _pairAttempts = 0,
           _wifiDelay = 1000, _wifiFailures = 0, _helloAt = 0, _wifiAt = 0,
           _sequence = 0, _voiceSeq = 0;
  void write(Transport via, const String &line) {
    if (line.length() > 4096)
      return;
    if (via == USB) {
      Serial.print(line);
      return;
    }
    if (via == BLE && _subscribed) {
      size_t chunk = max(20, (int)_mtu - 3);
      for (size_t i = 0; i < line.length(); i += chunk) {
        size_t n = min(chunk, line.length() - i);
        bool ok = false;
        for (int retry = 0; retry < 10 && !ok; retry++) {
          ok = _tx->notify((const uint8_t *)line.c_str() + i, n);
          if (!ok)
            delay(5);
        }
        if (!ok) {
          _seen[BLE] = 0;
          break;
        }
        delay(3);
      }
      return;
    }
    if (via == WIFI && _out.length() + line.length() <= 65536)
      _out += line;
  }
  void feed(Transport via, char ch) {
    if (ch == '\r')
      return;
    if (ch != '\n') {
      if (_discard[via])
        return;
      if (_line[via].length() >= 4095) {
        _line[via] = "";
        _discard[via] = true;
      } else
        _line[via] += ch;
      return;
    }
    if (_discard[via]) {
      _discard[via] = false;
      return;
    }
    String line = _line[via];
    _line[via] = "";
    JsonDocument d;
    if (deserializeJson(d, line))
      return;
    auto &session = _sessions[via];
    String type = d["type"] | "";
    if (d["v"] == 2) {
      // Independent phone-origin liveness proof. Public, domain-separated and BLE-only.
      if(type=="attest_request"&&via==BLE){
        if(millis()-_attestWindow>=60000){_attestWindow=millis();_attestAttempts=0;}
        if(_attestAttempts>=4)return;
        auto context=xorr::phoneAttestationContext(identity.device.c_str(),xorr::hex(identity.xpub,32),session.nonce().c_str(),d.as<JsonVariantConst>());
        if(context.empty())return;
        ++_attestAttempts;JsonDocument proof;proof["v"]=2;proof["type"]="attest_response";
        attestation.proof(identity,proof,context);
        // The pairing proof uses attestationSignature; the phone verifier has a single signature field.
        if(proof["attestationSignature"].is<const char*>()){proof["signature"]=proof["attestationSignature"];proof.remove("attestationSignature");}
        write(BLE,secure::line(proof,false));return;
      }
      // Physical factory boot chord + USB only; no network provisioning path.
      if (type == "factory_cert" && via == USB && factoryProvisioning &&
          secure::check(d, true)) {
        JsonDocument result;
        result["v"] = 2; result["type"] = "factory_cert_result";
        result["ok"] = attestation.provision(identity, d["certificate"]);
        write(USB, secure::line(result, true));
        return;
      }
      if (type == "pair" && !session.established && !session.offered) {
        if (millis() - _pairWindow >= 60000) {
          _pairWindow = millis();
          _pairAttempts = 0;
        }
        if (_pairAttempts >= 5)
          return;
        _pairAttempts++;
        if (!secure::check(d, via == USB))
          return;
        String signature;
        if (!session.pair(identity, d.as<JsonVariantConst>(), signature))
          return;
        JsonDocument proof;
        proof["v"] = 2;
        proof["type"] = "pair_proof";
        proof["signature"] = signature;
        attestation.proof(identity, proof, session.pairingContext);
        write(via, secure::line(proof, via == USB));
        return;
      }
      JsonDocument plain;
      int result = session.open(d, plain, via == USB);
      if (!result)
        return;
      if (result == 2) {
        JsonDocument ack;
        ack["type"] = "ack";
        write(via, session.seal(ack, via == USB, false));
        return;
      }
      type = plain["type"] | "";
      _seen[via] = millis();
      if (type != "ack") {
        JsonDocument ack;
        ack["type"] = "ack";
        write(via, session.seal(ack, via == USB, false));
      }
      if (type == "ready") {
        session.established = true;
        ++_connectionEpoch;
        JsonDocument ready;
        ready["type"] = "ready";
        ready["killed"] = killed;
        write(via, session.seal(ready, via == USB));
      }
      flush(via);
      if (type == "ack" || type == "ping")
        return;
      if (type == "config" || type == "ready") {
        legacy = plain["legacyV1"] | false;
        Preferences cfg;
        cfg.begin("xorrv2", false);
        cfg.putBool("legacy", legacy);
        cfg.end();
      }
      if (active() == via && _handler)
        _handler(plain.as<JsonVariantConst>());
      return;
    }
    if (!legacy || session.established || d["v"] != 1)
      return;
    if (type == "ping") {
      _helloAt = 0;
      return;
    }
    if (type != "caps" && type != "status" && type != "signal" &&
        type != "signal_state" && type != "receipt" && type != "tts" &&
        type != "keymap" && type != "result")
      return;
    _seen[via] = millis();
    if (active() != via)
      return;
    if (_handler)
      _handler(d.as<JsonVariantConst>());
  }
};
