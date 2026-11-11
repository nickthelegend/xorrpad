import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../renderer/ui/desk.css',import.meta.url),'utf8');
function luminance(hex){return (hex.length===4 ? [...hex.slice(1)].map(c=>c+c).join('') : hex.slice(1)).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);}
for(const theme of ['floor','paper','neon'])test(`${theme} text tokens meet WCAG AA`,()=>{
 const block=css.match(theme==='floor'?/:root \{([^}]+)\}/:/\[data-theme="THEME"\] \{([^}]+)\}/.source.replace('THEME',theme));
 const tokens=Object.fromEntries([...block[1].matchAll(/--([\w-]+): (#[0-9a-f]{3,6});/g)].map(m=>[m[1],m[2]]));
 const contrast=(a,b)=>{let x=luminance(tokens[a]),y=luminance(tokens[b]);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 for(const fg of ['ink','muted','accent','bad','good']) for(const bg of ['bg','panel','raised'])assert.ok(contrast(fg,bg)>=4.5,`${fg}/${bg}: ${contrast(fg,bg)}`);
 assert.ok(contrast('accent-ink','accent')>=4.5);
});
