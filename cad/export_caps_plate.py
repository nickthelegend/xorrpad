"""export_caps_plate.py — the keycap reprint: one filament, one P1S plate.

Every cap but MIC, its symbol cut as an outline (part_caps "outline" style)
instead of filled with a second colour, each lying upside down on its flat top
face with the MX stem pointing up. That way round a cap has nothing to support:
the top face is the first layer, every cut's ceiling is a bridge under 4 mm,
the wall leans out 7 degrees and the cavity opens upward — so the plate prints
with no supports at all, and the symbol face takes the plate's texture.

The caps sit on the plate where they sit on the pad, 26 mm apart.

    python export_caps_plate.py
      -> exports/print/caps-plate.3mf, exports/caps-plate.stl,
         exports/preview-caps-plate.glb
"""
from __future__ import annotations

import math
import os
import re
import sys
import zipfile

import partlib as pl
import part_caps as pc
from export_3mf import BED, CT, RELS

SKIP = ("mic",)
STYLE = "outline"
PITCH = 26.0                # 18.2 caps -> 7.8 clear between neighbours
FRONT_CLEAR = 20.0          # the P1S start G-code lays its prime line along Y 1..11
MAX_BRIDGE = 4.0            # widest cut allowed: its ceiling prints as a short bridge
MIN_GROOVE = 0.8            # narrowest cut a 0.4 nozzle leaves open

HERE = os.path.dirname(os.path.abspath(__file__))
EXPORTS = os.path.normpath(os.path.join(HERE, "..", "exports"))
FAILS = []


def chk(name, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {name:58s} {detail}")
    if not ok:
        FAILS.append(name)


def _polys(g):
    return [] if g.is_empty else list(getattr(g, "geoms", [g]))


def upside_down(mesh, key):
    """World cap -> lying on its top face, centred on the origin, Z 0 = that face.
    (x, y, z) -> (-x, y, -z) is a half turn about Y, not a mirror, so every shell
    keeps its winding; the symbol reads mirrored from above, true from below."""
    x0, y0 = key["x"], key["y"]
    out = pl.Mesh()
    out.V = [(-(x - x0), y - y0, pc.CAP_H - (z - pl.CAP_Z0)) for x, y, z in mesh.V]
    out.F = list(mesh.F)
    return out


def moved(mesh, dx, dy):
    out = pl.Mesh()
    out.V = [(x + dx, y + dy, z) for x, y, z in mesh.V]
    out.F = list(mesh.F)
    return out


def layout():
    """[(name, key, mesh about its own centre, (x, y) on the plate)] — every cap
    but MIC, where it sits on the pad, the 19.05 grid spread to PITCH."""
    unit = abs(pl.ROW_Y[1] - pl.ROW_Y[0])
    keys = {k["id"]: k for k in pl.key_layout()}
    out = []
    for name, mesh, _colour in pc.build(STYLE, skip=SKIP):
        k = keys[name]
        out.append((name, k, upside_down(mesh, k), (k["x"] * PITCH / unit, k["y"] * PITCH / unit)))
    return out


def write(parts):
    """The Bambu Studio 3MF (each cap its own object about its own centre, placed
    by its build item, filament 1, supports off), plus the plate as one STL and a
    preview GLB. -> (3MF path, placed meshes)"""
    out_dir = os.path.join(EXPORTS, "print")
    os.makedirs(out_dir, exist_ok=True)
    objects, build, cfg = [], [], []
    for i, (name, _k, mesh, (px, py)) in enumerate(parts, start=1):
        verts = "".join(f'<vertex x="{x:.4f}" y="{y:.4f}" z="{z:.4f}"/>' for x, y, z in mesh.V)
        tris = "".join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in mesh.F)
        objects.append(
            f'<object id="{i}" type="model" p:UUID="{i:08d}-0000-0000-0000-000000000000">'
            f'<mesh><vertices>{verts}</vertices><triangles>{tris}</triangles></mesh></object>')
        build.append(f'<item objectid="{i}" transform="1 0 0 0 1 0 0 0 1 '
                     f'{BED / 2 + px:.4f} {BED / 2 + py:.4f} 0" printable="1"/>')
        cfg.append(f'<object id="{i}"><metadata key="name" value="cap-{name}"/>'
                   f'<metadata key="extruder" value="1"/><metadata key="enable_support" value="0"/>'
                   f'<part id="{i}" subtype="normal_part"><metadata key="name" value="cap-{name}"/>'
                   f'<metadata key="extruder" value="1"/></part></object>')
    model = ('<?xml version="1.0" encoding="UTF-8"?>\n'
             '<model unit="millimeter" xml:lang="en-US" '
             'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" '
             'xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">'
             '<metadata name="Application">xorr-pad cad</metadata>'
             '<metadata name="Title">xorr-pad keycaps — one filament, outlined symbols</metadata>'
             f'<resources>{"".join(objects)}</resources><build>{"".join(build)}</build></model>')
    settings = f'<?xml version="1.0" encoding="UTF-8"?>\n<config>{"".join(cfg)}</config>'
    path = os.path.join(out_dir, "caps-plate.3mf")
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CT)
        z.writestr("_rels/.rels", RELS)
        z.writestr("3D/3dmodel.model", model)
        z.writestr("Metadata/model_settings.config", settings)
    placed = [moved(m, px, py) for _n, _k, m, (px, py) in parts]
    merged = pl.Mesh()
    for m in placed:
        merged += m
    pl.stl_write(os.path.join(EXPORTS, "caps-plate.stl"), merged)
    pl.glb_write(os.path.join(EXPORTS, "preview-caps-plate.glb"),
                 [(f"cap-{n}", m, pl.COLORS["plate"]) for (n, *_), m in zip(parts, placed)])
    return path, placed


