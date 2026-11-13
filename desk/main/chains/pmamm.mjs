/** pm-AMM on devnet. Read-only SDK; instruction builders only, no wallet/provider. */
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { Connection, PublicKey, Transaction, ComputeBudgetProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { marketState, quoteSwap, minOutput } from "./pm-amm-helpers.mjs";
import { walletHandoff } from "../wallet-requests.mjs";
export { walletRequest } from "../wallet-requests.mjs";

// Anchor and the SDK's Anchor imports are CommonJS. Load the CJS SDK entry.
const require = createRequire(import.meta.url);
const { PmAmmClient, PROTOCOL_DAO } = require("@pm-amm/sdk");
export const id = "pmamm";
export const label = "pm-AMM (Solana devnet)";
export const PROGRAM = new PublicKey("GV1FMGHRYBjQLaghE5fnGuYCuCcpdt3GD5xEX3TwN16y");
export const COLLATERAL = new PublicKey("3WQ8hCqTNwjrh8WzE2XyoZoUrd1miPcwWfMkmFPUMEWZ");
const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const TTL = 15000;
let context;

function key(value, variable = "SOLANA_ADDRESS") {
  if (!value) throw new Error(`Setup required: ${variable}`);
  try { return new PublicKey(value); } catch { throw new Error(`invalid ${variable}: expected a Solana public key`); }
}
function ownerKey(owner) {
  const pubkey = key(owner || process.env.SOLANA_ADDRESS);
  if (!PublicKey.isOnCurve(pubkey.toBytes())) throw new Error("owner must be an on-curve wallet public key");
  return pubkey;
}
export function rawUsdc(value, allowZero = false) {
  const text = String(value ?? "");
  if (!/^\d+(?:\.\d{1,6})?$/.test(text)) throw new Error("mUSDC must have at most 6 decimals");
  const [whole, fraction = ""] = text.split(".");
  const raw = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
  if (raw > BigInt(Number.MAX_SAFE_INTEGER) || (allowZero ? raw < 0n : raw <= 0n))
    throw new Error("mUSDC amount is out of range");
  return Number(raw);
}
function memo(fn) {
  let cached, pending, at = 0;
  return async () => {
    if (cached !== undefined && Date.now() - at < TTL) return cached;
    if (!pending) pending = fn().then(v => { cached = v; at = Date.now(); return v; }).finally(() => { pending = null; });
    return pending;
  };
}
async function ctx() {
  const endpoint = process.env.PMAMM_RPC || "https://api.devnet.solana.com";
  if (!context || context.endpoint !== endpoint) {
    const connection = new Connection(endpoint, {
      commitment: "confirmed", disableRetryOnRateLimit: true,
      fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }),
    });
    const client = PmAmmClient.readOnly(connection, PROGRAM, COLLATERAL);
    context = { endpoint, connection, client, single: new Map(),
      all: memo(() => client.fetchAllMarkets(443)),
    };
    context.genesis = memo(async () => {
      if (await connection.getGenesisHash() !== DEVNET_GENESIS) throw new Error("pm-AMM refuses this RPC: devnet only");
      return true;
    });
  }
  const current = context;
  await current.genesis();
  return current;
}
export async function devnetConnection() { return (await ctx()).connection; }
async function marketAccount(market) {
  const c = await ctx(), pubkey = key(market, "market");
  const address = pubkey.toBase58();
  if (!c.single.has(address)) c.single.set(address, memo(() => c.client.fetchMarket(pubkey)));
  const account = await c.single.get(address)();
  if (!account) throw new Error("market not found on pm-AMM devnet");
  if (!account.collateralMint.equals(COLLATERAL)) throw new Error("market does not use devnet mUSDC");
  return { ...c, pubkey, account };
}
const nameOf = m => Buffer.from(m.name).toString("utf8").replace(/\0+$/, "");
export function available() { return true; }
export async function info() {
  const c = await ctx();
  c.slot ||= memo(() => c.connection.getSlot());
  return { chain: "solana", cluster: "devnet", program: PROGRAM.toBase58(), signing: "external", slot: await c.slot() };
}
export async function swap() { throw new Error("pmamm: the desk never signs — sign the unsigned transaction with your wallet"); }

