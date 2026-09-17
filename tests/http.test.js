'use strict';
/**
 * HTTP testy proti lokálnemu serveru (dev-server.js napodobňuje Vercel).
 * Názov každého testu začína ID položky zo SECURITY-GOAL.md.
 *
 * Servery si test spúšťa sám:
 *   A – otvorené nonstop (bežná prevádzka)
 *   B – zatvorené (overuje odmietnutie mimo otváracích hodín)
 *   C – nízky celkový strop (overuje globálny limit)
 *
 * BASE_URL prepne server A na už bežiaci server.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const KOREN = path.join(__dirname, '..');
const TOKEN = 'testovaci-token-vila27-0123456789abcdef';      // 39 znakov, len pre testy
const FIX = p => path.join(__dirname, 'fixtures', p);

const servery = [];

/** Spustí dev-server na voľnom porte a počká, kým odpovedá. */
async function server(env = {}, port) {
  const p = spawn(process.execPath, [path.join(KOREN, 'dev-server.js')], {
    cwd: KOREN,
    env: {
      ...process.env,
      PORT: String(port),
      PRINT_TOKEN: TOKEN,
      // testy si posielajú vlastnú IP – hosting to robí prepísaním tejto hlavičky
      VILA27_IP_HEADER: 'x-forwarded-for',
      ADMIN_USER: 'test',
      ADMIN_PASS: 'testovacie-heslo-12',
      VILA27_HOURS_FILE: FIX('hodiny-otvorene.json'),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stderr.on('data', d => process.stderr.write('[server] ' + d));
  servery.push(p);

  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(base + '/robots.txt');
      if (r.ok) return base;
    } catch { /* ešte nebeží */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('dev-server sa nerozbehol na porte ' + port);
}

let A, B, C, D, P;

test.before(async () => {
  A = process.env.BASE_URL || await server({ ORDER_GLOBAL_LIMIT: '200' }, 3101);
  B = await server({ VILA27_HOURS_FILE: FIX('hodiny-zatvorene.json') }, 3102);
  C = await server({ ORDER_GLOBAL_LIMIT: '3' }, 3103);
  // hosting BEZ dôveryhodnej proxy – hlavičke s IP sa nesmie veriť
  D = await server({ VILA27_IP_HEADER: '', ORDER_GLOBAL_LIMIT: '200' }, 3104);
  // otvorené len ráno – teraz je teda zatvorené, ale na zajtra ráno sa predobjednať dá
  P = await server({ VILA27_HOURS_FILE: FIX('hodiny-rano.json'), ORDER_GLOBAL_LIMIT: '200' }, 3105);
});

test.after(() => servery.forEach(p => { try { p.kill(); } catch { /* už padol */ } }));

/* ---------- pomôcky ---------- */

let ipCitac = 0;
const novaIp = () => `198.51.100.${(ipCitac++ % 250) + 1}`;      // TEST-NET-2, nikdy reálna

function objednavka(extra = {}) {
  return {
    mode: 'odber',
    customer: {
      name: 'Testovací Zákazník',
      phone: '+421900000000',
      time: 'Čo najskôr',
      pay: 'Hotovosť pri prevzatí',
      note: '',
    },
    items: [{ id: 'po1', qty: 2 }],
    trvanieMs: 60000,
    ...extra,
  };
}

function posli(base, telo, { ip = novaIp(), hlavicky = {}, raw = null, method = 'POST' } = {}) {
  return fetch(base + '/api/orders', {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
      ...hlavicky,
    },
    body: raw !== null ? raw : (telo === undefined ? undefined : JSON.stringify(telo)),
  });
}

const MENU = JSON.parse(fs.readFileSync(path.join(KOREN, 'menu.json'), 'utf8'));
const cenaZMenu = id => MENU.rozvoz.flatMap(c => c.items).find(i => i.id === id).price;

/* ==================================================================== G1–G4 */

test('G1/G3 – bezpečnostné hlavičky sú na domovskej stránke', async () => {
  const r = await fetch(A + '/');
  assert.equal(r.status, 200);
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.ok(!/unsafe-inline|unsafe-eval/.test(csp), 'CSP povoľuje unsafe-*');
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(r.headers.get('cross-origin-opener-policy'), 'same-origin');
  assert.match(r.headers.get('permissions-policy'), /camera=\(\)/);
  assert.match(r.headers.get('strict-transport-security'), /max-age=63072000/);
});

test('G1/G3 – rovnaké hlavičky má aj podstránka a nové právne stránky', async () => {
  for (const cesta of ['/kontakt', '/objednavka', '/cookies', '/ochrana-osobnych-udajov']) {
    const r = await fetch(A + cesta);
    assert.equal(r.status, 200, cesta);
    assert.match(r.headers.get('content-security-policy') || '', /script-src 'self'/, cesta);
    assert.equal(r.headers.get('x-frame-options'), 'DENY', cesta);
  }
});

test('G4/B6 – /admin sa neindexuje a nekešuje', async () => {
  for (const cesta of ['/admin', '/admin-objednavky', '/admin-produkty']) {
    const r = await fetch(A + cesta);
    assert.equal(r.status, 200, cesta);
    assert.match(r.headers.get('x-robots-tag') || '', /noindex/, cesta);
    assert.equal(r.headers.get('cache-control'), 'no-store', cesta);
    assert.match(r.headers.get('content-security-policy') || '', /script-src 'self'/, cesta);
  }
});

test('G4 – odpovede API sa nekešujú', async () => {
  const r = await posli(A, objednavka());
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.match(r.headers.get('content-security-policy') || '', /default-src 'self'/);
});

test('G4 – fonty a obrázky sa kešujú nadlho', async () => {
  const f = await fetch(A + '/fonts/source-sans-3.css');
  assert.equal(f.status, 200);
  assert.match(f.headers.get('cache-control'), /max-age=31536000/);
});

/* ==================================================================== B4 */

test('B4 – /api/orders prijíma iba POST, ostatné metódy vracajú 405 s Allow', async () => {
  for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
    const r = await fetch(A + '/api/orders', { method });
    assert.equal(r.status, 405, method);
    assert.equal(r.headers.get('allow'), 'POST', method);
    const d = await r.json();
    assert.equal(d.ok, false);
    assert.ok(!('orders' in d), 'verejné API nesmie vypisovať objednávky');
  }
});

/* ==================================================================== B3/B4 */

test('B3 – /api/queue bez tokenu, so zlým tokenom aj s tokenom v URL vráti 401', async () => {
  const bez = await fetch(A + '/api/queue');
  assert.equal(bez.status, 401);

  const zly = await fetch(A + '/api/queue', { headers: { Authorization: 'Bearer nespravny-token-ktory-ma-dost-znakov' } });
  assert.equal(zly.status, 401);

  // token v query stringu sa musí ignorovať – skončil by v logoch a v Refereri
  const vUrl = await fetch(A + `/api/queue?token=${encodeURIComponent(TOKEN)}`);
  assert.equal(vUrl.status, 401);
  const vUrlAll = await fetch(A + `/api/queue?all=1&token=${encodeURIComponent(TOKEN)}`);
  assert.equal(vUrlAll.status, 401);

  // to isté pre POST: token v tele už neplatí
  const vTele = await fetch(A + '/api/queue', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: TOKEN, ids: [] }),
  });
  assert.equal(vTele.status, 401);
});

