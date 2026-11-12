/** Capture a real public quote, never a made-up demo price, position or fill. */
import { quote } from "../../desk/main/chains/solana.mjs";
import { History } from "../../desk/main/history.mjs";
export async function captureScreen() {
  const q = await quote("USDC", "SOL", 50);
  if (!(q.price > 0))
    throw Error(
      "Setup required: a live public SOL/USDC quote for studio capture",
    );
  const capturedAt = new Date().toISOString(),
    to = Math.floor(Date.now() / 1000);
  let chart = null,
    chartError = null;
  try {
    const h = await new History().get({
      symbol: "SOL",
      from: to - 49 * 3600,
      to,
      resolution: "60",
    });
    const closes = h.candles.map((c) => c.close);
    chart = {
      symbol: "SOL",
      closes,
      price: closes.at(-1),
      change24h:
        closes.length > 24 ? (closes.at(-1) / closes.at(-25) - 1) * 100 : null,
      source: h.source,
    };
  } catch (e) {
    chartError = e.message;
  }
  return {
    capturedAt,
    market: "SOL",
    price: q.price,
    source:
      "Real Jupiter USDC → SOL quote, $50 input; no transaction built, signed or sent",
    quote: {
      venue: q.venue,
      route: q.route,
      contextSlot: q.raw.contextSlot,
      inputMint: q.raw.inputMint,
      outputMint: q.raw.outputMint,
      inAmount: q.raw.inAmount,
      outAmount: q.raw.outAmount,
    },
    chart,
    chartError,
    previewConfiguration: {
      agent: "Custom",
      link: "STUDIO SNAPSHOT",
      armed: false,
      remembers: true,
    },
    note: "Static artwork uses this timestamped public price snapshot. The preview configuration is art direction, not evidence of a connected pad, account balance, position or fill.",
  };
}
