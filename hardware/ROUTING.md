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
