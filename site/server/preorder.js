import { createHash } from "node:crypto";
import {
  address,
  createDefaultRpcTransport,
  createSolanaRpcFromTransport,
  generateKeyPair,
  getAddressFromPublicKey,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { encodeURL } from "@solana/pay";
import { HttpError, required } from "./http.js";

const NETWORKS = {
  "mainnet-beta": {
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    rpc: "https://api.mainnet-beta.solana.com",
    genesis: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  },
  devnet: {
    mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    rpc: "https://api.devnet.solana.com",
    genesis: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  },
};

export function publicKey(value, message = "Invalid reservation reference.") {
  try {
    if (typeof value !== "string") throw new Error();
    return address(value);
  } catch {
    throw new HttpError(400, message);
  }
}

export function preorderConfig() {
  const price = required("PREORDER_PRICE_USDC");
  // Six USDC decimals, bounded to preserve exact base-unit conversion by the SDK.
  if (!/^(0|[1-9]\d{0,5})(\.\d{1,6})?$/.test(price) || Number(price) <= 0) {
    throw new HttpError(
      503,
      "Setup required: valid PREORDER_PRICE_USDC (positive, at most 6 decimals, below 1000000)",
    );
  }
  const merchant = required("PREORDER_MERCHANT_ADDRESS");
  try {
    publicKey(merchant);
  } catch {
    throw new HttpError(503, "Setup required: valid PREORDER_MERCHANT_ADDRESS");
  }
  const termsUrl = required("PREORDER_TERMS_URL");
  try {
    const url = new URL(termsUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hostname === "localhost" ||
      /(^|\.)(example\.(com|org|net)|invalid|test)$/.test(url.hostname)
    )
      throw new Error();
  } catch {
    throw new HttpError(
      503,
      "Setup required: published HTTPS PREORDER_TERMS_URL",
    );
  }
  const network = process.env.PREORDER_NETWORK?.trim() || "mainnet-beta";
  if (!Object.hasOwn(NETWORKS, network))
    throw new HttpError(
      503,
      "Setup required: PREORDER_NETWORK (mainnet-beta or devnet)",
    );
  const config = {
    price,
    merchant,
    termsUrl,
    network,
    mint: NETWORKS[network].mint,
  };
  return {
    ...config,
    version: createHash("sha256").update(JSON.stringify(config)).digest("hex"),
  };
}

export function rpcFor(network) {
  if (!Object.hasOwn(NETWORKS, network))
    throw new HttpError(503, "Reservation network unavailable.");
  const url =
    process.env.PREORDER_SOLANA_RPC_URL?.trim() || NETWORKS[network].rpc;
  try {
    if (new URL(url).protocol !== "https:") throw new Error();
  } catch {
    throw new HttpError(503, "Setup required: HTTPS PREORDER_SOLANA_RPC_URL");
  }
  const transport = createDefaultRpcTransport({ url });
  const deadline = AbortSignal.timeout(12000);
  return createSolanaRpcFromTransport((config) =>
    transport({
      ...config,
      signal: config.signal
        ? AbortSignal.any([config.signal, deadline])
        : deadline,
    }),
  );
}

export async function verifyNetwork(rpc, network) {
  if ((await rpc.getGenesisHash().send()) !== NETWORKS[network].genesis) {
    throw new HttpError(
      503,
      "Setup required: PREORDER_SOLANA_RPC_URL must match the reservation network",
    );
  }
}

export async function verifyMerchant(rpc, config) {
  const [ata] = await findAssociatedTokenPda({
    owner: address(config.merchant),
    mint: address(config.mint),
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const account = await rpc
    .getAccountInfo(ata, { encoding: "jsonParsed", commitment: "finalized" })
    .send();
  if (
    !account.value ||
    account.value.owner !== TOKEN_PROGRAM_ADDRESS ||
    account.value.data?.parsed?.info?.mint !== config.mint ||
    account.value.data?.parsed?.info?.owner !== config.merchant ||
    account.value.data?.parsed?.info?.state !== "initialized"
  ) {
    throw new HttpError(
      503,
      "Setup required: initialize the merchant USDC associated token account",
    );
  }
}

export async function newReservation(config) {
  // A reference is only a public correlation key. No signing key is persisted or used.
  const reference = await getAddressFromPublicKey(
    (await generateKeyPair()).publicKey,
  );
  return {
    ...config,
    reference,
    createdAt: new Date().toISOString(),
    termsAcceptedAt: new Date().toISOString(),
  };
}

export function paymentUrl(order) {
  return encodeURL({
    recipient: address(order.merchant),
    amount: Number(order.price),
    splToken: address(order.mint),
    reference: address(order.reference),
    memo: `xorrpad:${order.reference}`,
    label: "xorrpad reservation",
    message: `${order.network} USDC reservation. Terms: ${order.termsUrl}`,
  }).toString();
}

export const orderKey = (reference) => `xorrpad:v1:preorder:${reference}`;