test('B3 – správny Bearer token prejde na GET aj POST', async () => {
  const g = await fetch(A + '/api/queue', { headers: { Authorization: 'Bearer ' + TOKEN } });
  assert.equal(g.status, 200);
  const d = await g.json();
  assert.equal(d.ok, true);
  assert.ok(Array.isArray(d.orders));

  const p = await fetch(A + '/api/queue', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify({ ids: [] }),
  });
  assert.equal(p.status, 200);
});

test('B4 – /api/queue odmietne iné metódy s hlavičkou Allow', async () => {
  for (const method of ['PUT', 'DELETE']) {
    const r = await fetch(A + '/api/queue', { method, headers: { Authorization: 'Bearer ' + TOKEN } });
    assert.equal(r.status, 405, method);
    assert.equal(r.headers.get('allow'), 'GET, POST', method);
  }
});

/* ==================================================================== C1 */

test('C1 – platná objednávka prejde a súčet ráta server, aj keď klient pošle price 0.01', async () => {
  const cena = cenaZMenu('po1');
  const r = await posli(A, objednavka({
    items: [{ id: 'po1', qty: 2, price: 0.01, unitPrice: 0.01, lineTotal: 0.02 }],
    total: 0.02,
    subtotal: 0.02,
  }));
  assert.equal(r.status, 201);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.total, Math.round(cena * 2 * 100) / 100, 'server prevzal cenu z prehliadača');
  assert.ok(Number.isInteger(d.number));
  assert.ok(!('storage' in d), 'odpoveď prezrádza vnútro servera (A4)');
});

