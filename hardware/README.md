# xorrpad PCB: engineering draft — DO NOT ORDER

Created 2026-11-12 for the [business brief](../docs/business/BRIEF.md). **A human PCB designer must review and finish the schematic, placement and routing before any order.** No files were uploaded to a vendor, no orders placed and no hardware energized/flashed. Pro P1 and Core P2 now have locally routed boards with clean KiCad DRC; these remain engineering drafts, not production releases.

## P3 fabrication exports and fit result, 2026-11-12

**A human PCB designer must review this before any order.** P3 produced local review packages for [Core](generated/core/fab/) and [Pro](generated/pro/fab/), using **KiCad CLI 10.0.6** and the final P2/P1 boards. Both source PCBs are unchanged; each package's [Core manifest](generated/core/fab/manifest.json) / [Pro manifest](generated/pro/fab/manifest.json) records source/output SHA-256 hashes, commands in `export.log`, population, missing 3D models, and the fresh DRC result. No order, vendor upload, or push occurred. These exports are engineering review artifacts, not a manufacturing release.

| P3 result | Core | Pro |
| --- | ---: | ---: |
| DRC before P3: errors / warnings / unconnected | 0 / 0 / 0 | 0 / 0 / 0 |
| Fresh P3 DRC: errors / warnings / unconnected | **0 / 0 / 0** | **0 / 0 / 0** |
| Gerber layers / job file | 11 / 1 | 11 / 1 |
| Excellon drill files | PTH + NPTH | PTH + NPTH |
| Plated / non-plated drill features (including slots) | 346 / 44 | 365 / 45 |
| Regenerated JLC BOM groups / component references | 20 / 85 | 27 / 72 |
| Regenerated CPL references | 85 | 72 |
| Components with blank LCSC IDs | 8 | 16 |
| Native review schematic pages / verified connected pins | 12 / 251 | 11 / 266 |
| Board PDF layer pages | 8 | 8 |
| Actual CLI PCB render views | top, bottom, three-quarter | top, bottom, three-quarter |
| Component references missing 3D models | 32 | 20 |

Remaining DRC warnings: **none**; no P3 severity changes or exclusions. Raw reports: [Core](generated/core/fab/core-drc.json), [Pro](generated/pro/fab/pro-drc.json). The historical original unrouted totals were Core **658 violations + 195 unconnected**, Pro **569 + 206**; P3 starts from the already clean P2/P1 boards. DRC does not certify power, signal integrity, component selection, or fit.

Each package includes four copper layers in signal/GND/3V3/signal order, front/back mask, paste and silkscreen, Edge.Cuts, a Gerber job file, separate metric PTH/NPTH Excellon files, drill maps and a drill report. Gerbers/drills share KiCad's absolute origin. BOM/CPL are regenerated and reconciled against the final board pads, footprint identities and SKiDL parts manifest. CPL uses PCB **(100,184) mm** as its lower-left bounding origin, +Y upwards, `T`/`B`, and KiCad rotations; no assembler orientation corrections are claimed. Blank supplier IDs, unresolved **ILIM_VALUE_TBD**, draft J3 and sourcing holds make these unsuitable for procurement as-is.

There was no existing native schematic to plot. [export-fab.py](export-fab.py) reconstructs editable hierarchical KiCad review schematics from each saved SKiDL netlist using installed library symbols. U8 and Pro J3 retain the original passive terminal models. Named global nets join sheets; source-open pins stay open, with no added no-connect or power flags. **Actual `kicad-cli sch export netlist` round trips reproduce every source reference/pin/named-net connection exactly** (251 Core / 266 Pro connected pins), and final PCB pad nets match the source manifest. This is a connectivity review schematic, not a newly signed-off electrical design/ERC result. PDFs: [Core schematic](generated/core/fab/core-schematic.pdf), [Pro schematic](generated/pro/fab/pro-schematic.pdf), [Core board](generated/core/fab/core-board.pdf), [Pro board](generated/pro/fab/pro-board.pdf). Board PDFs show all four copper layers, both silkscreens and both fabrication layers with Edge.Cuts, at 1.6x, viewed from above; bottom pages are not mirrored. Every page and all six renders were visually inspected locally.

