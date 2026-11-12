`qrcodegen.c` and `qrcodegen.h` from Espressif's qrcode component (only line
endings normalized to LF):
https://github.com/espressif/idf-extra-components/tree/0f80e5b83d66d9f3a951fa227bc43779150eb944/qrcode

The MIT notices are retained in both files; the component LICENSE is included.
The native/WASM adapter uses the same encodeText options as esp_qrcode_generate.
ESP32 uses its installed esp_qrcode component, as pairing already does.
