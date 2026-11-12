#!/usr/bin/env python3
"""P3 local review exports. Use KiCad's bundled Python; never uploads/orders.

Reconstructs editable schematics using installed KiCad symbols and named global
nets from the existing SKiDL source netlist. The two source terminal models stay
terminal models. Round-trip netlist and board-pad parity are required.
"""
import argparse
import collections
import copy
import csv
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import struct
import uuid

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'generated'
LIB = Path(os.environ.get('KICAD_SYMBOL_DIR', '/Applications/KiCad/KiCad.app/Contents/SharedSupport/symbols'))
CLI = 'kicad-cli'


class Atom(str):
    pass


def parse(text):
    tokens = re.findall(r'"(?:\\.|[^"\\])*"|[()]|[^\s()]+', text)
    stack = [[]]
    for t in tokens:
        if t == '(':
            n = []; stack[-1].append(n); stack.append(n)
        elif t == ')':
            stack.pop()
        else:
            stack[-1].append(json.loads(t) if t.startswith('"') else Atom(t))
    assert len(stack) == 1
    return stack[0][0]


def dump(n):
    if isinstance(n, list):
        return '(' + ' '.join(map(dump, n)) + ')'
    return str(n) if isinstance(n, Atom) else json.dumps(n, ensure_ascii=False)


def children(n, key):
    return [a for a in n if isinstance(a, list) and a and a[0] == key]


def child(n, key):
    return children(n, key)[0]


def uid(name):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, 'xorrpad-p3/' + name))


def q(s):
    return json.dumps(str(s))


def run(args, folder):
    result = subprocess.run([CLI, *map(str, args)], text=True, capture_output=True)
    with (folder / 'export.log').open('a') as f:
        f.write('$ ' + ' '.join(map(str, [CLI, *args])) + '\n' + result.stdout + result.stderr + '\n')
    result.check_returncode()


def netmap(tree):
    return {(str(child(n, 'ref')[1]), str(child(n, 'pin')[1])): str(child(net, 'name')[1])
            for net in children(child(tree, 'nets'), 'net') for n in children(net, 'node')}


def source(sku):
    tree = parse((OUT / f'{sku}.net').read_text())
    return tree, {str(child(p, 'ref')[1]): p for p in children(child(tree, 'components'), 'comp')}


def custom_symbol(name, count):
    # Match circuit.py's deliberately passive terminal models exactly.
    names = ['IN', 'GND', 'EN', 'FAULT_N', 'ILIM', 'OUT'] if count == 6 else list(map(str, range(1, 51)))
    half = math.ceil(count / 2); h = max(5.08, (half + 1) * 2.54)
    pins = []
    for i in range(count):
        side = i // half; y = (half - 1) * 1.27 - (i % half) * 2.54
        pins.append(f'(pin passive line (at {(-1 if side == 0 else 1)*15.24} {y} {0 if side == 0 else 180}) (length 2.54) '
                    f'(name {q(names[i])} (effects (font (size 1 1)))) (number {q(i+1)} (effects (font (size 1 1)))))')
    return parse(f'(symbol {q(name)} (pin_names (offset 0.508)) (in_bom yes) (on_board yes) '
                 f'(symbol "{name}_0_1" (rectangle (start -12.7 {h/2}) (end 12.7 {-h/2}) '
                 f'(stroke (width 0.254) (type default)) (fill (type background)))) '
                 f'(symbol "{name}_1_1" {" ".join(pins)}))')


libraries = {}