def audit(parts, placed, path):
    names = [n for n, *_ in parts]
    chk("every cap but MIC", len(parts) == len(pl.key_layout()) - len(SKIP)
        and not set(SKIP) & set(names), f"{len(parts)} caps")
    bad = [n for n, _k, m, _a in parts if not pl.validate(m)["watertight"]]
    chk("every cap watertight", not bad, ", ".join(bad) or f"{len(parts)} of {len(parts)}")
    flat = all(abs(min(v[2] for v in m.V)) < 1e-9 and abs(max(v[2] for v in m.V) - pc.CAP_H) < 1e-9
               for _n, _k, m, _a in parts)
    chk("each lies on its top face, stem up", flat, f"Z 0..{pc.CAP_H}")

    print("\n  symbol treatment (one filament):")
    wide, thin, sliver, widest = [], [], [], 0.0
    for name, k, _m, _a in parts:
        glyph = pl.glyph(k["glyph"], pl.GLYPH_SIZES.get(k["glyph"], pc.GLYPH_SIZE))
        cut = pc.legend_cut(k, STYLE)
        standing = glyph.area - cut.area
        print(f"    {name:10s} {k['glyph']:10s} "
              f"{'outlined, middle standing' if standing > 0.5 else 'cut as a line'}")
        if not cut.buffer(-MAX_BRIDGE / 2).is_empty:
            wide.append(name)
        lo, hi = 0.0, 6.0                       # widest part of the cut, to 0.05 mm
        while hi - lo > 0.05:
            mid = (lo + hi) / 2
            lo, hi = (lo, mid) if cut.buffer(-mid / 2).is_empty else (mid, hi)
        widest = max(widest, hi)
        # A groove that pinches below MIN_GROOVE splits (or loses) its piece when
        # the cut shrinks by half of it; a pointed end only gets shorter.
        for piece in _polys(cut):
            if len([p for p in _polys(piece.buffer(-MIN_GROOVE / 2)) if p.area > 1e-4]) != 1:
                thin.append(name)
                break
        # A wall under MIN_LAND left standing between cuts closes when the cut
        # grows by half of it: two pieces merge, or a hole fills.
        grown = cut.buffer(pc.MIN_LAND / 2 - 0.02)
        holes = lambda g: sum(len(p.interiors) for p in _polys(g))
        if len(_polys(grown)) < len(_polys(cut)) or holes(grown) < holes(cut):
            sliver.append(name)
    print()
    chk(f"widest cut under {MAX_BRIDGE} mm: every ceiling a short bridge", not wide,
        f"widest {widest:.2f} mm" + (f" — {', '.join(wide)}" if wide else ""))
    chk(f"no groove pinches under {MIN_GROOVE} mm: they all stay open", not thin, ", ".join(thin))
    chk(f"no wall under {pc.MIN_LAND} mm left standing between cuts", not sliver, ", ".join(sliver))
    base_w, top_w = pc.SIZES[1][0][0], pc.SIZES[1][1][0]
    lean = math.degrees(math.atan((base_w - top_w) / 2 / pc.BODY_TOP))
    chk("the wall leans out gently enough to need no support", lean <= 30.0, f"{lean:.1f} deg off vertical")

    xs = [v[0] for m in placed for v in m.V]
    ys = [v[1] for m in placed for v in m.V]
    x0, x1, y0, y1 = BED / 2 + min(xs), BED / 2 + max(xs), BED / 2 + min(ys), BED / 2 + max(ys)
    chk("on the P1S bed, clear of the prime line and the purge corner",
        x0 >= 5.0 and x1 <= BED - 5.0 and y0 >= FRONT_CLEAR and y1 <= BED - 5.0,
        f"X {x0:.0f}..{x1:.0f}, Y {y0:.0f}..{y1:.0f} of {BED:.0f}")
    boxes = [(min(v[0] for v in m.V), min(v[1] for v in m.V), max(v[0] for v in m.V), max(v[1] for v in m.V))
             for m in placed]
    gap = min(max(b[0] - a[2], a[0] - b[2], b[1] - a[3], a[1] - b[3])
              for i, a in enumerate(boxes) for b in boxes[i + 1:])
    chk("caps at least 6 mm apart", gap >= 6.0, f"{gap:.1f} mm")

    with zipfile.ZipFile(path) as z:
        n_obj = z.read("3D/3dmodel.model").decode().count("<object id=")
        objs = re.findall(r'<object id="\d+">(.*?)</object>', z.read("Metadata/model_settings.config").decode())
    ok = (n_obj == len(parts) == len(objs)
          and all('key="extruder" value="1"' in o and 'key="enable_support" value="0"' in o for o in objs))
    chk("3MF: one object per cap, all filament 1, supports off", ok, f"{n_obj} objects")


if __name__ == "__main__":
    parts = layout()
    path, placed = write(parts)
    print(f"wrote {path}")
    audit(parts, placed, path)
    print(f"\nCAPS-PLATE: {len(FAILS)} failure(s)" + (f" -> {FAILS}" if FAILS else " -> ALL CLEAR"))
    sys.exit(1 if FAILS else 0)
