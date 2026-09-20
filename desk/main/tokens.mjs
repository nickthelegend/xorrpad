/** tokens.mjs — the Base tokens the pad may touch. Addresses are Base mainnet
 *  (chain 8453); the fork inherits them, which is why fills there are real.
 *
 *  The tradeable set is defined in markets.mjs, where every entry carries the
 *  measured price impact that earned it a place. This file adds only the two
 *  things that are not markets in their own right: native ETH (gas, and what a
 *  WETH position unwraps to) and USDC (the quote asset everything prices in).
 */
import { MARKETS, DELISTED } from "./markets.mjs";

const BASE_TOKENS = {
  ETH:  { symbol: "ETH",  address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", decimals: 18, native: true },
  WETH: { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  USDC: { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, quote: true },
};

export const TOKENS = { ...BASE_TOKENS };
for (const [sym, m] of Object.entries(MARKETS)) {
  // ETH is already present as the native token; its market entry supplies the
  // pool's fee tier rather than a second, conflicting definition.
  if (TOKENS[sym]) { TOKENS[sym].fee = m.fee; TOKENS[sym].class = m.class; continue; }
  TOKENS[sym] = { symbol: sym, address: m.address, decimals: m.decimals, fee: m.fee, class: m.class };
}
TOKENS.WETH.fee = MARKETS.ETH.fee;

export const bySymbol = (s) => TOKENS[s] || null;
export { MARKETS, DELISTED };

export const UNISWAP_V3 = {
  router: "0x2626664c2603336E57B271c5C0b26F421741e481", // SwapRouter02, Base
  quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a", // QuoterV2, Base
  // 100 is included because ETH/USDC's deepest pool on Base is the 0.01% tier.
  fees: [100, 500, 3000, 10000],
};
