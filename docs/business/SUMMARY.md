# xorrpad: decision sheet

**2026-11-12 · proposals for Nick · no orders, uploads or push.** Sources/dates and assumptions are in the linked analyses; quoted costs remain unknown until drawings and suppliers are approved.

| At 500 finished units | Core | Pro |
| --- | --- | --- |
| Product | 14 hot-swap keys, knob, per-key LEDs; host/phone voice and screen | 14 hot-swap keys, knob, 2.8-inch TFT, mic and speaker |
| Proposed retail | **$99 / ₹9,999** | **$179 / ₹17,999** |
| Published priced-line subset per unit | $11.7543; 11 unpriced lines | $16.3015; 17 unpriced lines, including bulk TFT |
| Complete landed cost | **Quote needed from named suppliers** | **Quote needed from named suppliers** |
| Achieved margin | **Unknown** | **Unknown** |
| 55% contribution target: maximum full C | **$33.36** | **$60.32** |

Prices are **ASSUMPTION / recommendation**, not approved sales offers or USD→INR conversions. India prices conditionally include 18% GST; USD prices exclude delivery/tax. USD cost ceilings assume India Stripe USD presentment plus conversion (6.3%) and warranty/returns reserves (2%/3% of net revenue). They are **derived budget limits, not estimated costs**. See [product line](PRODUCT-LINE.md), [BOM](BOM.md), [cost formula and tax/fee scenarios](PRICING.md), [comparables](MARKET.md). No subscription revenue supports hardware margins.

**Cash:** first 100: `NRE + 100 × complete cash landed cost + reserves`; first 500: `NRE + 500 × complete cash landed cost + reserves`. **Both totals need supplier, lab, freight and customs quotes.** Published component-reference subsets only: 100 Core **$1,270.46**, 100 Pro **$2,369.72**; 500 Core **$5,877.15**, 500 Pro **$8,150.75**. These are neither complete budgets nor guaranteed spend floors; some references are out of stock. Mixed batches share NRE only where genuinely common. [Detailed cash requirements](PRICING.md#first-batch-cash-requirement).

**Timeline:** **ASSUMPTION 14 weeks**: design/prototype 2 → EVT 3 → DVT 4 → PVT 3 → release readiness 2. Supply, failed iterations and certification can extend it. Final assembly planning **18 min Pro / 14 min Core**, unmeasured. All soldering is outsourced. [Manufacturing plan, SOP and release gates](MANUFACTURING.md).

**Demand:** live waitlist API returned **323** on 2026-11-12. At **ASSUMPTION 10–20%** conversion, that supports **32–64 whole paid units**, not an automatic 500-unit order. Proposed founder prices **$89 Core / $159 Pro**, refundable deposits **$20 / $30**, require Nick's approval and stricter cost gates. [Market evidence](MARKET.md), [founder/refund proposals](PRICING.md#founder-edition-and-software-policy-for-nicks-approval).

## Five risks

1. **Unfinished PCB:** 569 Pro / 658 Core DRC violations plus 206 / 195 unconnected items. Local Freerouting failed on native serialization; no routed board claimed. [PCB evidence](../../hardware/README.md).
2. **Supply:** genuine sockets have zero listed stock; mic candidate has NRND/EOL conflict; bulk bare display, custom caps and power components need confirmed quotes. [BOM holds](BOM.md).
3. **Margin/cash:** unknown full costs, duties, FX, yield and compliance; price ceilings may fail. [Cost gates](PRICING.md).
4. **Manufacturing proof:** v2 factory tool remains in the separate firmware checkout; Core needs a SKU-aware signed test, with physical validation still outstanding. [Factory integration](MANUFACTURING.md#actual-factory-tooling-and-current-blocker).
5. **Launch eligibility/demand:** FCC/CE host work, BIS/WPC scope, destination fulfilment and paid conversion unproven; no verified hackathon win claim. [Compliance](MANUFACTURING.md#certification-and-release), [channels](MARKET.md#channels-and-proof-requirements).

## Five actions only Nick can authorize

1. Approve the [two SKU definitions](PRODUCT-LINE.md), target countries, proposed prices and [refundable founder terms](PRICING.md); no live offer exists.
2. Select/fund a [PCB designer](../../hardware/README.md#formats-licensing-and-order-gate); proposed $500–$2,000 review/re-layout scenario, **quote needed** before engagement.
3. Approve sharing the finished drawings/artwork for written [PCBA, enclosure, cap and harness quotes](MANUFACTURING.md); sharing was explicitly withheld here.
4. Choose importer/legal entity, lab and fulfilment partner; approve [compliance/classification work](MANUFACTURING.md#certification-and-release), firmware integration and actual pilot budget.
5. Approve consented [waitlist interviews and paid-demand validation](MARKET.md#channels-and-proof-requirements); provide official organizer proof before mentioning any wins. Release bulk spending only after the preceding gates pass.
