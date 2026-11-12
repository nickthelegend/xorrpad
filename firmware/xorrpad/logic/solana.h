#pragma once
#include "crypto.h"
#include "jupiter-layouts.h"
#include <cstring>

// Bounded, canonical Solana legacy/v0 message reader. No wallet or hardware API.
namespace xorr::solana {
using Key = std::array<uint8_t,32>;
inline std::string address(const Key &k) { return base58(k.data(),k.size()); }
inline bool keyFromString(const std::string &s,Key &out) {
  if(s.empty() || s.size()>44)return false;
  const std::string alphabet="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  out.fill(0);
  for(char c:s){auto digit=alphabet.find(c);if(digit==std::string::npos)return false;
    unsigned carry=unsigned(digit);
    for(int i=31;i>=0;i--){carry+=unsigned(out[i])*58;out[i]=carry&255;carry>>=8;}
    if(carry)return false;
  }
  return address(out)==s;
}
struct Reader {
  const uint8_t *p; size_t n, at=0; bool ok=true;
  uint64_t le(size_t count) {
    if(count>8 || count>n-at) {ok=false;return 0;}
    uint64_t v=0; for(size_t i=0;i<count;i++)v|=uint64_t(p[at++])<<(8*i); return v;
  }
  size_t compact() {
    size_t v=0;
    for(unsigned i=0;i<3;i++) {
      auto b=le(1); if(!ok || (i==2 && b>3) || (i && b==0)) {ok=false;return 0;}
      v|=(b&127)<<(7*i); if(!(b&128))return v;
    }
    ok=false;return 0;
  }
  bool bytes(uint8_t *out,size_t count) {
    if(count>n-at){ok=false;return false;}
    if(count)std::memcpy(out,p+at,count);
    at+=count;return true;
  }
  Key key(){Key k{};bytes(k.data(),32);return k;}
  std::vector<uint8_t> list(size_t limit) {
    size_t count=compact();if(!ok || count>limit || count>n-at){ok=false;return {};}
    std::vector<uint8_t> out(p+at,p+at+count);at+=count;return out;
  }
  bool done()const{return ok && at==n;}
};
struct Instruction {uint8_t program=0;std::vector<uint8_t> accounts,data;};
struct Lookup {Key table{};std::vector<uint8_t> writable,readonly;};
struct TableData {
  Key table{}; std::string owner;
  std::vector<uint8_t> data;
  // Desk's resolved list in writable-then-readonly order, checked against data.
  std::vector<Key> resolved;
};
struct Message {
  bool valid=false, v0=false;
  uint8_t required=0, readonlySigned=0, readonlyUnsigned=0;
  size_t staticCount=0; Key blockhash{};
  std::vector<Key> keys; std::vector<Instruction> instructions;std::vector<Lookup> lookups;
  std::string fingerprint,error;
  bool signer(size_t i)const{return i<required;}
  bool writable(size_t i)const {
    if(i<required)return i<size_t(required-readonlySigned);
    if(i<staticCount)return i<staticCount-readonlyUnsigned;
    size_t count=0;for(const auto &l:lookups)count+=l.writable.size();
    return i<staticCount+count;
  }
};
inline Message parse(const std::vector<uint8_t> &bytes,const std::vector<TableData> &tables={}) {
  Message m;
  auto fail=[&](const char *s){m.error=s;return m;};
  if(bytes.empty() || bytes.size()>1232)return fail("message size");
  Reader r{bytes.data(),bytes.size()}; auto first=r.le(1);
  if(first&128){if(first!=128)return fail("unsupported message version");m.v0=true;m.required=r.le(1);}
  else m.required=first;
  m.readonlySigned=r.le(1);m.readonlyUnsigned=r.le(1);m.staticCount=r.compact();
  if(!r.ok || !m.required || m.staticCount>256 || m.required>m.staticCount ||
     m.readonlySigned>=m.required || m.readonlyUnsigned>m.staticCount-m.required)return fail("header");
  for(size_t i=0;i<m.staticCount;i++)m.keys.push_back(r.key());
  m.blockhash=r.key();size_t count=r.compact();if(!r.ok || !count || count>64)return fail("instruction count");
  for(size_t i=0;i<count;i++){
    Instruction ix;ix.program=r.le(1);ix.accounts=r.list(256);ix.data=r.list(1232);
    if(!r.ok || ix.program==0 || ix.program>=m.staticCount)return fail("instruction bounds");
    m.instructions.push_back(std::move(ix));
  }
  if(m.v0){
    count=r.compact();if(!r.ok || count>32)return fail("lookup count");
    for(size_t i=0;i<count;i++){
      Lookup l;l.table=r.key();l.writable=r.list(256);l.readonly=r.list(256);
      if(!r.ok || l.writable.size()+l.readonly.size()==0)return fail("lookup indices");
      for(const auto &old:m.lookups)if(old.table==l.table)return fail("duplicate lookup");
      m.lookups.push_back(std::move(l));
    }
  }
  if(!r.done() || tables.size()!=m.lookups.size())return fail("message tail / lookup evidence");
  std::vector<Key> writable,readonly;
  for(const auto &l:m.lookups){
    const TableData *t=nullptr;
    for(const auto &candidate:tables)if(candidate.table==l.table){if(t)return fail("duplicate table data");t=&candidate;}
    if(!t || t->owner!="AddressLookupTab1e1111111111111111111111111" ||
       t->data.size()<56 || t->data.size()>56+256*32 || (t->data.size()-56)%32 ||
       t->resolved.size()!=l.writable.size()+l.readonly.size())return fail("lookup table data");
    Reader tr{t->data.data(),t->data.size()};
    if(tr.le(4)!=1 || tr.le(8)!=UINT64_MAX)return fail("lookup table inactive");
    // Fixed bincode metadata: last_extended_slot, start_index, Option<authority>.
    tr.le(8);auto start=tr.le(1), authority=tr.le(1);
    if(authority>1 || start>(t->data.size()-56)/32)return fail("lookup metadata");
    size_t resolved=0;bool seen[256]={};
    for(int kind=0;kind<2;kind++)for(auto index:kind?l.readonly:l.writable){
      if(seen[index] || size_t(index)>=(t->data.size()-56)/32)return fail("lookup index");
      seen[index]=true;Key key{};std::memcpy(key.data(),t->data.data()+56+32*index,32);
      if(t->resolved[resolved++]!=key)return fail("lookup resolution mismatch");
      (kind?readonly:writable).push_back(key);
    }
  }
  m.keys.insert(m.keys.end(),writable.begin(),writable.end());m.keys.insert(m.keys.end(),readonly.begin(),readonly.end());
  if(m.keys.size()>256)return fail("account count");
  for(size_t i=0;i<m.keys.size();i++)for(size_t j=0;j<i;j++)if(m.keys[i]==m.keys[j])return fail("duplicate account");
  for(const auto &ix:m.instructions)for(auto a:ix.accounts)if(a>=m.keys.size())return fail("account index");
  auto digest=sha(bytes.data(),bytes.size());m.fingerprint=base58(digest.data(),32).substr(0,6);m.valid=true;return m;
}
inline bool discriminator(const std::vector<uint8_t> &data,const char *name) {
  auto h=sha(name,std::strlen(name));return data.size()>=8 && !std::memcmp(data.data(),h.data(),8);
}
struct MintProof {Key account{},mint{},owner{},program{};uint8_t bump=0;};
inline bool verifyMintProof(const MintProof &proof) {
  Key ataProgram{};keyFromString("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",ataProgram);
  auto program=address(proof.program);
  if(program!="TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" && program!="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")return false;
  std::vector<uint8_t> seed;
  for(auto k:{proof.owner,proof.program,proof.mint})seed.insert(seed.end(),k.begin(),k.end());
  seed.push_back(proof.bump);seed.insert(seed.end(),ataProgram.begin(),ataProgram.end());
  const char marker[]="ProgramDerivedAddress";seed.insert(seed.end(),marker,marker+21);
  return sha(seed.data(),seed.size())==proof.account;
}
struct Decoded {
  bool known=false;
  std::string name,side,inputMint,outputMint,source,destination,market;
  uint64_t amount=0,output=0,price=0;int decimals=-1;
  std::vector<std::string> details;
};
inline Decoded decode(const Message &m,const Instruction &ix,const std::vector<MintProof> &proofs={}) {
  Decoded d;const auto program=address(m.keys[ix.program]);Reader r{ix.data.data(),ix.data.size()};
  auto a=[&](size_t i){return i<ix.accounts.size()?address(m.keys[ix.accounts[i]]):std::string();};
  auto writable=[&](size_t i){return i<ix.accounts.size() && m.writable(ix.accounts[i]);};
  auto signer=[&](size_t i){return i<ix.accounts.size() && m.signer(ix.accounts[i]);};
  auto finish=[&](){d.known=r.done();return d;};
  if(program=="11111111111111111111111111111111") {
    if(r.le(4)!=2 || ix.accounts.size()!=2 || !signer(0) || !writable(0) || !writable(1))return d;
    d.name="System transfer";d.amount=r.le(8);d.decimals=9;d.source=a(0);d.destination=a(1);return finish();
  }
  if(program=="TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" || program=="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb") {
    auto tag=r.le(1);
    if(tag==17 && ix.accounts.size()==1 && writable(0)){d.name="Sync native SOL";d.source=a(0);return finish();}
    if(tag==9 && ix.accounts.size()==3 && signer(2) && writable(0) && writable(1)){d.name="Close token account";d.source=a(0);d.destination=a(1);d.details.push_back("return rent / remaining native SOL");return finish();}
    bool checked=tag==12;
    if((tag!=3 && !checked) || ix.accounts.size()!=(checked?4u:3u) || !signer(checked?3:2) || !writable(0) || !writable(checked?2:1))return d;
    d.name=program[5]=='z'?"Token-2022 ":"SPL Token ";d.name+=checked?"transferChecked":"transfer";
    d.amount=r.le(8);if(checked){d.decimals=r.le(1);d.inputMint=d.outputMint=a(1);}
    d.source=a(0);d.destination=a(checked?2:1);return finish();
  }
  if(program=="ComputeBudget111111111111111111111111111111") {
    if(!ix.accounts.empty())return d;
    auto tag=r.le(1);d.name="ComputeBudget";
    if(tag==1){d.amount=r.le(4);d.details.push_back("heap bytes "+std::to_string(d.amount));}
    else if(tag==2){d.amount=r.le(4);d.details.push_back("unit limit "+std::to_string(d.amount));}
    else if(tag==3){d.amount=r.le(8);d.details.push_back("micro-lamports/CU "+std::to_string(d.amount));}
    else if(tag==4){d.amount=r.le(4);d.details.push_back("loaded data bytes "+std::to_string(d.amount));}
    else return d;
    return finish();
  }
  // ATA idempotent setup emitted by the actual pm-AMM builder.
  if(program=="ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL") {
    if(r.le(1)!=1 || ix.accounts.size()!=6 || !signer(0) || !writable(0) || !writable(1) ||
      a(4)!="11111111111111111111111111111111" || a(5)!="TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")return d;
    d.name="Create token account";d.destination=a(1);d.source=a(0);d.inputMint=a(3);d.details.push_back("owner "+a(2));return finish();
  }
  if(program=="GV1FMGHRYBjQLaghE5fnGuYCuCcpdt3GD5xEX3TwN16y" && discriminator(ix.data,"global:swap")) {
    if(ix.accounts.size()!=12 || a(2)!="3WQ8hCqTNwjrh8WzE2XyoZoUrd1miPcwWfMkmFPUMEWZ" || !signer(0) || !writable(1) || a(11)!="TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")return d;
    r.at=8;auto direction=r.le(1);if(direction>5)return d;
    static const uint8_t from[]={2,2,3,4,3,4},to[]={3,4,2,2,4,3};
    static const char *sides[]={"USDC -> YES","USDC -> NO","YES -> USDC","NO -> USDC","YES -> NO","NO -> YES"};
    d.name="pm-AMM swap";d.side=sides[direction];d.inputMint=a(from[direction]);d.outputMint=a(to[direction]);
    d.market=a(1);d.amount=r.le(8);d.output=r.le(8);d.decimals=6;d.source=a(0);return finish();
  }
  if(program=="JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4") {
    bool shared=discriminator(ix.data,"global:shared_accounts_route");
    if(!shared && !discriminator(ix.data,"global:route"))return d;
    if(ix.accounts.size()<(shared?11u:7u) || !signer(shared?2:1))return d;
    d.name=shared?"Jupiter v6 shared route":"Jupiter v6 route";
    r.at=8;if(shared)r.le(1);
    auto steps=r.le(4);if(!steps || steps>32)return d;
    // Generated from the actual program's public on-chain Anchor IDL.
    for(size_t i=0;i<steps;i++) {
      auto variant=r.le(1);
      if(variant>=sizeof(jupiterLayouts)/sizeof(jupiterLayouts[0]))return d;
      const auto &layout=jupiterLayouts[variant];if(layout.size<0)return d;
      for(int j=0;j<layout.size;j++){auto byte=r.le(1);if((layout.boolMask&(uint64_t(1)<<j)) && byte>1)return d;}
      auto percent=r.le(1);r.le(1);r.le(1);if(!percent || percent>100)return d;
    }
    d.name=shared?"Jupiter v6 shared route":"Jupiter v6 route";d.amount=r.le(8);d.output=r.le(8);
    auto slippage=r.le(2),fee=r.le(1);if(slippage>10000)return d;
    d.details={"quoted out "+std::to_string(d.output),"slippage bps "+std::to_string(slippage),"platform fee bps "+std::to_string(fee)};
    // Overflow-free floor(quotedOut * (10000 - slippage) / 10000).
    d.output=(d.output/10000)*(10000-slippage)+(d.output%10000)*(10000-slippage)/10000;
    d.source=a(shared?3:2);d.destination=a(shared?6:3);d.outputMint=a(shared?8:5);
    if(shared)d.inputMint=a(7);
    else {
      for(const auto &proof:proofs)if(address(proof.account)==d.source && address(proof.owner)==a(1) && address(proof.program)==a(0) && verifyMintProof(proof)){
        if(!d.inputMint.empty() && d.inputMint!=address(proof.mint))return Decoded{};
        d.inputMint=address(proof.mint);
      }
      if(d.inputMint.empty()){d.details.push_back("input mint absent: supply ATA mint proof");return d;}
    }
    return finish();
  }
  if(program=="EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih") {
    bool market=discriminator(ix.data,"global:place_market_order");
    if(!market && !discriminator(ix.data,"global:place_limit_order"))return d;
    if(ix.accounts.size()<10 || !signer(3))return d;
    r.at=8;if(r.le(1)!=(market?2u:1u))return d;
    auto side=r.le(1);if(side>1)return d;d.side=side?"ask / short":"bid / long";
    auto option=[&](){auto tag=r.le(1);if(tag>1)r.ok=false;return tag==1?r.le(8):0;};
    d.price=market?option():r.le(8);d.amount=r.le(8);
    if(market){auto quote=option();auto minBase=r.le(8),minQuote=r.le(8);d.details={"quote lot cap "+std::to_string(quote),"min base lots "+std::to_string(minBase),"min quote lots "+std::to_string(minQuote)};}
    if(r.le(1)>2)return d;
    auto match=option();r.le(8);r.le(8);auto expiry=option();auto flags=r.le(1),cancel=r.le(1);
    if((flags!=0 && flags!=128) || cancel>1)return d;
    d.name="Phoenix place order";d.market=a(ix.accounts.size()-2);d.source=a(3);
    d.details.push_back("self-trade match cap "+std::to_string(match));d.details.push_back("expires slot "+std::to_string(expiry));
    d.details.push_back(flags?"reduce only":"ordinary order");d.details.push_back(cancel?"cancel existing orders":"keep existing orders");
    d.details.push_back("size: base lots; limit: ticks");d.details.push_back("leverage: account-wide, absent from bytes");return finish();
  }
  return d;
}
struct Review {
  Message message;std::vector<Decoded> decoded;std::vector<std::string> rows;
  bool blind=false;
  bool valid()const{return message.valid;}
};
inline Review review(const std::vector<uint8_t> &bytes,const std::vector<TableData> &tables={},const std::vector<MintProof> &proofs={}) {
  Review v;v.message=parse(bytes,tables);if(!v.valid())return v;
  v.rows={std::string(v.message.v0?"Solana v0":"Solana legacy"),"payer "+address(v.message.keys[0]),
    "signatures "+std::to_string(v.message.required),"blockhash "+address(v.message.blockhash)};
  for(const auto &l:v.message.lookups)v.rows.push_back("lookup table: "+std::to_string(l.writable.size()+l.readonly.size())+" accounts "+address(l.table));
  if(!v.message.lookups.empty()){
    v.blind=true;v.rows.push_back("lookup data checked; chain authenticity unproven");
  }
  for(const auto &ix:v.message.instructions) {
    auto d=decode(v.message,ix,proofs);v.blind|=!d.known;
    v.rows.push_back(d.known?d.name:"UNKNOWN / "+(d.name.empty()?std::string("instruction"):d.name));
    v.rows.push_back("program "+address(v.message.keys[ix.program]));
    if(!d.side.empty())v.rows.push_back(d.side);
    if(!d.source.empty())v.rows.push_back("from "+d.source);
    if(!d.destination.empty())v.rows.push_back("to "+d.destination);
    if(!d.market.empty())v.rows.push_back("market "+d.market);
    if(!d.inputMint.empty())v.rows.push_back("input mint "+d.inputMint);
    if(!d.outputMint.empty())v.rows.push_back("output mint "+d.outputMint);
    if(d.name!="ComputeBudget" && d.name!="Create token account") {
      v.rows.push_back("amount raw "+std::to_string(d.amount));
      if(d.decimals>=0)v.rows.push_back("decimals "+std::to_string(d.decimals));
      if(d.name.find("swap")!=std::string::npos || d.name.find("route")!=std::string::npos)v.rows.push_back("minimum out raw "+std::to_string(d.output));
      if(d.name=="Phoenix place order")v.rows.push_back("limit ticks "+(d.price?std::to_string(d.price):std::string("unbounded")));
    }
    for(const auto &line:d.details)v.rows.push_back(line);
    v.decoded.push_back(std::move(d));
  }
  return v;
}
// Approval is bound to one message and one encrypted connection. Policy is
// volatile, off by default; invalid messages can never become blind approvals.
class Approval {
  Review value;uint32_t epoch=0;bool allowBlind=false;std::vector<bool> seen;
public:
  void reset(){value={};seen.clear();}
  void configure(bool allow,uint32_t connection){if(connection!=epoch){reset();epoch=connection;}allowBlind=allow;}
  bool offer(Review v,uint32_t connection){reset();if(connection!=epoch || !v.valid())return false;value=std::move(v);seen.resize(value.rows.size(),false);return true;}
  void visit(size_t row){if(row<seen.size())seen[row]=true;}
  bool allSeen()const{return !seen.empty() && std::all_of(seen.begin(),seen.end(),[](bool s){return s;});}
  bool allowed(uint32_t connection)const{return value.valid() && epoch==connection && (!value.blind || allowBlind);}
  uint32_t holdMs()const{return value.blind?3800:800;}
  bool confirm(uint32_t held,uint32_t connection)const{return allowed(connection) && allSeen() && held>=holdMs();}
  const Review &get()const{return value;}
};
} // namespace xorr::solana
