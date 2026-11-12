# Market and positioning

Research read date: **2026-11-12**. US dollar storefront reference prices below are not landed-to-India prices. Destination, tax, promotions, availability and selected variant can change the checkout total; no checkout or order was made. Use the linked live listing when making a purchase decision.

## Current comparables

| Product | Observed price | What it establishes | Source / date |
| --- | ---: | --- | --- |
| Elgato Stream Deck Mini | $59.99 | Entry-level LCD-key macro control | [Elgato](https://www.elgato.com/us/en/p/stream-deck-mini), 2026-11-12 |
| Elgato Stream Deck MK.2 / current classic 15-key listing | $149.99 | Mature software/plugins and LCD keys; current catalogue calls the classic model “Stream Deck” | [Store, SKU 10GBA9901](https://www.elgato.com/us/en/p/stream-deck), [MK.2 specifications](https://help.elgato.com/hc/en-us/articles/18208816152333-Elgato-Stream-Deck-MK-2-Technical-Specifications), 2026-11-12; old `/stream-deck-mk2` URL no longer works |
| Elgato Stream Deck + | $179.99 | Keys, dial control and touch strip | [Elgato](https://www.elgato.com/us/en/p/stream-deck-plus), 2026-11-12 |
| Elgato Stream Deck Neo | $99.99 | Lower-price compact workflow controller | [Elgato](https://www.elgato.com/us/en/p/stream-deck-neo), 2026-11-12 |
| Logitech MX Creative Console | $199.99 | Separate keypad/dialpad and mature creative integrations | [Logitech selected product](https://gaming.logitech.com/en-us/shop/p/buy-mx-creative-console.920-012661), 2026-11-12. Discovery pages also advertised $169.99 special pricing; do not represent that as the selected product's checked price. |
| Loupedeck-branded console | quote needed from Logitech/Loupedeck for current model and availability | Legacy creative-controller comparison; no independently verified current buy price obtained | [Logitech MX range](https://www.logitech.com/en-us/discover/c/mx-creatives), 2026-11-12; do not substitute an old launch MSRP |
| Work Louder Creator Micro 2 | **from $168** | Direct industrial-design/workflow competitor; wired and wireless variants differ | [Work Louder shop](https://www.worklouder.cc/fr/shop), [Framer Micro](https://www.worklouder.cc/shop/keyboards/framer-creator-micro), 2026-11-12 |
| Work Louder Codex Micro | $199 promotional / $230 reference; sold out | Agent workflows are already a competitive category | [Work Louder shop](https://www.worklouder.cc/fr/shop), 2026-11-12; not an available-stock promise |
| Ledger Nano S Plus, Matte Black | **$69** | Secure signing hardware, not a macro pad | [Ledger](https://shop.ledger.com/products/ledger-nano-s-plus), 2026-11-12; public page Product JSON-LD offer, currency USD |
| Ledger Nano X, Onyx Black | **$99** | Wallet signing with Bluetooth | [Ledger](https://shop.ledger.com/products/ledger-nano-x), 2026-11-12; public Product JSON-LD offer, USD |
| Ledger Flex, Graphite | **$249** | Larger trusted wallet display and secure element | [Ledger](https://shop.ledger.com/products/ledger-flex), 2026-11-12; public Product JSON-LD offer, USD |
| Trezor Safe 3 | **$59** | Entry secure-element wallet | [Trezor](https://trezor.io/trezor-safe-3), 2026-11-12 |
| Trezor Safe 5 | **$129** | Touchscreen wallet | [Trezor product](https://trezor.io/trezor-safe-5), [manufacturer price cards](https://trezor.io/es/coins/wallet/kucoin-shares), 2026-11-12; product read did not expose a price, manufacturer cards did |
| Keyboard Trader configurable trading keyboards | quote needed from Keyboard Trader | Trading-specific physical controls already exist, with configurable risk/entry workflows | [Keyboard packages](https://www.keyboardtrader.com/keyboard.html), [pricing examples](https://www.keyboardtrader.com/pricing-use-cases.html), 2026-11-12; accessible material is old, current hardware price unavailable |

Ledger's rendered text said “Loading”; the prices above were recovered by **GET of those same public product pages**, parsing `application/ld+json` Product offers, not inferred from reviews or remembered MSRP. Commercial observations are recorded with URLs here; component price tiers are preserved in [price-sources.json](price-sources.json). [verify.py](../../hardware/verify.py) checks the local BOM arithmetic and provenance. The Ledger check was performed separately by fetching public HTML; no account, cart or payment API was used.

## Positioning we can defend

Proposed line: **“The Solana desk pad for voice proposals, explicit acceptance and wallet review.”** Core is the accessible keys-and-knob version; Pro adds the dedicated proposal display and pad audio. It should save attention switching between markets, strategy, quote, risk gate and wallet. That is a product hypothesis to test with traders, not evidence of better execution or returns.

The brief's “only trading desk pad with clear signing plus voice” is a positioning ambition, **not a verified worldwide exclusivity claim**. Work Louder already markets agent integration, Keyboard Trader markets safety features, and Stream Deck has an extensible plugin ecosystem. We cannot conclude that every plugin lacks trading safety. Our differentiation should be the integrated, inspectable Solana proposal/permission/acceptance/receipt flow and a deliberately separated wallet signature. [Trade lifecycle](../v1/SPEC.md), [venue coverage and limits](../VENUES.md).

The pad is **not** a Ledger/Trezor substitute: it has no demonstrated secure-element key isolation or wallet-controlled trusted display. Pro displays a proposal from the host, not a cryptographically guaranteed rendering of every transaction. The wallet must independently show and approve the actual transaction. The optional capped session wallet is an explicit alternate signer, not a claim that “nothing can ever sign on the desktop.” Keep mainnet availability/setup limits honest; do not promise that every venue has production execution just because a quote is visible.

At a proposed Core **$99**, Neo and Work Louder constrain willingness to pay. Pro **$179** sits alongside Stream Deck + and below the checked MX console; voice and trading-specific workflow must justify a less mature ecosystem. Recommended INR prices and the actual cost release gates are in [PRICING.md](PRICING.md). These retail numbers are our proposals, not researched market prices or approved offers.

## TAM, SAM and SOM without counting bots as customers

**Observed activity context:** [DefiLlama Solana](https://defillama.com/chain/solana), fetched 2026-11-12, labels its snapshot as of that date: **$1.533 billion DEX volume / 24 h; $1.571 billion perps volume / 24 h; $6.377 billion perps / 7 d; 2.65 million active addresses / 24 h**. These change during a day and differ across cached page variants. They establish market activity, not trader headcount, revenue available to us, or hardware demand. Perps notional includes leverage; addresses include non-traders, bots and multiple addresses per person. Do not annualize one day's volume into a hardware TAM.

[Dune daily Solana DEX volume and active traders, query 6424625](https://dune.com/queries/6424625), read 2026-11-12, exposes SQL counting `COUNT(DISTINCT trader_id)` in `dex_solana.trades`. Its latest visible result is **2026-09-10: 652,982 trader wallets**, last run about two months ago. It is **historical, not today's active Solana human trader count**. Multi-hop trade rows can overcount volume; distinct wallet counts still do not deduplicate humans. The [cross-chain DEX users dashboard](https://dune.com/danning_sui/dex-users-across-chains), read 2026-11-12, did not provide a reproducible current number in this read. No fabricated current monthly active-trader figure is supplied.

| Layer | Basis | Interpretation |
| --- | --- | --- |
| TAM | Human Solana traders who could use a desk controller: **not measured**. Historical daily wallet activity above is an addressable-activity proxy only. | No validated dollar TAM yet. Phone-only traders and bots are poor hardware customers. |
| SAM planning scenario | **ASSUMPTION:** 10% of the historical wallet proxy represents distinct reachable human desk traders, and 10% of that subset wants paid hardware. `652,982 × 0.10 × 0.10 ≈ 6,530` possible buyers before geography/support exclusions. | Hypothesis, not a sourced population estimate. Fractions deliberately exclude most bot, casual and phone-only activity; validate interviews, deduplication and supported countries before using in a pitch. |
| Initial SOM | Verified waitlist **323**, × **ASSUMPTION 10–20%** conversion = **32–64 whole paid units** (rounded down). | No sales or deposits evidenced; choose a testable first conversion cohort, not a guaranteed batch. |
| First commercial goal | **ASSUMPTION:** 100 saleable units after DVT/PVT and verified paid commitments. | Requires 100/323 = **31.0%** waitlist conversion if no other channel. A 500-unit batch needs additional demand; 500/323 = **154.8%**, impossible from one purchase per current signup alone. |

The SAM fractions and SOM conversion are uncertainty scenarios, not industry benchmarks. Do not add the DEX and perps users together without overlap data. Obtain consented desk-use, budget, country and wallet/platform preferences from the waitlist and compare willingness to pay with the founders' prices. No outreach or survey was sent during this task.

## Channels and proof requirements

- **Owned waitlist:** GET [xorr.finance/api/waitlist](https://xorr.finance/api/waitlist), 2026-11-12, returned `{"total":323}`. This is a signup counter, not verified unique buyers, shipments or revenue. Start with a working live demo and consented interviews; paid pre-orders only after release gates.
- **Crypto Twitter/X:** proposed demos of quote → refuse/accept → wallet → receipt, publishing the real venue/network state. Track qualified visits, waitlist conversion, paid conversion, support burden and refunds. Customer acquisition cost is unknown; no paid-media budget or conversion benchmark invented.
- **Solana ecosystem partners:** proposed Jupiter, Phoenix and prediction-market/community demos; [venue research](../VENUES.md) documents technical integration. Integrating an API is not a partnership or endorsement. Nick must obtain any co-marketing approval before using partner logos.
- **Hackathons:** repository [README](../../README.md) names the Perps and Prediction Markets event as a target. No award proof was located in the inspected release docs. **Hackathon wins are unverified**: Nick must supply official organizer winner links, project/team identity and award date before any claim. [Official event](https://hackathons.solana.com/hackathons/perps-and-prediction-markets). Do not fabricate wins or booked prize revenue.

Use Core to test workflow demand with existing screens; use Pro to test whether embedded voice/display earns the premium. Shipping regions, certifications and customer support capacity determine the launchable SAM more than chain notional volume does.
