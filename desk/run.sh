#!/usr/bin/env bash
# Boot the desk backend. CHAIN picks the venue; nothing here holds a key.
set -a; [ -f ../.env ] && . ../.env; set +a
export CHAIN=${CHAIN:-solana}
export PAD_TOKEN=${PAD_TOKEN:-xorrpad-dev}
export SIBYL_DB=${SIBYL_DB:-/tmp/xorrpad.db}
export SOLANA_ADDRESS=${SOLANA_ADDRESS:-53K648TGMNKwrvvk2Zrj8ckdzHanEH3iBTyjp1GrMxww}
exec node main/server.mjs
