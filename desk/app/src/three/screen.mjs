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
  if (pending) {
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
