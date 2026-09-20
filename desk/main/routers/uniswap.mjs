/**
 * routers/uniswap.mjs — a direct Uniswap V3 SwapRouter02 call.
 *
 * The only router this build can actually execute, and the only one that needs
 * no API key: an RPC is enough, so a real fill is always possible.
 *
 * A router owns exactly two things — what a trade is worth (`quote`) and the
 * transaction that performs it (`buildSwap`). Everything around them is the
 * same whoever routes: the balance clamp, the allowance, the gas margin,
 * waiting for the receipt and checking the balance really moved. Those live in
 * dex.mjs and are not duplicated per router, because they are where the
 * expensive bugs were.
 */
import { parseAbi, formatUnits, parseUnits } from "viem";
import { pub, account } from "../chain.mjs";
import { TOKENS, UNISWAP_V3 } from "../tokens.mjs";

export const name = "uniswap";

/** No credential to check — this is the path that always works. */
export function available() { return true; }

/** The contract that pulls the input token, and so the one to approve. */
export const spender = UNISWAP_V3.router;

const routerAbi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
]);
const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 ticksCrossed,uint256 gasEstimate)",
]);

// Native ETH has a sentinel address with no pool behind it. Every pool is
// against WETH, and swap() wraps before trading, so quote against WETH too —
// quoting the sentinel returns "no Uniswap V3 pool for ETH->USDC", which reads
// as a liquidity problem rather than an address one.
const addr = (s) => (TOKENS[s].native ? TOKENS.WETH.address : TOKENS[s].address);

/**
 * Best price across the fee tiers.
 *
 * The tier measured deepest for a token is tried first and wins immediately;
 * the rest are a fallback, not a survey, because each one is an RPC round trip
 * against a rate-limited fork.
 */
export async function quote(sell, buy, amountIn) {
  const tIn = TOKENS[sell], tOut = TOKENS[buy];
  const amt = parseUnits(String(amountIn), tIn.decimals);
  const known = tIn.fee ?? tOut.fee;
  const tiers = known ? [known, ...UNISWAP_V3.fees.filter((f) => f !== known)] : UNISWAP_V3.fees;
  let best = null, stalled = false;
  for (const fee of tiers) {
    try {
      const { result } = await pub.simulateContract({
        address: UNISWAP_V3.quoter, abi: quoterAbi, functionName: "quoteExactInputSingle",
        args: [{ tokenIn: addr(sell), tokenOut: addr(buy), amountIn: amt, fee,
                 sqrtPriceLimitX96: 0n }],
        account: account.address,
      });
      const out = result[0];
      if (!best || out > best.amountOutRaw) best = { fee, amountOutRaw: out };
      if (fee === known) break;              // the measured-deepest tier answered
    } catch (e) {
      // A tier with no pool and a node that did not answer look identical here,
      // and calling a timeout "no pool" sends you hunting for a liquidity
      // problem that does not exist. Keep them apart.
      const m = String(e?.message || e);
      if (/timed out|took too long|fetch failed|ECONNREFUSED/i.test(m)) stalled = true;
    }
  }
  if (!best && stalled)
    throw new Error(`could not quote ${sell}->${buy}: the Base node did not answer. This is not a liquidity problem.`);
  if (!best) throw new Error(`no Uniswap V3 pool for ${sell}->${buy}`);
  return {
    route: name, fee: best.fee,
    amountIn, amountInRaw: amt,
    amountOut: Number(formatUnits(best.amountOutRaw, tOut.decimals)),
    amountOutRaw: best.amountOutRaw,
    price: Number(formatUnits(best.amountOutRaw, tOut.decimals)) / Number(amountIn),
  };
}

/**
 * The viem call that performs the swap. Returns a call rather than sending one:
 * the caller owns the gas margin, the send and the receipt check.
 */
export function buildSwap({ sell, buy, amountInRaw, minOut, quote: q, recipient = account.address }) {
  return {
    address: UNISWAP_V3.router, abi: routerAbi, functionName: "exactInputSingle",
    args: [{ tokenIn: addr(sell), tokenOut: addr(buy), fee: q.fee, recipient,
             amountIn: amountInRaw, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }],
  };
}
