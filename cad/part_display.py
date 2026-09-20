"""part_display.py — slanted display pods that key onto the back of the pad.

Each pod stands on the desk directly behind the pad at its full 90 mm width,
wraps the tray's R8 back corners, and rests a lip on the plate's back strip —
the one band of the plate top nothing else uses (cap backs end at Y 37.7, the
knob at 37.1, the M3 button heads start at |X| 36.2). No part of the pad changes.

Two printed parts, one outline: the BODY, and a CAP that is simply the last
CAP_D mm of the same shape — rounded back corners and all — so closed up they
read as one piece with a single seam. Cap tongues slide inside the body's floor,
roof and side walls; four M2.5 x 6 self-tappers (the speaker's hardware) go
through the cap's back into bosses rooted in the body. Wires leave through an
opening in the RIGHT side wall, at the height of the pad's own side USB windows,
so the cable runs straight along the tray into one.

The kernel only extrudes along Z, so every part is a SIDE PROFILE in (Y, Z)
extruded across X in bands, then mapped (x,y,z) -> (z,x,y) — a cyclic axis
permutation, a proper rotation, so each shell keeps its outward winding.

Where a module's active area sits off its PCB centre, the PCB pocket moves so
the screen reads centred on the pad — unless the PCB fills the pod's width (the
2.8"): then the PCB stays centred and the window follows the active area.

MEASURE YOUR MODULE, then print its coupon (the face alone, printed flat)
before the pod: the module should drop in and show its whole active area.
"""
from __future__ import annotations

import math
import os
import sys

from shapely import affinity
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

import partlib as pl

OVL = 0.2

# All lengths mm. "u" runs up the slant, "x" across the pad.
MODULES = {
    "st7789_154": dict(
        label='1.54" ST7789 SPI, 240x240', suffix="",
        pcb_x=32.0, pcb_u=44.0,          # one sourced listing: 44 x 32 x 4
        front_t=2.4, pcb_t=1.6,          # glass + backlight above the PCB, the PCB
        aa_x=27.72, aa_u=27.72,
        aa_dx=0.0, aa_du=3.0,            # AA centre vs PCB centre (du: away from the header)
        win_margin=0.6, button_x=0.0, pin_depth=10.0, tilt=55.0),
    "tft24_uno": dict(
        label='2.4" ILI9341 UNO shield, 320x240, resistive touch', suffix="-24",
        pcb_x=72.2, pcb_u=52.7,          # listed PCB 72.20 x 52.7
        front_t=5.0, pcb_t=1.6,          # panel + touch film + tape, estimated
        aa_x=48.96, aa_u=36.72,          # listed active area
        aa_dx=3.6, aa_du=0.0,            # panel sits right of centre, away from the reset button
        win_margin=1.8,                  # generous: the offset is read off a product photo
        button_x=-2.0,                   # the reset button pokes past the PCB's -X edge
        pin_depth=25.0,                  # shield headers (~8.5) + dupont housings behind the PCB
        tilt=50.0),                      # laid back further than the 1.54": this one gets touched
    "tft28_spi": dict(
        # LCDwiki MSP2807 outline drawing (LCM OUTLINE V1.0), laid landscape with
        # the 14-pin header on the +X short edge, beside the cable opening.
        label='2.8" ILI9341 SPI (MSP2807), 320x240, resistive touch', suffix="-28",
        pcb_x=86.0, pcb_u=50.0,
        front_t=4.0, pcb_t=1.6,          # touch panel 1.20 + LCD 2.30 + tape 0.50; 5.60 with the PCB
        smd_t=2.2,                       # parts on the PCB's back, at most
        aa_x=57.6, aa_u=43.2,
        aa_dx=-4.9, aa_du=0.0,           # AA 9.30..66.90 along the 86 from the SD end: 4.9 off centre
        win_margin=1.6,                  # window 60.8 x 46.4
        va_x=59.45, va_u=45.2, va_dx=0.075,   # touch viewing area: the bezel must land outside it
        glass_x=69.2, glass_u=49.6, glass_dx=-2.0,   # glass 6.40..75.60 from the SD end
        button_x=0.0,
        pin_depth=22.0,                  # 2.78 of header behind the PCB, a 14 mm dupont housing, the bend
        tilt=50.0,                       # touch, like the 2.4"
        pcb_centred=True,                # 86 of the pod's 90: the PCB can't slide, so the window moves
        side_wall=1.6,                   # an 86.6 pocket inside 90
        header="x_end", header_s=2.0, header_span=33.02),   # pin row 2.00 in, 13 x 2.54 long, centred
}

