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
    # Rotate the flow-through ESD array to preserve D+/D- order on the trunk.
    esd=next(f for f in b.GetFootprints() if f.GetReference()=='U2')
    esd.SetOrientationDegrees(180)
    limiter=next(f for f in b.GetFootprints() if f.GetReference()=='U8')
    limiter.SetPosition(v(180.5,148.5))
    track(b,'USB_DP',[(170.65,139.5375),(172.35,139.5375)],locked=True)
    track(b,'USB_DN',[(170.65,138.4625),(172.35,138.4625)],locked=True)
    track(b,'USB_DP',[(172.35,139.5375),(173.2,139.5375),(174,140.3375),
                     (174,143.5),(175,144.5),
                     (175,157.7),(173.315,159.385),(166.8,159.385),
                     (166.185,160),(164.85,160)],locked=True)
    track(b,'USB_DN',[(172.35,138.4625),(173.25,138.4625),(174.35,139.5625),
                     (174.35,143.355),(175.35,144.355),
                     (175.35,157.845),(173.465,159.73),(166.95,159.73),
                     (165.41,161.27),(164.85,161.27)],locked=True)
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

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('step',choices=['prepare','export','import'])
    args=p.parse_args()
    {'prepare':prepare,'export':export,'import':import_session}[args.step]()
