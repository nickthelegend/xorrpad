#!/usr/bin/env python3
"""Clearance-aware geometry helpers for reserving Pro plane access.

Runs with KiCad Python, Shapely 2.0.7 and NumPy 1.26.4. No rule changes.
"""
import heapq, math, runpy
from pathlib import Path
from shapely.geometry import Point, Polygon, LineString
from shapely.ops import unary_union, polygonize
from shapely.prepared import prep
api=runpy.run_path(str(Path(__file__).with_name('route-pro.py')))
k=api['k'];v=api['v'];track=api['track'];OUT=api['OUT']
def xy(p):return k.ToMM(p.x),k.ToMM(p.y)
def polyset(ps):
    result=[]
    for i in range(ps.OutlineCount()):
        o=ps.COutline(i)
        holes=[]
        for h in range(ps.HoleCount(i)):
            ring=ps.CHole(i,h)
            holes.append([xy(ring.CPoint(j)) for j in range(ring.PointCount())])
        result.append(Polygon([xy(o.CPoint(j)) for j in range(o.PointCount())],holes))
    return result
def padshape(p,layer):
    ps=k.SHAPE_POLY_SET();p.TransformShapeToPolygon(ps,layer,0,k.FromMM(.002),k.ERROR_OUTSIDE)
    return unary_union(polyset(ps))
def via(b,net,pos):
    t=k.PCB_VIA(b);t.SetPosition(v(*pos));t.SetWidth(k.FromMM(.6));t.SetDrill(k.FromMM(.3))
    t.SetViaType(k.VIATYPE_THROUGH);t.SetLayerPair(k.F_Cu,k.B_Cu);t.SetNet(b.FindNet(net));b.Add(t)
    return t
def obstacles(b,net,layer):
    code=b.FindNet(net).GetNetCode();tr=[];vr=[]
    edges=[LineString([xy(s.GetStart()),xy(s.GetEnd())]) for s in b.GetDrawings() if s.GetLayer()==k.Edge_Cuts]
    inside=unary_union(list(polygonize(edges)))
    for f in b.GetFootprints():
        for z in f.Zones():
            if z.GetIsRuleArea():
                sh=unary_union(polyset(z.Outline()))
                tr.append(sh.buffer(.076));vr.append(sh.buffer(.301))
        for p in f.Pads():
            sh=padshape(p,k.F_Cu if p.IsOnLayer(k.F_Cu) else k.B_Cu)
            if p.GetDrillSize().x:
                vr.append(sh.buffer(.551));tr.append(sh.buffer(.326))
            elif p.GetNetCode()!=code:
                vr.append(sh.buffer(.451))
                if p.IsOnLayer(layer):tr.append(sh.buffer(.226))
            else:
                vr.append(sh.buffer(.351))  # dogbone: no via in component lands
    for t in b.GetTracks():
        if isinstance(t,k.PCB_VIA):
            sh=Point(xy(t.GetPosition())).buffer(k.ToMM(t.GetWidth(k.F_Cu))/2)
            vr.append(Point(xy(t.GetPosition())).buffer(.551))
            if t.GetNetCode()!=code:
                tr.append(sh.buffer(.226));vr.append(sh.buffer(.451))
        elif t.GetNetCode()!=code:
            sh=LineString([xy(t.GetStart()),xy(t.GetEnd())]).buffer(k.ToMM(t.GetWidth())/2)
            vr.append(sh.buffer(.451))
            if t.GetLayer()==layer:tr.append(sh.buffer(.226))
    return prep(unary_union(tr)),prep(unary_union(vr)),inside

def local_access(b,ref,pin,net='3V3'):
    pad=next(p for f in b.GetFootprints() if f.GetReference()==ref for p in f.Pads() if p.GetNumber()==pin)
    assert pad.GetNetname()==net, (ref,pin,pad.GetNetname(),net)
    start=xy(pad.GetPosition());ob,vo,inside=obstacles(b,net,pad.GetLayer())
    step=.125;todo=[(0,(0,0))];dist={(0,0):0};parent={};end=None
    def pos(n):return start[0]+n[0]*step,start[1]+n[1]*step
    while todo:
        cost,n=heapq.heappop(todo)
        if cost>dist[n]+1e-9:continue
        q=pos(n)
        if cost>.5 and not vo.intersects(Point(q)) and inside.buffer(-.81).covers(Point(q)):
            end=n;break
        if cost>8:continue
        for dx,dy in [(1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)]:
            nn=(n[0]+dx,n[1]+dy);qq=pos(nn);nc=cost+step*math.hypot(dx,dy)
            if nc>=dist.get(nn,1e9):continue
            if ob.intersects(LineString([q,qq])):continue
            if not inside.buffer(-.58).covers(Point(qq)):continue
            dist[nn]=nc;parent[nn]=n;heapq.heappush(todo,(nc,nn))
    if end is None:return dict(ref=ref,pad=pin,net=net,failed=True)
    pts=[pos(end)];n=end
    while n!=(0,0):n=parent[n];pts.append(pos(n))
    pts.reverse();pts=simplify(pts)
    via(b,net,pts[-1]);track(b,net,pts,width=.15,layer=pad.GetLayer())
    return dict(ref=ref,pad=pin,net=net,via_mm=pts[-1],path_mm=pts)

def simplify(pts):
    out=[pts[0]]
    for i in range(1,len(pts)-1):
        a,p,c=pts[i-1:i+2]
        if abs((p[0]-a[0])*(c[1]-p[1])-(p[1]-a[1])*(c[0]-p[0]))>1e-8:out.append(p)
    return out+[pts[-1]]
