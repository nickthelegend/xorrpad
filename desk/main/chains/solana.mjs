/**
 * chains/solana.mjs — the pad's Solana venue: xStocks through Jupiter.
 *
 * Deliberately dependency-free. Everything here is `fetch` against two public
 * endpoints — Jupiter for routing and a Solana RPC for state — so the desk app
 * gains a whole chain without gaining a single package. There is no keypair in
 * this file and no code path that can sign anything; see SIGNING below.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SIGNING — what this module will and will not do
 *
 * It quotes, it prices, it reads balances, and it builds an unsigned
 * transaction. It never signs and never submits. The pad shows the verdict, the
 * operator presses ✓, and the unsigned transaction is handed to a wallet the
 * human controls.
 *
 * That is not a limitation dressed up as a feature — it is the honest shape for
 * a device that sits on a desk within reach of anyone who walks past it. The
 * gate in decide.mjs decides whether a trade is allowed; a person still decides
 * whether it happens.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { XSTOCKS, REJECTED, USDC, SOL, mintOf, isStock, SYMBOLS, marketHours } from "../xstocks.mjs";

export const id = "solana";
export const label = "Solana";
export const chainId = 501;                      // as OKX indexes it; Solana has no EVM chain id

const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const JUP = process.env.JUPITER_API || "https://lite-api.jup.ag";
const UA = { "user-agent": "xorrpad/1.0", accept: "application/json" };

/** The watched address. Read-only: knowing it grants nothing. */
export const address = process.env.SOLANA_ADDRESS || "";

export function available() { return true; }     // needs no credential to quote

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

async function rpc(method, params = []) {
  const r = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json", ...UA },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!r.ok) throw new Error(`solana rpc ${method}: HTTP ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(`solana rpc ${method}: ${j.error.message}`);
  return j.result;
}

async function jup(path, params) {
  const u = new URL(JUP + path);
  for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, String(v));
  const r = await fetch(u, { headers: UA });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`jupiter ${path}: HTTP ${r.status}${body?.error ? ` — ${body.error}` : ""}`);
  if (body?.error) throw new Error(`jupiter ${path}: ${body.error}`);
  return body;
}

/** Slot, and whether the chain is answering at all. */
export async function info() {
  const slot = await rpc("getSlot");
  return { chain: id, label, chainId, slot, address, rpc: RPC.replace(/\/\/.*@/, "//"), signing: "external" };
}

/**
 * What the watched address holds, in human units.
 *
 * Only the verified book is reported. An arbitrary SPL token turning up in a
 * wallet is not a position the pad knows how to price, and listing it as one
 * would be inventing a number.
 */
export async function balances() {
  if (!address) return {};
  const out = {};
  const lamports = await rpc("getBalance", [address]).catch(() => null);
  const sol = lamports == null ? 0 : (lamports.value ?? lamports) / 1e9;
  // Zero is not a position. Listing it put an empty SOL row in the desk UI's
  // holdings and then priced it, which is two kinds of noise for no signal.
  if (sol > 0) out.SOL = { amount: sol, decimals: 9 };

  const byMint = new Map();
  for (const program of [TOKEN_PROGRAM, TOKEN_2022]) {
    const res = await rpc("getTokenAccountsByOwner",
      [address, { programId: program }, { encoding: "jsonParsed" }]).catch(() => null);
    for (const acc of res?.value || []) {
      const i = acc.account?.data?.parsed?.info;
      if (!i) continue;
      const prev = byMint.get(i.mint) || 0;
      byMint.set(i.mint, prev + Number(i.tokenAmount?.uiAmount || 0));
    }
  }
  const known = { [USDC.mint]: "USDC", ...Object.fromEntries(Object.entries(XSTOCKS).map(([s, t]) => [t.mint, s])) };
  for (const [mint, amount] of byMint) {
    const sym = known[mint];
    if (sym && amount > 0) out[sym] = { amount, decimals: mint === USDC.mint ? 6 : 8 };
  }
  return out;
}