export async function markets() {
  const c = await ctx();
  if (!c.live) c.live = memo(async () => {
    const rows = (await c.all()).filter(({ account: m }) => m.collateralMint.equals(COLLATERAL) && !m.resolved && m.endTs.toNumber() > Date.now() / 1000);
    const vaults = [];
    for (let i = 0; i < rows.length; i += 100)
      vaults.push(...await c.connection.getMultipleAccountsInfo(rows.slice(i, i + 100).map(r => r.account.vault)));
    return rows.map(({ publicKey, account: m }, i) => {
      const state = marketState(m), vault = vaults[i];
      const liquidity = vault?.owner.equals(TOKEN_PROGRAM_ID) && vault.data.length >= 72
        ? Number(vault.data.readBigUInt64LE(64)) / 1e6 : null;
      return { market: publicKey.toBase58(), name: nameOf(m), yesPrice: state.price,
        endTime: new Date(m.endTs.toNumber() * 1000).toISOString(), endTs: m.endTs.toNumber(),
        liquidity, liquidityUnit: "mUSDC in vault", effectiveLiquidity: state.lEff / 1e6,
        observedAt: new Date().toISOString() };
    });
  });
  return (await c.live()).filter(m => m.endTs > Date.now() / 1000);
}
function quoted(account, { market, side, usdc }) {
  if (side !== "yes" && side !== "no") throw new Error('side must be "yes" or "no"');
  const amountIn = rawUsdc(usdc), state = marketState(account);
  if (!(state.lEff > 0)) throw new Error("market has no liquidity");
  const direction = side === "yes" ? "usdcToYes" : "usdcToNo";
  const exact = quoteSwap(account, direction, amountIn);
  if (!Number.isSafeInteger(exact.out) || exact.out <= 0) throw new Error("trade produces no shares");
  const spot = side === "yes" ? state.price : 1 - state.price;
  const executionPrice = (amountIn - exact.fee) / exact.out;
  return { venue: id, chain: "solana", cluster: "devnet", market: String(market), side,
    usdc: amountIn / 1e6, expectedShares: exact.out / 1e6, price: executionPrice,
    priceImpactPct: (executionPrice / spot - 1) * 100, fee: exact.fee / 1e6,
    amountInRaw: amountIn, amountOutRaw: exact.out, feeRaw: exact.fee, direction,
    observedAt: new Date().toISOString() };
}
export async function quote(input) {
  if (input.side !== "yes" && input.side !== "no") throw new Error('side must be "yes" or "no"');
  rawUsdc(input.usdc);
  const { account } = await marketAccount(input.market);
  return quoted(account, input);
}
export async function price(market) { return marketState((await marketAccount(market)).account).price; }

const ata = (mint, owner) => getAssociatedTokenAddressSync(mint, owner, true);
const ataIx = (payer, mint, owner = payer) => createAssociatedTokenAccountIdempotentInstruction(payer, ata(mint, owner), owner, mint);
async function finish(c, owner, instructions, intent, metadata, request) {
  const latest = await c.connection.getLatestBlockhash();
  const tx = new Transaction({ feePayer: owner, ...latest }).add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }), ...instructions);
  const unsignedTx = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
  const built = { unsignedTx, signWith: owner.toBase58(), cluster: "devnet", signing: "external", ...latest, ...metadata };
  if (!request) return built;
  return { ...built, ...walletHandoff(owner.toBase58(), intent, {
    label: "xorrpad pm-AMM · devnet", variable: "PMAMM_PUBLIC_URL", path: "/pm/request",
  }) };
}

