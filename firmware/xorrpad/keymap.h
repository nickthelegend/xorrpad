#pragma once
#include <ArduinoJson.h>
#include <Preferences.h>
#include "agents.h"

static KeyBind liveKeys[4][4];
static String actionIds[4][4], keyLabels[4][4];
static uint32_t keymapRevision = 0;
inline const KeyBind &keyAt(uint8_t r, uint8_t c) { return liveKeys[r][c]; }
static void defaultKeymap() {
  for (int r=0;r<4;r++) for (int c=0;c<4;c++) {
    liveKeys[r][c]=KEYMAP[r][c];
    actionIds[r][c]=KEYMAP[r][c].role==ROLE_MIC ? "mic" : (KEYMAP[r][c].id ? KEYMAP[r][c].id : "");
    keyLabels[r][c]=KEYMAP[r][c].label ? KEYMAP[r][c].label : "";
  }
}
static bool applyKeymap(JsonVariantConst map, bool persist = true) {
  if (!map["revision"].is<uint32_t>() || !map["keys"].is<JsonArrayConst>() || map["keys"].size()!=14) return false;
  bool seen[4][4]={{false}};
  for (JsonObjectConst k : map["keys"].as<JsonArrayConst>()) {
    if (!k["row"].is<int>() || !k["col"].is<int>()) return false;
    int r=k["row"],c=k["col"];
    if (r<0 || r>3 || c<0 || c>3 || KEYMAP[r][c].role==ROLE_NONE || seen[r][c]) return false;
    seen[r][c]=true;
    const char *a=k["action"],*label=k["label"];
    if (!a || !label || !strlen(a) || strlen(a)>96 || !strlen(label) || strlen(label)>16) return false;
    for (const char *p=a;*p;p++) if (!(isalnum((unsigned char)*p) || strchr("_.:-",*p))) return false;
    for (const char *p=label;*p;p++) if (*p<32 || *p>126) return false;
    const char *controls[]={"mic","kill","yes","no"};
    for (const char *control:controls) if ((String(a)==control)!=(actionIds[r][c]==control)) return false;
  }
  if (persist) {
    String json;serializeJson(map,json);
    Preferences p;if(!p.begin("xorrkeys",false))return false;
    size_t n=p.putString("map",json);p.end();if(n!=json.length())return false;
  }
  for (JsonObjectConst k : map["keys"].as<JsonArrayConst>()) {
    int r=k["row"],c=k["col"];actionIds[r][c]=k["action"].as<String>();keyLabels[r][c]=k["label"].as<String>();
    liveKeys[r][c].id=actionIds[r][c].c_str();liveKeys[r][c].label=keyLabels[r][c].c_str();
    if (liveKeys[r][c].role!=ROLE_MIC && liveKeys[r][c].role!=ROLE_KILL && liveKeys[r][c].role!=ROLE_CONFIRM && liveKeys[r][c].role!=ROLE_REFUSE) liveKeys[r][c].role=ROLE_ACTION;
  }
  keymapRevision=map["revision"].as<uint32_t>();return true;
}
static void loadKeymap() {
  defaultKeymap();Preferences p;p.begin("xorrkeys",true);String json=p.getString("map","");p.end();
  JsonDocument doc;if(!deserializeJson(doc,json))applyKeymap(doc.as<JsonVariantConst>(),false);
}
