// MIT · Copyright (c) 2026 Nivesh Gajengi
import {ScanPadSimulator} from './scan.mjs';
/** F9 public presentation metadata over the existing encrypted/native padsim. */
export class MirrorPadSimulator extends ScanPadSimulator {
 constructor(options){super(options);this.mirrorStarted=Date.now();
  this.on('message',m=>{
   if(['fund','portfolio','outcome_positions'].includes(m.type))this.mirrorWallet=m.type==='outcome_positions'?'outcomes':m.type;
   if(['signal','receipt','scan','reply'].includes(m.type))this.mirrorWallet=null;
   if(['fund','portfolio','outcome_positions','signal','signal_state','flatten','rearm_complete','status','predict','liq_guard'].includes(m.type))this.reportView();
  });
 }
 reportView(){
  if(!this.verified)return;
  const pending=this.signal?.state==='awaiting' && Date.now()<this.signal.expiresAt;
  const guard=this.liqGuard?.active && Date.now()-this.guardAt<30000;
  const screen=this.killed?(this.flatten && !this.rearmRequested?'flatten':'killed'):
   this.tilt?.blocked && !this.mirrorWallet && !guard?'cooldown':
   this.scanVisible?'scan':pending?'decision':guard?'liq_guard':this.mirrorWallet ||
   (this.journalVisible?'journal':this.ambientVisible?'ambient':this.predict?.enabled?'predict':'home');
  this.send({type:'pad_view',screen,selected:screen==='journal'?this.journalSelected || 0:screen==='predict'?this.selected || 0:0,millis:(Date.now()-(this.mirrorStarted || Date.now()))>>>0});
 }
 async key(action,options={}){
  if(this.mirrorWallet && action!=='kill'){this.mirrorWallet=null;this.outcomePositions=null;this.reportView();return {dismissed:true};}
  const result=await super.key(action,options);this.reportView();return result;
 }
}
