// Lokaler Ersatz für Vercel: statische Dateien + api/*. Nur für Entwicklung und Tests.
//   DATABASE_URL=postgres://… BETTER_AUTH_SECRET=… BETTER_AUTH_URL=http://localhost:3000 node scripts/dev-server.mjs
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT || 3000);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

function route(path) {
  if (path.startsWith('/.well-known/oauth-authorization-server')) return 'api/well-known/authorization-server.js';
  if (path.startsWith('/.well-known/oauth-protected-resource')) return 'api/well-known/protected-resource.js';
  if (path.startsWith('/api/auth/')) return 'api/auth/[...all].js';
  if (path === '/api/decks') return 'api/decks/index.js';
  if (path.startsWith('/api/decks/')) return 'api/decks/[id].js';
  if (/^\/api\/[a-z-]+$/.test(path)) return `api${path.slice(4)}.js`;
  return null;
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const file = route(url.pathname);
    if (file) {
      const mod = await import(pathToFileURL(join(root, file)).href);
      const fn = mod[req.method];
      if (!fn) { res.writeHead(405).end(); return; }
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
      const r = await fn(new Request(url, { method: req.method, headers: req.headers, body }));
      const headers = {}; r.headers.forEach((v, k) => { headers[k] = v; });
      const cookies = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
      if (cookies.length) headers['set-cookie'] = cookies;
      res.writeHead(r.status, headers); res.end(Buffer.from(await r.arrayBuffer())); return;
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    let f = join(root, p);
    if ((await stat(f).catch(() => null))?.isDirectory()) f = join(f, 'index.html');
    const data = await readFile(f);
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(data);
  } catch (e) {
    if (e.code === 'ENOENT') { res.writeHead(404).end('Nicht gefunden'); return; }
    console.error(e); res.writeHead(500).end('Fehler');
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
