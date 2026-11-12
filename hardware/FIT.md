# PCB fit measurements - Core and Pro P3, 2026-11-12

**Engineering draft. A human PCB designer must review this before any order.**

Both final routed boards were measured against the actual local enclosure sources: [partlib.py](../cad/partlib.py), [part_tray.py](../cad/part_tray.py), [part_plate.py](../cad/part_plate.py), and [part_display.py](../cad/part_display.py). PCB coordinates transform to CAD as `(pcb_x - 142, 142 - pcb_y)`, in millimetres. These are nominal geometric checks, without manufacturing tolerances. Raw measurements and source SHA-256 hashes: [Core](generated/core-fit.json), [Pro](generated/pro-fit.json).

## Outline, holes and plate supports

| Check | Core | Pro | Disposition |
| --- | ---: | ---: | --- |
| Outline bounding size / thickness | 84 x 84 / 1.6 mm | 84 x 84 / 1.6 mm | Both have rounded corners, four boss notches and the antenna-edge relief |
| Tray inner width below ledge | 85.2 mm | 85.2 mm | Both complete outlines are inside the actual rounded tray interior |
| Minimum wall-to-outline clearance | 0.600 mm | 0.600 mm | Nominal XY pass |
| Minimum clearance to four diameter 7 mm tray bosses at (+/-39, +/-39) | 0.8976 mm | 0.8976 mm | Nominal XY pass at all four corners |
| Plate skirt inner width / minimum outline gap | 85.0 / 0.500 mm | 85.0 / 0.500 mm | Nominal XY pass |
| Minimum gap to diameter 7.6 mm plate screw towers | 0.5976 mm | 0.5976 mm | Nominal XY pass; towers occupy Z37.5-40.2 |
| Plate diameter 3.4 mm through-screw centres | (+/-39, +/-39) | (+/-39, +/-39) | PCB notches clear the towers, rather than providing corresponding screw holes |
| PCB mounting holes | **0** | **0** | **Mounting not established**; the notches do not fasten or support a board |
| CAD switch centres | 14/14 match | 14/14 match | Nominal XY pass, including centred MIC switch |
| Existing cage / board intersection in XY | **52.8 mm2** | **52.8 mm2** | **Interference** if PCB underside is at prototype Z16; cage extends to Z19 |
| USB-C footprint origin in CAD XY | (38, 3) mm | (38, 3) mm | Y lies within side-window +/-13 mm; connector/plug reach and Z unverified |

The existing cage and shelves were made for a 30 x 64 mm DevKit. At its nominal Z16 underside, the new 1.6 mm PCB spans Z16-17.6 and intersects the cage volume. Raising it above the cage has not been validated: the printed switch-deck spans Z35.3-36.5, the switch bases seat at Z36.5, and the plate spans Z40-41.5. A PCB height must be derived from the real switches/sockets, then checked against the deck, pockets, components, encoder shaft and USB opening. No new mounts, fasteners or assembled Z fit are claimed, and no CAD was changed in P3.

## Display pod and FPC path

Core has no display/FPC population; this check is not applicable to Core. Pro J3 is the draft 50-contact, 0.5 mm pitch connector. Its footprint origin is CAD **(7, 39) mm**, rotation **0 degrees**. Pad 1 is **(-5.25, 39)** and pad 50 is **(19.25, 39)**, giving a **24.5 mm contact span**. Actual cable width must be larger; the connector latch, anchors, insertion direction and required bend radius remain unverified.

The existing `tft28_spi` pod describes an **86 x 50 mm headered MSP2807 module**, not the proposed bare EastRising ER-TFT028-4 FPC panel. Its right-side cable opening is at **X45**, with global **Y50.2-64.2 / Z16.25-24.25 mm** bounds. The opening is a rounded 14 x 8 mm shape, whose bounding-box diagonal is only **16.1245 mm**. Even the conservative 24.5 mm ribbon contact span exceeds that upper bound by **8.3755 mm**. **A straight, flat ribbon cross-section cannot pass through this opening at any in-plane angle.** This does not certify a folded or twisted cable route; one would need supplier bend limits and a validated assembly path.

The connector-origin to pod-aperture XY distance is at least **39.6162 mm**; this is a geometric lower bound, not a cable-length specification. The pod opening starts **37.2 mm** behind the tray side-window's Y+13 limit. The tray side window spans **26 x 6.5 mm** (Y-13 to +13, Z17-23.5); its Z overlaps the pod opening, but the route must still travel outside the tray and turn back to the proposed J3. There is no designed rear FPC slot in the plate/tray, no approved panel seat for this bare panel, and no verified cable length, fold, strain relief or latch-access envelope. **Pro's FPC integration fails the existing straight-flat passage check and requires mechanical redesign/validation.**

## Reproduce

Run from the repository root using KiCad's bundled Python with Shapely 2.0.7 and NumPy 1.26.4 on `PYTHONPATH` (the P1/P2 local environment remains `/tmp/xorrpad-p1-tools/python`):

```sh
PYTHONPATH=/tmp/xorrpad-p1-tools/python /Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/Current/bin/python3 hardware/audit-fit.py --sku core
PYTHONPATH=/tmp/xorrpad-p1-tools/python /Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/Current/bin/python3 hardware/audit-fit.py --sku pro
```

The audit measures the actual polygonal Edge.Cuts, not an ideal square. Corner clearance uses the sampled CAD boss/tower circles; values are nominal and rounded here. The six CLI PCB renders in the fabrication folders omit components with missing 3D models and do not replace a populated enclosure interference check. The outlines clear the walls/bosses/towers in XY, but **neither SKU has an approved assembled mechanical fit**.
