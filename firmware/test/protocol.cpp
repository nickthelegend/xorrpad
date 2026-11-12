#include "doctest.h"
#include "../xorrpad/logic/protocol.h"
#include "../xorrpad/logic/link-policy.h"
using namespace xorr;
namespace {
struct Sessions {
  FrameSession a, b;
  Sessions() { uint8_t x[32], y[32]; memset(x, 0x11, 32); memset(y, 0x22, 32); a.keys(x,y); b.keys(y,x); }
  std::string send(FrameSession &s, const char *type, bool serial = false, uint32_t now = 0) {
    JsonDocument d; d["type"] = type; return s.seal(d,serial,now);
  }
  int read(FrameSession &s, const std::string &line, bool serial = false) {
    JsonDocument f,p;
    if (deserializeJson(f,line)) return 0;
    return s.open(f,p,serial);
  }
};
}
TEST_CASE("native real AEAD frame and CRC round trip") {
  Sessions s;
  auto line=s.send(s.a,"signal",true);
  REQUIRE(!line.empty()); CHECK(s.read(s.b,line,true)==1);
  CHECK(s.b.received==1);
  CHECK(s.read(s.a,s.send(s.b,"ack",true),true)==1);
  CHECK(s.a.pending.empty());
}
TEST_CASE("replay authenticates before execution or ack mutation") {
  Sessions s;
  auto line=s.send(s.a,"signal");
  CHECK(s.read(s.b,line)==1); CHECK(s.read(s.b,line)==2);
  JsonDocument f,p; deserializeJson(f,line); f["ack"]=1;
  CHECK(s.b.open(f,p,false)==0);
  CHECK(s.b.received==1);
}
TEST_CASE("lost data can arrive after ack and heartbeat without being cumulatively acknowledged") {
  Sessions s;
  auto data=s.send(s.a,"key");
  auto ack=s.send(s.a,"ack"); auto ping=s.send(s.a,"ping");
  CHECK(s.read(s.b,ack)==1); CHECK(s.read(s.b,ping)==1);
  CHECK(s.b.received==0);
  CHECK(s.read(s.a,s.send(s.b,"ack"))==1);
  CHECK_FALSE(s.a.pending.empty());
  CHECK(s.read(s.b,s.a.retry(250))==1);
  CHECK(s.read(s.b,data)==2);
  CHECK(s.read(s.a,s.send(s.b,"ack"))==1);
  CHECK(s.a.pending.empty());
}
TEST_CASE("lost ack retried data is acknowledged again without executing twice") {
  Sessions s;
  auto data=s.send(s.a,"key");
  REQUIRE(s.read(s.b,data)==1);
  s.send(s.b,"ack"); // dropped
  CHECK(s.read(s.b,s.a.retry(250))==2);
  CHECK(s.read(s.a,s.send(s.b,"ack"))==1);
  CHECK(s.a.pending.empty());
}
TEST_CASE("tamper body tag CRC and seq fail without advancing state") {
  for (const char *field : {"body","tag","crc","seq"}) {
    Sessions s; JsonDocument f,p;
    deserializeJson(f,s.send(s.a,"key",true));
    if (!strcmp(field,"seq")) f[field]=2;
    else f[field]="bad";
    CHECK(s.b.open(f,p,true)==0); CHECK(s.b.received==0);
  }
}
TEST_CASE("retry exact bytes exponential cap and bounded exhaustion") {
  Sessions s; auto line=s.send(s.a,"key");
  CHECK(s.a.retry(249).empty());
  CHECK(s.a.retry(250)==line); CHECK(s.a.retry(749).empty());
  CHECK(s.a.retry(750)==line);
  uint32_t now=750;
  for(unsigned tries=2; tries<6; ++tries) {now+=backoff(tries); CHECK(s.a.retry(now)==line);}
  CHECK_FALSE(s.a.exhausted(now));
  now+=backoff(6); CHECK(s.a.exhausted(now)); CHECK(s.a.retry(now).empty());
}
TEST_CASE("single reliable slot and sequence exhaustion never reuse a nonce") {
  Sessions s; REQUIRE(!s.send(s.a,"key").empty());
  CHECK(s.send(s.a,"key").empty()); CHECK(s.a.sent==1);
  CHECK_FALSE(s.send(s.a,"ping").empty());
  s.a.sent=0xffffffffu; CHECK(s.send(s.a,"ack").empty());
}
TEST_CASE("invalid JSON payload cannot clear pending ack") {
  Sessions s; s.send(s.b,"key");
  JsonDocument d; d["x"]="missing type";
  auto line=s.a.seal(d,false,0); CHECK(s.read(s.b,line)==0);
  CHECK_FALSE(s.b.pending.empty()); CHECK(s.b.received==0);
}
TEST_CASE("replay window bounded and accepts unseen control gaps") {
  ReplayWindow r; CHECK_FALSE(r.accept(0)); CHECK(r.accept(2)); CHECK(r.accept(1));
  CHECK_FALSE(r.accept(1)); CHECK(r.accept(65)); CHECK_FALSE(r.accept(1));
  CHECK(r.accept(64)); CHECK_FALSE(r.accept(64));
}
TEST_CASE("base64 decoder rejects noncanonical padding and oversize") {
  for(const auto &s: {"A", "AA=A", "AB==", "AAB=", "????", "===="}) {
    std::vector<uint8_t> out; CHECK_FALSE(unbase64(s,out));
  }
  std::vector<uint8_t> out; CHECK_FALSE(unbase64(std::string(5468,'A'),out));
}
TEST_CASE("heartbeat retry arithmetic survives millisecond wrap") {
  Sessions s; auto line=s.send(s.a,"key",false,0xffffff80u);
  CHECK(s.a.retry(100).empty()); CHECK(s.a.retry(122)==line);
}

TEST_CASE("link failover USB BLE Wi-Fi and watchdog preserve priority across timer wrap") {
  uint32_t seen[4] = {0, 1, 1, 1}; bool usable[4] = {false, true, true, true};
  CHECK(preferredTransport(15000,seen,usable)==3);
  usable[3]=false; CHECK(preferredTransport(15000,seen,usable)==2);
  usable[2]=false; CHECK(preferredTransport(15000,seen,usable)==1);
  CHECK(preferredTransport(15001,seen,usable)==0);
  seen[1]=0xfffffff0u; CHECK(preferredTransport(10,seen,usable)==1);
  usable[1]=false; CHECK(preferredTransport(10,seen,usable)==0);
}

TEST_CASE("native AEAD envelope matches Node crypto byte for byte") {
  Sessions s;
  CHECK(s.send(s.a,"signal") == "{\"v\":2,\"seq\":1,\"ack\":0,\"type\":\"encrypted\",\"body\":\"1ZwvLEJEOuerYFG51FQugno=\",\"tag\":\"b76859a33230222d41a8a0fa82dae1a2\"}\n");
}
TEST_CASE("AEAD rejects authenticated-field tampering before clearing pending data") {
  for (const char *field : {"ack", "seq", "body", "tag"}) {
    Sessions s; s.send(s.b,"key");
    JsonDocument f,p; deserializeJson(f,s.send(s.a,"key"));
    if (!strcmp(field,"ack")) f[field]=1;
    else if (!strcmp(field,"seq")) f[field]=2;
    else if (!strcmp(field,"tag")) f[field]=std::string(32,'0');
    else f[field]="dGFtcGVy";
    CHECK(s.b.open(f,p,false)==0);
    CHECK(s.b.received==0);
    CHECK_FALSE(s.b.pending.empty());
  }
}
