# Hardware rev 2 sourcing and design research

V3-SPEC item 8; researched **2026-11-12**. Research only: no schematic, PCB,
motor controller or production security configuration is implemented here.
The current board remains USB powered. Firmware is **compiled, not yet flashed**.

## Secure element: keep the signing algorithm explicit

| Candidate | Documented capabilities | Consequence for xorrpad |
| --- | --- | --- |
| Microchip **ATECC608B-MAHDA-T**, 8-UDFN | P-256 ECDSA/ECDH, SHA-256 and AES; [manufacturer](https://www.microchip.com/en-us/product/ATECC608B), [summary datasheet](https://ww1.microchip.com/downloads/en/DeviceDoc/ATECC608B-CryptoAuthentication-Device-Summary-Data-Sheet-DS40002239B.pdf) | It cannot perform the current Ed25519 Solana/device signing. Suitable for a separately designed P-256 identity or wrapping scheme; exporting an unwrapped Ed25519 seed to ESP32 RAM preserves that exposure. Microchip now identifies 608B as NRND; assess its successor before a new design. |
| NXP **SE050E2HQ1/Z01Z3Z**, HX2QFN-20 | SE050E configuration supports Ed25519; [configuration matrix, AN12436](https://www.nxp.com/docs/en/application-note/AN12436.pdf), [APDU specification, AN12413](https://www.nxp.com/docs/en/application-note/AN12413.pdf) | Preferred evaluation candidate for non-exportable Ed25519 device/session keys. Verify the delivered applet/features, exact message-signing mode, byte ordering and RFC 8032 vectors before selecting it. Do not assume all SE050 variants have these algorithms. |

ATECC608B is listed at **$0.837 at 1,000** by [Mouser](https://www.mouser.com/en/ProductDetail/Microchip-Technology/ATECC608B-MAHDA-T?qs=W%2FMpXkg%252BdQ71cGyt0Wo3Jw%3D%3D).
SE050E2 is listed at **$3.26 at 1,000** by [Mouser Mexico, USD](https://www.mouser.mx/en/ProductDetail/NXP-Semiconductors/SE050E2HQ1-Z01Z3Z?qs=MyNHzdoqoQJLcBuQE9NcBA%3D%3D).
These are observed regional catalog prices, not negotiated quotes or guaranteed
stock. SE050E's factory certificates are not xorr factory certificates; AN12436
also distinguishes customer-specific Ed25519 certificate chains.

Provision keys inside the chosen element, bind the xorr certificate to its public
key, and use authenticated host access with a reviewed provisioning procedure.
Test bus interception, reset, interrupted writes, session-key deletion, factory
reset semantics and replacement devices. A secure element alone does not make
the TFT/buttons trusted: compromised ESP32 firmware could still ask it to sign.
Production needs verified boot, encrypted storage and a review of authorization
between display, caps and signing. Challenge attestation proves possession of a
certified identity; it does not measure the running firmware. See
[PRODUCTION.md](PRODUCTION.md); no eFuse changes are authorized by this research.

## Haptic smart knob

Evaluate **T-Motor GB2208 KV128** (12N14P BLDC), **AS5047P-ATSM-TSSOP14**
SPI magnetic encoder and **DRV8316CRRGFR** integrated three-phase driver.
The [motor manufacturer](https://store.tmotor.com/product/gb2208-gimbal-type.html)
specifies a 27.5 × 23 mm body, 39.5 g and a 3–4S supply rating. This is a
documented prototype candidate, not proof of satisfactory knob detents at USB
5 V. Its [Foxtech distributor price](https://store.foxtech.com/gb2208/) is $25.90;
no 1k discount or 1k stock commitment is published there.

The [TI driver datasheet](https://www.ti.com/lit/ds/symlink/drv8316c.pdf) covers
the integrated bridge, current sensing and protections. Use closed-loop field
oriented control, calibrated electrical zero/pole count and a correctly aligned
diametric magnet. Select magnet dimensions/grade only after the encoder field
and mechanical stack have been checked; a generic axially magnetized knob
magnet is unsuitable. Magnet and knob tooling therefore remain RFQ items.

Characterize detent torque, friction/cogging, audible switching, stall heating,
current measurement and encoder latency on a rig. Clamp torque/current and
temperature; disable the bridge on stale feedback, watchdog, brownout or fault.
Maintain a mechanical press/physical YES and KILL path independent of haptic
software. Test mic/audio/TFT/Wi-Fi interference and motor transients. Do not
infer torque, current draw, runtime or EMI compliance from the catalog price.

## Optional battery and USB-C PD

Use a protected single-cell pack for evaluation: **Adafruit 2011**, 3.7 V,
2 Ah, [DigiKey $12.50 at 1](https://www.digikey.com/en/products/detail/adafruit-industries-llc/2011/6612469).
Its page specifies 500 mA standard charge/discharge rates. It is not qualified
here for simultaneous motor, radio, TFT and speaker peaks. Obtain a production
pack drawing, protection thresholds, approved current/temperature limits,
thermistor option, IEC 62133-2 evidence and UN 38.3 test summary for the exact
delivered pack. No battery-life claim is supportable before measured loads.

**BQ24074RGTR** provides single-cell linear charging and power-path management;
its [TI datasheet](https://www.ti.com/lit/ds/symlink/bq24074.pdf) specifies the
input operating range and thermal/input-current regulation. Set charge/input
limits to the actual pack and USB source, use pack-temperature sensing, and
validate charging under load and thermal shutdown. Its 1.5 A IC capability does
not authorize that rate for this pack. **TPS63070RNMR** is a candidate regulated
3.3 V buck-boost stage ([TI](https://www.ti.com/product/TPS63070)); inductor,
capacitors, compensation/layout and peak output capability require design review.
The charger output is not a regulated 5 V motor rail. Keep high-power haptics
disabled on battery until a suitably rated pack and power stage are qualified.

**STUSB4500QTR** is the PD **sink controller**, not a charger or DC/DC converter
([ST datasheet](https://www.st.com/resource/en/datasheet/stusb4500.pdf)). Retain
USB 2.0 D+/D− for CDC, add a properly rated receptacle, CC/VBUS protection,
controlled power path, input fuse and reverse-current blocking. Start at safe
default USB power; request higher PD voltage only for a separately validated
motor rail. Feed the BQ24074 from regulated 5 V: **never connect a negotiated
12/15/20 V VBUS directly to its charger input**. Add a rated upstream buck and
fault/contract-loss interlock if higher voltage is selected. Those components
remain RFQ/design gates, not implicitly included functionality. Test C-to-C,
A-to-C, dead battery, non-PD hosts, cable reversal, renegotiation and unplugging
while charging/driving the knob. Prevent battery backfeed into the host.

## BOM worksheet for 1,000 assembled units

Prices below are the exact displayed distributor tiers observed during research,
in **USD** unless explicitly EUR. Quantity is component demand, without invented
yield loss. A lower published tier is carried forward only as a **catalog-rate
extension**, never labelled a negotiated 1k price. Full-reel minimums are not
silently substituted for a 1k purchase. Tax, freight, tariffs, tooling, assembly,
test/provisioning, packaging and certification are excluded. Stock/lead time
and prices must be reconfirmed before a purchase order.

| Function / exact part | Per pad / demand | Published tier / unit | Extension for demand | Distributor price evidence |
| --- | ---: | ---: | ---: | --- |
| Secure element, SE050E2HQ1/Z01Z3Z | 1 / 1,000 | 1,000 / $3.26 | $3,260.00 | [Mouser, USD](https://www.mouser.mx/en/ProductDetail/NXP-Semiconductors/SE050E2HQ1-Z01Z3Z?qs=MyNHzdoqoQJLcBuQE9NcBA%3D%3D) |
| BLDC, T-Motor GB2208 KV128 | 1 / 1,000 | single / $25.90 | $25,900.00 catalog-rate extension; volume RFQ | [Foxtech](https://store.foxtech.com/gb2208/) |
| Encoder, AS5047P-ATSM-TSSOP14 | 1 / 1,000 | 500 reel / $4.55 | $4,550.00, two 500 reels | [Mouser, USD](https://www.mouser.co.il/en/ProductDetail/Infineon-Technologies/AS5047P-ATSM-TSSOP14?qs=JhldWgE%2F6buAUocjdAEyQw%3D%3D) |
| Driver, DRV8316CRRGFR | 1 / 1,000 | 250 cut tape / $3.34 | $3,340.00 catalog-rate extension; 1k RFQ | [Mouser](https://www.mouser.com/en/ProductDetail/Texas-Instruments/DRV8316CRRGFR?qs=rQFj71Wb1eV2hUZyyFFOVQ%3D%3D) |
| PD sink, STUSB4500QTR | 1 / 1,000 | 1,000 / $1.20 | $1,200.00 | [Mouser](https://www.mouser.com/en/ProductDetail/STMicroelectronics/STUSB4500QTR?qs=wUXugUrL1qyQbYMSzG1ujg%3D%3D) |
| Charger, BQ24074RGTR (battery option) | 1 / 1,000 | 1,000 / $1.33 | $1,330.00 | [Mouser, USD](https://www.mouser.co.za/en/ProductDetail/Texas-Instruments/BQ24074RGTR?qs=ZV%2Fxhq4oszp2Nll7fIx5wg%3D%3D) |
| 3.3 V regulator, TPS63070RNMR | 1 / 1,000 | 1,000 / $1.88 | $1,880.00 | [Mouser, USD](https://br.mouser.com/en/ProductDetail/Texas-Instruments/TPS63070RNMR?qs=LuYMPh7GGMS51GHntBDRnQ%3D%3D) |
| Protected pack, Adafruit 2011 (battery option) | 1 / 1,000 | single / $12.50 | $12,500.00 catalog-rate extension; volume RFQ | [DigiKey](https://www.digikey.com/en/products/detail/adafruit-industries-llc/2011/6612469) |
| 2.8 inch ILI9341 display reference module, Adafruit 1770 | 1 / 1,000 | single / $29.95 | $29,950.00 catalog-rate extension; volume RFQ | [DigiKey](https://www.digikey.com/en/products/detail/adafruit-industries-llc/1770/5761251) |
| Radio/MCU, ESP32-S3-WROOM-1-N16R8 | 1 / 1,000 | 100 / **EUR 5.0575 incl. VAT** | **EUR 5,057.50 incl. VAT**, catalog-rate extension; 1k RFQ | [Bürklin](https://www.buerklin.com/en/p/espressif/wireless-combination-modules/esp32-s3-wroom-1-n16r8/60S1458/) |
| ATECC608B-MAHDA-T, comparison only, excluded above | alternative / 1,000 | 1,000 / $0.837 | $837.00 alternative | [Mouser](https://www.mouser.com/en/ProductDetail/Microchip-Technology/ATECC608B-MAHDA-T?qs=W%2FMpXkg%252BdQ71cGyt0Wo3Jw%3D%3D) |

Priced USD rows with SE050E and battery: **$83,910 / 1,000 = $83.91 per pad**,
plus the separate **EUR 5,057.50** radio-module extension. This is a **partial
catalog subtotal**, not a finished-pad COGS or a manufacturable quotation. Do
not convert currencies, infer a bulk motor/display discount, or count the
comparison ATECC as a second secure element. A no-battery population omits the
$13,830 charger/pack extension; regulator and other power needs remain.

The retained 14 keys, knob press, keycaps, matrix diodes, INMP441 microphone,
MAX98357A amplifier, speaker and WS2812 status LED still need identification of
the exact assembled-board parts and production distributor quotes. Controller
names alone are not orderable module part numbers. This research does not
replace or remove them. Additional procurement gates: encoder magnet, USB-C
connector/protection, high-voltage motor/charger buck, power-path FETs,
inductors/passives, battery connector/thermistor, PCB stackup/panel, mechanical
knob, enclosure, fasteners and labels. Their prices/quantities are **RFQ**, not
zero. No invented part number or cost is supplied for custom parts without a
drawing. Release a complete 1k purchase BOM only after schematic/AVL freeze,
vendor quotes and confirmation of minimum order multiples and available stock.

## Enclosure DFM and production gates

Prototype the measured PCB/display/motor/battery stack before cutting a mold.
Obtain supplier-approved resin, wall/boss/rib geometry, draft, parting lines,
gate/ejector locations, texture and shrinkage tolerances. These depend on the
actual tool/material; no universal dimension or tooling price is assumed.
Keep sink-sensitive bosses behind cosmetic surfaces, provide screw/insert
access, register the display window without loading its glass, and support the
USB shell mechanically rather than through solder joints alone.

Maintain the module antenna keep-out per Espressif's integration drawing;
place metal motor, fasteners, battery foil and conductive coatings away from
it. Provide encoder magnet alignment adjustment and independent knob thrust
support, wire strain relief, speaker acoustic path and a sealed microphone
gasket/port. Isolate motor vibration and charger heat from mic and battery.
Allow pack swelling and removal without puncture; keep it clear of sharp ribs
and screws. Avoid potting a replaceable cell. Verify drop/twist, connector
cycles, knob abuse, thermal soak and accidental KILL/YES interactions.

Pogo fixtures need power/current, boot/UART/USB, key-matrix/encoder, audio,
display/LED, RF and secure-element provisioning access. Track board revision,
serial/certificate and public self-test results. Quote molding/tool life,
assembly time, pack transport, test fixtures and compliance separately; no
contact with a supplier or paid order was made for this document.

## FCC and CE path

Use the **ESP32-S3-WROOM-1-N16R8** pre-certified radio module rather than a bare
S3 RF design. [Espressif's certificate index](https://www.espressif.com/en/support/documents/certificates?keys=ESP32-S3-WROOM-1&order=title&sort=asc)
and [module datasheet](https://documentation.espressif.com/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf)
are the starting evidence. Obtain the grant/integration conditions for the
actual module revision and antenna. Module certification does **not** certify
the finished pad, its motor noise, USB emissions or new antenna arrangement.

For the US, have the test lab assess the modular grant conditions under
[47 CFR 15.212](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-15/subpart-C/section-15.212),
host digital emissions, RF exposure, simultaneous transmit conditions and
required host label/manual statements. Antenna/enclosure changes may require
additional radio work; agree the scope before production. Run pre-compliance
with Wi-Fi/BLE active, charging, worst-case motor drive, TFT and audio together.

For the EU, create a finished-product technical file, risk assessment, test
reports, traceability/manuals and EU Declaration of Conformity under the
[Radio Equipment Directive](https://single-market-economy.ec.europa.eu/sectors/electrical-and-electronic-engineering-industries-eei/radio-equipment-directive-red_en).
Have the lab identify currently applicable harmonised radio/EMC, safety and RF
exposure standards, plus RoHS/WEEE/battery obligations for the shipping markets.
The Commission's current guidance and [Regulation (EU) 2026/339](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX%3A32026R0339)
retain relevant RED cybersecurity requirements for products placed on the
market through 10 December 2027, with repeal effective 11 December 2027 as CRA
requirements apply. Assess the connected signing product's applicable scope
with the lab; do not treat an ESP32 CE report as the pad's security assessment.
Certification fees, test durations and a final conformity decision require
the actual design and a lab quote; none is guessed here.
