# Production PCB, pass 2: route it and reach a clean DRC. Local commits only, NEVER push. DO NOT ORDER or upload anywhere.

## Where it stands
See `hardware/README.md`:
- ERC: 0 errors.
- DRC: 569 violations on Pro and 658 on Core, plus about 200 unconnected items on each.
- Routing: Freerouting's native binary crashed with `UnsupportedFeatureError … SerializationConstructorAccessor`.

## Do
1. **Run Freerouting as a jar.** Use the official Freerouting **JAR** from https://github.com/freerouting/freerouting/releases on the local JDK (`/opt/homebrew/opt/openjdk@17`, or install `openjdk@21` with brew if the jar needs it). Keep analytics and network off, as `route.py` already does, and record the jar's version and SHA-256.
2. **Fix placement and footprint DRC before routing:**
   - courtyard overlaps;
   - silk on pads;
   - board edge clearance;
   - the ESP32 antenna keepout (no copper or parts under the antenna, and the module edge at the board edge);
   - USB-C near its edge with the ESD array next to it;
   - decoupling caps next to their pins.

   Respect the physical key centres from `cad/partlib.py`.
3. **Route with JLCPCB rules:** 4-layer stack (signal, GND, 3V3, signal), 0.15 mm trace and space minimum, 0.3/0.6 mm vias. Route USB D+/D− as a 90 Ω differential pair, kept short.
4. **Import and check.** Import the routed session back into the `.kicad_pcb`, add ground pours with stitching, and run `kicad-cli pcb drc`.
   - Iterate until **0 errors and 0 unconnected** for both SKUs.
   - List every remaining warning with a one-line justification.
5. **Manufacturing outputs.** Use `kicad-cli` to produce, for each SKU, into `hardware/generated/<sku>/fab/`:
   - Gerbers and the drill files;
   - JLC BOM and CPL, regenerated;
   - a PDF of the schematic and of the board;
   - a **3D render of the PCB** (`kicad-cli pcb render`): top, bottom and 3/4 views.
6. **Mechanical check.** The board outline and mounting holes must fit the real enclosure in `cad/` (tray inner dimensions, plate standoffs, and the display pod's FPC path). Write the clearances you measured into `hardware/FIT.md`.
7. **Update the README.** Put the new real results in `hardware/README.md`. Keep the banner: **a human PCB designer must review this before any order.**

Commit per step. NEVER push. Report in under 10 lines, with the DRC numbers before and after.
