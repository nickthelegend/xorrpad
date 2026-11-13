// MIT · Copyright (c) 2026 Nivesh Gajengi
// Re-render committed public records with the actual firmware ui.h.
// Build first: make -B -C tools/uipreview
import {readFile,writeFile,mkdtemp,rm,copyFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url),out=new URL('docs/screens/v4/',root);
const records=JSON.parse(await readFile(new URL('release-pad-records.json',out),'utf8'));
const names={predict:'predict',outcome_positions:'outcome-positions',perps:'perps-positions',liq_guard:'liq-guard',tilt_state:'cooldown',flatten:'flatten',ambient:'ambient',journal:'journal'};
const work=await mkdtemp(path.join(tmpdir(),'xorr-v4-frames-')),captures=[];
try{
  for(const {id,provenance,record} of records){
    if(!/^[a-z0-9-]+$/.test(id) || !names[record.type])throw Error('Invalid public capture record');
    const input=path.join(work,'record.json');await writeFile(input,JSON.stringify(record));
    const result=spawnSync(fileURLToPath(new URL('tools/uipreview/preview',root)),[work,'2',input],{encoding:'utf8'});
    if(result.status!==0)throw Error(`Preview ${id} failed: ${result.stdout} ${result.stderr}`);
    const file=`release-pad-${id}.png`,png=await readFile(path.join(work,names[record.type]+'.png'));
    await copyFile(path.join(work,names[record.type]+'.png'),new URL(file,out));
    captures.push({file,provenance,width:png.readUInt32BE(16),height:png.readUInt32BE(20),sha256:createHash('sha256').update(png).digest('hex')});
  }
  await writeFile(new URL('release-pad-captures.json',out),JSON.stringify({renderer:'firmware/xorrpad/ui.h via native uipreview, 2x RGB565',captures},null,2)+'\n');
  console.log(`Rendered ${captures.length} native firmware frames.`);
}finally{await rm(work,{recursive:true,force:true});}
