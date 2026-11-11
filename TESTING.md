# Test results — Solana-only desk and pm-AMM

Run on 2026-11-12 (Asia/Kolkata), Node 26.5.0.

| Run | Tests | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Milestone 1: `npm test --prefix desk` | 2 | 2 | 0 | 0 |
| Final: `npm test --prefix desk` | 12 | 11 | 0 | 1 |
| pm-AMM subset: `node --test desk/test/pmamm*.test.mjs` | 10 | 9 | 0 | 1 |

The original memory and load-bearing assertions remain intact. They use real
SQLite through `sibyl-memory-client==0.4.19`, pinned in
`desk/memory/requirements.txt` to match the bridge's local-storage API. Install
with `python3 -m venv .venv` and
`.venv/bin/pip install -r desk/memory/requirements.txt`.

The Node test command now explicitly discovers `test/*.test.mjs`; `node --test
test/` failed to resolve the directory under Node 26 before any tests ran.
Legacy EVM gas/stress diagnostics now read or simulate on devnet and never sign.
The separate interactive `test/verify.mjs` was updated but was not run.

## Real devnet evidence

- Read 97 live mUSDC markets from program
  `GV1FMGHRYBjQLaghE5fnGuYCuCcpdt3GD5xEX3TwN16y`, including actual vault
  liquidity and current prices calculated with the upstream decay-aware helpers.
- Quoted both YES and NO for 1 mUSDC; the fee was 20,000 raw units (0.02 mUSDC).
- Built and deserialized both swaps; every signature was zero and the fee payer
  was the throwaway public key. Checked the 1% minimum output against the quote.
- Built an unsigned market creation with a 1 mUSDC deposit, read the throwaway
  owner's actual positions and built a claim against a real resolved market.
- Called real `simulateTransaction` with `sigVerify:false` and
  `replaceRecentBlockhash:true`. The chain returned `AccountNotFound` for the
  unfunded throwaway owner. A SOL airdrop attempt returned HTTP 410 with
  `The RPC faucet is closed on this cluster`. The successful-simulation test
  was therefore **skipped**, never reported as successful.
- Final-run throwaway public key:
  `FM6YiQBys7gQL1PyZXShXYeaL36Kbtsc8x2nF46KrjqV`.
  No corresponding secret key was generated, held or used.

## Protocol and safety checks

- The actual HTTP server ran on **127.0.0.1:8711** and was closed after the test.
  Checks covered authentication, method restrictions, malformed JSON, invalid
  public keys and live `/pm/markets` responses.
- Solana Pay metadata and POST requests were exercised through the real local
  HTTP route using an actual chain-built creation transaction. Tests used a
  localhost HTTPS origin for URL-format checks and called its local HTTP route;
  this does not validate public TLS or a phone-wallet connection.
- A different wallet was refused. The matching account received a fresh,
  unsigned serialized transaction. No app-side signing or broadcast occurred.
- All venue signing entry points refuse, and the signing-call regression checks
  pass. The adapter checks the devnet genesis hash before chain reads/builds.
- Amount precision, overflow and quote-input validation passed. Live read
  caches coalesce requests for at least 15 seconds; no polling process remains.
- `git diff --check` passed. No mainnet transactions, API mocks or fake fills.

## BLOCKED / remaining setup

- **Successful devnet swap simulation:** set `PMAMM_TEST_OWNER` to a throwaway
  public address funded with devnet SOL and at least 1 mUSDC. The public RPC's
  faucet is closed (HTTP 410). The test then requires `err === null`; other
  program failures are test failures. `PMAMM_RPC` may select another devnet RPC.
- **Phone-wallet end to end:** set `PMAMM_PUBLIC_URL` to a publicly reachable
  HTTPS origin routing to this backend. Until then, builders return the unsigned
  transaction plus `Setup required: PMAMM_PUBLIC_URL`, with no fabricated URL.
  The equivalent Jupiter variable is `SOLANA_PAY_PUBLIC_URL`.
