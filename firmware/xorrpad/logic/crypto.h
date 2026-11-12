#pragma once
#include "safety.h"
#ifdef XORR_NATIVE
#include <openssl/evp.h>
#else
#include <SHA256.h>
#include <Ed25519.h>
#endif
namespace xorr {
inline std::array<uint8_t,32> sha(const void *p,size_t n){std::array<uint8_t,32>d{};
#ifdef XORR_NATIVE
unsigned int len=32;EVP_Digest(p,n,d.data(),&len,EVP_sha256(),nullptr);
#else
SHA256 h;h.update(p,n);h.finalize(d.data(),32);
#endif
return d;}
inline std::string hex(const uint8_t*p,size_t n){std::string s;const char*h="0123456789abcdef";for(size_t i=0;i<n;i++){s+=h[p[i]>>4];s+=h[p[i]&15];}return s;}
inline bool unhex(const std::string&s,uint8_t*p,size_t n){if(s.size()!=n*2)return false;auto v=[](char c){return c>='0'&&c<='9'?c-'0':c>='a'&&c<='f'?c-'a'+10:-1;};for(size_t i=0;i<n;i++){int a=v(s[2*i]),b=v(s[2*i+1]);if(a<0||b<0)return false;p[i]=a*16+b;}return true;}
inline std::string fingerprint(const Signal&s){auto c=s.canonical();auto d=sha(c.data(),c.size());return base58(d.data(),32).substr(0,6);}
struct Manifest {std::string version,sha256,signature,minDesk,notes;uint32_t size=0;
 std::string signedText()const{return "xorrpad-ota-v2\n"+version+"\n"+sha256+"\n"+std::to_string(size)+"\n"+minDesk+"\n"+notes;}
 bool valid()const{uint8_t d[32],s[64];return version=="2.0.0"&&size>0&&size<=0x300000&&minDesk=="1.0.0"&&notes.size()<=512&&notes.find('\n')==std::string::npos&&unhex(sha256,d,32)&&unhex(signature,s,64);}
 bool verify(const uint8_t pk[32])const{uint8_t sig[64];if(!valid()||!unhex(signature,sig,64))return false;auto text=signedText();
#ifdef XORR_NATIVE
auto key=EVP_PKEY_new_raw_public_key(EVP_PKEY_ED25519,nullptr,pk,32);auto ctx=EVP_MD_CTX_new();bool ok=key&&ctx&&EVP_DigestVerifyInit(ctx,nullptr,nullptr,nullptr,key)==1&&EVP_DigestVerify(ctx,sig,64,(const unsigned char*)text.data(),text.size())==1;EVP_MD_CTX_free(ctx);EVP_PKEY_free(key);return ok;
#else
return Ed25519::verify(sig,pk,text.data(),text.size());
#endif
}
};
}
