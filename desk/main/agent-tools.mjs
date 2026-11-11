/** Tools only read or propose. Acceptance, signing and policy writes are absent. */
import { validateBacktest } from './backtest.mjs';
import { validatePrediction } from './prediction-backtest.mjs';
const object = (properties={},required=[]) => ({type:'object',properties,required,additionalProperties:false});
const str = {type:'string',minLength:1}, number = {type:'number',exclusiveMinimum:0};
const trade = {kind:{enum:['spot','perp','predict']},market:str,side:{enum:['buy','sell','long','short','yes','no']},size:number,leverage:{type:'number',minimum:1}};
export const TOOLS = [
  {name:'route',description:'Compare real venue quotes. Size is input units for spot, USD collateral for perps, devnet mUSDC for predictions.',parameters:object(trade,['kind','market','side','size'])},
  {name:'propose_trade',description:'Create a signal through the memory and permissions gate. This is not execution; manual acceptance and a signature may still be required.',parameters:object({...trade,reason:str},['kind','market','side','size','reason'])},
  {name:'positions',description:'Read actual wallet balances and remembered positions, Phoenix perps, or devnet pm-AMM shares.',parameters:object({venue:{enum:['spot','phoenix','pmamm']},owner:str},['venue'])},
  {name:'pm_markets',description:'Read live devnet pm-AMM markets.',parameters:object()},
  {name:'pm_stats',description:'Read actual pm-AMM creator transaction statistics.',parameters:object()},
  {name:'backtest',description:'Replay real GeckoTerminal pool history, with labelled Pyth fallback. Default kind=strategy uses BOOK names, book, or rule, and requires venue (phoenix/jupperps/jupiter). kind=predict requires strike and liquidityUsdc for a counterfactual pm-AMM curve; liquidity is a model input. Fees use current real schedules; funding omissions and slippage are disclosed.',parameters:object({
    kind:{enum:['strategy','predict']},symbol:str,strategy:str,from:{type:'integer'},to:{type:'integer'},
    venue:{enum:['phoenix','jupperps','jupiter']},resolution:{enum:['1','5','15','30','60','120','240','1D']},
    initialCash:number,tradeUsd:number,slippageBps:{type:'number',minimum:0,maximum:1000},
    rule:object({name:str,side:{enum:['long','short']},entry:{type:'array',items:ruleCondition()},exit:{type:'array',items:ruleCondition()},
      stopPct:number,takeProfitPct:number,maxHoldMin:number,requireUptrend:{type:'boolean'}},['name','entry']),
    strike:number,liquidityUsdc:number,lookback:{type:'integer',minimum:2,maximum:500},minEdgePct:{type:'number',minimum:0,maximum:100},
  },['symbol','from','to'])},
  {name:'explain_refusal',description:'Return the exact gate rule and reasons for a signal refusal.',parameters:object({signalId:str},['signalId'])},
];
function ruleCondition() {
  const value={anyOf:[{type:'number'},object({indicator:{enum:['close','sma','ema','rsi','returnPct','relativeVolume']},period:{type:'integer',minimum:2,maximum:500}},['indicator'])]};
  return object({left:value,op:{enum:['lt','lte','gt','gte']},right:value},['left','op','right']);
}
export function validateTool(name,args) {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) throw new Error('unknown agent tool');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('invalid tool arguments');
  const {properties,required} = tool.parameters;
  for (const key of required) if (!(key in args)) throw new Error(`tool requires ${key}`);
  for (const [key,value] of Object.entries(args)) {
    const p = properties[key];
    if (!p || (p.enum && !p.enum.includes(value)) ||
      (p.type === 'string' && (typeof value !== 'string' || !value.trim() || value.length > 1024)) ||
      (['number','integer'].includes(p.type) && (!Number.isFinite(value) || (p.type === 'integer' && !Number.isInteger(value)))) ||
      (p.type === 'object' && (!value || typeof value !== 'object' || Array.isArray(value))) ||
      (p.maximum != null && value > p.maximum) || (p.minimum != null && value < p.minimum) || (p.exclusiveMinimum != null && value <= p.exclusiveMinimum)) throw new Error(`invalid tool argument ${key}`);
  }
  if(name==='backtest') {
    const {kind,...input}=args;
    if(kind==='predict')validatePrediction(input);else validateBacktest(input);
  }
  return tool;
}
export async function executeTool(name,args,{request,signals}) {
  validateTool(name,args);
  const query = data => new URLSearchParams(data).toString();
  if (name === 'route') return request('/route?'+query(args));
  if (name === 'propose_trade') return request('/signals',args);
  if (name === 'positions') {
    if (args.venue === 'spot') return request('/portfolio');
    return request(args.venue === 'phoenix' ? '/perps/positions?'+query(args.owner?{authority:args.owner}:{}) : '/pm/positions?'+query(args.owner?{owner:args.owner}:{}));
  }
  if (name === 'pm_markets') return request('/pm/markets');
  if (name === 'pm_stats') return request('/pm/stats');
  if (name === 'backtest') {
    const {kind,...input}=args;
    return request(kind==='predict'?'/backtest/predict':'/backtest',input);
  }
  const signal = signals.get(args.signalId);
  if (!signal) throw new Error('signal not found');
  return {signalId:signal.id,state:signal.state,ruleId:signal.ruleId || signal.proposal.verdict.ruleId,
    why:signal.proposal.verdict.why,verdict:signal.proposal.verdict};
}
