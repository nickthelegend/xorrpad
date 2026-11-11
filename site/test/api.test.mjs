import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";
import { generateKeyPair, getAddressFromPublicKey } from "@solana/kit";
import { parseURL } from "@solana/pay";
import { localApi } from "../server/local-api.js";
import {
  newReservation,
  paymentUrl,
  preorderConfig,
} from "../server/preorder.js";
import { clientKey } from "../server/redis.js";
import { normalizeEmail } from "../api/waitlist.js";

// Isolated worker: never read .env or use inherited deployment credentials.
const envNames = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "PREORDER_PRICE_USDC",
  "PREORDER_MERCHANT_ADDRESS",
  "PREORDER_TERMS_URL",
  "PREORDER_NETWORK",
  "PREORDER_SOLANA_RPC_URL",
  "VERCEL",
];
for (const key of envNames) delete process.env[key];
let server;
let merchant;
const base = "http://127.0.0.1:8718";
before(async () => {
  merchant = await getAddressFromPublicKey((await generateKeyPair()).publicKey);
  server = await createServer({
    configFile: false,
    envDir: false,
    plugins: [localApi()],
    server: { host: "127.0.0.1", port: 8718, strictPort: true },
  });
  await server.listen();
});
after(async () => {
  await server?.close();
});

async function api(path, options) {
  const response = await fetch(`${base}/api/${path}`, options);
  assert.equal(response.headers.get("cache-control"), "no-store");
  return {
    status: response.status,
    headers: response.headers,
    data: await response.json(),
  };
}
const post = (value) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value),
});
function clearConfig() {
  for (const key of envNames) delete process.env[key];
}
// These are configuration-validation inputs, never published commercial terms.
function validConfigInput() {
  process.env.PREORDER_PRICE_USDC = "0.000001";
  process.env.PREORDER_MERCHANT_ADDRESS = merchant;
  process.env.PREORDER_TERMS_URL = "https://docs.solanapay.com/";
  process.env.PREORDER_NETWORK = "devnet";
}

test("waitlist GET and valid POST report the exact missing Upstash URL", async () => {
  clearConfig();
  for (const options of [
    undefined,
    post({ email: "reader@example.com", website: "" }),
  ]) {
    const result = await api("waitlist", options);
    assert.equal(result.status, 503);
    assert.deepEqual(result.data, {
      error: "Setup required: UPSTASH_REDIS_REST_URL",
    });
    assert.equal(Object.hasOwn(result.data, "count"), false);
  }
});

test("email validation rejects malformed input before any storage request", async () => {
  for (const email of [
    undefined,
    null,
    42,
    {},
    "",
    "x",
    "x@localhost",
    "x@@example.com",
    ".x@example.com",
    "x.@example.com",
    "x..y@example.com",
    "x@-example.com",
    "x@example-.com",
    "x@exa_mple.com",
    "x@example.com\nBcc:other@example.com",
    `${"x".repeat(65)}@example.com`,
    `x@${"z".repeat(64)}.com`,
    `${"x".repeat(240)}@example.com`,
  ]) {
    const result = await api("waitlist", post({ email }));
    assert.equal(result.status, 400, `Rejected ${JSON.stringify(email)}`);
  }
  assert.equal(
    normalizeEmail("  Reader+pad@Example.COM "),
    "reader+pad@example.com",
  );
});

test("honeypot rejects filled and non-string fields", async () => {
  for (const website of ["https://example.com", true, {}, 4]) {
    assert.equal(
      (await api("waitlist", post({ email: "reader@example.com", website })))
        .status,
      400,
    );
  }
});

test("request bodies enforce JSON, object shape and size", async () => {
  for (const path of ["waitlist", "preorder"]) {
    assert.equal(
      (await api(path, { method: "POST", body: "email=x" })).status,
      415,
    );
    assert.equal(
      (
        await api(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        })
      ).status,
      400,
    );
    for (const value of [null, [], "text", 5])
      assert.equal((await api(path, post(value))).status, 400);
    assert.equal(
      (await api(path, post({ email: "x".repeat(2050) }))).status,
      413,
    );
  }
});

test("all handlers reject unsupported methods and advertise allowed methods", async () => {
  for (const path of ["waitlist", "preorder", "preorder-status"]) {
    const result = await api(path, { method: "DELETE" });
    assert.equal(result.status, 405);
    assert.match(result.headers.get("allow"), /GET/);
  }
  assert.equal((await api("preorder-status", post({}))).status, 405);
});

test("missing Redis token is identified without contacting the configured URL", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.upstash.io";
  const result = await api("waitlist");
  assert.equal(result.status, 503);
  assert.equal(result.data.error, "Setup required: UPSTASH_REDIS_REST_TOKEN");
  clearConfig();
});

test("preorder and status setup never produce a URL, reference or receipt", async () => {
  for (const path of ["preorder", "preorder-status"]) {
    const result = await api(path);
    assert.equal(result.status, 503);
    assert.deepEqual(result.data, {
      error: "Setup required: PREORDER_PRICE_USDC",
    });
  }
  const result = await api("preorder", post({ termsAccepted: true }));
  assert.equal(result.status, 503);
  assert.equal(Object.hasOwn(result.data, "url"), false);
});

