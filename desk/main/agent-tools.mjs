/** Tools only read or propose. Acceptance, signing and policy writes are absent. */
const object = (properties={},required=[]) => ({type:'object',properties,required,additionalProperties:false});
const str = {type:'string',minLength:1}, number = {type:'number',exclusiveMinimum:0};
const trade = {kind:{enum:['spot','perp','predict']},market:str,side:{enum:['buy','sell','long','short','yes','no']},size:number,leverage:{type:'number',minimum:1}};
export const TOOLS = [
  {name:'route',description:'Compare real venue quotes. Size is input units for spot, USD collateral for perps, devnet mUSDC for predictions.',parameters:object(trade,['kind','market','side','size'])},
  {name:'propose_trade',description:'Create a signal through the memory and permissions gate. This is not execution; manual acceptance and a signature may still be required.',parameters:object({...trade,reason:str},['kind','market','side','size','reason'])},
  {name:'positions',description:'Read actual wallet balances and remembered positions, Phoenix perps, or devnet pm-AMM shares.',parameters:object({venue:{enum:['spot','phoenix','pmamm']},owner:str},['venue'])},
  {name:'pm_markets',description:'Read live devnet pm-AMM markets.',parameters:object()},
  {name:'pm_stats',description:'Read actual pm-AMM creator transaction statistics.',parameters:object()},
  {name:'backtest',description:'Run the T6 engine on real historical candles. Requires the T6 backtest service.',parameters:object({symbol:str,strategy:str,from:{type:'integer'},to:{type:'integer'},venue:str,slippageBps:{type:'number',minimum:0}},['symbol','strategy','from','to','venue'])},
  {name:'explain_refusal',description:'Return the exact gate rule and reasons for a signal refusal.',parameters:object({signalId:str},['signalId'])},
];
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
      (p.minimum != null && value < p.minimum) || (p.exclusiveMinimum != null && value <= p.exclusiveMinimum)) throw new Error(`invalid tool argument ${key}`);
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
    try { return await request('/backtest',args); }
    catch (e) { if (e.status === 404) throw new Error('Setup required: T6 backtest engine'); throw e; }
  }
  const signal = signals.get(args.signalId);
  if (!signal) throw new Error('signal not found');
  return {signalId:signal.id,state:signal.state,ruleId:signal.ruleId || signal.proposal.verdict.ruleId,
    why:signal.proposal.verdict.why,verdict:signal.proposal.verdict};
}
