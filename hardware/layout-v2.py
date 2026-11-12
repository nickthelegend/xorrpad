#!/usr/bin/env python3
"""Local placement pass with real CAD key centres and explicit keepouts.

Run using KiCad Python + Shapely 2.0.7. No network/hardware access.
This does not claim that the prototype's vertical component pockets fit a PCB.
"""
import csv, json, math, os, sys
from pathlib import Path
import wx
app=wx.App(False)
import pcbnew as k
from shapely.geometry import box, Point, Polygon
from shapely.ops import unary_union

ROOT=Path(__file__).resolve().parent;OUT=ROOT/'generated'
LIB=Path(os.environ.get('KICAD_FOOTPRINT_DIR','/Applications/KiCad/KiCad.app/Contents/SharedSupport/footprints'))
sys.path.insert(0,str(ROOT.parent/'cad'))
import partlib as cad
def mm(x):return k.ToMM(x)
def v(x,y):return k.VECTOR2I(k.FromMM(x),k.FromMM(y))
def layers(ids):
    s=k.LSET()
    for x in ids:s.AddLayer(x)
    return s
def rect(b):return box(mm(b.GetX()),mm(b.GetY()),mm(b.GetRight()),mm(b.GetBottom()))


def socket():
    """Dedicated MX socket land pattern: Kailh drawing KH-PS1607-10 p9.

    Socket SMT lands 2.55x2.50, insertion holes 3.05 mm. MX 5-pin supports
    and centre hole follow cad/part_plate.py. Production selects 3-pin MX switches; no unused 5-pin support bores. No obsolete plated switch/LED pads.
    """
    fp=k.FOOTPRINT(None);fp.SetFPID(k.LIB_ID('Xorrpad','Kailh_CPG151101S11'))
    fp.SetAttributes(k.FP_SMD)
    for number,x,y in [('1',7.36,-2.54),('2',-6.09,-5.08)]:
        p=k.PAD(fp);p.SetNumber(number);p.SetAttribute(k.PAD_ATTRIB_SMD);p.SetShape(k.PAD_SHAPE_RECT)
        p.SetSize(v(2.55,2.50));p.SetPosition(v(x,y));p.SetLayerSet(layers([k.F_Cu,k.F_Paste,k.F_Mask]));fp.Add(p)
    for x,y,d in [(0,0,4.15),(3.81,-2.54,3.05),(-2.54,-5.08,3.05)]:
        p=k.PAD(fp);p.SetAttribute(k.PAD_ATTRIB_NPTH);p.SetShape(k.PAD_SHAPE_CIRCLE);p.SetSize(v(d,d));p.SetDrillSize(v(d,d));p.SetPosition(v(x,y));p.SetLayerSet(k.LSET.AllCuMask());fp.Add(p)
    # Courtyard includes the socket body/lands; holes are checked independently.
    for a,b in [((-7.65,-7.05),(8.9,-7.05)),((8.9,-7.05),(8.9,1.2)),((8.9,1.2),(-7.65,1.2)),((-7.65,1.2),(-7.65,-7.05))]:
        s=k.PCB_SHAPE();s.SetShape(k.SHAPE_T_SEGMENT);s.SetStart(v(*a));s.SetEnd(v(*b));s.SetLayer(k.F_CrtYd);s.SetWidth(k.FromMM(.05));fp.Add(s)
    k.FootprintSave(str(ROOT/'Xorrpad.pretty'),fp)


def body(fp):
    if fp.GetReference()=='U1':
        # Manufacturer courtyard is concave around the antenna's 15mm clearance.
        # The physical body court and the antenna rule area are tracked separately.
        pts=[(-9.75,-6.75),(-9.75,13.45),(9.75,13.45),(9.75,-6.75)]
        a=math.radians(fp.GetOrientationDegrees());px,py=map(mm,[fp.GetPosition().x,fp.GetPosition().y])
        return Polygon([(px+x*math.cos(a)+y*math.sin(a),py-x*math.sin(a)+y*math.cos(a)) for x,y in pts])
    rs=[rect(g.GetBoundingBox()) for g in fp.GraphicalItems() if g.GetLayer() in [k.F_CrtYd,k.B_CrtYd]]
    return unary_union(rs).envelope if rs else unary_union([rect(p.GetBoundingBox()) for p in fp.Pads()]).envelope.buffer(.25)


def shape(fp):
    return 1 if fp.IsFlipped() else 0


