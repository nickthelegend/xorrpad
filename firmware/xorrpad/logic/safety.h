#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <string>
#include <vector>
namespace xorr {
inline uint32_t crc32(const std::string &s) { uint32_t c=~0u;for(unsigned char b:s){c^=b;for(int i=0;i<8;i++)c=(c>>1)^(0xedb88320u&-(c&1));}return ~c; }
inline std::string quote(const std::string &s) {std::string o="\"";for(unsigned char c:s){if(c=='"'||c=='\\'){o+='\\';o+=c;}else if(c<32){const char *h="0123456789abcdef";o+="\\u00";o+=h[c>>4];o+=h[c&15];}else o+=c;}return o+'"';}
struct Signal {
 std::string fee,market,price,side,id,size,venue;
 std::string canonical() const {return "{\"fee\":"+quote(fee)+",\"market\":"+quote(market)+",\"price\":"+quote(price)+",\"side\":"+quote(side)+",\"signalId\":"+quote(id)+",\"size\":"+quote(size)+",\"venue\":"+quote(venue)+"}";}
 bool valid() const {auto number=[](const std::string&s){if(s.empty()||s.size()>32)return false;bool dot=false,digit=false;for(char c:s){if(c=='.'&&!dot){dot=true;continue;}if(c<'0'||c>'9')return false;digit=true;}return digit;};return !id.empty()&&id.size()<=96&&!market.empty()&&market.size()<=64&&!venue.empty()&&venue.size()<=64&&(side=="buy"||side=="sell"||side=="yes"||side=="no")&&number(size)&&number(price)&&number(fee);}
};
inline std::string base58(const uint8_t *p,size_t n){const char*a="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";std::vector<uint8_t>d(1,0);size_t z=0;while(z<n&&!p[z])z++;for(size_t i=z;i<n;i++){unsigned c=p[i];for(auto &v:d){c+=unsigned(v)*256;v=c%58;c/=58;}while(c){d.push_back(c%58);c/=58;}}std::string o(z,'1');if(z<n)for(auto i=d.rbegin();i!=d.rend();++i)o+=a[*i];return o;}
class Hold {
 bool down=false,fired=false;uint32_t since=0;
public:
 void press(uint32_t now){if(!down){down=true;fired=false;since=now;}}
 void release(){down=false;fired=false;}
 uint32_t elapsed(uint32_t now)const{return down?now-since:0;}
 float progress(uint32_t now,uint32_t duration=800)const{return std::min(1.f,float(elapsed(now))/duration);}
 bool ready(uint32_t now,uint32_t duration=800){if(!down||fired||elapsed(now)<duration)return false;fired=true;return true;}
 bool held()const{return down;}
};
struct KillLatch {bool killed=false,requested=false;void kill(){killed=true;requested=false;}void request(bool online){requested=killed&&online;}bool rearm(bool online,bool held){if(!killed||!requested||!online||!held)return false;killed=false;requested=false;return true;}};
struct SignalState {
 enum State {Empty,Awaiting,Accepted,Refused,Expired};State state=Empty;std::string id;uint32_t since=0,ttl=0;
 bool offer(const std::string&i,uint32_t now,uint32_t life,bool killed){if(killed||i.empty()||!life||life>86400000)return false;id=i;since=now;ttl=life;state=Awaiting;return true;}
 bool live(uint32_t now){if(state==Awaiting&&now-since>=ttl)state=Expired;return state==Awaiting;}
 bool answer(const std::string&i,bool yes,uint32_t now,bool online,bool killed,bool holdOK){if(i!=id||!live(now)||!online||killed||(yes&&!holdOK))return false;state=yes?Accepted:Refused;return true;}
};
struct Sequence {uint32_t sent=0,received=0;uint32_t next(){return sent==0xffffffffu?0:++sent;}bool accept(uint32_t n){if(!n||n<=received)return false;received=n;return true;}bool ackValid(uint32_t n)const{return n<=sent;}};
inline uint32_t backoff(unsigned attempts){return std::min(30000u,250u<<std::min(attempts,7u));}
inline int acceleration(uint32_t interval){return interval<40?10:interval<100?4:1;}
inline double knob(double value,int delta,uint32_t interval,double step=1,double ceiling=1000000){if(!std::isfinite(value)||!std::isfinite(step)||step<=0)return 1;return std::max(1.,std::min(ceiling,value+delta*step*acceleration(interval)));}
struct Binding {int row=0,col=0;std::string action,label;};
inline int cell(int r,int c){static const int rc[14][2]={{0,0},{0,1},{0,2},{1,0},{1,1},{1,2},{2,0},{2,1},{2,2},{2,3},{3,0},{3,1},{3,2},{3,3}};for(int i=0;i<14;i++)if(rc[i][0]==r&&rc[i][1]==c)return i;return -1;}
inline bool validBindings(const std::vector<Binding>&b){if(b.size()!=14)return false;bool seen[14]={};const char*fixed[14]={"","","","","","","no","yes","","","kill","mic","",""};for(auto &k:b){int i=cell(k.row,k.col);if(i<0||seen[i]||k.action.empty()||k.action.size()>96||k.label.empty()||k.label.size()>16)return false;seen[i]=true;for(char c:k.action)if(!((c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||std::string("_.:-").find(c)!=std::string::npos))return false;for(unsigned char c:k.label)if(c<32||c>126)return false;for(auto s:{"mic","kill","yes","no"})if((k.action==s)!=(std::string(fixed[i])==s))return false;}return true;}
struct Profile {std::string name;std::array<std::vector<Binding>,3> layers;};
inline bool validProfiles(const std::vector<Profile>&p){if(p.empty()||p.size()>8)return false;for(size_t i=0;i<p.size();i++){if(p[i].name.empty()||p[i].name.size()>20)return false;for(size_t j=0;j<i;j++)if(p[j].name==p[i].name)return false;for(auto&l:p[i].layers)if(!validBindings(l))return false;}return true;}
struct Idle {uint32_t last=0;void wake(uint32_t now){last=now;}int brightness(uint32_t now,int value,bool night)const{if(now-last>=600000)return 0;int b=std::max(1,std::min(255,value));if(night)b=std::min(b,40);return now-last>=120000?std::max(1,b/8):b;}};
inline int16_t gate(int16_t sample,int threshold=350){return std::abs(int(sample))<threshold?0:sample;}
inline double energy(const int16_t*p,size_t n){double e=0;for(size_t i=0;i<n;i++)e+=double(p[i])*p[i];return n?std::sqrt(e/n):0;}
}
