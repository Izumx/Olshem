// Serves the static build in `out/` with no dependencies, for offline demos.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve('out');
const port = Number(process.env.PORT) || 3000;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

async function resolveFile(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '');
  const base = join(root, clean);
  if (!base.startsWith(root)) return null;
  for (const candidate of [base, `${base}.html`, join(base, 'index.html')]) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Try the next form of the path.
    }
  }
  return null;
}

createServer(async (req, res) => {
  const file = await resolveFile(new URL(req.url ?? '/', 'http://localhost').pathname);
  const target = file ?? join(root, '404.html');
  try {
    const body = await readFile(target);
    res.writeHead(file ? 200 : 404, { 'Content-Type': types[extname(target)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found. Run `npm run build` first.');
  }
}).listen(port, () => console.log(`Өлшем: http://localhost:${port}`));
