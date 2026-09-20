# Render the pad's real screens as PNGs, on this machine.
#
# Compiles firmware/xorrpad/ui.h — the file the ESP32 runs — against
# Adafruit_GFX and the shim in shim/. No board required.
#
#   make            build
#   make shots      build and render into out/
#   make open       render and open the folder (macOS)

GFX ?= $(HOME)/Documents/Arduino/libraries/Adafruit_GFX_Library
OUT ?= out
SCALE ?= 2

CXX ?= c++
CXXFLAGS = -std=c++17 -O1 -w -DARDUINO=10819 -Ishim -I$(GFX)

SRC = preview.cpp $(GFX)/Adafruit_GFX.cpp

preview: $(SRC) shim/Arduino.h ../../firmware/xorrpad/ui.h ../../firmware/xorrpad/padstate.h
	@test -d "$(GFX)" || { echo "Adafruit_GFX not found at $(GFX) — set GFX=/path/to/Adafruit_GFX_Library"; exit 1; }
	$(CXX) $(CXXFLAGS) -o $@ $(SRC)

shots: preview
	@./preview $(OUT) $(SCALE)

open: shots
	@open $(OUT)

clean:
	rm -rf preview preview.dSYM $(OUT)

.PHONY: shots open clean
