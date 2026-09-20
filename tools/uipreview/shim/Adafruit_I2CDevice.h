#pragma once
// GFX includes this for its I2C display subclasses. The canvas path never
// touches a bus, so an empty declaration is enough to satisfy the include.
#include "Arduino.h"
class Adafruit_I2CDevice { public: Adafruit_I2CDevice() {} };
