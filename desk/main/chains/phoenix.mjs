/** Phoenix perpetuals: mainnet data, unsigned orders and read-only simulation. */
import { createPhoenixClient, Side, OrderFlags, calculateLiquidationPriceUsd,
  baseUnitsToBaseLotsWithMarketParams, baseLotsToBaseUnits } from "@ellipsis-labs/rise";
import { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from "@solana/web3.js";
import { walletHandoff } from "../wallet-requests.mjs";
export const id = "phoenix";
export const label = "Phoenix perps (read-only mainnet)";
export const PROGRAM = new PublicKey("EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih");
export const API = "https://perp-api.phoenix.trade";
const TTL = 15000, cache = new Map();
async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.promise;
  if (cache.size > 512) for (const [k,v] of cache) if (Date.now()-v.at >= TTL) cache.delete(k);
  const entry = { at: Date.now(), promise: null };
  entry.promise = fn().then(value => { entry.at = Date.now(); return value; }).catch(e => { if(cache.get(key)===entry) cache.delete(key); throw e; });
  cache.set(key, entry);
  return entry.promise;
}
async function usingClient(fn) {
  const client = createPhoenixClient({ apiUrl: API, phoenixEnv: "prod", programAddress: PROGRAM.toBase58(),
    auth: false, ws: false, exchangeMetadata: { stream: false, rpc: { enabled: false } },
    timeout: 15000, rateLimitRetry: false, rateLimitCooldown: false });
  try { return await fn(client); } finally { client.dispose(); }
}
export function authorityKey(authority = process.env.PHOENIX_AUTHORITY) {
  if (!authority) throw new Error("Setup required: PHOENIX_AUTHORITY (registered, funded Phoenix trader public key)");
  let key;
  try { key = new PublicKey(authority); } catch { throw new Error("invalid PHOENIX_AUTHORITY public key"); }
  if (!PublicKey.isOnCurve(key.toBytes())) throw new Error("PHOENIX_AUTHORITY must be an on-curve wallet public key");
  return key.toBase58();
}
function index(value, variable, fallback = 0) {
  const n = Number(value ?? process.env[variable] ?? fallback);
  if (!Number.isSafeInteger(n) || n < 0 || n > 255) throw new Error(`${variable} must be an integer from 0 to 255`);
  return n;
}
export async function simulationConnection() {
  const endpoint = process.env.PHOENIX_RPC || "https://api.mainnet-beta.solana.com";
  return cached(`rpc:${endpoint}`, async () => {
    const connection = new Connection(endpoint, { commitment: "confirmed", disableRetryOnRateLimit: true,
      fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) });
    if (await connection.getGenesisHash() !== "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d") throw new Error("Phoenix requires the documented mainnet deployment; this RPC is another cluster");
    return connection;
  });
}
export const available = () => true;
export async function info() {
  const rows = await perpMarkets();
  return { chain: "solana", cluster: "mainnet-beta", mode: "read-only-mainnet", signing: "external", program: PROGRAM.toBase58(), marketCount: rows.length };
}
export async function swap() { throw new Error("phoenix: the desk never signs or submits — approve and sign with your own wallet"); }
export async function perpMarkets() {
  return cached("markets", () => usingClient(async client => {
    const [markets, stats] = await Promise.all([client.api.markets().getMarkets(), client.api.markets().getLatestMarketsStats()]);
    const prices = new Map(stats.markets.map(s => [s.symbol,s]));
    return markets.map(m => {
      const s = prices.get(m.symbol);
      return { market: m.symbol, name: m.metadata?.name || m.symbol, marketAddress: m.marketPubkey,
        assetClass: m.metadata?.assetClass || null, status: m.marketStatus, isolatedOnly: m.isolatedOnly,
        markPrice: s?.mark_price ?? null, maxLeverage: Math.max(...m.leverageTiers.map(t => t.maxLeverage)),
        funding: s ? { ratePercent: s.current_funding_rate, eightHourRatePercent: s.eight_hour_funding_rate,
          annualizedRatePercent: s.annualized_funding_rate, intervalSeconds: m.fundingIntervalSeconds } : null,
        takerFeeRate: m.takerFee, makerFeeRate: m.makerFee, tickSize: m.tickSize, baseLotsDecimals: m.baseLotsDecimals,
        leverageTiers: m.leverageTiers, riskFactors: m.riskFactors,
        observedAt: s ? new Date(Number(s.timestamp_ms)).toISOString() : null };
    });
  }));
}
export const markets = perpMarkets;
async function marketOf(value) {
  const symbol = String(value || "").toUpperCase().replace(/-PERP$/, "");
  const market = (await perpMarkets()).find(m => m.market === symbol || m.marketAddress === value);
  if (!market) throw new Error(`unknown Phoenix market: ${value}`);
  return market;
}
async function bookOf(market) {
  return cached(`book:${market}`, () => usingClient(c => c.api.orderbook().getOrderbook(market, { includeSplines: true })));
}
function lotsDecimal(lots, decimals) {
  const digits = (lots < 0n ? -lots : lots).toString().padStart(decimals+1,"0");
  return decimals ? `${digits.slice(0,-decimals)}.${digits.slice(-decimals)}` : digits;
}
function walk(book, side, units) {
  const levels = (side === "long" ? book.asks : book.bids).slice().sort((a,b) => side === "long" ? a[0]-b[0] : b[0]-a[0]);
  let left = units, cost = 0, worst = null;
  for (const [price, size] of levels) {
    if (!(price > 0) || !(size > 0)) continue;
    const take = Math.min(left,size); cost += take*price; left -= take; worst = price;
    if (left <= Math.max(1e-12,units*1e-12)) break;
  }
  if (left > Math.max(1e-12,units*1e-12) || !worst) throw new Error("insufficient live Phoenix orderbook depth for this size");
  return { entryPrice: cost/units, notionalUsd: cost, worstPrice: worst, slot: book.slot };
}
export async function perpQuote({ market, side, usd, leverage }) {
  if (side !== "long" && side !== "short") throw new Error('side must be "long" or "short"');
  usd = Number(usd); leverage = Number(leverage);
  if (!Number.isFinite(usd) || usd <= 0 || !Number.isFinite(leverage) || leverage < 1) throw new Error("usd must be positive and leverage must be at least 1");
  const m = await marketOf(market);
  if (m.status !== "active") throw new Error(`Phoenix market is ${m.status}`);
  if (!(m.markPrice > 0)) throw new Error("Phoenix mark price is unavailable");
  if (!Number.isFinite(usd*leverage) || usd*leverage > 1e12) throw new Error("order size is out of range");
  const lots = baseUnitsToBaseLotsWithMarketParams(usd*leverage/m.markPrice,m);
  if (lots <= 0n || lots > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("order size rounds below one base lot or exceeds safe precision");
  const tier = m.leverageTiers.find(t => lots <= BigInt(t.maxSizeBaseLots));
  if (!tier || leverage > tier.maxLeverage) throw new Error(`leverage exceeds size tier maximum (${tier?.maxLeverage ?? "no available tier"})`);
  const baseUnits = baseLotsToBaseUnits(lots,m.baseLotsDecimals);
  const execution = walk(await bookOf(m.market),side,baseUnits);
  const fee = execution.notionalUsd*m.takerFeeRate;
  const liquidationPrice = calculateLiquidationPriceUsd({ positionSize: side === "long" ? baseUnits : -baseUnits,
    entryPriceUsd: execution.entryPrice, leverage: tier.maxLeverage, maintenanceMarginBps: m.riskFactors.maintenanceBps,
    upnlRiskFactorBps: m.riskFactors.upnlBps, collateralUsd: usd-fee });
  return { venue:id, cluster:"mainnet-beta", mode:"read-only-mainnet", market:m.market, side, collateralUsd:usd,
    leverage, baseLots:lots.toString(), baseUnits, baseUnitsDecimal:lotsDecimal(lots,m.baseLotsDecimals), ...execution, markPrice:m.markPrice,
    priceImpactPct:(execution.entryPrice/m.markPrice-1)*100, fee, feeRate:m.takerFeeRate,
    feeBasis:"standard taker fee; account discounts are not assumed", funding:m.funding,
    liquidationPrice, liquidationBasis:"SDK estimate for this position alone with the requested USD collateral, after entry fee; excludes other account positions, orders, SOL collateral and future funding",
    maxLeverage:tier.maxLeverage, observedAt:m.observedAt };
}
export const quote = perpQuote;
export async function price(market) { return (await marketOf(market)).markPrice; }
async function traderState(authority, traderPdaIndex) {
  return cached(`trader:${authority}:${traderPdaIndex}`, () => usingClient(c => c.api.traders().getTraderStateSnapshot(authority,{traderPdaIndex})));
}
export async function positions(authority, options = {}) {
  authority = authorityKey(authority);
  const traderPdaIndex = index(options.traderPdaIndex,"PHOENIX_TRADER_PDA_INDEX");
  const [state, markets] = await Promise.all([traderState(authority,traderPdaIndex),perpMarkets()]);
  if (state.snapshot.capabilities.state === "uninitialized") throw new Error("Setup required: PHOENIX_AUTHORITY (register and fund this Phoenix trader before opening positions)");
  const bySymbol = new Map(markets.map(m=>[m.market,m]));
  return state.snapshot.subaccounts.flatMap(sub => sub.positions.flatMap(p => {
    const lots = BigInt(p.basePositionLots);
    if (!lots) return [];
    const m = bySymbol.get(p.symbol);
    if (!m) throw new Error(`position market metadata unavailable: ${p.symbol}`);
    const units = baseLotsToBaseUnits(lots,m.baseLotsDecimals);
    const entry = p.entryPriceUsd == null ? Number(p.entryPriceTicks)*m.tickSize*10**m.baseLotsDecimals/1e6 : Number(p.entryPriceUsd);
    return [{ authority, traderPdaIndex, subaccountIndex:sub.subaccountIndex, market:p.symbol,
      side:lots>0n?"long":"short", baseLots:lots.toString(), baseUnits:Math.abs(units), baseUnitsDecimal:lotsDecimal(lots,m.baseLotsDecimals), entryPrice:entry,
      markPrice:m.markPrice, notionalUsd:m.markPrice==null?null:Math.abs(units)*m.markPrice,
      unrealizedPnlUsd:m.markPrice==null?null:units*(m.markPrice-entry), unsettledFundingQuoteLots:p.unsettledFundingQuoteLots,
      accountCollateralQuoteLots:sub.collateral, cluster:"mainnet-beta", slot:state.slot }];
  }));
}
export const balances = positions;
function web3Instruction(ix) {
  if (ix.programAddress !== PROGRAM.toBase58()) throw new Error("unexpected program in Phoenix order instruction");
  return new TransactionInstruction({ programId:PROGRAM, data:Buffer.from(ix.data),
    keys:ix.accounts.map(a=>({ pubkey:new PublicKey(a.address), isSigner:!!(a.role&2), isWritable:!!(a.role&1) })) });
}
async function orderInstruction({authority,market,side,baseUnits,priceLimit,reduceOnly,traderPdaIndex,subaccountIndex}) {
  return usingClient(async c => {
    const snapshot = await c.exchange.ready();
    if (snapshot.exchange.programId !== PROGRAM.toBase58()) throw new Error("unexpected Phoenix exchange deployment");
    const orderPacket = await c.orderPackets.buildMarketOrderPacket({ symbol:market,
      side:side==="long"?Side.Bid:Side.Ask, baseUnits:String(baseUnits), priceLimitUsd:String(priceLimit),
      orderFlags:reduceOnly?OrderFlags.ReduceOnly:OrderFlags.None });
    const ix = await c.ixs.buildPlaceMarketOrder({ authority,symbol:market,orderPacket,traderPdaIndex,traderSubaccountIndex:subaccountIndex });
    return { instruction:web3Instruction(ix), orderPacket };
  });
}
async function serialize(authority, instruction, metadata, rebuild, request) {
  const connection = await simulationConnection(), latest = await connection.getLatestBlockhash();
  const message = new TransactionMessage({ payerKey:new PublicKey(authority), recentBlockhash:latest.blockhash,
    instructions:[ComputeBudgetProgram.setComputeUnitLimit({units:1400000}),instruction] }).compileToV0Message();
  const unsignedTx = Buffer.from(new VersionedTransaction(message).serialize()).toString("base64");
  return { unsignedTx, signWith:authority, ...latest, ...metadata, cluster:"mainnet-beta", mode:"read-only-mainnet", signing:"external",
    ...(request ? walletHandoff(authority,rebuild,{ label:"xorrpad Phoenix · mainnet — review before signing", variable:"PHOENIX_PUBLIC_URL", path:"/perps/request" }) : {}) };
}
function tolerance(value = 100) {
  if (!Number.isInteger(value) || value < 0 || value > 1000) throw new Error("slippageBps must be an integer from 0 to 1000");
  return value;
}
export async function buildOpen(input, { request = true } = {}) {
  const authority = authorityKey(input.authority), slippageBps = tolerance(input.slippageBps);
  const traderPdaIndex = index(input.traderPdaIndex,"PHOENIX_TRADER_PDA_INDEX"), subaccountIndex = index(input.subaccountIndex,"PHOENIX_SUBACCOUNT_INDEX");
  const q = await perpQuote(input), m = await marketOf(q.market);
  if (m.isolatedOnly && subaccountIndex === 0) throw new Error("Setup required: PHOENIX_SUBACCOUNT_INDEX (an isolated subaccount is required for this market)");
  const built = await orderInstruction({authority,market:q.market,side:q.side,baseUnits:q.baseUnitsDecimal,
    priceLimit:q.worstPrice*(1+(q.side==="long"?1:-1)*slippageBps/10000),reduceOnly:false,traderPdaIndex,subaccountIndex});
  const state = await traderState(authority,traderPdaIndex);
  const setupRequirements = state.snapshot.capabilities.state === "uninitialized"
    ? ["Setup required: PHOENIX_AUTHORITY (registered, enabled and funded Phoenix trader)"] : [];
  return serialize(authority,built.instruction,{quote:q,slippageBps,traderPdaIndex,subaccountIndex,reduceOnly:false,setupRequirements,
    collateralNote:"USD is the sizing budget; this order does not deposit or transfer collateral. Actual leverage is account-wide."},
    ()=>buildOpen({...input,authority,traderPdaIndex,subaccountIndex},{request:false}),request);
}
export async function buildClose(input, { request = true } = {}) {
  const authority = authorityKey(input.authority), m = await marketOf(input.market), slippageBps = tolerance(input.slippageBps);
  const rows = (await positions(authority,input)).filter(p=>p.market===m.market && (input.subaccountIndex==null || p.subaccountIndex===Number(input.subaccountIndex)));
  if (!rows.length) throw new Error("no open Phoenix position in the requested market/subaccount");
  if (rows.length>1) throw new Error("specify subaccountIndex to close one of multiple positions in this market");
  const p = rows[0], side = p.side==="long"?"short":"long", execution = walk(await bookOf(m.market),side,p.baseUnits);
  const built = await orderInstruction({authority,market:m.market,side,baseUnits:p.baseUnitsDecimal,
    priceLimit:execution.worstPrice*(1+(side==="long"?1:-1)*slippageBps/10000),reduceOnly:true,traderPdaIndex:p.traderPdaIndex,subaccountIndex:p.subaccountIndex});
  return serialize(authority,built.instruction,{market:m.market,side,baseUnits:p.baseUnits,reduceOnly:true,slippageBps,
    traderPdaIndex:p.traderPdaIndex,subaccountIndex:p.subaccountIndex},()=>buildClose({...input,authority,traderPdaIndex:p.traderPdaIndex,subaccountIndex:p.subaccountIndex},{request:false}),request);
}
