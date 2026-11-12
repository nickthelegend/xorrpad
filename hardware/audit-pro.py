#!/usr/bin/env python3
"""Record final local P1 DRC and board invariants; regenerate Pro CPL."""
import collections,csv,hashlib,heapq,itertools,json,math,runpy,sys
from pathlib import Path
from shapely.geometry import LineString,Point
from shapely.ops import unary_union
m=runpy.run_path(str(Path(__file__).with_name('routing-geometry.py')))
k=m['k'];OUT=m['OUT'];xy=m['xy'];padshape=m['padshape']
b=k.LoadBoard(str(OUT/'pro.kicad_pcb'))
sys.path.insert(0,str(OUT.parent.parent/'cad'))
import partlib as cad
report=json.loads((OUT/'pro-p1-drc.json').read_text())
errors=[v for v in report['violations'] if v['severity']=='error']
warnings=[v for v in report['violations'] if v['severity']=='warning']
fp={f.GetReference():f for f in b.GetFootprints()}
key_errors=[]
for i,c in enumerate(cad.key_layout(),1):
    expected=(142+c['x'],142-c['y']);actual=xy(fp[f'SW{i}'].GetPosition())
    if math.dist(expected,actual)>.00001:key_errors.append(dict(ref=f'SW{i}',expected=expected,actual=actual))

def usb(net,connector_pin,mcu_pin):
    # Split every trace intersection before graph search; pads and vias join
    # copper paths electrically, including connector duplicate contacts.
    tracks=[t for t in b.GetTracks() if t.GetNetname()==net and not isinstance(t,k.PCB_VIA)]
    graph=collections.defaultdict(list)
    def node(layer,point):return (layer,round(point[0],4),round(point[1],4))
    def edge(a,c,d):graph[a].append((c,d));graph[c].append((a,d))
    for layer in [k.F_Cu,k.B_Cu]:
        lines=[LineString([xy(t.GetStart()),xy(t.GetEnd())]) for t in tracks if t.GetLayer()==layer]
        if not lines:continue
        merged=unary_union(lines)
        for line in getattr(merged,'geoms',[merged]):
            coords=list(line.coords)
            for a,c in zip(coords,coords[1:]):edge(node(layer,a),node(layer,c),math.dist(a,c))
    for t in b.GetTracks():
        if isinstance(t,k.PCB_VIA) and t.GetNetname()==net:
            edge(node(k.F_Cu,xy(t.GetPosition())),node(k.B_Cu,xy(t.GetPosition())),1.6)
    pads=[(f,p) for f in b.GetFootprints() for p in f.Pads() if p.GetNetname()==net]
    for f,p in pads:
        pn=(f.GetReference(),p.GetNumber())
        for layer in [k.F_Cu,k.B_Cu]:
            if not p.IsOnLayer(layer):continue
            sh=padshape(p,layer).buffer(.001)
            for n in list(graph):
                if isinstance(n[0],int) and n[0]==layer and sh.covers(Point(n[1:])):edge(pn,n,0)
    start=('J1',connector_pin);goal=('U1',mcu_pin);seq=itertools.count();todo=[(0,next(seq),start)];dist={start:0}
    while todo:
        d,_,n=heapq.heappop(todo)
        if d>dist[n]+1e-8:continue
        if n==goal:break
        for c,w in graph[n]:
            nd=d+w
            if nd<dist.get(c,1e9):dist[c]=nd;heapq.heappush(todo,(nd,next(seq),c))
    return dict(shortest_pad_to_pad_mm=dist.get(goal),total_copper_trace_mm=sum(k.ToMM(t.GetLength()) for t in tracks),
                vias=sum(isinstance(t,k.PCB_VIA) and t.GetNetname()==net for t in b.GetTracks()),
                widths_mm=sorted(set(round(k.ToMM(t.GetWidth()),4) for t in tracks)))

usb_data={pin:usb(net,pin,mp) for net,pin,mp in [('USB_DP','A6','14'),('USB_DP','B6','14'),('USB_DN','A7','13'),('USB_DN','B7','13')]}
counts=collections.Counter(t.GetLayerName() for t in b.GetTracks() if not isinstance(t,k.PCB_VIA))
decoupling=json.loads((OUT/'pro-decoupling.json').read_text())
for row in decoupling:
    cp=next(p for p in fp[row['capacitor']].Pads() if p.GetNumber()=='1')
    ip=next(p for p in fp[row['IC']].Pads() if p.GetNumber()==row['power_pin'])
    row['pad_distance_mm']=round(math.dist(xy(cp.GetPosition()),xy(ip.GetPosition())),3)
(OUT/'pro-decoupling.json').write_text(json.dumps(decoupling,indent=2)+'\n')
with (OUT/'pro-cpl.csv').open('w',newline='') as stream:
    w=csv.writer(stream,lineterminator='\n');w.writerow(['Designator','Mid X','Mid Y','Layer','Rotation'])
    for ref,f in sorted(fp.items()):
        x,y=xy(f.GetPosition());w.writerow([ref,f'{x-100:.4f}mm',f'{184-y:.4f}mm','B' if f.IsFlipped() else 'T',f.GetOrientationDegrees()])
result=dict(scope='Pro P1 only; local draft; human PCB review required before any order',
    baseline=dict(errors=0,warnings=0,unconnected=207),
    final=dict(errors=len(errors),warnings=len(warnings),unconnected=len(report['unconnected_items'])),
    board_sha256=hashlib.sha256((OUT/'pro.kicad_pcb').read_bytes()).hexdigest(),
    drc_sha256=hashlib.sha256((OUT/'pro-p1-drc.json').read_bytes()).hexdigest(),
    copper_layers=b.GetCopperLayerCount(),signal_tracks_by_layer=dict(counts),
    key_centre_discrepancies=key_errors,usb=usb_data,
    ground_stitching_vias_added=json.loads((OUT/'pro-stitching.json').read_text())['added_count'],
    warnings=warnings,
    drc_exclusions=json.loads((OUT/'pro.kicad_pro').read_text())['board']['design_settings']['drc_exclusions'])
(OUT/'pro-p1-summary.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
assert not errors and not report['unconnected_items'] and not key_errors
assert b.GetCopperLayerCount()==4 and not counts.get('In1.Cu') and not counts.get('In2.Cu')
