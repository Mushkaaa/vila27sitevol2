'use strict';
/**
 * Najmenší možný Upstash Redis cez REST – iba na meranie a testy.
 *
 * Hovorí rovnakým protokolom ako Upstash: POST s telom ["PRÍKAZ", arg, arg…],
 * odpoveď { result: … }. Počíta, koľko príkazov cez neho prešlo, takže sa dá
 * zmerať, koľko mesačných príkazov spotrebuje reálna prevádzka (D3) namiesto
 * toho, aby sa to odhadovalo od stola.
 *
 * Expirácia sa iba zaznamenáva, nevypršiava – testy bežia rádovo sekundy.
 * Toto NIE JE náhrada Redisu na prevádzku, len meracie zariadenie.
 */
const http = require('node:http');

function vytvor() {
  const kv = new Map();          // reťazce
  const zoznamy = new Map();     // pole
  const mnoziny = new Map();     // Set
  const ttl = new Map();
  const pocet = new Map();       // príkaz → koľkokrát

  const zoznam = k => zoznamy.get(k) || (zoznamy.set(k, []), zoznamy.get(k));
  const mnozina = k => mnoziny.get(k) || (mnoziny.set(k, new Set()), mnoziny.get(k));

  function vykonaj(cmd) {
    const [surovy, ...a] = cmd;
    const prikaz = String(surovy).toUpperCase();
    pocet.set(prikaz, (pocet.get(prikaz) || 0) + 1);

    switch (prikaz) {
      case 'GET': return kv.has(a[0]) ? kv.get(a[0]) : null;
      case 'SET': {
        kv.set(a[0], String(a[1]));
        const i = a.findIndex(x => String(x).toUpperCase() === 'EX');
        if (i !== -1) ttl.set(a[0], Number(a[i + 1]));
        return 'OK';
      }
      case 'DEL': {
        const bol = kv.delete(a[0]) || zoznamy.delete(a[0]) || mnoziny.delete(a[0]);
        ttl.delete(a[0]);
        return bol ? 1 : 0;
      }
      case 'EXPIRE': ttl.set(a[0], Number(a[1])); return 1;
      case 'TTL': return ttl.has(a[0]) ? ttl.get(a[0]) : -1;
      case 'INCR': {
        const n = Number(kv.get(a[0]) || 0) + 1;
        kv.set(a[0], String(n));
        return n;
      }
      case 'LPUSH': { const l = zoznam(a[0]); l.unshift(...a.slice(1).map(String)); return l.length; }
      case 'LTRIM': {
        const l = zoznam(a[0]);
        const od = Number(a[1]);
        const doo = Number(a[2]);
        zoznamy.set(a[0], l.slice(od, doo < 0 ? undefined : doo + 1));
        return 'OK';
      }
      case 'LRANGE': {
        const l = zoznam(a[0]);
        const doo = Number(a[2]);
        return l.slice(Number(a[1]), doo < 0 ? undefined : doo + 1);
      }
      case 'MGET': return a.map(k => (kv.has(k) ? kv.get(k) : null));
      case 'SADD': { const m = mnozina(a[0]); const pred = m.size; a.slice(1).forEach(x => m.add(String(x))); return m.size - pred; }
      case 'SREM': { const m = mnozina(a[0]); let n = 0; a.slice(1).forEach(x => { if (m.delete(String(x))) n++; }); return n; }
      case 'SMEMBERS': return [...mnozina(a[0])];
      default: throw new Error('fake-upstash nepozná príkaz ' + prikaz);
    }
  }

  const server = http.createServer(async (req, res) => {
    const kusy = [];
    for await (const c of req) kusy.push(c);
    let odpoved;
    try {
      const telo = JSON.parse(Buffer.concat(kusy).toString('utf8') || '[]');
      // Upstash vie aj dávky (pole polí) – podporíme oboje
      odpoved = Array.isArray(telo[0])
        ? telo.map(c => ({ result: vykonaj(c) }))
        : { result: vykonaj(telo) };
    } catch (e) {
      res.writeHead(400, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(odpoved));
  });

  return {
    server,
    /** Koľko Redis príkazov cez server prešlo. */
    spolu: () => [...pocet.values()].reduce((s, n) => s + n, 0),
    rozpis: () => Object.fromEntries([...pocet.entries()].sort((a, b) => b[1] - a[1])),
    vynuluj: () => pocet.clear(),
    pocuvaj: port => new Promise(r => server.listen(port, '127.0.0.1', r)),
    zavri: () => new Promise(r => server.close(r)),
  };
}

module.exports = { vytvor };
