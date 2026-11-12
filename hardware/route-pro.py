#!/usr/bin/env python3
"""Pro P1: local KiCad preparation, SES import and ground stitching.

Use KiCad's bundled Python. The official JAR is run separately by route-jar.py.
Never contacts a service, orders, or changes a DRC severity/exclusion.
"""
import argparse
import json
import math
import re
from pathlib import Path
import wx
app = wx.App(False)
import pcbnew as k
from shapely.geometry import Point, LineString, box
from shapely.ops import unary_union, polygonize

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'generated'
def v(x, y): return k.VECTOR2I(k.FromMM(x), k.FromMM(y))
def lset(*ids):
    s = k.LSET()
    for layer in ids: s.AddLayer(layer)
    return s

def zone(b, layer, net, name):
    z = k.ZONE(b)
    z.SetLayer(layer)
    z.SetNet(b.FindNet(net))
    z.SetZoneName(name)
    z.SetLocalClearance(k.FromMM(.2))
    z.SetMinThickness(k.FromMM(.15))
    z.SetPadConnection(k.ZONE_CONNECTION_FULL)
    z.SetIslandRemovalMode(0)
    z.SetMinIslandArea(1)
    poly = z.Outline()
    poly.NewOutline()
    for x,y in [(100,100),(184,100),(184,184),(100,184)]:
        poly.Append(k.FromMM(x), k.FromMM(y))
    b.Add(z)

def track(b, net, points, width=.1565, layer=k.F_Cu, locked=False):
    for a,c in zip(points, points[1:]):
        t=k.PCB_TRACK(b);t.SetStart(v(*a));t.SetEnd(v(*c))
        t.SetWidth(k.FromMM(width));t.SetLayer(layer);t.SetNet(b.FindNet(net));t.SetLocked(locked);b.Add(t)