export async function buildSwap(input, { request = true } = {}) {
  const owner = ownerKey(input.owner), c = await marketAccount(input.market);
  const q = quoted(c.account, input), slippageBps = input.slippageBps ?? 100;
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 9999) throw new Error("slippageBps must be an integer from 0 to 9999");
  const minimum = minOutput({ out: q.amountOutRaw }, slippageBps);
  if (minimum <= 0) throw new Error("minimum output rounds to zero");
  const a = c.account;
  const instructions = [ataIx(owner, COLLATERAL), ataIx(owner, a.yesMint), ataIx(owner, a.noMint), ataIx(owner, COLLATERAL, PROTOCOL_DAO)];
  if (!a.authority.equals(owner)) instructions.push(ataIx(owner, COLLATERAL, a.authority));
  instructions.push(await c.client.ix.swap({ signer: owner, market: c.pubkey, direction: q.direction,
    amountIn: q.amountInRaw, minOutput: minimum, creatorAuthority: a.authority }));
  return finish(c, owner, instructions, () => buildSwap(input, { request: false }), { quote: q, minOutputRaw: minimum, slippageBps }, request);
}
export async function buildCreateMarket(input, { request = true, marketId: requestedId } = {}) {
  const owner = ownerKey(input.owner), c = await ctx();
  const { name, durationSecs, initialPriceBps = 5000, depositUsdc = 0 } = input;
  if (typeof name !== "string" || !name.trim() || Buffer.byteLength(name) > 64) throw new Error("name must contain 1 to 64 UTF-8 bytes");
  if (!Number.isInteger(durationSecs) || durationSecs < 300 || durationSecs > 50 * 365 * 86400) throw new Error("durationSecs must be 300 seconds to 50 years");
  if (!Number.isInteger(initialPriceBps) || initialPriceBps < 100 || initialPriceBps > 9900) throw new Error("initialPriceBps must be 100 to 9900");
  const amount = rawUsdc(depositUsdc, true);
  const marketId = requestedId ?? randomBytes(6).readUIntBE(0, 6), market = c.client.marketPda(marketId);
  const endTs = Math.floor(Date.now() / 1000) + durationSecs;
  const instructions = [await c.client.ix.initializeMarket({ authority: owner, marketId, endTs, name, initialPriceBps })];
  if (amount > 0) instructions.push(ataIx(owner, COLLATERAL), await c.client.ix.depositLiquidity({ signer: owner, market, amount }));
  // Keep the market id; refresh endTs so a 300-second market still meets the program minimum.
  const rebuild = () => buildCreateMarket(input, { request: false, marketId });
  return finish(c, owner, instructions, rebuild, { market: market.toBase58(), marketId, endTs }, request);
}
export async function buildClaim(input, { request = true } = {}) {
  const owner = ownerKey(input.owner), c = await marketAccount(input.market), a = c.account;
  if (!a.resolved) throw new Error("market is not resolved; winnings cannot be claimed");
  const instructions = [ataIx(owner, COLLATERAL), ataIx(owner, a.yesMint), ataIx(owner, a.noMint),
    await c.client.ix.claimWinnings({ signer: owner, market: c.pubkey })];
  return finish(c, owner, instructions, () => buildClaim(input, { request: false }), { market: c.pubkey.toBase58() }, request);
}
export async function positions(owner) {
  const wallet = ownerKey(owner), c = await ctx();
  c.positions ||= new Map();
  const address = wallet.toBase58();
  if (!c.positions.has(address)) c.positions.set(address, memo(() => readPositions(c, wallet)));
  return c.positions.get(address)();
}
async function readPositions(c, wallet) {
  const [rows, tokens, lps] = await Promise.all([c.all(), c.connection.getParsedTokenAccountsByOwner(wallet, { programId: TOKEN_PROGRAM_ID }),
    c.client.program.account.lpPosition.all([{ memcmp: { offset: 8, bytes: wallet.toBase58() } }])]);
  const balances = new Map();
  for (const row of tokens.value) {
    const t = row.account.data.parsed.info;
    balances.set(t.mint, (balances.get(t.mint) || 0n) + BigInt(t.tokenAmount.amount));
  }
  const lpByMarket = new Map(lps.map(r => [r.account.market.toBase58(), r.account]));
  return rows.filter(r => r.account.collateralMint.equals(COLLATERAL)).flatMap(({ publicKey, account: m }) => {
    const yesRaw = balances.get(m.yesMint.toBase58()) || 0n, noRaw = balances.get(m.noMint.toBase58()) || 0n;
    const lp = lpByMarket.get(publicKey.toBase58());
    if (!yesRaw && !noRaw && !lp) return [];
    return [{ market: publicKey.toBase58(), name: nameOf(m), yes: Number(yesRaw) / 1e6, no: Number(noRaw) / 1e6,
      yesRaw: yesRaw.toString(), noRaw: noRaw.toString(), lpSharesRaw: lp?.shares.toString() || "0", resolved: m.resolved,
      claimableUsdc: m.resolved ? Number(m.winningSide === 1 ? yesRaw : noRaw) / 1e6 : 0 }];
  });
}
export async function balances(owner) { return positions(owner); }

