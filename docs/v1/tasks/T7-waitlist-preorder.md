# T7: landing, waitlist and pre-order (site/)

Read `docs/v1/SPEC.md` first.

1. **The site.** `site/` is a standalone Vite static site plus Vercel serverless functions in `site/api/`.
   - Sections: the hero (the real photo `docs/pad.jpg` and real desk screenshots from `docs/screens/v1/`), how it works (pad → desk → venues), the venues, the safety model (gate, caps, you sign), the specs, the waitlist, the pre-order and an FAQ.
   - Its own premium look, distinct from the desk, with only real claims. No fake counters or testimonials.
2. **Waitlist.** `site/api/waitlist.js` validates the email and stores it in Upstash Redis via REST (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`).
   - Missing env → HTTP 503 `Setup required: UPSTASH_REDIS_REST_URL`, shown honestly in the UI.
   - Add a rate limit and a honeypot.
   - The waitlist count is read from Redis, never invented.
3. **Pre-order.** Use a Solana Pay USDC reservation.
   - Price and merchant come from env: `PREORDER_PRICE_USDC` and `PREORDER_MERCHANT_ADDRESS`.
   - Until they are set, the button shows "Pre-orders open soon" and the API returns `Setup required`.
   - `site/api/preorder.js` creates a reference key. `site/api/preorder-status.js` confirms payment on chain by finding the reference (Solana Pay `findReference` plus `validateTransfer`).
   - State the refund policy as a placeholder, `PREORDER_TERMS_URL`, which Nick must write. Never take money without the terms.
4. **Ship-ready.** Add `site/vercel.json` and `site/README.md` with the deploy steps. Do not deploy; Claude or Nick deploys.
5. **Checks.** Screenshots at 1440 and 375, plus API tests for validation and the `Setup required` paths.

Make one commit per step.
