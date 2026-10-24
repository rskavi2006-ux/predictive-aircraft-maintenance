// Tiny static file server for the prototype UI (no dependencies). Open http://localhost:5173
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

http
  .createServer(async (req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    const file = normalize(join(root, pathname === '/' ? 'index.html' : pathname));
    const type = types[extname(file)];
    if (!file.startsWith(root) || !type) {
      res.writeHead(404).end('Not found');
      return;
    }
    try {
      res.writeHead(200, { 'content-type': type }).end(await readFile(file));
    } catch {
      res.writeHead(404).end('Not found');
    }
  })
  .listen(5173, () => console.log('AeroGuard prototype UI on http://localhost:5173'));