/* ==================================================================== C3 */

test('C3 – priveľké telo vráti 413', async () => {
  const velke = objednavka();
  velke.customer.note = 'x'.repeat(20000);
  const r = await posli(A, velke);
  assert.equal(r.status, 413);
});

test('C3 – nesprávny Content-Type vráti 415', async () => {
  const r = await posli(A, undefined, {
    hlavicky: { 'content-type': 'text/plain' },
    raw: JSON.stringify(objednavka()),
  });
  assert.equal(r.status, 415);
});

test('C3 – pokazený JSON vráti 400 a všeobecnú slovenskú hlášku', async () => {
  const r = await posli(A, undefined, { raw: '{"items": [' });
  assert.equal(r.status, 400);
  const d = await r.json();
  assert.equal(d.ok, false);
  assert.match(d.error, /nepodarilo/i);
  assert.ok(!/JSON|SyntaxError|position|token/i.test(d.error), 'v hláške je detail parsera');
});

/* ==================================================================== C9 */

test('C9 – cudzí Origin dostane 403', async () => {
  const r = await posli(A, objednavka(), { hlavicky: { Origin: 'https://zly-web.example' } });
  assert.equal(r.status, 403);
  const d = await r.json();
  assert.match(d.error, /našej stránky/);
  assert.equal(r.headers.get('access-control-allow-origin'), null, 'server rozdáva CORS');
});

test('C9 – vlastný Origin prejde', async () => {
  const host = new URL(A).host;
  const r = await posli(A, objednavka(), { hlavicky: { Origin: `http://${host}` } });
  assert.equal(r.status, 201);
});

/* ==================================================================== C7 */

test('C7 – vyplnená pasca na roboty objednávku zahodí', async () => {
  const r = await posli(A, objednavka({ web: 'https://spam.example' }));
  assert.equal(r.status, 400);
  const d = await r.json();
  assert.equal(d.ok, false);
});

test('C7 – odoslanie do 3 sekúnd od otvorenia sa odmietne', async () => {
  const r = await posli(A, objednavka({ trvanieMs: 40 }));
  assert.equal(r.status, 400);
});

/* ==================================================================== C2 */

test('C2 – neplatný telefón a neznáme pole sa odmietnu', async () => {
  const zlyTel = await posli(A, objednavka({ customer: { name: 'Jožo Mrkvička', phone: '123', time: '', pay: '', note: '' } }));
  assert.equal(zlyTel.status, 400);
  assert.match((await zlyTel.json()).error, /telefón/i);

  const cudzie = await posli(A, objednavka({ admin: true }));
  assert.equal(cudzie.status, 400);
  assert.match((await cudzie.json()).error, /neznáme/i);
});

test('C5 – poznámka s ESC/POS príkazmi sa uloží ako neškodný text', async () => {
  const kick = String.fromCharCode(0x1b, 0x70, 0x00, 0x19, 0xfa);
  const cut = String.fromCharCode(0x1d, 0x56, 0x00);
  const o = objednavka();
  o.customer.note = `${kick}${cut} Bez cibule, prosím. Šťastný žltý kôň`;
  const r = await posli(A, o);
  assert.equal(r.status, 201);
  const prijata = await r.json();

  const q = await fetch(A + '/api/queue?all=1', { headers: { Authorization: 'Bearer ' + TOKEN } });
  const { orders } = await q.json();
  const ulozena = orders.find(x => x.number === prijata.number);
  assert.ok(ulozena, 'objednávka sa nenašla vo fronte');
  assert.ok(!new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(0x1f) + ']').test(ulozena.customer.note),
    'v uloženej poznámke ostal riadiaci znak');
  assert.match(ulozena.customer.note, /Šťastný žltý kôň/);
});

/* ==================================================================== D1 */