Actual `kicad-cli pcb render` images: Core [top](generated/core/fab/core-top.png), [bottom](generated/core/fab/core-bottom.png), [three-quarter](generated/core/fab/core-three-quarter.png); Pro [top](generated/pro/fab/pro-top.png), [bottom](generated/pro/fab/pro-bottom.png), [three-quarter](generated/pro/fab/pro-three-quarter.png). Missing-model references are enumerated in each manifest (including sockets, encoder, USB, some ICs and LEDs); these renders do not establish a complete populated enclosure fit.

[FIT.md](FIT.md) now covers both final boards against all four relevant `cad/` sources: nominal wall/skirt gaps **0.600/0.500 mm**, boss/tower gaps **0.8976/0.5976 mm**, all 14 key centres matching, **zero PCB mounting holes**, and **52.8 mm2 cage overlap** at the prototype seating Z. Pro's **24.5 mm** FPC contact span exceeds the existing pod opening's **16.1245 mm** bounding diagonal; a straight flat passage fails. That pod is designed for a different headered panel. Both SKUs need PCB support/Z design; Pro additionally needs a validated panel/FPC route. The mechanical check is explicitly **not an assembled-fit pass**.

Reproduce exports locally from the repository root (uses the installed KiCad libraries; no network):

```sh
/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/Current/bin/python3 hardware/export-fab.py --sku core
/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/Current/bin/python3 hardware/export-fab.py --sku pro
python3 hardware/verify.py
```

The existing offline suite passes **8 tests**. Source/output hashes, BOM/CPL reference coverage, round-trip schematic connectivity, PDF page counts, PNG integrity and the Gerber/drill inventories were also checked. Electrical, RF, USB, power, procurement, footprint and mechanical holds below remain. **A human PCB designer must review this before any order.**

## Core P2 routing result, 2026-11-12

