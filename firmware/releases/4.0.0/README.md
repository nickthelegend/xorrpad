# 4.0.0 unsigned OTA metadata

`pro/manifest.unsigned.json` and `core/manifest.unsigned.json` describe the actual
compiled application images from `bash firmware/build-unsigned.sh`. Each contains
the OTA version, stable channel, rollout, SHA-256, size, minimum desktop version
and all seven original v4 features plus F8 SCAN notes. Image binaries remain local ignored build output.

These manifests contain **no signature** and cannot authorize an update. Existing
OTA validation must reject them. No signing key was opened, no production signing
step was run, and no update was published or flashed. Rebuilding can change the
image hashes; regenerate metadata from the matching image bytes every time.

See [release notes](../../../docs/v4/RELEASE-4.0.0.md) and
[verification](../../../TESTING.md).
