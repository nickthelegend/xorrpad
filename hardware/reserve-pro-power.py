#!/usr/bin/env python3
"""Reserve actual GND/3V3 plane access before the official autorouter."""
import argparse,json,runpy
from pathlib import Path
m=runpy.run_path(str(Path(__file__).with_name('routing-geometry.py')))
k=m['k'];OUT=m['OUT'];track=m['track'];xy=m['xy'];access=m['local_access']
p=argparse.ArgumentParser();p.add_argument('--sku',choices=['pro','core'],default='pro');a=p.parse_args();sku=a.sku
b=k.LoadBoard(str(OUT/f'{sku}-route-input.kicad_pcb'))
project=(OUT/f'{sku}-route-input.kicad_pro').read_text()
# Adjacent equal-net FPC lands share a short copper bus and one access via.
for net,ends in [('GND',[(141.75,103),(152.25,103)]),
                 ('GND',[(160.25,103),(161.25,103)]),
                 ('3V3',[(139.75,103),(140.75,103)]),
                 ('3V3',[(156.25,103),(157.25,103)])]:
    if sku=='pro':track(b,net,ends,width=.15,locked=True)
result=[];seen=set()
for net in ['3V3','GND']:
    for f in sorted(b.GetFootprints(),key=lambda f:f.GetReference()):
        for p in f.Pads():
            if p.GetNetname()!=net or p.GetDrillSize().x:continue
            if any(q.GetNumber()==p.GetNumber() and q.GetDrillSize().x for q in f.Pads()):continue
            if f.GetReference()=='J3' and p.GetNumber() not in ['6','7','11','35','40','43','48']:continue
            pos=xy(p.GetPosition())
            if (net,pos) in seen:continue
            seen.add((net,pos))
            r=access(b,f.GetReference(),p.GetNumber(),net);result.append(r);print(r,flush=True)
for t in b.GetTracks():t.SetLocked(True)
k.SaveBoard(str(OUT/f'{sku}-route-input.kicad_pcb'),b)
(OUT/f'{sku}-route-input.kicad_pro').write_text(project)
(OUT/f'{sku}-reserved-power.json').write_text(json.dumps(result,indent=2)+'\n')
