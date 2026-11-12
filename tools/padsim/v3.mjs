/** V3 regression scenarios, then an exact-message native-pad devnet self-transfer.
 * No wallet/key file is read or written. Only public accounting reaches disk.
 */
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {SessionPadSimulator} from './session.mjs';
import {PadLink} from '../../desk/main/padlink.mjs';
import {clearSignFrames} from '../../desk/main/clear-sign.mjs';
import {attachPadSignature} from '../../desk/main/pad-signer.mjs';
import {verifySignedTransaction} from '../../desk/main/executor.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(new URL('../../desk/package.json',import.meta.url));
const {Connection,PublicKey,Transaction,VersionedTransaction}=require('@solana/web3.js');
const {TOKEN_PROGRAM_ID,createTransferCheckedInstruction,getAssociatedTokenAddressSync}=require('@solana/spl-token');
const files=['clear-sign','pad-signer','attestation','abilities','price-alerts','crew','ota'];
const report={tests:0,passed:0,failed:0,skipped:0,files:{},blocked:[]};
const onlyBroadcast=process.argv.includes('--broadcast-only');
const waitArg=process.argv.find(a=>a.startsWith('--funding-wait='));
const fundingWait=waitArg ? Number(waitArg.split('=')[1]) : 0;
if(!Number.isSafeInteger(fundingWait)||fundingWait<0||fundingWait>3600)throw Error('--funding-wait must be 0..3600 seconds');

if(!onlyBroadcast){
  for(const name of files){
    const file=`desk/test/${name}.test.mjs`;
    if(!existsSync(path.join(root,file))){report.blocked.push(`${name}: test source absent from this checkout`);continue;}
    const child=spawn(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',file],{cwd:root,stdio:['ignore','pipe','inherit'],env:{...process.env,XORR_OTA_TEST_IMAGE:process.env.XORR_OTA_TEST_IMAGE||path.join(root,'firmware/build/v7-normal-out/xorrpad.ino.bin')}});
    let output='';child.stdout.on('data',b=>{output+=b;process.stdout.write(b);});
    const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
    const group=report.files[name]={};
    for(const [field,label] of Object.entries({tests:'tests',passed:'pass',failed:'fail',skipped:'skipped'})){
      const match=output.match(new RegExp(`^# ${label} (\\d+)$`,'m'));
      if(!match)throw Error(`${file}: missing ${label} total`);
      group[field]=Number(match[1]);report[field]+=group[field];
    }
    if(code!==0)throw Error(`${file} exited ${code}; no broadcast attempted`);
  }
}

async function until(fn){for(let i=0;i<500;i++){if(fn())return;await delay(10);}throw Error('encrypted pad timeout');}
const dir=mkdtempSync(path.join(tmpdir(),'xorr-v3-public-'));
const link=new PadLink({dir});
const pad=new SessionPadSimulator({device:'v3-devnet-session',serial:true,sessionStateFile:path.join(dir,'accounting.json')});
try{
  await pad.listen(8725);
  const peer=link.attach(net.createConnection(8725,'127.0.0.1'),'usb');
  await until(()=>peer.candidate);link.pair(pad.pairing);await until(()=>peer.verified&&pad.verified);
  const state=await link.sessionStatus(pad.device),owner=new PublicKey(state.publicKey);
  const mint=new PublicKey('3WQ8hCqTNwjrh8WzE2XyoZoUrd1miPcwWfMkmFPUMEWZ');
  const source=getAssociatedTokenAddressSync(mint,owner);
  console.log(`V3 FUNDING publicKey=${state.publicKey} tokenAccount=${source.toBase58()}; fund 0.01 devnet SOL and 1 mUSDC; identity exists only until this process exits`);
  const rpc=new Connection('https://api.devnet.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:((url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(20000)}))});
  try{
    if(await rpc.getGenesisHash()!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw Error('refused non-devnet genesis');
    const account=await rpc.getAccountInfo(mint);
    if(!account?.owner.equals(TOKEN_PROGRAM_ID)||account.data.length!==82||account.data[44]!==6||account.data[45]!==1)throw Error('unexpected real devnet collateral mint');
    const policy={trade:1000000,day:1000000,autoTrade:0,maxLeverage:1,mint:mint.toBase58(),market:'',programs:[TOKEN_PROGRAM_ID.toBase58()]};
    const pending=link.configureSession(pad.device,policy);await until(()=>pad.policyRequest);await pad.approvePolicy();
    if(!(await pending).configured)throw Error('native pad policy refused');
    const balances=async()=>{
      const [lamports,token]=await Promise.all([rpc.getBalance(owner),rpc.getAccountInfo(source)]);
      if(token&&(!token.owner.equals(TOKEN_PROGRAM_ID)||token.data.length!==165||!token.data.subarray(0,32).equals(mint.toBuffer())||!token.data.subarray(32,64).equals(owner.toBuffer())||token.data[108]!==1))throw Error('unexpected funding token account');
      return lamports>=10000000&&token&&token.data.readBigUInt64LE(64)>=1n;
    };
    const deadline=Date.now()+fundingWait*1000;
    let funded=await balances();
    while(!funded&&Date.now()<deadline){await delay(Math.min(5000,deadline-Date.now()));funded=await balances();}
    const block=await rpc.getLatestBlockhash();
    // Self-transfer of one real collateral base unit. No recipient or rent expense.
    const unsigned=new Transaction({feePayer:owner,recentBlockhash:block.blockhash}).add(createTransferCheckedInstruction(source,mint,source,owner,1n,6));
    const tx=VersionedTransaction.deserialize(unsigned.serialize({requireAllSignatures:false,verifySignatures:false}));
    const request={signalId:'v3-live-devnet',remainingMs:120000,message:Buffer.from(tx.message.serialize()).toString('hex'),tables:[],sign:true};
    const prepared=clearSignFrames(request);
    const signing=link.waitSession(peer,{type:'session_signature',signalId:request.signalId,messageHash:prepared.messageHash},()=>{for(const frame of prepared.frames)link.send(peer,frame);});
    await until(()=>pad.review);
    if(!pad.review.ok)throw Error('native clear review refused');
    await pad.approveSign();attachPadSignature(tx,await signing,state.publicKey);verifySignedTransaction(tx);
    console.log(`V3 PASS clear review + pad Ed25519 signature; fingerprint=${prepared.fingerprint}; exact live SDK message`);
    if(!funded){report.blocked.push(`devnet broadcast: fund ${state.publicKey} with 0.01 devnet SOL and mUSDC in ${source.toBase58()}`);}
    else{
      if(await rpc.getGenesisHash()!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw Error('devnet genesis changed');
      const signature=await rpc.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:2});
      const result=await rpc.confirmTransaction({...block,signature},'confirmed');
      if(result.value.err)throw Error(`devnet confirmation failed: ${JSON.stringify(result.value.err)}`);
      console.log(`V3 PASS confirmed devnet self-transfer https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    }
  }catch(error){
    if(!/fetch failed|timeout|timed out|429|503|502|ECONN|ENOTFOUND/i.test(error.message))throw error;
    report.blocked.push(`devnet provider unavailable; fund ${state.publicKey}; ${error.message}`);
  }
}finally{link.close();await pad.close();rmSync(dir,{recursive:true,force:true});}
for(const reason of report.blocked)console.log(`V3 BLOCKED ${reason}`);
console.log(`V3 TOTAL ${JSON.stringify(report)}`);
