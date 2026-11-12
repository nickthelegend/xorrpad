#!/usr/bin/env python3
"""Finish the actual Core SES import locally, without changing DRC rules.

Replayable against the saved imported board; no external service access.
"""
import argparse,json,runpy,math
from pathlib import Path
m=runpy.run_path(str(Path(__file__).with_name('routing-geometry.py')))
k=m['k'];out=m['OUT'];xy=m['xy']
p=argparse.ArgumentParser();p.add_argument('step',choices=['cleanup','escape','routes','prune'])
p.add_argument('--board',type=Path,default=out/'core.kicad_pcb');a=p.parse_args()
b=k.LoadBoard(str(a.board));pp=a.board.with_suffix('.kicad_pro');project=pp.read_text()
# Retain SWIG objects until SaveBoard; releasing removed items can crash KiCad.
retained=b.GetTracks()
if a.step=='cleanup':
    report=json.loads((out/'core-import-drc.json').read_text())
    dangling={i['uuid'] for v in report['violations'] if v['type']=='via_dangling' for i in v['items']}
    edge={i['uuid'] for v in report['violations'] if v['type']=='copper_edge_clearance' for i in v['items']}
    removed=[]
    for t in retained:
        uid=t.m_Uuid.AsString()
        if uid in dangling or uid in edge:
            removed.append(dict(uuid=uid,net=t.GetNetname(),kind='via' if isinstance(t,k.PCB_VIA) else 'track'))
            b.Remove(t)
        elif not isinstance(t,k.PCB_VIA) and t.GetWidth()<k.FromMM(.15):t.SetWidth(k.FromMM(.15))
    assert len(removed)==20, 'Expected 15 unnecessary vias and 5 edge tracks from saved import'
    (out/'core-cleanup.json').write_text(json.dumps(removed,indent=2)+'\n')
elif a.step=='escape':
    tracks=b.GetTracks()
    # The imported 3V3 dogbone fences in the adjacent switch-node pin.
    # Replace that access after opening the switch-node escape.
    old=next(r for r in json.loads((out/'core-reserved-power.json').read_text())
             if r['ref']=='U3' and r['pad']=='6')
    for t in tracks:
        if t.GetNetname()!='3V3':continue
        if isinstance(t,k.PCB_VIA):
            if math.dist(xy(t.GetPosition()),old['via_mm'])<.0001:b.Remove(t)
        elif any(math.dist(xy(t.GetStart()),u)<.0001 and math.dist(xy(t.GetEnd()),v)<.0001
                 or math.dist(xy(t.GetEnd()),u)<.0001 and math.dist(xy(t.GetStart()),v)<.0001
                 for u,v in zip(old['path_mm'],old['path_mm'][1:])):b.Remove(t)
    # Restore minimum clearance around the router's formerly 0.12 mm neck.
    for t in tracks:
        if isinstance(t,k.PCB_VIA) or t.GetNetname()!='ENC_SW':continue
        for get,set_ in [(t.GetStart,t.SetStart),(t.GetEnd,t.SetEnd)]:
            x,y=xy(get())
            if 144.8<x<145.1 and 122.2<y<122.4:set_(m['v'](x,y-.03))
elif a.step=='routes':
    records=[]
    path=m['route_between'](b,'ROW2',(181.575,132.625),(183.3216,148.5431))
    records.append(dict(net='ROW2',layer='F.Cu',path_mm=path))
    # Reserve both switch-node escapes, then join them on the bottom layer.
    escape=[(146.95,139.75),(147.2,139.75),(147.725,139.225),(147.725,139.0)]
    m['track'](b,'BUCK_SW',escape,width=.15);m['via'](b,'BUCK_SW',escape[-1])
    access=[dict(ref='U3',pad='7',net='BUCK_SW',via_mm=escape[-1],path_mm=escape),m['local_access'](b,'L1','1','BUCK_SW')]
    print('Switch-node access:',access,flush=True)
    assert not any(r.get('failed') for r in access), access
    points=[(146.95,140.25),(147.5,140.25)]
    m['track'](b,'3V3',points,width=.15);m['via'](b,'3V3',points[-1])
    power=dict(ref='U3',pad='6',net='3V3',via_mm=points[-1],path_mm=points)
    records.append(power)
    path=m['route_between'](b,'BUCK_SW',access[0]['via_mm'],access[1]['via_mm'],layer=k.B_Cu)
    records.append(dict(net='BUCK_SW',layer='B.Cu',access=access,path_mm=path))
    (out/'core-local-revision.json').write_text(json.dumps(records,indent=2)+'\n')
else:
    from shapely.geometry import Point,LineString
    tracks=list(b.GetTracks());deleted=[]
    pads=[p for f in b.GetFootprints() for p in f.Pads() if p.GetNetname()=='COL2']
    candidates=[t for t in tracks if t.GetNetname()=='COL2' and not isinstance(t,k.PCB_VIA)]
    changed=True
    while changed:
        changed=False
        for t in list(candidates):
            for endpoint in [xy(t.GetStart()),xy(t.GetEnd())]:
                point=Point(endpoint)
                onpad=any(p.IsOnLayer(t.GetLayer()) and m['padshape'](p,t.GetLayer()).buffer(.0001).covers(point) for p in pads)
                joined=any(u is not t and (Point(xy(u.GetPosition())).distance(point)<.0001 if isinstance(u,k.PCB_VIA)
                    else u.GetLayer()==t.GetLayer() and LineString([xy(u.GetStart()),xy(u.GetEnd())]).distance(point)<.0001)
                    for u in tracks if u.GetNetname()=='COL2')
                if not onpad and not joined:
                    tracks.remove(t);candidates.remove(t);deleted.append(t);changed=True;break
    for t in deleted:b.Remove(t)
    (out/'core-pruned-stubs.json').write_text(json.dumps([t.m_Uuid.AsString() for t in deleted],indent=2)+'\n')
    print('Pruned COL2 stub segments:',len(deleted))
k.SaveBoard(str(a.board),b);pp.write_text(project)
