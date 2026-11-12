#!/usr/bin/env python3
"""Replay the checked local finishing geometry, without a routing search.

Run prepare and routes in separate KiCad Python processes after SES import and
stitching. The paths are the actual recorded successful local revisions.
"""
import argparse,json,math,runpy
from pathlib import Path
m=runpy.run_path(str(Path(__file__).with_name('routing-geometry.py')))
k=m['k'];out=m['OUT'];xy=m['xy'];v=m['v']
p=argparse.ArgumentParser();p.add_argument('step',choices=['prepare','routes'])
p.add_argument('--board',type=Path,default=out/'pro.kicad_pcb');a=p.parse_args()
b=k.LoadBoard(str(a.board));pp=a.board.with_suffix('.kicad_pro')
project=pp.read_text() if pp.exists() else (out/'pro.kicad_pro').read_text()
if a.step=='prepare':
    cap=next(f for f in b.GetFootprints() if f.GetReference()=='C9')
    cap.SetPosition(v(129.25,158.4375))
    shifts={(128.25,159.3875):(129.25,159.3875),(128.25,157.4875):(129.25,157.4875)}
    remove=[]
    for t in b.GetTracks():
        if isinstance(t,k.PCB_VIA):continue
        if t.GetWidth()<k.FromMM(.15):t.SetWidth(k.FromMM(.15))
        start,end=xy(t.GetStart()),xy(t.GetEnd())
        if t.GetNetname()=='KEY14' and min(math.dist(start,(177.8879,177.6802)),math.dist(end,(177.8879,177.6802)))<.0001:
            remove.append(t);continue
        if start in shifts:t.SetStart(v(*shifts[start]))
        if end in shifts:t.SetEnd(v(*shifts[end]))
    assert len(remove)==2,'Expected the two original corner tracks; do not run prepare twice'
    for t in remove:b.Remove(t)
else:
    records=json.loads((out/'pro-local-revision.json').read_text())
    for r in records:
        if r['net']=='KEY14':m['track'](b,'KEY14',r['path'],width=.15)
        elif r['net']=='BUCK_SW':
            for access in r['access']:
                m['track'](b,'BUCK_SW',access['path_mm'],width=.15)
                m['via'](b,'BUCK_SW',access['via_mm'])
            m['track'](b,'BUCK_SW',r['path'],width=.15,layer=k.B_Cu)
        else:
            # The speaker escape joins the next F.Cu path directly; no unused via.
            m['track'](b,'SPK_N',r['access']['path_mm'],width=.15)
    speaker=json.loads((out/'pro-speaker-connection.json').read_text())
    for pos in speaker['added_vias_mm']:m['via'](b,'SPK_N',pos)
    for path in speaker['paths']:
        m['track'](b,'SPK_N',path['points_mm'],width=.15,layer=k.F_Cu if path['layer']=='F.Cu' else k.B_Cu)
k.SaveBoard(str(a.board),b);pp.write_text(project)
