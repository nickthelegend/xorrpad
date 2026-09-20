"""audit_display.py — do the display pods fit the pad, and each module its pod?
Read-only. Prints PASS/FAIL per item; exits non-zero on any FAIL."""
from __future__ import annotations
import math
import os
import re
import sys
import zipfile

import partlib as pl
import part_display as d

FAILS = []


def chk(name, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {name:52s} {detail}")
    if not ok:
        FAILS.append(name)


cap_back = pl.ROW_Y[0] + 18.2 / 2
knob_back = pl.ROW_Y[0] + 17.0 / 2
head_in = pl.BOSS_XY - 5.7 / 2                 # M3 button head, ISO 7380 dk 5.7
cap_top = pl.CAP_Z0 + 7.5
h = d.POD_W / 2
USB_WIN_Z = (pl.USB_WIN[1], pl.USB_WIN[2])     # the pad's side windows, Z 17.0..23.5

print("\n=== shared: the lip on the plate ===")
chk("lip clears the back-row caps", d.LIP_Y0 - cap_back >= 1.0, f"{d.LIP_Y0 - cap_back:.2f} mm")
chk("lip clears the knob", d.LIP_Y0 - knob_back >= 1.0, f"{d.LIP_Y0 - knob_back:.2f} mm")
chk("lip clears the M3 button heads", head_in - d.LIP_HALF >= 1.0, f"{head_in - d.LIP_HALF:.2f} mm")
chk("lip rests on the plate top", abs(d.LIP_Z0 - pl.PLATE_Z1) < 1e-9, f"Z {d.LIP_Z0}")

for key in d.MODULES:
    pod = d.Pod(key)
    m, sw = pod.m, pod.SW
    print(f"\n=== {key} — {m['label']} ===")
    items = pod.build()
    (_, body, _), (_, cap, _) = items
    for name, mesh in (("body", body), ("cap", cap)):
        rep = pl.validate(mesh)
        chk(f"{name} is watertight", rep["watertight"], f"{rep['shells']} shells")
    inside = [v for v in body.V if v[2] < pl.PLATE_Z1 - 1e-6
              and v[1] < d._case_back_y(min(abs(v[0]), h)) + 0.1]
    chk("no vertex within 0.1 mm of the case below the plate", not inside, f"{len(inside)} vertices")
    bx = [v[0] for v in body.V]
    chk("exactly the pad's width", abs(max(bx) - min(bx) - pl.CASE_W) < 1e-6, f"{max(bx) - min(bx):.3f} mm")

    # the cap is the body's own back: flush, same height, same width
    cy = [v[1] for v in cap.V]; cz = [v[2] for v in cap.V]; cx = [v[0] for v in cap.V]
    chk("cap is flush: it IS the back of the pod", abs(max(cy) - pod.BACK_Y) < 1e-6
        and abs(max(cz) - pod.TOP_Z) < 1e-6 and abs(min(cz)) < 1e-6,
        f"back Y {max(cy):.2f}, Z 0..{max(cz):.1f} — body Z 0..{pod.TOP_Z:.1f}")
    chk("cap carries the body's full width into the R8 corners", max(cx) - min(cx) > 88.5,
        f"{max(cx) - min(cx):.2f} mm at the seam")
    body_shell = [v for v in body.V if v[2] < d.WALL - 0.01 or abs(v[0]) > h - sw + 0.01]
    chk("body's floor and sides end at the seam", max(v[1] for v in body_shell) <= pod.Y_S + 1e-6,
        f"Y {max(v[1] for v in body_shell):.2f} = seam {pod.Y_S:.2f}")
    cap_floor = [v[1] for v in cap.V if v[2] < d.WALL - 0.5]
    chk("seam gap", abs(min(cap_floor) - (pod.Y_S + d.CAP_CLR)) < 1e-6, f"{d.CAP_CLR} mm")

    u0 = pod.U_WIN_C - pod.WIN_U / 2
    yw, zw = pod.p(u0, 0.0)
    for a in (40, 50, 60):
        graze = cap_top - (yw - cap_back) * math.tan(math.radians(a))
        chk(f"window clear over the caps at {a} deg down", zw > graze, f"Z {zw:.1f} > {graze:.1f}")
    chk("PCB pocket inside the side walls",
        pod.X_LO >= -(h - sw) and pod.X_HI <= h - sw,
        f"x {pod.X_LO:.1f}..{pod.X_HI:.1f} within +-{h - sw:.1f} ({sw:.1f} walls)")
    aa_c = pod.PCB_CX + m["aa_dx"]
    chk("window sits on the active area, AA inside the pocket",
        abs(pod.WX_C - aa_c) < 1e-9 and pod.X_LO <= aa_c - m["aa_x"] / 2 and aa_c + m["aa_x"] / 2 <= pod.X_HI,
        f"AA and window centred at x {aa_c:+.2f}" + (" — the PCB fills the width" if abs(aa_c) > 1e-9 else ""))
    chk("window inside the PCB pocket along the slant",
        pod.U_PCB0 <= u0 and u0 + pod.WIN_U <= pod.U_PCB1,
        f"u {u0:.1f}..{u0 + pod.WIN_U:.1f} in {pod.U_PCB0:.1f}..{pod.U_PCB1:.1f}")
    if "va_x" in m:
        # the bezel must stay off the touch film's viewing area even with the PCB
        # at either end of its clearance, plus the drawing's +-0.2 tolerance
        mx = (pod.WIN_X - m["va_x"]) / 2 - abs(m.get("va_dx", 0.0))
        mu = (pod.WIN_U - m["va_u"]) / 2
        chk("bezel lands outside the touch viewing area", min(mx, mu) >= d.CLR + 0.2 - 1e-9,
            f"{mx:.2f} across, {mu:.2f} up the slant (needs {d.CLR + 0.2:.1f})")
    if "glass_x" in m:
        gx0 = pod.PCB_CX + m["glass_dx"] - m["glass_x"] / 2
        gx1 = pod.PCB_CX + m["glass_dx"] + m["glass_x"] / 2
        wx0, wx1 = pod.WX_C - pod.WIN_X / 2, pod.WX_C + pod.WIN_X / 2
        slack = min(wx0 - gx0, gx1 - wx1, (m["glass_u"] - pod.WIN_U) / 2)
        chk("window shows only glass, never the PCB", slack >= d.CLR + 0.2 - 1e-9,
            f"x {wx0:.1f}..{wx1:.1f} in glass {gx0:.1f}..{gx1:.1f}; {slack:.2f} mm to spare")

    chk("headers + connectors clear the body's walls", pod.pins.intersection(pod.prof["shell"]).area < 0.5,
        f"{pod.pins.intersection(pod.prof['shell']).area:.2f} mm2 in a {m['pin_depth']:.0f} mm path")
    chk("headers + connectors end in front of the cap's back wall",
        pod.pin_y + d.PIN_CLEAR <= pod.BACK_Y - d.WALL + 1e-9,
        f"they reach Y {pod.pin_y:.1f}; the back wall starts at {pod.BACK_Y - d.WALL:.1f}")
    hit = pod.pins.intersection(pod.boss_region(False).union(pod.tongue_region())).area
    chk("screw bosses and cap tongues clear the headers", hit == 0.0, f"{hit:.2f} mm2")
    over = pod.X_HI > d.BOSS_X - d.BOSS_W / 2 or pod.X_LO < -(d.BOSS_X - d.BOSS_W / 2)
    ehit = pod.module.intersection(pod.boss_region(False)).area if over else 0.0
    chk("screw bosses clear the module and the parts on its back", ehit == 0.0, f"{ehit:.2f} mm2")
    if m.get("header") == "x_end":
        housing = pod.PINS_X[1] - d.PIN_CLEAR
        chk("header row stands clear of the side wall", housing <= h - sw - 0.5,
            f"housings to x {housing:.2f}; the wall starts at {h - sw:.2f}")
        chk("header row on the cable opening's side", pod.PINS_X[0] > 0.0,
            f"pins at x {pod.PINS_X[0] + d.PIN_CLEAR + d.DUPONT / 2:.1f}")

    # side tongues, in (Y, Z) wherever their band shares X with the module or a header
    st0, st1, st_root = pod.side_tongue_x()
    worst, kept = 0.0, 1.0
    for s in (-1, 1):
        for x0, x1, root in ((st0, st1, False), (st1, st_root, True)):
            a, b = sorted((s * x0, s * x1))
            reg = pod.side_tongue_region(a, b, root)
            if d._overlaps(a, b, pod.PINS_X):
                worst = max(worst, reg.intersection(pod.pins).area)
            if d._overlaps(a, b, (pod.X_LO, pod.X_HI)):
                worst = max(worst, reg.intersection(pod.module).area)
            kept = min(kept, reg.area / pod.side_tongue_region(a, b, root, cut=False).area)
    chk("side tongues clear the PCB and its headers", worst == 0.0, f"{worst:.2f} mm2")
    chk("side tongues still lap most of the seam", kept >= 0.5, f"{kept:.0%} of the shortest kept")
    chk("side tongues clear the body's walls", (h - sw) - st1 >= 0.25, f"{(h - sw) - st1:.2f} mm")

    zb, zt = d.WALL + d.BOSS_H / 2, pod.TOP_Z - d.WALL - d.BOSS_H / 2
    chk("screw holes line up with the pilots", abs(zb - 5.5) < 1e-9 and abs((pod.TOP_Z - zt) - 5.5) < 1e-9,
        f"Z {zb:.1f} and {zt:.1f} at X +-{d.BOSS_X}")
    so = pod.side_opening()
    y0, z0, y1, z1 = so.bounds
    overlap = min(z1, USB_WIN_Z[1]) - max(z0, USB_WIN_Z[0])
    chk("cable opening on the right wall, level with the pad's USB window", overlap >= 6.0,
        f"Z {z0:.2f}..{z1:.2f} vs window {USB_WIN_Z[0]}..{USB_WIN_Z[1]}")
    chk("cable opening sits in the body, clear of the floor and seam",
        z0 > d.WALL + 2.0 and y0 > d.FRONT_Y + d.WALL and y1 < pod.Y_S - 2.0,
        f"Y {y0:.1f}..{y1:.1f}, seam at {pod.Y_S:.1f}")
    chk("coupon is watertight", pl.validate(pod.build_coupon()[0][1])["watertight"])

    (_, bp), (_, cp) = d.plate_layout(pod, items)
    bxs = [v[0] for v in bp.V]; cxs = [v[0] for v in cp.V]
    allx, ally = bxs + cxs, [v[1] for v in bp.V] + [v[1] for v in cp.V]
    chk("one plate: both parts sit flat on it",
        abs(min(v[2] for v in bp.V)) < 1e-6 and abs(min(v[2] for v in cp.V)) < 1e-6, "Z min 0 for both")
    chk("one plate: the cap lies clear of the body's supports", max(cxs) + d.PLATE_GAP - 1e-6 <= min(bxs),
        f"{min(bxs) - max(cxs):.1f} mm to the body's left")
    pw, pd = max(allx) - min(allx), max(ally) - min(ally)
    chk(f"one plate: fits the {d.PLATE_BED:.0f} mm bed", pw <= d.PLATE_BED and pd <= d.PLATE_BED,
        f"{pw:.1f} x {pd:.1f} mm")
    f3 = os.path.join("..", "exports", "print", f"display-plate{m['suffix']}.3mf")
    n_obj, objs = 0, []
    if os.path.exists(f3):
        with zipfile.ZipFile(f3) as z:
            n_obj = z.read("3D/3dmodel.model").decode().count("<object id=")
            objs = re.findall(r'<object id="\d+">(.*?)</object>', z.read("Metadata/model_settings.config").decode())
    chk("one plate: the 3MF holds the body and the cap", n_obj == 2, f"{n_obj} objects in {os.path.basename(f3)}")
    boxes = []
    if os.path.exists(f3):
        with zipfile.ZipFile(f3) as z:
            model = z.read("3D/3dmodel.model").decode()
        for oid, mesh in re.findall(r'<object id="(\d+)"[^>]*>(.*?)</object>', model, re.S):
            vx = [(float(a), float(b)) for a, b in re.findall(r'<vertex x="([-\d.]+)" y="([-\d.]+)"', mesh)]
            t = re.search(rf'<item objectid="{oid}" transform="([^"]+)"', model).group(1).split()
            xs, ys = [v[0] for v in vx], [v[1] for v in vx]
            boxes.append((min(xs) + float(t[9]), min(ys) + float(t[10]), max(xs) + float(t[9]), max(ys) + float(t[10]),
                          max(abs(min(xs) + max(xs)), abs(min(ys) + max(ys))) / 2))
    if len(boxes) == 2:
        (ax0, ay0, ax1, ay1, aoff), (bx0, by0, bx1, by1, boff) = boxes
        gap = max(bx0 - ax1, ax0 - bx1, by0 - ay1, ay0 - by1)
        chk("one plate: each part centred, placed by its build item",
            max(aoff, boff) < 1e-3 and gap >= d.PLATE_GAP - 1e-3
            and min(ax0, bx0, ay0, by0) >= 0.0 and max(ax1, bx1, ay1, by1) <= 256.0,
            f"{gap:.1f} mm apart, inside the 256 bed")
    else:
        chk("one plate: each part centred, placed by its build item", False, f"{len(boxes)} objects read")
    fil = [re.search(r'key="extruder" value="(\d+)"', o).group(1) for o in objs]
    sup = ['key="enable_support" value="1"' in o for o in objs]
    chk(f"one plate: both on filament {d.PLATE_FILAMENT}, supports on",
        len(objs) == 2 and all(f == str(d.PLATE_FILAMENT) for f in fil) and all(sup),
        f"filaments {fil}, supports {sup}")
    bd = [max(c) - min(c) for c in zip(*d.print_orientation(body).V)]
    cd = [max(c) - min(c) for c in zip(*d.print_on_back(cap).V)]
    chk("body fits a 180 mm bed upright; cap lies on its back", max(bd) <= 180 and max(cd) <= 180,
        f"body {' x '.join(f'{v:.1f}' for v in bd)} · cap {' x '.join(f'{v:.1f}' for v in cd)} mm")

print(f"\nAUDIT-DISPLAY: {len(FAILS)} failure(s)" + (f" -> {FAILS}" if FAILS else " -> ALL CLEAR"))
sys.exit(1 if FAILS else 0)
