/**
 * xstocks.mjs — tokenized US equities on Solana, and when Wall Street is shut.
 *
 * These are Backed Finance xStocks: SPL tokens, each collateralised 1:1 by a
 * real share held with a regulated custodian. Unlike the Base B20 equities in
 * stocks.mjs — which are implemented by the node itself and therefore cannot
 * exist on a fork — these are ordinary SPL mints. They quote, route and settle
 * like any other Solana token, which is why the pad can actually trade them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE IMPOSTORS
 *
 * Searching Jupiter for "TSLAx" returns three tokens. One is the real thing;
 * the others are pump.fun mints wearing the same ticker with a few thousand
 * dollars of liquidity behind them. Measured 2026-09-21:
 *
 *   TSLAx  XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB   $1,261,725   real
 *   TSLAx  EaxDDrLr3P2txZmgAgwaKD7sGSoZY4EZM9xFgtTbpump  $    3,110   impostor
 *   TSLAx  HMMxrskwSnXrMwX4xG6MTAnQ9BG3LPcJCeE2tsjtpump  $    2,953   impostor
 *
 * Every genuine xStock mint carries Backed's `Xs` vanity prefix; no impostor
 * did. So this file hardcodes the mint. The pad never resolves a ticker to an
 * address at runtime, because a symbol is not an identity and getting this
 * wrong means buying a worthless copy of Tesla.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHAT IS LISTED, AND WHY
 *
 * A pool existing is not a pool being tradeable. Each entry below was quoted at
 * $50 and again at $500 through Jupiter and the two prices compared; a market
 * is listed only if the larger order prices within 2% of the smaller one.
 * Measured 2026-09-21:
 *
 *   symbol   $50       $500      impact     route          verdict
 *   SPYx     768.04    768.06     0.00%     Raydium CLMM   listed
 *   QQQx     723.49    723.49    -0.00%     Riptide        listed
 *   NVDAx    221.60    221.67     0.03%     Riptide        listed
 *   AAPLx    335.63    335.72     0.03%     Raydium CLMM   listed
 *   TSLAx    364.14    364.14    -0.00%     Riptide        listed
 *   NFLXx    736.96    743.91     0.94%     Raydium CLMM   listed — thin but real
 *   JPMx     374.67   4124.79  1000.92%     Manifest       REJECTED
 *
 * JPMx is the whole reason for the check: $1,453 of liquidity, a ticker that
 * looks as legitimate as the rest, and a $500 order that pays eleven times the
 * going rate. It is excluded.
 */

/**
 * The verified book. `impact500` is the measured cost of a $500 order at the
 * time of listing — kept so a market going quietly thin is visible as drift
 * rather than discovered during a trade.
 */
