# xorrpad: product line, pricing, market and manufacturing (local commits only, NEVER push)

Nick's direction (Nov 12 2026):
- Sell **two versions**: with a display and without one.
- **Buy everything from outside manufacturers.** PCB fabrication and assembly, enclosures, keycaps and switches all come from vendors. Our own work is final assembly only: press in the switches (hot-swap PCB, so no soldering), fit the 3D-printed or moulded caps, close the case, flash and run the factory self-test.
- Price it properly, and analyse the market and the manufacturing.

**Hard rule: every number has a source.** That means a URL plus the date you read it: part prices, MOQ breaks, competitor prices, shipping, duties. If a number cannot be found, write "quote needed from <vendor>" and never estimate silently. Where you must assume something (yield, return rate), label it **ASSUMPTION** with the reasoning.

Today's pad (`firmware/xorrpad/config.h`, `cad/`) is a hand-wired prototype:
- ESP32-S3 (16 MB flash, OPI PSRAM);
- 14 MX-style keys in a matrix and an EC11-style rotary encoder with push;
- INMP441 I2S mic and MAX98357A I2S amp with a speaker;
- a 2.8" ILI9341 320×240 SPI TFT;
- a WS2812 status LED;
- USB-C power, no battery;
- a 3D-printed tray, plate, display pod and knob, plus 14 caps.

## Deliverables in `docs/business/`
1. **`PRODUCT-LINE.md`: the two SKUs.**
   - **xorrpad Pro** has the 2.8" display, mic, speaker and knob.
   - **xorrpad Core** has no display. It is keys plus knob plus per-key LEDs. The desk app and the phone are its screen. Decide whether Core keeps the mic and amp, with reasons.
   - Optional: a per-key RGB upgrade for Pro.
   - Give each one a feature table, and say who it is for.
2. **`BOM.md` plus `bom-pro.csv` and `bom-core.csv`.**
   - Use real distributor parts, preferring LCSC part numbers so JLCPCB can assemble them. Mouser and DigiKey are for cross-checks.
   - Quantity breaks at 100, 500, 1,000 and 5,000 units.
   - Include the ESP32-S3-WROOM-1-N16R8 module (or the N8R8, and justify the choice), Kailh hot-swap sockets, switches (two options, such as Gateron and Kailh), the EC11 encoder, the mic and amp (or an all-in-one codec), the speaker, USB-C receptacle plus ESD protection plus CC resistors, the LDO or buck, the WS2812/SK6812 LEDs, and passives.
   - The display is a bare 2.8" ILI9341 or ST7789 panel with an FPC. A module on a breakout costs more.
3. **`MANUFACTURING.md`.**
   - **Vendor comparison** for PCB plus PCBA: JLCPCB, PCBWay and an Indian option such as Lion Circuits. Cover price at each quantity, lead time and assembly limits.
   - **Enclosure:** 3D printing services (JLC3DP, Craftcloud) against injection moulding. Give tooling cost quotes or published ranges with sources, and the break-even unit count.
   - **Keycaps:** custom printed or dye-sub sources, and MOQs.
   - **Final assembly SOP:** a numbered list of steps, the minutes per unit, and the tools needed.
   - **Factory test:** uses the v2 firmware's factory mode and `factory.sh`.
   - **Packaging, shipping and duties:** cover both markets. India: import duty on PCBA and components, with sources. US/EU: DTC shipping rates.
   - **Certification:** FCC/CE using the pre-certified ESP32-S3 module, and BIS for India if it applies. Costs need sources.
   - **Timeline:** prototype → EVT → DVT → PVT, with weeks per stage.
4. **`MARKET.md`.**
   - **Comparables with current prices and sources:** Elgato Stream Deck Mini, MK.2, + and Neo; Loupedeck/Logitech MX Creative Console; Work Louder; Ledger Nano S Plus, Nano X and Flex; Trezor Safe 3 and 5; trading-specific hardware if any exists.
   - **Positioning:** the only trading desk pad with clear signing plus voice, versus Stream Deck (no trading safety) and hardware wallets (no desk workflow).
   - **TAM/SAM/SOM:** active Solana traders and perps volume, from cited sources such as DefiLlama and Dune. Keep it realistic.
   - **Channels:** the xorr.finance waitlist (323 today, live from its API), crypto Twitter, Solana ecosystem partners, and the hackathon wins.
5. **`PRICING.md`.**
   - **Landed cost per unit** for each SKU at 100, 500 and 1,000 units: BOM + PCBA + enclosure + caps + packaging + inbound freight + duty + payment fees (Stripe or Solana Pay, with sources) + a warranty reserve (ASSUMPTION) + a returns reserve (ASSUMPTION).
   - **Recommended retail** in USD and INR. Target a 50–60% DTC gross margin, sanity-checked against the comparables.
   - **Pre-order / founder edition:** price, deposit and refund policy points for Nick to approve.
   - **Software:** the optional subscription (a hosted LLM after funding) as upside only, never needed to make the hardware margin work.
6. **`hardware/`: the production PCB.**
   - Schematic as code with SKiDL (or atopile), producing a KiCad netlist.
   - Hot-swap sockets for all 14 keys, so the team only presses switches and never solders. Add a TFT FPC connector for Pro.
   - JLC-ready BOM and CPL formats.
   - Attempt a KiCad layout with the Freerouting autorouter. Be honest in `hardware/README.md` that a human PCB designer must review and finish the layout before any order, and give the expected cost of that review with sources (freelance rates).
   - **Do NOT place any order** and do not upload to any vendor.
7. **`SUMMARY.md`.** One page: the two SKUs, landed cost, recommended price and margin at 500 units, the cash needed for a first batch of 100 and of 500, the timeline, the top 5 risks, and the next 5 actions only Nick can take (with links).

Commit per file. **NEVER push.** Report in under 12 lines, with the headline prices.
