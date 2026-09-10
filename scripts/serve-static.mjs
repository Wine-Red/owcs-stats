// Deliberately no SPA fallback or API proxy: validates a plain partner file host.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
const root = path.resolve(process.env.OWCS_PREVIEW_DIR || 'dist');
const port = Number(process.env.PORT || 4174);
const prefix = process.env.OWCS_PREVIEW_PREFIX || '/partner/owcs/';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!['GET', 'HEAD'].includes(req.method) || !pathname.startsWith(prefix)) throw new Error('Not found');
    const file = path.resolve(root, pathname.slice(prefix.length) || 'index.html');
    if (!file.startsWith(`${root}${path.sep}`)) throw new Error('Not found');
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Static files: http://127.0.0.1:${port}${prefix}`));