/**
 * Price a trade through Jupiter.
 *
 * `amountIn` is human units of `sell`. The returned `price` is always quoted in
 * USDC per share so the display never has to guess which way round a pair is.
 */
export async function quote(sell, buy, amountIn) {
  const a = mintOf(sell), b = mintOf(buy);
  const raw = BigInt(Math.round(Number(amountIn) * 10 ** a.decimals));
  if (raw <= 0n) throw new Error(`quote: amount must be positive, got ${amountIn}`);

  const q = await jup("/swap/v1/quote", {
    inputMint: a.mint, outputMint: b.mint, amount: raw.toString(),
    slippageBps: Number(process.env.SLIPPAGE_BPS || 100), restrictIntermediateTokens: true,
  });

  const amountOut = Number(q.outAmount) / 10 ** b.decimals;
  if (!(amountOut > 0)) throw new Error(`jupiter returned no route for ${sell} -> ${buy}`);
  const route = [...new Set((q.routePlan || []).map((r) => r.swapInfo?.label).filter(Boolean))];

  // USDC per unit of the other side, whichever direction the trade runs. The
  // last branch used to be a bare amountOut/amountIn, which is the right number
  // for a stock and the reciprocal for everything else — so a $40 SOL quoted as
  // "$0.01" the moment a non-equity pair went through here.
  const priced = sell === "USDC" ? buy : sell;
  const price = sell === "USDC" ? Number(amountIn) / amountOut
                                : amountOut / Number(amountIn);

  return {
    venue: "jupiter", chain: id, sell, buy,
    amountIn: Number(amountIn), amountOut, price, priced,
    impactPct: Number(q.priceImpactPct || 0) * 100,
    route: route.join(" → ") || "direct",
    slippageBps: q.slippageBps,
    raw: q,                                      // carried so buildSwap quotes once, not twice
  };
}

/** Spot price of one share in USDC, sized so the number is a real fill. */
export async function price(symbol, notional = 50) {
  const q = await quote("USDC", symbol, notional);
  return q.price;
}

/**
 * Build the unsigned transaction for a quote. Never signs, never submits.
 *
 * Returns base64 of a Solana versioned transaction with the operator's address
 * as fee payer, ready for a wallet to sign. Without an address there is nothing
 * to build, and saying so is better than returning something unusable.
 */
export async function buildSwap(q, signer = address) {
  if (!signer) throw new Error("no SOLANA_ADDRESS — nothing to build a transaction for");
  const r = await fetch(`${JUP}/swap/v1/swap`, {
    method: "POST", headers: { "content-type": "application/json", ...UA },
    body: JSON.stringify({
      quoteResponse: q.raw, userPublicKey: signer,
      dynamicComputeUnitLimit: true, dynamicSlippage: true,
    }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.swapTransaction)
    throw new Error(`jupiter swap build failed: HTTP ${r.status}${j?.error ? ` — ${j.error}` : ""}`);
  return {
    unsignedTx: j.swapTransaction,               // base64 VersionedTransaction
    lastValidBlockHeight: j.lastValidBlockHeight,
    prioritizationFeeLamports: j.prioritizationFeeLamports,
    signWith: signer,
    note: "unsigned — the pad does not hold this key",
  };
}

/** Executing is not this module's job, and the error says so plainly. */
export async function swap() {
  throw new Error(
    "solana: the pad builds the transaction but never signs it — press ✓ to hand it to your wallet");
}

/** The markets this chain offers, with the state of the exchange behind them. */
export function markets() {
  const h = marketHours();
  return { symbols: SYMBOLS, quoteAsset: "USDC", hours: h, kind: "tokenized-equity" };
}

export { marketHours, SYMBOLS, XSTOCKS, REJECTED };

/** Alias so the chain registry can read every venue's book the same way. */
export const TOKENS = XSTOCKS;
