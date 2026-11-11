# T1: one aggregator across every Solana venue

Read `docs/v1/SPEC.md` (hard rules) and `docs/VENUES.md` first.

1. **Meteora direct venue.** Add `desk/main/chains/meteora.mjs`.
   - Read DLMM pairs and quotes from Meteora's public API and SDK (`@meteora-ag/dlmm`, https://docs.meteora.ag).
   - Build unsigned swaps for an explicit owner.
   - Add DAMM v2 pools if the SDK makes it cheap.
2. **Jupiter Perps.** Add `desk/main/chains/jupperps.mjs`.
   - Read its markets (SOL, ETH, BTC), mark price, borrow rate, pool liquidity, and a quote for long or short at a given size and leverage, from real on-chain and API data.
   - Build unsigned open and close instructions if a maintained SDK or IDL exists. If not, make it read and quote only and say so in `docs/VENUES.md`.
3. **The router.** Add `desk/main/aggregate.mjs`.
   - `route({kind: "spot"|"perp"|"predict", market, side, size, leverage?})` asks every venue that lists the market in parallel. Spot goes to Jupiter (which itself routes Meteora, Orca, Raydium and more) and Meteora direct. Perps go to Phoenix and Jupiter Perps. Predictions go to the pm-AMM.
   - It returns `best` plus `alternatives`, each with price, fees, impact, liquidity, venue and a "why".
   - A venue that times out or errors is listed with its error. It is never dropped silently and never given a made-up quote.
   - Expose it as `/route` and `/venues` (health and market counts per venue).
4. **Wire it in.** The pad's BUY, SELL, LONG and SHORT keys and the agent's propose tool go through `route()`, and the gate in `decide.mjs` still decides.
5. **Live tests.** Add `desk/test/aggregate.live.test.mjs`:
   - it quotes SOL spot on two venues;
   - it quotes a SOL perp on two venues;
   - it lists pm-AMM markets.
   - Skip, with a printed reason, only when a venue is unreachable.
6. **Record results.** Update `TESTING.md` with the counts and `docs/VENUES.md` with the venue table: venue, kind, markets, network, signing status.

Make one commit per step.