# ---- the pod ---------------------------------------------------------------
POD_W = pl.CASE_W   # 90 — the pad's own width, so the two read as one body
WALL = 2.0          # shell + side walls (a module may thin its side walls)
SKIN = 2.0          # bezel thickness in front of the glass
BEVEL = 1.2         # 45-degree bevel on the window's outer edge, leaving a 0.8 land
BEVEL_STEPS = 3     # across X the bevel is drawn in 0.4-wide steps
BEZEL = 2.0         # solid face margin beyond the stops, along the slant
STOP = 2.0          # end stops that locate the PCB along the slant
RAIL = 2.0          # side rails that locate the PCB across X
CLR = 0.3           # clearance per side around the PCB
FRONT_Y = pl.CASE_W / 2 + 0.2          # 45.2 — 0.2 off the tray's back wall
FACE_Z0 = 46.0      # bottom edge of the face (plate top 41.5, cap tops 54.5)
TOP_FLAT = 4.0      # minimum flat top behind the face's upper edge
FOOT = 10.0         # square recesses for stick-on rubber feet, so a press never slides it
FOOT_DEPTH = 0.6
FOOT_X = (28.0,)    # mirrored to +-28
DUPONT = 2.54       # a dupont housing's square section

# ---- the cap: the body's own back, as a separate part -------------------------
CAP_D = 8.0         # the cap is the last 8 mm — the whole R8 back curve lives in it
CAP_CLR = 0.15      # the seam
TONGUE_T, TONGUE_L, TONGUE_CLR = 1.2, 6.0, 0.2   # cap tongues inside the body's floor and roof
SIDE_TONGUE_CLR = 0.3                           # ...and its side walls (0.3: the bands stretch 0.1)
BOSS_X = 35.5       # four M2.5 x 6 self-tappers, top and bottom at +-X
BOSS_W, BOSS_H, BOSS_ROOT = 7.0, 7.0, 6.0
PILOT = 2.2         # square pilot: an M2.5 self-tapper bites on the flats
HOLE = 2.9          # square screw clearance through the cap's back
PIN_CLEAR = 1.0     # between the headers' connectors and the cap

# ---- the cable opening, right side wall ----------------------------------------
SIDE_OPEN_Y = (5.0, 19.0)      # back from the pod's front face
SIDE_OPEN_Z = (16.25, 24.25)   # centred on the pad's side USB windows (Z 17.0..23.5)
SIDE_OPEN_R = 3.0

# ---- the lip on the plate's back strip ----------------------------------------
LIP_Y0 = 39.0                          # 1.3 behind the cap backs (37.7)
LIP_Z0 = pl.PLATE_Z1                   # 41.5 — rests on the plate top
LIP_T = 1.6
LIP_HALF = 35.0     # the M3 button heads start at |X| 36.2
CORNER_STEP = 0.5   # plan-corner bands: R8 drawn as 0.5-wide steps


def _case_back_y(ax):
    """The tray/plate outline's back edge at |X| = ax (R8 corners at +-37)."""
    c = pl.CASE_W / 2 - pl.CASE_R
    if ax <= c:
        return pl.CASE_W / 2
    return c + math.sqrt(max(pl.CASE_R ** 2 - (ax - c) ** 2, 0.0))


def _as_polys(geom, min_area=0.05):
    if geom is None or geom.is_empty:
        return []
    out = []
    for g in getattr(geom, "geoms", [geom]):
        if g.geom_type == "Polygon" and g.area > min_area:
            out.append(g)
        elif g.geom_type in ("MultiPolygon", "GeometryCollection"):
            out += _as_polys(g, min_area)
    return out


def _band(profile, x0, x1):
    """Prism the (Y,Z) profile across X in [x0, x1], mapped to world axes."""
    polys = _as_polys(profile)
    if not polys:
        return None
    m = pl.prism(unary_union(polys), x0, x1)
    m.V = [(z, x, y) for x, y, z in m.V]    # cyclic permutation: det +1
    return m


