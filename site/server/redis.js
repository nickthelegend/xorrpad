import { createHash } from "node:crypto";
import { HttpError, required } from "./http.js";

export function redisConfig() {
  const url = required("UPSTASH_REDIS_REST_URL");
  const token = required("UPSTASH_REDIS_REST_TOKEN");
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      throw new Error();
  } catch {
    throw new HttpError(503, "Setup required: valid UPSTASH_REDIS_REST_URL");
  }
  return { url, token };
}

export async function redis(command) {
  const { url, token } = redisConfig();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok)
    throw new HttpError(
      503,
      "Signup and reservation storage unavailable. Please try again later.",
    );
  const result = await response.json();
  if (result.error || !Object.hasOwn(result, "result"))
    throw new HttpError(
      503,
      "Signup and reservation storage unavailable. Please try again later.",
    );
  return result.result;
}

// Vercel supplies x-vercel-forwarded-for. Do not trust client x-forwarded-for.
export function clientKey(req) {
  const ip =
    process.env.VERCEL === "1"
      ? req.headers["x-vercel-forwarded-for"]?.split(",")[0]?.trim()
      : req.socket?.remoteAddress;
  if (!ip)
    throw new HttpError(
      503,
      "Unable to identify request. Please try again later.",
    );
  return createHash("sha256").update(ip).digest("hex");
}

export async function rateLimit(req, scope, limit = 5, window = 600) {
  const script =
    "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n";
  const hits = await redis([
    "EVAL",
    script,
    "1",
    `xorrpad:v1:rate:${scope}:${clientKey(req)}`,
    String(window),
  ]);
  if (!Number.isSafeInteger(hits) || hits < 1)
    throw new HttpError(503, "Rate limit service unavailable.");
  if (hits > limit)
    throw new HttpError(429, "Too many requests. Please try again later.");
}
