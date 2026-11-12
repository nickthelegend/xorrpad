#include "doctest.h"
#include "../xorrpad/logic/attestation.h"
#include <random>
using namespace xorr;
namespace {
struct Unit {
  uint8_t factory[32], root[32], secret[32], pk[32];
  DeviceCertificate c;
  Unit() {
    std::random_device entropy;
    for (int i = 0; i < 32; ++i) { factory[i] = entropy(); secret[i] = entropy(); }
    Ed25519::derivePublicKey(root, factory); Ed25519::derivePublicKey(pk, secret);
    c = {hex(pk, 32), "esp32-123456abcdef", "xorrpad-esp32s3", std::string(128, '0'), 1};
    auto t = c.text(); uint8_t sig[64]; Ed25519::sign(sig, factory, root, t.data(), t.size());
    c.signature = hex(sig, 64);
  }
  std::string context() { return pairingText(c.serial, std::string(64, '1'), std::string(64, '2'), std::string(64, '3'), std::string(64, '4')); }
};
}
TEST_CASE("factory certificate verifies real Ed25519 and exact device binding") {
  Unit u;
  CHECK(u.c.verify(u.root, u.c.serial, u.c.deviceKey));
  CHECK_FALSE(u.c.verify(u.root, "esp32-000000000000", u.c.deviceKey));
  CHECK_FALSE(u.c.verify(u.root, u.c.serial, std::string(64, '1')));
}
TEST_CASE("factory certificate rejects absent root and foreign authority") {
  Unit u, other; uint8_t absent[32] = {};
  CHECK_FALSE(u.c.verify(absent, u.c.serial, u.c.deviceKey));
  CHECK_FALSE(u.c.verify(other.root, u.c.serial, u.c.deviceKey));
}
TEST_CASE("factory certificate rejects changed signed fields") {
  Unit u;
  for (int i = 0; i < 4; ++i) {
    auto c = u.c;
    if (i == 0) c.deviceKey[0] = c.deviceKey[0] == '0' ? '1' : '0';
    if (i == 1) c.serial = "esp32-000000000000";
    if (i == 2) c.model = "clone";
    if (i == 3) c.signature[0] = c.signature[0] == '0' ? '1' : '0';
    CHECK_FALSE(c.verify(u.root, c.serial, c.deviceKey));
  }
}
TEST_CASE("attestation proof binds certificate and fresh session challenge") {
  Unit u; auto context = u.context(), text = u.c.challengeText(context);
  REQUIRE_FALSE(text.empty()); uint8_t sig[64];
  Ed25519::sign(sig, u.secret, u.pk, text.data(), text.size());
  CHECK(Ed25519::verify(sig, u.pk, text.data(), text.size()));
  for (size_t i : {size_t(2), size_t(3), size_t(4), size_t(5)}) {
    std::vector<std::string> p{u.c.serial, std::string(64, '1'), std::string(64, '2'), std::string(64, '3'), std::string(64, '4')};
    p[i-1] = std::string(64, '9');
    auto changed = u.c.challengeText(pairingText(p[0], p[1], p[2], p[3], p[4]));
    CHECK_FALSE(Ed25519::verify(sig, u.pk, changed.data(), changed.size()));
  }
  Unit other;
  CHECK_FALSE(Ed25519::verify(sig, other.pk, text.data(), text.size()));
}
TEST_CASE("attestation refuses malformed challenge and wrong device") {
  Unit u;
  CHECK(u.c.challengeText("").empty());
  CHECK(u.c.challengeText(u.context()+"|extra").empty());
  CHECK(u.c.challengeText(pairingText("other", std::string(64,'1'),std::string(64,'2'),std::string(64,'3'),std::string(64,'4'))).empty());
}
TEST_CASE("certificate serialization is strict and round trips") {
  Unit u; JsonDocument d; writeCertificate(d.to<JsonObject>(), u.c);
  DeviceCertificate c;
  REQUIRE(parseCertificate(d.as<JsonVariantConst>(), c));
  CHECK(c.text() == u.c.text()); CHECK(c.signature == u.c.signature);
  d["extra"] = true; CHECK_FALSE(parseCertificate(d.as<JsonVariantConst>(), c));
  d.remove("extra"); d["v"] = "1"; CHECK_FALSE(parseCertificate(d.as<JsonVariantConst>(), c));
}
TEST_CASE("certificate bounded fields reject delimiters and invalid encodings") {
  Unit u;
  for (auto serial : {"esp32-123456ABCDEF", "esp32-123456abcde", "esp32-123456abcdef\n"}) {
    auto c = u.c; c.serial = serial; CHECK(c.text().empty());
  }
  auto c = u.c; c.deviceKey += "00"; CHECK(c.text().empty());
  c = u.c; c.version = 2; CHECK(c.text().empty());
  c = u.c; c.signature = "bad"; CHECK(c.text().empty());
}
TEST_CASE("phone attestation binds its random challenge to current BLE nonce") {
  JsonDocument d;d["v"]=2;d["type"]="attest_request";d["clientKey"]=std::string(64,'2');d["challenge"]=std::string(64,'3');d["nonce"]=std::string(64,'4');
  auto text=xorr::phoneAttestationContext("esp32-123456abcdef",std::string(64,'1'),std::string(64,'4'),d.as<JsonVariantConst>());
  CHECK(text==xorr::pairingText("esp32-123456abcdef",std::string(64,'1'),std::string(64,'2'),std::string(64,'3'),std::string(64,'4')));
  CHECK(xorr::phoneAttestationContext("esp32-123456abcdef",std::string(64,'1'),std::string(64,'5'),d.as<JsonVariantConst>()).empty());
  d["challenge"]="bad";CHECK(xorr::phoneAttestationContext("esp32-123456abcdef",std::string(64,'1'),std::string(64,'4'),d.as<JsonVariantConst>()).empty());
}
TEST_CASE("phone attestation refuses extra fields and wrong public request type") {
  JsonDocument d;d["v"]=2;d["type"]="attest_request";d["clientKey"]=std::string(64,'2');d["challenge"]=std::string(64,'3');d["nonce"]=std::string(64,'4');d["device"]="spoofed";
  CHECK(xorr::phoneAttestationContext("esp32-123456abcdef",std::string(64,'1'),std::string(64,'4'),d.as<JsonVariantConst>()).empty());
  d.remove("device");d["type"]="pair";CHECK(xorr::phoneAttestationContext("esp32-123456abcdef",std::string(64,'1'),std::string(64,'4'),d.as<JsonVariantConst>()).empty());
}