def prepare():
    project=json.loads((OUT/'pro-placement.kicad_pro').read_text())
    rules=project['board']['design_settings']['rules']
    rules.update(min_clearance=.15,min_track_width=.15,min_via_diameter=.6,
                 min_through_hole_diameter=.3,min_via_annular_width=.15)
    nc=project['net_settings']['classes'][0]
    nc.update(clearance=.15,track_width=.2,via_diameter=.6,via_drill=.3,
              diff_pair_width=.2,diff_pair_gap=.15)
    project['net_settings']['classes'].append(dict(nc,name='USB',priority=0,
        track_width=.1565,diff_pair_width=.1565,diff_pair_gap=.1935))
    project['net_settings']['netclass_patterns']=[{'netclass':'USB','pattern':'USB_D*'}]
    b=k.LoadBoard(str(OUT/'pro-placement.kicad_pcb'))
    b.SetCopperLayerCount(4)
    for f in b.GetFootprints():
        for z in f.Zones():
            if z.GetIsRuleArea(): z.SetLayerSet(lset(k.F_Cu,k.In1_Cu,k.In2_Cu,k.B_Cu))
    # Planes are exported to Specctra as power planes, not extra signal layers.
    zone(b,k.In1_Cu,'GND','L2 continuous GND')
    zone(b,k.In2_Cu,'3V3','L3 3V3')
    # Flow-through ESD: connector on right, MCU pair leaves the left pads.
    esd=next(f for f in b.GetFootprints() if f.GetReference()=='U2')
    esd.SetOrientationDegrees(0)
    limiter=next(f for f in b.GetFootprints() if f.GetReference()=='U8')
    limiter.SetPosition(v(180.5,148.5))
    diode=next(f for f in b.GetFootprints() if f.GetReference()=='D14')
    diode.SetPosition(v(179,173.5));diode.SetOrientationDegrees(90)
    track(b,'USB_DP',[(170.65,138.4625),(172.35,138.4625)],locked=True)
    track(b,'USB_DN',[(170.65,139.5375),(172.35,139.5375)],locked=True)
    track(b,'USB_DP',[(170.65,138.4625),(167,138.4625),(164,141.4625),
                     (164,156.4),(167,159.4),(166.4,160),(164.85,160)],locked=True)
    track(b,'USB_DN',[(170.65,139.5375),(167.05,139.5375),(164.35,142.2375),
                     (164.35,156.255),(167.35,159.255),(167.35,160.07),(166.15,161.27),(164.85,161.27)],locked=True)
    # Complete the USB-C duplicate contacts here, so the autorouter cannot
    # create a shortcut from the connector into the impedance-controlled trunk.
    track(b,'USB_DN',[(175.955,138.75),(174,138.75),(174,139.75),(175.955,139.75)],locked=True)
    track(b,'USB_DN',[(174,139.75),(172.5625,139.75),(172.35,139.5375)],locked=True)
    track(b,'USB_DP',[(175.955,138.25),(177.25,138.25),(177.8,137.7)],locked=True)
    track(b,'USB_DP',[(175.955,139.25),(177.8,139.25)],locked=True)
    track(b,'USB_DP',[(177.8,139.25),(177.8,137.7),(173.6,137.7)],layer=k.B_Cu,locked=True)
    track(b,'USB_DP',[(173.6,137.7),(173.6,138.825),(173.2375,138.4625),(172.35,138.4625)],locked=True)
    for pos in [(177.8,139.25),(177.8,137.7),(173.6,137.7)]:
        t=k.PCB_VIA(b);t.SetPosition(v(*pos));t.SetWidth(k.FromMM(.6));t.SetDrill(k.FromMM(.3))
        t.SetViaType(k.VIATYPE_THROUGH);t.SetLayerPair(k.F_Cu,k.B_Cu);t.SetNet(b.FindNet('USB_DP'));t.SetLocked(True);b.Add(t)
    k.SaveBoard(str(OUT/'pro-route-input.kicad_pcb'),b)
    path=OUT/'pro-route-input.kicad_pcb'
    text=path.read_text()
    # JLC04161H-3313 nominal stack; exact impedance requires fabricator review.
    stack='''
        (stackup
          (layer "F.SilkS" (type "Top Silk Screen"))
          (layer "F.Paste" (type "Top Solder Paste"))
          (layer "F.Mask" (type "Top Solder Mask") (thickness 0.01))
          (layer "F.Cu" (type "copper") (thickness 0.035))
          (layer "dielectric 1" (type "prepreg") (thickness 0.0994) (material "3313") (epsilon_r 4.1) (loss_tangent 0.02))
          (layer "In1.Cu" (type "copper") (thickness 0.0152))
          (layer "dielectric 2" (type "core") (thickness 1.265) (material "FR4") (epsilon_r 4.6) (loss_tangent 0.02))
          (layer "In2.Cu" (type "copper") (thickness 0.0152))
          (layer "dielectric 3" (type "prepreg") (thickness 0.0994) (material "3313") (epsilon_r 4.1) (loss_tangent 0.02))
          (layer "B.Cu" (type "copper") (thickness 0.035))
          (layer "B.Mask" (type "Bottom Solder Mask") (thickness 0.01))
          (layer "B.Paste" (type "Bottom Solder Paste"))
          (layer "B.SilkS" (type "Bottom Silk Screen"))
          (copper_finish "ENIG") (dielectric_constraints yes)
        )'''
    path.write_text(text.replace('(setup','(setup'+stack,1))
    # pcbnew.SaveBoard also writes a project from in-memory defaults; set the
    # reviewable project AFTER saving the board, so CLI DRC uses these rules.
    for name in ['pro-route-input','pro']:
        project['meta']['filename']=name+'.kicad_pro'
        (OUT/(name+'.kicad_pro')).write_text(json.dumps(project,indent=2)+'\n')

def export():
    b=k.LoadBoard(str(OUT/'pro-route-input.kicad_pcb'))
    b.GetDesignSettings().m_MinClearance=k.FromMM(.15)
    b.GetDesignSettings().m_NetSettings.GetDefaultNetclass().SetClearance(k.FromMM(.15))
    assert k.ExportSpecctraDSN(b,str(OUT/'pro.dsn'))
    path=OUT/'pro.dsn'
    text=path.read_text()
    # KiCad deliberately exports a quarter-clearance SMD exception. The brief
    # requires 0.15 mm everywhere, including SMD fanout.
    text=re.sub(r'\(clearance [\d.]+ \(type smd_smd\)\)',
                '(clearance 150 (type smd_smd))',text)
    for layer in ['In1.Cu','In2.Cu']:
        text=text.replace('(layer '+layer+'\n      (type signal)',
                          '(layer '+layer+'\n      (type power)')
    path.write_text(text)