test("reservation creation requires explicit terms acceptance", async () => {
  for (const termsAccepted of [undefined, false, "true", 1]) {
    assert.equal((await api("preorder", post({ termsAccepted }))).status, 400);
  }
});

test("missing merchant, terms and storage block checkout in sequence", async () => {
  process.env.PREORDER_PRICE_USDC = "1";
  assert.equal(
    (await api("preorder")).data.error,
    "Setup required: PREORDER_MERCHANT_ADDRESS",
  );
  process.env.PREORDER_MERCHANT_ADDRESS = merchant;
  assert.equal(
    (await api("preorder")).data.error,
    "Setup required: PREORDER_TERMS_URL",
  );
  validConfigInput();
  const result = await api("preorder");
  assert.equal(result.status, 503);
  assert.equal(result.data.error, "Setup required: UPSTASH_REDIS_REST_URL");
  clearConfig();
});

test("invalid price, address, terms and network cannot enable checkout", async () => {
  for (const price of [
    "0",
    "-1",
    "NaN",
    "Infinity",
    "1e2",
    "01",
    "1.0000001",
    "1000000",
    "0x10",
  ]) {
    validConfigInput();
    process.env.PREORDER_PRICE_USDC = price;
    const result = await api("preorder");
    assert.equal(result.status, 503);
    assert.match(result.data.error, /valid PREORDER_PRICE_USDC/);
  }
  validConfigInput();
  process.env.PREORDER_MERCHANT_ADDRESS = "invalid";
  assert.match(
    (await api("preorder")).data.error,
    /valid PREORDER_MERCHANT_ADDRESS/,
  );
  for (const terms of [
    "PREORDER_TERMS_URL",
    "http://localhost/terms",
    "https://example.com/terms",
    "javascript:alert(1)",
    "https://name:password@solana.com",
  ]) {
    validConfigInput();
    process.env.PREORDER_TERMS_URL = terms;
    assert.match(
      (await api("preorder")).data.error,
      /published HTTPS PREORDER_TERMS_URL/,
    );
  }
  validConfigInput();
  process.env.PREORDER_NETWORK = "testnet";
  assert.match((await api("preorder")).data.error, /PREORDER_NETWORK/);
  clearConfig();
});

test("status validates public references, including repeated query parameters", async () => {
  for (const reference of [
    "",
    "invalid",
    "x".repeat(100),
    "11111111111111111111111111111111111111111111",
  ]) {
    assert.equal(
      (await api(`preorder-status?reference=${reference}`)).status,
      400,
    );
  }
  assert.equal(
    (await api("preorder-status?reference=a&reference=b")).status,
    400,
  );
  const result = await api(`preorder-status?reference=${merchant}`);
  assert.equal(result.status, 503);
  assert.equal(result.data.error, "Setup required: UPSTASH_REDIS_REST_URL");
});

test("reference generation and SDK URL parsing preserve exact USDC expectations", async () => {
  validConfigInput();
  const config = preorderConfig();
  const first = await newReservation(config);
  const second = await newReservation(config);
  assert.notEqual(first.reference, second.reference);
  assert.ok(first.termsAcceptedAt);
  assert.equal(
    Object.keys(first).some((key) => /secret|private/i.test(key)),
    false,
  );
  const url = paymentUrl(first);
  const parsed = parseURL(new URL(url));
  assert.equal(parsed.recipient, merchant);
  assert.equal(parsed.splToken, "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
  assert.equal(parsed.amount, 0.000001);
  assert.equal(new URL(url).searchParams.get("amount"), "0.000001");
  assert.deepEqual(parsed.reference, [first.reference]);
  assert.equal(parsed.memo, `xorrpad:${first.reference}`);
  process.env.PREORDER_PRICE_USDC = "0.000002";
  assert.notEqual(preorderConfig().version, config.version);
  // A saved reservation URL must stay unchanged after deployment config changes.
  assert.equal(paymentUrl(first), url);
  clearConfig();
});

test("rate-limit identity ignores spoofed forwarded headers locally and uses Vercel identity in deployment", () => {
  const req = {
    socket: { remoteAddress: "127.0.0.1" },
    headers: { "x-forwarded-for": "spoofed" },
  };
  const local = clientKey(req);
  assert.match(local, /^[0-9a-f]{64}$/);
  req.headers["x-forwarded-for"] = "different";
  assert.equal(clientKey(req), local);
  process.env.VERCEL = "1";
  assert.throws(() => clientKey(req), /Unable to identify/);
  req.headers["x-vercel-forwarded-for"] = "192.0.2.1";
  assert.notEqual(clientKey(req), local);
  delete process.env.VERCEL;
});

test("unknown API routes return JSON 404 rather than the static landing", async () => {
  assert.equal((await api("unknown")).status, 404);
});