test('D1 – šiesta objednávka z jednej IP v okne dostane 429', async () => {
  const ip = novaIp();
  const stavy = [];
  for (let i = 0; i < 6; i++) {
    const r = await posli(A, objednavka(), { ip });
    stavy.push(r.status);
    if (r.status === 429) {
      const d = await r.json();
      assert.match(d.error, /Priveľa|zavolajte/i, 'chýba priateľská slovenská hláška');
      assert.ok(r.headers.get('retry-after'), 'chýba Retry-After');
    } else {
      await r.body?.cancel?.();
    }
  }
  assert.deepEqual(stavy.slice(0, 5), [201, 201, 201, 201, 201], 'prvých päť objednávok malo prejsť');
  assert.equal(stavy[5], 429, 'šiesta objednávka mala byť odmietnutá');
});

test('D1 – celkový strop platí naprieč všetkými IP', async () => {
  const stavy = [];
  for (let i = 0; i < 4; i++) {
    const r = await posli(C, objednavka(), { ip: novaIp() });
    stavy.push(r.status);
    await r.body?.cancel?.();
  }
  assert.deepEqual(stavy.slice(0, 3), [201, 201, 201]);
  assert.equal(stavy[3], 429, 'štvrtá objednávka mala naraziť na celkový strop');
});

/* ==================================================================== C8 */

test('C8 – rovnaký orderKey nevyrobí druhú objednávku', async () => {
  const ip = novaIp();
  const kluc = 'test-' + Date.now();
  const prva = await posli(A, objednavka({ orderKey: kluc }), { ip });
  assert.equal(prva.status, 201);
  const a = await prva.json();

  const druha = await posli(A, objednavka({ orderKey: kluc }), { ip });
  assert.equal(druha.status, 200);
  const b = await druha.json();
  assert.equal(b.number, a.number, 'duplicita dostala nové číslo objednávky');
  assert.equal(b.duplicita, true);
});

/* ==================================================================== C4 */

test('C4 – mimo otváracích hodín server objednávku odmietne po slovensky', async () => {
  const r = await posli(B, objednavka());
  assert.equal(r.status, 409);
  const d = await r.json();
  assert.equal(d.ok, false);
  assert.equal(d.zatvorene, true);
  assert.match(d.error, /neprijímame|zatvorené/i);
  assert.match(d.error, /\+421 914 271 271/);
});

test('C4 – stránka sa o stave otvorené/zatvorené dozvie z /api/menu', async () => {
  const otv = await (await fetch(A + '/api/menu')).json();
  assert.equal(otv.hodiny.otvorene, true);
  const zatv = await (await fetch(B + '/api/menu')).json();
  assert.equal(zatv.hodiny.otvorene, false);
  assert.ok(zatv.hodiny.sprava.length > 5);
});

/* ==================================================================== A3 */

test('A3 – nič okrem verejnej stránky nie je dostupné', async () => {
  const cesty = [
    '/.env', '/.env.example', '/.git/config', '/.gitignore', '/.vercelignore',
    '/agent/print-agent.js', '/agent/config.json', '/agent/config.example.json',
    '/docs/security/REPORT.md', '/docs/security/inventory.md',
    '/tests/http.test.js', '/scripts/security-check.js', '/scripts/stiahni-fonty.js',
    '/SECURITY-GOAL.md', '/README.md', '/package.json', '/package-lock.json',
    '/vercel.json', '/dev-server.js', '/menu.json', '/vytlacene.json',
    '/config/otvaracie-hodiny.json',
    '/api/_store', '/api/_menu', '/api/_auth', '/api/_token', '/api/_sanitize', '/api/_hours',
    '/api/neexistuje',
  ];
  const zle = [];
  for (const c of cesty) {
    const r = await fetch(A + c);
    if (r.status !== 404) zle.push(`${c} → ${r.status}`);
    await r.body?.cancel?.();
  }
  assert.deepEqual(zle, []);
});

/* ==================================================================== P1 */

