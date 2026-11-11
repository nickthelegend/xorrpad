import waitlist from '../api/waitlist.js';
import preorder from '../api/preorder.js';
import preorderStatus from '../api/preorder-status.js';
import { fail, HttpError } from './http.js';

// Development-only bridge to the same handlers Vercel executes. No fixtures,
// env-file loader, mock Redis or simulated payment implementation.
export function localApi() {
  return {
    name: 'xorrpad-local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (!url.pathname.startsWith('/api/')) return next();
        res.status = code => { res.statusCode = code; return res; };
        res.json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
        try {
          const handler = { '/api/waitlist': waitlist, '/api/preorder': preorder, '/api/preorder-status': preorderStatus }[url.pathname];
          if (!handler) throw new HttpError(404, 'API route not found');
          req.query = {};
          for (const [key, value] of url.searchParams) {
            if (Object.hasOwn(req.query, key)) throw new HttpError(400, 'Duplicate query parameter');
            Object.defineProperty(req.query, key, { value, enumerable: true });
          }
          if (req.method === 'POST') {
            const chunks = [];
            let length = 0;
            for await (const chunk of req) {
              length += chunk.length;
              if (length > 2048) throw new HttpError(413, 'Request too large');
              chunks.push(chunk);
            }
            req.body = Buffer.concat(chunks).toString('utf8');
          }
          await handler(req, res);
        } catch (error) { fail(res, error); }
      });
    },
  };
}
