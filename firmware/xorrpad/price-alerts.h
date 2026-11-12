#pragma once
#include "logic/price-alerts.h"
#include "certs.h"
#include "padstate.h"
#include <Preferences.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>
// Network work runs off the key-scan task. Queues carry values, never shared JSON.
class PriceAlerts {
  struct Job {uint32_t revision;char mints[8][45];size_t count;};
  struct Result {uint32_t revision;bool ok;int status;xorr::prices::Quote quotes[8];};
  QueueHandle_t jobs=nullptr,results=nullptr;
  uint32_t revision=0;bool busy=false,clockStarted=false; xorr::prices::Poll poll;
  std::vector<xorr::prices::Alert> alerts;
  static void worker(void *arg){auto self=static_cast<PriceAlerts*>(arg);Job job;
    for(;;)if(xQueueReceive(self->jobs,&job,portMAX_DELAY)==pdTRUE){
      Result result{};result.revision=job.revision;String url="https://api.jup.ag/price/v3?ids=";
      for(size_t i=0;i<job.count;++i){if(i)url+=",";url+=job.mints[i];}
      WiFiClientSecure tls;tls.setCACert(JUPITER_ROOT_CA);tls.setHandshakeTimeout(5);
      HTTPClient http;http.setConnectTimeout(5000);http.setTimeout(5000);
      http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
      // HTTP/1.0 avoids chunked bodies; streaming below bounds RAM even with a lying Content-Length.
      http.useHTTP10(true);
      if(http.begin(tls,url)){
        http.addHeader("Cache-Control","no-cache");result.status=http.GET();
        if(result.status==200 && http.getSize()<=16384){
          std::string body;auto stream=http.getStreamPtr();uint32_t started=millis();
          int expected=http.getSize();
          while(millis()-started<5000 && body.size()<=16384 && (http.connected() || stream->available())){
            while(stream->available() && body.size()<=16384)body.push_back(char(stream->read()));
            if(expected>=0 && body.size()>=size_t(expected))break;vTaskDelay(1);
          }
          JsonDocument d;
          result.ok=body.size()<=16384 && !deserializeJson(d,body);
          if(result.ok)for(size_t i=0;i<job.count;++i)xorr::prices::quote(d,job.mints[i],result.quotes[i]);
        }
        http.end();
      }
      xQueueSend(self->results,&result,portMAX_DELAY);
    }
  }
  bool save(const std::vector<xorr::prices::Alert> &next){
    JsonDocument d;xorr::prices::json(d.to<JsonArray>(),next);String text;serializeJson(d,text);
    Preferences p;if(!p.begin("xorralerts",false))return false;
    bool ok=p.putString("rules",text)==text.length();p.end();return ok;
  }
public:
  void begin(){
    Preferences p;if(p.begin("xorralerts",true)){String raw=p.getString("rules","[]");p.end();JsonDocument d;if(!deserializeJson(d,raw))xorr::prices::parse(d,alerts,true);}
    jobs=xQueueCreate(1,sizeof(Job));results=xQueueCreate(1,sizeof(Result));
    if(jobs && results){TaskHandle_t task=nullptr;if(xTaskCreate(worker,"price-alerts",12288,this,1,&task)!=pdPASS){vQueueDelete(jobs);vQueueDelete(results);jobs=results=nullptr;}}
  }
  bool message(JsonVariantConst d,bool secure,JsonDocument &out){
    if(d["type"]!="price_alerts")return false;
    out["type"]="price_alerts_state";out["requestId"]=d["requestId"];out["ok"]=false;
    if(!secure || !jobs){out["error"]="Setup required: paired link and alert worker";return true;}
    if(!d["alerts"].isNull()){
      std::vector<xorr::prices::Alert> next;
      if(!xorr::prices::parse(d["alerts"],next) || !save(next)){out["error"]="Invalid alerts or NVS write failed";return true;}
      alerts=std::move(next);++revision;
    }
    out["ok"]=true;xorr::prices::json(out["alerts"].to<JsonArray>(),alerts);return true;
  }
  bool tick(bool desk,bool wifi,bool idle,PadState &pad){
    pad.alertsOnly=!desk && wifi && !alerts.empty();
    if(wifi && !clockStarted){configTime(0,0,"time.cloudflare.com","pool.ntp.org");clockStarted=true;}
    if(pad.alertsOnly && time(nullptr)<1700000000)pad.alertNotice="Waiting for network time / TLS";
    idle=idle && time(nullptr)>=1700000000;
    Result result{};bool fired=false;
    if(results && xQueueReceive(results,&result,0)==pdTRUE){
      busy=false;
      if(result.revision==revision && !desk && wifi && idle){
        if(!result.ok)pad.alertNotice=result.status==401?"Setup required: Jupiter Price API access":"Price unavailable / TLS or network error";
        else for(size_t i=0;i<alerts.size();++i){
          auto q=result.quotes[i];if(!q.block)continue;
          if(xorr::prices::hit(alerts[i],q)){
            auto next=alerts;next[i].fired=true;
            if(save(next)){alerts=std::move(next);pad.alertNotice=String(alerts[i].id.c_str())+" $"+String(q.usd,6);pad.alertUntil=millis()+10000;fired=true;}
            else pad.alertNotice="Alert storage failed";
          }
          alerts[i].block=std::max(alerts[i].block,q.block);
        }
      }
    }
    if(jobs && !busy && !alerts.empty() && poll.due(millis(),desk,wifi,idle)){
      bool active=false;Job job{};job.revision=revision;job.count=alerts.size();
      for(size_t i=0;i<alerts.size();++i){active|=!alerts[i].fired;strlcpy(job.mints[i],alerts[i].mint.c_str(),45);}
      if(active){poll.attempt(millis());busy=xQueueSend(jobs,&job,0)==pdTRUE;}
    }
    return fired;
  }
};