**Core: 0 errors, 0 warnings, 0 unconnected** (latest placement baseline: 0 errors / 0 warnings / 197 unconnected; original baseline: 411 errors / 247 warnings / 195 unconnected). [Routed board](generated/core.kicad_pcb), [actual KiCad DRC](generated/core-p2-drc.json), [hashes and measurements](generated/core-p2-summary.json), [routing reproduction](ROUTING.md#core-p2-final-result--2026-11-12). Official Freerouting 2.5.0 JAR on local Java 25 completed in 73.013 s with network denied; its session was imported and finished locally. Four-layer signal/GND/3V3/signal stack, 0.15 mm minimum trace/space, 0.6/0.3 mm vias, filled ground pours and **154 added stitching vias**. CAD key centres, footprint population and pad nets are verified; no DRC severity or exclusion was changed. Core CPL and all LED bypass-pad distances are regenerated. The offline suite passes **8 tests** for both boards.

Remaining DRC warnings: **none**. [Top](generated/core/p2/core-top.png), [bottom](generated/core/p2/core-bottom.png) and [three-quarter](generated/core/p2/core-three-quarter.png) local KiCad renders are review aids; some footprints lack 3D models. USB uses the same nominal 90 Ω geometry as Pro, with measured A-contact paths 44.49 mm DP / 35.88 mm DN; uncoupled fanout/skew and the two-via buck switch node still require signal/power-layout review. DRC is not electrical or manufacturing sign-off. [FIT.md](FIT.md) records actual XY clearances and the existing cage interference; the populated PCB still needs a mounting/support/Z design. ILIM_VALUE_TBD and sourcing blockers remain. This P2 completed Core routing; the later P3 section above records fabrication review exports. Manufacturing release remains outstanding. Nothing was ordered, uploaded or pushed. **A human PCB designer must review this before any order.**

## Pro P1 routing result, 2026-11-12

**Pro: 0 errors, 0 warnings, 0 unconnected** (placement baseline: 0 errors / 207 unconnected). [Routed board](generated/pro.kicad_pcb), [actual KiCad DRC](generated/pro-p1-drc.json), [hashes and measurements](generated/pro-p1-summary.json), [routing provenance and reproduction](ROUTING.md). Official Freerouting JAR sessions were imported, then finished locally. Four-layer signal/GND/3V3/signal stack, 0.15 mm trace/space minima, 0.6/0.3 mm vias, filled GND pours and 166 added stitching vias. CAD key centres and DRC severities/exclusions are unchanged. Final Pro CPL and bypass distances are regenerated.

Remaining DRC warnings: **none**, so no waivers apply. USB has a nominal 90 Ω geometry target; impedance, uncoupled connector fanout, measured skew and the buck switch-node route require human review as detailed in ROUTING.md. FPC, input-limiter, sourcing and mechanical-fit production blockers below remain. Core routing and fabrication exports were outside this historical Pro P1 step; see P2 and P3 above. Manufacturing release remains outstanding. Nothing was ordered, uploaded or pushed. **A human PCB designer must review this before any order.**

## Files and reproducibility

- [circuit.py](circuit.py): SKiDL electrical source for Core and Pro, with explicit supplier MPNs/LCSC fields. [requirements.txt](requirements.txt) pins SKiDL 3.0.0. KiCad libraries provide actual electrical pin models; the FPC and proposed input limiter have explicit terminal models, so ERC cannot certify their functional behavior.
- [layout.py](layout.py): uses KiCad's `pcbnew` to create placement boards and Specctra DSNs. Physical key centers, centred MIC and knob follow [cad/partlib.py](../cad/partlib.py). Other dimensions/placements are **design assumptions**: the initial 84 mm square PCB and proposed holes/two-layer routing experiment. The final `layout-v2.py` boards use boss notches with **no PCB mounting holes**, four copper layers and rounded/relieved outlines; see P3 and FIT.md for actual fit limits. Board Z, supports and case production changes require mechanical review.
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

## Historical initial verification results, 2026-11-12

These are the original unrouted baseline reports; the current Pro P1 and Core P2 results above supersede both DRC columns. Original reports remain preserved for provenance.

| Check | Pro | Core |
| --- | ---: | ---: |
| SKiDL ERC | 0 errors, **105 warnings** | 0 errors, **64 warnings** |
| KiCad DRC violations, all severities | **569** | **658** |
| Additional unconnected items | **206** | **195** |
| Freerouting session created | **No** | **No** |

ERC warnings include undriven power inputs, deliberately unused MCU/interface pins, terminal-model limitations and an unterminated final LED output. No fake power flags were inserted to suppress those findings. KiCad reports include shorts, overlapping courtyards, clearances, drilled-hole and silkscreen issues. Raw reports preserve all findings and the default ignored-check list; no existing tests or DRC rules were relaxed. A CLI report command exiting zero means it **wrote a report**, not that DRC passed.

Freerouting loaded both real DSNs, then its native build threw **`com.oracle.svm.core.jdk.UnsupportedFeatureError: SerializationConstructorAccessor class not found … ComponentOutline`**. The wrapper stopped each failed child by PID; exit **143**, no `.ses` output. See [Pro log](generated/pro-router.log), [Core log](generated/core-router.log) and [result](generated/routing-result.json). **That historical native-runtime failure was superseded for Pro by the successful official JAR workflow above; Core is now routed through the successful P2 JAR workflow above.** A designer can retry the Java runtime release or another supported local version, then import a successful SES into KiCad and rerun DRC; no routed result is claimed here.

The standalone `python3 hardware/verify.py` run passed **8 tests, 0 failures, 0 skips**. They verify distinct socket/matrix cells, separate CC pull-downs and BTL connections, SKU population/FPC straps, BOM/CPL reference reconciliation, populated netlists, component quantity-tier arithmetic/provenance/unknowns, current local routing evidence and explicit non-clean DRC evidence. They do not call external APIs or use mock chain responses. The existing desk/firmware regression suite was not rerun because no application/firmware source changed.

## Electrical and sourcing decisions to review

1. **14 genuine Kailh CPG151101S11 sockets**, each with its own 1N4148W matrix diode. Columns pull up and selected rows sink; diode cathodes face row nets. Logical cells follow the existing [agents.h](../firmware/xorrpad/agents.h) map, including its historically unverified positions. Physical key order follows CAD. A new PCB still needs every key tested against its role; reused pin names do not establish physical proof. Encoder GPIO21/47/38 are a **new mapping proposal**, not implemented firmware support.
2. Keep ESP32-S3-WROOM-1-N16R8 and its native USB pins; leave GPIO35/36/37 unused for octal PSRAM. Pro P1 and Core P2 add the four-layer antenna keepout, GND reference/stitching and USB routing geometry; USB impedance, strap pins and RF/system integration still require independent review. Consult [Espressif datasheet](https://www.espressif.com/sites/default/files/documentation/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf), read 2026-11-12. The module is not the original DevKit: case supports and USB opening need rework.
3. TPS62160 buck is proposed instead of dissipating the full load in an LDO. Feedback 620 kΩ / 200 kΩ and a 0.8 V reference give a nominal **3.28 V**, a derived design setting, subject to resistor/reference tolerance. Inductor saturation, effective capacitance, hot loop, exposed-pad vias and thermal measurements need review. [TI data sheet](https://www.ti.com/lit/ds/symlink/tps62163.pdf), read 2026-11-12. Proposed TPS2553 input switch has **ILIM_VALUE_TBD**: the board must not be powered as-is. Add/validate advertised-current detection, limiter tolerance, inrush and suspend/brightness/audio controls before energizing. Separate CC resistors alone are not a power budget.
4. Pro FPC pins follow EastRising ER-TFT028-4 Rev2.1; interface-II SPI straps IM3..0 = 1110. Logic/VCI to 3.3 V; RD high; parallel/RGB inputs grounded; unused touch/SDO/TE open. The panel has four parallel backlight chips, so the draft uses separate 100 Ω anode resistors and a PWM cathode MOSFET. Current, brightness and thermal limits still require the actual supplied panel. [Manufacturer PDF via distributor](https://www.icbanq.com/icdownload/V2_DATA/ICBShop/Board/DFDSAFJLSDA.pdf), read 2026-11-12.
5. **FPC footprint is a placement placeholder**, named `ER-CON50HT-1_DRAFT`: only its 50 positions / 0.5 mm pitch are sourced. Pad width/length and missing shell anchors are explicitly assumptions in `layout.py`. Replace it with a measured/manufacturer-verified top-contact land pattern, latch clearance and strain relief before manufacture. It is not JLC placement-approved.
6. Pro's ICS-43434 is a costed **NRND/EOL candidate**, not an approved production mic. Qualify a current I2S part; verify sample bit alignment and bottom acoustic port, gasket and sealing. MAX98357A/speaker are BTL; have the vendor crimp the PH harness and limit power to the selected speaker rating. Core omits audio and TFT; it needs a SKU-aware factory report and host prompts, not falsified passes for absent hardware.
7. Core uses 14 key LEDs plus status; base Pro status only. Both need LED voltage/pinout, bypass and brightness validation. Pro's optional key-RGB upgrade is a future population/layout change, not present in this draft.

## Formats, licensing and order gate

JLC BOM columns: `Comment,Designator,Footprint,LCSC Part #`. CPL columns: `Designator,Mid X,Mid Y,Layer,Rotation`, millimetres, proposed bottom-left board origin, positive Y upward. Bottom socket placements are marked `B`; no panel transforms, fixture tooling or JLC rotation corrections were applied. THT encoder/header must be purchased/soldered by the assembler. Blank LCSC fields and a syntactically valid CSV **do not mean JLC-ready procurement**. See [JLC BOM guidance](https://jlcpcb.com/help/article/bill-of-materials-for-pcb-assembly) and [CPL guidance](https://jlcpcb.com/help/article/pick-place-file-for-pcb-assembly), read 2026-11-12; final BOM/CPL needs the assembler's reviewed orientation/parts approval.

The socket compatibility footprint was fetched from [Keebio](https://github.com/keebio/Keebio-Parts.pretty/blob/master/Kailh_MX_Socket-compat.kicad_mod), read 2026-11-12. Its MIT license is preserved in [KEEBIO-LICENSE](KEEBIO-LICENSE). It contains compatibility through-holes/unused LED pads and routing cutouts: inspect against the actual Kailh drawing and decide a dedicated socket-only land pattern; do not blindly manufacture this community footprint. Other footprints/symbols are from the installed KiCad libraries; no vendor model uploaded.

Expected **review/re-layout budget scenario**: [Upwork](https://www.upwork.com/hire/pcb-designers/) publishes **$25–$50/hour**, read 2026-11-12. **ASSUMPTION:** 20–40 hours ⇒ **$500–$2,000**, excluding platform fees, prototypes and compliance; this can become a larger redesign. **Quote needed from the selected designer**. Required deliverables: checked schematic/ERC dispositions, actual pin/footprint drawings, power/RF/USB review, finished layout with clean/reasoned DRC, CAD interference checks, validated fabrication/assembly outputs and independent production-release sign-off. P3 includes local Gerber and drill review exports; no manufacturing/order release is included.
