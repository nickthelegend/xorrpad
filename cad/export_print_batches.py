"""export_print_batches.py — split the caps into one STL per filament colour.

The xorr-pad deck uses three filaments (white, green, red) plus two legend
colours. Printing is therefore five plates, not one. Every batch is dropped by
the SAME amount and keeps its XY position, so the legend plate stays perfectly
registered with its caps for a two-colour (AMS/MMU) print — or you can print
each colour on its own and skip the legends entirely.

    python export_print_batches.py     # -> exports/print/*.stl
"""
from __future__ import annotations

import os

import partlib as pl
import part_caps

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "exports", "print"))

# filament name per cap colour, and per legend colour
CAP_FILAMENT = {pl.COLORS["agent"]: "white", pl.COLORS["base"]: "white",
                pl.COLORS["buy"]: "green", pl.COLORS["sell"]: "red"}
LEGEND_FILAMENT = {pl.LEGEND_LIGHT: "white", pl.LEGEND_DARK: "dark",
                   pl.LEGEND_MID: "dark"}


def _merge(meshes):
    out = pl.Mesh()
    for m in meshes:
        out += m
    return out


def _min_z(mesh):
    return min(v[2] for v in mesh.V)


def main():
    os.makedirs(OUT, exist_ok=True)
    items = part_caps.build()
    by_id = {k["id"]: k for k in pl.key_layout()}

    caps, legends = {}, {}
    for name, mesh, _colour in items:
        if name.endswith("-legend"):
            key = by_id[name[:-7]]
            legends.setdefault(LEGEND_FILAMENT[key["legend"]], []).append((name, mesh))
        else:
            key = by_id[name]
            caps.setdefault(CAP_FILAMENT[key["color"]], []).append((name, mesh))

    # one shared drop so every plate stays registered with every other
    everything = _merge(m for _n, m, _c in items)
    drop = -_min_z(everything)

    print(f"{'plate':22s} {'keys':>4s}  {'tris':>7s}  contents")
    print("-" * 78)
    rows = []
    for kind, groups in (("caps", caps), ("legends", legends)):
        for filament, entries in sorted(groups.items()):
            mesh = _merge(m for _n, m in entries)
            mesh.translate(dz=drop)
            rep = pl.validate(mesh)
            fname = f"{kind}-{filament}.stl"
            pl.stl_write(os.path.join(OUT, fname), mesh)
            names = ", ".join(sorted(n.replace("-legend", "") for n, _ in entries))
            print(f"{fname:22s} {len(entries):>4d}  {rep['triangles']:>7d}  {names}")
            rows.append((fname, rep["watertight"]))

    ok = all(w for _f, w in rows)
    print("-" * 78)
    print(f"{len(rows)} plates -> {OUT}")
    print("ALL WATERTIGHT" if ok else "!! NOT WATERTIGHT")
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
