#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
ARDUINO_USER="$(arduino-cli config get directories.user)"
CRYPTO_SRC="$ARDUINO_USER/libraries/Crypto/src"
JSON_SRC="$ARDUINO_USER/libraries/ArduinoJson/src"
mkdir -p firmware/build
# Dead-strip unused RNG entry points: no Arduino adapters or hardware mocks are linked.
clang++ -std=c++17 -O1 -ffunction-sections -fdata-sections -Wl,-dead_strip -Wall -Wextra -Werror -I"$CRYPTO_SRC" -I"$JSON_SRC" -Ifirmware/test/vendor firmware/test/logic.cpp firmware/test/pairing.cpp firmware/test/protocol.cpp "$CRYPTO_SRC/Crypto.cpp" "$CRYPTO_SRC/Hash.cpp" "$CRYPTO_SRC/SHA256.cpp" "$CRYPTO_SRC/SHA512.cpp" "$CRYPTO_SRC/Ed25519.cpp" "$CRYPTO_SRC/Curve25519.cpp" "$CRYPTO_SRC/BigNumberUtil.cpp" "$CRYPTO_SRC/Cipher.cpp" "$CRYPTO_SRC/AuthenticatedCipher.cpp" "$CRYPTO_SRC/ChaCha.cpp" "$CRYPTO_SRC/Poly1305.cpp" "$CRYPTO_SRC/ChaChaPoly.cpp" -o firmware/build/native-tests
firmware/build/native-tests