test('P1 – neznáma adresa vráti skutočný stav 404 a vlastnú slovenskú stránku', async () => {
  const r = await fetch(A + '/neexistuje');
  assert.equal(r.status, 404);
  const html = await r.text();
  assert.match(html, /Túto stránku sme nenašli/);
  assert.match(html, /<html lang="sk">/);
  assert.match(html, /site-header/, 'stránka 404 nemá hlavičku webu');
  assert.match(html, /site-footer/, 'stránka 404 nemá pätu webu');
  assert.match(html, /noindex/);
  assert.match(html, /jedalny-listok\.html/);
  assert.match(html, /objednavka\.html/);
  assert.match(html, /kontakt\.html/);
});

/* ==================================================================== H1/A4 */

test('H1/A4 – žiadna odpoveď neprezradí stack trace ani vnútro úložiska', async () => {
  const skusky = [
    () => fetch(A + '/api/orders', { method: 'GET' }),
    () => fetch(A + '/api/queue'),
    () => posli(A, undefined, { raw: 'toto nie je json' }),
    () => posli(A, objednavka({ items: [{ id: 'neexistuje', qty: 1 }] })),
    () => fetch(A + '/api/menu'),
    () => fetch(A + '/neexistuje'),
  ];
  for (const f of skusky) {
    const r = await f();
    const t = await r.text();
    assert.ok(!/ at .*\.js:\d+:\d+/.test(t), 'v odpovedi je stack trace: ' + t.slice(0, 200));
    assert.ok(!/"storage"/.test(t), 'odpoveď prezrádza typ úložiska');
    assert.ok(!/Upstash|UPSTASH|KV_REST_API|PRINT_TOKEN/.test(t), 'odpoveď prezrádza konfiguráciu');
    assert.ok(!/node_modules|Error:.*at Object/.test(t), 'odpoveď prezrádza vnútro servera');
  }
});

/* ==================================================================== P4/P5 */

