#!/usr/bin/env python3
"""Bounded local-only Freerouting attempt. Never calls the hosted routing API."""
import argparse
import hashlib
import json
import subprocess
import tempfile
import time
from pathlib import Path

ROOT=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--router',required=True,help='Local Freerouting CLI v2.5.0 executable')
parser.add_argument('--seconds',type=int,default=20,help='Bound per SKU, in seconds')
args=parser.parse_args()
if not 1<=args.seconds<=60:parser.error('seconds must be 1..60')
exe=Path(args.router).resolve()
results=[]
for sku in ['pro','core']:
    out=ROOT/'generated';dsn=out/f'{sku}.dsn';session=out/f'{sku}.ses'
    if session.exists():raise RuntimeError(f'Refusing to overwrite {session}; preserve prior routing evidence')
    logpath=out/f'{sku}-router.log'
    with tempfile.TemporaryDirectory(prefix=f'xorrpad-{sku}-router-') as state, logpath.open('w') as log:
        cmd=[str(exe),'-de',str(dsn),'-do',str(session),'--router.autorouter.max_passes=2',
             '-mt','1','-da','--gui.enabled=false','--api_server.enabled=false',f'--user_data_path={state}']
        p=subprocess.Popen(cmd,stdout=log,stderr=subprocess.STDOUT)
        print(f'{sku}: router PID {p.pid}',flush=True)
        deadline=time.monotonic()+args.seconds;reason=''
        try:
            while p.poll() is None:
                if 'UnsupportedFeatureError' in logpath.read_text():
                    reason='native SerializationConstructorAccessor UnsupportedFeatureError';break
                if time.monotonic()>=deadline:
                    reason=f'{args.seconds}-second bound reached';break
                time.sleep(.2)
        finally:
            if p.poll() is None:
                p.terminate()  # Exact child PID, never a process-name kill.
                try:p.wait(timeout=3)
                except subprocess.TimeoutExpired:p.kill();p.wait()
        if not reason and p.returncode:reason=f'router exited {p.returncode}; see log'
    results.append({'sku':sku,'read_date':time.strftime('%Y-%m-%d'),
                    'router':'Freerouting CLI v2.5.0 macos-arm64','pid':p.pid,
                    'command':cmd[:-1], 'dsn_sha256':hashlib.sha256(dsn.read_bytes()).hexdigest(),
                    'exit_code':p.returncode,'stop_reason':reason,'session_created':session.exists()})
    print(f'{sku}: exit {p.returncode}; session={session.exists()}; {reason}',flush=True)
(ROOT/'generated/routing-result.json').write_text(json.dumps(results,indent=2)+'\n')
# Failure is deliberately visible to an automated build.
raise SystemExit(0 if all(r['exit_code']==0 and r['session_created'] for r in results) else 1)
