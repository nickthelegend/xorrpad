#!/bin/sh
set -eu
sdk/abilities/build.sh
if [ ! -d sdk/abilities/assemblyscript/node_modules/assemblyscript ]; then
  echo "Setup required: npm ci --prefix sdk/abilities/assemblyscript" >&2
  exit 1
fi
npm run build --prefix sdk/abilities/assemblyscript
: "${WASM_CC:=/opt/homebrew/opt/llvm@20/bin/clang}"
: "${WASM_LD:=/opt/homebrew/opt/lld/bin/wasm-ld}"
i=0
for name in sign-escape trade-escape pointer-escape memory-escape spin recurse grow flood macro-escape; do
  i=$((i+1))
  "$WASM_CC" --target=wasm32 -O1 -nostdlib -fno-builtin -DATTACK="$i" -Isdk/abilities/include -c firmware/test/abilities/attacks.c -o "sdk/abilities/out/$name.o"
  "$WASM_LD" --no-entry --export=tick --initial-memory=65536 --max-memory=262144 -z stack-size=8192 "sdk/abilities/out/$name.o" -o "sdk/abilities/out/$name.wasm"
done
