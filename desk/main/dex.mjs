/**
 * dex.mjs — turning a decision into a real fill on Base.
 *
 * One route, and it is the one every fill reports:
 *   uniswap — a direct SwapRouter02 `exactInputSingle`. Needs no API key, so a
 *             real fill is always possible with nothing but an RPC.
 *
 * An aggregator (0x, then 1inch) is Phase 2 of PLAN.md and is not here yet.
 * Until it is, `ONEINCH_API_KEY` changes nothing about how a swap executes and
 * must not change what a fill claims — the route on a fill is read back off the
 * mined receipt's `to`, so it cannot drift from what actually happened.
 *
 * The transaction is signed and mined; nothing here is simulated.
 */
import { parseAbi, formatUnits, parseUnits, erc20Abi, maxUint256 } from "viem";
import { pub, wallet, account, IS_FORK, requireSigner } from "./chain.mjs";
import { TOKENS } from "./tokens.mjs";
import { pick, bySpender, quoteAll, margin, byName } from "./routers/index.mjs";

/**
 * The route a fill reports is derived from the router the transaction actually
 * went to, never from which API key happens to be set.
 *
 * This used to read `ONEINCH_KEY ? "1inch" : "uniswap"` while `swap()` only ever
 * called Uniswap V3 — so setting ONEINCH_API_KEY made every fill *claim* a 1inch
 * route it had not taken. There is no 1inch call in this codebase yet. A label
 * that can disagree with the receipt is worse than no label.
 */
const ROUTERS = bySpender();

/** What the chain says executed this. `to` comes off the mined receipt. */
export function routeOf(to) {
  return ROUTERS.get(String(to || "").toLowerCase()) || `unknown router ${to}`;
}

/** The router this build will actually trade through. */
export const ROUTE = pick().name;

const wethAbi = parseAbi([
  "function deposit() external payable",
  "function withdraw(uint256) external",
]);

const addr = (s) => (TOKENS[s].native ? TOKENS.WETH.address : TOKENS[s].address);

/**
 * Wait for a receipt, and fail in a way an operator can act on.
 *
 * A submitted transaction that never confirms is not a fill, and viem's raw
 * timeout ("Timed out while waiting…") tells the operator nothing about what
 * to do with the money. Name the step, name the hash, and say plainly that it
 * was submitted but not mined, so nothing downstream books it as filled.
 */
async function mined(hash, step) {
  try {
    return await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
  } catch (e) {
    throw new Error(
      `${step} was submitted but never confirmed (${hash}). ` +
      `Nothing was booked. The node may be wedged — check it before retrying.`);
  }
}

/**
 * Best Uniswap quote.
 *
 * markets.mjs already records the deepest tier for each market, measured. Try
 * that first and stop: scanning all four tiers on every quote turned one swap
 * into a dozen archive calls against the fork, which is what wedged it. The
 * full scan stays as the fallback for a pair with no recorded tier.
 */
export async function quote(sell, buy, amountIn) {
  return pick().quote(sell, buy, amountIn);
}

/**
 * Gas, with room to breathe.
 *
 * viem sends exactly what eth_estimateGas returned. That estimate is taken
 * against the state at the time of the call, and the transaction then executes
 * a block later against state that can cost more — one extra initialised tick
 * to cross, or a cold storage slot a fork still has to fetch from upstream. A
 * $25 AERO round trip reverted at 145851 gas of a 147653 limit: 98.8% used, out
 * of gas, and on mainnet that is real money burned for no fill. Replaying the
 * identical call with a normal budget succeeded.
 *
 * So estimate here and add a margin. If the estimate itself fails, return
 * undefined and let viem try — the send will surface the real reason.
 */
async function gasFor(call) {
  try {
    // A router returns either a viem contract call or raw calldata. An
    // aggregator has no ABI to encode against — it hands back bytes.
    const est = call.data
      ? await pub.estimateGas({ ...call, account })
      : await pub.estimateContractGas({ ...call, account });
    return (est * 130n) / 100n;
  } catch {
    return undefined;
  }
}

