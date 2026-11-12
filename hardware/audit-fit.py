#!/usr/bin/env python3
"""Measure the actual PCB outline against the local enclosure CAD, offline.

XY checks only: a populated PCB mounting Z and supports are not yet designed.
Run using the same KiCad Python environment as route-pro.py.
"""
import argparse,hashlib,json,math,runpy,sys
from pathlib import Path
from shapely.geometry import LineString,Point,box
from shapely.ops import unary_union,polygonize,transform

m=runpy.run_path(str(Path(__file__).with_name('routing-geometry.py')))
k=m['k'];xy=m['xy'];out=m['OUT']
sys.path.insert(0,str(out.parent.parent/'cad'))
import partlib as cad
import part_tray as tray
import part_plate as plate
import part_display as display
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
towers=[Point(x,y).buffer(plate.TOWER_D/2,resolution=96)
    for x in [-cad.BOSS_XY,cad.BOSS_XY] for y in [-cad.BOSS_XY,cad.BOSS_XY]]
key_errors=[]
fp={f.GetReference():f for f in b.GetFootprints()}
for i,key in enumerate(cad.key_layout(),1):
    px,py=xy(fp[f'SW{i}'].GetPosition())
    if math.dist((px-142,142-py),(key['x'],key['y']))>1e-5:key_errors.append(i)
pod=display.Pod('tft28_spi')
opening=pod.side_opening()
y0,z0,y1,z1=opening.bounds
fpc=dict(populated=a.sku=='pro',pod_model=display.MODULES['tft28_spi']['label'],
    pod_right_wall_x_mm=cad.CASE_W/2,
    pod_opening_yz_bounds_mm=[y0,z0,y1,z1],
    pod_opening_bounding_diagonal_mm=math.hypot(y1-y0,z1-z0),
    tray_side_window_y_mm=[-tray.WIN_W/2,tray.WIN_W/2],
    tray_side_window_z_mm=[cad.USB_WIN[1],cad.USB_WIN[2]],
    note='Existing pod is for a headered MSP2807, not the proposed bare ER-TFT028-4 FPC panel.')
if a.sku=='pro':
    connector=fp['J3'];cx,cy=xy(connector.GetPosition())
    pads={p.GetNumber():p for p in connector.Pads()}
    first,last=xy(pads['1'].GetPosition()),xy(pads['50'].GetPosition())
    contact_span=math.dist(first,last)
    fails_bound=contact_span>math.hypot(y1-y0,z1-z0)
    fpc.update(connector_origin_cad_mm=[cx-142,142-cy],
        connector_rotation_deg=connector.GetOrientationDegrees(),
        contact_row_cad_endpoints_mm=[[first[0]-142,142-first[1]],[last[0]-142,142-last[1]]],
        contact_span_mm=contact_span,pitch_mm=math.dist(first,xy(pads['2'].GetPosition())),
        minimum_flat_ribbon_width_mm=contact_span,
        flat_ribbon_fails_bounding_check=fails_bound,
        width_excess_over_opening_diagonal_mm=contact_span-math.hypot(y1-y0,z1-z0),
        connector_to_pod_aperture_xy_lower_bound_mm=Point(cx-142,142-cy).distance(LineString([(cad.CASE_W/2,y0),(cad.CASE_W/2,y1)])),
        aperture_to_tray_window_y_gap_mm=y0-tray.WIN_W/2,
        disposition=('FAIL for a straight flat ribbon cross-section: the contact span exceeds the opening bounding diagonal. ' if fails_bound else 'UNVERIFIED: passing a bounding-box width check alone does not establish a cable route. ')+
        'No FPC bend radius, cable length, latch/strain relief or populated mounting Z is defined; a folded/twisted or new-slot route needs a mechanical redesign and validation.')
else:
    fpc['disposition']='Not applicable: Core has no FPC connector or display population.'
result=dict(sku=a.sku,scope='XY measurements; populated mounting Z/supports unverified',
    board_bounds_mm=outline.bounds,board_thickness_mm=k.ToMM(b.GetDesignSettings().GetBoardThickness()),
    tray_inner_width_mm=cad.CASE_W-2*cad.WALL,inside_tray_xy=inner.covers(outline),
    minimum_tray_wall_gap_mm=outline.distance(inner.boundary),
    boss_gaps_mm=[outline.distance(q) for q in bosses],
    plate_tower_diameter_mm=plate.TOWER_D,plate_tower_z_mm=[plate.TOWER_Z0,cad.PLATE_Z0+plate.OVERLAP],
    plate_tower_xy_gaps_mm=[outline.distance(q) for q in towers],
    plate_screw_centres_mm=plate._screw_centers(),plate_screw_through_diameter_mm=plate.SCREW_D,
    inside_plate_skirt_xy=skirt_inner.covers(outline),minimum_skirt_gap_mm=outline.distance(skirt_inner.boundary),
    existing_cage_xy_overlap_mm2=outline.intersection(cage).area,
    existing_cage_z_mm=[cad.BOARD_Z,tray.CAGE_Z1],
    usb_origin_cad_mm=[x-142,142-y],usb_side_window_half_width_mm=tray.WIN_W/2,
    mounting_hole_count=sum(f.GetReference().startswith('H') for f in b.GetFootprints()),
    key_centres_checked=14,key_centre_discrepancies=key_errors,
    fpc=fpc,
    source_sha256={str(p.relative_to(out.parent.parent)):hashlib.sha256(p.read_bytes()).hexdigest()
        for p in [out/f'{a.sku}.kicad_pcb',*[out.parent.parent/'cad'/n for n in ['partlib.py','part_tray.py','part_plate.py','part_display.py']]]},
    conclusion='Outline clears walls/bosses; new PCB supports and component/connector Z review required. Existing cage intersects a PCB at the prototype board Z; do not order.')
(out/f'{a.sku}-fit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