test('P4/P5 – robots.txt, sitemap.xml a security.txt sú na svojom mieste', async () => {
  const robots = await fetch(A + '/robots.txt');
  assert.equal(robots.status, 200);
  const rt = await robots.text();
  assert.match(rt, /Disallow: \/admin/);
  assert.match(rt, /Disallow: \/api\//);
  assert.match(rt, /Sitemap:/);

  const sitemap = await fetch(A + '/sitemap.xml');
  assert.equal(sitemap.status, 200);
  const sm = await sitemap.text();
  assert.match(sm, /<urlset/);
  assert.ok(!/\/admin/.test(sm), 'sitemap ponúka administráciu');

  const sec = await fetch(A + '/.well-known/security.txt');
  assert.equal(sec.status, 200);
  const st = await sec.text();
  assert.match(st, /Contact:/);
  assert.match(st, /Expires:/);
  const expiry = /Expires:\s*(\S+)/.exec(st)[1];
  assert.ok(new Date(expiry) > new Date(), 'security.txt už vypršal');

  const man = await fetch(A + '/site.webmanifest');
  assert.equal(man.status, 200);
  assert.equal((await man.json()).lang, 'sk');
});

/* ==================================================================== F1 */

test('F1 – verejné stránky nenačítajú nič cudzie pred súhlasom', async () => {
  for (const cesta of ['/', '/kontakt', '/objednavka']) {
    const html = await (await fetch(A + cesta)).text();
    // zaujímajú nás len zdroje, ktoré prehliadač sám stiahne (script/img/iframe/link),
    // nie obyčajné odkazy na Facebook či Mapy, tie nič nesťahujú
    const zdroje = [
      ...[...html.matchAll(/<(?:script|img|iframe|source|video|audio)\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]),
      ...[...html.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)].map(m => m[1]),
    ];
    const cudzie = zdroje.filter(u => /^https?:\/\//i.test(u) && !u.startsWith('https://www.vila27.sk'));
    assert.deepEqual(cudzie, [], `${cesta} načítava cudzí zdroj: ${cudzie.join(', ')}`);
    // mapa smie byť na stránke iba ako data-src, nie ako živý iframe
    assert.ok(!/<iframe/.test(html), `${cesta} obsahuje iframe ešte pred súhlasom`);
  }
});

/* ==================================================================== B5 */

test('B5 – opakované zlé pokusy o token z jednej IP skončia na 429', async () => {
  const ip = novaIp();
  const zly = { Authorization: 'Bearer uplne-nespravny-token-s-dostatocnou-dlzkou', 'x-forwarded-for': ip };
  const stavy = [];
  for (let i = 0; i < 12; i++) {
    const r = await fetch(A + '/api/queue', { headers: zly });
    stavy.push(r.status);
    await r.body?.cancel?.();
  }
  assert.deepEqual([...new Set(stavy.slice(0, 10))], [401], 'prvých desať pokusov malo vrátiť 401');
  assert.equal(stavy[10], 429, 'jedenásty pokus mal naraziť na limit');
  assert.equal(stavy[11], 429);

  // limit je na IP – iná adresa sa s platným tokenom dostane ďalej
  const ina = await fetch(A + '/api/queue', {
    headers: { Authorization: 'Bearer ' + TOKEN, 'x-forwarded-for': novaIp() },
  });
  assert.equal(ina.status, 200, 'limit zablokoval aj nevinnú IP');

  /* Správny token prejde aj z IP, ktorá má za sebou neúspešné pokusy. Je to
     zámer, nie medzera: uhádnuť 32-znakový náhodný token sa nedá, ale keby
     limit platil aj pre správny token, stačilo by poslať desať nesprávnych
     z tej istej IP (kuchyňa aj útočník bývajú za spoločným NAT) a tlač
     objednávok by stála štvrť hodiny. Throttling je tu proti hluku. */
  const spravny = await fetch(A + '/api/queue', {
    headers: { Authorization: 'Bearer ' + TOKEN, 'x-forwarded-for': ip },
  });
  assert.equal(spravny.status, 200, 'zlé pokusy cudzieho nesmú odstaviť tlačového agenta');

  // ďalší nesprávny pokus z tej istej IP je stále zastavený
  const dalsiZly = await fetch(A + '/api/queue', { headers: zly });
  assert.equal(dalsiZly.status, 429, 'limit prestal platiť po úspešnom prihlásení');
});

test('B5/D3 – overenie správneho tokenu nestojí ani jeden dotaz do úložiska', async () => {
  // Agent aj nástenka sa pýtajú celý deň. Keby každé overenie znamenalo čítanie
  // počítadla, minulo by to polovicu mesačného limitu Upstashu (pozri kvoty.test.js).
  const kod = fs.readFileSync(path.join(KOREN, 'api', '_token.js'), 'utf8');
  const telo = kod.slice(kod.indexOf('async function straz'));
  const uspech = telo.slice(0, telo.indexOf('const ip = klientskaIp'));
  assert.ok(/if \(overToken\(zHlavicky\(req\)\)\) return true;/.test(uspech),
    'úspešná cesta sa už neukončuje pred prácou s počítadlom');
  assert.ok(!/store\.(get|pocitadlo|set)/.test(uspech),
    'na úspešnej ceste pribudol dotaz do úložiska');
});

/* ==================================================================== D1 */

test('D1 – bez nastavenej dôveryhodnej hlavičky sa podvrhnutá IP limit neobíde', async () => {
  /* Server D beží tak, ako keby bol na hostingu bez proxy, ktorá by hlavičku
     prepisovala. Útočník mení x-forwarded-for pri každej požiadavke; keby sme
     jej verili, mal by zakaždým čistý limit a obmedzenie 5 objednávok / 10 minút
     by neznamenalo nič. Všetky požiadavky prídu z rovnakého soketu, takže sa
     musia počítať do jedného vedra. */
  const stavy = [];
  for (let i = 0; i < 7; i++) {
    const r = await fetch(D + '/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `192.0.2.${i + 1}` },
      body: JSON.stringify(objednavka()),
    });
    stavy.push(r.status);
    await r.body?.cancel?.();
  }
  assert.ok(stavy.includes(429), `podvrhnutá IP obišla limit: ${stavy.join(', ')}`);
  assert.equal(stavy[5], 429, 'šiesta objednávka mala naraziť na limit aj pri meniacej sa hlavičke');
});

