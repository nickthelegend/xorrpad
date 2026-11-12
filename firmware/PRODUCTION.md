# Production security — planning only

**WARNING: secure boot and flash encryption burn irreversible eFuses. A wrong
key, revoked key, locked download mode or incomplete provisioning can permanently
brick a unit. Neither feature has been enabled or run by this change. Do not run
provisioning commands on the development pad.**

The v2 Ed25519 OTA signature authenticates the release manifest and its image
hash in application code. It does **not** enable silicon secure boot or protect
identity keys against physical flash extraction. `XORR_RELEASE=1` disables telnet
and normal USB diagnostics; it does not burn fuses or encrypt NVS.

ESP32-S3 secure boot v2 uses an RSA-PSS hardware boot trust chain, distinct from
our Ed25519 OTA key. Production needs an audited ESP-IDF bootloader/configuration,
protected signing service, deliberate key rotation/revocation, and signed
factory and OTA images. Read [Espressif's secure boot v2 guide](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/security/secure-boot-v2.html).

Flash encryption uses device AES-XTS keys. Release mode changes recovery and
serial-download options. NVS identity material needs **NVS encryption and its key
partition** as well; ordinary NVS is not automatically made confidential by
turning on app flash encryption. Design that partition/key lifecycle before
shipping. Read [Espressif's flash encryption guide](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/security/flash-encryption.html)
and [NVS encryption guide](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-reference/storage/nvs_encryption.html).

Before a separately authorized production provisioning run:

1. Replace the development public OTA key with the production verification key
   in `ota-public-key.hex`, `xorrpad/ota-public-key.h` and
   `../desk/main/firmware-release.mjs`; keep private keys outside the repository
   and outside ordinary build workers. Back up keys in the signing service.
2. Validate a sacrificial unit: signed factory boot, wrong/unsigned OTA refusal,
   power removal during every OTA phase, pending-verify rollback, watchdog and
   brownout recovery, encrypted NVS identity persistence, and recovery policy.
3. Confirm the exact board's encoder wiring. This branch assigns unused GPIO
   9/21/47 to A/B/press; the original v1 board had no wired encoder. Verify the
   assembled PCB before flashing; software compilation cannot establish wiring.
4. Approve and document eFuse/key protection, serial/JTAG restrictions, backup
   images and permanent failure handling. Provision one unit, inspect its
   read-only fuse report, then sign off the manufacturing process.

No fuse-burning, secure-boot enabling, encryption-enabling or upload commands
are included in `build.sh` or the native tests. `factory.sh` is an explicit
physical flash tool and was not run during this implementation.

## This branch enables nothing irreversible

**STOP: enabling Secure Boot v2 or production flash encryption changes eFuses
permanently. Factory reset cannot undo either feature or restore revoked keys.**
This document is planning only, not a provisioning runbook. No enabling SDK
configuration, eFuse write, bootloader replacement or production key operation
is part of S5. The Arduino release flag only hardens application diagnostics;
it is independent of flash-encryption Release Mode. A production boot chain
requires a separate reviewed ESP-IDF/Arduino configuration and sacrificial-unit
validation before any irreversible operation. Existing units' fuse state has
not been inspected or changed.

`XORR_RELEASE=1` removes the telnet server/client/command parser at preprocessing
time. Compile with `CORE_DEBUG_LEVEL=0`; application startup and display logs
are suppressed, WiFiManager diagnostics are off, and SDK runtime logs are
silenced before initialization. ROM/bootloader output is outside this
application flag. USB protocol traffic and the physical factory report remain
available. The USB diagnostic console starts disabled and accepts v2 `debug`
commands only after an authenticated USB desk enables `usbDebug` in a `config`
or `ready` frame. Consent is volatile and bound to the connection generation;
disconnect, transport failover, re-pair or reboot requires new consent.
Neither BLE/Wi-Fi nor legacy v1 can enable or invoke this console.
