export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function reply(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(body);
}

export function method(req, res, allowed) {
  if (allowed.includes(req.method)) return;
  res.setHeader('Allow', allowed.join(', '));
  throw new HttpError(405, 'Method not allowed');
}

export function body(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
    throw new HttpError(415, 'Send application/json');
  }
  let data = req.body;
  if (Buffer.isBuffer(data)) data = data.toString('utf8');
  if (typeof data === 'string') {
    if (Buffer.byteLength(data) > 2048) throw new HttpError(413, 'Request too large');
    try { data = JSON.parse(data); } catch { throw new HttpError(400, 'Invalid JSON'); }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Invalid request');
  if (Buffer.byteLength(JSON.stringify(data)) > 2048) throw new HttpError(413, 'Request too large');
  return data;
}

export function fail(res, error) {
  // Never log request bodies, upstream responses, URLs or credentials.
  return reply(res, error instanceof HttpError ? error.status : 503, {
    error: error instanceof HttpError ? error.message : 'Service unavailable. Please try again later.',
  });
}

export function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new HttpError(503, `Setup required: ${name}`);
  return value;
}
