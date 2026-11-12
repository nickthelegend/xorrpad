#pragma once
#include "safety.h"
#include <ArduinoJson.h>
namespace xorr {
struct LayerMap {
  uint32_t revision = 0;
  std::vector<Binding> keys;
};
struct StoredProfile {
  std::string name;
  std::array<LayerMap,3> layers;
};
inline bool readLayer(JsonVariantConst d, LayerMap &out) {
  if (!d.is<JsonObjectConst>() || !d["revision"].is<uint32_t>() ||
      !d["keys"].is<JsonArrayConst>() || d["keys"].size()!=14) return false;
  LayerMap next; next.revision=d["revision"];
  for (auto k:d["keys"].as<JsonArrayConst>()) {
    if (!k["row"].is<int>() || !k["col"].is<int>() ||
        !k["action"].is<const char *>() || !k["label"].is<const char *>()) return false;
    next.keys.push_back({k["row"],k["col"],k["action"],k["label"]});
  }
  if (!validBindings(next.keys)) return false;
  out=std::move(next); return true;
}
inline void writeLayer(JsonVariant d, const LayerMap &map) {
  d["revision"]=map.revision;
  auto keys=d["keys"].to<JsonArray>();
  for (const auto &b:map.keys) {
    auto k=keys.add<JsonObject>(); k["row"]=b.row; k["col"]=b.col;
    k["action"]=b.action; k["label"]=b.label;
  }
}
inline bool profileName(const std::string &s) {
  if(s.empty() || s.size()>20)return false;
  for(unsigned char c:s)if(c<32 || c>126)return false;
  return true;
}
struct ProfileSnapshot {
  std::vector<StoredProfile> profiles;
  uint8_t active=0, layer=0;
  bool valid() const {
    if(profiles.empty() || profiles.size()>8 || active>=profiles.size() || layer>2)return false;
    for(size_t i=0;i<profiles.size();++i) {
      if(!profileName(profiles[i].name))return false;
      for(size_t j=0;j<i;++j)if(profiles[i].name==profiles[j].name)return false;
      for(const auto &l:profiles[i].layers)if(!validBindings(l.keys))return false;
    }
    return true;
  }
  std::string serialize() const {
    if(!valid())return "";
    JsonDocument d;d["v"]=1;d["active"]=active;d["layer"]=layer;
    for(const auto &p:profiles) {
      auto item=d["profiles"].add<JsonObject>();item["name"]=p.name;
      for(const auto &l:p.layers)writeLayer(item["layers"].add<JsonObject>(),l);
    }
    std::string out;serializeJson(d,out);return out;
  }
  static bool parse(const std::string &json, ProfileSnapshot &out) {
    if(json.empty() || json.size()>65536)return false;
    JsonDocument d;
    if(deserializeJson(d,json) || d["v"]!=1 || !d["active"].is<uint8_t>() ||
        !d["layer"].is<uint8_t>() || !d["profiles"].is<JsonArrayConst>() ||
        d["profiles"].size()>8)return false;
    ProfileSnapshot next;next.active=d["active"];next.layer=d["layer"];
    for(auto p:d["profiles"].as<JsonArrayConst>()) {
      if(!p["name"].is<const char *>() || !p["layers"].is<JsonArrayConst>() ||
          p["layers"].size()!=3)return false;
      StoredProfile item;item.name=p["name"].as<std::string>();
      for(int i=0;i<3;++i)if(!readLayer(p["layers"][i],item.layers[i]))return false;
      next.profiles.push_back(std::move(item));
    }
    if(!next.valid())return false;
    out=std::move(next);return true;
  }
};
// A complete set of 3*N maps is staged in RAM. Persist the candidate as one
// NVS blob, then commit; a reboot or partial sync keeps the previous snapshot.
class ProfileSync {
  ProfileSnapshot pending;
  bool received[8][3] = {};
public:
  void cancel() { pending={}; for(auto &p:received)for(auto &l:p)l=false; }
  bool begin(JsonVariantConst names) {
    cancel();
    if(!names.is<JsonArrayConst>() || !names.size() || names.size()>8)return false;
    for(auto n:names.as<JsonArrayConst>()) {
      if(!n.is<const char *>()) {cancel();return false;}
      StoredProfile p;p.name=n.as<std::string>();
      if(!profileName(p.name)) {cancel();return false;}
      for(const auto &old:pending.profiles)if(old.name==p.name) {cancel();return false;}
      pending.profiles.push_back(std::move(p));
    }
    return true;
  }
  bool map(JsonVariantConst d) {
    if(!d["profile"].is<unsigned>() || !d["layer"].is<unsigned>())return false;
    unsigned i=d["profile"],l=d["layer"];
    if(i>=pending.profiles.size() || l>2)return false;
    LayerMap next;if(!readLayer(d["map"],next))return false;
    pending.profiles[i].layers[l]=std::move(next);received[i][l]=true;return true;
  }
  bool ready() const {
    if(pending.profiles.empty())return false;
    for(size_t i=0;i<pending.profiles.size();++i)for(int l=0;l<3;++l)if(!received[i][l])return false;
    return true;
  }
  ProfileSnapshot candidate(const ProfileSnapshot &old) const {
    if(!ready())return {};
    auto next=pending;
    if(old.valid())for(size_t i=0;i<next.profiles.size();++i)
      if(next.profiles[i].name==old.profiles[old.active].name) {next.active=i;next.layer=old.layer;break;}
    return next;
  }
};
}
