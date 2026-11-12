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

## Pro P1, four-layer routing preparation

Pro only (Core is outside P1). Baseline: **0 placement violations, 207 unconnected**. `route-pro.py prepare` preserves the placement baseline and creates `generated/pro-route-input.kicad_pcb` with F.Cu / GND In1.Cu / 3V3 In2.Cu / B.Cu. The antenna rule area now explicitly covers all four copper layers. The input limiter moves into the east corridor and U2 rotates 180 degrees to accommodate the USB pair while all CAD key centres stay fixed.

Project minima are 0.15 mm trace/clearance, 0.6/0.3 mm vias; existing severities and exclusions are unchanged. The DSN exporter’s quarter-clearance SMD exception is explicitly raised to 0.15 mm. Inner layers are exported as power planes. Input DRC after USB trunk routing: **0 errors, 6 isolated-3V3-fill warnings, 196 unconnected**, before power-plane access vias exist.

The locked front-layer USB trunk uses 0.1565 mm copper, approximately 0.19 mm edge gap, over nominal 0.0994 mm 3313 prepreg (Dk 4.1), 35 µm outer copper. The IPC-2141 coupled-microstrip estimate is approximately 90 Ω; this is a design target, not a field-solver result or manufactured impedance certification. Sources: [JLCPCB published stack](https://cart.jlcpcb.com/client/template/placeOrder/impedance.html), [Espressif USB layout guidance](https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32s3/pcb-layout-design.html), read 2026-11-12. Fabricator stack/etch/mask tolerances and the short connector/ESD fanout require human review. No design was uploaded.

### Imported official JAR session

Official 1.9.0 completed in **67.885 s**, exit **0**, DSN SHA-256 `40dc8b37c5bac1090d63cff7f319fb99fee6877e7f00e89d86e1903594115240`. `generated/jar-routing-result.json`, `pro-jar.log` and `pro.ses` preserve the command, JDK, JAR hash, OS network denial and actual session. The update-check exception in the log is the denied network request; the local autoroute completed. KiCad `ImportSpecctraSES` imported the session into **pro.kicad_pcb**. Signals occupy F.Cu/B.Cu only. First import DRC: **1 edge-clearance error, 6 isolated-plane warnings, 35 unconnected**. The remaining work is plane access/stitching, a north-edge via adjustment and the two KILL-key signal connections; this is not a clean-board claim.

### Reserved plane access and revised USB fanout

Attempt 1 and 2 inputs, sessions, hashes and raw DRC are preserved in `generated/pro/p1/attempt-{1,2}/`. Attempt 2's 1.9.0 JAR completed in **526.901 s**, exit 0; KiCad import had **0 errors, 0 warnings, 2 audio-net unconnected**. Reserving GND/3V3 dogbones before autorouting solved the inaccessible plane pins. D14 rotates beside KILL; physical switch centres remain unchanged.

The next preparation completely connects and locks USB before autorouting. U2 is back at 0 degrees, with the MCU trunk leaving its left pads. The short USB-C duplicate-contact crossover uses three 0.6/0.3 mm DP vias on the connector side; the MCU trunk stays on F.Cu over L2 GND. This prevents the autorouter joining a connector contact into the middle of the trunk. Prepared board DRC: **0 errors, 0 warnings, 105 signal unconnected**. `reserve-pro-power.py` uses `routing-geometry.py` to place access vias outside component lands without relaxing rules. The revised official **2.5.0 JAR** needs JDK 25 (its official build.gradle targets Java 25); it is isolated from network, analytics and API service in the same OS sandbox. JAR SHA-256 `f6f51bb02245e8e717f9359bd260cc9c5c0b1bc0acc8b7cb2cd5b8ffeb5de3c7`. OpenJDK 25.0.5 was installed locally; JDK 17 remains the default. Official source: https://github.com/freerouting/freerouting/releases/tag/v2.5.0 .
