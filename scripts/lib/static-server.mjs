// A minimal static server for dist/ with the CSP of docs/plan.md §6, for the browser checks
// (scripts/check-browser.mjs). `astro preview` sets no CSP, so a CSP violation would go unnoticed.
// It serves files only: a path that ends in `/` gets its index.html, anything else must be a file.
// It is not the production server; nginx (M8) sets the same CSP and the other headers.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

// The CSP from docs/plan.md §6, verbatim. docker/nginx.conf (M8) must send the same.
export const CSP =
  "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; " +
  "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'";

const TYPES = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.jsonld': 'application/ld+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.xml': 'application/xml',
};

/** Serves `root` on 127.0.0.1 at a free port. Resolves to `{ origin, close() }`. */
export function serve(root) {
  const base = normalize(root + sep);
  const server = createServer((request, response) => {
    const send = (status, text) => {
      response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(text);
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') return send(405, 'GET only');
    let path;
    try {
      path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    } catch {
      return send(400, 'bad path');
    }
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(base, path));
    if (!file.startsWith(base)) return send(403, 'outside the root');
    let stat;
    try {
      stat = statSync(file);
    } catch {
      return send(404, 'not found');
    }
    if (!stat.isFile()) return send(404, 'not a file');
    response.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'content-length': stat.size,
      'content-security-policy': CSP,
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-cache',
    });
    if (request.method === 'HEAD') return response.end();
    createReadStream(file).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}
