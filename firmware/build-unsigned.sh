#!/bin/sh
# MIT · Copyright (c) 2026 Nivesh Gajengi
set -eu
cd "$(dirname "$0")/.."
FQBN='esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc'
for variant in pro core; do
  flags='-DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0 -DCONFIG_BT_NIMBLE_SM_SC_ONLY=1'
  if [ "$variant" = core ]; then flags="$flags -DXORR_CORE=1"; fi
  arduino-cli compile --jobs 4 --fqbn "$FQBN" \
    --build-property "compiler.cpp.extra_flags=$flags" \
    --build-property "compiler.c.extra_flags=$flags" \
    --build-path "firmware/build/f7-$variant" \
    --output-dir "firmware/build/f7-$variant-out" firmware/xorrpad
  node firmware/prepare-release.mjs "firmware/build/f7-$variant-out/xorrpad.ino.bin" \
    "firmware/releases/4.0.0/$variant/manifest.unsigned.json"
done
printf '%s\n' 'Compiled, not yet flashed. Unsigned manifests require production signing before OTA.'
