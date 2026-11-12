# PCB fit measurements — Core P2, 2026-11-12

**Engineering draft. A human PCB designer must review this before any order.**

Measured from the final `generated/core.kicad_pcb` outline, transformed to CAD coordinates as `(pcb_x - 142, 142 - pcb_y)`, against `cad/partlib.py`, `part_tray.py` and `part_plate.py`. Reproduce with `audit-fit.py --sku core` in the KiCad Python environment. Raw measurements: [generated/core-fit.json](generated/core-fit.json).

| Check | Measurement | Disposition |
| --- | ---: | --- |
| PCB extent / nominal thickness | 84 × 84 / 1.6 mm | Outline includes rounded corners and boss notches |
| Tray inner width below ledge | 85.2 mm | Minimum wall-to-outline gap **0.600 mm** |
| Four Ø7 mm corner bosses at (±39, ±39) | Minimum outline gap **0.8976 mm** | All four clear in XY |
| Plate skirt inner width | 85.0 mm | Minimum skirt-to-outline gap **0.500 mm** |
| Switch centres | 14 of 14 match CAD | Checked separately in Core P2 summary |
| Mounting holes | **0** | Corner notches clear bosses; they do not mount the PCB |
| Existing flat cage at Z16–19 | **52.8 mm²** PCB/cage overlap in XY | Interferes if PCB underside uses prototype Z16 seating plane |
| USB-C footprint origin | CAD (38, 3) mm | Y lies within side-wall window ±13 mm; connector/plug reach and Z unverified |
| Display pod FPC | Not populated on Core | No Core FPC path to check; Pro path remains a separate check |

The outline fits inside the tray and skirt in XY. The original supports and cage were designed for a 30 × 64 mm DevKit, not this full-size board. A populated PCB mounting Z, supports/fasteners, underside socket clearance, switch-to-plate stack, encoder shaft reach and USB plug/port height have not been established. The 52.8 mm² cage overlap is a real incompatibility at the prototype seating plane, not a waived fit check. New supports/cage geometry and a populated 3D interference check are required before manufacture. No enclosure CAD was altered in P2; no assembled mechanical fit is claimed.
