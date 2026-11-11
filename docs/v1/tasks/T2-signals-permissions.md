# T2: trade signals, permissions, auto-accept and the session wallet

Read `docs/v1/SPEC.md` first.

1. **Permissions.** Add `desk/main/permissions.mjs`, stored in the app data directory as JSON, with no secrets in it. The policy:
   - auto-accept is **off by default**, and can be set per venue and per kind;
   - caps: per trade, per day, max leverage and max open positions;
   - market allowlist and denylist;
   - cooldown between trades;
   - quiet hours;
   - "always ask above $X".

   `decide.mjs` consults the policy after the memory rules. Every decision records which rule decided it.
2. **Signals.** Add `desk/main/signals.mjs`, a queue of proposals with these states: `proposed → (auto_accepted | awaiting) → accepted | refused | expired → signed → executed | failed`.
   - Events stream over WebSocket at `/events`, for the desk UI, the pad and the phone app.
   - `POST /signals/:id/accept` and `POST /signals/:id/refuse` take the same pad-token auth the existing routes use.
   - A signal expires after N seconds (default 60) when nobody answers.
3. **Session wallet.** Add `desk/main/session-wallet.mjs`.
   - It creates or imports a keypair and stores it through Electron `safeStorage`.
   - For Node-only test runs, it uses a 0600 file in the app data dir that is gitignored, and it refuses to run if that file is world-readable.
   - It shows only the public key.
   - It signs only for transactions the gate accepted and only within the caps.
   - Mainnet needs `XORR_ALLOW_MAINNET=I_ACKNOWLEDGE_REAL_FUNDS`; without it, mainnet signing is refused with that message.
   - Phone-wallet mode, the Solana Pay request URL, stays the default.
4. **Executor.** Add `desk/main/executor.mjs`.
   - It signs with the session wallet or waits for the phone wallet's signature.
   - It sends and confirms, then writes the receipt (signature and explorer link) to memory and to `/events`.
5. **Devnet proof.** Run one real cycle with the session wallet on devnet:
   - pm-AMM signal → auto-accept under the policy → sign → confirmed → receipt.
   - It needs devnet SOL. If the wallet is unfunded, mark it BLOCKED in `TESTING.md` with the exact public key to fund and the amount (0.2 SOL plus 20 mUSDC from the pm-AMM faucet). Never fake it.
6. **Tests.** Cover the policy (every rule refuses on its own), the state machine, expiry, auth, refusal of mainnet without the ack, and the file-permission check.

Make one commit per step.
