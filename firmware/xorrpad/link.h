#pragma once
#include <ArduinoJson.h>
#include <NimBLEDevice.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <mbedtls/base64.h>
#include "config.h"
#include "settings.h"
#include "certs.h"

// BLE callbacks only enqueue bytes; JSON, NVS, HTTP and I2S run on loop().
class PadLink : public NimBLECharacteristicCallbacks {
public:
  typedef void (*Handler)(JsonVariantConst);
  enum Transport { NONE=0, WIFI=1, BLE=2, USB=3 };
  void begin(Settings *settings, Handler handler) {
    _settings=settings;_handler=handler;
    char id[32];snprintf(id,sizeof id,"esp32-%012llx",ESP.getEfuseMac());_device=id;
    snprintf(id,sizeof id,"%08lx",(unsigned long)esp_random());_boot=id;
    _queue=xQueueCreate(32,sizeof(Packet));
    NimBLEDevice::init("xorrpad");NimBLEDevice::setMTU(247);
    _server=NimBLEDevice::createServer();_server->advertiseOnDisconnect(true);
    NimBLEService *service=_server->createService("6e400001-b5a3-f393-e0a9-e50e24dcca9e");
    _tx=service->createCharacteristic("6e400003-b5a3-f393-e0a9-e50e24dcca9e",NIMBLE_PROPERTY::NOTIFY);
    NimBLECharacteristic *rx=service->createCharacteristic("6e400002-b5a3-f393-e0a9-e50e24dcca9e",NIMBLE_PROPERTY::WRITE);
    rx->setCallbacks(this);_tx->setCallbacks(this);service->start();
    auto *ad=NimBLEDevice::getAdvertising();ad->addServiceUUID(service->getUUID());ad->start();
  }
  void onWrite(NimBLECharacteristic *c,NimBLEConnInfo &info) override {
    auto value=c->getValue();Packet p; p.n=min((size_t)512,(size_t)value.size());
    memcpy(p.data,value.data(),p.n);_mtu=info.getMTU();
    if (!_queue || value.size()>512 || xQueueSend(_queue,&p,0)!=pdTRUE) _overflow=true;
  }
  void onSubscribe(NimBLECharacteristic*,NimBLEConnInfo &info,uint16_t sub) override { _subscribed=sub!=0;_mtu=info.getMTU(); }
  Transport active() const {
    uint32_t now=millis();
    if (Serial && _seen[USB] && now-_seen[USB]<15000) return USB;
    if (_subscribed && _server->getConnectedCount() && _seen[BLE] && now-_seen[BLE]<15000) return BLE;
    if (WiFi.isConnected() && _seen[WIFI] && now-_seen[WIFI]<15000) return WIFI;
    return NONE;
  }
  const char *name() const {switch(active()){case USB:return "usb";case BLE:return "ble";case WIFI:return "wifi";default:return "offline";}}
  bool ready() const {return active()!=NONE;}
  String eventId() {return _boot+":"+String(++_sequence);}
  void send(JsonDocument &doc) {doc["v"]=1;String line;serializeJson(doc,line);line+='\n';write(active(),line);}
  void tick() {
    while (Serial.available()) feed(USB,(char)Serial.read());
    if (_overflow) {_overflow=false;_line[BLE]="";_seen[BLE]=0;}
    Packet p;while(_queue && xQueueReceive(_queue,&p,0)==pdTRUE) for(size_t i=0;i<p.n;i++)feed(BLE,p.data[i]);
    if (!_server->getConnectedCount()) {_subscribed=false;_seen[BLE]=0;}
    const uint32_t now=millis();
    if (now-_helloAt>=5000 || !_helloAt) {
      _helloAt=now;JsonDocument doc;doc["v"]=1;doc["type"]="hello";doc["device"]=_device;doc["fw"]=XORR_FW_VERSION;
      auto caps=doc["caps"].to<JsonArray>();for(const char *s:{"keys","voice","tts","signals","keymap"})caps.add(s);
      String line;serializeJson(doc,line);line+='\n';
      if(Serial)write(USB,line);if(_subscribed)write(BLE,line);
      if(active()<BLE) _out+=line;
    }
    if (active()<BLE && WiFi.isConnected() && now-_wifiAt>=1000) {
      _wifiAt=now;
      if(!_out.length())_out="{\"v\":1,\"type\":\"ping\"}\n";
      HTTPClient http;WiFiClient plain;WiFiClientSecure tls;
      String url=String(_settings->backendUrl);while(url.endsWith("/"))url.remove(url.length()-1);url+="/padlink?device="+_device;
      http.setConnectTimeout(1000);http.setTimeout(2000);
      bool ok;
      if(_settings->secure()){tls.setCACert(ISRG_ROOT_X1);ok=http.begin(tls,url);}else ok=http.begin(plain,url);
      if(ok){
        if(_settings->padToken[0])http.addHeader("Authorization",String("Bearer ")+_settings->padToken);
        http.addHeader("Content-Type","application/x-ndjson");
        // Do not replay inputs after an uncertain HTTP result.
        String body=_out;_out="";
        if(http.POST(body)==200){String reply=http.getString();for(size_t i=0;i<reply.length();i++)feed(WIFI,reply[i]);}
        http.end();
      } else _out="";
    }
    if(active()>=BLE)_out="";
  }
  void voice(const int16_t *pcm,size_t samples,bool end) {
    if (!_voiceStream.length()) {_voiceStream=eventId();_voiceSeq=0;}
    unsigned char encoded[689];size_t n=0;
    mbedtls_base64_encode(encoded,sizeof encoded,&n,(const unsigned char*)pcm,samples*2);encoded[n]=0;
    JsonDocument d;d["type"]="voice";d["id"]=eventId();d["stream"]=_voiceStream;d["seq"]=_voiceSeq++;d["end"]=end;d["sampleRate"]=16000;d["pcm"]=(char*)encoded;send(d);
    if(end)_voiceStream="";
  }
  void newVoice() {_voiceStream="";}
private:
  struct Packet {size_t n;char data[512];};
  QueueHandle_t _queue=nullptr;volatile bool _overflow=false,_subscribed=false;volatile uint16_t _mtu=23;
  NimBLEServer *_server=nullptr;NimBLECharacteristic *_tx=nullptr;
  Settings *_settings=nullptr;Handler _handler=nullptr;
  String _device,_boot,_line[4],_out,_voiceStream;bool _discard[4]={false};
  uint32_t _seen[4]={0},_helloAt=0,_wifiAt=0,_sequence=0,_voiceSeq=0;
  void write(Transport via,const String &line) {
    if(line.length()>4096)return;
    if(via==USB){Serial.print(line);return;}
    if(via==BLE && _subscribed){
      size_t chunk=max(20,(int)_mtu-3);
      for(size_t i=0;i<line.length();i+=chunk){
        size_t n=min(chunk,line.length()-i);
        bool ok=false;for(int retry=0;retry<10 && !ok;retry++){ok=_tx->notify((const uint8_t*)line.c_str()+i,n);if(!ok)delay(5);}
        if(!ok){_seen[BLE]=0;break;}delay(3);
      }return;
    }
    if(via==WIFI && _out.length()+line.length()<=65536)_out+=line;
  }
  void feed(Transport via,char ch) {
    if(ch=='\r')return;
    if(ch!='\n'){
      if(_discard[via])return;
      if(_line[via].length()>=4095){_line[via]="";_discard[via]=true;}else _line[via]+=ch;
      return;
    }
    if(_discard[via]){_discard[via]=false;return;}
    String line=_line[via];_line[via]="";
    JsonDocument d;if(deserializeJson(d,line) || d["v"]!=1)return;
    String type=d["type"] | "";
    if(type=="ping"){_helloAt=0;return;}
    if(type!="caps" && type!="status" && type!="signal" && type!="signal_state" && type!="receipt" && type!="tts" && type!="keymap" && type!="result")return;
    _seen[via]=millis();if(active()!=via)return;
    if(_handler)_handler(d.as<JsonVariantConst>());
  }
};
