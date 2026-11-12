# xorrpad PCB: engineering draft — DO NOT ORDER

Created 2026-11-12 for the [business brief](../docs/business/BRIEF.md). **A human PCB designer must review and finish the schematic, placement and routing before any order.** No files were uploaded to a vendor, no orders placed and no hardware energized/flashed. This is a populated KiCad/netlist starting point, not a production release or a completed autoroute.

## Files and reproducibility

- [circuit.py](circuit.py): SKiDL electrical source for Core and Pro, with explicit supplier MPNs/LCSC fields. [requirements.txt](requirements.txt) pins SKiDL 3.0.0. KiCad libraries provide actual electrical pin models; the FPC and proposed input limiter have explicit terminal models, so ERC cannot certify their functional behavior.
- [layout.py](layout.py): uses KiCad's `pcbnew` to create placement boards and Specctra DSNs. Physical key centers, centred MIC and knob follow [cad/partlib.py](../cad/partlib.py). Other dimensions/placements are **design assumptions**: proposed 84 mm square PCB inside the prototype case, mounting holes based on its ±39 mm boss centres, two copper layers for this routing experiment. Stackup, rounded corners, tray interference, actual socket side, board Z and case production changes require mechanical review.
- [generated/](generated/): each SKU's KiCad `.net`, complete parts/pin manifest, placement `.kicad_pcb`, project settings, `.dsn`, JLC-format BOM/CPL and raw DRC report. `pro` has **72** electrically assembled components; `core` **85**, excluding mechanical mounting holes and final switch/cap/case kits. Counts are derived from the generated manifests, not factory measurements.
- [route.py](route.py), [routing-result.json](generated/routing-result.json) and SKU router logs: bounded **local** Freerouting attempt with analytics and HTTP API disabled. SHA-256 ties each recorded attempt to its DSN. Processes are terminated by their exact child PID if the router fails/hangs; no persistent server is started.
- [verify.py](verify.py): offline artifact and price reconciliation checks; it does **not** validate circuits, RF, layout safety or a real manufactured product.

Build from the repo root (requires Python, KiCad and its symbol/footprint libraries):

```sh
python3 -m venv hardware/.venv
hardware/.venv/bin/pip install -r hardware/requirements.txt
hardware/.venv/bin/python hardware/circuit.py --sku pro
hardware/.venv/bin/python hardware/circuit.py --sku core
# macOS KiCad Python; Linux may expose pcbnew through its system Python instead.
/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/Current/bin/python3 hardware/layout.py
python3 tools/business-bom.py
kicad-cli pcb drc --format json --severity-all --output hardware/generated/pro-drc.json hardware/generated/pro-placement.kicad_pcb
kicad-cli pcb drc --format json --severity-all --output hardware/generated/core-drc.json hardware/generated/core-placement.kicad_pcb
python3 hardware/route.py --router /path/to/local/freerouting-cli
python3 hardware/verify.py
```

