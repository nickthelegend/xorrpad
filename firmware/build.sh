#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
: "${XORR_SIGNING_KEY:?Setup required: XORR_SIGNING_KEY path outside repository}"
FQBN='esp32:esp32:esp32s3:FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,CDCOnBoot=cdc'
mkdir -p firmware/build/normal firmware/build/release firmware/build/artifacts
arduino-cli compile --fqbn "$FQBN" --output-dir firmware/build/normal firmware/xorrpad
arduino-cli compile --fqbn "$FQBN" --build-property 'compiler.cpp.extra_flags=-DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0' --build-property 'compiler.c.extra_flags=-DXORR_RELEASE=1 -DCORE_DEBUG_LEVEL=0' --output-dir firmware/build/release firmware/xorrpad
cp firmware/build/release/xorrpad.ino.bin firmware/build/artifacts/app.bin
cp firmware/build/release/xorrpad.ino.merged.bin firmware/build/artifacts/factory.bin
node firmware/sign.mjs firmware/build/artifacts/app.bin firmware/build/artifacts
printf '%s\n' 'Compiled, not yet flashed. Signed artifacts: firmware/build/artifacts/'
