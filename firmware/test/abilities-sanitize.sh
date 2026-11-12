#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
mkdir -p firmware/build/v4-sanitize
for source in firmware/xorrpad/src/wasm3/*.c; do
  name=$(basename "$source" .c)
  clang -std=c99 -O1 -g -fsanitize=address,undefined -fno-omit-frame-pointer -Wno-int-to-pointer-cast -c "$source" -o "firmware/build/v4-sanitize/$name.o"
done
clang++ -std=c++17 -O1 -g -fsanitize=address,undefined -c firmware/xorrpad/src/ability-meter.cpp -o firmware/build/v4-sanitize/ability-meter.o
ar rcs firmware/build/v4-sanitize/libwasm3.a firmware/build/v4-sanitize/*.o
ARDUINO_USER="$(arduino-cli config get directories.user)"
CRYPTO_SRC="$ARDUINO_USER/libraries/Crypto/src"
JSON_SRC="$ARDUINO_USER/libraries/ArduinoJson/src"
clang++ -std=c++17 -O1 -g -fsanitize=address,undefined -fno-omit-frame-pointer -ffunction-sections -fdata-sections -Wl,-dead_strip -I"$CRYPTO_SRC" -I"$JSON_SRC" firmware/test/abilities-driver.cpp "$CRYPTO_SRC/Crypto.cpp" "$CRYPTO_SRC/Hash.cpp" "$CRYPTO_SRC/SHA256.cpp" "$CRYPTO_SRC/SHA512.cpp" "$CRYPTO_SRC/Ed25519.cpp" "$CRYPTO_SRC/Curve25519.cpp" "$CRYPTO_SRC/BigNumberUtil.cpp" firmware/build/v4-sanitize/libwasm3.a -o firmware/build/v4-sanitize/abilities-driver
UBSAN_OPTIONS=halt_on_error=1 ASAN_OPTIONS=detect_leaks=0 XORR_ABILITY_DRIVER="$PWD/firmware/build/v4-sanitize/abilities-driver" node --test --test-concurrency=1 desk/test/abilities.test.mjs
