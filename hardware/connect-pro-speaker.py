#!/usr/bin/env python3
"""Finish SPK_N with a two-layer search and explicit 0.6/0.3 mm vias.

The former single-layer searches could not cross the closed copper corridors.
This search permits layer transitions only where a through via is legal.
"""
import heapq,json,math,runpy,time
from pathlib import Path
from shapely.geometry import Point,LineString
from shapely.prepared import prep
m=runpy.run_path(str(Path(__file__).with_name('routing-geometry.py')))
k=m['k'];out=m['OUT'];xy=m['xy'];net='SPK_N'
b=k.LoadBoard(str(out/'pro.kicad_pcb'));project=(out/'pro.kicad_pro').read_text()
revision=json.loads((out/'pro-local-revision.json').read_text())
start=revision[-1]['access']['via_mm']
end=xy(next(p for f in b.GetFootprints() if f.GetReference()=='J2' for p in f.Pads() if p.GetNumber()=='2').GetPosition())
layers=[k.F_Cu,k.B_Cu]
ob=[];vo=None;inside=None
for layer in layers:
    o,vo,inside=m['obstacles'](b,net,layer);ob.append(o)
safe=prep(inside.buffer(-.81));step=.125
def pos(n):return start[0]+step*n[1],start[1]+step*n[2]
todo=[];dist={};parent={}
for layer in [0,1]:
    n=(layer,0,0);dist[n]=0;heapq.heappush(todo,(math.dist(start,end),0,n))
goal=None;began=time.monotonic()
while todo:
    _,cost,n=heapq.heappop(todo)
    if cost>dist[n]+1e-9:continue
    layer=n[0];p=pos(n)
    if math.dist(p,end)<.25 and not ob[layer].intersects(LineString([p,end])):goal=n;break
    options=[]
    for dx,dy in [(1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)]:
        nn=(layer,n[1]+dx,n[2]+dy);q=pos(nn)
        if safe.covers(Point(q)) and not ob[layer].intersects(LineString([p,q])):
            options.append((nn,step*math.hypot(dx,dy)))
    if not vo.intersects(Point(p)):
        options.append(((1-layer,n[1],n[2]),3))
    for nn,increment in options:
        nc=cost+increment
        if nc>=dist.get(nn,1e9):continue
        dist[nn]=nc;parent[nn]=n;heapq.heappush(todo,(nc+math.dist(pos(nn),end),nc,nn))
    if time.monotonic()-began>120:raise RuntimeError(f'Bound reached: {len(dist)} search nodes')
assert goal is not None,f'No two-layer route; {len(dist)} nodes'
nodes=[goal]
while nodes[-1] in parent:nodes.append(parent[nodes[-1]])
nodes.reverse();chunks=[];vias=[];points=[pos(nodes[0])];layer=nodes[0][0]
for n in nodes[1:]:
    if n[0]!=layer:
        if len(points)>1:chunks.append((layer,m['simplify'](points)))
        vias.append(pos(n));m['via'](b,net,pos(n));layer=n[0];points=[pos(n)]
    else:points.append(pos(n))
points.append(end);chunks.append((layer,m['simplify'](points)))
for layer,points in chunks:m['track'](b,net,points,width=.15,layer=layers[layer])
k.SaveBoard(str(out/'pro.kicad_pcb'),b);(out/'pro.kicad_pro').write_text(project)
result=dict(net=net,nodes_searched=len(dist),elapsed_seconds=round(time.monotonic()-began,3),
            added_vias_mm=vias,paths=[dict(layer=k.LayerName(layers[layer]),points_mm=p) for layer,p in chunks])
(out/'pro-speaker-connection.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
