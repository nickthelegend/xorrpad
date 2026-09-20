"""slice_bambu.py — slice a plate 3MF for a Bambu Lab P1S (0.4 nozzle) with Bambu
Studio's own command line, so it opens in the app sliced and ready to send.

Handed the stock preset files, the CLI follows neither a preset's `inherits`
chain nor the printer's G-code templates: it sliced for a 200 x 200 bed with a
46-character start G-code — no levelling, no AMS load — and 0 g of filament. So
this resolves each preset the way the app does (parents first, then the
printer's "<name> template <key>" files), writes them flat, slices, and exits
non-zero unless the result reads like a P1S job. The CLI itself refuses a plate
whose parts' G-code paths collide (supports reaching a neighbour, say).

    python3 slice_bambu.py ../exports/print/display-plate-28.3mf [--bed "Textured PEI Plate"]
      -> ../exports/print/display-plate-28.gcode.3mf
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

APP = "/Applications/BambuStudio.app/Contents/MacOS/BambuStudio"
PROFILES = "/Applications/BambuStudio.app/Contents/Resources/profiles/BBL"
MACHINE = "Bambu Lab P1S 0.4 nozzle"
PROCESS = "0.20mm Standard @BBL X1C"          # the app's default process for this printer
FILAMENT = "Bambu PLA Basic @BBL P1S 0.4 nozzle"
P1S_BED = ["0x0", "256x0", "256x256", "0x256"]


def resolve(kind, name):
    """A system preset with its parents folded in, parents first."""
    with open(os.path.join(PROFILES, kind, name + ".json")) as f:
        cfg = json.load(f)
    if cfg.get("inherits"):
        base = resolve(kind, cfg["inherits"])
        base.update(cfg)
        cfg = base
    if kind == "machine":           # the printer's own G-code: "<name> template <key>.json"
        folder, prefix = os.path.join(PROFILES, kind), name + " template "
        for fn in sorted(os.listdir(folder)):
            if fn.startswith(prefix) and fn.endswith(".json"):
                key = fn[len(prefix):-len(".json")]
                with open(os.path.join(folder, fn)) as f:
                    cfg[key] = json.load(f)[key]
    return cfg


def flat_presets(folder, bed):
    paths = []
    for kind, name in (("machine", MACHINE), ("process", PROCESS), ("filament", FILAMENT)):
        cfg = resolve(kind, name)
        cfg["inherits"] = ""
        if kind == "process" and bed:
            cfg["curr_bed_type"] = bed
        path = os.path.join(folder, kind + ".json")
        with open(path, "w") as f:
            json.dump(cfg, f, indent=1)
        paths.append(path)
    return paths


def object_settings(model_settings):
    """{object name: its object-level metadata} from Metadata/model_settings.config."""
    out = {}
    for oid, body in re.findall(r'<object id="(\d+)">(.*?)</object>', model_settings, re.S):
        head = dict(re.findall(r'key="([a-z_]+)" value="([^"]*)"', body.split("<part")[0]))
        out[head.get("name", oid)] = head
    return out


def plate_filaments(path):
    """The project filaments (1-based) the plate's objects print from."""
    with zipfile.ZipFile(path) as z:
        objs = object_settings(z.read("Metadata/model_settings.config").decode())
    return sorted({int(o.get("extruder", "1")) for o in objs.values()})


def slice_plate(src, bed):
    src = os.path.abspath(src)
    out = re.sub(r"\.3mf$", "", src) + ".gcode.3mf"
    slots = max(plate_filaments(src))          # load up to the highest filament the plate uses
    with tempfile.TemporaryDirectory(prefix="bambu-") as tmp:
        machine, process, filament = flat_presets(tmp, bed)
        cmd = [APP, "--debug", "2", "--arrange", "0",
               "--load-settings", f"{machine};{process}",
               "--load-filaments", ";".join([filament] * slots),
               "--slice", "0", "--outputdir", tmp, "--export-3mf", "sliced.3mf", src]
        run = subprocess.run(cmd, capture_output=True, text=True)
        notes = [re.sub(r"^\[[^]]*\] \[[^]]*\] ", "", line) for line in (run.stdout + run.stderr).splitlines()
                 if re.search(r"\[(warning|error|fatal)\]", line)]
        sliced = os.path.join(tmp, "sliced.3mf")
        if run.returncode != 0 or not os.path.exists(sliced):
            sys.exit(f"Bambu Studio failed (exit {run.returncode}):\n" + "\n".join(notes[-20:]))
        shutil.move(sliced, out)
    return out, notes


