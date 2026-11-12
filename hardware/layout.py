#!/usr/bin/env python3
"""Create local KiCad placement drafts and Specctra inputs, without uploading.

Run with KiCad's bundled Python (pcbnew). Coordinates are design proposals.
The switch/encoder centers follow cad/partlib.py; PCB mounting and all electronics
placement remain unreviewed. NOT production-ready.
"""
import csv
import json
import os
from pathlib import Path
import wx
import pcbnew as pcb
app = wx.App(False)

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "generated"
LIB = Path(os.environ.get("KICAD_FOOTPRINT_DIR", "/Applications/KiCad/KiCad.app/Contents/SharedSupport/footprints"))
def vec(x,y):return pcb.VECTOR2I(pcb.FromMM(x),pcb.FromMM(y))


def draft_fpc():
    # Pitch/count from EastRising Rev2.1. Pad length, shell and anchor dimensions
    # are explicitly ASSUMPTIONS, not a manufacturer land pattern. Replace in DVT.
    f=pcb.FOOTPRINT(None)
    f.SetFPID(pcb.LIB_ID("Xorrpad","ER-CON50HT-1_DRAFT"))
    for i in range(50):
        p=pcb.PAD(f);p.SetNumber(str(i+1));p.SetAttribute(pcb.PAD_ATTRIB_SMD)
        p.SetShape(pcb.PAD_SHAPE_RECT);p.SetSize(vec(.30,1.6));p.SetPosition(vec((i-24.5)*.5,0))
        layers=pcb.LSET()
        for layer in [pcb.F_Cu,pcb.F_Paste,pcb.F_Mask]:layers.AddLayer(layer)
        p.SetLayerSet(layers);f.Add(p)
    pcb.FootprintSave(str(ROOT/"Xorrpad.pretty"),f)


def build(sku):
    parts=json.loads((OUT/f"{sku}-parts.json").read_text())
    b=pcb.BOARD();b.SetCopperLayerCount(2)
    nets={}
    for name in sorted({n for p in parts for n in p["pins"].values()}):
        n=pcb.NETINFO_ITEM(b,name,len(nets)+1);b.Add(n);nets[name]=n
    for a,z in [((100,100),(184,100)),((184,100),(184,184)),((184,184),(100,184)),((100,184),(100,100))]:
        e=pcb.PCB_SHAPE();e.SetShape(pcb.SHAPE_T_SEGMENT);e.SetStart(vec(*a));e.SetEnd(vec(*z));e.SetLayer(pcb.Edge_Cuts);e.SetWidth(pcb.FromMM(.05));b.Add(e)
    # Physical centers in approved CAD: 19.05mm pitch, centered MIC, top-left knob.
    x=[113.425,132.475,151.525,170.575];y=x
    centers=[(x[1],y[0]),(x[2],y[0]),(x[3],y[0]),
             (x[0],y[1]),(x[1],y[1]),(x[2],y[1]),(x[3],y[1]),
             (x[0],y[2]),(x[1],y[2]),(x[2],y[2]),(x[3],y[2]),
             (x[0],y[3]),(142,y[3]),(x[3],y[3])]
    fixed={"ENC1":(x[0],y[0]),"J1":(142,104),"U1":(143,121),"U2":(133,104),
           "U3":(163,105),"L1":(169,105),"U4":(177,106),"U5":(179,153),
           "U6":(179,163),"U8":(124,103),"J2":(178,177),"J3":(155,178),
           "Q1":(174,177),"SW15":(104,179),"SW16":(111,179)}
    csv_rows=[]
    for i,p in enumerate(parts):
        lib,name=p["footprint"].split(":")
        path=ROOT/"Xorrpad.pretty" if lib=="Xorrpad" else LIB/f"{lib}.pretty"
        fp=pcb.FootprintLoad(str(path),name)
        if fp is None:raise ValueError(f"Missing footprint {p['footprint']}; no substituted geometry")
        fp.SetReference(p["ref"]);fp.SetValue(p["mpn"])
        ref=p["ref"]
        if ref.startswith("SW") and ref[2:].isdigit() and int(ref[2:])<=14:
            xy=centers[int(ref[2:])-1]
        elif ref.startswith("D") and ref[1:].isdigit():
            a,z=centers[int(ref[1:])-1];xy=(a+7,z+5)
        elif ref.startswith("LED"):
            k=int(ref[3:]);a,z=centers[k-2] if k>1 else (105,109);xy=(a,z-5)
        else:xy=fixed.get(ref,(104+(i%18)*4.1,118+(i//18)*12))
        fp.SetPosition(vec(*xy))
        if ref == "J1":fp.SetOrientationDegrees(180)
        b.Add(fp)
        # Sockets below the plate; electronics above the board except socket lands.
        if ref.startswith("SW") and ref[2:].isdigit() and int(ref[2:])<=14:fp.Flip(fp.GetPosition(),False)
        for pad in fp.Pads():
            n=p["pins"].get(pad.GetNumber())
            if n:pad.SetNet(nets[n])
        csv_rows.append([ref,f"{xy[0]-100:.4f}mm",f"{184-xy[1]:.4f}mm",'B' if fp.IsFlipped() else 'T',f"{fp.GetOrientationDegrees():.3f}"])
    for x0 in [103,181]:
        for y0 in [103,181]:
            f=pcb.FootprintLoad(str(LIB/'MountingHole.pretty'),'MountingHole_2.2mm_M2')
            f.SetReference(f"H{int(x0==181)*2+int(y0==181)+1}");f.SetPosition(vec(x0,y0));b.Add(f)
    label=pcb.PCB_TEXT(b);label.SetText(f"XORRPAD {sku.upper()} DRAFT - DO NOT ORDER")
    label.SetPosition(vec(142,182));label.SetTextSize(vec(.8,.8));label.SetLayer(pcb.F_SilkS);b.Add(label)
    pcb.SaveBoard(str(OUT/f"{sku}-placement.kicad_pcb"),b)
    if not pcb.ExportSpecctraDSN(b,str(OUT/f"{sku}.dsn")):raise RuntimeError("DSN export failed")
    with (OUT/f"{sku}-cpl.csv").open('w',newline='') as f:
        w=csv.writer(f,lineterminator="\n");w.writerow(['Designator','Mid X','Mid Y','Layer','Rotation']);w.writerows(csv_rows)
    grouped={}
    for p in parts:grouped.setdefault((p['mpn'],p['footprint'],p['lcsc']),[]).append(p['ref'])
    with (OUT/f"{sku}-jlc-bom.csv").open('w',newline='') as f:
        w=csv.writer(f,lineterminator="\n");w.writerow(['Comment','Designator','Footprint','LCSC Part #'])
        for (mpn,fp,lcsc),refs in sorted(grouped.items()):w.writerow([mpn,','.join(refs),fp,lcsc])
    print(f"{sku}: placement, DSN, BOM and CPL exported; NOT order-ready")


if __name__=='__main__':
    draft_fpc()
    for sku in ['pro','core']:build(sku)
