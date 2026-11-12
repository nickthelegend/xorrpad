#!/bin/sh
# Offline only. No network commands; never emits key material.
set -eu
exec node "$(dirname "$0")/factory-keygen.mjs" "$@"
