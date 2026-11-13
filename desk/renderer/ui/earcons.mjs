// MIT · Copyright (c) 2026 Nivesh Gajengi
export const DEFAULT_SOUNDS=Object.freeze({volume:80,mute:false,knobTick:false,quietHours:null});
export function validateSounds(s){
 if(!s || typeof s!=='object' || Array.isArray(s) || Object.keys(s).some(k=>!Object.hasOwn(DEFAULT_SOUNDS,k)) ||
 !Number.isInteger(s.volume) || s.volume<0 || s.volume>100 || typeof s.mute!=='boolean' || typeof s.knobTick!=='boolean')throw Error('invalid pad sounds');
 const q=s.quietHours;
 if(q!==null && (!q || Object.keys(q).length!==2 || !['startMinute','endMinute'].every(k=>Number.isInteger(q[k]) && q[k]>=0 && q[k]<1440)))throw Error('quiet hours require UTC start/end minutes');
 return {...s,quietHours:q?{...q}:null};
}
export function parseEarcons(raw){
 return Object.fromEntries([...raw.matchAll(/^EARCON\(\w+,\s*(\w+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\)/gm)].map(m=>[m[1],{cues:[[+m[2],+m[3]],[+m[4],+m[5]]],peak:+m[6]}]));
}
export function soundAllowed(kind,s=DEFAULT_SOUNDS,minute=new Date().getUTCHours()*60+new Date().getUTCMinutes()){
 if(s.mute || !s.volume || (kind==='tick' && !s.knobTick))return false;
 const q=s.quietHours;if(!q)return true;
 if(minute<0)return false;
 const {startMinute:a,endMinute:b}=q;
 return !(a===b || (a<b?minute>=a && minute<b:minute>=a || minute<b));
}
export function renderEarcon(e,volume=100){
 const out=new Int16Array(e.cues.reduce((n,c)=>n+c[1]*16,0));let offset=0;
 for(const [hz,ms] of e.cues){const n=ms*16;
  for(let i=0;i<n;i++){
   const edge=Math.min(1,Math.min(i,n-1-i)/48),env=(1-Math.cos(Math.PI*edge))*.5;
   out[offset+i]=Math.trunc(Math.trunc(e.peak*env*Math.sin(2*Math.PI*hz*i/16000))*volume/100);
  }offset+=n;
 }return out;
}
// Buffer synthesis uses exactly the pad's 16kHz integer PCM, then WebAudio resamples.
export function playEarcon(context,table,kind,settings=DEFAULT_SOUNDS){
 if(!table[kind] || !soundAllowed(kind,settings) || context.state!=='running')return null;
 const pcm=renderEarcon(table[kind],settings.volume),buffer=context.createBuffer(1,pcm.length,16000);
 const data=buffer.getChannelData(0);for(let i=0;i<pcm.length;i++)data[i]=pcm[i]/32768;
 const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);source.start();return source;
}
