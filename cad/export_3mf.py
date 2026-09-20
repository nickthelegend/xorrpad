"""export_3mf.py — one Bambu Studio project holding every keycap.

Writes a standard 3MF (zip + XML) where each cap and each legend infill is its
OWN object, named, and tagged with the filament slot it should print in:

    1 = white   2 = green   3 = red   4 = dark (legends on the white caps)

Every object shares one build transform, so the legend plate stays exactly
registered over its caps — load it, pick your filaments, slice.

    python export_3mf.py        # -> exports/print/xorr-pad-keycaps.3mf
"""
from __future__ import annotations

import os
import zipfile

import partlib as pl
import part_caps

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "exports", "print"))
BED = 256.0                      # X1C / P1S / A1 bed; also lands on an A1 mini

SLOT = {"white": 1, "green": 2, "red": 3, "dark": 4}
CAP_SLOT = {pl.COLORS["agent"]: "white", pl.COLORS["base"]: "white",
            pl.COLORS["buy"]: "green", pl.COLORS["sell"]: "red"}
LEG_SLOT = {pl.LEGEND_LIGHT: "white", pl.LEGEND_DARK: "dark",
            pl.LEGEND_MID: "dark"}

CT = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>"""

RELS = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>"""


def main():
    os.makedirs(OUT, exist_ok=True)
    items = part_caps.build()
    by_id = {k["id"]: k for k in pl.key_layout()}

    # same drop the STL batches use, so caps sit on the bed
    lo_z = min(v[2] for _n, m, _c in items for v in m.V)
    xs = [v[0] for _n, m, _c in items for v in m.V]
    ys = [v[1] for _n, m, _c in items for v in m.V]
    dx = BED / 2 - (min(xs) + max(xs)) / 2
    dy = BED / 2 - (min(ys) + max(ys)) / 2

    objects, build, cfg = [], [], []
    for i, (name, mesh, _colour) in enumerate(sorted(items, key=lambda t: t[0]), start=1):
        base = name[:-7] if name.endswith("-legend") else name
        key = by_id[base]
        slot = SLOT[LEG_SLOT[key["legend"]] if name.endswith("-legend")
                    else CAP_SLOT[key["color"]]]

        verts = "".join(f'<vertex x="{x:.4f}" y="{y:.4f}" z="{z - lo_z:.4f}"/>'
                        for x, y, z in mesh.V)
        tris = "".join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in mesh.F)
        objects.append(
            f'<object id="{i}" type="model" p:UUID="{i:08d}-0000-0000-0000-000000000000">'
            f'<mesh><vertices>{verts}</vertices><triangles>{tris}</triangles></mesh></object>')
        build.append(
            f'<item objectid="{i}" transform="1 0 0 0 1 0 0 0 1 {dx:.4f} {dy:.4f} 0" '
            f'printable="1"/>')
        cfg.append(
            f'<object id="{i}">'
            f'<metadata key="name" value="{name}"/>'
            f'<metadata key="extruder" value="{slot}"/>'
            f'<part id="{i}" subtype="normal_part">'
            f'<metadata key="name" value="{name}"/>'
            f'<metadata key="extruder" value="{slot}"/></part></object>')

    model = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<model unit="millimeter" xml:lang="en-US" '
        'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" '
        'xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">'
        '<metadata name="Application">xorr-pad cad</metadata>'
        '<metadata name="Title">xorr-pad keycaps</metadata>'
        f'<resources>{"".join(objects)}</resources>'
        f'<build>{"".join(build)}</build></model>')

    settings = ('<?xml version="1.0" encoding="UTF-8"?>\n'
                f'<config>{"".join(cfg)}</config>')

    path = os.path.join(OUT, "xorr-pad-keycaps.3mf")
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CT)
        z.writestr("_rels/.rels", RELS)
        z.writestr("3D/3dmodel.model", model)
        z.writestr("Metadata/model_settings.config", settings)

    n_tri = sum(len(m.F) for _n, m, _c in items)
    print(f"wrote {path}")
    print(f"  {len(items)} objects, {n_tri} triangles, centred on a {BED:.0f} mm bed")
    for slot_name, slot_id in sorted(SLOT.items(), key=lambda kv: kv[1]):
        names = sorted(n for n, _m, _c in items
                       if SLOT[(LEG_SLOT[by_id[n[:-7]]["legend"]] if n.endswith("-legend")
                                else CAP_SLOT[by_id[n]["color"]])] == slot_id)
        print(f"  slot {slot_id} ({slot_name}): {len(names)} — {', '.join(names)}")


if __name__ == "__main__":
    main()
