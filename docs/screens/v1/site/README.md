# T7 landing captures

Run `npm run test:ui --prefix site` from the repository root. The check starts
the real Vite site and actual API handlers on loopback port 8719, with deployment
variable names cleared in its isolated process. It loads real repository product
images and self-hosted fonts, opens Chromium at 1440 and 375, exercises signup
error recovery and the FAQ, and captures the complete page from the top.

- [1440 px landing](landing-1440.png)
- [375 px landing](landing-375.png)
- [Measured results and timestamp](manifest.json)

These are honest missing-configuration states, including HTTP 503
`Setup required: UPSTASH_REDIS_REST_URL` and `Setup required: PREORDER_PRICE_USDC`.
No API interception, fabricated count, payment, or Redis write is used to fill
the page. Both widths have zero document overflow, broken product images,
clipped form controls and runtime errors. The browser and server close at exit.

Real product asset provenance and deployment requirements are documented in
[site/README.md](../../../../site/README.md). Successful Redis signup, rate-limit
exhaustion and a funded devnet payment/receipt still require configured services;
these screenshots do not claim evidence for those paths.
