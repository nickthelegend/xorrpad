# Manufacturing, fulfilment and compliance

Research read date throughout: **2026-11-12**. No files uploaded, RFQs sent, carts created or orders placed. **Quote needed** means there is no project-specific commercial offer. The [PCB draft](../../hardware/README.md) cannot be manufactured yet. Batch sizes and factory-stage quantities below are requested or explicitly proposed, not supplier promises.

## PCB and assembly vendors

Buy complete electrically assembled boards. The assembler must reflow the genuine sockets, RF module, mic, amp, FPC and USB connectors, and solder the THT encoder and speaker header. Our team only plugs in vendor-terminated harnesses and presses switches. Quote a panelized board with both-side assembly, AOI, required X-ray, programming/fixture options and functional test; do not price it as a small single-sided promotional PCB.

| Vendor | 100 pads | 500 pads | 1,000 pads | 5,000 pads | Published lead-time basis / limits |
| --- | --- | --- | --- | --- | --- |
| [JLCPCB](https://jlcpcb.com/pcb-assembly) | quote needed from JLCPCB | quote needed from JLCPCB | quote needed from JLCPCB | quote needed from JLCPCB | Genuine socket listing is **Standard-only** and zero stock; consigned FPC/speaker parts need acceptance. Economic service is not assumed eligible. PCB fabrication, part procurement and bulk lead time need confirmation. |
| [PCBWay](https://www.pcbway.com/pcb-assembly.html) | quote needed from PCBWay | quote needed from PCBWay | quote needed from PCBWay | quote needed from PCBWay | Published assembly build time **3–5 days**, conditional on material availability; mixed SMT/THT, turnkey/kitted/hybrid supported. Published board envelope **0.2 × 0.2 to 15 × 20 inches**. Bulk schedule and test limits need confirmation. |
| [LionCircuits](https://www.lioncircuits.com/faq/pcb-assembly/how-long-do-you-take-for-assembly) | quote needed from LionCircuits | quote needed from LionCircuits | quote needed from LionCircuits | quote needed from LionCircuits | **4 working days** for prototypes after boards/components are ready; production **4 days or more** by complexity. Confirm bottom-side sockets, QFN exposed-pad inspection, THT and consignment. |

Sources above read 2026-11-12. JLC [Kailh listing](https://jlcpcb.com/partdetail/Kailh-CPG151101S11/C2803348), same date. LionCircuits separately publishes **7–10 days** for procurement, depending on vendor, plus customs/procurement fees notified separately: [procurement FAQ](https://www.lioncircuits.com/faq/component-sourcing/how-long-will-it-take-for-you-to-procure-the-components-and-begin-the-assembly). Its MII fabrication FAQ says **10–100 units / 5 working days**; that is fabrication, not a 500-unit assembly promise: [MII timeline](https://www.lioncircuits.com/faq/general/what-is-the-timeline-for-standard-service), read 2026-11-12.

JLC's detailed rate sheet publishes Standard setup **$25.56 single side / $51.12 double side**, stencil **$8.21 / $16.42**, feeder loading **$1.53 per basic/extended type**, and SMT **$0.0016 per joint through 50,000 joints**, with lower subsequent tiers. Manual assembly begins **$0.0164 per joint**, plus **$3.58 per-order hand-soldering labor**. These are fee components, **not pad prices**; leadless packages add inspection and other fees apply. Its FAQ contains slightly different rates, so use the detailed sheet as a reference and the eventual written quote as controlling. [JLC price sheet](https://jlcpcb.com/help/article/pcb-assembly-price), read 2026-11-12. PCBWay advertises **$29 / 20 PCBA** on its service page; it is a promotion with unspecified parts/design scope and is not extrapolated to these batches.

**Recommendation:** seek equivalent Standard JLC and PCBWay quotes after designer sign-off; LionCircuits can reduce cross-border board logistics for India final assembly, but must include its imported component costs. There is no evidence yet to select a cheapest vendor. Freeze laminate/stackup, RF keepout, copper/finish, depanelization, soldermask, fiducials and approved substitutions before comparing. Keep incoming sockets mechanically supported during switch insertion.

## Enclosures and caps

| Route | Applicable use | Price / MOQ / lead time |
| --- | --- | --- |
| [JLC3DP](https://jlc3dp.com/hk/capabilities/3d-printing-service) | EVT/DVT; dedicated nylon/engineering resin for a wear/heat-tested pilot | **Quote needed from JLC3DP** at each batch, by tray/plate/pod/knob. Published general lead time **48–120 hours**, bulk longer; not a committed ship date. |
| [Craftcloud](https://craftcloud3d.com/) | Compare externally printed SLS/MJF and finishing in the fulfilment region | **Quote needed from Craftcloud** at each batch; public site says no minimum order. It needs model upload for a project price, which was not done. |
| Injection moulding | After mechanical design and demand freeze | **Quote needed from JLC3DP/PCBWay or a nominated mould shop** for each tool, cavity, material, surface finish, inserts and ownership. |

Sources read 2026-11-12. JLC's **$0.30 X Resin** headline is **sample-only, random material**, unsuitable as a bulk case cost: [X Resin restrictions](https://jlc3dp.com/help/article/x-resin). Thin, complex or large parts may incur **$8+ per-part surcharges**: [special charges](https://jlc3dp.com/help/article/3d-printing-special-charges-case), read 2026-11-12. Do not multiply advertising minimums by enclosure parts and call it a quote.

[Formlabs' published tooling guide](https://formlabs.com/blog/low-volume-injection-molding/), read 2026-11-12, gives **$2,000–$5,000** for mid-volume aluminium moulds and **$10,000–$100,000** for high-volume steel moulds, with example lead times **3–4 / 4–8 weeks**. These broad third-party manufacturing examples are **not xorrpad tooling quotations**. Multiple case parts, slides, textures and caps can require multiple tools. Do not budget one low-end mould for the entire product.

Break-even for an externally supplied complete enclosure kit is `ceil(T / (Pprint − Pmould))`, provided `Pprint > Pmould`; otherwise there is no cost break-even. Include tools, design-for-moulding, sample iterations, finishing and scrap on both routes. **The numeric break-even count is unknown: quote needed from the print and mould vendors.** Use the published tooling range as context, not fabricated per-kit savings. Prefer outsourced printing for the first validated batch; decide tooling only on approved quotes and paid demand.

[MAXKeyboard](https://maxkeyboard.com/shop/cherry-mx-keycaps/custom-color-printed-keycaps/), read 2026-11-12, lists custom-art singles **from $10** and a custom-colour 104-key set **$70**. A full set is not 14 correctly sculpted xorrpad legends. **Quote needed from MAXKeyboard** for our exact set, four requested batch sizes, MOQ, print durability and shine-through variant. [Keyreative](https://www.keyreative.com/) is a dye-sub production candidate: **quote needed from Keyreative**, including MOQ and tooling; no verified public project price/MOQ was found. No artwork was uploaded. We should buy finished caps, not print or dye them ourselves. Ensure the centred MIC switch, common MX stem, cap height and Core LED visibility match approved CAD.

## Final assembly SOP

**ASSUMPTION: planning times, not measured cycle times.** Allow **18 minutes Pro / 14 minutes Core** per first-pass unit, based on the operations below, excluding queues, failed units and rework. Time the pilot before hiring or promising output. All prices for station tools and operator labor: **quote needed from the chosen local supplier/assembly partner**.

| Step | Operation and acceptance | Pro minutes | Core minutes | Tools |
| --- | --- | ---: | ---: | --- |
| 1 | Scan PCBA serial; inspect socket joints, polarity, USB and connector latch; isolate rejects | 2 | 2 | ESD mat/strap, magnifier, barcode scanner |
| 2 | Fit vendor-made plate/tray; support sockets and press all switches; inspect pins and travel | 3 | 3 | Socket support jig, switch puller, go/no-go gauge |
| 3 | Pro: plug speaker and FPC, latch, fit panel/gasket; no soldering | 3 | 0 | Non-metal FPC tool, harness fixture |
| 4 | Fit knob, caps, feet; close case at validated screw torque | 3 | 3 | Torque driver; torque is TBD by mechanical validation |
| 5 | Flash approved v2 factory image, exercise every key, knob/push, RGB and radio; Pro also mic/speaker/TFT | 5 | 4 | USB data cable, current monitor, test host and RF fixture |
| 6 | Validate signed report, erase test credentials/data, label serial/SKU, pack and record release | 2 | 2 | Label printer, carton/insert, scale |
| | **Total planning assumption** | **18** | **14** | |

**ASSUMPTION:** an 8-hour shift has 6 productive station hours after breaks, setup and administration. Derived capacity is 20 Pro or 25 whole Core units per operator/day before rework; it is not a measured line rate. No soldering station: a faulty board returns to the assembler for paid repair/replacement.

### Actual factory tooling and current blocker

The separate local `xorrpad-fw2` checkout on `fw-v3` at `5f95f32` contains `firmware/factory.sh`, `factory.mjs` and factory firmware. This root checkout does **not** contain that tool. Inspected read-only on 2026-11-12. The script flashes a factory image with esptool and verifies a CRC-framed, Ed25519-signed v2 report for the expected eFuse serial. It requires `keys`, `knob`, `mic`, `speaker`, `tft`, `led`, `wifi`, `ble`, and rejects inconsistent pass flags.

After firmware integration and physical approval, the operator command **in that checkout** is:

```sh
firmware/factory.sh SERIAL_PORT esp32-<12-hex-eFuse-MAC> [PINNED_ED25519_PUBLIC_KEY]
```

Hold keys 01+14 while resetting and follow the fixture/display instructions; require the verifier's final PASS, not merely a successful flash. Record per-check evidence and reject timeout, missing serial, invalid signature or any failed check. Factory image path defaults to `firmware/build/artifacts/factory.bin`; approved public-key pin and image provenance are production prerequisites. **No physical flash or factory cycle was performed here.**

**BLOCKED:** Nick must approve/integrate the v2 firmware release. Core additionally needs a SKU-aware signed report and host instructions: the existing tool correctly fails when display/audio checks are absent. Do not disable those checks globally or mark them passed. The RGB chain, proposed encoder GPIOs and current mic candidate also need firmware/physical tests. Documentation is not evidence that these work on a PCB.

## Packaging, freight and duties

Buy a protective carton, fitted recyclable insert, FPC/display protection, USB data cable, serial/SKU label and quick-start sheet. **Quote needed from the packaging vendor** for each SKU at 100/500/1,000/5,000, including print setup, pack dimensions and drop-test evidence. Weigh and measure the finished package before using any shipping slab. **ASSUMPTION:** final assembly/dispatch in India for the initial model; bulk inbound from China. Compare regional fulfilment separately rather than silently mixing US domestic parcel prices into an India export cost.

| Shipment | Verified reference / open price |
| --- | --- |
| China PCBA/components to India | **Quote needed from DHL/FedEx and customs broker**: actual packed mass, dimensions, Incoterm, insurance, origin and importer required. No inbound freight number is assumed. |
| India domestic parcel | India Post publishes **₹47 up to 500 g** to other states and **₹71 for 501–1,000 g**, GST extra; service effective 2026-08-01. [Tariff](https://www.indiapost.gov.in/mailproducts/domesticservices/speedpostparceldomestic), read 2026-11-12. Actual pad weight unmeasured. |
| India → US DTC | Published calculator example, Delhi 110001, **600 g, 20 × 20 × 5 cm**: tracked packet **₹927**, including ₹785 base and displayed GST. [Exact calculator URL](https://www.indiapost.gov.in/calculate-postage?ACK=0&COD=0&POD=false&REG=0&fromPincode=110001&height=5&length=20&product=parcel&tab=international&toCountry=US&weight=600&width=20), read 2026-11-12. Example dimensions/weight are a comparison scenario, **not measured xorrpad**; no duties/insurance included. Requote at dispatch. |
| India → EU DTC (Germany) | **Quote needed from India Post/DHL** for actual merchandise dimensions, destination and IOSS/DDP terms. Germany calculator did not return a usable price; no rate guessed. [Service/tariff entry point](https://www.indiapost.gov.in/mailproducts/internationalservices/inttrackedpackets), read 2026-11-12. |

For Indian imports, do **not** apply a single blanket “electronics duty” to everything. Bare PCB candidate heading **8534** is not automatically the heading for a populated, functional PCBA. Controller ICs, RF modules, display, switches and the finished keyboard/controller need separate classification; candidate finished-keyboard heading **8471** must be confirmed for the actual SKU. **Quote needed from an Indian customs broker** for BCD, applicable surcharge, IGST, exemptions/conditions and assessable-value adjustments for each import line. [ICEGATE import duty enquiry](https://www.icegate.gov.in/Webappl/index_imp.jsp), read 2026-11-12, requires tariff head and optionally origin. No verified BCD rate for this unfinalized PCBA was obtained.

CBIC's goods table lists **18% GST for heading 8471**: [official table](https://cbic-gst.gov.in/hindi/gst-goods-services-rates.html), read 2026-11-12. Apply it **only conditionally** after classification confirmation. Import cash duty calculation is `BCD + surcharge + IGST`, where IGST applies to the statutory tax base including relevant duties; confirm with the broker. Recoverable import IGST is a cash requirement and potential input credit, not automatically permanent COGS. [CBIC notification portal](https://courier.cbic.gov.in/notification.jsp), read 2026-11-12. Do not reuse expired concessions for microphone parts or lithium battery PCBAs on this product.

For US delivery, do not assume de-minimis exemption or that the historical India Post US tariff notice remains today's applicable duty. For EU, obtain importer/responsible-person, VAT/IOSS, WEEE/RoHS and destination compliance advice. Tariffs depend on classification, origin, sale date and fulfilment route; **quote needed from the destination customs/fulfilment broker**. Product prices below exclude delivery and destination taxes unless expressly stated.

## Certification and release

The Espressif module has RF certifications; the **finished host is not certified by inheritance**. Preserve exact module/antenna conditions, keepout, RF exposure, labels and integration instructions; test USB/digital emissions and the assembled product. [Espressif datasheet](https://www.espressif.com/sites/default/files/documentation/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf), [FCC modular compliance](https://docs.fcc.gov/public/attachments/DA-08-314A1.pdf), read 2026-11-12. Determine the FCC authorization route with a lab. **Quote needed from Intertek or TÜV Rheinland** for host testing, scope, retests and any TCB work: [Intertek FCC service](https://www.intertek.com/communications-equipment/fcc-certification/), [TÜV](https://www.tuv.com/usa/en/fcc-tcb-approvals.html), read 2026-11-12; no public project fee found.

CE is the manufacturer's conformity responsibility: technical file, relevant RED safety/EMC/radio requirements, EU declaration and marking. Module evidence helps but does not replace assessment of the pad and its firmware. Review applicable RED cybersecurity requirements, RoHS, WEEE and EU economic-operator obligations before sale. [European Commission manufacturer responsibilities](https://single-market-economy.ec.europa.eu/single-market/goods/ce-marking/manufacturers_en), [RED standards](https://single-market-economy.ec.europa.eu/single-market/goods/european-standards/harmonised-standards/radio-equipment_en), read 2026-11-12. **Quote needed from Intertek/TÜV** for both SKU scopes and test costs; no invented certification allowance.

BIS is a likely release dependency: the current CRS list includes **Keyboard**, and Pro may require scope assessment against smart-speaker categories. Obtain a written scope decision and applicable standard/transition date; do not claim exemption because USB-powered or module-certified. [BIS Scheme II](https://www.bis.gov.in/product-certification/products-under-compulsory-certification/scheme-ii-registration-scheme/?lang=en), [CRS product list](https://www.crsbis.in/BIS/products-bis.do), read 2026-11-12 (pages show differing standard revisions; lab must resolve). **Quote needed from a BIS-recognized lab and BIS** for tests, registration, factory/model-family coverage and renewals.

India WPC ETA also requires review for Wi-Fi/BLE. DoT publishes **₹10,000 application fee** and asks for an RF test report; this is not the test-lab bill. Confirm whether existing module ETA covers the exact domestically manufactured host. [DoT ETA service](https://www.eservices.dot.gov.in/equipment-type-approval-eta), [FAQ](https://eservices.dot.gov.in/sites/default/files/faqs/eta_faq.pdf), read 2026-11-12. No application submitted. Include Indian e-waste/EPR and retail labelling review with the legal/compliance partner.

## Stage plan

**ASSUMPTION: proposed elapsed planning weeks, not booked supplier lead times.** Stages are sequential for planning; sourcing/compliance can overlap. Replan after quotes and DVT failures.

| Stage | Proposed weeks | Exit condition |
| --- | ---: | --- |
| Prototype / design review | 2 | Designer resolves netlist, power, RF, FPC and mechanical interfaces; parts supply confirmed |
| EVT | 3 | Proposed 10 boards, actual bring-up, all keys/knob/voice/display/radio, power/thermal tests |
| DVT | 4 | Proposed 20 units across SKUs, firmware/factory integration, drop/ESD/EMC pre-scan and design freeze |
| PVT | 3 | Proposed 30 units, assembler process/fixture, timed final assembly, traceability and first-pass yield evidence |
| Release / batch readiness | 2 | Compliance and commercial quotes approved, warranties/refunds/support and fulfilment ready |

Derived baseline **14 weeks** after design work starts, **subject to supply, iteration and certification**; no guaranteed ship date. EVT/DVT/PVT units are additional to saleable batches unless the written plan says otherwise. Pay a PCB designer to finish this draft before any purchase: [Upwork's published PCB designer range](https://www.upwork.com/hire/pcb-designers/), read 2026-11-12, is **$25–$50/hour**. **ASSUMPTION:** reserve 20–40 hours for review/re-layout, yielding **$500–$2,000** before platform fees; full redesign or RF/compliance support can exceed it. **Quote needed from the selected designer** for fixed scope and actual price.
