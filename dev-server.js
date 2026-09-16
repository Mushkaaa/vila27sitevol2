'use strict';
/**
 * Lokálny server na test na jednom počítači – nahrádza Vercel.
 *
 *   node dev-server.js          →  http://localhost:3005/objednavka
 *
 * Napodobňuje to, čo robí Vercel pri nasadení tohto repozitára:
 *  - statické súbory berie IBA z public/ (všetko ostatné je neprístupné, A3),
 *  - /api/<meno> spustí api/<meno>.js s rovnakým req/res,
 *  - hlavičky číta priamo z vercel.json, takže test hlavičiek má zmysel (G1–G4),
 *  - neznáma cesta vráti public/404.html so skutočným stavom 404 (P1),
 *  - cleanUrls: /kontakt nájde kontakt.html.
 *
 * Bez Upstash premenných ostávajú objednávky len v pamäti (zmiznú po vypnutí).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3005;
const ROOT = __dirname;
const WEB = path.join(ROOT, 'public');

// Lokálny token musí spĺňať rovnaké pravidlo ako na ostro (aspoň 32 znakov).
process.env.PRINT_TOKEN ||= 'lokalny-vyvojovy-token-0123456789abcdef';
process.env.ADMIN_USER ||= 'vyvoj';
process.env.ADMIN_PASS ||= 'lokalne-heslo-na-vyvoj';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

/* ---------- hlavičky z vercel.json ---------- */

/** `/(.*)`, `/api/(.*)`, `/(.*).(css|js)` → regulárny výraz. */
function naRegex(src) {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    if (src.startsWith('(.*)', i)) { out += '(.*)'; i += 3; continue; }
    const ch = src[i];
    if (ch === '(' || ch === ')' || ch === '|') { out += ch; continue; }
    out += /[a-zA-Z0-9_\-/]/.test(ch) ? ch : '\\' + ch;
  }
  return new RegExp('^' + out + '$');
}

const PRAVIDLA = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).headers
  .map(r => ({ re: naRegex(r.source), headers: r.headers }));

function nasadHlavicky(res, pathname) {
  for (const p of PRAVIDLA) {
    if (!p.re.test(pathname)) continue;
    for (const h of p.headers) res.setHeader(h.key, h.value);
  }
}

/* ---------- API ---------- */

async function runApi(name, req, res, url) {
  const file = path.join(ROOT, 'api', name + '.js');
  // súbory začínajúce podčiarkovníkom nie sú funkcie ani na Verceli
  if (name.startsWith('_') || !fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'Nenašlo sa.' });
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    req.body = Buffer.concat(chunks).toString('utf8');   // api/*.js si string samo rozparsuje
    req.query = Object.fromEntries(url.searchParams);
    await require(file)(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'Chyba servera.' });
  }
}

/* ---------- statické súbory ---------- */

function posli404(res) {
  const f = path.join(WEB, '404.html');
  fs.readFile(f, (err, data) => {
    if (err) return res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404');
    res.setHeader('content-type', TYPES['.html']);
    res.writeHead(404).end(data);
  });
}

function serveStatic(pathname, res) {
  let p;
  try { p = decodeURIComponent(pathname); } catch { return res.writeHead(400).end(); }
  if (p.includes('\0')) return res.writeHead(400).end();

  let file = path.join(WEB, p === '/' ? 'index.html' : p);
  if (file !== WEB && !file.startsWith(WEB + path.sep)) return posli404(res);   // žiadne ../
  if (!path.extname(file) && fs.existsSync(file + '.html')) file += '.html';    // cleanUrls

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return posli404(res);
    fs.readFile(file, (e2, data) => {
      if (e2) return posli404(res);
      res.setHeader('content-type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
      res.writeHead(200).end(data);
    });
  });
}

http.createServer((req, res) => {
  // ponytail: minimálna napodobenina Vercel res.status()/res.json()
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
  };

  const url = new URL(req.url, 'http://localhost');
  nasadHlavicky(res, url.pathname);

  const api = url.pathname.match(/^\/api\/([\w-]+)$/);
  if (api) runApi(api[1], req, res, url);
  else if (url.pathname.startsWith('/api')) res.status(404).json({ ok: false, error: 'Nenašlo sa.' });
  else serveStatic(url.pathname, res);
}).listen(PORT, () => {
  console.log(`Vila 27 lokálne:  http://localhost:${PORT}/objednavka`);
  console.log(`Správa:           http://localhost:${PORT}/admin`);
  console.log(`  objednávky:     /admin-objednavky   (kód = PRINT_TOKEN z prostredia)`);
  console.log(`  ponuka:         /admin-produkty     (ADMIN_USER / ADMIN_PASS z prostredia)`);
});
