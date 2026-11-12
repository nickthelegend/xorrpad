#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"
#include "../xorrpad/logic/crypto.h"
using namespace xorr;
Signal sample(){return {"0.25","SOL","150.5","buy","signal-1","100","Jupiter"};}
TEST_CASE("CRC IEEE standard vector"){CHECK(crc32("123456789")==0xcbf43926);}
TEST_CASE("CRC empty"){CHECK(crc32("")==0);}
TEST_CASE("CRC detects payload change"){CHECK(crc32("buy")!=crc32("sell"));}
TEST_CASE("JSON escapes quote"){CHECK(quote("\"")=="\"\\\"\"");}
TEST_CASE("JSON escapes control"){CHECK(quote("\n")=="\"\\u000a\"");}
TEST_CASE("JSON escapes backslash"){CHECK(quote("\\")=="\"\\\\\"");}
TEST_CASE("canonical signal sorted fields"){CHECK(sample().canonical()=="{\"fee\":\"0.25\",\"market\":\"SOL\",\"price\":\"150.5\",\"side\":\"buy\",\"signalId\":\"signal-1\",\"size\":\"100\",\"venue\":\"Jupiter\"}");}
TEST_CASE("valid quoted signal"){CHECK(sample().valid());}
TEST_CASE("signal missing price"){auto s=sample();s.price="";CHECK_FALSE(s.valid());}
TEST_CASE("signal negative size"){auto s=sample();s.size="-1";CHECK_FALSE(s.valid());}
TEST_CASE("signal nonfinite fee"){auto s=sample();s.fee="NaN";CHECK_FALSE(s.valid());}
TEST_CASE("signal invalid side"){auto s=sample();s.side="execute";CHECK_FALSE(s.valid());}
TEST_CASE("signal missing venue"){auto s=sample();s.venue="";CHECK_FALSE(s.valid());}
TEST_CASE("fingerprint six base58 chars"){CHECK(fingerprint(sample()).size()==6);}
TEST_CASE("fingerprint changes size"){auto s=sample();s.size="101";CHECK(fingerprint(s)!=fingerprint(sample()));}
TEST_CASE("fingerprint changes fee"){auto s=sample();s.fee="1";CHECK(fingerprint(s)!=fingerprint(sample()));}
TEST_CASE("fingerprint changes venue"){auto s=sample();s.venue="Orca";CHECK(fingerprint(s)!=fingerprint(sample()));}
TEST_CASE("base58 leading zeros"){uint8_t b[]={0,0,1};CHECK(base58(b,3)=="112");}
TEST_CASE("sha256 abc known vector"){auto d=sha("abc",3);CHECK(hex(d.data(),32)=="ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");}
TEST_CASE("hex decode rejects length"){uint8_t b[2];CHECK_FALSE(unhex("00",b,2));}
TEST_CASE("hex decode rejects alphabet"){uint8_t b[1];CHECK_FALSE(unhex("zz",b,1));}
TEST_CASE("hex roundtrip"){uint8_t b[2];CHECK(unhex("00ff",b,2));CHECK(hex(b,2)=="00ff");}
TEST_CASE("hold at 799ms"){Hold h;h.press(1);CHECK_FALSE(h.ready(800));}
TEST_CASE("hold at 800ms"){Hold h;h.press(1);CHECK(h.ready(801));}
TEST_CASE("hold fires once"){Hold h;h.press(0);CHECK(h.ready(800));CHECK_FALSE(h.ready(900));}
TEST_CASE("hold release cancels"){Hold h;h.press(0);h.release();CHECK_FALSE(h.ready(900));}
TEST_CASE("hold cannot accumulate taps"){Hold h;h.press(0);h.release();h.press(500);CHECK_FALSE(h.ready(900));}
TEST_CASE("hold duplicate press preserves time"){Hold h;h.press(0);h.press(700);CHECK(h.ready(800));}
TEST_CASE("hold wraps millis"){Hold h;h.press(0xffffff00);CHECK(h.ready(544));}
TEST_CASE("hold ring clamps"){Hold h;h.press(0);CHECK(h.progress(1600)==1);}
TEST_CASE("kill latches"){KillLatch k;k.kill();CHECK(k.killed);}
TEST_CASE("kill requires desk request"){KillLatch k;k.kill();CHECK_FALSE(k.rearm(true,true));}
TEST_CASE("kill request offline denied"){KillLatch k;k.kill();k.request(false);CHECK_FALSE(k.rearm(true,true));}
TEST_CASE("kill rearm requires hold"){KillLatch k;k.kill();k.request(true);CHECK_FALSE(k.rearm(true,false));}
TEST_CASE("kill rearm requires online"){KillLatch k;k.kill();k.request(true);CHECK_FALSE(k.rearm(false,true));}
TEST_CASE("kill rearm succeeds deliberately"){KillLatch k;k.kill();k.request(true);CHECK(k.rearm(true,true));CHECK_FALSE(k.killed);}
TEST_CASE("kill cancels rearm"){KillLatch k;k.kill();k.request(true);k.kill();CHECK_FALSE(k.rearm(true,true));}
TEST_CASE("signal offer while killed rejected"){SignalState s;CHECK_FALSE(s.offer("a",0,1000,true));}
TEST_CASE("signal expires"){SignalState s;s.offer("a",10,1000,false);CHECK_FALSE(s.live(1010));CHECK(s.state==SignalState::Expired);}
TEST_CASE("signal offline answer rejected"){SignalState s;s.offer("a",0,1000,false);CHECK_FALSE(s.answer("a",true,10,false,false,true));}
TEST_CASE("signal wrong id rejected"){SignalState s;s.offer("a",0,1000,false);CHECK_FALSE(s.answer("b",true,10,true,false,true));}
TEST_CASE("signal hold required"){SignalState s;s.offer("a",0,1000,false);CHECK_FALSE(s.answer("a",true,10,true,false,false));}
TEST_CASE("signal refuse instant"){SignalState s;s.offer("a",0,1000,false);CHECK(s.answer("a",false,10,true,false,false));}
TEST_CASE("signal cannot confirm twice"){SignalState s;s.offer("a",0,1000,false);CHECK(s.answer("a",true,10,true,false,true));CHECK_FALSE(s.answer("a",true,11,true,false,true));}
TEST_CASE("sequence starts one"){Sequence s;CHECK(s.next()==1);}
TEST_CASE("sequence rejects zero"){Sequence s;CHECK_FALSE(s.accept(0));}
TEST_CASE("sequence rejects replay"){Sequence s;CHECK(s.accept(1));CHECK_FALSE(s.accept(1));}
TEST_CASE("sequence rejects backwards"){Sequence s;s.accept(4);CHECK_FALSE(s.accept(3));}
TEST_CASE("sequence rejects future ack"){Sequence s;s.next();CHECK_FALSE(s.ackValid(2));}
TEST_CASE("sequence exhausts safely"){Sequence s;s.sent=0xffffffff;CHECK(s.next()==0);}
TEST_CASE("retry initial delay"){CHECK(backoff(0)==250);}
TEST_CASE("retry exponential"){CHECK(backoff(3)==2000);}
TEST_CASE("retry capped"){CHECK(backoff(99)==30000);}
TEST_CASE("knob slow"){CHECK(knob(100,1,200)==101);}
TEST_CASE("knob fast"){CHECK(knob(100,1,30)==110);}
TEST_CASE("knob medium"){CHECK(knob(100,-1,80)==96);}
TEST_CASE("knob minimum"){CHECK(knob(1,-1,30)==1);}
TEST_CASE("knob cap"){CHECK(knob(1000000,1,30)==1000000);}
TEST_CASE("idle normal brightness"){Idle i;CHECK(i.brightness(0,200,false)==200);}
TEST_CASE("idle dims two minutes"){Idle i;CHECK(i.brightness(120000,200,false)==25);}
TEST_CASE("idle blanks ten minutes"){Idle i;CHECK(i.brightness(600000,200,false)==0);}
TEST_CASE("idle key wakes"){Idle i;i.wake(600000);CHECK(i.brightness(600000,200,false)==200);}
TEST_CASE("night mode caps"){Idle i;CHECK(i.brightness(0,200,true)==40);}
TEST_CASE("gate suppresses quiet"){CHECK(gate(300)==0);}
TEST_CASE("gate preserves speech"){CHECK(gate(-1000)==-1000);}
TEST_CASE("VAD rms"){int16_t a[]={1000,-1000};CHECK(energy(a,2)==1000);}
TEST_CASE("VAD empty"){CHECK(energy(nullptr,0)==0);}
TEST_CASE("profiles reject empty"){CHECK_FALSE(validProfiles({}));}
TEST_CASE("keymap rejects missing bindings"){CHECK_FALSE(validBindings({}));}
TEST_CASE("keymap serialization controls and cells"){std::vector<Binding>b;const char*a[]={"momentum","grid","dca","risk","yield","rebalance","no","yes","buy","base","kill","mic","sell","portfolio"};for(int r=0;r<4;r++)for(int c=0;c<4;c++){int i=cell(r,c);if(i>=0)b.push_back({r,c,a[i],a[i]});}CHECK(validBindings(b));auto copy=b;copy[0].action="kill";CHECK_FALSE(validBindings(copy));copy=b;copy[1]=copy[0];CHECK_FALSE(validBindings(copy));Profile p;p.name="Scalper";for(auto&l:p.layers)l=b;CHECK(validProfiles({p}));CHECK_FALSE(validProfiles({p,p}));}
TEST_CASE("RFC8032 Ed25519 empty message vector") {
  uint8_t pk[32], sig[64];
  REQUIRE(
      unhex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
            pk, 32));
  REQUIRE(
      unhex("e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555f"
            "b8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
            sig, 64));
  CHECK(Ed25519::verify(sig, pk, "", 0));
  sig[0] ^= 1;
  CHECK_FALSE(Ed25519::verify(sig, pk, "", 0));
}

TEST_CASE("manifest rejects unsigned"){Manifest m;m.version="2.0.0";m.size=100;m.minDesk="1.0.0";m.sha256=std::string(64,'0');CHECK_FALSE(m.valid());}
TEST_CASE("manifest rejects oversized"){Manifest m;m.version="2.0.0";m.size=0x300001;m.minDesk="1.0.0";m.sha256=std::string(64,'0');m.signature=std::string(128,'0');CHECK_FALSE(m.valid());}
