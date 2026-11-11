/** Public status only: RPC URLs and signing material never leave the desk. */
import {Connection, PublicKey} from '@solana/web3.js';
const clusters={'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG':'devnet','5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d':'mainnet-beta'};
export class DeskStatus {
  #cached; #until=0;
  constructor(executor,padlink){Object.assign(this,{executor,padlink});}
  async get(){
    if(!this.#cached||Date.now()>=this.#until){this.#until=Date.now()+15000;this.#cached=this.#read();}
    return this.#cached;
  }
  async #read(){
    let wallet;
    try{wallet=await this.executor.wallet.info();}catch(e){wallet={setupRequired:e.message};}
    const readRpc=async(name,endpoint)=>{
      try{
        const connection=new Connection(endpoint,{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:(url,opts)=>fetch(url,{...opts,signal:AbortSignal.timeout(10000)})});
        const hash=await connection.getGenesisHash(), cluster=clusters[hash] || 'unknown genesis';
        let balanceSol=null, balanceError;
        if(wallet.publicKey&&clusters[hash])try{balanceSol=await connection.getBalance(new PublicKey(wallet.publicKey))/1e9;}catch(e){balanceError=e.message;}
        return {name,cluster,balanceSol,...(balanceError?{balanceError}:{})};
      }catch(e){return {name,cluster:null,error:e.message,balanceSol:null};}
    };
    const [rpc,budget]=await Promise.all([
      Promise.all([readRpc('Spot / perps',process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com'),readRpc('pm-AMM',process.env.PMAMM_RPC || 'https://api.devnet.solana.com')]),
      this.executor.budgetStatus(),
    ]);
    return {observedAt:new Date().toISOString(),pollAfterMs:15000,devices:this.padlink.snapshot().devices,rpc,wallet:{...wallet,mode:this.executor.mode()},...budget};
  }
}
