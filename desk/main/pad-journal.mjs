// MIT · Copyright (c) 2026 Nivesh Gajengi
export function journalEntry(value){
 const lengths={id:128,action:32,market:96,size:48,venue:32,result:16,signature:96,reason:192};
 if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).sort().join(',')!==[...Object.keys(lengths),'time'].sort().join(','))throw Error('invalid journal entry');
 for(const [k,max] of Object.entries(lengths))if(typeof value[k]!=='string' || Buffer.byteLength(value[k])>max)throw Error('invalid journal text');
 if(!value.id || !Number.isSafeInteger(value.time) || (value.time!==0 && (value.time<1700000000 || value.time>4102444800)) ||
  !['awaiting','accepted','signed','filled','refused','expired','failed','blocked'].includes(value.result) || (value.result==='filled' && !value.signature))throw Error('invalid journal result');
 return structuredClone(value);
}
/** Bounded staged snapshots prevent a reconnect or partial transfer mixing histories. */
export function journalRecord(peer,message){
 const m=message;
 if(!Number.isInteger(m.revision) || m.revision<0 || m.revision>0xffffffff)throw Error('invalid journal revision');
 if(m.type==='journal_begin'){
  if(!Number.isInteger(m.count) || m.count<0 || m.count>32 || typeof m.healthy!=='boolean')throw Error('invalid journal snapshot');
  peer.journalSync={revision:m.revision,count:m.count,healthy:m.healthy,entries:[]};return null;
 }
 const s=peer.journalSync;if(!s || s.revision!==m.revision)throw Error('journal snapshot changed');
 if(m.type==='journal_entry'){
  if(!Number.isInteger(m.index) || m.index!==s.entries.length || m.index>=s.count)throw Error('invalid journal index');
  const entry=journalEntry(m.entry);if(s.entries.some(r=>r.id===entry.id))throw Error('duplicate journal decision');s.entries.push(entry);return null;
 }
 if(m.type!=='journal_end' || s.entries.length!==s.count)throw Error('incomplete journal snapshot');
 peer.journalSync=null;return {revision:s.revision,healthy:s.healthy,entries:s.entries,syncedAt:new Date().toISOString()};
}
