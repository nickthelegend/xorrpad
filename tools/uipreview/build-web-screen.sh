#!/bin/sh
set -eu
# EMSDK is an installation directory, never a key or credential.
: "${EMSDK:?Setup required: EMSDK directory containing upstream/emscripten}"
: "${GFX:=$HOME/Documents/Arduino/libraries/Adafruit_GFX_Library}"
cd "$(dirname "$0")/../.."
mkdir -p desk/app/public
"$EMSDK/upstream/emscripten/em++" -std=c++17 -include cmath -Oz -w -DARDUINO=10819 \
 -Itools/uipreview/shim -I"$GFX" tools/uipreview/firmware-screen.cpp "$GFX/Adafruit_GFX.cpp" \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web -sFILESYSTEM=0 -sALLOW_MEMORY_GROWTH=1 \
 -sEXPORTED_FUNCTIONS='["_screen_reset","_screen_set","_screen_close","_screen_chart","_screen_render"]' \
 -sEXPORTED_RUNTIME_METHODS='["ccall","HEAPU16"]' -o desk/app/public/firmware-screen.js
