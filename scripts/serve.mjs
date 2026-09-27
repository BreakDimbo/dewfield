import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

/** `pnpm serve` — serves dist/ with the production cache policy (P2-25), for local verification. */
const root = join(process.cwd(), 'dist');
const port = Number(process.env.PORT ?? 5393);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webm': 'audio/webm', '.mp3': 'audio/mpeg', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
const cache = (p) =>
  p.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : p.startsWith('/audio/') ? 'public, max-age=604800' : 'no-cache';
createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = normalize(join(root, url === '/' ? 'index.html' : url));
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  const rel = '/' + file.slice(root.length + 1).replace(/\\/g, '/');
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': cache(rel === '/index.html' ? '/index.html' : rel) });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`dist on http://localhost:${port}`));
