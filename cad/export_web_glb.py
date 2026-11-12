"""Export unaltered parametric CAD with photo materials, named pivots and live TFT UVs.
Run after assembly.py. Units remain mm, X right/Y back/Z up; viewers rotate -pi/2 X.
"""
from pathlib import Path
import json, struct, tempfile, subprocess, math, base64
import numpy as np
import partlib as pl
import assembly, part_display
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'desk/app/public/models'
CLI=ROOT/'tools/render3d/node_modules/.bin/gltf-transform'
# Logical desk slots mapped to their physical CAD parts. Positions never move.
KEYS=['momentum','grid','dca','risk','yield','rebalance','no','yes','buy','base','kill','mic','sell','portfolio']
# Photo observation by physical CAD position, not by action semantics.
CAPS={'dca':'#24232b','grid':'#8852c0','momentum':'#24232b','rebalance':'#24232b','yield':'#e34936','risk':'#326dd1','base':'#24232b','buy':'#df56b3','sell':'#ece9e5','yes':'#ece9e5','no':'#ece9e5','portfolio':'#ece9e5','mic':'#ece9e5','kill':'#ece9e5'}

def unpack(path):
 b=path.read_bytes(); n=struct.unpack_from('<I',b,12)[0]
 return json.loads(b[20:20+n]),b[28+n:]
def pack(path,g,b):
 g['buffers'][0]['byteLength']=len(b); j=json.dumps(g,separators=(',',':')).encode();j+=b' '*(-len(j)%4);b+=b'\0'*(-len(b)%4)
 path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(b))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(b),0x004e4942)+b)

def export(exploded,tmp):
 items=[]; pod=part_display.Pod('tft28_spi')
 for group,parts in assembly.build_groups()+[('display',pod.build())]:
  dz=({'tray':0,'plate':20,'caps':40,'knob':52,'display':65}.get(group,0) if exploded else 0)
  for name,mesh,color in parts:
   color=CAPS.get(name, '#181923' if name.endswith('-legend') else '#2339b9' if group in ['tray','display'] else '#151b24' if group=='plate' else '#292b36')
   items.append((name,mesh.copy().translate(dz=dz),color))
 # The only added geometry is the LCD's active glass, located from Pod's exact face basis.
 u0=pod.U_WIN_C-pod.m['aa_u']/2;u1=pod.U_WIN_C+pod.m['aa_u']/2
 x0=pod.WX_C-pod.m['aa_x']/2;x1=pod.WX_C+pod.m['aa_x']/2
 screen=pl.Mesh(); dz=65 if exploded else 0
 screen.V=[(x,*pod.p(u,-0.12)) for x,u in [(x0,u0),(x1,u0),(x1,u1),(x0,u1)]]
 screen.V=[(x,y,z+dz) for x,y,z in screen.V]; screen.F=[(0,1,2),(0,2,3)]
 items.append(('screen',screen,'#ffffff'))
 raw=tmp/'raw.glb';pl.glb_write(raw,items);g,blob=unpack(raw);blob=bytearray(blob)
 roots=[]; groups={}
 layout={k['id']:k for k in pl.key_layout()}
 for i,(name,mesh,col) in enumerate(items):
  node=g['nodes'][i]; mat=g['materials'][i];pbr=mat['pbrMetallicRoughness']
  pbr.update(metallicFactor=.02,roughnessFactor=.68 if name in ['tray','display-pod-28','display-cap-28'] else .38)
  if name=='screen':
   uv=np.array([[0,1],[1,1],[1,0],[0,1],[1,0],[0,0]],dtype=np.float32)
   offset=len(blob);blob+=uv.tobytes();g['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':uv.nbytes,'target':34962});g['accessors'].append({'bufferView':len(g['bufferViews'])-1,'componentType':5126,'count':6,'type':'VEC2'})
   g['meshes'][i]['primitives'][0]['attributes']['TEXCOORD_0']=len(g['accessors'])-1
   g['meshes'][i]['name']='Screen';mat['name']='Screen';mat['emissiveFactor']=[1,1,1];pbr['baseColorFactor']=[0,0,0,1];pbr['roughnessFactor']=.9
   # Real texture slot, compressed to WebP by the CLI. Replaced with live firmware pixels in app.
   png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')
   g['images']=[{'uri':'data:image/png;base64,'+base64.b64encode(png).decode(),'name':'Screen-placeholder'}];g['textures']=[{'source':0}];mat['emissiveTexture']={'index':0}
  canonical=name.removesuffix('-legend')
  if canonical in KEYS:
   if canonical not in groups:
    key=layout[canonical];pivot=[key['x'],key['y'],pl.CAP_Z0+(40 if exploded else 0)]
    group={'name':f'key-{KEYS.index(canonical)+1:02d}','translation':pivot,'children':[],'extras':{'action':canonical,'photoColor':CAPS[canonical]}}
    groups[canonical]=len(g['nodes']);g['nodes'].append(group);roots.append(groups[canonical])
   parent=g['nodes'][groups[canonical]];parent['children'].append(i);node['translation']=[-v for v in parent['translation']]
  elif name=='knob':
   pivot=[*pl.KNOB_POS,pl.KNOB_Z0+(52 if exploded else 0)]
   group={'name':'knob','translation':pivot,'children':[i]};node['name']='knob-body';node['translation']=[-v for v in pivot];roots.append(len(g['nodes']));g['nodes'].append(group)
  else: roots.append(i)
 g['scenes'][0]['nodes']=roots;g['asset']['generator']='xorrpad real parametric CAD / export_web_glb.py'
 g['extras']={'source':'cad/assembly.py + part_display.Pod(tft28_spi)','units':'mm','photo':'docs/pad.jpg','keySlotActions':KEYS,'geometryAltered':False}
 pack(raw,g,bytes(blob))
 meshopt=tmp/'meshopt.glb';out=OUT/('xorrpad-exploded.glb' if exploded else 'xorrpad.glb')
 subprocess.run([str(CLI),'webp',str(raw),str(meshopt)],check=True)
 subprocess.run([str(CLI),'meshopt',str(meshopt),str(out),'--level','medium'],check=True)
 assert out.stat().st_size < 3*1024*1024
 print(out.relative_to(ROOT),out.stat().st_size,'bytes')


def export_layout():
 camera=np.array([170.,155.,230.]);target=np.array([0.,43.,-10.]);forward=target-camera;forward/=np.linalg.norm(forward);right=np.cross(forward,[0,1,0]);right/=np.linalg.norm(right);up=np.cross(right,forward)
 def uv(point):
  v=np.array(point)-camera;depth=np.dot(v,forward);f=math.tan(math.radians(34)/2)
  return [(np.dot(v,right)/(depth*f*(4/3))+1)/2,(1-np.dot(v,up)/(depth*f))/2]
 by={k['id']:k for k in pl.key_layout()};keys=[]
 for i,action in enumerate(KEYS):
  k=by[action];point=[k['x'],pl.CAP_Z0+7.5,-k['y']];keys.append({'name':f'key-{i+1:02d}','action':action,'point':point,'posterUV':uv(point)})
 knob=[pl.KNOB_POS[0],pl.KNOB_Z0+10,-pl.KNOB_POS[1]]
 (OUT/'xorrpad-layout.json').write_text(json.dumps({'camera':camera.tolist(),'target':target.tolist(),'posterAspect':4/3,'keys':keys,'knob':knob,'knobUV':uv(knob)},indent=2)+'\n')

if __name__=='__main__':
 OUT.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='xorr-cad-') as d:
  for exploded in [False,True]: export(exploded,Path(d))
 export_layout()
