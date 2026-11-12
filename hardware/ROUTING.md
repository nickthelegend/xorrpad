# Local JAR routing provenance

2026-11-12, ROUTE-BRIEF step 1. Official **Freerouting 1.9.0 JAR**, whose release documents Java 17 support, on local OpenJDK **17.0.19**. This avoids the 2.5.0 native image serialization failure.

- Download: https://github.com/freerouting/freerouting/releases/download/v1.9.0/freerouting-1.9.0.jar
- SHA-256: `9084a4888937a7f31f857ecc12aa7a37407f51160e4d2892dff9c9bb47ae3102`
- Official instructions: https://github.com/freerouting/freerouting/blob/v1.9.0/README.md (read 2026-11-12).
- New runner: `python3 hardware/route-jar.py --jar /path/freerouting-1.9.0.jar`. Java defaults to `/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home/bin/java`.
- `-da` disables analytics. macOS `sandbox-exec` denies **all network operations**, including the JAR's update request. A blocked request may print ConnectException locally; it cannot upload the design. No unsandboxed fallback, hosted router or HTTP listener.
- Actual smoke run: baseline Pro DSN, one pass, optimizer disabled, process PID **75526**, exit **0**, **47,116-byte SES**. This proves the JAR runs, not clean routing/DRC. The baseline is preserved in git.
- Subsequent results record JAR/input hashes, Java version, command, timing, session and exact process PID. Timeouts terminate that child by PID and fail visibly. The former native runner remains available only to reproduce the baseline failure.

No order, vendor upload, transaction or push occurred.

## Placement pass, step 2

The real KiCad placement-only scan now reports **0 violations** for each SKU, with 207 Pro / 197 Core unconnected items still to route. No DRC severities were relaxed. References moved to fabrication layers, the encoder shaft (7.5, 2.5 mm from its footprint origin) is aligned to the CAD knob centre, and genuine socket pads follow Kailh KH-PS1607-10 page 9. The production footprint selects **3-pin MX switches**; five-pin locating holes were omitted to free the module corridor. Use the Gateron 3-pin option or Kailh Box 3-pin switches. KILL is rotated 180 degrees, preserving its physical centre and logical cell. The antenna end aligns to the board edge; its original keepout remains. Module/buck thermal drills were enlarged to 0.3 mm rather than relaxing the rule.

