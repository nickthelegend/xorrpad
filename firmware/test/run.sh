#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
ARDUINO_USER="$(arduino-cli config get directories.user)"
CRYPTO_SRC="$ARDUINO_USER/libraries/Crypto/src"
JSON_SRC="$ARDUINO_USER/libraries/ArduinoJson/src"
OPUS_SRC="$ARDUINO_USER/libraries/codec-opus"
mkdir -p firmware/build
firmware/test/abilities-build.sh
firmware/test/abilities-fixtures.sh
cmake -S "$OPUS_SRC" -B firmware/build/opus-native > firmware/build/opus-native.log 2>&1
cmake --build firmware/build/opus-native -j 4 >> firmware/build/opus-native.log 2>&1
# Dead-strip unused RNG entry points: no Arduino adapters or hardware mocks are linked.
clang++ -std=c++17 -O1 -ffunction-sections -fdata-sections -Wl,-dead_strip -Wall -Wextra -Werror -I"$CRYPTO_SRC" -I"$JSON_SRC" -Ifirmware/test/vendor -I"$OPUS_SRC/src" firmware/test/ota.cpp firmware/test/scan.cpp firmware/test/journal.cpp firmware/test/ambient.cpp firmware/test/earcons.cpp firmware/test/tilt-guard.cpp firmware/test/crew.cpp firmware/test/price-alerts.cpp firmware/test/abilities.cpp firmware/test/attestation.cpp firmware/test/session-sign.cpp firmware/test/solana.cpp firmware/test/presentation.cpp firmware/test/release.cpp firmware/test/factory.cpp firmware/test/health.cpp firmware/test/voice.cpp firmware/test/logic.cpp firmware/test/kill-switch.cpp firmware/test/profiles.cpp firmware/test/knob.cpp firmware/test/pairing.cpp firmware/test/protocol.cpp "$CRYPTO_SRC/Crypto.cpp" "$CRYPTO_SRC/Hash.cpp" "$CRYPTO_SRC/SHA256.cpp" "$CRYPTO_SRC/SHA512.cpp" "$CRYPTO_SRC/Ed25519.cpp" "$CRYPTO_SRC/Curve25519.cpp" "$CRYPTO_SRC/BigNumberUtil.cpp" "$CRYPTO_SRC/Cipher.cpp" "$CRYPTO_SRC/AuthenticatedCipher.cpp" "$CRYPTO_SRC/ChaCha.cpp" "$CRYPTO_SRC/Poly1305.cpp" "$CRYPTO_SRC/ChaChaPoly.cpp" firmware/build/v4-wasm3-native/libwasm3.a firmware/build/opus-native/libarduino_libopus.a -o firmware/build/native-tests
firmware/build/native-tests

clang++ -std=c++17 -O1 -ffunction-sections -fdata-sections -Wl,-dead_strip -Wall -Wextra -Werror -I"$CRYPTO_SRC" -I"$JSON_SRC" firmware/test/session-driver.cpp "$CRYPTO_SRC/Crypto.cpp" "$CRYPTO_SRC/Hash.cpp" "$CRYPTO_SRC/SHA256.cpp" "$CRYPTO_SRC/SHA512.cpp" "$CRYPTO_SRC/Ed25519.cpp" "$CRYPTO_SRC/Curve25519.cpp" "$CRYPTO_SRC/BigNumberUtil.cpp" -o firmware/build/session-driver

clang++ -std=c++17 -O1 -ffunction-sections -fdata-sections -Wl,-dead_strip -Wall -Wextra -Werror -I"$CRYPTO_SRC" -I"$JSON_SRC" firmware/test/attestation-driver.cpp "$CRYPTO_SRC/Crypto.cpp" "$CRYPTO_SRC/Hash.cpp" "$CRYPTO_SRC/SHA256.cpp" "$CRYPTO_SRC/SHA512.cpp" "$CRYPTO_SRC/Ed25519.cpp" "$CRYPTO_SRC/Curve25519.cpp" "$CRYPTO_SRC/BigNumberUtil.cpp" -o firmware/build/attestation-driver

clang++ -std=c++17 -O1 -ffunction-sections -fdata-sections -Wl,-dead_strip -Wall -Wextra -Werror -I"$CRYPTO_SRC" -I"$JSON_SRC" firmware/test/abilities-driver.cpp "$CRYPTO_SRC/Crypto.cpp" "$CRYPTO_SRC/Hash.cpp" "$CRYPTO_SRC/SHA256.cpp" "$CRYPTO_SRC/SHA512.cpp" "$CRYPTO_SRC/Ed25519.cpp" "$CRYPTO_SRC/Curve25519.cpp" "$CRYPTO_SRC/BigNumberUtil.cpp" firmware/build/v4-wasm3-native/libwasm3.a -o firmware/build/abilities-driver

clang++ -std=c++17 -O1 -ffunction-sections -fdata-sections -Wl,-dead_strip -Wall -Wextra -Werror -I"$CRYPTO_SRC" -I"$JSON_SRC" firmware/test/crew-driver.cpp "$CRYPTO_SRC/Crypto.cpp" "$CRYPTO_SRC/Hash.cpp" "$CRYPTO_SRC/SHA256.cpp" -o firmware/build/crew-driver

clang++ -std=c++17 -O1 -ffunction-sections -fdata-sections -Wl,-dead_strip -Wall -Wextra -Werror -I"$CRYPTO_SRC" -I"$JSON_SRC" firmware/test/ota-driver.cpp "$CRYPTO_SRC/Crypto.cpp" "$CRYPTO_SRC/Hash.cpp" "$CRYPTO_SRC/SHA256.cpp" "$CRYPTO_SRC/SHA512.cpp" "$CRYPTO_SRC/Ed25519.cpp" "$CRYPTO_SRC/Curve25519.cpp" "$CRYPTO_SRC/BigNumberUtil.cpp" -o firmware/build/ota-driver

clang++ -std=c++17 -O1 -Wall -Wextra -Werror -I"$JSON_SRC" firmware/test/tilt-driver.cpp -o firmware/build/tilt-driver

clang++ -std=c++17 -O1 -Wall -Wextra -Werror -I"$JSON_SRC" firmware/test/earcon-driver.cpp -o firmware/build/earcon-driver

clang++ -std=c++17 -O1 -Wall -Wextra -Werror -I"$JSON_SRC" firmware/test/ambient-driver.cpp -o firmware/build/ambient-driver
