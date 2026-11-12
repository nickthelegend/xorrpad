// Public inputs only; real production certificate/proof verifier.
#include "../xorrpad/logic/attestation.h"
#include <iostream>
int main() {
  std::string line; if (!std::getline(std::cin, line) || line.size() > 4095) return 1;
  JsonDocument d; xorr::DeviceCertificate c; uint8_t root[32];
  bool ok = !deserializeJson(d, line) &&
    xorr::parseCertificate(d["certificate"], c) &&
    xorr::unhex(d["root"] | "", root, 32) &&
    c.verifyProof(root, d["device"] | "", d["deviceKey"] | "",
                  d["context"] | "", d["signature"] | "");
  std::cout << (ok ? "verified\n" : "unverified\n");
}
