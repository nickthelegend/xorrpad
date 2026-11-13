// Pixel-for-pixel firmware texture. The draw code is compiled from ui.h, never reimplemented.
let modulePromise;
export function firmwareModule() {
  return (modulePromise ||= import(
    /* @vite-ignore */ "/desktop/firmware-screen.js"
  ).then((m) => m.default({ locateFile: (f) => "/desktop/" + f })));
}
export async function drawFirmware(
  canvas,
  { device, status = {}, chart, pending, now = Date.now() } = {},
) {
  const m = await firmwareModule();
  m._screen_reset();
  const s = { ...device?.status, ...status };
  const fields = {
    ...s,
    ok: !!device,
    hasPnl: s.unrealised != null,
    pending: !!pending,
    link: device?.link || "",
    signalId: pending?.id || "",
    signalDeadline: pending ? Math.max(0, pending.expiresAt - now) : 0,
  };
  fields.killed=device?.killed===true;
  const flatten=device?.flatten;
  if(flatten && fields.killed){
    Object.assign(fields,{flattenId:flatten.id,flattenState:flatten.state,flattenMessage:flatten.message,
      flattenOrders:flatten.orders,flattenPerps:flatten.perps,flattenOutcomes:flatten.outcomes,
      flattenRemaining:Math.max(0,(flatten.remainingMs || 0)-(now-Date.parse(flatten.observedAt)))});
    flatten.rows?.forEach((row,i)=>fields[`flattenRow${i}`]=row);
  }
  if(device?.view?.screen==='ambient' && device.ambient && now-Date.parse(device.ambient.observedAt)<90000){
    const a=device.ambient;
    Object.assign(fields,{ambientVisible:true,ambientEpoch:a.epoch+Math.max(0,Math.floor((now-Date.parse(a.observedAt))/1000)),ambientPrice:a.price ?? '',ambientPnl:a.pnl ?? '',ambientFunding:a.nextFunding ?? '',ambientHours:a.hours,ambientCrew:a.crew});
    a.closes?.forEach((v,i)=>fields[`ambientClose${i}`]=v);
  }
  const tilt=device?.tiltGuard;
  if(tilt) {
    const elapsed=Math.max(0,Math.floor((now-Date.parse(tilt.observedAt))/1000));
    const fresh=elapsed<15;
    Object.assign(fields,{tiltBlocked:tilt.blocked || !fresh,tiltReason:fresh?tilt.reason:'Setup required: refresh pad state',
      tiltRemaining:Math.max(0,tilt.remainingSeconds-elapsed),tiltDuration:tilt.durationSeconds,
      tiltAllowed:pending?.proposal?.signal?.reduceOnly===true});
  }
  const guard=device?.liqGuard;
  if(guard?.active && now-Date.parse(guard.observedAt)<30000)Object.assign(fields,{liqActive:true,liqMarket:guard.market,liqVenue:guard.proposal?.venue,liqMark:guard.mark,liqPrice:guard.liq,liqDistance:guard.distancePct});
  const perps=device?.perps;
  if(perps) {
    fields.perpsMessage=perps.message || '';
    if(now-Date.parse(perps.observedAt)<30000) {
      fields.positionsScreen=!pending && !guard?.active && Math.floor(now/6000)%2===1;
      perps.positions?.slice(0,6).forEach((p,i)=>Object.assign(fields,{[`perpRow${i}Market`]:p.market,[`perpRow${i}Venue`]:p.venue,[`perpRow${i}Side`]:p.side,
        [`perpRow${i}Entry`]:p.entry ?? '',[`perpRow${i}Mark`]:p.mark ?? '',[`perpRow${i}Leverage`]:p.leverage ?? '',[`perpRow${i}Liq`]:p.liq ?? '',[`perpRow${i}Distance`]:p.distancePct ?? '',[`perpRow${i}Funding`]:p.nextFunding ?? ''}));
    }
  }
  const predict=device?.predict, market=now-Date.parse(predict?.observedAt)<(predict?.validForMs ?? 30000)?predict?.markets?.[device?.predictSelected || 0]:null;
  if(predict)Object.assign(fields,{predictEnabled:predict.enabled,predictMessage:predict.message,predictSize:predict.sizeUsd || 1,predictTotal:predict.total || 0,predictOffset:predict.offset || 0,
    ...(market?{predictQuestion:market.question,predictProbability:market.probability,predictChange:market.change24h ?? "",
      predictClosesIn:Math.max(0,market.closesIn-Math.floor((now-Date.parse(predict.observedAt))/1000))}:{})});
  const outcomes=device?.outcomePositions;
  if(outcomes && predict?.enabled) {
    Object.assign(fields,{outcomeVisible:true,outcomeMessage:outcomes.message || ""});
    outcomes.positions?.forEach((p,i)=>Object.assign(fields,{[`outcomeRow${i}Question`]:p.name,[`outcomeRow${i}Yes`]:p.yes,[`outcomeRow${i}No`]:p.no}));
  }
  if (pending) {
    fields.signalReduceOnly=pending.proposal.signal.reduceOnly===true;
    fields.market = pending.proposal.signal.symbol;
    fields.verdict =
      pending.proposal.signal.side.toUpperCase() +
      " · " +
      pending.proposal.verdict.why.join(" · ");
  }
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
        chart.symbol || s.market || "",
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