Set `KICAD_SYMBOL_DIR` and `KICAD_FOOTPRINT_DIR` for non-default installations. Generators do not contact any external API. `business-bom.py` uses saved [price observations](../docs/business/price-sources.json), not live quotes. Install/download tools only from their official sources. Tested: **KiCad CLI 10.0.6**, its bundled Python/pcbnew, **SKiDL 3.0.0**, and the [Freerouting v2.5.0 macOS ARM64 CLI release](https://github.com/freerouting/freerouting/releases/tag/v2.5.0), downloaded 2026-11-12. The [official CLI reference](https://github.com/freerouting/freerouting/blob/v2.5.0/docs/command_line_arguments.md) documents `-da`, local DSN input and disabled API settings; no hosted autorouting used.

## Real verification results, 2026-11-12

| Check | Pro | Core |
| --- | ---: | ---: |
| SKiDL ERC | 0 errors, **105 warnings** | 0 errors, **64 warnings** |
| KiCad DRC violations, all severities | **569** | **658** |
| Additional unconnected items | **206** | **195** |
| Freerouting session created | **No** | **No** |

ERC warnings include undriven power inputs, deliberately unused MCU/interface pins, terminal-model limitations and an unterminated final LED output. No fake power flags were inserted to suppress those findings. KiCad reports include shorts, overlapping courtyards, clearances, drilled-hole and silkscreen issues. Raw reports preserve all findings and the default ignored-check list; no existing tests or DRC rules were relaxed. A CLI report command exiting zero means it **wrote a report**, not that DRC passed.

Freerouting loaded both real DSNs, then its native build threw **`com.oracle.svm.core.jdk.UnsupportedFeatureError: SerializationConstructorAccessor class not found … ComponentOutline`**. The wrapper stopped each failed child by PID; exit **143**, no `.ses` output. See [Pro log](generated/pro-router.log), [Core log](generated/core-router.log) and [result](generated/routing-result.json). **Routing is blocked by that native-runtime error and, independently, by the unfinished layout.** A designer can retry the Java runtime release or another supported local version, then import a successful SES into KiCad and rerun DRC; no routed result is claimed here.

The standalone `python3 hardware/verify.py` run passed **8 tests, 0 failures, 0 skips**. They verify distinct socket/matrix cells, separate CC pull-downs and BTL connections, SKU population/FPC straps, BOM/CPL reference reconciliation, populated netlists, component quantity-tier arithmetic/provenance/unknowns, current local routing evidence and explicit non-clean DRC evidence. They do not call external APIs or use mock chain responses. The existing desk/firmware regression suite was not rerun because no application/firmware source changed.

## Electrical and sourcing decisions to review

1. **14 genuine Kailh CPG151101S11 sockets**, each with its own 1N4148W matrix diode. Columns pull up and selected rows sink; diode cathodes face row nets. Logical cells follow the existing [agents.h](../firmware/xorrpad/agents.h) map, including its historically unverified positions. Physical key order follows CAD. A new PCB still needs every key tested against its role; reused pin names do not establish physical proof. Encoder GPIO21/47/38 are a **new mapping proposal**, not implemented firmware support.
2. Keep ESP32-S3-WROOM-1-N16R8 and its native USB pins; leave GPIO35/36/37 unused for octal PSRAM. Module antenna keepout, ground reference/stitching, USB differential impedance/ESD placement, strap pins and USB/RF integration are not resolved by autorouting. Consult [Espressif datasheet](https://www.espressif.com/sites/default/files/documentation/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf), read 2026-11-12. The module is not the original DevKit: case supports and USB opening need rework.
3. TPS62160 buck is proposed instead of dissipating the full load in an LDO. Feedback 620 kΩ / 200 kΩ and a 0.8 V reference give a nominal **3.28 V**, a derived design setting, subject to resistor/reference tolerance. Inductor saturation, effective capacitance, hot loop, exposed-pad vias and thermal measurements need review. [TI data sheet](https://www.ti.com/lit/ds/symlink/tps62163.pdf), read 2026-11-12. Proposed TPS2553 input switch has **ILIM_VALUE_TBD**: the board must not be powered as-is. Add/validate advertised-current detection, limiter tolerance, inrush and suspend/brightness/audio controls before energizing. Separate CC resistors alone are not a power budget.
4. Pro FPC pins follow EastRising ER-TFT028-4 Rev2.1; interface-II SPI straps IM3..0 = 1110. Logic/VCI to 3.3 V; RD high; parallel/RGB inputs grounded; unused touch/SDO/TE open. The panel has four parallel backlight chips, so the draft uses separate 100 Ω anode resistors and a PWM cathode MOSFET. Current, brightness and thermal limits still require the actual supplied panel. [Manufacturer PDF via distributor](https://www.icbanq.com/icdownload/V2_DATA/ICBShop/Board/DFDSAFJLSDA.pdf), read 2026-11-12.
5. **FPC footprint is a placement placeholder**, named `ER-CON50HT-1_DRAFT`: only its 50 positions / 0.5 mm pitch are sourced. Pad width/length and missing shell anchors are explicitly assumptions in `layout.py`. Replace it with a measured/manufacturer-verified top-contact land pattern, latch clearance and strain relief before manufacture. It is not JLC placement-approved.
6. Pro's ICS-43434 is a costed **NRND/EOL candidate**, not an approved production mic. Qualify a current I2S part; verify sample bit alignment and bottom acoustic port, gasket and sealing. MAX98357A/speaker are BTL; have the vendor crimp the PH harness and limit power to the selected speaker rating. Core omits audio and TFT; it needs a SKU-aware factory report and host prompts, not falsified passes for absent hardware.
7. Core uses 14 key LEDs plus status; base Pro status only. Both need LED voltage/pinout, bypass and brightness validation. Pro's optional key-RGB upgrade is a future population/layout change, not present in this draft.

## Formats, licensing and order gate

JLC BOM columns: `Comment,Designator,Footprint,LCSC Part #`. CPL columns: `Designator,Mid X,Mid Y,Layer,Rotation`, millimetres, proposed bottom-left board origin, positive Y upward. Bottom socket placements are marked `B`; no panel transforms, fixture tooling or JLC rotation corrections were applied. THT encoder/header must be purchased/soldered by the assembler. Blank LCSC fields and a syntactically valid CSV **do not mean JLC-ready procurement**. See [JLC BOM guidance](https://jlcpcb.com/help/article/bill-of-materials-for-pcb-assembly) and [CPL guidance](https://jlcpcb.com/help/article/pick-place-file-for-pcb-assembly), read 2026-11-12; final BOM/CPL needs the assembler's reviewed orientation/parts approval.

The socket compatibility footprint was fetched from [Keebio](https://github.com/keebio/Keebio-Parts.pretty/blob/master/Kailh_MX_Socket-compat.kicad_mod), read 2026-11-12. Its MIT license is preserved in [KEEBIO-LICENSE](KEEBIO-LICENSE). It contains compatibility through-holes/unused LED pads and routing cutouts: inspect against the actual Kailh drawing and decide a dedicated socket-only land pattern; do not blindly manufacture this community footprint. Other footprints/symbols are from the installed KiCad libraries; no vendor model uploaded.

Expected **review/re-layout budget scenario**: [Upwork](https://www.upwork.com/hire/pcb-designers/) publishes **$25–$50/hour**, read 2026-11-12. **ASSUMPTION:** 20–40 hours ⇒ **$500–$2,000**, excluding platform fees, prototypes and compliance; this can become a larger redesign. **Quote needed from the selected designer**. Required deliverables: checked schematic/ERC dispositions, actual pin/footprint drawings, power/RF/USB review, finished layout with clean/reasoned DRC, CAD interference checks, validated fabrication/assembly outputs and independent production-release sign-off. No Gerber/order release is included.
