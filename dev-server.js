'use strict';
/**
 * Lokálny server na test na jednom počítači – nahrádza Vercel.
 *
 *   node dev-server.js          →  http://localhost:3005/objednavka.html
 *
 * Statické súbory berie z tohto priečinka, /api/<meno> spustí api/<meno>.js
 * s rovnakým req/res ako Vercel. Objednávky ostávajú len v pamäti (zmiznú
 * po vypnutí) a PRINT_TOKEN pre /admin a tlačového agenta je „test“.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3005;
const ROOT = __dirname;
process.env.PRINT_TOKEN ||= 'test';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
};

async function runApi(name, req, res, url) {
  const file = path.join(ROOT, 'api', name + '.js');
  if (name.startsWith('_') || !fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'Neznáme API: ' + name });
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    req.body = Buffer.concat(chunks).toString('utf8');   // api/*.js si string samo rozparsuje
    req.query = Object.fromEntries(url.searchParams);
    await require(file)(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ ok: false, error: e.message });
  }
}

function serveStatic(pathname, res) {
  let p; try { p = decodeURIComponent(pathname); } catch { return res.writeHead(400).end(); }
  let file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!file.startsWith(ROOT + path.sep)) return res.writeHead(403).end();
  if (!path.extname(file) && fs.existsSync(file + '.html')) file += '.html';   // cleanUrls ako na Verceli (/admin)
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 ' + p);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' }).end(data);
  });
}

http.createServer((req, res) => {
  // ponytail: minimálna napodobenina Vercel res.status()/res.json() – viac api/*.js nepoužíva
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => { res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
  const url = new URL(req.url, 'http://localhost');
  const api = url.pathname.match(/^\/api\/([\w-]+)$/);
  if (api) runApi(api[1], req, res, url);
  else serveStatic(url.pathname, res);
}).listen(PORT, () => {
  console.log(`Vila 27 lokálne:  http://localhost:${PORT}/objednavka.html`);
  console.log(`Admin:            http://localhost:${PORT}/admin   (token: ${process.env.PRINT_TOKEN})`);
});
