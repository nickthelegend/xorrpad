import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { appDataDir } from './permissions.mjs';
import { providerConfig } from './llm.mjs';
export class AgentSettings {
  constructor({dir=appDataDir()}={}) { this.file=path.join(dir,'agent-settings.json'); }
  read() {
    try { return providerConfig(JSON.parse(readFileSync(this.file,'utf8'))); }
    catch (e) { if (e.code === 'ENOENT') return providerConfig(); throw e; }
  }
  update(input) {
    if (Object.keys(input).some(k => !['provider','baseUrl','model'].includes(k))) throw new Error('invalid settings field');
    const value = providerConfig(input);
    mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});
    writeFileSync(this.file+'.tmp',JSON.stringify(value)+'\n',{mode:0o600}); renameSync(this.file+'.tmp',this.file);
    return value;
  }
}
