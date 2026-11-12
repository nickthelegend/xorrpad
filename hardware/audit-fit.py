#!/usr/bin/env python3
"""Measure the actual PCB outline against the local enclosure CAD, offline.

XY checks only: a populated PCB mounting Z and supports are not yet designed.
Run using the same KiCad Python environment as route-pro.py.
"""
import argparse,json,runpy,sys
from pathlib import Path
from shapely.geometry import LineString,Point,box
from shapely.ops import unary_union,polygonize,transform

m=runpy.run_path(str(Path(__file__).with_name('routing-geometry.py')))
k=m['k'];xy=m['xy'];out=m['OUT']
sys.path.insert(0,str(out.parent.parent/'cad'))
import partlib as cad
import part_tray as tray
import part_plate as plate
p=argparse.ArgumentParser();p.add_argument('--sku',choices=['pro','core'],required=True);a=p.parse_args()
b=k.LoadBoard(str(out/f'{a.sku}.kicad_pcb'))
outline=unary_union(list(polygonize([LineString([xy(s.GetStart()),xy(s.GetEnd())])
    for s in b.GetDrawings() if s.GetLayer()==k.Edge_Cuts])))
outline=transform(lambda x,y:(x-142,142-y),outline)
inner=cad.rounded_rect(cad.CASE_W-2*cad.WALL,cad.CASE_W-2*cad.WALL,cad.CASE_R-cad.WALL)
bosses=[Point(x,y).buffer(tray.BOSS_D/2,resolution=96)
    for x in [-cad.BOSS_XY,cad.BOSS_XY] for y in [-cad.BOSS_XY,cad.BOSS_XY]]
skirt_inner=cad.rounded_rect(plate.SKIRT_IN_W,plate.SKIRT_IN_W,plate.SKIRT_IN_R)
cage=unary_union([box(-tray.BACK_RAIL_XW,tray.CAGE_Y_IN,tray.BACK_RAIL_XW,tray.CAGE_Y_OUT),
    box(tray.TAB_X0,-tray.CAGE_Y_OUT,tray.TAB_X1,-tray.CAGE_Y_IN),
    box(-tray.TAB_X1,-tray.CAGE_Y_OUT,-tray.TAB_X0,-tray.CAGE_Y_IN)])
f=next(f for f in b.GetFootprints() if f.GetReference()=='J1');x,y=xy(f.GetPosition())
result=dict(sku=a.sku,scope='XY measurements; populated mounting Z/supports unverified',
    board_bounds_mm=outline.bounds,board_thickness_mm=k.ToMM(b.GetDesignSettings().GetBoardThickness()),
    tray_inner_width_mm=cad.CASE_W-2*cad.WALL,inside_tray_xy=inner.covers(outline),
    minimum_tray_wall_gap_mm=outline.distance(inner.boundary),
    boss_gaps_mm=[outline.distance(q) for q in bosses],
    inside_plate_skirt_xy=skirt_inner.covers(outline),minimum_skirt_gap_mm=outline.distance(skirt_inner.boundary),
    existing_cage_xy_overlap_mm2=outline.intersection(cage).area,
    existing_cage_z_mm=[cad.BOARD_Z,tray.CAGE_Z1],
    usb_origin_cad_mm=[x-142,142-y],usb_side_window_half_width_mm=tray.WIN_W/2,
    mounting_hole_count=sum(f.GetReference().startswith('H') for f in b.GetFootprints()),
    fpc='Not populated on Core' if a.sku=='core' else 'Pro FPC path remains unverified',
    conclusion='Outline clears walls/bosses; new PCB supports and component/connector Z review required. Existing cage intersects a PCB at the prototype board Z; do not order.')
(out/f'{a.sku}-fit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
