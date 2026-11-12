#!/bin/sh
# Physical flash tool. Never run during compile-only validation.
set -eu
cd "$(dirname "$0")/.."
if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  printf '%s\n' 'Usage: firmware/factory.sh SERIAL_PORT esp32-<12 hex eFuse MAC> [ED25519_PUBLIC_KEY]' >&2
  exit 1
fi
unit=${2#esp32-}
case "$2:$unit" in esp32-*:*[!0-9a-f]*) printf 'FAIL %s: invalid eFuse serial\n' "$2" >&2; exit 1;; esac
if [ "$unit" = "$2" ] || [ "${#unit}" -ne 12 ]; then
  printf 'FAIL %s: invalid eFuse serial\n' "$2" >&2; exit 1
fi
: "${XORR_FACTORY_BIN:=firmware/build/artifacts/factory.bin}"
if ! "${XORR_FACTORY_PYTHON:-python3}" -m esptool --chip esp32s3 --port "$1" write-flash 0x0 "$XORR_FACTORY_BIN"; then
  printf 'FAIL %s: flash failed\n' "$2" >&2
  exit 1
fi
node firmware/factory.mjs "$1" "$2" "${3:-}"