def build(sku):
    parts=json.loads((OUT/f'{sku}-parts.json').read_text());b=k.BOARD();b.SetCopperLayerCount(2)
    net={}
    for name in sorted({n for p in parts for n in p['pins'].values()}):
        item=k.NETINFO_ITEM(b,name,len(net)+1);b.Add(item);net[name]=item
    # Rounded 84mm board clears the prototype skirt. Notches clear its four
    # M3 bosses rather than drilling M2 holes through their solid material.
    outline=cad.rounded_rect(84,84,5).difference(unary_union([Point(x,y).buffer(4.4,resolution=24) for x in [-cad.BOSS_XY,cad.BOSS_XY] for y in [-cad.BOSS_XY,cad.BOSS_XY]]))
    world=Polygon([(142+x,142-y) for x,y in outline.exterior.coords])
    coords=list(world.exterior.coords)
    for a,z in zip(coords,coords[1:]):
        line=k.PCB_SHAPE();line.SetShape(k.SHAPE_T_SEGMENT);line.SetStart(v(*a));line.SetEnd(v(*z));line.SetLayer(k.Edge_Cuts);line.SetWidth(k.FromMM(.05));b.Add(line)
    centers=[(142+p['x'],142-p['y']) for p in cad.key_layout()]
    fixed={'U1':(156.1,171.25,180),'J1':(180,139,90),'U2':(171.5,139,0),
           'ENC1':(142+cad.KNOB_POS[0]-7.5,142-cad.KNOB_POS[1]-2.5,0),'J3':(149,103,0)}
    fpmap={};meta={p['ref']:p for p in parts}
    for p in parts:
        lib,name=p['footprint'].split(':')
        if p['ref'].startswith('SW') and int(p['ref'][2:])<=14:lib,name='Xorrpad','Kailh_CPG151101S11'
        fp=k.FootprintLoad(str(ROOT/'Xorrpad.pretty' if lib=='Xorrpad' else LIB/f'{lib}.pretty'),name)
        if fp is None:raise ValueError(f'Missing {lib}:{name}')
        fp.SetReference(p['ref']);fp.SetValue(p['mpn']);b.Add(fp)
        # Reference designators stay in fabrication drawings; silk is reserved
        # for the board identity and externally applied serial label.
        for f in [fp.Reference(),fp.Value()]:f.SetLayer(k.F_Fab);f.SetVisible(True)
        for g in fp.GraphicalItems():
            if g.GetLayer()==k.F_SilkS:g.SetLayer(k.F_Fab)
            if g.GetLayer()==k.B_SilkS:g.SetLayer(k.B_Fab)
        if p['ref'] in ['U1','U3']:
            for pad in fp.Pads():
                if pad.GetAttribute()==k.PAD_ATTRIB_PTH:
                    pad.SetDrillSize(v(.3,.3));pad.SetSize(v(.6,.6))
        for pad in fp.Pads():
            n=p['pins'].get(pad.GetNumber())
            if n:pad.SetNet(net[n])
        fpmap[p['ref']]=fp
    def place(ref,x,y,angle=0,bottom=False):
        fp=fpmap[ref];fp.SetPosition(v(x,y))
        if bottom and not fp.IsFlipped():fp.Flip(fp.GetPosition(),False)
        fp.SetOrientationDegrees(angle)
    for i,c in enumerate(centers,1):place(f'SW{i}',*c,0 if i==14 else 180,True)
    for ref,loc in fixed.items():
        if ref in fpmap:place(ref,*loc)
    used=set([f'SW{i}' for i in range(1,15)])|set(fixed).intersection(fpmap)
    keepouts=[]
    for f in fpmap.values():
        if f.GetReference() not in used:continue
        for z in f.Zones():
            if z.GetIsRuleArea():keepouts.append(rect(z.GetBoundingBox()))
    # Reserve all switch/connector drills on both sides. Component packing is
    # conservative: it never resolves conflicts by lowering DRC clearances.
    holes=[]
    for ref in used:
        for pad in fpmap[ref].Pads():
            if pad.GetDrillSize().x:
                holes.append((ref,Point(mm(pad.GetPosition().x),mm(pad.GetPosition().y)).buffer(mm(max(pad.GetDrillSize().x,pad.GetDrillSize().y))/2+.25)))
    def valid(ref):
        fp=fpmap[ref];poly=body(fp)
        if not world.buffer(-.55).covers(poly):return False
        if any(poly.intersects(q) for q in keepouts):return False
        if any(ref!=owner and poly.intersects(h) for owner,h in holes):return False
        for pad in fp.Pads():
            if pad.GetDrillSize().x:
                hp=Point(mm(pad.GetPosition().x),mm(pad.GetPosition().y)).buffer(mm(max(pad.GetDrillSize().x,pad.GetDrillSize().y))/2+.25)
                if any(hp.intersects(body(fpmap[r])) for r in used if r!=ref):return False
        return not any(shape(fp)==shape(fpmap[r]) and poly.intersects(body(fpmap[r]).buffer(.10)) for r in used if r!=ref)
    def pack(ref,target,radius=20,preferred_angle=None):
        # Search deterministic positions, closest first, with actual courtyards.
        candidates=[]
        for dx in range(-int(radius*2),int(radius*2)+1):
            for dy in range(-int(radius*2),int(radius*2)+1):
                candidates.append((dx*dx+dy*dy,dx*.5,dy*.5))
        candidates.sort()
        angles=[preferred_angle] if preferred_angle is not None else [0,90]
        for _,dx,dy in candidates:
            for a in angles:
                place(ref,target[0]+dx,target[1]+dy,a)
                if valid(ref):used.add(ref);return
        raise RuntimeError(f'No placement for {ref} near {target}')
    # LEDs south of key centres avoid the switch contact/insertion holes.
    for ref in fpmap:
        if ref.startswith('LED'):
            i=int(ref[3:]);target=(105,145) if i==1 else (centers[i-2][0],centers[i-2][1]+5)
            pack(ref,target,8)
    # Keep bypass caps near the actual power pins, before other small parts.
    cap_ic={'C2':('U1','2'),'C3':('U1','2'),'C6':('U4','5'),'C7':('U5','5'),'C8':('U6','7'),'C9':('U6','7'),'C10':('J3','40'),'C11':('J3','42')}
    # Place regulator/audio/filter ICs in free corridors before local caps.
    for ref,target in [('U3',(146,140)),('U4',(107,146)),('U5',(108,157)),('U6',(125,157)),('U8',(177,145)),('J2',(119,177)),('Q1',(167,106))]:
        if ref in fpmap:pack(ref,target,18)
    for ref,(ic,pin) in cap_ic.items():
        if ref in fpmap:
            pad=next(p for p in fpmap[ic].Pads() if p.GetNumber()==pin)
            pack(ref,(mm(pad.GetPosition().x),mm(pad.GetPosition().y)),10)
    for ref in fpmap:
        if ref in used:continue
        if ref.startswith('D'):
            i=int(ref[1:]);x,y=centers[i-1];target=(x+8,y+2)
        elif ref.startswith('C') and int(ref[1:])>=20:
            led=fpmap[f'LED{int(ref[1:])-19}'];target=(mm(led.GetPosition().x),mm(led.GetPosition().y)+2)
        elif ref in ['L1','R6','R7','C4','C5']:
            f=fpmap['U3'];target=(mm(f.GetPosition().x)+3,mm(f.GetPosition().y))
        elif ref in ['R3','R4','R5']:
            f=fpmap['J1'];target=(mm(f.GetPosition().x)-3,mm(f.GetPosition().y)-5)
        else:target=(124+(len(used)%5)*10,123+(len(used)%4)*10)
        pack(ref,target,35)
    # Check fixed parts separately; a designer must still resolve any physical
    # interference in the prototype's 3D pockets (reported by FIT.md).
    findings=[]
    for ref in sorted(used):
        f=fpmap[ref]
        if ref not in [f'SW{i}' for i in range(1,15)] and ref!='U1' and not valid(ref):findings.append(ref)
    k.SaveBoard(str(OUT/f'{sku}-placement.kicad_pcb'),b)
    k.ExportSpecctraDSN(b,str(OUT/f'{sku}.dsn'))
    with (OUT/f'{sku}-cpl.csv').open('w',newline='') as stream:
        w=csv.writer(stream,lineterminator='\n');w.writerow(['Designator','Mid X','Mid Y','Layer','Rotation'])
        for ref,f in fpmap.items():w.writerow([ref,f'{mm(f.GetPosition().x)-100:.4f}mm',f'{184-mm(f.GetPosition().y):.4f}mm','B' if f.IsFlipped() else 'T',f.GetOrientationDegrees()])
    (OUT/f'{sku}-placement-review.json').write_text(json.dumps({'fixed_parts_needing_review':findings,'key_centres_source':'cad/partlib.py','module_antenna_edge_y_mm':184,'board_edge_y_mm':184},indent=2)+'\n')
    print(sku,'placed',len(fpmap),'fixed review',findings,flush=True)


if __name__=='__main__':
    socket()
    for sku in ['pro','core']:build(sku)
