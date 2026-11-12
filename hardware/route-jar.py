#!/usr/bin/env python3
"""Official local Freerouting JAR, with analytics off and OS network denial."""
import argparse, hashlib, json, subprocess, sys, time
from pathlib import Path

ROOT=Path(__file__).resolve().parent
p=argparse.ArgumentParser()
p.add_argument('--jar',required=True)
p.add_argument('--java',default='/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home/bin/java')
p.add_argument('--sku',choices=['pro','core','both'],default='both')
p.add_argument('--seconds',type=int,default=600)
p.add_argument('--passes',type=int,default=100)
p.add_argument('--version',default='1.9.0',help='Official release version for provenance')
p.add_argument('--result',type=Path,help='Separate evidence file; preserves other SKU runs')
p.add_argument('--modern',action='store_true',help='2.x headless CLI, API disabled, isolated settings')
a=p.parse_args()
if not 1<=a.seconds<=3600:p.error('seconds must be 1..3600')
if sys.platform!='darwin' or not Path('/usr/bin/sandbox-exec').exists():
    p.error('macOS deny-network sandbox required; no unsandboxed fallback')
jar=Path(a.jar).resolve();out=ROOT/'generated';results=[]
java_version=subprocess.run([a.java,'-version'],capture_output=True,text=True,check=True).stderr.strip()
for sku in (['pro','core'] if a.sku=='both' else [a.sku]):
    dsn=out/f'{sku}.dsn';ses=out/f'{sku}.ses'
    if ses.exists():raise RuntimeError(f'Preserve previous derived session before retry: {ses}')
    cmd=['/usr/bin/sandbox-exec','-p','(version 1) (allow default) (deny network*)',a.java,
         '-Xmx2048m','-jar',str(jar),'-de',str(dsn),'-do',str(ses),'-mp',str(a.passes),
         '-mt','0','-da','-dl','-dct','0']
    if a.modern:
        cmd += ['--gui.enabled=false','--api_server.enabled=false',
                '--router.layers.routable=true,false,false,true',
                '--user_data_path=/tmp/xorrpad-p1-tools/freerouting-config']
    reason='';start=time.monotonic()
    with (out/f'{sku}-jar.log').open('w') as log:
        child=subprocess.Popen(cmd,stdout=log,stderr=subprocess.STDOUT,cwd=out)
        print(f'{sku}: JAR PID {child.pid}',flush=True)
        try:child.wait(timeout=a.seconds)
        except subprocess.TimeoutExpired:reason=f'{a.seconds}-second bound reached'
        finally:
            if child.poll() is None:
                child.terminate()
                try:child.wait(timeout=5)
                except subprocess.TimeoutExpired:child.kill();child.wait()
    if child.returncode and not reason:reason=f'JAR exited {child.returncode}'
    if not ses.exists() and not reason:reason='JAR exited without a session'
    results.append(dict(sku=sku,read_date=time.strftime('%Y-%m-%d'),router=f'Freerouting official {a.version} JAR',
        jar_sha256=hashlib.sha256(jar.read_bytes()).hexdigest(),java_version=java_version,
        network='OS sandbox denies network*',pid=child.pid,command=cmd,
        dsn_sha256=hashlib.sha256(dsn.read_bytes()).hexdigest(),elapsed_seconds=round(time.monotonic()-start,3),
        exit_code=child.returncode,stop_reason=reason,session_created=ses.exists()))
    print(results[-1],flush=True)
(a.result or out/'jar-routing-result.json').write_text(json.dumps(results,indent=2)+'\n')
raise SystemExit(0 if all(r['exit_code']==0 and r['session_created'] for r in results) else 1)
