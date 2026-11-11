import { body, fail, HttpError, method, reply } from '../server/http.js';
import { rateLimit, redis, redisConfig } from '../server/redis.js';

export function normalizeEmail(value) {
  if (typeof value !== 'string') throw new HttpError(400, 'Enter a valid email address.');
  const email = value.trim().toLowerCase();
  const parts = email.split('@');
  if (email.length > 254 || parts.length !== 2 || parts[0].length > 64 ||
      !/^[a-z0-9!#$%&'*+\/=?^_`{|}~.-]+@[a-z0-9.-]+\.[a-z]{2,63}$/.test(email) ||
      parts[0].startsWith('.') || parts[0].endsWith('.') || email.includes('..') ||
      parts[1].split('.').some(label => label.length > 63 || label.startsWith('-') || label.endsWith('-'))) {
    throw new HttpError(400, 'Enter a valid email address.');
  }
  return email;
}

export default async function waitlist(req, res) {
  try {
    method(req, res, ['GET', 'POST']);
    let email;
    if (req.method === 'POST') {
      const data = body(req);
      if (typeof data.website !== 'undefined' && (typeof data.website !== 'string' || data.website.trim())) {
        throw new HttpError(400, 'Unable to submit this form.');
      }
      email = normalizeEmail(data.email);
    }
    redisConfig();
    await rateLimit(req, req.method === 'GET' ? 'count' : 'waitlist', req.method === 'GET' ? 60 : 5);
    // SADD is idempotent. The count is read from the same set, atomically.
    const count = req.method === 'POST'
      ? await redis(['EVAL', "redis.call('SADD',KEYS[1],ARGV[1]); return redis.call('SCARD',KEYS[1])", '1', 'xorrpad:v1:waitlist', email])
      : await redis(['SCARD', 'xorrpad:v1:waitlist']);
    if (!Number.isSafeInteger(count) || count < 0) throw new HttpError(503, 'Waitlist count unavailable.');
    return reply(res, 200, { count, ...(email ? { message: 'You’re on the list. Thanks for joining.' } : {}) });
  } catch (error) {
    if (error.status === 429) res.setHeader('Retry-After', '600');
    return fail(res, error);
  }
}
