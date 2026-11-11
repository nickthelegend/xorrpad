/** Public recurring-market templates. Strikes use exact integer arithmetic. */
import { createHash } from "node:crypto";
export const TEMPLATES=Object.freeze([
  {symbol:"SOL",periodSeconds:3600,tickUsd:1},
  {symbol:"BTC",periodSeconds:3600,tickUsd:100},
  {symbol:"ETH",periodSeconds:86400,tickUsd:10},
]);
export function nextEnd(template,now=Math.floor(Date.now()/1000)) {
  let end=(Math.floor(now/template.periodSeconds)+1)*template.periodSeconds;
  if(end-now<360)end+=template.periodSeconds; // program minimum is 300s; leave room to build/confirm.
  return end;
}
export function strikeFor(price,tickUsd) {
  if(!Number.isSafeInteger(tickUsd) || tickUsd<=0)throw new Error("invalid strike tick");
  const numerator=BigInt(price.rawPrice)*(price.exponent>=0?10n**BigInt(price.exponent):1n);
  const denominator=price.exponent<0?10n**BigInt(-price.exponent):1n, tick=BigInt(tickUsd);
  return (((numerator+denominator*tick/2n)/(denominator*tick))*tick).toString();
}
export function questionFor(symbol,strike,endTs) {
  const iso=new Date(endTs*1000).toISOString(),time=iso.slice(11,endTs%60===0?16:19);
  const name=`${symbol} above $${strike} at ${time} UTC?`;
  if(Buffer.byteLength(name)>64)throw new Error("keeper question exceeds pm-AMM's 64-byte limit");
  return name;
}
export function marketIdFor(creator,template,endTs) {
  return createHash("sha256").update(`xorrpad:v1:${creator}:${template.symbol}:${template.periodSeconds}:${endTs}`).digest().readUIntBE(0,6);
}
export function depositAmount(value=process.env.KEEPER_DEPOSIT_USDC || "50") {
  if(!/^\d+(?:\.\d{1,6})?$/.test(String(value)))throw new Error("KEEPER_DEPOSIT_USDC must have at most six decimals");
  const amount=Number(value);
  if(!(amount>0) || !Number.isSafeInteger(Math.round(amount*1e6)))throw new Error("KEEPER_DEPOSIT_USDC must be positive and within raw-unit precision");
  return {human:amount,raw:BigInt(Math.round(amount*1e6))};
}