- Missing transaction owners report `Setup required: SOLANA_ADDRESS`.
  No signer keys or new credentials are required by the desk.
- Oracle resolution belongs to a later milestone. Claims require an already
  resolved market. The spot strategy scan has no verified xStock candle adapter
  and reports its setup requirement rather than using the removed Base feed.

## Renderer evidence

The existing fonts, palette, layout and components were preserved. Changes
remove obsolete chain choices and the EVM fallback book. Screenshots are static
captures of the actual renderer with the backend disconnected, so the connection
warning and unavailable values are visible; no network response was substituted.

| Surface | Before | After |
|---|---|---|
| Desk, 1440 | [before](docs/screens/solana-only-before-1440.png) | [after](docs/screens/solana-only-after-1440.png) |
| Desk, 375 | [before](docs/screens/solana-only-before-375.png) | [after](docs/screens/solana-only-after-375.png) |
| Markets, 1440 | [before](docs/screens/solana-markets-before-1440.png) | [after](docs/screens/solana-markets-after-1440.png) |
| Markets, 375 | [before](docs/screens/solana-markets-before-375.png) | [after](docs/screens/solana-markets-after-375.png) |
| Setup, 1440 | [before](docs/screens/solana-setup-before-1440.png) | [after](docs/screens/solana-setup-after-1440.png) |
| Setup, 375 | [before](docs/screens/solana-setup-before-375.png) | [after](docs/screens/solana-setup-after-375.png) |

## Files touched across both milestones

Includes removed legacy files and the stale absolute `desk/node_modules`
symlink; dependencies now install into the ignored local directory.

- `.env.example`
- `README.md`
- `TESTING.md`
- `desk/electron.mjs`
- `desk/main/agents.mjs`
- `desk/main/chain.mjs`
- `desk/main/chains/index.mjs`
- `desk/main/chains/pm-amm-helpers.mjs`
- `desk/main/chains/pmamm.mjs`
- `desk/main/chains/solana.mjs`
- `desk/main/chains/xlayer.mjs`
- `desk/main/dex.mjs`
- `desk/main/electron.mjs`
- `desk/main/fork.mjs`
- `desk/main/markets.mjs`
- `desk/main/memory.mjs`
- `desk/main/routers/index.mjs`
- `desk/main/routers/kyberswap.mjs`
- `desk/main/routers/uniswap.mjs`
- `desk/main/scan.mjs`
- `desk/main/server.mjs`
- `desk/main/stocks.mjs`
- `desk/main/tokens.mjs`
- `desk/main/trader.mjs`
- `desk/main/wallet-requests.mjs`
- `desk/main/xstocks.mjs`
- `desk/memory/requirements.txt`
- `desk/node_modules`
- `desk/package-lock.json`
- `desk/package.json`
- `desk/renderer/index.html`
- `desk/renderer/setup.html`
- `desk/test/devnet-rpc.mjs`
- `desk/test/env.mjs`
- `desk/test/gas-drift.mjs`
- `desk/test/mainnet-conditions.mjs`
- `desk/test/pmamm.devnet.test.mjs`
- `desk/test/pmamm.http.test.mjs`
- `desk/test/pmamm.test.mjs`
- `desk/test/stress.mjs`
- `desk/test/verify.mjs`
- `docs/screens/06-xlayer.png`
- `docs/screens/solana-markets-after-1440.png`
- `docs/screens/solana-markets-after-375.png`
- `docs/screens/solana-markets-before-1440.png`
- `docs/screens/solana-markets-before-375.png`
- `docs/screens/solana-only-after-1440.png`
- `docs/screens/solana-only-after-375.png`
- `docs/screens/solana-only-before-1440.png`
- `docs/screens/solana-only-before-375.png`
- `docs/screens/solana-setup-after-1440.png`
- `docs/screens/solana-setup-after-375.png`
- `docs/screens/solana-setup-before-1440.png`
- `docs/screens/solana-setup-before-375.png`
- `tools/uipreview/preview.cpp`