async function ensureWeth(amountRaw) {
  const bal = await pub.readContract({ address: TOKENS.WETH.address, abi: erc20Abi,
    functionName: "balanceOf", args: [account.address] });
  if (bal >= amountRaw) return null;
  const call = { address: TOKENS.WETH.address, abi: wethAbi, functionName: "deposit",
                 value: amountRaw - bal };
  const hash = await wallet.writeContract({ ...call, gas: await gasFor(call) });
  await mined(hash, "the ETH wrap");
  return hash;
}

async function ensureAllowance(token, spender, amountRaw) {
  const cur = await pub.readContract({ address: token, abi: erc20Abi,
    functionName: "allowance", args: [account.address, spender] });
  if (cur >= amountRaw) return null;
  const call = { address: token, abi: erc20Abi, functionName: "approve",
                 args: [spender, maxUint256] };
  const hash = await wallet.writeContract({ ...call, gas: await gasFor(call) });
  await mined(hash, "the token approval");
  return hash;
}

/**
 * Price impact for a given size, measured the only way that is honest: quote
 * the trade, quote a tenth of it, and compare the prices.
 *
 * This exists because DEGEN was in the pad's allowlist and a $500 order moves
 * its pool 240%. A memory-shaped risk limit says what you are ALLOWED to trade;
 * only the pool says what you can trade without destroying yourself on the way
 * in. Both have to agree.
 */
export async function priceImpact(sell, buy, amountIn) {
  const small = Number(amountIn) / 10;
  if (small <= 0) return { impact: 0, ok: true };
  try {
    const [big, ref] = await Promise.all([quote(sell, buy, amountIn), quote(sell, buy, small)]);
    const pxBig = big.amountOut / Number(amountIn);
    const pxRef = ref.amountOut / small;
    if (pxRef <= 0) return { impact: 0, ok: true, unknown: true };
    // Negative impact = you got a better rate than the small order, which is
    // just rounding. What matters is how much WORSE the full size prices.
    const impact = (pxRef - pxBig) / pxRef;
    // Hand back the full-size quote. swap() used to re-quote the identical
    // trade a third time: a wasted round trip against a rate-limited fork on
    // every swap, and a real inconsistency — the price the gate measured was
    // not the one minOut was computed from.
    return { impact, ok: impact <= MAX_IMPACT, pxBig, pxRef, quote: big };
  } catch (e) {
    // A risk control that cannot measure must fail CLOSED. Returning "fine" on
    // an unquotable pool let exactly the trade this gate exists to stop go
    // through and fail on-chain instead.
    return { impact: null, ok: false, unknown: true, reason: String(e.message || e).slice(0, 90) };
  }
}

/** A trade may not move the pool more than this. */
export const MAX_IMPACT = Number(process.env.MAX_PRICE_IMPACT || 0.02);

/** What we can actually spend of `sell` right now, in human units. */
export async function spendable(sell) {
  const t = TOKENS[sell];
  if (t.native) {
    const wei = await pub.getBalance({ address: account.address });
    const gasBuffer = parseUnits("0.01", 18);          // leave room for gas
    // A buy of ETH settles in WETH, so that is where a position actually
    // lives. Count it: selling has to see the ETH it just bought, not only
    // the native balance we keep for gas.
    const weth = await pub.readContract({ address: TOKENS.WETH.address, abi: erc20Abi,
      functionName: "balanceOf", args: [account.address] });
    const native = wei > gasBuffer ? wei - gasBuffer : 0n;
    return Number(formatUnits(native + weth, 18));
  }
  const raw = await pub.readContract({ address: t.address, abi: erc20Abi,
    functionName: "balanceOf", args: [account.address] });
  return Number(formatUnits(raw, t.decimals));
}