def _overlaps(a, b, span):
    return min(a, b) < span[1] and max(a, b) > span[0]


class Pod:
    def __init__(self, key):
        m = self.m = MODULES[key]
        self.key = key
        t = math.radians(m["tilt"])
        self.TU = (math.cos(t), math.sin(t))        # up the face
        self.TN = (math.sin(t), -math.cos(t))       # into the pod
        self.SW = m.get("side_wall", WALL)          # floor, roof, face and back stay WALL
        self.env_t = m["front_t"] + m["pcb_t"]
        self.FACE_L = BEZEL + STOP + CLR + m["pcb_u"] + CLR + STOP + BEZEL
        self.U_PCB0 = BEZEL + STOP
        self.U_PCB1 = self.U_PCB0 + 2 * CLR + m["pcb_u"]
        self.WIN_U = m["aa_u"] + 2 * m["win_margin"]
        self.WIN_X = m["aa_x"] + 2 * m["win_margin"]
        self.U_WIN_C = self.U_PCB0 + CLR + m["pcb_u"] / 2 + m["aa_du"]
        if m.get("pcb_centred"):
            cx, self.WX_C = 0.0, m["aa_dx"]            # the window sits where the AA does
        else:
            cx, self.WX_C = -m["aa_dx"], 0.0           # the AA lands on x = 0
        self.PCB_CX = cx
        self.X_LO = cx - m["pcb_x"] / 2 - CLR + min(m["button_x"], 0.0)
        self.X_HI = cx + m["pcb_x"] / 2 + CLR + max(m["button_x"], 0.0)
        self.FACE0 = (FRONT_Y, FACE_Z0)
        self.FACE1 = self.p(self.FACE_L, 0.0)
        self.TOP_Z = self.FACE1[1]
        # Deep enough that the headers and their connectors end in front of the
        # cap's back wall, and neither they nor the module touch a boss or tongue.
        nb = self.NB = SKIN + self.env_t + CLR
        if m.get("header") == "x_end":
            # one row of pins along the PCB's +X short edge, standing straight back
            uc = self.U_PCB0 + CLR + m["pcb_u"] / 2
            half = m["header_span"] / 2 + DUPONT / 2
            spans = ((uc - half, uc + half),)
            xp = cx + m["pcb_x"] / 2 - m["header_s"]
            self.PINS_X = (xp - DUPONT / 2 - PIN_CLEAR, xp + DUPONT / 2 + PIN_CLEAR)
        else:
            # header rows along the PCB's lower and upper edges
            spans = ((self.U_PCB0, self.U_PCB0 + 4.0), (self.U_PCB1 - 4.0, self.U_PCB1))
            self.PINS_X = (self.X_LO, self.X_HI)
        self.pins = unary_union([self.quad(ua, ub, nb, nb + m["pin_depth"]) for ua, ub in spans])
        self.pin_y = max(self.p(u, nb + m["pin_depth"])[0] for span in spans for u in span)
        self.module = self.quad(self.U_PCB0, self.U_PCB1, SKIN, nb + m.get("smd_t", 0.0))
        self.BACK_Y = max(self.FACE1[0] + TOP_FLAT, self.pin_y + PIN_CLEAR + WALL)
        while self._keep_out_hit() > 0.0:
            self.BACK_Y += 0.5
        self.prof = self._profiles()

    def _keep_out_hit(self):
        """Overlap (mm2, in Y-Z) between what stands behind the face — headers and
        module — and the bosses and tongues at the seam. Side tongues step around a
        header row, so against them only the module counts, where it shares X."""
        hit = unary_union([self.pins, self.module]).intersection(
            unary_union([self.boss_region(False), self.tongue_region()])).area
        st0, _, st_root = self.side_tongue_x()
        span = (self.X_LO, self.X_HI)
        if _overlaps(st0, st_root, span) or _overlaps(-st_root, -st0, span):
            for root in (False, True):
                hit += self.module.intersection(self.side_tongue_region(0.0, 0.0, root, cut=False)).area
        return hit

    @property
    def Y_S(self):
        """The seam between body and cap."""
        return self.BACK_Y - CAP_D

    # -- face coordinates -> (Y, Z)
    def p(self, u, n):
        return FRONT_Y + u * self.TU[0] + n * self.TN[0], FACE_Z0 + u * self.TU[1] + n * self.TN[1]

    def poly(self, pts):
        return Polygon([self.p(u, n) for u, n in pts])

    def quad(self, u0, u1, n0, n1):
        return self.poly([(u0, n0), (u1, n0), (u1, n1), (u0, n1)])

    def outer(self):
        return Polygon([
            (FRONT_Y, 0.0), (self.BACK_Y, 0.0), (self.BACK_Y, self.TOP_Z), self.FACE1, self.FACE0,
            (FRONT_Y, LIP_Z0 + LIP_T), (LIP_Y0, LIP_Z0 + LIP_T), (LIP_Y0, LIP_Z0), (FRONT_Y, LIP_Z0),
        ])

    def _profiles(self):
        outer = self.outer()
        inner = outer.buffer(-WALL, join_style=2)
        shell = outer.difference(inner)
        n_back = SKIN + self.env_t + CLR
        cradle = self.quad(BEZEL, self.FACE_L - BEZEL, SKIN - OVL, n_back).intersection(outer)
        envelope = self.quad(self.U_PCB0, self.U_PCB1, SKIN, n_back + 1.0)
        return {"outer": outer, "inner": inner, "side": outer, "shell": shell,
                "rail": shell.union(cradle),
                "pcb": shell.difference(envelope).union(cradle.difference(envelope))}

    def window_cut(self, d):
        """The window, bevelled 45 deg on its outer BEVEL mm; d = mm beyond its X edge."""
        u0, u1 = self.U_WIN_C - self.WIN_U / 2, self.U_WIN_C + self.WIN_U / 2
        e = BEVEL + 1.0
        if d <= 0:
            return self.poly([(u0 - e, -1.0), (u1 + e, -1.0), (u1, BEVEL), (u1, SKIN + OVL),
                              (u0, SKIN + OVL), (u0, BEVEL)])
        if d >= BEVEL:
            return None
        return self.poly([(u0 - e, -1.0), (u1 + e, -1.0), (u1 + d, BEVEL - d), (u0 - d, BEVEL - d)])

    def lip_box(self):
        return box(LIP_Y0 - 1.0, LIP_Z0 - OVL, FRONT_Y + OVL, LIP_Z0 + LIP_T + OVL)

    def side_opening(self):
        y0, y1 = FRONT_Y + SIDE_OPEN_Y[0], FRONT_Y + SIDE_OPEN_Y[1]
        return affinity.translate(
            pl.rounded_rect(y1 - y0, SIDE_OPEN_Z[1] - SIDE_OPEN_Z[0], SIDE_OPEN_R),
            (y0 + y1) / 2, (SIDE_OPEN_Z[0] + SIDE_OPEN_Z[1]) / 2)

    def boss_region(self, with_pilot):
        """Screw bosses rooted in the body's floor and roof, reaching back to the
        cap's back wall — 0.2 short of it, and 0.2 off the cap's floor and roof."""
        ys, yw, out = self.Y_S, self.BACK_Y - WALL - 0.2, []
        for root, reach, zc in (
                ((WALL - OVL, WALL + BOSS_H), (WALL + TONGUE_CLR, WALL + BOSS_H), WALL + BOSS_H / 2),
                ((self.TOP_Z - WALL - BOSS_H, self.TOP_Z - WALL + OVL),
                 (self.TOP_Z - WALL - BOSS_H, self.TOP_Z - WALL - TONGUE_CLR),
                 self.TOP_Z - WALL - BOSS_H / 2)):
            b = box(ys - BOSS_ROOT, root[0], ys, root[1]).union(box(ys - OVL, reach[0], yw, reach[1]))
            if with_pilot:
                b = b.difference(box(ys - BOSS_ROOT - 1.0, zc - PILOT / 2, yw + 1.0, zc + PILOT / 2))
            out.append(b)
        return unary_union(out)

    def tongue_region(self):
        """The cap's tongues: 6 mm inside the body's floor and roof, rooted in the cap."""
        ys, out = self.Y_S, []
        for z0, z1, zf in ((WALL + TONGUE_CLR, WALL + TONGUE_CLR + TONGUE_T, WALL - OVL),
                           (self.TOP_Z - WALL - TONGUE_CLR - TONGUE_T, self.TOP_Z - WALL - TONGUE_CLR,
                            self.TOP_Z - WALL + OVL)):
            out.append(box(ys - TONGUE_L, z0, ys + CAP_CLR + OVL, z1))
            out.append(box(ys + CAP_CLR, min(z0, zf), ys + CAP_CLR + 1.0, max(z1, zf)))
        return unary_union(out)

    def side_tongue_x(self):
        """|X| span of the side tongues, and of their root behind the seam."""
        x1 = POD_W / 2 - self.SW - SIDE_TONGUE_CLR
        return x1 - TONGUE_T, x1, POD_W / 2 - self.SW

    def side_tongue_region(self, a, b, root, cut=True):
        """A side tongue in (Y, Z) for the band [a, b] — or its root behind the seam —
        stepped around a header row standing at that side."""
        ys = self.Y_S
        zlo, zhi = WALL + TONGUE_CLR, self.TOP_Z - WALL - TONGUE_CLR
        r = (box(ys + CAP_CLR, zlo, ys + CAP_CLR + 1.0, zhi) if root
             else box(ys - TONGUE_L, zlo, ys + CAP_CLR + OVL, zhi))
        if cut and _overlaps(a, b, self.PINS_X):
            r = r.difference(self.pins.buffer(PIN_CLEAR, join_style=2))
        return r

    def edges(self):
        h, c, sw = POD_W / 2, POD_W / 2 - pl.CASE_R, self.SW
        st0, st1, _ = self.side_tongue_x()
        E = {-h, h, 0.0, -(h - sw), h - sw, -(h - sw - 0.3), h - sw - 0.3, -st0, st0, -st1, st1,
             self.X_LO, self.X_HI, self.X_LO - RAIL, self.X_HI + RAIL, -LIP_HALF, LIP_HALF}
        for s in (-1, 1):
            for k in range(BEVEL_STEPS + 1):
                E.add(self.WX_C + s * (self.WIN_X / 2 + k * BEVEL / BEVEL_STEPS))
            x = c
            while x < h - 1e-9:
                E.add(s * x)
                x += CORNER_STEP
            for fx in FOOT_X:
                E.update((s * (fx - FOOT / 2), s * (fx + FOOT / 2)))
            for d in (BOSS_W / 2 + 0.3, BOSS_W / 2, HOLE / 2, PILOT / 2):
                E.update((s * (BOSS_X - d), s * (BOSS_X + d)))
        E = sorted(e for e in E if -h - 1e-9 <= e <= h + 1e-9)
        out = [E[0]]
        for e in E[1:]:
            if e - out[-1] > 0.05:
                out.append(e)
        return out

    def band_profile(self, a, b):
        """The BODY's profile for the band [a, b]."""
        h, c = POD_W / 2, POD_W / 2 - pl.CASE_R
        mid, prof = (a + b) / 2, self.prof
        am, inner, outer_ax = abs(mid), min(abs(a), abs(b)), max(abs(a), abs(b))
        if am > h - self.SW:
            p = prof["side"]
            if mid > 0:                                   # the cable opening, right wall
                p = p.difference(self.side_opening())
        elif self.X_LO < mid < self.X_HI:
            p = prof["pcb"]
            cut = self.window_cut(abs(mid - self.WX_C) - self.WIN_X / 2)
            if cut is not None:
                p = p.difference(cut)
        elif self.X_LO - RAIL <= mid <= self.X_HI + RAIL:
            p = prof["rail"]
        else:
            p = prof["shell"]
        p = p.intersection(box(-1.0, -1.0, self.Y_S, self.TOP_Z + 1.0))   # the body ends at the seam
        if BOSS_X - BOSS_W / 2 < am < BOSS_X + BOSS_W / 2:
            p = p.union(self.boss_region(abs(am - BOSS_X) < PILOT / 2))
        if inner >= LIP_HALF - 1e-9:                  # lip only between the screw heads
            p = p.difference(self.lip_box())
        for fx in FOOT_X:                            # rubber-foot recesses under the base
            if fx - FOOT / 2 < am < fx + FOOT / 2:
                for yc in (FRONT_Y + 9.0, self.Y_S - 7.0):
                    p = p.difference(box(yc - FOOT / 2, -1.0, yc + FOOT / 2, FOOT_DEPTH))
        if outer_ax > c + 1e-9:                       # wrap the tray's R8 up to the plate top
            yf = _case_back_y(max(inner - OVL / 2, 0.0)) + 0.2
            if yf < FRONT_Y - 0.05:
                p = p.union(box(yf, 0.0, FRONT_Y + OVL, LIP_Z0))
        return p

    def cap_profile(self, a, b):
        """The CAP's profile for the band [a, b]: the same outline, behind the seam."""
        h, c = POD_W / 2, POD_W / 2 - pl.CASE_R
        am, outer_ax = abs((a + b) / 2), max(abs(a), abs(b))
        mid_ax = (abs(a) + abs(b)) / 2
        p = self.prof["outer"].intersection(
            box(self.Y_S + CAP_CLR, -1.0, self.BACK_Y + 1.0, self.TOP_Z + 1.0))
        if am <= h - self.SW:
            p = p.difference(self.prof["inner"])
            if outer_ax <= h - self.SW - 0.3 + 1e-9 and not (BOSS_X - BOSS_W / 2 - 0.3 < am < BOSS_X + BOSS_W / 2 + 0.3):
                p = p.union(self.tongue_region())
            # side tongues: with only a floor and roof lap, the seam went straight
            # through the side walls and showed daylight; lap those too
            st0, st1, st_root = self.side_tongue_x()
            inner_ax = min(abs(a), abs(b))
            if inner_ax >= st0 - 1e-9 and outer_ax <= st1 + 1e-9:
                p = p.union(self.side_tongue_region(a, b, root=False))
            elif inner_ax >= st1 - 1e-9 and outer_ax <= st_root + 1e-9:
                p = p.union(self.side_tongue_region(a, b, root=True))
            if abs(am - BOSS_X) < HOLE / 2:
                for zc in (WALL + BOSS_H / 2, self.TOP_Z - WALL - BOSS_H / 2):
                    p = p.difference(box(self.BACK_Y - WALL - 1.0, zc - HOLE / 2,
                                         self.BACK_Y + 1.0, zc + HOLE / 2))
        if outer_ax > c + 1e-9:                       # the pod's own R8 back corners
            # Judged at the band's middle, not its outer edge: the arc starts at the
            # seam at full width, so an outer-edge staircase leaves the cap's last
            # 0.5 mm step empty and draws a slit down each corner. Nothing mates here,
            # so a half-step either side of the true arc is the right trade.
            yb = self.BACK_Y - pl.CASE_R + math.sqrt(max(pl.CASE_R ** 2 - (mid_ax - c) ** 2, 0.0))
            p = p.intersection(box(-1.0, -1.0, yb, self.TOP_Z + 1.0))
        return p

    def build(self):
        h, body, cap = POD_W / 2, pl.Mesh(), pl.Mesh()
        E = self.edges()
        for a, b in zip(E, E[1:]):
            lo, hi = max(a - OVL / 2, -h), min(b + OVL / 2, h)
            for mesh, prof in ((body, self.band_profile(a, b)), (cap, self.cap_profile(a, b))):
                band = _band(prof, lo, hi)
                if band is not None:
                    mesh += band
        sfx = self.m["suffix"]
        return [("display-pod" + sfx, body, pl.COLORS["plate"]),
                ("display-cap" + sfx, cap, pl.COLORS["plate"])]

    def build_coupon(self):
        """The pod's face alone, printed flat: does the module drop in and does the
        window show its whole active area?"""
        x0, x1 = self.X_LO - RAIL, self.X_HI + RAIL
        outline = affinity.translate(pl.rounded_rect(x1 - x0, self.FACE_L, 2.0),
                                     (x0 + x1) / 2, self.FACE_L / 2)
        win = box(self.WX_C - self.WIN_X / 2, self.U_WIN_C - self.WIN_U / 2,
                  self.WX_C + self.WIN_X / 2, self.U_WIN_C + self.WIN_U / 2)
        env = box(self.X_LO, self.U_PCB0, self.X_HI, self.U_PCB1)
        m = pl.Mesh()
        m += pl.prism(outline.difference(win), 0.0, SKIN)
        m += pl.prism(outline.difference(env), SKIN - OVL, SKIN + self.env_t + CLR)
        return [("display-coupon" + self.m["suffix"], m, pl.COLORS["plate"])]


