import { address } from '@solana/kit';
import { findReference, FindReferenceError, validateTransfer, ValidateTransferError } from '@solana/pay';
import { fail, HttpError, method, reply } from '../server/http.js';
import { orderKey, preorderConfig, publicKey, rpcFor, verifyNetwork } from '../server/preorder.js';
import { rateLimit, redis, redisConfig } from '../server/redis.js';

export default async function preorderStatus(req, res) {
  try {
    method(req, res, ['GET']);
    const reference = req.query?.reference;
    if (reference !== undefined) publicKey(reference);
    // With no reference, still report missing deployment setup honestly.
    // Existing orders use their saved expectations even after new orders are disabled.
    if (reference === undefined) {
      preorderConfig();
      throw new HttpError(400, 'A reservation reference is required.');
    }
    redisConfig();
    await rateLimit(req, 'preorder-status', 60, 60);
    const stored = await redis(['GET', orderKey(reference)]);
    if (!stored) throw new HttpError(404, 'Reservation not found.');
    const order = JSON.parse(stored);
    if (order.reference !== reference || !order.termsAcceptedAt) throw new HttpError(503, 'Reservation record unavailable.');
    if (order.signature) return reply(res, 200, { status: 'confirmed', reference, signature: order.signature, network: order.network });
    const rpc = rpcFor(order.network);
    await verifyNetwork(rpc, order.network);
    let found;
    try { found = await findReference(rpc, address(reference), { commitment: 'finalized' }); }
    catch (error) {
      if (error instanceof FindReferenceError) return reply(res, 200, { status: 'pending', reference });
      throw error;
    }
    if (found.err) throw new HttpError(409, 'The referenced transaction failed on chain.');
    try {
      await validateTransfer(rpc, found.signature, {
        recipient: address(order.merchant), amount: Number(order.price), splToken: address(order.mint),
        reference: address(reference), memo: `xorrpad:${reference}`,
      }, { commitment: 'finalized' });
    } catch (error) {
      if (error instanceof ValidateTransferError) throw new HttpError(409, 'Payment does not match this reservation. Do not pay again; retain your reference for reconciliation.');
      throw error;
    }
    // Claim a signature once, so it cannot fulfill more than one reservation.
    const saved = await redis(['EVAL', "local r=redis.call('GET',KEYS[1]); if r and r~=ARGV[1] then return 0 end; redis.call('SET',KEYS[1],ARGV[1]); redis.call('SET',KEYS[2],ARGV[2]); return 1", '2',
      `xorrpad:v1:preorder-signature:${found.signature}`, orderKey(reference), reference,
      JSON.stringify({ ...order, signature: found.signature, confirmedAt: new Date().toISOString() })]);
    if (saved !== 1) throw new HttpError(409, 'Payment signature already belongs to another reservation.');
    return reply(res, 200, { status: 'confirmed', reference, signature: found.signature, network: order.network });
  } catch (error) {
    if (error.status === 429) res.setHeader('Retry-After', '60');
    return fail(res, error);
  }
}