/**
 * Default slippage tolerance, by where the trade is going.
 *
 * Measured against the real mainnet quoter on 2026-09-09
 * (test/mainnet-conditions.mjs): USDC->WETH price impact in the 0.05% pool is
 * 0.0000% at $1, 0.0002% at $100 and 0.0020% at $1,000. So the 1% that was
 * used everywhere is not "about right" — it is ~500x wider than the pool
 * needs, and on mainnet the whole of that gap is the sandwich window, paid for
 * out of our own fill.
 *
 * It stays 1% on a fork, where the only thing a tight bound can do is fail a
 * demo swap over drift that costs nobody anything. On mainnet it drops to
 * 0.3%: still ~150x the measured impact, so it absorbs genuine price movement
 * between quote and inclusion on a 2-second chain, while being far too tight
 * to be worth sandwiching at these sizes.
 */
export const DEFAULT_SLIPPAGE_PCT = IS_FORK ? 1 : 0.3;

/**
 * Execute the swap. Returns the mined transaction hash and the observed
 * balance delta — we assert the tokens actually moved, not just that a tx
 * landed.
 */
export async function swap(sell, buy, amountIn, { slippagePct = DEFAULT_SLIPPAGE_PCT } = {}) {
  requireSigner(`a ${sell}->${buy} swap`);
  let router = pick();
  // Memory says what you are ALLOWED to trade; the chain says what you can
  // actually afford. Check both, or the router reverts with STF.
  const have = await spendable(sell);
  if (have < Number(amountIn))
    throw new Error(`insufficient ${sell}: need ${amountIn}, have ${have.toFixed(6)}`);
  // The pool has to be deep enough for this size, not merely to exist.
  const imp = await priceImpact(sell, buy, amountIn);
  if (!imp.ok)
    throw new Error(imp.unknown
      ? `${buy} pool depth could not be measured, so the trade is refused (${imp.reason})`
      : `${buy} pool too thin: ${amountIn} ${sell} would move the price ` +
        `${(imp.impact * 100).toFixed(1)}% (limit ${(MAX_IMPACT * 100).toFixed(0)}%)`);

  // priceImpact already quoted this exact trade; reuse it rather than asking
  // the node the same question again.
  let q = imp.quote || await quote(sell, buy, amountIn);

  // Best execution, unless a router was named explicitly. Every usable router
  // quotes the same trade and the best one wins; the losers are kept so the
  // choice can be audited afterwards rather than taken on trust. A router that
  // fails here is recorded with its reason and simply does not win — an
  // unreachable aggregator degrades to the direct pool instead of failing the
  // fill. The depth check above stays on the direct pool deliberately: it is a
  // safety limit, and an aggregator splitting across venues would hide exactly
  // the thinness it exists to catch.
  let comparison = null;
  if (!process.env.ROUTER) {
    const ranked = await quoteAll(sell, buy, amountIn);
    if (ranked.best && ranked.best.out > q.amountOut) { router = ranked.best.router; q = ranked.best.quote; }
    const m = margin(ranked);
    comparison = {
      chose: router.name,
      wonBy: m == null ? null : Number((m * 100).toFixed(4)),
      quotes: ranked.all.map((x) => ({ router: x.name, out: x.quote ? x.out : null,
                                       venues: x.quote?.venues || null, ms: x.ms, error: x.error || null })),
    };
  }

  const via = { sell, buy, amountIn, slippagePct, comparison, fellBack: null };
  if (router.name === "uniswap") return swapVia(router, q, via);

  // An aggregator can fail in more ways than the direct pool, and none of them
  // should cost the operator a trade the pool can still fill:
  //
  //   - it quotes LIVE mainnet, while a fork drifts away from mainnet the
  //     moment it trades, so its calldata can revert against local state;
  //   - it refuses some senders outright (anvil's default account among them);
  //   - it is a network hop, and networks fail.
  //
  // So try it, and on ANY failure fall back to the direct pool — which only
  // ever reads the chain it is about to trade on. Never silently: the fill
  // carries what it fell back from and why.
  try {
    return await swapVia(router, q, via);
  } catch (e) {
    const direct = byName("uniswap");
    if (!direct) throw e;
    const why = String(e.message || e);
    const dq = await direct.quote(sell, buy, amountIn);
    return swapVia(direct, dq, { ...via, fellBack: { from: router.name, why: why.slice(0, 180) } });
  }
}

