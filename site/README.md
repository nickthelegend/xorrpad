# xorrpad landing · v1.0.0

Standalone Vite static site with three Vercel Node serverless functions. The
landing is independent of Electron. No deploy or payment submission was made
while implementing T7.

## Design

The premium paper/editorial landing pairs generous spacing, oversized headings and fine rules with restrained, nearly square controls.
Real prototype photography and desk captures anchor the page; OFL-licensed Manrope Variable is self-hosted through Fontsource.
Core palette: paper `#f2eee5`, ink `#242d29`, action blue `#233fc4`, rules `#c8c8bc` and muted text `#586057`.
Supporting surfaces use photo mat `#d9d5c9`, system `#e5e5da`, safety `#26352e` and waitlist `#d9dfbb`.
Desktop uses a split hero and paired editorial columns within a 1280px maximum; spacing tightens at 1000px and layouts stack at 650px.
Accessibility includes a skip link, descriptive image text, labeled forms, native FAQ details and visible keyboard focus; reduced motion removes transitions and smooth scrolling.

## Local development

Use Node 22.12+ or 24+ and run from `site/`:

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:8717>. The Vite development bridge runs the **actual** API
handlers. With no environment configured, signup and payment display their real
HTTP 503 `Setup required` responses. It does not load `.env` files. Supply
credentials through an approved environment manager when needed. Never place
credentials in `VITE_*`, source, logs, screenshots, or the frontend bundle.

`npm run build` creates `dist/`. `npm run preview` previews static files only;
use `npm run dev` for local API integration. Production serves `dist/` plus
`api/`; copying `dist/` alone does not enable signup or reservations.

## Deploy handoff — Claude or Nick only

1. Import this repository into Vercel and set **Root Directory = `site`**.
2. Choose the Vite preset and a supported Node 22 or 24 runtime. The checked-in
   `vercel.json` sets install `npm ci`, build `npm run build`, output `dist`,
   30-second function limits and security headers. Keep Vercel's automatic
   `/api/*` function routing; do not add a catch-all SPA rewrite over the APIs.
3. Add the server-only variables below in Vercel Project Settings → Environment
   Variables, separately for Preview and Production. Leave reservation variables
   unset until Nick has published real terms and approved the price and merchant.
4. Deploy a Preview first. Check signup twice with the same email: Redis `SADD`
   deduplicates it. Reload and check that the count comes from `SCARD`. Exercise
   honeypot and rate-limit rejection. Do not use invented counters or seeded names.
5. Test reservation payment **only on devnet**, using devnet USDC, a devnet RPC,
   and a separate initialized merchant USDC associated token account. Review the
   terms, create one reference, pay using a Solana Pay wallet, and check finalized
   status and receipt. Retain the reference/status link. Do not submit mainnet
   transactions as an automated test.
6. Before enabling Production payments, Nick must publish reservation/refund
   terms (including how customers can request support/refunds), approve the price,
   verify the merchant, initialize its mainnet USDC associated token account,
   and select a mainnet RPC. Redeploy after env changes and check the network,
   price and terms shown by the UI. No delivery date or refund promise is invented.