// F4 exits spend only already-owned outcome tokens; never buy the opposite side.
export async function flattenInventory() {
 const owner=ownerKey().toBase58(),c=await ctx();
 const rows=await readPositions(c,new PublicKey(owner)),legs=[];
 for(const p of rows)for(const side of ['yes','no'])if(BigInt(p[side+'Raw'])>0n) {
  if(p.resolved)throw Error('resolved outcome shares require the external claim flow');
  const raw=p[side+'Raw'];if(!Number.isSafeInteger(Number(raw)))throw Error('outcome shares exceed safe builder precision');
  // The full share amount is the conservative $1/share permission budget.
  legs.push({kind:'predict',venue:id,market:p.market,symbol:p.market,owner,side:'SELL',outcomeSide:side,sharesRaw:raw,
   sizeUsd:Number(raw)/1e6,flattenAction:'outcome'});
 }
 return legs;
}
export async function quoteReduce(input) {
 const owner=ownerKey(input.owner),c=await marketAccount(input.market),a=c.account;
 if(!['yes','no'].includes(input.outcomeSide) || !/^[1-9]\d*$/.test(input.sharesRaw) || !Number.isSafeInteger(Number(input.sharesRaw)))throw Error('invalid outcome reduction');
 const mint=input.outcomeSide==='yes'?a.yesMint:a.noMint;
 const balance=await c.connection.getTokenAccountBalance(ata(mint,owner));
 if(balance.value.amount!==input.sharesRaw)throw Error('outcome position changed; review a fresh flatten plan');
 if(a.resolved || a.endTs.toNumber()<=Date.now()/1000)throw Error('Setup required: market is closed; use external claim flow after resolution');
 const direction=input.outcomeSide==='yes'?'yesToUsdc':'noToUsdc',amountIn=Number(input.sharesRaw),exact=quoteSwap(a,direction,amountIn);
 if(!Number.isSafeInteger(exact.out) || exact.out<=0)throw Error('outcome exit rounds to zero');
 return {venue:id,cluster:'devnet',market:input.market,direction,amountInRaw:amountIn,amountOutRaw:exact.out,fee:exact.fee/1e6,
  price:exact.out/amountIn,reduceOnly:true};
}
export async function buildReduce(input,{request=false}={}) {
 const q=await quoteReduce(input),owner=ownerKey(input.owner),c=await marketAccount(input.market),a=c.account;
 const minimum=minOutput({out:q.amountOutRaw},100);if(minimum<=0)throw Error('minimum outcome output rounds to zero');
 const instructions=[ataIx(owner,COLLATERAL),ataIx(owner,COLLATERAL,PROTOCOL_DAO)];
 if(!a.authority.equals(owner))instructions.push(ataIx(owner,COLLATERAL,a.authority));
 instructions.push(await c.client.ix.swap({signer:owner,market:c.pubkey,direction:q.direction,amountIn:q.amountInRaw,minOutput:minimum,creatorAuthority:a.authority}));
 return finish(c,owner,instructions,()=>buildReduce(input,{request:false}),{quote:q,reduceOnly:true},request);
}

/** All mUSDC markets for a creator, including expired and resolved ones. Chain only. */
export async function ours(creator) {
  const authority=key(creator,"KEEPER_PUBLIC_KEY"),c=await ctx();
  return (await c.all()).filter(({account:m})=>m.authority.equals(authority) && m.collateralMint.equals(COLLATERAL)).map(({publicKey,account:m})=>({
    market:publicKey.toBase58(),creator:m.authority.toBase58(),name:nameOf(m),collateralMint:m.collateralMint.toBase58(),
    endTs:m.endTs.toNumber(),endTime:new Date(m.endTs.toNumber()*1000).toISOString(),resolved:m.resolved,
    winningSide:m.winningSide===1?"yes":m.winningSide===2?"no":null,yesMint:m.yesMint.toBase58(),noMint:m.noMint.toBase58(),vault:m.vault.toBase58(),cluster:"devnet",
  }));
}