/**
 * Execute one quote through one router: approve, send, mine, and verify the
 * balance actually moved.
 *
 * Separate from swap() so a route that reverts can be retried through another
 * router without re-running the affordability and depth checks, which have not
 * changed and cost real RPC calls.
 */
async function swapVia(router, q, { sell, buy, amountIn, slippagePct, comparison, fellBack }) {
  const tOut = TOKENS[buy];
  const minOut = q.amountOutRaw * BigInt(Math.floor((100 - slippagePct) * 100)) / 10000n;
  const steps = {};

  if (TOKENS[sell].native) steps.wrap = await ensureWeth(q.amountInRaw);

  // A JS double cannot hold an 18-decimal balance. spendable() rounds
  // 201017173684167191602 wei to 201.0171736841672, and parsing that back gives
  // ...200000 — 8398 wei MORE than the wallet owns. So "sell everything" asked
  // the router to pull more than existed and Uniswap reverted with the opaque
  // string "STF". Clamp to what is actually held: at wei scale the quote is
  // unchanged, and minOut's slippage buffer is millions of times larger than
  // the difference.
  const pull = addr(sell);
  const rawHeld = await pub.readContract({ address: pull, abi: erc20Abi,
    functionName: "balanceOf", args: [account.address] });
  const amountInRaw = q.amountInRaw > rawHeld ? rawHeld : q.amountInRaw;

  steps.approve = await ensureAllowance(pull, router.spender, amountInRaw);

  const outAddr = TOKENS[buy].native ? TOKENS.WETH.address : tOut.address;
  const before = await pub.readContract({ address: outAddr, abi: erc20Abi,
    functionName: "balanceOf", args: [account.address] });

  const call = await router.buildSwap({ sell, buy, amountInRaw, minOut, quote: q });
  let hash;
  try {
    // Raw calldata from an aggregator goes out as a plain transaction; a
    // contract call goes through writeContract. Same wallet, same gas margin.
    hash = call.data
      ? await wallet.sendTransaction({ ...call, gas: await gasFor(call) })
      : await wallet.writeContract({ ...call, gas: await gasFor(call) });
  } catch (e) {
    // "STF" is SafeTransferFrom failing — the router could not pull the input.
    // Unexplained, it sends an operator hunting through liquidity for a problem
    // that is really a balance or an allowance.
    if (/\bSTF\b/.test(String(e?.message || e)))
      throw new Error(
        `the ${sell}->${buy} swap was refused before sending: the router could not pull ` +
        `${amountIn} ${sell} from the wallet (STF — balance or allowance short). Nothing was sent.`);
    throw e;
  }
  const receipt = await mined(hash, `the ${sell}->${buy} swap`);
  // A reverted transaction still gets a receipt. Say so, rather than reporting
  // the symptom ("balance did not move") and leaving the cause unnamed.
  if (receipt.status !== "success")
    throw new Error(`the ${sell}->${buy} swap reverted on chain (${hash}). Nothing was booked.`);
  const after = await pub.readContract({ address: outAddr, abi: erc20Abi,
    functionName: "balanceOf", args: [account.address] });

  const delta = after - before;
  if (delta <= 0n) throw new Error(`swap mined but ${buy} balance did not move`);

  return {
    route: routeOf(receipt.to), comparison, fellBack: fellBack || null,
    hash, status: receipt.status, block: Number(receipt.blockNumber),
    gasUsed: Number(receipt.gasUsed), fee: q.fee, steps,
    sold: `${formatUnits(amountInRaw, TOKENS[sell].decimals)} ${sell}`,
    received: Number(formatUnits(delta, tOut.decimals)),
    receivedSymbol: buy,
    explorer: IS_FORK ? "(local fork)" : `https://basescan.org/tx/${hash}`,
  };
}