| Variable | Purpose |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` | HTTPS REST URL for a dedicated Upstash Redis database |
| `UPSTASH_REDIS_REST_TOKEN` | Read/write REST token; required for atomic Lua, sets and reservation records |
| `PREORDER_PRICE_USDC` | Positive decimal, up to six fractional digits, below 1,000,000; no default price |
| `PREORDER_MERCHANT_ADDRESS` | Merchant wallet public address; no private key |
| `PREORDER_TERMS_URL` | Published HTTPS reservation **and refund** terms written by Nick; no placeholder domain |
| `PREORDER_NETWORK` | `mainnet-beta` (default) or `devnet`; explicitly set Preview to `devnet` |
| `PREORDER_SOLANA_RPC_URL` | Optional HTTPS RPC for that network; defaults to its public Solana endpoint; dedicated RPC recommended for production |

Never point a paid reservation at devnet or use devnet USDC as a real reservation.
Solana Pay transfer URLs do not switch a wallet's network: the buyer must check
the network in the page and wallet. Genesis-hash verification rejects an RPC
on the wrong chain. The USDC mint is pinned per network in `server/preorder.js`.

## API behavior and stored records

- `GET /api/waitlist` → `{count}` from Redis; no fallback count.
- `POST /api/waitlist` with JSON `{email, website: ""}` → idempotent signup and
  actual set count. Invalid input/honeypot: 400; unsupported content type: 415;
  missing Upstash URL: 503 `Setup required: UPSTASH_REDIS_REST_URL`.
- `GET /api/preorder` → public price, merchant, terms, network, mint and a
  version hash. Missing configuration: 503 `Setup required: <name>`; the UI
  keeps **Pre-orders open soon** disabled. A configured API still verifies the
  merchant token account and network before creating any payment link.
- `POST /api/preorder` with JSON `{termsAccepted: true, version}` → HTTP 201
  with a newly generated public reference and Solana Pay URL. A stale version
  is rejected. Expected amount, mint, merchant, network, terms URL, version and
  acceptance timestamp are saved **before** returning the payment request.
- `GET /api/preorder-status?reference=<public key>` → `pending` or `confirmed`.
  It loads the saved reservation, calls Solana Pay `findReference`, then
  `validateTransfer` at **finalized** commitment against the expected reference,
  merchant, USDC amount, mint and unique memo. A signature is claimed atomically
  for one reservation. Validation failure: 409, never a successful receipt.
  Confirmation survives reload and function cold starts. A status URL can still
  reconcile existing orders if configuration for **new** orders is removed.

The current Solana Pay SDK requires pre/post token balances for validation;
the merchant's USDC associated token account must therefore exist before a
payment request is issued. Overpayment is accepted by `validateTransfer`;
underpayment and a wrong mint, recipient, memo or reference are rejected.
The API never signs or submits a transaction and holds no merchant key.

Redis namespace: `xorrpad:v1:waitlist` is a set of normalized emails;
`xorrpad:v1:preorder:<reference>` stores immutable payment expectations and
eventual receipt; `xorrpad:v1:preorder-signature:<signature>` prevents reuse.
Reservations/receipts deliberately do not expire: delayed transfers must remain
reconcilable. Back up and restrict access to this database; configure retention
and customer deletion procedures before launch. Fulfillment is manual: a payment
reference is the proof to retain, not a shipping commitment or an email address.

Rate limits use atomic Redis INCR/EXPIRE and SHA-256 IP keys with expiring windows:
5 signups or new reservations per 10 minutes, 60 count reads per 10 minutes,
60 status reads per minute. Vercel's protected `x-vercel-forwarded-for` header is
used in deployment; the local bridge uses the socket IP. All API responses are
`no-store`. Upstream errors are redacted, never logged with tokens or RPC URLs.

Payment retries are checked against the oldest referenced transaction and up to
20 recent finalized candidates. Failed or mismatched attempts do not hide a
valid retry within that window. Heavily spammed references may require manual
reconciliation. RPC work has a 12-second deadline; an upstream timeout never
becomes a confirmed receipt. Reloading a pending reservation restores its saved
wallet URL and QR code rather than creating another order.

## Checks

```sh
npm test
npx playwright install chromium
npm run test:ui
npm run format:check
npm run build
npm audit
```

`npm test` exercises 14 groups through real HTTP handlers, covering validation,
honeypot, body size/content type, methods, missing configuration, reference and
Solana Pay URL generation, immutable expectations, and trusted rate-limit identity.
It does not stub Redis, RPC, quotes or payment responses. Browser checks use the
actual local API at 1440 and 375 px, verify honest setup errors, signup error
recovery, disabled reservations, working FAQ and layout. Captures and measured
results are in `../docs/screens/v1/site/`; `../TESTING.md` records the run and
live verification limits. Tests clear deployment variable names in their isolated
process and never open an env file. The browser/server close in `finally`.

## Assets and evidence

All product images are real repository assets, converted to WebP with `cwebp -q
85` for the prototype and `-q 86` for desk captures:

- `public/assets/pad.webp` ← `../docs/pad.jpg` (workbench prototype).
- `public/assets/desk-trade.webp` ← `../docs/screens/v1/trade-floor-1440.png`.
- `public/assets/desk-permissions.webp` ← `../docs/screens/v1/permissions-floor-1440.png`.

Desk captures contain point-in-time market reads, clearly labeled as historical.
Manrope is self-hosted from its OFL-licensed Fontsource package. The site uses no
external font service, invented testimonials, counters, availability or delivery
claims. The specs distinguish prototype capability from unverified hardware.

Primary integration references:
[Solana Pay merchant flow](https://docs.solanapay.com/core/transfer-request/merchant-integration),
[current SDK source](https://github.com/solana-foundation/pay),
[Upstash REST API](https://upstash.com/docs/redis/features/restapi),
[Vercel request IP headers](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for).
