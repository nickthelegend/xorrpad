/**
 * markets.mjs — every market the pad can actually trade, on Base.
 *
 * Nothing in this file is aspirational. Each entry was verified against a real
 * Uniswap V3 pool on a fork of Base mainnet: quote $50, quote $500, and compare
 * the two prices. A market is only listed if the larger order prices within 2%
 * of the smaller one — a pool existing is not the same as a pool being
 * tradeable.
 *
 * Measured on Base at block ~51005000:
 *
 *   market   class    fee     impact @ $500   verdict
 *   WETH     crypto   100      0.01%          listed
 *   cbBTC    crypto   500      0.00%          listed
 *   EURC     forex    500      0.01%          listed
 *   AERO     defi     500      0.10%          listed
 *   MORPHO   defi    10000     0.03%          listed
 *   VIRTUAL  ai       3000     0.01%          listed
 *   cbETH    crypto   3000     8.28%          REJECTED — too thin
 *   BRETT    meme    10000    52.00%          REJECTED — too thin
 *   DEGEN    meme     3000   239.70%          REJECTED — a $500 order moves it 240%
 *   wstETH   crypto     —      no quote       REJECTED
 *   WELL     defi       —      no V3 pool     REJECTED
 *   ONDO     rwa        —      no V3 pool     REJECTED
 *
 * DEGEN is the reason this file exists. It was in the pad's allowlist, and the
 * measurement says a $500 order moves its price 240%. Rerun the check with
 * `node test/liquidity.test.mjs` — liquidity moves, and a market that fails
 * should be delisted rather than traded through.
 *
 * ON STOCKS: there is no tokenized equity on Base with real Uniswap liquidity.
 * Issuers exist (Dinari's dShares are Base-native) but they are KYC-gated and
 * do not trade in permissionless AMM pools, so the pad cannot honestly quote
 * or fill them. EURC is the genuine non-crypto market here: it is a fully
 * reserved euro stablecoin, so ETH/EURC is a real EUR/USD forex position taken
 * on Base. If a tokenized equity ever gets a liquid V3 pool, it is one entry
 * in the table below and every strategy starts trading it unchanged.
 */

export const MARKETS = {
  ETH: {
    symbol: "ETH", label: "Ethereum", class: "crypto",
    address: "0x4200000000000000000000000000000000000006", decimals: 18,
    wrapsNative: true, fee: 100, binance: "ETHUSDT", impact500: 0.0001,
  },
  cbBTC: {
    symbol: "cbBTC", label: "Bitcoin (Coinbase-wrapped)", class: "crypto",
    address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8,
    fee: 500, binance: "BTCUSDT", impact500: 0.0000,
  },
  EURC: {
    symbol: "EURC", label: "Euro (Circle)", class: "forex",
    address: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42", decimals: 6,
    fee: 500, binance: "EURUSDT", impact500: 0.0001,
  },
  AERO: {
    symbol: "AERO", label: "Aerodrome", class: "defi",
    address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", decimals: 18,
    fee: 500, binance: "AEROUSDT", impact500: 0.0010,
  },
  MORPHO: {
    symbol: "MORPHO", label: "Morpho", class: "defi",
    address: "0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842", decimals: 18,
    fee: 10000, binance: "MORPHOUSDT", impact500: 0.0003,
  },
  VIRTUAL: {
    symbol: "VIRTUAL", label: "Virtuals Protocol", class: "ai",
    address: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b", decimals: 18,
    fee: 3000, binance: "VIRTUALUSDT", impact500: 0.0001,
  },
};

/** Markets that failed the depth check, kept so the refusal can be explained. */
export const DELISTED = {
  DEGEN: { reason: "a $500 order moves the pool 239.7%", impact500: 2.397 },
  BRETT: { reason: "a $500 order moves the pool 52.0%", impact500: 0.520 },
  cbETH: { reason: "a $500 order moves the pool 8.3%", impact500: 0.083 },
  wstETH: { reason: "no Uniswap V3 quote against USDC on Base" },
  WELL: { reason: "no Uniswap V3 pool against USDC on Base" },
  ONDO: { reason: "no Uniswap V3 pool against USDC on Base" },
};

export const CLASSES = ["crypto", "forex", "defi", "ai"];
export const SYMBOLS = Object.keys(MARKETS);
export const byClass = (c) => SYMBOLS.filter((s) => MARKETS[s].class === c);
export const isTradeable = (s) => Boolean(MARKETS[s]);
export const delistReason = (s) => DELISTED[s]?.reason || null;
