// Pixel-for-pixel firmware texture. The draw code is compiled from ui.h, never reimplemented.
let modulePromise;
export function firmwareModule() {
  return (modulePromise ||= import(
    /* @vite-ignore */ "/desktop/firmware-screen.js"
  ).then((m) => m.default({ locateFile: (f) => "/desktop/" + f })));
}
// Values come from the records written to this pad, never from a recomputed proposal.
export function firmwareFields({device, status = {}, now = Date.now()} = {}) {
  const records=device?.screenRecords || {}, view=device?.view;
  const age=r=>Math.max(0,now-Date.parse(r?.observedAt || '')) || 0;
  const frameMillis=view?.millis==null?0:(view.millis+age(view))>>>0;
  const at=r=>(frameMillis-age(r))>>>0;
  const sent=[records.status,records.pulse].filter(Boolean).sort((a,b)=>(a.sequence || 0)-(b.sequence || 0));
  const s=Object.assign({},status,device?.status,...sent);
  const signal=records.signal;
  const remaining=signal?Math.max(0,signal.remainingMs-age(signal)):0;
  const fields={...s,frameMillis,ok:!!device,hasPnl:s.unrealised!=null,
    pending:!!signal && remaining>0,link:device?.link || '',killed:device?.killed===true,
    signalId:signal?.signalId || '',signalDeadline:(frameMillis+remaining)>>>0};
  if(signal){
    const t=signal.trusted || {};
    Object.assign(fields,{market:signal.market,venue:signal.venue,verdict:`${signal.side} $${Number(signal.sizeUsd).toFixed(2)} ${signal.why || ''}`,
      autoAccept:signal.autoAccept,signalSide:t.side ?? signal.side,signalSize:t.size ?? Number(signal.sizeUsd).toFixed(2),
      signalPrice:t.price || '',signalFee:t.fee || '',fingerprint:signal.fingerprint || '',
      signalReduceOnly:signal.reduceOnly===true,holdRequired:Number(t.size ?? signal.sizeUsd)>Number(signal.holdThreshold ?? 100)});
  }
  const fund=records.fund, portfolio=records.portfolio;
  if(view?.screen==='fund' && fund)Object.assign(fields,{fundVisible:true,fundAddress:fund.address,fundUri:fund.uri,fundCluster:fund.cluster});
  if(view?.screen==='portfolio' && portfolio){
    Object.assign(fields,{portfolioVisible:true,portfolioMessage:portfolio.message || '',portfolioCluster:portfolio.cluster,portfolioTotal:portfolio.totalUsd ?? ''});
    portfolio.rows?.slice(0,5).forEach((r,i)=>Object.assign(fields,{[`portfolioRow${i}Symbol`]:r.symbol,[`portfolioRow${i}Amount`]:r.amount,[`portfolioRow${i}Usd`]:r.usd ?? ''}));
  }
  const flatten=records.flatten || device?.flatten;
  if(flatten && fields.killed){
    Object.assign(fields,{flattenId:flatten.id,flattenState:flatten.state,flattenMessage:flatten.message,
      flattenOrders:flatten.orders,flattenPerps:flatten.perps,flattenOutcomes:flatten.outcomes,
      flattenRemaining:flatten.remainingMs || 0,flattenAt:at(flatten),flattenPage:view?.screen==='flatten'?view.selected:0});
    flatten.rows?.forEach((row,i)=>fields[`flattenRow${i}`]=row);
  }
  const ambient=records.ambient || device?.ambient;
  if(view?.screen==='ambient' && ambient){
    Object.assign(fields,{ambientVisible:true,ambientAt:at(ambient),ambientEpoch:ambient.epoch,ambientPrice:ambient.price ?? '',ambientPnl:ambient.pnl ?? '',ambientFunding:ambient.nextFunding ?? '',ambientHours:ambient.hours,ambientCrew:ambient.crew});
    ambient.closes?.forEach((v,i)=>fields[`ambientClose${i}`]=v);
  }
  if(view?.screen==='journal'){
    fields.journalVisible=true;fields.journalHealthy=device.journal?.healthy ?? false;fields.journalSelected=view.selected || 0;
    device.journal?.entries?.forEach((r,i)=>{for(const k of ['id','time','action','market','size','venue','result','signature','reason'])fields[`journalRow${i}${k[0].toUpperCase()+k.slice(1)}`]=r[k];});
  }
  const scan=records.scan || device?.scan;
  if(view?.screen==='scan' && scan){
    fields.scanSummary=scan.summary;fields.scanAt=records.scan?at(scan):(frameMillis-Math.max(0,now-device.scanAt))>>>0;
    fields.scanChecked=scan.checkedCount;fields.scanUnavailable=scan.unavailableCount;
    fields.scanTop=scan.top ? `${scan.top.side} ${scan.top.symbol} / ${scan.top.strategy}` : '';
    scan.markets?.forEach((m,i)=>Object.assign(fields,{[`scanMarket${i}`]:m.symbol,[`scanError${i}`]:m.error || ''}));
  }
  const tilt=device?.tiltGuard;
  if(tilt){
    const elapsed=Math.floor(age(tilt)/1000),fresh=elapsed<15;
    Object.assign(fields,{tiltBlocked:tilt.blocked || !fresh,tiltReason:fresh?tilt.reason:'Setup required: refresh pad state',
      tiltRemaining:Math.max(0,tilt.remainingSeconds-elapsed),tiltDuration:tilt.durationSeconds,
      tiltAllowed:signal?.reduceOnly===true});
  }
  const guard=records.liq_guard || device?.liqGuard;
  if(guard)Object.assign(fields,{liqActive:guard.active===true,liqAt:at(guard),liqMarket:guard.market,liqVenue:guard.proposal?.venue,liqMark:guard.mark,liqPrice:guard.liq,liqDistance:guard.distancePct});
  const perps=records.perps || device?.perps;
  if(perps){
    fields.perpsMessage=perps.message || '';fields.perpsAt=at(perps);
    fields.positionsScreen=view?.screen==='positions' && view.millis==null; // Clocked pads use their automatic firmware pages.
    perps.positions?.slice(0,6).forEach((p,i)=>{for(const [key,value] of Object.entries({Market:p.market,Venue:p.venue,Side:p.side,Entry:p.entry,Mark:p.mark,Leverage:p.leverage,Liq:p.liq,Distance:p.distancePct,Funding:p.nextFunding}))fields[`perpRow${i}${key}`]=value ?? '';});
  }
  fields.positionCount=s.positions ?? -1;
  s.positionDetails?.slice(0,8).forEach((p,i)=>Object.assign(fields,{[`spotRow${i}Market`]:p.market,[`spotRow${i}Qty`]:p.qty,[`spotRow${i}Pnl`]:p.pnl ?? ''}));
  const predict=records.predict || device?.predict;
  const selected=view?.screen==='predict'?view.selected:device?.predictSelected || 0;
  const market=predict?.markets?.[selected];
  if(predict)Object.assign(fields,{predictEnabled:predict.enabled,predictAt:at(predict),predictMessage:predict.message,predictSize:predict.sizeUsd || 1,predictValidFor:predict.validForMs ?? 30000,predictTotal:predict.total || 0,predictOffset:(predict.offset || 0)+selected,
    ...(market?{predictQuestion:market.question,predictProbability:market.probability,predictChange:market.change24h ?? '',predictClosesIn:market.closesIn}:{})});
  const outcomes=records.outcome_positions || device?.outcomePositions;
  if(outcomes && view?.screen==='outcomes'){
    Object.assign(fields,{outcomeVisible:true,outcomeMessage:outcomes.message || ''});
    outcomes.positions?.forEach((p,i)=>Object.assign(fields,{[`outcomeRow${i}Question`]:p.name,[`outcomeRow${i}Yes`]:p.yes,[`outcomeRow${i}No`]:p.no}));
  }
  return fields;
}
export async function drawFirmware(canvas, input = {}) {
  const m=await firmwareModule(), fields=firmwareFields(input);
  const {chart}=input;
  m._screen_reset();
  for (const [k, v] of Object.entries(fields))
    if (v != null && typeof v !== "object")
      m.ccall(
        "screen_set",
        null,
        ["string", "string"],
        [k, typeof v === "boolean" ? String(+v) : String(v)],
      );
  if (chart?.closes?.length) {
    for (const v of chart.closes.slice(-169))
      if (Number.isFinite(v)) m._screen_close(v);
    m.ccall(
      "screen_chart",
      null,
      ["string", "number", "number", "number"],
      [
        chart.symbol || fields.market || "",
        chart.price || 0,
        chart.change24h || 0,
        Number(chart.change24h != null),
      ],
    );
  }
  const ptr = m._screen_render(),
    px = new Uint16Array(m.HEAPU16.buffer, ptr, 320 * 240);
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext("2d"),
    im = ctx.createImageData(320, 240);
  px.forEach((v, i) =>
    im.data.set(
      [
        Math.round(((v >> 11) * 255) / 31),
        Math.round((((v >> 5) & 63) * 255) / 63),
        Math.round(((v & 31) * 255) / 31),
        255,
      ],
      i * 4,
    ),
  );
  ctx.putImageData(im, 0, 0);
  return canvas;
}
