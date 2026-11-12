#!/bin/sh
set -eu
# Also used by the native padsim driver; same vendored engine as the firmware.
mkdir -p firmware/build/v4-wasm3-native
for source in firmware/xorrpad/src/wasm3/*.c; do
  name=$(basename "$source" .c)
  clang -std=c99 -O2 -Wno-int-to-pointer-cast -Wno-unused-function -c "$source" -o "firmware/build/v4-wasm3-native/$name.o"
done
clang++ -std=c++17 -O2 -c firmware/xorrpad/src/ability-meter.cpp -o firmware/build/v4-wasm3-native/ability-meter.o
ar rcs firmware/build/v4-wasm3-native/libwasm3.a firmware/build/v4-wasm3-native/*.o
