#include "../xorrpad/logic/crew.h"
#include "doctest.h"
#include <fstream>
#include <Ed25519.h>
#include <cstdlib>
using namespace xorr;
static solana::Review trade(){std::ifstream f("firmware/test/fixtures/session-usdc-transfer.json");std::string json((std::istreambuf_iterator<char>(f)),{});JsonDocument d;REQUIRE_FALSE(deserializeJson(d,json));std::string text=d["message"];std::vector<uint8_t> bytes(text.size()/2);REQUIRE(unhex(text,bytes.data(),bytes.size()));return solana::review(bytes);}
static solana::Approval pending(bool seen=true){solana::Approval a;a.configure(false,7);REQUIRE(a.offer(trade(),7));if(seen)for(size_t i=0;i<a.get().rows.size();++i)a.visit(i);return a;}
TEST_CASE("crew device approval consumes actual message hash after physical hold"){
 auto a=pending();auto hash=a.get().message.hash;uint8_t digest[32];REQUIRE(crew::consume(a,800,7,digest));CHECK(hex(digest,32)==hash);CHECK_FALSE(crew::consume(a,800,7,digest));
}
TEST_CASE("crew refuses short hold unreviewed pages and stale session"){
 uint8_t d[32];auto a=pending();CHECK_FALSE(crew::consume(a,799,7,d));a=pending(false);CHECK_FALSE(crew::consume(a,800,7,d));a=pending();CHECK_FALSE(crew::consume(a,800,8,d));
}
TEST_CASE("crew never permits blind approvals even when desk allows blind signing"){
 auto v=trade();v.blind=true;solana::Approval a;a.configure(true,7);REQUIRE(a.offer(v,7));for(size_t i=0;i<v.rows.size();++i)a.visit(i);uint8_t d[32];CHECK_FALSE(crew::consume(a,3800,7,d));
}
TEST_CASE("crew signature uses raw 32-byte SHA256 and is distinct from a transaction signature"){
 auto a=pending();uint8_t d[32],seed[32],pub[32],sig[64];REQUIRE(crew::consume(a,800,7,d));arc4random_buf(seed,32);Ed25519::derivePublicKey(pub,seed);Ed25519::sign(sig,seed,pub,d,32);CHECK(Ed25519::verify(sig,pub,d,32));d[0]^=1;CHECK_FALSE(Ed25519::verify(sig,pub,d,32));memset(seed,0,32);
}
TEST_CASE("crew request cannot also request transaction signing or a nonboolean mode"){
 std::ifstream f("firmware/test/fixtures/session-usdc-transfer.json");std::string json((std::istreambuf_iterator<char>(f)),{});JsonDocument d;REQUIRE_FALSE(deserializeJson(d,json));
 d["signalId"]="crew-mode";d["remainingMs"]=10000;d["cosign"]=true;d["sign"]=true;
 solana::Request r;std::string text;serializeJson(d,text);CHECK_FALSE(solana::parseRequest(text,r));
 d["sign"]=false;d["cosign"]=1;text.clear();serializeJson(d,text);CHECK_FALSE(solana::parseRequest(text,r));
 d["cosign"]=true;text.clear();serializeJson(d,text);REQUIRE(solana::parseRequest(text,r));CHECK(r.cosign);CHECK_FALSE(r.sign);
}
