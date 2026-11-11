/** Separate devnet daemon. One confirmed market per template/expiry, restart-safe ids. */
import { open,unlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { ensureFunding } from "./fund.mjs";
import { signingContext } from "./chain.mjs";
import { MINT } from "./guards.mjs";
import { fetchPrice } from "./pyth.mjs";
import { TEMPLATES,nextEnd,strikeFor,questionFor,marketIdFor,depositAmount } from "./markets.mjs";
import { ensureDirectories,STATE_DIR,readJson,writePublicJson } from "./paths.mjs";
export async function createRecurring(context,template,endTs=nextEnd(template)) {
  const {human,raw}=depositAmount(),creator=context.owner.toBase58();
  const marketId=marketIdFor(creator,template,endTs),market=context.client.marketPda(marketId).toBase58();
  const file=new URL(`${market}.json`,STATE_DIR);
  const existing=await context.client.fetchMarket(context.client.marketPda(marketId));
  let record=await readJson(file,null);
  if(existing) {
    if(existing.authority.toBase58()!==creator || existing.collateralMint.toBase58()!==MINT || existing.endTs.toNumber()!==endTs)
      throw new Error("deterministic market id collides with incompatible chain state");
    if(!record)throw new Error(`Setup required: restore keeper state for ${market}; the chain market already exists`);
    return record;
  }
  if(record?.createSignature) {
    const status=(await context.connection.getSignatureStatuses([record.createSignature],{searchTransactionHistory:true})).value[0];
    if(!status || !status.err)throw new Error(`creation may be pending: ${record.createSignature}; no duplicate submission`);
    record=null; // a failed transaction did not create the deterministic market.
  }
  const creationPrice=record?.creationPrice || await fetchPrice(template.symbol);
  const strike=record?.strike || strikeFor(creationPrice,template.tickUsd);
  record={market,marketId,creator,cluster:"devnet",collateralMint:MINT,symbol:template.symbol,periodSeconds:template.periodSeconds,
    endTs,strike,question:questionFor(template.symbol,strike,endTs),depositUsdc:human,creationPrice,createdAt:new Date().toISOString()};
  await writePublicJson(file,record);
  const created=await context.create({marketId,endTs,name:record.question,depositRaw:raw},async signature=>{
    record.createSignature=signature;record.createStatus="submitted-or-pending";await writePublicJson(file,record);
  });
  record.createSignature=created.signature;record.createStatus="confirmed";await writePublicJson(file,record);
  console.log(`CREATED ${market} ${record.question} ${created.signature}`);
  return record;
}
export async function run({once=false,shortCycle=false}={}) {
  const lockUrl=new URL(".run.lock",import.meta.url);
  const lock=await open(lockUrl,"wx",0o600).catch(e=>{if(e.code==="EEXIST")throw new Error("keeper is already running or its lock needs review");throw e;});
  let stopping=false;
  const stop=()=>{stopping=true;};process.on("SIGINT",stop);process.on("SIGTERM",stop);
  try {
    await lock.writeFile(String(process.pid));await ensureDirectories();
    const funding=await ensureFunding({depositUsdc:depositAmount().human}),context={...await signingContext(funding.connection),connection:funding.connection};
    do {
      if(shortCycle) {await createRecurring(context,TEMPLATES[0],Math.floor(Date.now()/1000)+600);return;}
      for(const template of TEMPLATES)await createRecurring(context,template);
      if(!once && !stopping)await new Promise(r=>setTimeout(r,15000));
    }while(!once && !stopping);
  } finally {
    process.removeListener("SIGINT",stop);process.removeListener("SIGTERM",stop);
    await lock.close();await unlink(lockUrl);
  }
}
if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) {
  run({once:process.argv.includes("--once"),shortCycle:process.argv.includes("--cycle")}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
