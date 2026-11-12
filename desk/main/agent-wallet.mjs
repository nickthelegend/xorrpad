/** Public wallet state only. RPC failures never become zero balances. */
import {Connection, PublicKey} from '@solana/web3.js';
import {TOKENS} from './spot-book.mjs';
import {USDC, SOL} from './xstocks.mjs';

export const NO_AGENT_WALLET = 'Create your agent wallet in XOR Desktop';
export const DEVNET_USDC = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const GENESIS = {
  EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG:'devnet',
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d':'mainnet-beta',
};
const PROGRAMS = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA','TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];

export class AgentWallet {
  constructor(executor) { this.executor = executor; }
  async get({create = false} = {}) {
    return this.read({...await this.executor.agentWalletIdentity({create})});
  }
  async read({address,source}) {
    const owner = new PublicKey(address);
    const connection = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com', {
      commitment:'confirmed',disableRetryOnRateLimit:true,
      fetch:(url,opts) => fetch(url,{...opts,signal:AbortSignal.timeout(15000)}),
    });
    let cluster, lamports, accounts;
    try {
      cluster = GENESIS[await connection.getGenesisHash()];
      if (!cluster) throw Error('unsupported genesis');
      [lamports,...accounts] = await Promise.all([
        connection.getBalance(owner),
        ...PROGRAMS.map(id => connection.getParsedTokenAccountsByOwner(owner,{programId:new PublicKey(id)})),
      ]);
    } catch { throw Error('Agent wallet balances unavailable: Solana RPC read failed or unsupported cluster'); }
    const usdcMint = cluster === 'devnet' ? DEVNET_USDC : USDC.mint;
    const balances = {
      SOL:{mint:SOL.mint,symbol:'SOL',amount:lamports/1e9,decimals:9},
      USDC:{mint:usdcMint,symbol:'USDC',amount:0,decimals:6},
    };
    const known = cluster === 'mainnet-beta' ? Object.fromEntries(Object.entries(TOKENS).map(([s,t]) => [t.mint,s])) : {};
    for (const result of accounts) for (const account of result.value) {
      const info = account.account.data.parsed?.info, amount = info?.tokenAmount;
      if (!info || !amount || !/^\d+$/.test(amount.amount) || !Number.isInteger(amount.decimals) || amount.decimals < 0 || amount.decimals > 255)
        throw Error('Agent wallet balances unavailable: unparsed token account');
      // Aggregate raw amounts first, including multiple accounts for one mint.
      const key = info.mint === usdcMint ? 'USDC' : (known[info.mint] !== 'SOL' && known[info.mint]) || info.mint;
      if (BigInt(amount.amount) === 0n) continue;
      balances[key] ||= {mint:info.mint,symbol:known[info.mint] || info.mint,amount:0,decimals:amount.decimals};
      const row = balances[key];
      row.rawAmount = (BigInt(row.rawAmount || '0') + BigInt(amount.amount)).toString();
      row.amount = Number(row.rawAmount)/10**row.decimals;
    }
    const priceErrors = [];
    const rows = Object.values(balances);
    // Jupiter prices mainnet mint identities; devnet tokens have no market USD value.
    if (cluster === 'mainnet-beta') {
      for (let offset = 0; offset < rows.length; offset += 50) {
        const batch = rows.slice(offset,offset+50);
        try {
          const url = new URL((process.env.JUPITER_API || 'https://lite-api.jup.ag') + '/price/v3');
          url.searchParams.set('ids',batch.map(r => r.mint).join(','));
          const response = await fetch(url,{signal:AbortSignal.timeout(10000)});
          if (!response.ok) throw Error('price unavailable');
          const prices = await response.json();
          for (const row of batch) {
            const value = prices[row.mint]?.usdPrice;
            if (typeof value === 'number' && Number.isFinite(value) && value > 0) row.priceUsd = value;
          }
        } catch { priceErrors.push('Jupiter USD prices unavailable'); }
      }
    }
    for (const row of rows) row.usd = row.amount === 0 ? 0 : row.priceUsd == null ? null : row.amount * row.priceUsd;
    const unpriced = rows.filter(r => r.amount > 0 && r.usd == null);
    const pricedTotalUsd = rows.reduce((total,r) => total+(r.usd ?? 0),0);
    return {address,source,cluster,solanaPay:`solana:${address}?label=xorrpad%20agent`,balances,
      totalUsd:unpriced.length ? null : pricedTotalUsd,pricedTotalUsd,
      unpricedMints:unpriced.map(r => r.mint),priceErrors,
      valuation:cluster === 'devnet' ? 'Devnet tokens have no USD market value' : 'Jupiter USD prices',
      observedAt:new Date().toISOString()};
  }
}
