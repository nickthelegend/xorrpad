/**
 * chain.mjs — Base, for real.
 *
 * CHAIN_MODE=fork    -> a local anvil fork of Base mainnet. Real contracts,
 *                       real liquidity, real signed transactions, no real money.
 *                       This exists because 1inch (and most Base liquidity)
 *                       has no testnet, so a fork is the only honest way to
 *                       execute a real fill without spending funds.
 * CHAIN_MODE=mainnet -> the actual chain. Auto-trade is refused here; every
 *                       fill needs an explicit confirmation.
 */
import { createPublicClient, createWalletClient, http, formatUnits, parseUnits, erc20Abi } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { TOKENS } from "./tokens.mjs";

export const MODE = process.env.CHAIN_MODE || "fork";
export const IS_FORK = MODE === "fork";
const RPC = process.env.RPC_URL || (IS_FORK ? "http://127.0.0.1:8545" : "https://mainnet.base.org");

// anvil's first account — a well-known throwaway, only ever used on the fork.
const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const KEY = process.env.AGENT_PRIVATE_KEY || (IS_FORK ? ANVIL_KEY : null);
if (!IS_FORK && KEY === ANVIL_KEY) throw new Error("refusing to use the anvil key on mainnet");

/**
 * Mainnet with no signing key is READ-ONLY, not an error.
 *
 * Refusing to start at all meant the only way to look at real mainnet — real
 * prices, real equities, the B20 behaviour that a fork cannot show — was to put
 * a funded private key on the machine first. That is a bad trade: it forces the
 * riskiest step to come before the safest one.
 *
 * So: no key on mainnet means the app runs and can read, and every path that
 * would sign refuses by name. `WATCH_ADDRESS` gives it a wallet to read
 * balances for without giving it the ability to spend them.
 */
export const READ_ONLY = !IS_FORK && !KEY;

export const account = KEY ? privateKeyToAccount(KEY) : (
  process.env.WATCH_ADDRESS
    ? { address: process.env.WATCH_ADDRESS, readOnly: true }
    : { address: "0x0000000000000000000000000000000000000000", readOnly: true });

/** Every signing path calls this first. It never returns on a read-only chain. */
export function requireSigner(what = "this") {
  if (READ_ONLY)
    throw new Error(
      `${what} needs a signing key, and this is a read-only mainnet session. ` +
      `Set AGENT_PRIVATE_KEY to trade — reads work without one on purpose, so ` +
      `the chain can be inspected before a key is ever put on the machine.`);
}

// A fork answers from local state until it has to fetch an uncached slot from
// upstream, and a rate-limited upstream turns one read into a 30s stall. Give
// the transport a real timeout and a couple of retries so a slow node degrades
// into a readable error instead of hanging a trade.
// 8s x 2 attempts. A UI that polls every 4s must never sit behind a 60s stall:
// a slow node has to surface as a readable error quickly, not as a hang.
const transport = http(RPC, { timeout: 8_000, retryCount: 1, retryDelay: 300 });
export const pub = createPublicClient({ chain: base, transport });
// No key means no wallet. Anything reaching for one is a bug, and should say so
// rather than signing with a zero address.
export const wallet = READ_ONLY ? null : createWalletClient({ account, chain: base, transport });

/** Is the node actually answering? Used to tell "no fill" from "no node". */
export async function chainReachable() {
  try { await pub.getBlockNumber(); return true; } catch { return false; }
}

export async function chainInfo() {
  const [id, block] = await Promise.all([pub.getChainId(), pub.getBlockNumber()]);
  return { mode: MODE, rpc: RPC, chainId: id, block: Number(block), address: account.address };
}

export async function balances(symbols = Object.keys(TOKENS)) {
  // One round trip per token, run together rather than in a queue. Sequentially
  // this was eight waits deep on every poll, which is what tipped the node over
  // under concurrent trades.
  const wanted = symbols.filter((s) => TOKENS[s]);
  const reads = await Promise.all(wanted.map(async (s) => {
    const t = TOKENS[s];
    const raw = t.native
      ? await pub.getBalance({ address: account.address })
      : await pub.readContract({ address: t.address, abi: erc20Abi,
                                 functionName: "balanceOf", args: [account.address] });
    return [s, { raw, amount: Number(formatUnits(raw, t.decimals)) }];
  }));
  return Object.fromEntries(reads);
}

/**
 * Fund the agent on the fork so it can actually trade. No-op on mainnet.
 *
 * ETH alone is not a funded wallet. Every buy in this app spends the quote
 * asset, and anvil's account #0 holds no USDC in Base mainnet state — so the
 * only USDC the fork ever had was whatever an earlier session happened to swap
 * into it and leave behind in --state. Round-trip a few times and it drains to
 * dust, and the next swap dies with "insufficient USDC: need 5, have 0.000001",
 * which reads like an app bug and is really an empty test wallet.
 *
 * So top the quote asset up too — through the app's own Uniswap route, so the
 * balance is come by honestly rather than poked into a storage slot.
 */
export async function fundOnFork(eth = "5", { minUsdc = 200 } = {}) {
  if (!IS_FORK) return { funded: false, reason: "not a fork" };
  const hex = "0x" + parseUnits(eth, 18).toString(16);
  // A raw fetch with no timeout. A wedged node made this hang forever, so
  // boot-time funding never finished and never reported — the server came up
  // serving an unfunded wallet in silence. Everything that touches this node
  // gets a deadline.
  await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "anvil_setBalance",
                           params: [account.address, hex] }) });

  let usdc = 0, swapped = null;
  try {
    const read = async () => Number(formatUnits(await pub.readContract({
      address: TOKENS.USDC.address, abi: erc20Abi, functionName: "balanceOf",
      args: [account.address] }), TOKENS.USDC.decimals));
    usdc = await read();
    if (usdc < minUsdc) {
      // dex.mjs imports this module, so the import has to stay lazy.
      const { swap } = await import("./dex.mjs");
      const f = await swap("ETH", "USDC", 0.5);
      swapped = f.hash;
      usdc = await read();
    }
  } catch (e) {
    return { funded: true, eth, usdc, quoteAsset: String(e.message || e).slice(0, 110) };
  }
  return { funded: true, eth, usdc, swapped };
}

export { formatUnits, parseUnits, erc20Abi };
