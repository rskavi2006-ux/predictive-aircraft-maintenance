import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
http
  .createServer((_q, s) => {
    s.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    s.end(fs.readFileSync(path.join(dir, 'index.html')));
  })
  .listen(5173, () => console.log('Prototype on http://localhost:5173'));