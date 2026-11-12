#!/bin/sh
# This script deliberately flashes a physical device. Never run during compile-only validation.
set -eu
cd "$(dirname "$0")/.."
: "${1:?Usage: firmware/factory.sh SERIAL_PORT [SERIAL_NUMBER]}"
: "${XORR_FACTORY_BIN:=firmware/build/artifacts/factory.bin}"
"${XORR_FACTORY_PYTHON:-python3}" -m esptool --chip esp32s3 --port "$1" write-flash 0x0 "$XORR_FACTORY_BIN"
printf '%s\n' 'Hold 01+14 while resetting the unit. Complete each test on its TFT.'
node firmware/factory.mjs "$1" "${2:-}"
