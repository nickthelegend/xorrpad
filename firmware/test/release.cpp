#include "doctest.h"
#include "../xorrpad/logic/release.h"
using namespace xorr;
TEST_CASE("release USB debug defaults off and requires encrypted USB consent") {
  UsbDebugGate g;CHECK_FALSE(g.check(true,true,1));
  g.configure(true,false,true,1);CHECK_FALSE(g.check(true,true,1));
  g.configure(true,true,false,1);CHECK_FALSE(g.check(true,true,1));
  g.configure(true,true,true,1);CHECK(g.check(true,true,1));
  g.configure(false,true,true,1);CHECK_FALSE(g.check(true,true,1));
}
TEST_CASE("release USB debug is revoked by disconnect, failover or repair") {
  for(int change=0;change<3;change++) {
    UsbDebugGate g;g.configure(true,true,true,1);CHECK(g.check(true,true,1));
    CHECK_FALSE(g.check(change!=0,change!=1,change==2?2:1));
    CHECK_FALSE(g.check(true,true,1)); // Restoring transport does not restore consent.
    g.configure(true,true,true,3);CHECK(g.check(true,true,3));
  }
}
TEST_CASE("release USB debug cannot persist across reboot") {
  UsbDebugGate previous;previous.configure(true,true,true,1);
  CHECK(previous.check(true,true,1));UsbDebugGate rebooted;CHECK_FALSE(rebooted.check(true,true,1));
}
