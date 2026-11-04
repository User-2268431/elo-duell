// Eigentümer: E – statischer Entwicklungsserver ohne Abhängigkeiten (docs/ARCHITEKTUR.md §10).
// Liefert das Repo unter http://localhost:4173/elo-duell/ aus (wie GitHub Pages). Start: node tools/serve.mjs
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '/elo-duell';
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', ...headers });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Methode nicht erlaubt');
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let p = decodeURIComponent(url.pathname);
    if (p === '/' ) return send(res, 302, '', { Location: BASE + '/' });
    if (p === BASE) return send(res, 301, '', { Location: BASE + '/' + url.search });
    if (!p.startsWith(BASE + '/')) return send(res, 404, 'Nicht gefunden');
    p = p.slice(BASE.length);
    const file = path.resolve(ROOT, '.' + p);
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, 'Verboten');
    if (file.split(path.sep).includes('.git')) return send(res, 404, 'Nicht gefunden');
    let target = file;
    let st = await stat(target).catch(() => null);
    if (st && st.isDirectory()) {
      if (!p.endsWith('/')) return send(res, 301, '', { Location: BASE + p + '/' + url.search });
      target = path.join(target, 'index.html');
      st = await stat(target).catch(() => null);
    }
    if (!st || !st.isFile()) return send(res, 404, 'Nicht gefunden');
    const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    createReadStream(target).pipe(res);
  } catch (err) {
    send(res, 500, 'Serverfehler: ' + (err && err.message));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Elo-Duell: http://localhost:${PORT}${BASE}/`);
});
