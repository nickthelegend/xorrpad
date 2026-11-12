#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
CRYPTO_PREFIX="$(brew --prefix openssl@3)"
mkdir -p firmware/build
clang++ -std=c++17 -DXORR_NATIVE -Wall -Wextra -Werror -I"$CRYPTO_PREFIX/include" -Ifirmware/test/vendor firmware/test/logic.cpp -L"$CRYPTO_PREFIX/lib" -lcrypto -o firmware/build/native-tests
firmware/build/native-tests