def symbol_for(comp):
    libsrc = child(comp, 'libsource')
    name = str(child(libsrc, 'part')[1]); libpath = Path(str(child(libsrc, 'lib')[1]))
    if name in ('TPS2553DBVR', 'ER-CON50HT-1'):
        return custom_symbol(name, 6 if name == 'TPS2553DBVR' else 50), f'XorrpadReview:{name}'
    path = LIB / libpath.name
    if path not in libraries:
        libraries[path] = {n[1]: n for n in children(parse(path.read_text()), 'symbol')}

    def resolve(key):
        n = copy.deepcopy(libraries[path][key])
        if children(n, 'extends'):
            base = resolve(child(n, 'extends')[1]); props = {c[1] for c in children(n, 'property')}
            inherited = [c for c in base[2:] if not (isinstance(c, list) and c[0] == 'property' and c[1] in props)]
            n = [n[0], n[1], *inherited, *[c for c in n[2:] if c[0] != 'extends']]
        # Child names need the new base prefix after resolving inheritance.
        for c in children(n, 'symbol'):
            c[1] = name + '_' + str(c[1]).rsplit('_', 2)[-2] + '_' + str(c[1]).rsplit('_', 1)[-1]
        return n

    return resolve(name), f'{path.stem}:{name}'


def pins_of(symbol):
    pins = [p for s in children(symbol, 'symbol') for p in children(s, 'pin')]
    nums = [str(child(p, 'number')[1]) for p in pins]
    assert len(nums) == len(set(nums)), 'Multi-unit symbol needs explicit handling'
    return pins


