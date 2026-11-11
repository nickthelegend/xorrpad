/** Real devnet proof. Never loads .env or any existing wallet; never sends mainnet. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { SessionWallet } from '../main/session-wallet.mjs';
import { Permissions } from '../main/permissions.mjs';
import { Memory } from '../main/memory.mjs';
import { SignalQueue } from '../main/signals.mjs';
import { Executor } from '../main/executor.mjs';
import { propose } from '../main/propose.mjs';
import * as pm from '../main/chains/pmamm.mjs';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../.t2-devnet');
process.env.XORR_USER_DATA = dir;
await mkdir(dir,{recursive:true,mode:0o700});
const wallet = new SessionWallet({dir});
let identity;
try { identity = await wallet.info(); }
catch(e) { if (!e.message.startsWith('Setup required:')) throw e; identity = await wallet.create(); }
const evidenceFile = path.join(dir,'evidence.json');
let evidence;
try { evidence = JSON.parse(await readFile(evidenceFile,'utf8')); }
catch(e) { if (e.code !== 'ENOENT') throw e; evidence = {}; }
Object.assign(evidence,{publicKey:identity.publicKey,requiredSol:0.2,requiredMusdc:20,at:new Date().toISOString()});
const save = () => writeFile(evidenceFile,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
let mem, queue;
try {
  const connection = await pm.devnetConnection(), owner = new PublicKey(identity.publicKey);
  const balance = () => connection.getBalance(owner);
  let sol = await balance();
  if (sol < 200000000 && !evidence.airdropAttemptedAt) {
    evidence.airdropAttemptedAt = new Date().toISOString(); await save();
    try { evidence.airdropSignature = await connection.requestAirdrop(owner,200000000); }
    catch(e) { evidence.airdropError = /410/.test(e.message) ? 'HTTP 410: devnet RPC faucet is closed' : e.message.split('\n')[0]; }
    await save(); sol = await balance();
  }
  const collateral = getAssociatedTokenAddressSync(pm.COLLATERAL,owner);
  const musdcBalance = async () => { const a = await connection.getAccountInfo(collateral); return a ? Number(a.data.readBigUInt64LE(64))/1e6 : 0; };
  let musdc = await musdcBalance();
  if (sol >= 200000000 && musdc < 20 && Date.now() - (evidence.faucetAt || 0) >= 3600000) {
    evidence.faucetAt = Date.now(); await save();
    const response = await fetch('https://pm-amm-devnet.vercel.app/api/faucet',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({wallet:identity.publicKey}),signal:AbortSignal.timeout(20000)});
    evidence.musdcFaucetHttp = response.status; await save();
    if (response.ok) { await new Promise(r => setTimeout(r,5000)); musdc = await musdcBalance(); }
  }
  Object.assign(evidence,{sol:sol/1e9,musdc}); await save();
  if (sol < 200000000 || musdc < 20)
    throw new Error(`BLOCKED: fund ${identity.publicKey} with 0.2 devnet SOL plus 20 mUSDC from the pm-AMM faucet; observed ${sol/1e9} SOL and ${musdc} mUSDC${evidence.airdropError ? ` (${evidence.airdropError})` : ''}`);
  const market = (await pm.markets()).filter(m => m.liquidity > 10 && m.yesPrice > .1 && m.yesPrice < .9 && m.endTs > Date.now()/1000+120).sort((a,b) => b.liquidity-a.liquidity)[0];
  if (!market) throw new Error('BLOCKED: no live liquid pm-AMM devnet market');
  const symbol = `pmamm:${market.market}:yes`;
  new Permissions({dir}).write({autoAccept:{venues:{pmamm:true},kinds:{predict:true}},maxTradeUsd:1,maxDayUsd:1,
    marketAllowlist:[symbol],alwaysAskAboveUsd:1});
  mem = new Memory({db:path.join(dir,'proof.db')});
  await mem.setReference('risk/limits',{max_trade_usd:1,max_day_usd:1,allow:[symbol]});
  queue = new SignalQueue({journal:e => mem.journal(e),gate:async e => propose(e.proposal.signal,await mem.recallBrief()),
    announce:async e => {
      // This CLI proof uses real local macOS speech. The server streams Deepgram PCM.
      if (process.platform !== 'darwin') throw new Error('Setup required: macOS say for the CLI auto-accept announcement');
      await promisify(execFile)('say',[`Auto accepting one devnet mUSDC of ${e.proposal.signal.symbol}`]);
    }});
  evidence.states = [];
  queue.on('event',e => {if (e.type === 'signal') evidence.states.push({id:e.signal.id,state:e.signal.state});});
  const executor = new Executor({mem,signals:queue,dir}); executor.setMode('session');
  const proposal = await propose({kind:'predict',side:'BUY',market:market.market,symbol,outcomeSide:'yes',sizeUsd:1,agent:'t2-proof'},await mem.recallBrief());
  const signal = await queue.create(proposal);
  if (signal.state !== 'accepted' || !signal.automatic) throw new Error(`BLOCKED: ${signal.state}: ${signal.setupRequired || signal.proposal.verdict.why.at(-1)}`);
  const result = await executor.execute(signal.id);
  if (!result.ok || !result.receipt) throw new Error(`BLOCKED: ${result.error || 'no confirmed receipt'}`);
  Object.assign(evidence,{status:'CONFIRMED',receipt:result.receipt}); await save(); console.log(JSON.stringify(evidence,null,2));
} catch(e) {
  Object.assign(evidence,{status:'BLOCKED',reason:e.message}); await save(); console.log(e.message); process.exitCode = 2;
} finally { queue?.close(); mem?.stop(); }
