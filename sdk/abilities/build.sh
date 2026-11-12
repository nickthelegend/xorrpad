#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
: "${WASM_CC:=/opt/homebrew/opt/llvm@20/bin/clang}"
: "${WASM_LD:=/opt/homebrew/opt/lld/bin/wasm-ld}"
mkdir -p sdk/abilities/out
for ability in c/ability samples/market-pulse samples/pomodoro; do
  "$WASM_CC" --target=wasm32 -O2 -nostdlib -fno-builtin -Isdk/abilities/include -c "sdk/abilities/$ability.c" -o "sdk/abilities/out/$(basename "$ability").o"
  "$WASM_LD" --no-entry --export=tick --initial-memory=65536 --max-memory=262144 -z stack-size=8192 "sdk/abilities/out/$(basename "$ability").o" -o "sdk/abilities/out/$(basename "$ability").wasm"
done
