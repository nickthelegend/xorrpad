// MIT · Copyright (c) 2026 Nivesh Gajengi
import tableText from '../../../../firmware/xorrpad/logic/earcons-table.h?raw';
import {parseEarcons,playEarcon} from '../../../renderer/ui/earcons.mjs';
const table=parseEarcons(tableText);
let context,source;
export function unlockEarcons(){
 const Audio=globalThis.AudioContext || globalThis.webkitAudioContext;
 if(!Audio)return;
 context ||= new Audio();context.resume().catch(()=>{});
}
export function mirrorEarcon(event){
 if(!context)return; // Autoplay never queues old alarms for a later gesture.
 if(event.kind==='tick' && source)return;
 if(source){try{source.stop();}catch{}}
 source=event.audible===false?null:playEarcon(context,table,event.kind,event.sounds);
 if(source){const current=source;source.onended=()=>{current.disconnect();if(source===current)source=null;};}
}
