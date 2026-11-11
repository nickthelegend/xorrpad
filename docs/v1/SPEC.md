# xorrpad v1: the spec

Nick's brief (Nov 12 2026), restated:

- **The product.** One physical pad, plus a desk app, plus the XOR phone app. Every Solana venue sits behind one set of keys. The pad creates trades, executes them, pushes trade signals for you to accept, and can auto-accept them under permissions you set.
- **Order of work.** First a working demo on the ESP32-S3 board. Then a waitlist and pre-orders. Bulk manufacturing comes after that.
- **Out of scope for v1.** A paid, subscription-hosted LLM comes later, after funding. In v1 the user brings their own model and keys.

Versioning: everything in this pass ships as **v1.0.0**:
- firmware `XORR_FW_VERSION "1.0.0"`;
- desk `package.json` `1.0.0`;
- the `CHANGELOG.md` at the repo root, in Keep a Changelog format;
- a git tag `v1.0.0`, created by Claude after review.

**Don't remove any existing feature.** v1 only adds.

## Architecture

```
 ┌────────── xorrpad (ESP32-S3) ──────────┐      BLE GATT  ┌──────── XOR phone app (Expo) ───────┐
 │ 14 keys · knob · mic · amp · 2.8" TFT  │◄──────────────►│ pair · trade signals · accept/deny  │
 │ fw v1: link mgr (USB-CDC | BLE | Wi-Fi)│                │ push notifications · wallet signing │
 └──────────────┬─────────────────────────┘                └──────────────┬──────────────────────┘
       USB-C serial (CDC, newline JSON)  or  Wi-Fi → Tailscale             │ HTTPS (Tailscale / public URL)
                ▼                                                          ▼
 ┌────────────────────────── XOR desktop (Electron, runs on the Mac mini) ──────────────────────────┐
 │ link server (serial + HTTP + WS) · agent (LLM over Tailscale: Ollama local, or provider key)      │
 │ voice: Deepgram STT (mic audio from the pad) + Deepgram TTS (to the pad's amp), slang persona     │
 │ aggregator: Jupiter spot (routes Meteora/Orca/Raydium/Phoenix spot) · Meteora DLMM direct quotes  │
 │             · Phoenix perps · Jupiter Perps (read + quote) · pm-AMM outcome markets               │
 │ gate (memory + permissions) → signer: phone wallet (Solana Pay QR / app) | session wallet (caps)  │
 │ UI: pad mirror · key programmer · chats · models & keys · permissions · positions · backtest      │
 └──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Trade lifecycle (the same for every venue)

1. **Signal.** It comes from a strategy scan, the agent chat, a voice command or a pad key.
2. **Proposal.** The best route is picked across venues (the aggregator), with a quote and fees.
3. **Gate.** `decide.mjs` applies the memory rules and the permissions:
   - per-trade cap;
   - daily cap;
   - leverage cap;
   - venue and market allowlist;
   - cooldown.
4. **Accept.** The proposal is accepted in one of three ways:
   - **Manual:** press ✓ on the pad, or tap Accept in the phone app or the desk.
   - **Auto-accept:** only when the permission policy allows this venue, market and size. It is off by default, and every auto-accept is logged and spoken.
   - **Refuse:** press ✗ or let it time out.
5. **Sign.** The default is the phone wallet. The alternative is a *session wallet*: a local keypair the user creates and funds, held in Electron `safeStorage` (Keychain), used only within the caps. Mainnet signing needs `XORR_ALLOW_MAINNET=I_ACKNOWLEDGE_REAL_FUNDS`; devnet works without it.
6. **Execute and receipt.** The signature and explorer link go to the TFT, the desk and the phone, and the receipt is written to memory.

## Hard rules for every task
- **Pushing:** commit per logical diff, each message describing only its own diff, ending `Co-Authored-By: Codex <noreply@openai.com>`. **No push**; Claude reviews and pushes.
- **Secrets:** never open, print or commit secrets or `.env` files. API keys (LLM, Deepgram, Tailscale) are entered in the desk UI and stored with `safeStorage`; they are never written to plain files or logs. `.env.example` only gains new names.
- **No mocks, no fake data:**
  - Real devnet or mainnet reads, real quotes.
  - Our own tests send transactions only on devnet.
  - A missing key or account shows `Setup required: <VAR or action>`.
- **Processes:** kill by PID. Use ports 8710–8729.
- **Tests:** never delete or weaken them.
- **Firmware:** must compile with `arduino-cli` for an ESP32-S3 board. Record the exact FQBN and command in `firmware/README.md`. If the core is missing, install it with `arduino-cli core install esp32:esp32`.
- **Hardware truth:** we can compile but not flash on camera. Anything untested on hardware is labelled "compiled, not yet flashed" in `TESTING.md`.

## Judging target: 9/10

The bar:
- Everything above works live: real quotes on every venue, a real devnet pm-AMM trade cycle, the pad link proven over USB serial with the pad simulator, and the desk UI at Dribbble polish.
- Docs and a deployment table.
- `TESTING.md` with real counts.
- A waitlist and pre-order landing.
- A clean `CHANGELOG`.
