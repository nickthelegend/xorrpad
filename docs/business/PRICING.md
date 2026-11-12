# Pricing and cash gates

Decision proposal, **2026-11-12**. Recommended prices are **ASSUMPTIONS for Nick to approve**, anchored to [today's comparables](MARKET.md), not researched vendor offers or validated willingness to pay. No pre-order offer was published, money collected or subscription enabled.

| SKU | Proposed USD retail, before sales tax/delivery | Proposed India retail, GST-inclusive if 18% classification is confirmed | Proposed founder retail |
| --- | ---: | ---: | ---: |
| Core | **$99** | **₹9,999** | **$89 / ₹8,999** |
| Pro | **$179** | **₹17,999** | **$159 / ₹15,999** |

Core sits at the Stream Deck Neo price and below Work Louder's checked starting price; Pro sits at the Stream Deck + price and below the selected MX Creative Console. These are hypotheses for a working trading workflow, not promises of a better product. India prices are independent proposed local price points, **not USD conversions**. A current bank settlement FX quote, import classification and GST treatment are prerequisites for converting the dollar BOM to rupee landed costs. No exchange rate is guessed.

## Complete landed-cost model, with unknowns left open

For SKU s and run N define:

`C(s,N) = B(s,N) + A(s,N) + E(s,N) + K(s,N) + P(s,N) + F(s,N) + D(s,N) + L(s,N)`

| Input | Meaning / evidence | Present status |
| --- | --- | --- |
| B | All electronics, switches, connector/harness/cable and hardware-kit BOM; [CSVs](BOM.md) | Partly sourced; full BOM **quote needed from LCSC/JLCPCB, EastRising and switch/harness vendors** |
| A | Bare PCB fabrication, SMT/THT assembly, panel/fixture/setup, attrition and test | **Quote needed from JLCPCB/PCBWay/LionCircuits**; do not add component costs twice to a turnkey quote |
| E | Finished enclosure/plate/knob/pod kit | **Quote needed from JLC3DP/Craftcloud/mould shop** |
| K | Complete custom legend cap set | **Quote needed from MAXKeyboard/Keyreative**, including MOQ/setup |
| P | Protective packaging, labels and printed instructions | **Quote needed from packaging supplier** |
| F | Inbound freight, insurance and brokerage allocated over accepted units | **Quote needed from freight partner**; outbound delivery is separate below |
| D | Nonrecoverable duty/tax | **Quote needed from customs broker** after actual PCBA/component/finished-product classification |
| L | Our final assembly/test labor, rework and consumables | **Quote needed from the assembly partner**; [SOP minutes](MANUFACTURING.md) are assumptions, not a wage quote |

Some B/E/K kit rows coexist in the CSV for completeness: when completing C, move those rows to their named bucket and **count each once**. Depreciation of tooling/test fixtures and PCB design/certification NRE is additional; disclose whether amortized into C or separately expensed. Recoverable import IGST remains a **cash** requirement even when excluded from permanent unit COGS. Include failed units in the denominator; do not divide actual batch spend by ordered units if fewer pass release.

| SKU / finished units | Published priced-line reference B subset, per pad | Missing part lines | Full C per pad | Payment / warranty / returns | Fully loaded cost per sale |
| --- | ---: | ---: | --- | --- | --- |
| Core / 100 | $12.7046 | 11 | quote needed from named vendors | `fR + 0.02R + 0.03R` | `C + (f + 0.05)R` |
| Core / 500 | $11.7543 | 11 | quote needed from named vendors | same | same |
| Core / 1,000 | $11.4649 | 11 | quote needed from named vendors | same | same |
| Pro / 100 | $23.6972 | 16 | quote needed from named vendors | same | same |
| Pro / 500 | $16.3015 | 17 | quote needed from named vendors | same | same |
| Pro / 1,000 | $15.8002 | 17 | quote needed from named vendors | same | same |

These are derived from [price-sources.json](price-sources.json) and [the generator](../../tools/business-bom.py), all source reads 2026-11-12. Out-of-stock references remain in the subset as **indicative published prices**, so even that subset is not a cash quote or guaranteed minimum spend. Pro's 500+ display is unpriced because the vendor requests a quote; the lower subtotal at that run does not establish a cheaper complete BOM. No landed cost or achieved gross margin can honestly be calculated yet.

**ASSUMPTIONS:** warranty reserve **2% of net product revenue** and returns reserve **3%**, separately. These are initial cash cushions for replacements/support and return transport/write-offs, respectively; there is no field failure/return dataset. For refunds, reduce realized revenue as well; do not assume a reserve magically preserves revenue. Do not count the same replacement in both buckets. Review real cohort claims, return freight and salvage after the pilot, with downside sensitivity at twice each reserve. This model excludes paid acquisition and fixed software/support overhead, which must be covered separately.

### Payment costs and tax

[Stripe India](https://stripe.com/in/pricing), read 2026-11-12, publishes **2% Indian cards**, **3% non-India Visa/Mastercard** for the stated basis, **4.3% international cards with USD/other-currency presentment**, and **+2% if currency conversion is required**. Do not use the domestic rate for an international USD sale. GST on processor fees, disputes, refunds and settlement terms need the merchant's actual contract/tax treatment. Access is invite-dependent; account eligibility is not established here. If Nick uses a different legal entity/acquirer, replace the rates rather than importing another country's fee schedule.

For the conservative USD illustration below, **ASSUMPTION:** India merchant, USD card presentment and conversion, `f=6.3%`; reserves total 5% of net revenue R. Taxes on fees, subsidized outbound shipping and acquisition costs are excluded from that cap and would lower it. For India, assume eligible domestic cards at 2% of **gross collected price** and conditionally 18% product GST, so `R=P/1.18`; fee is `0.02P=0.0236R`. Confirm all tax credits. [CBIC heading 8471 table](https://cbic-gst.gov.in/hindi/gst-goods-services-rates.html), read 2026-11-12; this is a **conditional classification scenario**, not a ruling on xorrpad.

Solana Pay is a payment protocol, not a quoted all-in acquiring/off-ramp service. [Solana fee structure](https://solana.com/docs/core/fees/fee-structure), read 2026-11-12, specifies **5,000 lamports per signature plus priority fees**. Token-account creation, RPC, settlement exchange, off-ramp, accounting and refund costs can apply; **quote needed from the payment/off-ramp provider**. Do not label it “free” or convert its fee to USD using an invented SOL price. No mainnet payment or wallet connection was attempted.

## What 50–60% DTC margin requires

Use a conservative **contribution margin after payment fees and both reserves**, rather than claiming this is an achieved accounting gross margin: `m = (R − C − payment − warranty − returns)/R`. Target from the brief: **50–60%**; central planning target **55% (ASSUMPTION)**. Outbound shipping charged at cost is a pass-through only if collected and expensed consistently; free shipping must be added to C. Actual returned sales reduce R. Taxes collected for governments are excluded from R.

| Retail scenario | Maximum C for 60% margin | Maximum C for 55% | Maximum C for 50% |
| --- | ---: | ---: | ---: |
| Core $99; USD fee scenario above | $28.41 | **$33.36** | $38.31 |
| Pro $179; same | $51.37 | **$60.32** | $69.27 |
| Core ₹9,999; conditional India scenario | ₹2,765.83 | **₹3,189.51** | ₹3,613.20 |
| Pro ₹17,999; same | ₹4,978.71 | **₹5,741.38** | ₹6,504.05 |

Derived ceilings, **not estimated landed costs**. USD: `Cmax=R×(1−target−0.063−0.05)`; India: `Cmax=(P/1.18)×(1−target−0.0236−0.05)`. Rounding to cents/paise is presentation only. Different pricing/FX/acquiring and tax scenarios are not directly comparable. For any additional fixed fee q per sale or outbound subsidy h, subtract `q+h` from these caps. If quotes exceed the 50% cap, raise price, change design or stop; don't rely on subscriptions to fill the gap.

At 500 units, Core's priced subset leaves **$21.61**, Pro **$44.02**, below the rounded USD 55% C ceilings for **all missing parts, case, caps, PCB/PCBA, packaging, freight, duty and labor together**. Derived from exact ceilings and subsets; it is a budget gap to test, not evidence those costs fit. Custom caps and full production/compliance scope are the largest unquoted risks. At founder USD prices, 55% ceilings fall to **$29.99 Core / $53.58 Pro** under the same assumptions. Do not authorize founder discounts until quotes fit those stricter caps.

## First-batch cash requirement

No defensible numeric total exists without supplier, freight, duty and compliance quotes. Let `T` be approved design, EVT/DVT/PVT, tooling, certification, test-station and launch NRE; `Ccash` includes recoverable import taxes paid up front; `Rcash` is retained warranty/return/refund liquidity. **Do not finance a refund promise with money already committed to production.**

| Batch | Full cash requirement | Reference subset only, before missing costs |
| --- | --- | ---: |
| 100 Core | `Tcore + 100×Ccash(core,100) + Rcash`; **quote needed** | $1,270.46 |
| 100 Pro | `Tpro + 100×Ccash(pro,100) + Rcash`; **quote needed** | $2,369.72 |
| 500 Core | `Tcore + 500×Ccash(core,500) + Rcash`; **quote needed** | $5,877.15 |
| 500 Pro | `Tpro + 500×Ccash(pro,500) + Rcash`; **quote needed** | $8,150.75 |

Reference subset arithmetic comes from the CSV; not supplier quotes, not a minimum budget and not enough cash to build a batch. For a mixed run, sum accepted units by SKU and allocate genuinely shared NRE once; do not silently apply a 500-pad component discount to 250 of each without confirming shared purchasing. **ASSUMPTION:** hold an additional 10% contingency against approved cash quotes for FX/quote expiry/rework; this is not a replacement for missing quotes. Include the [designer review scenario](MANUFACTURING.md) separately; lab prices remain unknown.

## Founder edition and software policy for Nick's approval

**Proposals, not live terms:** use the founder prices above only after DVT, quote validation and compliance scope are approved. Proposed refundable reservation deposits **$20 Core / $30 Pro**, or **₹2,000 / ₹3,000** locally, credited fully to the invoice. Proposed policy: full refund before dispatch on request, no nonrefundable “tooling fee”; full refund if we cancel or cannot meet the expressly agreed revised ship window; final balance only after a real production/dispatch notice. Any refund loss, FX difference and non-returned processing fees are our costs to budget, not hidden deductions. Nick must approve currency handling for crypto refunds, refund timing, delivery countries, customer support and legal terms before launch.

Do not promise “no refunds after shipping”: EU distance-sale rules generally provide **14-day withdrawal rights** with exceptions and required disclosures; mandatory consumer rights still apply. [EU Your Europe](https://europa.eu/youreurope/citizens/consumers/shopping/returns/faq/index_en.htm), read 2026-11-12. US shipping promises and delay/refund handling need review under the [FTC mail/internet order rule](https://www.ftc.gov/business-guidance/resources/business-guide-ftcs-mail-internet-or-telephone-order-merchandise-rule), read 2026-11-12. Obtain jurisdiction-specific terms, including India, from counsel; these bullet points are a commercial proposal.

Base desk/firmware/phone workflows must work with the user's model/keys; the [v1 spec](../v1/SPEC.md) postpones hosted paid LLM service until funding. Any future hosted LLM subscription is **unpriced upside only**, with provider cost, privacy, support and cancellation design still needed. It contributes **zero** to every hardware viability calculation here. No lockout, paywall or paid service is required to make the proposed hardware margin work.
