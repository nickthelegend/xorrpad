/** Proposal-only hedge pairing. No transactions, signing, or submissions. */
import * as phoenix from "./chains/phoenix.mjs";
import * as pmamm from "./chains/pmamm.mjs";
import { decide } from "./decide.mjs";
import { NO_MEMORY_LIMITS } from "./memory.mjs";

// Only the unambiguous numeric naming convention currently used on-chain.
// An arbitrary question mentioning BTC is not proof of its payout condition.
export function parseOutcome(market) {
  const match = market.name.match(/^([A-Z][A-Z0-9]{0,14})\s*(>=|<=|>|<)\s*\$?([0-9]+(?:\.[0-9]+)?)\s+by\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})Z$/i);
  if (!match) return null;
  const endTs = Date.parse(`${match[4]}T${match[5]}:00Z`)/1000, threshold = Number(match[3]);
  if (!Number.isFinite(endTs) || !(threshold>0) || Math.abs(endTs-market.endTs)>60) return null;
  return { symbol:match[1].toUpperCase(), operator:match[2], threshold, endTs };
}
export function losingSide(position, outcome) {
  if (position.market !== outcome.symbol || !(position.entryPrice>0)) return null;
  const lower = outcome.operator.startsWith("<");
  if (position.side === "long" && outcome.threshold < position.entryPrice) return lower ? "yes" : "no";
  if (position.side === "short" && outcome.threshold > position.entryPrice) return lower ? "no" : "yes";
  return null;
}
export async function proposeHedges(authority, brief, { usdc, traderPdaIndex } = {}) {
  if (usdc != null) pmamm.rawUsdc(usdc);
  const [positions, markets] = await Promise.all([phoenix.positions(authority,{traderPdaIndex}),pmamm.markets()]);
  const limits = brief?.limits || NO_MEMORY_LIMITS;
  const proposals = [];
  for (const position of positions) {
    const candidates = markets.flatMap(m => {
      const outcome = parseOutcome(m), side = outcome && losingSide(position,outcome);
      return side && m.liquidity>0 ? [{ market:m, outcome, side }] : [];
    }).sort((a,b)=>Math.abs(a.outcome.threshold-position.entryPrice)-Math.abs(b.outcome.threshold-position.entryPrice) || a.market.endTs-b.market.endTs);
    const chosen = candidates[0];
    if (!chosen) { proposals.push({position,status:"no matching live numeric outcome",proposal:null}); continue; }
    const maxBudget = Number(usdc ?? limits.max_trade_usd);
    if (!(maxBudget>0)) throw new Error("hedge usdc budget must be positive");
    const unit = await pmamm.quote({market:chosen.market.market,side:chosen.side,usdc:Math.min(1,maxBudget)});
    const netSharesPerUsdc = unit.expectedShares/unit.usdc-1;
    if (!(netSharesPerUsdc>0)) { proposals.push({position,status:"quote cannot cover a loss net of its premium",proposal:null}); continue; }
    const targetLossUsd = position.baseUnits*Math.abs(position.entryPrice-chosen.outcome.threshold);
    const premium = Math.min(maxBudget, Math.ceil(targetLossUsd/netSharesPerUsdc*1e6)/1e6);
    const signal = {agent:"hedge",side:"BUY",symbol:`pmamm:${chosen.market.market}:${chosen.side}`,sizeUsd:premium,
      reason:`${position.side} ${position.market}: numeric outcome pays on the adverse side of entry`,confidence:1};
    const verdict = decide(signal,brief);
    const size = verdict.action==="EXECUTE" ? Math.floor(verdict.sizeUsd*1e6)/1e6 : premium;
    const quote = await pmamm.quote({market:chosen.market.market,side:chosen.side,usdc:size});
    proposals.push({position,status:verdict.action==="EXECUTE"?"proposal allowed by gate":"proposal refused by gate",
      proposal:{market:chosen.market.market,name:chosen.market.name,side:chosen.side,condition:chosen.outcome,
        premiumUsdc:quote.usdc,expectedShares:quote.expectedShares,quotedNetPayoutUsdc:quote.expectedShares-quote.usdc,
        illustrativeLossAtThresholdUsd:targetLossUsd,quote,signal,verdict,
        resolution:"Payout interpretation is inferred from the numeric market name; resolution is still creator-controlled.",
        coverage:"Threshold payout only; intervening losses, expiry mismatch and larger losses remain uncovered."}});
  }
  return {authority:phoenix.authorityKey(authority),positions:positions.length,proposals,proposalOnly:true,
    phoenixCluster:"mainnet-beta",pmammCluster:"devnet",economicHedge:false,
    limitation:"Devnet mUSDC cannot reimburse mainnet USD losses. These are quoted, gated research proposals, not an economic hedge.",pollAfterMs:15000};
}
