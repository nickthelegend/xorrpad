import { body, fail, HttpError, method, reply } from "../server/http.js";
import { rateLimit, redis, redisConfig } from "../server/redis.js";
import {
  newReservation,
  orderKey,
  paymentUrl,
  preorderConfig,
  rpcFor,
  verifyMerchant,
  verifyNetwork,
} from "../server/preorder.js";

export default async function preorder(req, res) {
  try {
    method(req, res, ["GET", "POST"]);
    const data = req.method === "POST" ? body(req) : null;
    if (data && data.termsAccepted !== true)
      throw new HttpError(
        400,
        "Read and accept the reservation and refund terms before paying.",
      );
    const config = preorderConfig();
    redisConfig();
    if (req.method === "GET")
      return reply(res, 200, { enabled: true, ...config });
    if (data.version !== config.version)
      throw new HttpError(
        409,
        "Reservation details changed. Reload and review the current terms and price.",
      );
    await rateLimit(req, "preorder");
    const rpc = rpcFor(config.network);
    await verifyNetwork(rpc, config.network);
    await verifyMerchant(rpc, config);
    const order = await newReservation(config);
    // Durable, immutable payment expectations survive environment changes and cold starts.
    // No expiry: a delayed wallet transfer must remain reconcilable.
    const saved = await redis([
      "SET",
      orderKey(order.reference),
      JSON.stringify(order),
      "NX",
    ]);
    if (saved !== "OK")
      throw new HttpError(
        503,
        "Unable to save reservation. No payment request was created.",
      );
    return reply(res, 201, { ...order, url: paymentUrl(order) });
  } catch (error) {
    if (error.status === 429) res.setHeader("Retry-After", "600");
    return fail(res, error);
  }
}