test('D1 – hlavička s IP platí len vtedy, keď je výslovne pomenovaná', async () => {
  /* Rovnaké dve požiadavky, dva servery. Na A je VILA27_IP_HEADER nastavená,
     takže sa rôzne IP počítajú zvlášť; na D nastavená nie je, takže sa
     podvrhnutá hlavička ignoruje a obe padnú do jedného vedra. Rozdiel medzi
     nimi je presne to, čo tá premenná znamená. */
  const posliNa = (base, ip) => fetch(base + '/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(objednavka()),
  });

  // A: dve čerstvé, navzájom nesúvisiace IP – obe prejdú
  const a1 = await posliNa(A, novaIp());
  const a2 = await posliNa(A, novaIp());
  assert.equal(a1.status, 201);
  assert.equal(a2.status, 201, 'nastavená hlavička sa neberie do úvahy');
  await a1.body?.cancel?.(); await a2.body?.cancel?.();

  // D: limit je už vyčerpaný z predchádzajúceho testu a nová „IP“ ho neobnoví
  const d1 = await posliNa(D, '192.0.2.250');
  assert.equal(d1.status, 429, 'podvrhnutá hlavička vyrobila nové vedro');
  await d1.body?.cancel?.();

  assert.match(fs.readFileSync(path.join(KOREN, 'api', '_ip.js'), 'utf8'), /process\.env\.VILA27_IP_HEADER/);
});

/* ==================================================================== PO */

test('PO – cez zatvorené prejde predobjednávka, bežná objednávka nie', async () => {
  // server B má zatvorené každý deň, takže nemá žiadne voľné termíny
  const bezna = await posli(B, objednavka());
  assert.equal(bezna.status, 409);
  const d = await bezna.json();
  assert.equal(d.zatvorene, true);
  assert.equal(d.predobjednavkaMozna, false, 'pri trvalo zatvorenom nemá čo ponúkať');
  assert.match(d.error, /predobjednávku/i);

  /* Server P má otváracie hodiny len ráno, takže popoludní je zatvorený,
     ale na zajtra ráno sa predobjednať dá. Presne ten prípad, o ktorý ide. */
  const menu = await (await fetch(P + '/api/menu')).json();
  assert.ok(Array.isArray(menu.terminy) && menu.terminy.length, 'server neponúka žiadne termíny');

  const zatvoreneTeraz = await posli(P, objednavka());
  assert.equal(zatvoreneTeraz.status, 409, 'bežná objednávka mimo hodín má byť odmietnutá');
  assert.equal((await zatvoreneTeraz.json()).predobjednavkaMozna, true);

  const termin = menu.terminy[0];
  const pre = await posli(P, objednavka({ pozadovanyCas: termin.iso }));
  assert.equal(pre.status, 201, 'predobjednávka cez zatvorené neprešla');
  const p = await pre.json();
  assert.equal(p.predobjednavka, true);
  assert.equal(p.pozadovanyCasPopis, termin.popis);
});

test('PO – neplatný termín predobjednávky sa odmietne', async () => {
  const skusky = [
    ['minulosť', '2020-01-01T10:00:00.000Z', /najskôr|nevaríme|dnes alebo zajtra/i],
    ['o týždeň', new Date(Date.now() + 7 * 864e5).toISOString(), /dnes alebo zajtra/i],
    ['nezmysel', 'zajtra o šiestej', /nie je platný/i],
    ['prázdny', '', /Vyberte/i],
  ];
  for (const [co, hodnota, vzor] of skusky) {
    const r = await posli(P, objednavka({ pozadovanyCas: hodnota }));
    assert.equal(r.status, 400, co);
    assert.match((await r.json()).error, vzor, co);
  }
  // nesprávny typ
  const zly = await posli(P, objednavka({ pozadovanyCas: 12345 }));
  assert.equal(zly.status, 400);
});

test('PO – predobjednávka sa dostane na nástenku aj do fronty označená', async () => {
  const menu = await (await fetch(P + '/api/menu')).json();
  const termin = menu.terminy[1] || menu.terminy[0];
  const r = await posli(P, objednavka({ pozadovanyCas: termin.iso }));
  assert.equal(r.status, 201);
  const prijata = await r.json();

  const q = await fetch(P + '/api/queue?all=1', { headers: { Authorization: 'Bearer ' + TOKEN } });
  const { orders } = await q.json();
  const moja = orders.find(o => o.number === prijata.number);
  assert.ok(moja, 'predobjednávka nie je vo fronte');
  assert.equal(moja.predobjednavka, true);
  assert.equal(moja.pozadovanyCas, termin.iso);
  assert.equal(moja.pozadovanyCasPopis, termin.popis);
});
