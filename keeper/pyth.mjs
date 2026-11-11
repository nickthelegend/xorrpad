/** Hermes payloads are evidence; no unsigned prices or alternate price APIs. */
export const HERMES = "https://hermes.pyth.network";
export const FEEDS = Object.freeze({
  SOL:"ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  BTC:"e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  ETH:"ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
});
export function parseHermes(response,symbol,requestedTime = "latest") {
  const feed=FEEDS[symbol];if(!feed)throw new Error("unsupported Pyth feed");
  const binary=response?.binary;
  if(!binary || !["hex","base64"].includes(binary.encoding) || !Array.isArray(binary.data) || !binary.data.length)
    throw new Error("Hermes signed binary.data is missing");
  for(const data of binary.data) {
    if(typeof data!=="string" || !data.length || (binary.encoding==="hex" ? !/^(?:[0-9a-fA-F]{2})+$/.test(data) : !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)))
      throw new Error("invalid Hermes signed update encoding");
  }
  const row=response.parsed?.find(r=>r.id?.replace(/^0x/,"").toLowerCase()===feed), price=row?.price;
  if(!price || !/^-?\d+$/.test(String(price.price)) || !/^\d+$/.test(String(price.conf)) || !Number.isInteger(price.expo) || price.expo < -18 || price.expo > 18 || !Number.isSafeInteger(price.publish_time))
    throw new Error("Hermes feed price/confidence/publish time is invalid");
  if(BigInt(price.price)<=0n)throw new Error("Pyth price must be positive");
  if(requestedTime!=="latest" && price.publish_time!==requestedTime)
    throw new Error(`UNRESOLVED: exact publish time unavailable (requested ${requestedTime}, returned ${price.publish_time})`);
  if(requestedTime==="latest" && (Date.now()/1000-price.publish_time>60 || price.publish_time>Date.now()/1000+5))
    throw new Error("Pyth creation price is stale or in the future");
  return {symbol,feedId:feed,rawPrice:String(price.price),rawConfidence:String(price.conf),exponent:price.expo,
    price:Number(price.price)*10**price.expo,confidence:Number(price.conf)*10**price.expo,publishTime:price.publish_time,
    hermes:response};
}
export async function fetchPrice(symbol,requestedTime = "latest") {
  if(!FEEDS[symbol])throw new Error("unsupported Pyth feed");
  if(requestedTime!=="latest" && (!Number.isSafeInteger(requestedTime) || requestedTime<=0))throw new Error("invalid Hermes publish time");
  const url=new URL(`/v2/updates/price/${requestedTime}`,HERMES);
  url.searchParams.append("ids[]",FEEDS[symbol]);url.searchParams.set("encoding","hex");url.searchParams.set("parsed","true");
  const headers={accept:"application/json"};
  if(process.env.PYTH_API_KEY)headers.authorization=`Bearer ${process.env.PYTH_API_KEY}`;
  const r=await fetch(url,{headers,signal:AbortSignal.timeout(20000),redirect:"error"});
  if(r.status===401 || r.status===403)throw new Error(`Setup required: PYTH_API_KEY (Hermes price endpoint returned HTTP ${r.status})`);
  if(!r.ok)throw new Error(`Hermes price endpoint HTTP ${r.status}`);
  return {...parseHermes(await r.json(),symbol,requestedTime),requestedTime,sourceUrl:url.href,retrievedAt:new Date().toISOString()};
}