def import_session():
    b=k.LoadBoard(str(OUT/'pro-route-input.kicad_pcb'))
    assert k.ImportSpecctraSES(b,str(OUT/'pro.ses'))
    zone(b,k.F_Cu,'GND','Top GND pour')
    zone(b,k.B_Cu,'GND','Bottom GND pour')
    k.SaveBoard(str(OUT/'pro.kicad_pcb'),b)
    project=json.loads((OUT/'pro-route-input.kicad_pro').read_text())
    project['meta']['filename']='pro.kicad_pro'
    (OUT/'pro.kicad_pro').write_text(json.dumps(project,indent=2)+'\n')

def stitch():
    b=k.LoadBoard(str(OUT/'pro.kicad_pcb'))
    ground=b.FindNet('GND').GetNetCode()
    def xy(p): return (k.ToMM(p.x),k.ToMM(p.y))
    edges=[LineString([xy(s.GetStart()),xy(s.GetEnd())]) for s in b.GetDrawings()
           if s.GetLayer()==k.Edge_Cuts]
    interior=unary_union(list(polygonize(edges))).buffer(-.81)
    blockers=[]
    for f in b.GetFootprints():
        for z in f.Zones():
            if z.GetIsRuleArea():
                r=z.GetBoundingBox()
                blockers.append(box(k.ToMM(r.GetX()),k.ToMM(r.GetY()),
                                    k.ToMM(r.GetRight()),k.ToMM(r.GetBottom())).buffer(.31))
        for p in f.Pads():
            # Conservative pad bounds cover rotated/rounded/oblong shapes.
            if p.GetNetCode()!=ground or p.GetDrillSize().x:
                r=p.GetBoundingBox()
                blockers.append(box(k.ToMM(r.GetX()),k.ToMM(r.GetY()),
                                    k.ToMM(r.GetRight()),k.ToMM(r.GetBottom())).buffer(.56))
    for t in b.GetTracks():
        if isinstance(t,k.PCB_VIA):
            blockers.append(Point(xy(t.GetPosition())).buffer(k.ToMM(t.GetWidth(k.F_Cu))/2+.56))
        elif t.GetNetCode()!=ground:
            blockers.append(LineString([xy(t.GetStart()),xy(t.GetEnd())]).buffer(k.ToMM(t.GetWidth())/2+.46))
    blocked=unary_union(blockers)
    candidates=[(x,y) for x in range(102,183,5) for y in range(102,183,5)]
    # Local return vias next to ground pads supplement the uniform mesh.
    for f in b.GetFootprints():
        for p in f.Pads():
            if p.GetNetCode()==ground:
                x,y=xy(p.GetPosition())
                candidates.extend((x+dx,y+dy) for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)])
    placed=[]
    for x,y in candidates:
        p=Point(x,y)
        if not interior.covers(p) or blocked.intersects(p):continue
        if any(math.hypot(x-u,y-w)<1 for u,w in placed):continue
        via=k.PCB_VIA(b);via.SetPosition(v(x,y));via.SetWidth(k.FromMM(.6))
        via.SetDrill(k.FromMM(.3));via.SetViaType(k.VIATYPE_THROUGH)
        via.SetLayerPair(k.F_Cu,k.B_Cu);via.SetNetCode(ground);b.Add(via)
        placed.append((x,y))
    project=(OUT/'pro.kicad_pro').read_text()
    k.SaveBoard(str(OUT/'pro.kicad_pcb'),b)
    (OUT/'pro.kicad_pro').write_text(project)
    (OUT/'pro-stitching.json').write_text(json.dumps(dict(
        via_size_mm=.6,drill_mm=.3,grid_pitch_mm=5,added_count=len(placed),
        coordinates_mm=placed),indent=2)+'\n')
    print('Added ground stitching vias:',len(placed))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('step',choices=['prepare','export','import','stitch'])
    args=p.parse_args()
    {'prepare':prepare,'export':export,'import':import_session,'stitch':stitch}[args.step]()
