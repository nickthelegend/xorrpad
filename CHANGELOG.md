# Changelog

All notable changes are documented here, using Keep a Changelog conventions.

## [1.0.0] - 2026-11-12

### Added

- Persisted permissions after memory gates, with explicit deciding rule IDs.
- Expiring trade signals, authenticated accept/refuse routes and WebSocket events.
- Optional safeStorage session wallet, protected Node storage and mainnet acknowledgement.
- Shared executor with phone-wallet default, durable cap reservations and confirmed receipts.
- Policy, lifecycle, wallet, auth and live devnet signature checks, plus a repeatable funded-cycle proof.

### Known limitations

- The real session-wallet trade cycle is blocked on devnet SOL and mUSDC funding; see TESTING.md.
- Packaged safeStorage, public phone-wallet TLS and physical pad playback need end-to-end verification.
