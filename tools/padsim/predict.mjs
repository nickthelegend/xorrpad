// MIT · Copyright (c) 2026 Nivesh Gajengi
import {SessionPadSimulator} from './session.mjs';
/** F1 input semantics over the existing authenticated, native-signing simulator. */
export class PredictPadSimulator extends SessionPadSimulator {
  constructor(options={}) {
    super(options);this.firmware='4.0.0';this.selected=0;
    this.on('message',m=>{
      if(m.type==='predict'){const old=this.predict?.markets?.[this.selected]?.market;this.predict=m;this.predictAt=Date.now();this.selected=m.selected ?? Math.max(0,m.markets.findIndex(r=>r.market===old));}
      if(m.type==='outcome_positions')this.outcomePositions=m;
      if(m.type==='receipt')this.signal=null;
    });
  }
  key(action,options={}) {
    if(this.outcomePositions && action!=="kill" && action!=="fund") {
      this.outcomePositions=null;const id=options.id || this.device+':'+(++this.seq);
      this.send({type:'key',id,action:'predict:close',edge:'down'});return id;
    }
    const pending=this.signal?.state==='awaiting' && Date.now()<this.signal.expiresAt;
    if(this.predict?.enabled && !pending && ['yes','no'].includes(action)) {
      const market=this.predict.markets[this.selected];
      if(this.killed || !this.verified || !market || Date.now()-this.predictAt>=30000)throw Error('Setup required: live prediction feed');
      const id=options.id || this.device+':'+(++this.seq);
      this.send({type:'key',id,action:'predict:'+action,edge:'down',market:market.market});return id;
    }
    return super.key(action,options);
  }
  scroll(delta) {
    const n=this.predict?.markets.length;if(!n || !Number.isInteger(delta) || Math.abs(delta)>128)throw Error('invalid predict scroll');
    if(this.signal?.state==='awaiting' && Date.now()<this.signal.expiresAt)throw Error('decision pending');
    this.selected=(this.selected+delta%n+n)%n;
    this.send({type:'knob',id:this.device+':'+(++this.seq),mode:'predict',delta});
  }
}
