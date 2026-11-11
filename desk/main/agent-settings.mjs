import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { appDataDir } from './permissions.mjs';
import { providerConfig } from './llm.mjs';
import { DEFAULT_PERSONA } from './persona.mjs';
export class AgentSettings {
  constructor({dir=appDataDir()}={}) { this.file=path.join(dir,'agent-settings.json'); }
  read() {
    try { const saved=JSON.parse(readFileSync(this.file,'utf8')); return {...providerConfig(saved),persona:saved.persona ?? DEFAULT_PERSONA}; }
    catch (e) { if (e.code === 'ENOENT') return {...providerConfig(),persona:DEFAULT_PERSONA}; throw e; }
  }
  update(input) {
    if (Object.keys(input).some(k => !['provider','baseUrl','model','persona','resetPersona'].includes(k))) throw new Error('invalid settings field');
    const current=this.read();
    const persona=input.resetPersona ? DEFAULT_PERSONA : input.persona ?? current.persona;
    if (typeof persona !== 'string' || !persona.trim() || persona.length>8000) throw new Error('invalid persona');
    const value = {...providerConfig({...current,...input}),persona};
    mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});
    writeFileSync(this.file+'.tmp',JSON.stringify(value)+'\n',{mode:0o600}); renameSync(this.file+'.tmp',this.file);
    return value;
  }
}
