/** Atomic, private conversation files. Only server-produced messages are appended. */
import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { appDataDir } from './permissions.mjs';
export class Chats {
  busy = new Set();
  constructor({dir=appDataDir()}={}) { this.dir=path.join(dir,'chats'); }
  file(id) {
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw Object.assign(new Error('chat not found'),{status:404});
    return path.join(this.dir,id+'.json');
  }
  get(id) {
    try {return JSON.parse(readFileSync(this.file(id),'utf8'));}
    catch(e) {if (e.code === 'ENOENT') throw Object.assign(new Error('chat not found'),{status:404}); throw e;}
  }
  save(chat) {
    if (JSON.stringify(chat).length>10*1024*1024) throw new Error('chat is full; start a new conversation');
    mkdirSync(this.dir,{recursive:true,mode:0o700});
    const file=this.file(chat.id); chat.updatedAt=new Date().toISOString();
    writeFileSync(file+'.tmp',JSON.stringify(chat)+'\n',{mode:0o600}); renameSync(file+'.tmp',file); return chat;
  }
  create({title='New conversation',model='',provider='ollama'}={}) {
    this.validateTitle(title);
    const at=new Date().toISOString(); return this.save({id:randomUUID(),title,model,provider,createdAt:at,updatedAt:at,messages:[]});
  }
  validateTitle(title) {if (typeof title !== 'string' || !title.trim() || title.length>200) throw Object.assign(new Error('invalid chat title'),{status:400});}
  list(search='') {
    let names; try {names=readdirSync(this.dir);} catch(e) {if(e.code==='ENOENT')return [];throw e;}
    const q=String(search).toLowerCase();
    return names.filter(n => /^[a-f0-9-]{36}\.json$/.test(n)).map(n => this.get(n.slice(0,-5)))
      .filter(c => !q || c.title.toLowerCase().includes(q) || c.messages.some(m => JSON.stringify(m).toLowerCase().includes(q)))
      .sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).map(({messages,...c}) => ({...c,messageCount:messages.length}));
  }
  rename(id,title) {this.idle(id);this.validateTitle(title);return this.save({...this.get(id),title});}
  delete(id) {this.idle(id);this.get(id);unlinkSync(this.file(id));}
  idle(id) {if (this.busy.has(id)) throw Object.assign(new Error('chat is answering; try again after the reply'),{status:409});}
  append(id,message) {
    const chat=this.get(id); chat.messages.push({...message,at:new Date().toISOString()});
    if (message.model) chat.model=message.model;
    if (message.provider) chat.provider=message.provider;
    return this.save(chat);
  }
  async turn(id,fn) {
    this.idle(id); this.get(id); this.busy.add(id);
    try {
      // Recover a tool/result pair if a process was stopped between persistence and execution.
      const chat=this.get(id);
      const answered=new Set(chat.messages.filter(m => m.role==='tool').map(m => m.toolCallId));
      for (const m of chat.messages) for (const c of m.toolCalls || []) if (!answered.has(c.id))
        this.append(id,{role:'tool',name:c.name,toolCallId:c.id,content:JSON.stringify({error:'turn interrupted; inspect signal status before proposing again'})});
      return await fn(this.get(id));
    } finally {this.busy.delete(id);}
  }
  markdown(id) {
    const c=this.get(id), lines=[`# ${c.title.replace(/[\r\n]/g,' ')}`,'',`Model: ${c.provider} / ${c.model}`,''];
    for(const m of c.messages) {
      lines.push(`## ${m.role}${m.name?' · '+m.name:''}`, '', m.content || '', '');
      for(const t of m.toolCalls || []) lines.push(`Tool: ${t.name} (${t.id})`,'',JSON.stringify(t.arguments,null,2),'');
    }
    return lines.join('\n');
  }
}
