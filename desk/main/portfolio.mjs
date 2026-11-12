import {AgentWallet,NO_AGENT_WALLET} from './agent-wallet.mjs';
import {AGENT_KINDS} from './agents.mjs';
import {active} from './chains/index.mjs';

/** The configured phone address wins; otherwise read the executor's agent wallet. */
export async function portfolioSnapshot(mem,executor) {
  const reader = new AgentWallet(executor);
  let wallet;
  try {
    wallet = process.env.SOLANA_ADDRESS
      ? await reader.read({address:process.env.SOLANA_ADDRESS,source:'phone'}) : await reader.get();
  } catch (e) {
    if (e.message !== NO_AGENT_WALLET) throw e;
    return {chain:{chain:'solana',mode:'solana',chainId:501,label:'Solana',address:null,cluster:null,slot:null,signing:'external'},route:'jupiter',
      balances:{},prices:{},totalUsd:null,setupRequired:true,message:NO_AGENT_WALLET,
      memory:await mem.recallBrief(),agents:AGENT_KINDS,markets:active().markets(),
      portfolio:{address:null,cluster:null,totalUsd:null,rows:[],message:NO_AGENT_WALLET}};
  }
  const rows = Object.entries(wallet.balances);
  const prices = Object.fromEntries(rows.filter(([,r]) => r.priceUsd != null).map(([key,r]) => [key,r.priceUsd]));
  const top = rows.filter(([key,r]) => !['SOL','USDC'].includes(key) && r.amount > 0)
    .sort((a,b) => (b[1].usd ?? -1)-(a[1].usd ?? -1) || b[1].amount-a[1].amount).slice(0,3).map(([,r]) => r);
  return {chain:{chain:'solana',mode:'solana',chainId:501,label:'Solana',address:wallet.address,cluster:wallet.cluster,slot:wallet.slot,signing:'external'},
    route:'jupiter',balances:wallet.balances,prices,totalUsd:wallet.totalUsd,wallet,
    memory:await mem.recallBrief(),agents:AGENT_KINDS,markets:active().markets(),
    portfolio:{address:wallet.address,source:wallet.source,cluster:wallet.cluster,totalUsd:wallet.totalUsd,
      partial:wallet.unpricedMints.length > 0,valuation:wallet.valuation,
      rows:[wallet.balances.SOL,wallet.balances.USDC,...top].map(({mint,symbol,amount,usd}) => ({mint,symbol,amount,usd}))}};
}