Raw placement-only reports and measured bypass-pad distances are in generated/*-placement-v2-drc.json and *-decoupling.json. Board notches clear the existing corner bosses; support and vertical component-pocket compatibility remain for the mechanical check. FPC land pattern remains explicitly provisional and requires manufacturer approval.

## Pro P1 final result — 2026-11-12

**Pro: 0 errors, 0 warnings, 0 unconnected.** Baseline at c62b66d: 0 placement errors/warnings and 207 unconnected. Core is outside this P1 pass. No order, design upload or push occurred. **A human PCB designer must review this before any order.**

- Board: [generated/pro.kicad_pcb](generated/pro.kicad_pcb), rules: [pro.kicad_pro](generated/pro.kicad_pro), actual KiCad 10.0.6 report: [pro-p1-drc.json](generated/pro-p1-drc.json), hashes/measurements: [pro-p1-summary.json](generated/pro-p1-summary.json).
- Four layers: F.Cu signals, In1.Cu GND, In2.Cu 3V3, B.Cu signals. No signal tracks on inner layers. All 14 CAD key centres are unchanged. The original antenna rule area covers all four copper layers; module antenna edge remains at y=184 mm.
- Minimum trace/space 0.15 mm, through vias 0.6/0.3 mm, copper-edge clearance 0.5 mm. No DRC severity, exclusion or ignored-check list was changed. KiCad's exported quarter-clearance SMD exception is raised to 0.15 mm in the DSN.
- GND pours on both outer layers and In1.Cu, 3V3 plane on In2.Cu; **166 added ground stitching vias** on a 5 mm mesh plus local return positions. Plane-access dogbones are reserved before autorouting. Final zone fills are saved in the board.
- D14 rotates beside KILL; U8 moves into the east corridor; bulk audio capacitor C9 moves 1 mm east to open SPK_N. C8 remains the close bypass. Updated pad distances and final CPL are saved. The remaining corner, narrow-neck, buck and speaker paths were repaired locally after SES import.

### Official JAR evidence

The final session is from the official [Freerouting 2.5.0 release](https://github.com/freerouting/freerouting/releases/tag/v2.5.0), downloaded locally. JAR SHA-256: `f6f51bb02245e8e717f9359bd260cc9c5c0b1bc0acc8b7cb2cd5b8ffeb5de3c7`. It requires Java 25 per its official build.gradle; local OpenJDK **25.0.5.0.3** was installed (JDK 17 remains the default). Run: **109.512 seconds, exit 0**, session created. [jar-routing-result.json](generated/jar-routing-result.json) records the exact command, input hash, JAR hash and JDK. [pro-jar.log](generated/pro-jar.log) and [pro.ses](generated/pro.ses) retain the actual outputs.

`-da`, API server disabled, isolated settings and macOS `sandbox-exec` with `(deny network*)` prevent design upload. The final JAR's plane/obstacle warnings and 44 unrouted router count are preserved; they are not KiCad DRC counts. After session import, zone refill and local finishing, KiCad independently reports zero violations and zero unconnected. The final board includes post-session repairs; the SES alone is not the finished PCB.

Earlier 1.9.0 attempts are archived under [attempt-1](generated/pro/p1/attempt-1/) and [attempt-2](generated/pro/p1/attempt-2/). Attempt 1 completed in 67.885 s and imported with 1 error / 6 warnings / 35 unconnected. Attempt 2 completed in 526.901 s and imported with 0 errors / 0 warnings / 2 unconnected. Exact native-failure input DSNs are separately preserved under `generated/native-baseline/` so historical hashes do not pretend to describe the new Pro input.

### USB target and review limits

USB-C contacts and both MCU data traces are fully connected and locked before autorouting, through U2. The MCU trunk stays on F.Cu over L2 GND; the short USB-C duplicate-contact crossover uses three DP vias. Width is nominally **0.1565 mm**, spacing approximately **0.19 mm**, over nominal **0.0994 mm 3313 prepreg**, Dk 4.1, 35 µm outer copper. The coupled-microstrip IPC-2141 estimate is approximately **90 Ω**. This is a nominal design target, not a field-solver result or manufactured impedance measurement. Sources read 2026-11-12: [JLCPCB stack](https://cart.jlcpcb.com/client/template/placeOrder/impedance.html), [Espressif USB layout guidance](https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32s3/pcb-layout-design.html).

The measured shortest A-contact paths, including a nominal 1.6 mm per via transition, are **44.49 mm DP / 35.88 mm DN**. The connector fanout is locally uncoupled and the pair is not length matched; these measurements and the crossover must be reviewed for USB signal integrity. DRC does not certify impedance, signal integrity, current capacity, regulator hot-loop performance or EMC. In particular, BUCK_SW uses two vias and a bottom-layer connection and needs power-layout review. Existing ILIM-value, provisional FPC land-pattern and mechanical/vertical-fit issues in README remain production blockers. No manufacturing output or production release is claimed in P1.

### Remaining KiCad warnings

**None (0).** No warning waiver or justification is required; no warning was suppressed.

### Reproduce locally

Use KiCad's bundled Python 3.9, Shapely 2.0.7 and NumPy 1.26.4. Set `PYTHONPATH` to their local install directory (this pass used `/tmp/xorrpad-p1-tools/python`). Do not regenerate the historical placement baseline.

1. Run `route-pro.py prepare`, then `reserve-pro-power.py`. Refill/save the input with `kicad-cli pcb drc --severity-all --refill-zones --save-board --format json --output hardware/generated/pro-route-input-drc.json hardware/generated/pro-route-input.kicad_pcb`, then `route-pro.py export`.
2. Preserve an existing `pro.ses` before retrying. Run `python3 hardware/route-jar.py --jar /path/freerouting-2.5.0.jar --java /opt/homebrew/opt/openjdk@25/bin/java --version 2.5.0 --modern --sku pro --seconds 600 --passes 100`. Reusing the saved final SES avoids autorouter-version/runtime nondeterminism.
3. Run `route-pro.py import`, then `route-pro.py stitch`. Run `finalize-pro.py prepare` and `finalize-pro.py routes` in separate KiCad Python processes. These replay the successful recorded local geometry without repeating a failed routing search. `connect-pro-speaker.py` preserves how the successful two-layer speaker path was found; it is not required for replay.
4. Run `kicad-cli pcb drc --format json --severity-all --refill-zones --save-board --output hardware/generated/pro-p1-drc.json hardware/generated/pro.kicad_pcb`, then `audit-pro.py` and `python3 hardware/verify.py`.

The finishing replay was checked on a separate copy of the actual imported/stitched board: **0 violations, 0 unconnected**. `audit-pro.py` checks physical key centres and layers, records DRC/board hashes and USB lengths, and regenerates Pro CPL and bypass distances. The offline artifact suite passes **8 tests**; it preserves historical failure evidence and verifies the current clean Pro result separately. A clean DRC is not electrical or production sign-off.


## Core P2 final result — 2026-11-12

**Core: 0 errors, 0 warnings, 0 unconnected.** Latest placement baseline: 0 errors, 0 warnings, 197 unconnected. Original historical baseline: 411 errors, 247 warnings, 195 unconnected (658 violations). Both original reports remain unchanged. **A human PCB designer must review this before any order.**

- [Final board](generated/core.kicad_pcb), [project rules](generated/core.kicad_pro), [real final DRC](generated/core-p2-drc.json), [hashes, USB lengths and invariants](generated/core-p2-summary.json).
- Shared `route-pro.py`, `reserve-pro-power.py` and `audit-pro.py` now accept `--sku core`; their default remains Pro. No Pro board, project, DSN, session or DRC artifact changed in P2. The JAR runner's `--result` option keeps the successful Pro evidence intact.
- The input has F.Cu / In1.Cu GND / In2.Cu 3V3 / B.Cu, nominal 1.6 mm JLC04161H-3313 stack, minimum 0.15 mm trace/space, 0.6/0.3 mm vias and 0.5 mm copper-edge clearance. Inner layers carry planes only. Antenna keepout spans all copper layers and the module antenna ends at the board edge. All 14 CAD key centres and every manifest pad net/populated reference are verified. No DRC severities, exclusions or ignored checks were relaxed.
- R1, R10, D10 and C27 move to clear the protected USB corridor. D14 rotates and U8 moves into the east corridor. Capacitor pad distances, including all 15 LED bypasses, and final Core CPL are regenerated.
- **66 power-pad escapes** are reserved before routing. The real input DRC is 0 errors / 0 warnings / 119 unconnected. Ground fills on F.Cu, In1.Cu and B.Cu plus 3V3 on In2.Cu and **154 added ground stitching vias** complete the planes. The stitched final DRC remains zero.

### Core official JAR evidence

[core-jar-routing-result.json](generated/core-jar-routing-result.json), [log](generated/core-jar.log), [SES](generated/core.ses). Official Freerouting **2.5.0**, local OpenJDK **25.0.5.0.3**, JAR SHA-256 `f6f51bb02245e8e717f9359bd260cc9c5c0b1bc0acc8b7cb2cd5b8ffeb5de3c7` (the same already downloaded official release as P1). **73.013 s, exit 0, session created.** Analytics disabled, API disabled and macOS sandbox denies `network*`; no design upload or hosted router. No push or order.

The router reports 3 open connections and 65 obstacle/plane findings; these are retained verbatim and are not KiCad DRC results. After actual SES import and zone fill, KiCad reports **15 errors / 15 warnings / 1 unconnected** in [core-import-drc.json](generated/core-import-drc.json). Local finishing raises ten router neck segments from 0.12 to 0.15 mm, adjusts the ENC_SW neck clearance, replaces five ROW2 edge tracks, removes fifteen unused vias and COL2 dead-end branches, and completes BUCK_SW with two vias and a bottom connection. U3 pin 6 gets a replacement 3V3 dogbone to free its neighbouring switch-node escape. No nets are renamed or suppressed. The original imported board is available at local commit `10da813`.

### Core review limits and warnings

Remaining KiCad warnings: **none (0)**; no waivers. USB uses the same locked nominal geometry and stack target documented for Pro above: 44.49 mm DP / 35.88 mm DN shortest A-contact paths including nominal via transitions. Uncoupled connector fanout and 8.61 mm path skew need human signal-integrity review; DRC does not establish 90 Ω manufactured impedance. The regulator switch-node copper uses two vias and 0.15 mm trace and requires power-layout/current/thermal review before powering. ILIM remains TBD. [FIT.md](FIT.md) records the measured wall/boss/skirt gaps and the prototype cage interference. Core has no FPC/display. The existing sourcing, support/Z design and electrical review gates remain; this is a routing step, not fabrication release.

[Local top](generated/core/p2/core-top.png), [bottom](generated/core/p2/core-bottom.png) and [three-quarter](generated/core/p2/core-three-quarter.png) KiCad renders were generated. Missing models limit visual population checking; manifests and copper are checked separately. No Gerber/drill/schematic release is claimed by P2.

### Reproduce Core locally

Use the same KiCad Python + Shapely/NumPy environment as P1. Preserve the saved SES and any old attempt before rerouting; the JAR runner refuses to overwrite an existing session.

1. `route-pro.py --sku core prepare`, then `reserve-pro-power.py --sku core`. Refill/save with `kicad-cli pcb drc --severity-all --refill-zones --save-board --format json --output hardware/generated/core-route-input-drc.json hardware/generated/core-route-input.kicad_pcb`, then `route-pro.py --sku core export`.
2. To rerun the official router: `python3 hardware/route-jar.py --sku core --jar /path/freerouting-2.5.0.jar --java /opt/homebrew/opt/openjdk@25/bin/java --version 2.5.0 --modern --seconds 600 --passes 100 --result hardware/generated/core-jar-routing-result.json`. Reuse the saved final SES to avoid autorouter nondeterminism.
3. `route-pro.py --sku core import`, then run the same refill/save DRC command against `core.kicad_pcb`, writing `core-import-drc.json`. Run `finalize-core.py cleanup`, `finalize-core.py escape`, `finalize-core.py routes`, and `finalize-core.py prune` in **separate KiCad Python processes**. Cleanup deliberately checks the saved session's expected repair count. Retaining removed SWIG objects until save avoids a KiCad Python lifetime crash.
4. `route-pro.py --sku core stitch`; run the final refill/save DRC to `core-p2-drc.json`; `audit-pro.py --sku core`; `audit-fit.py --sku core`; `python3 hardware/verify.py`.

The finishing workflow was replayed on an isolated copy of the real imported board and independently checked: [core-replay-drc.json](generated/core-replay-drc.json), **0 violations / 0 unconnected**. The 8 offline artifact tests pass for both boards and preserve the historical failed native router evidence. The replay check is local; no external service was contacted.
