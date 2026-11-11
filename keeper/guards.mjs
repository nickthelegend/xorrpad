/** Devnet and collateral checks are mandatory before key access or signing. */
import { Connection } from "@solana/web3.js";
export const DEVNET_RPC = "https://api.devnet.solana.com";
export const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const MINT = "3WQ8hCqTNwjrh8WzE2XyoZoUrd1miPcwWfMkmFPUMEWZ";
export const PROGRAM = "GV1FMGHRYBjQLaghE5fnGuYCuCcpdt3GD5xEX3TwN16y";
export function assertGenesis(hash) {
  if (hash !== DEVNET_GENESIS) throw new Error("keeper refuses to start or sign: RPC genesis is not Solana devnet");
}
export function assertMint(mint) {
  if (String(mint) !== MINT) throw new Error(`keeper refuses collateral: only devnet mUSDC ${MINT} is permitted`);
}
export function connectionFor(endpoint = process.env.KEEPER_RPC || DEVNET_RPC) {
  return new Connection(endpoint, { commitment:"confirmed",disableRetryOnRateLimit:true,
    fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(20000)}) });
}
export async function guard(connection, mint = process.env.KEEPER_MINT || MINT) {
  assertMint(mint);
  assertGenesis(await connection.getGenesisHash());
}