def schematic(sku, folder, manifest):
    tree, comps = source(sku); expected = netmap(tree)
    manifest_by_ref = {p['ref']: p for p in manifest}
    assert expected == {(p['ref'], n): net for p in manifest for n, net in p['pins'].items()}
    data = {}
    for ref, c in comps.items():
        sym, libid = symbol_for(c); pins = pins_of(sym)
        data[ref] = (sym, libid, pins)
        assert set(manifest_by_ref[ref]['pins']) <= {str(child(p, 'number')[1]) for p in pins}
    large = []
    small = []
    for ref in sorted(comps, key=lambda s: (re.sub(r'\d+', '', s), int(re.search(r'\d+', s)[0]))):
        yy = [float(child(p, 'at')[2]) for p in data[ref][2]]
        (large if max(yy)-min(yy) > 35 else small).append(ref)
    # U1 is the root; tall symbols and nine-component banks are child sheets.
    pages = [['U1']] + [[r] for r in large if r != 'U1'] + [small[i:i+9] for i in range(0, len(small), 9)]
    rootid = uid(sku + '/root'); basename = f'{sku}-review'
    paths = [rootid] + [rootid + '/' + uid(f'{sku}/sheet/{i}') for i in range(1, len(pages))]
    for index, refs in enumerate(pages):
        sid = rootid if index == 0 else uid(f'{sku}/file/{index}')
        embedded = {}
        items = []
        for slot, ref in enumerate(refs):
            c = comps[ref]; sym, libid, pins = data[ref]
            sym = copy.deepcopy(sym); sym[1] = libid; embedded[libid] = dump(sym)
            x, y = ((90, 110) if len(refs) == 1 else (75 + 130*(slot % 3), 74 + 72*(slot // 3)))
            top = min(-float(child(p, 'at')[2]) for p in pins)
            props = []
            for pname, value, py, hidden in [('Reference', ref, y+top-23, False), ('Value', child(c, 'value')[1], y+top-20, False),
                                           ('Footprint', child(c, 'footprint')[1], y+top-3, True)]:
                props.append(f'(property {q(pname)} {q(value)} (at {x} {py} 0) (effects (font (size 1.1 1.1)) {"(hide yes)" if hidden else ""}))')
            pininst = ' '.join(f'(pin {q(child(p,"number")[1])} (uuid {q(uid(sku+ref+str(child(p,"number")[1])))}))' for p in pins)
            items.append(f'(symbol (lib_id {q(libid)}) (at {x} {y} 0) (unit 1) (in_bom yes) (on_board yes) (dnp no) '
                         f'(uuid {q(uid(sku+ref))}) {" ".join(props)} {pininst} '
                         f'(instances (project {q(basename)} (path {q("/"+paths[index])} (reference {q(ref)}) (unit 1)))))')
            for pin in pins:
                num = str(child(pin, 'number')[1]); at = child(pin, 'at'); px, py, angle = map(float, at[1:4])
                sx, sy = x+px, y-py
                net = expected.get((ref, num))
                # Leave source-open pins open; never invent no-connect flags or power flags.
                if net is None:
                    continue
                rad = math.radians(angle); ex, ey = round(sx-5.08*math.cos(rad), 5), round(sy+5.08*math.sin(rad), 5)
                items.append(f'(wire (pts (xy {sx} {sy}) (xy {ex} {ey})) (stroke (width 0) (type default)) (uuid {q(uid(sku+ref+num+"wire"))}))')
                la = 90 if angle in (90, 270) else 0
                just = 'right' if angle in (0, 90) else 'left'
                items.append(f'(global_label {q(net)} (shape passive) (at {ex} {ey} {la}) '
                             f'(effects (font (size 0.9 0.9)) (justify {just})) (uuid {q(uid(sku+ref+num+"label"))}))')
        def text(value, x, y, size=1.5):
            return f'(text {q(value)} (at {x} {y} 0) (effects (font (size {size} {size})) (justify left)) (uuid {q(uid(sku+str(index)+value))}))'
        items += [text(f'XORRPAD {sku.upper()} - CONNECTIVITY REVIEW / P3', 15, 15, 2),
                  text('ENGINEERING DRAFT - A human PCB designer must review this before any order.', 15, 22),
                  text('Reconstructed from SKiDL netlist. Named global nets connect every sheet; source-open pins remain open.', 15, 28, 1.2)]
        if index == 0:
            items.append(text('Review holds: ILIM_VALUE_TBD; USB/RF/power; sourcing; enclosure supports.', 15, 230, 1.3))
            items.append(text('Pro J3 and U8 use the source passive terminal models; no functional certification.', 15, 236, 1.3))
            for i in range(1, len(pages)):
                y = 40 + 18*(i-1); name = f'{basename}-{i:02d}.kicad_sch'
                sheetid = uid(f'{sku}/sheet/{i}')
                items.append(f'(sheet (at 235 {y}) (size 150 12) (stroke (width 0.1524) (type default)) (fill (color 0 0 0 0)) '
                             f'(uuid {q(sheetid)}) (property "Sheetname" {q(", ".join(pages[i]))} (at 235 {y-1} 0) '
                             f'(effects (font (size 1 1)) (justify left bottom))) (property "Sheetfile" {q(name)} (at 235 {y+13} 0) '
                             f'(effects (font (size 1 1)) (justify left top))) '
                             f'(instances (project {q(basename)} (path {q("/"+rootid)} (page {q(i+1)})))))')
        page = f'(kicad_sch (version 20250114) (generator "xorrpad-p3") (uuid {q(sid)}) (paper "A3") '
        page += f'(title_block (title {q("Xorrpad "+sku+" connectivity review")}) (rev "P3 DRAFT") (comment 1 "DO NOT ORDER - human PCB review required")) '
        page += '(lib_symbols ' + ' '.join(embedded.values()) + ') ' + ' '.join(items) + ' (embedded_fonts no))\n'
        (folder / (f'{basename}.kicad_sch' if index == 0 else f'{basename}-{index:02d}.kicad_sch')).write_text(page)
    rootfile = folder / f'{basename}.kicad_sch'
    run(['sch', 'export', 'netlist', '--format', 'kicadxml', '-o', folder / 'schematic-roundtrip.xml', rootfile], folder)
    import xml.etree.ElementTree as ET
    xml = ET.parse(folder / 'schematic-roundtrip.xml')
    actual = {(n.attrib['ref'], n.attrib['pin']): net.attrib['name'].lstrip('/')
              for net in xml.findall('./nets/net') for n in net.findall('node')}
    # KiCad names dangling pins automatically; source singleton named nets remain checked.
    actual = {key: value for key, value in actual.items() if not value.startswith('unconnected-(')}
    assert actual == expected, dict(missing={str(k): v for k,v in expected.items() if actual.get(k) != v},
                                    extra={str(k): v for k,v in actual.items() if expected.get(k) != v})
    run(['sch', 'export', 'pdf', '-o', folder/f'{sku}-schematic.pdf', rootfile], folder)
    return dict(pages=len(pages), components=len(comps), connected_pins=len(expected), netlist_parity=True,
                source_open_pins='Unchanged; no no-connect or power flags added')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--sku', choices=['pro', 'core'], required=True)
    args = parser.parse_args(); sku = args.sku
    folder = OUT / sku / 'fab'; folder.mkdir(parents=True, exist_ok=True)
    (folder/'export.log').write_text('Local P3 engineering review exports; DO NOT ORDER.\n')
    board = OUT / f'{sku}.kicad_pcb'; before = sha(board)
    manifest = json.loads((OUT / f'{sku}-parts.json').read_text())
    manifest_by_ref = {p['ref']: p for p in manifest}
    sch = schematic(sku, folder, manifest)
    import wx
    app = wx.App(False)
    import pcbnew as k
    b = k.LoadBoard(str(board)); fp = {f.GetReference(): f for f in b.GetFootprints()}
    assert set(fp) == set(manifest_by_ref)
    assert all(p.GetNetname() == manifest_by_ref[ref]['pins'].get(p.GetNumber(), '')
               for ref,f in fp.items() for p in f.Pads())
    groups = collections.defaultdict(list)
    for p in manifest:
        assert fp[p['ref']].GetFPID().GetLibItemName() == p['footprint'].split(':')[-1]
        groups[(p['mpn'], p['footprint'], p['lcsc'])].append(p['ref'])
    with (folder/f'{sku}-jlc-bom.csv').open('w', newline='') as f:
        w = csv.writer(f, lineterminator='\n'); w.writerow(['Comment', 'Designator', 'Footprint', 'LCSC Part #'])
        for (mpn,footprint,lcsc), refs in sorted(groups.items()):
            w.writerow([mpn, ','.join(sorted(refs)), footprint, lcsc])
    with (folder/f'{sku}-jlc-cpl.csv').open('w', newline='') as f:
        w = csv.writer(f, lineterminator='\n'); w.writerow(['Designator', 'Mid X', 'Mid Y', 'Layer', 'Rotation'])
        for ref, f in sorted(fp.items()):
            pos = f.GetPosition()
            w.writerow([ref, f'{k.ToMM(pos.x)-100:.4f}mm', f'{184-k.ToMM(pos.y):.4f}mm',
                        'B' if f.IsFlipped() else 'T', f'{f.GetOrientationDegrees():.4f}'])
    run(['pcb','drc','--format','json','--severity-all','--exit-code-violations','-o',folder/f'{sku}-drc.json',board],folder)
    drc = json.loads((folder/f'{sku}-drc.json').read_text())
    assert not drc['violations'] and not drc['unconnected_items']
    run(['pcb','export','gerbers','--layers','F.Cu,In1.Cu,In2.Cu,B.Cu,F.Mask,B.Mask,F.Paste,B.Paste,F.Silkscreen,B.Silkscreen,Edge.Cuts',
         '-o',str(folder/'gerbers')+os.sep,board],folder)
    run(['pcb','export','drill','--format','excellon','--drill-origin','absolute','--excellon-separate-th',
         '--generate-map','--map-format','pdf','--generate-report','-o',str(folder/'drill')+os.sep,board],folder)
    run(['pcb','export','pdf','--mode-multipage','--layers','F.Cu,In1.Cu,In2.Cu,B.Cu,F.Silkscreen,B.Silkscreen,F.Fab,B.Fab',
         '--common-layers','Edge.Cuts','--exclude-value','--include-border-title','--scale','1.6', '-o',folder/f'{sku}-board.pdf',board],folder)
    for view, options in [('top',['--side','top']), ('bottom',['--side','bottom']),
                          ('three-quarter',['--side','top','--rotate','-45,0,45','--perspective','--zoom','0.75'])]:
        run(['pcb','render','--width','1600','--height','1200','--quality','high','--background','opaque',
             *options,'-o',folder/f'{sku}-{view}.png',board],folder)
    assert sha(board) == before, 'Export mutated source board'
    missing_models = []; present_models = 0
    modelroot = Path('/Applications/KiCad/KiCad.app/Contents/SharedSupport/3dmodels')
    for ref,f in fp.items():
        models = list(f.Models())
        if not models: missing_models.append(ref)
        else:
            for model in models:
                path = Path(re.sub(r'\$\{KICAD\d*_3DMODEL_DIR\}', str(modelroot), model.m_Filename))
                if path.exists(): present_models += 1
                else: missing_models.append(ref)
    gerbers = sorted((folder/'gerbers').glob('*'))
    assert len(list((folder/'gerbers').glob('*.gbrjob'))) == 1 and len(gerbers) == 12
    assert len(list((folder/'drill').glob('*.drl'))) == 2
    (folder/'REVIEW-NOTES.txt').write_text(
        f'Xorrpad {sku.upper()} - P3 ENGINEERING DRAFT - DO NOT ORDER\n'
        'A human PCB designer must review this before any order.\n'
        'No manufacturing release: see ../../../README.md and ../../../FIT.md.\n'
        'Four layers: F.Cu signal / In1.Cu GND / In2.Cu 3V3 / B.Cu signal.\n'
        'Nominal board thickness 1.6 mm. No approved vendor impedance stackup.\n'
        'Gerbers and Excellon drills share the KiCad absolute origin; millimetres.\n'
        'CPL uses PCB (100,184) mm lower-left bounding origin, +Y upward; T/B.\n'
        'CPL angles are KiCad angles; assembler rotations/orientations unapproved.\n'
        'BOM includes blank supplier IDs and ILIM_VALUE_TBD. Not procurement-ready.\n'
        'Native review schematics were reconstructed from the SKiDL netlist.\n'
        'Round-trip named-net/pin parity passed; no new electrical sign-off.\n'
        'Source-open pins remain open; U8 and Pro J3 retain passive terminal models.\n'
        'Board PDF: eight pages, F.Cu/In1.Cu/In2.Cu/B.Cu/F.Silk/B.Silk/F.Fab/B.Fab,\n'
        'all viewed from above (bottom layers not mirrored), Edge.Cuts overlaid, 1.6x.\n'
        'Three PNGs are actual kicad-cli pcb render views; missing models are\n'
        'listed in manifest.json and prevent populated mechanical certification.\n'
        'Mounting/support/cage, Pro FPC, RF/USB/power and sourcing holds remain.\n')
    log = folder/'export.log'
    log.write_text(log.read_text().rstrip()+'\n')
    result = dict(sku=sku,scope='P3 local engineering review export; DO NOT ORDER', kicad_version=subprocess.check_output([CLI,'version'],text=True).strip(),
                  exporter_sha256=sha(Path(__file__)),
                  source_board_sha256=before,source_project_sha256=sha(OUT/f'{sku}.kicad_pro'),
                  source_netlist_sha256=sha(OUT/f'{sku}.net'),source_manifest_sha256=sha(OUT/f'{sku}-parts.json'),
                  drc=dict(errors=0,warnings=0,unconnected=0,remaining_warnings=[]),schematic=sch,
                  bom_components=len(manifest),bom_groups=len(groups),blank_lcsc_components=sorted(p['ref'] for p in manifest if not p['lcsc']),
                  cpl_components=len(fp),cpl_origin='PCB (100,184) mm; lower-left bounding corner; +Y upwards; T/B, mm; KiCad angles; assembler orientation review required',
                  gerber_drill_origin='KiCad absolute origin, same for both; CPL uses documented lower-left offset',
                  render_actual_pixels={p.name:struct.unpack('>II',p.read_bytes()[16:24]) for p in sorted(folder.glob('*.png'))},
                  render_models=dict(existing=present_models,missing_references=sorted(set(missing_models))),
                  files={str(p.relative_to(folder)):sha(p) for p in sorted(folder.rglob('*')) if p.is_file() and p.name!='manifest.json'})
    (folder/'manifest.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({key:value for key,value in result.items() if key!='files'},indent=2))
