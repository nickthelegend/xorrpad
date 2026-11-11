# xorrpad devnet keeper

This is a separate process and the only transaction signer in xorrpad. The desk
continues to return unsigned transactions. The keeper refuses any RPC whose
genesis hash is not Solana devnet and any collateral other than
`3WQ8hCqTNwjrh8WzE2XyoZoUrd1miPcwWfMkmFPUMEWZ` (6-decimal mUSDC).
It checks both before key access and again before each signing/submission.

```bash
npm install --prefix keeper
node keeper/keygen.mjs        # once: prints only the public key
node keeper/fund.mjs          # stops with the precise funding instruction if needed
node keeper/run.mjs --once    # one scheduling pass
node keeper/run.mjs           # separate recurring keeper; stop by its PID
```

The key is `keeper/.keeper-devnet.json`, exclusively created with mode 0600;
key generation refuses an existing key or public metadata. It is gitignored.
The desk reads only `.creator-devnet.json` public metadata, never the key.
Never paste a secret into a terminal, a README, or an environment file.

Funding tries `requestAirdrop` on the public devnet RPC once per keeper key.
If the balance is below 0.5 SOL afterward it stops. Once SOL is funded, the
pm-AMM faucet is requested at most once an hour for mUSDC; balances are confirmed
from chain rather than inferred from the faucet response. Local attempt records
prevent repeated faucet requests on restart.

## Schedule and creation

SOL and BTC expire on the next eligible UTC hour; ETH expires at UTC midnight.
An expiry less than 360 seconds away is skipped to leave room for the program's
300-second minimum. Strikes round the live Pyth price to $1 for SOL, $100 for BTC
and $10 for ETH, using integer arithmetic. Questions are `SOL above $<strike>
at HH:00 UTC?` and equivalents. The on-chain `endTs` is the exact expiry.

`KEEPER_DEPOSIT_USDC` defaults to 50 human mUSDC. The keeper composes the SDK's
`ix.initializeMarket` and `ix.depositLiquidity` builders, with raw 6-decimal
amounts for the deposit, then signs only inside this process. This is equivalent
to the documented [`send.createMarket`](https://predict-pm-amm.dev/llms.txt)
flow. Deterministic creator/template/expiry market ids prevent duplicate markets
on restart. The run lock prevents concurrent keepers; after a crash, inspect its
PID and chain status before removing a stale lock. Pending signatures are never
blindly resubmitted.

## Pyth sources

Feed identities were checked against the official Hermes feed-search endpoint,
matching the full `Crypto.<asset>/USD` symbol rather than the first search hit:

| Asset | Pyth Core/Hermes feed ID | Official source |
|---|---|---|
| SOL/USD | `ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` | [Hermes feed search](https://hermes.pyth.network/v2/price_feeds?query=SOL%2FUSD) |
| BTC/USD | `e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43` | [Hermes feed search](https://hermes.pyth.network/v2/price_feeds?query=BTC%2FUSD) |
| ETH/USD | `ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace` | [Hermes feed search](https://hermes.pyth.network/v2/price_feeds?query=ETH%2FUSD) |

[Official feed-ID guide](https://docs.pyth.network/pro/price-feed-ids).
[Timestamp update API](https://docs.pyth.network/api-reference/hermes/price-updates-at-time).
[Pyth Core upgrade and API-key requirement](https://docs.pyth.network/pro/pyth-core-upgrade).

Hermes now requires `PYTH_API_KEY` in an `Authorization: Bearer` header for price
updates. Set it in the process environment; this code never loads an `.env` file,
prints the credential or writes headers into evidence. An authentication failure
reports `Setup required: PYTH_API_KEY`. Feed discovery remains public. There is
no substitute price source or unsigned-price fallback.
