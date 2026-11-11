# xorrpad on Solana: plan for the Perps and Prediction Markets hackathon

## The event
- **Name:** Perps and Prediction Markets, Solana Foundation, at https://hackathons.solana.com/hackathons/perps-and-prediction-markets
- **Deadline:** **Dec 5, 2026**. One-week build window, about 589 registered.
- **Main track:** $100,000 (1st $50k, 2nd $30k, 3rd $20k), judged across every submission. Theme: perpetuals and prediction markets on Solana.
- **Bounty, "Best use of the pm-AMM by PREDICT" (Spark):** a $1,000 investment, plus help raising up to $25k on Backable.
  - **Eligibility:** pm-AMM must be core to the product, not a side feature or a mock. A public repo and a short demo are required.
  - **Judging:**
    - TRACTION is the biggest weight: real on-chain users, trades, volume and fees on the pm-AMM.
    - Why the pm-AMM, versus an order book, LMSR, constant-product or parimutuel.
    - Narrative.
    - Depth of the integration.
    - What works today.
    - Standalone potential.
- **OrbitFlare:** free RPC for participants. Use it.

## Rules that are not negotiable
1. **Solana only.** Remove the X Layer / OKX paths entirely: no second chain anywhere in code, UI, docs or demo.
2. **No mocks of external services, no fake data, no fake success.**
   - Real quotes, real transactions, real explorer links.
   - Anything missing a key or account shows "Setup required" and is marked BLOCKED with the exact credential.
3. **Keep the existing look.** The desk app and pad UI keep their current design language. No restyle; only new screens and features in that same style. Attach before/after screenshots for every UI change.
4. **Signing:** the pad never holds keys.
   - The desk app signs only with the user's wallet, or with a local keypair the user created, under hard caps (per-trade, per-day, leverage).
   - Devnet first. Mainnet transactions only after Nick says yes, with an amount.
5. **Git:** each commit describes only its own diff. Never commit `.env` files or keys.
6. **Licence:** MIT, Copyright (c) 2026 Nivesh Gajengi.

## What we build

**"Wall Street closes. Your desk doesn't."** becomes **"Every market. One desk. Fourteen keys."** xorrpad is a physical trading desk for Solana. Every market perp.so's floor trades, plus the outcome markets around them, sit one key away.

### Three layers on one pad

1. **Spot.** Every spot market perp.so lists: SOL, HYPE, ZEC, PUMP, ORE/stORE, JTO, BONK, and xStocks such as HOOD, NVDA, LLY and TTWO. Trades route through Jupiter. Scrape or list perp.so's market set and keep an allowlist file.
2. **Perps.** Long, short and close with leverage on every perp market a real Solana perps venue lists. **Research task R1 (do first):** compare Drift v2 (including its status after the 2026 exploit), Jupiter Perps, Phoenix perps, Percolator and anything perp.so itself routes to. Score each on:
   - market count, including stocks and gold;
   - SDK quality;
   - devnet availability;
   - fees;
   - whether a TS client can open and close positions headless.

   Write the answer to `docs/VENUES.md` with sources, and pick one primary venue plus an optional second. All perp markets the chosen venue lists must be tradable from the pad.
3. **Predict (the pm-AMM, core).** Every perp market gets live **outcome markets** on the pm-AMM, for example "BTC above $X at 17:00 UTC?" or "SOL up this hour?".
   - Created from the desk app with `@pm-amm/sdk`: program `GV1FMGHRYBjQLaghE5fnGuYCuCcpdt3GD5xEX3TwN16y`, devnet mUSDC `3WQ8hCqTNwjrh8WzE2XyoZoUrd1miPcwWfMkmFPUMEWZ`.
   - One key buys YES and one buys NO. The knob sets size.
   - **Oracle adapter:** resolve each market from Pyth (or the venue's mark price) at `endTs`, automatically and verifiably. This fixes the pm-AMM's stated gap: "Resolution is manual, no oracle".
   - **Hedge pairing:** the desk suggests the pm-AMM outcome that hedges an open perp. Example: long SOL perp, buy "SOL below $X tonight?" YES. Why that beats an order book: the pm-AMM gives always-on liquidity for short-dated outcomes, and LP loss is uniform over time (see the Paradigm paper).

### Traction plan (the bounty's biggest weight)
- **Public web version of the desk app:** no hardware needed, devnet burner wallets per the pm-AMM burner guide, a leaderboard and shareable trade cards.
- **On-chain stats page:** users, trades, volume and fees on our pm-AMM markets, read from chain, not from our own DB.
- **Recurring markets:** hourly and daily markets created automatically by a creator wallet. Fees accrue to that wallet as the market creator.
- **Mainnet:** small mainnet markets only after Nick's yes.

### Hardware (existing)
- **Board:** ESP32-S3 pad with 14 keys, a knob, a microphone and a 2.8" TFT. Firmware is in `firmware/xorrpad`.
- **Key map:**
  - Long, Short, Close.
  - YES, NO.
  - Market up and down.
  - Layer switch (Spot / Perps / Predict).
  - Confirm ✓ and Cancel ✗.
  - Hold-to-talk to the agent.
- **Knob:** size and leverage.

### Agent
- The existing proposal gate (risk limits, allowlist, holdings, daily spend, learned refusals) applies to all three layers.
- Use Claude Haiku (`claude-haiku-5-5`, low effort) only for the voice explanation, never to decide.
- The key is in `~/.config/grokbot/anthropic.env`. Load it by name only.

## Milestones (each one shipped, tested, committed)
1. **Solana only:** remove X Layer, keep tests green.
2. **R1 venue research** in `docs/VENUES.md`, then the perps adapter: open, close and positions, on devnet.
3. **pm-AMM adapter:** create a market, quote, swap YES/NO, positions, claim, on devnet with real transactions.
4. **Oracle resolver:** a Pyth-based auto-resolve service for our markets.
5. **Desk app screens:** Spot / Perps / Predict layers in the existing style, plus a stats page.
6. **Public web desk:** burner wallets, a leaderboard, recurring markets.
7. **Firmware key map** for the three layers.
8. **Submission pack:** README, demo script, `HACKATHON_SUBMISSION_FORM.md`, with traction numbers from chain.