def check(path):
    fails = []

    def chk(name, good, detail=""):
        print(f"  {'PASS' if good else 'FAIL'}  {name:46s} {detail}")
        if not good:
            fails.append(name)

    with zipfile.ZipFile(path) as z:
        proj = json.loads(z.read("Metadata/project_settings.config"))
        info = z.read("Metadata/slice_info.config").decode()
        objs = object_settings(z.read("Metadata/model_settings.config").decode())
        gcodes = [z.read(n).decode(errors="replace") for n in sorted(z.namelist())
                  if re.fullmatch(r"Metadata/plate_\d+\.gcode", n)]
    plates = re.findall(r"<plate>(.*?)</plate>", info, re.S)
    chk("sliced for the P1S's 256 x 256 x 250", proj.get("printable_area") == P1S_BED
        and float(proj.get("printable_height", 0)) >= 250,
        f"{proj.get('printable_area', ['?'] * 3)[2]} x {proj.get('printable_height')}")
    chk("everything on one plate", len(plates) == 1 and len(gcodes) == 1, f"{len(plates)} plate(s)")
    if not plates or not gcodes:
        return fails
    kv = dict(re.findall(r'<metadata key="(\w+)" value="([^"]*)"', plates[0]))
    names = re.findall(r'<object [^>]*?name="([^"]+)"', plates[0])
    used = re.findall(r'<filament id="(\d+)"[^>]*?used_m="([^"]*)" used_g="([^"]*)"', plates[0])
    g = gcodes[0]
    load = re.findall(r"^M620 S(\d+)A", g, re.M)
    chk("the P1S start G-code: bed levelling, AMS load", "G29" in g and bool(load),
        f"G29 {'yes' if 'G29' in g else 'no'}, M620 {'yes' if load else 'no'}")
    wanted = sorted({int(o.get("extruder", "1")) for o in objs.values()})
    chk("loads the filament the parts print from", len(wanted) == 1 and bool(load) and int(load[0]) == wanted[0] - 1,
        f"parts on filament {wanted}, G-code loads M620 S{load[0] if load else '?'}A")
    wants = sorted(name for name, o in objs.items() if o.get("enable_support") == "1")
    support = g.count("; FEATURE: Support")
    if wants:
        chk("supports generated for the parts that ask", kv.get("support_used") == "true" and support > 0,
            f"{support} support blocks; supports on {', '.join(wants)}")
    else:
        chk("no supports: none asked for, none generated", support == 0 and kv.get("support_used") != "true",
            f"{support} support blocks across {len(objs)} objects")
    bed = re.search(r"^M190 S(\d+)", g, re.M)
    grams = sum(float(u[2] or 0) for u in used)
    t = int(float(kv.get("prediction", 0)))
    chk("filament weight computed", grams > 0, f"{grams:.1f} g")
    print(f"\n  plate: {', '.join(names)} · {t // 3600} h {t % 3600 // 60:02d} min · {grams:.1f} g "
          f"· bed {bed.group(1) if bed else '?'} °C ({proj.get('curr_bed_type')}) · nozzle "
          f"{proj.get('nozzle_temperature', ['?'])[0]} °C")
    return fails


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("plate")
    ap.add_argument("--bed", default="Textured PEI Plate",
                    help='"Textured PEI Plate", "Cool Plate", "Engineering Plate" or "High Temp Plate"')
    args = ap.parse_args()
    out, notes = slice_plate(args.plate, args.bed)
    for n in notes:
        print("  bambu:", n.strip())
    print(f"sliced -> {out}")
    sys.exit(1 if check(out) else 0)
