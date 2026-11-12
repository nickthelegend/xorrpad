#include "doctest.h"
#include "../xorrpad/logic/pairing.h"
using namespace xorr;
namespace {
std::string text(const std::string &nonce = std::string(64, '1')) {
  return pairingText("esp32-test", std::string(64, '2'), std::string(64, '3'),
                     std::string(64, '4'), nonce);
}
}
TEST_CASE("pairing transcript binds fresh device nonce") {
  CHECK(text() != text(std::string(64, '5')));
  CHECK(text().find("|" + std::string(64, '1')) != std::string::npos);
}
TEST_CASE("pairing rejects malformed transcript fields") {
  CHECK(text("bad").empty());
  CHECK(pairingText("../bad", std::string(64, 'a'), std::string(64, 'a'),
                    std::string(64, 'a'), std::string(64, 'a')).empty());
}
TEST_CASE("pairing real X25519 directional derivation and nonce separation") {
  // RFC 7748 public test scalars, never a deployed identity.
  uint8_t a[32], b[32], ap[32], bp[32], ad[32], at[32], bd[32], bt[32];
  REQUIRE(unhex("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a", a, 32));
  REQUIRE(unhex("5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb", b, 32));
  REQUIRE(Curve25519::eval(ap, a, nullptr));
  REQUIRE(Curve25519::eval(bp, b, nullptr));
  REQUIRE(pairingKeys(a, bp, "123456", text(), ad, at));
  REQUIRE(pairingKeys(b, ap, "123456", text(), bd, bt));
  CHECK(hex(ad, 32) == hex(bd, 32));
  CHECK(hex(at, 32) == hex(bt, 32));
  CHECK(hex(ad, 32) != hex(at, 32));
  REQUIRE(pairingKeys(b, ap, "123456", text(std::string(64, '5')), bd, bt));
  CHECK(hex(ad, 32) != hex(bd, 32));
  REQUIRE(pairingKeys(b, ap, "654321", text(), bd, bt));
  CHECK(hex(at, 32) != hex(bt, 32));
}
TEST_CASE("pairing fails closed for weak points and invalid codes") {
  uint8_t secret[32] = {9}, remote[32] = {}, d[32], p[32];
  CHECK_FALSE(pairingKeys(secret, remote, "123456", text(), d, p));
  remote[0] = 9;
  CHECK_FALSE(pairingKeys(secret, remote, "12345x", text(), d, p));
  CHECK_FALSE(pairingKeys(secret, remote, "12345", text(), d, p));
  CHECK_FALSE(pairingKeys(secret, remote, "123456", "", d, p));
}