def print_orientation(mesh):
    """World -> upright on its floor, as it stands on the desk, min corner at the
    origin (the body). Upright only the roof behind the face, the top bosses and
    the lip hang over air — tree supports reach the first two from inside, through
    the open back. On its side, the whole upper side wall hung over the cavity."""
    out = pl.Mesh()
    out.V = list(mesh.V)
    out.F = list(mesh.F)
    xs, ys, zs = zip(*out.V)
    return out.translate(-min(xs), -min(ys), -min(zs))


def print_on_back(mesh):
    """World -> lying on its back face, min corner at the origin (the cap)."""
    out = pl.Mesh()
    out.V = [(x, z, -y) for x, y, z in mesh.V]  # -90 deg about X, det +1
    out.F = list(mesh.F)
    xs, ys, zs = zip(*out.V)
    return out.translate(-min(xs), -min(ys), -min(zs))


# The body's tree supports reach ~9 mm past its right wall (under the cable
# opening) and ~16 mm behind it (under the top bosses): with the cap 10 behind
# the body, Bambu Studio refused the plate for G-code path conflicts. So the
# cap lies 20 to the body's left, where nothing of the body's reaches.
PLATE_GAP = 20.0
PLATE_BED = 256.0   # the P1S/X1 bed: side by side the plate is 200 wide
# Filament 1; the AMS slot is picked when the job is sent. With the parts on
# filament 2, Bambu Studio 2.8's CLI crashed slicing the plate three runs in
# three (its log: no nozzle-group info for that filament); on 1, three in three.
PLATE_FILAMENT = 1
# Tree supports on both parts, per object. The body's stand inside it and come out
# through its open back; the cap's only reach the bed, under its rounded corners.
PLATE_SUPPORT = {
    "display-pod": (("enable_support", "1"), ("support_type", "tree(auto)"),
                    ("support_on_build_plate_only", "0")),
    "display-cap": (("enable_support", "1"), ("support_type", "tree(auto)"),
                    ("support_on_build_plate_only", "1")),
}