export const XSTOCKS = {
  SPYx:   { mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", decimals: 8, impact500: 0.00003, venue: "Raydium CLMM", name: "S&P 500 ETF" },
  QQQx:   { mint: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ", decimals: 8, impact500: 0.00000, venue: "Riptide",      name: "Nasdaq 100 ETF" },
  NVDAx:  { mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", decimals: 8, impact500: 0.00030, venue: "Riptide",      name: "NVIDIA" },
  AAPLx:  { mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", decimals: 8, impact500: 0.00027, venue: "Raydium CLMM", name: "Apple" },
  TSLAx:  { mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", decimals: 8, impact500: 0.00000, venue: "Riptide",      name: "Tesla" },
  MSFTx:  { mint: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX", decimals: 8, impact500: 0.00002, venue: "Raydium CLMM", name: "Microsoft" },
  AMZNx:  { mint: "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg", decimals: 8, impact500: 0.00021, venue: "Raydium CLMM", name: "Amazon" },
  GOOGLx: { mint: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN", decimals: 8, impact500: 0.00005, venue: "Whirlpool",    name: "Alphabet" },
  METAx:  { mint: "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu", decimals: 8, impact500: 0.00017, venue: "Whirlpool",    name: "Meta" },
  COINx:  { mint: "Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu", decimals: 8, impact500: 0.00049, venue: "Byreal",       name: "Coinbase" },
  HOODx:  { mint: "XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg", decimals: 8, impact500: 0.00029, venue: "Whirlpool",    name: "Robinhood" },
  MSTRx:  { mint: "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ", decimals: 8, impact500: 0.00025, venue: "Riptide",      name: "Strategy" },
  AMDx:   { mint: "XsXcJ6GZ9kVnjqGsjBnktRcuwMBmvKWh8S93RefZ1rF", decimals: 8, impact500: 0.00000, venue: "Manifest",     name: "AMD" },
  NFLXx:  { mint: "XsEH7wWfJJu2ZT3UCFeVfALnVA6CP5ur7Ee11KmzVpL", decimals: 8, impact500: 0.00942, venue: "Raydium CLMM", name: "Netflix" },
  CRCLx:  { mint: "XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1", decimals: 8, impact500: 0.00012, venue: "BinaryFi",     name: "Circle" },
  GLDx:   { mint: "Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re", decimals: 8, impact500: 0.00029, venue: "AlphaQ",       name: "Gold ETF" },
  WMTx:   { mint: "Xs151QeqTCiuKtinzfRATnUESM2xTU6V9Wy8Vy538ci", decimals: 8, impact500: 0.00239, venue: "Whirlpool",    name: "Walmart" },
};

/** Excluded, and why — kept visible so the omission reads as a decision. */
export const REJECTED = {
  JPMx: "a $500 order moves it 1000% — $1,453 of liquidity behind a real-looking ticker",
};

/** The quote asset everything is priced in. */
export const USDC = { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6, symbol: "USDC" };
export const SOL  = { mint: "So11111111111111111111111111111111111111112",  decimals: 9, symbol: "SOL" };

export const SYMBOLS = Object.keys(XSTOCKS);
export const isStock = (s) => Object.hasOwn(XSTOCKS, s);

/** Mint for a symbol. Throws rather than guessing — see THE IMPOSTORS above. */
export function mintOf(symbol) {
  if (symbol === "USDC") return USDC;
  if (symbol === "SOL") return SOL;
  const t = XSTOCKS[symbol];
  if (!t) {
    const why = REJECTED[symbol];
    throw new Error(why ? `${symbol} is not traded here: ${why}`
                        : `${symbol} is not a verified xStock — the pad only trades its hardcoded book`);
  }
  return { mint: t.mint, decimals: t.decimals, symbol };
}

// ─────────────────────────────────────────────────────────────────────────────
// Market hours — the reason any of this is interesting.
//
// A share of Tesla can be bought between 9:30 and 16:00 New York time on a
// weekday, and not otherwise. TSLAx has no such opinion. Roughly two thirds of
// tokenized-equity volume happens while the exchange that prices the underlying
// is closed, and that gap is the product: the pad is awake when the broker app
// is not.
//
// So the pad always states which world it is in. "NYSE is closed, this trades
// anyway" is the honest frame, and it is also the pitch.
// ─────────────────────────────────────────────────────────────────────────────

/** US market holidays 2026 (NYSE full closures), as America/New_York dates. */
const HOLIDAYS_2026 = new Set([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
]);

/** Half days — the floor closes at 13:00 ET. */
const HALF_DAYS_2026 = new Set(["2026-11-27", "2026-12-24"]);

/** Parts of the New York wall clock for an instant, without pulling in a tz lib. */
function newYork(at = new Date()) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    weekday: p.weekday,
    minutes: Number(p.hour) * 60 + Number(p.minute),
    hhmm: `${p.hour}:${p.minute}`,
  };
}

/**
 * Is the underlying exchange open right now?
 *
 * Returns the state, a sentence fit to say out loud, and the next boundary —
 * the display and the voice both read from this, so they cannot disagree.
 */
export function marketHours(at = new Date()) {
  const ny = newYork(at);
  const weekend = ny.weekday === "Sat" || ny.weekday === "Sun";
  const holiday = HOLIDAYS_2026.has(ny.date);
  const close = HALF_DAYS_2026.has(ny.date) ? 13 * 60 : 16 * 60;
  const OPEN = 9 * 60 + 30, PRE = 4 * 60, POST = 20 * 60;

  let state, why;
  if (weekend)                                     { state = "WEEKEND";    why = `it is ${ny.weekday} in New York`; }
  else if (holiday)                                { state = "HOLIDAY";    why = "the NYSE is closed for a holiday"; }
  else if (ny.minutes >= OPEN && ny.minutes < close) { state = "OPEN";     why = "the NYSE is open"; }
  else if (ny.minutes >= PRE && ny.minutes < OPEN)   { state = "PRE";      why = "pre-market — the NYSE opens at 9:30"; }
  else if (ny.minutes >= close && ny.minutes < POST) { state = "AFTER";    why = "after hours — the NYSE has closed"; }
  else                                               { state = "OVERNIGHT"; why = "overnight — the NYSE is shut"; }

  const open = state === "OPEN";
  return {
    state, open, why,
    nyTime: ny.hhmm,
    // The line that matters: it trades either way.
    note: open ? "the exchange is open and so are we"
               : `${why}, and this trades anyway`,
    // The same fact, sized for the pad's bottom bar. That bar is one line of a
    // 6px font across 320px — about 50 characters — and the long form loses its
    // own punchline to the ellipsis. "trades anyway" is the half that matters,
    // so the short form keeps it and drops the explanation.
    short: open ? "the exchange is open" : "shut on the NYSE - this trades anyway",
  };
}