def plate_layout(pod, items):
    """The body upright with the cap on its back to its left, on one plate.
    -> [(name, mesh)] in plate coordinates: bottoms at Z 0, centred on (0, 0)."""
    (bname, body, _), (cname, cap, _) = items
    body_p, cap_p = print_orientation(body), print_on_back(cap)   # min corners at the origin
    cap_d, body_d = max(v[1] for v in cap_p.V), max(v[1] for v in body_p.V)
    body_p.translate(max(v[0] for v in cap_p.V) + PLATE_GAP, (cap_d - body_d) / 2, 0.0)
    xs = [v[0] for m in (body_p, cap_p) for v in m.V]
    ys = [v[1] for m in (body_p, cap_p) for v in m.V]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    for m in (body_p, cap_p):
        m.translate(-cx, -cy, 0.0)
    return [(bname, body_p), (cname, cap_p)]


def write_plate(pod, items, exports):
    """One print plate for a pod: a Bambu Studio 3MF with the body and cap as two
    named objects on filament 1, tree supports on each, built the way
    export_3mf.py builds the keycaps — and the same layout as one merged STL for
    any other slicer."""
    import zipfile
    from export_3mf import BED, CT, RELS
    parts = plate_layout(pod, items)
    sfx = pod.m["suffix"]
    objects, build, cfg = [], [], []
    for i, (name, mesh) in enumerate(parts, start=1):
        # each mesh about its own centre, placed on the bed by its build item
        xs, ys = [v[0] for v in mesh.V], [v[1] for v in mesh.V]
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        verts = "".join(f'<vertex x="{x - cx:.4f}" y="{y - cy:.4f}" z="{z:.4f}"/>' for x, y, z in mesh.V)
        tris = "".join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in mesh.F)
        objects.append(
            f'<object id="{i}" type="model" p:UUID="{i:08d}-0000-0000-0000-000000000000">'
            f'<mesh><vertices>{verts}</vertices><triangles>{tris}</triangles></mesh></object>')
        build.append(f'<item objectid="{i}" transform="1 0 0 0 1 0 0 0 1 '
                     f'{BED / 2 + cx:.4f} {BED / 2 + cy:.4f} 0" printable="1"/>')
        kind = "display-pod" if name.startswith("display-pod") else "display-cap"
        support = "".join(f'<metadata key="{k}" value="{v}"/>' for k, v in PLATE_SUPPORT[kind])
        cfg.append(f'<object id="{i}"><metadata key="name" value="{name}"/>'
                   f'<metadata key="extruder" value="{PLATE_FILAMENT}"/>{support}'
                   f'<part id="{i}" subtype="normal_part"><metadata key="name" value="{name}"/>'
                   f'<metadata key="extruder" value="{PLATE_FILAMENT}"/></part></object>')
    model = ('<?xml version="1.0" encoding="UTF-8"?>\n'
             '<model unit="millimeter" xml:lang="en-US" '
             'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" '
             'xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">'
             '<metadata name="Application">xorr-pad cad</metadata>'
             f'<metadata name="Title">xorr-pad display pod — {pod.m["label"]}</metadata>'
             f'<resources>{"".join(objects)}</resources><build>{"".join(build)}</build></model>')
    settings = f'<?xml version="1.0" encoding="UTF-8"?>\n<config>{"".join(cfg)}</config>'
    out = os.path.join(exports, "print")
    os.makedirs(out, exist_ok=True)
    with zipfile.ZipFile(os.path.join(out, f"display-plate{sfx}.3mf"), "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CT)
        z.writestr("_rels/.rels", RELS)
        z.writestr("3D/3dmodel.model", model)
        z.writestr("Metadata/model_settings.config", settings)
    merged = pl.Mesh()
    for _name, mesh in parts:
        merged += mesh
    pl.stl_write(os.path.join(exports, f"display-plate{sfx}.stl"), merged)
    pl.glb_write(os.path.join(exports, f"preview-display-plate{sfx}.glb"),
                 [(name, mesh, pl.COLORS["plate"]) for name, mesh in parts])
    xs = [v[0] for _n, m in parts for v in m.V]
    ys = [v[1] for _n, m in parts for v in m.V]
    return max(xs) - min(xs), max(ys) - min(ys)


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    exports = os.path.normpath(os.path.join(here, "..", "exports"))
    ok = True
    for key in MODULES:
        pod = Pod(key)
        items, coupon = pod.build(), pod.build_coupon()
        for name, mesh, _ in items + coupon:
            rep = pl.validate(mesh)
            print(f"{name}: shells={rep['shells']} tris={rep['triangles']} "
                  f"watertight={rep['watertight']} {rep['problems'][:2]}")
            ok &= rep["watertight"]
        sfx = pod.m["suffix"]
        pl.stl_write(os.path.join(exports, f"display-pod{sfx}.stl"), print_orientation(items[0][1]))
        pl.stl_write(os.path.join(exports, f"display-cap{sfx}.stl"), print_on_back(items[1][1]))
        pl.stl_write(os.path.join(exports, f"display-coupon{sfx}.stl"), coupon[0][1])
        pl.glb_write(os.path.join(exports, f"preview-display-pod{sfx}.glb"), items)
        pw, pd = write_plate(pod, items, exports)
        print(f"  one plate: print/display-plate{sfx}.3mf + display-plate{sfx}.stl, {pw:.1f} x {pd:.1f} mm")
        print(f"  {pod.m['label']}: face {pod.FACE_L:.1f} at {pod.m['tilt']:.0f} deg, window "
              f"{pod.WIN_X:.1f} x {pod.WIN_U:.1f} centred at x {pod.WX_C:+.1f}; pod 90 W x "
              f"{pod.BACK_Y - LIP_Y0:.1f} D x {pod.TOP_Z:.1f} H, seam {CAP_D:.0f} from the back")
    sys.exit(0 if ok else 1)
