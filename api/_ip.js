'use strict';
/**
 * IP klienta pre limity (D1, B5).
 *
 * Toto je dôveryhodnostná hranica, nie pomocná funkcia. Hlavičky typu
 * `x-forwarded-for` si dokáže poslať ktokoľvek; dôveryhodné sú len vtedy, keď
 * ich prepisuje proxy, cez ktorú požiadavka naozaj prešla. Keby sme im verili
 * na hostingu bez takej proxy, stačilo by pri každej objednávke poslať inú
 * hodnotu a limit 5 objednávok / 10 minút (D1) aj limit zlých pokusov o token
 * (B5) by neznamenali nič.
 *
 * Preto sa hlavička nehádže: musí sa pomenovať v premennej VILA27_IP_HEADER.
 *   Vercel              → x-vercel-forwarded-for
 *   Cloudflare          → cf-connecting-ip
 *   Netlify             → x-nf-client-connection-ip
 *   nginx / Caddy       → x-real-ip  (a proxy ju musí prepisovať, nie prepúšťať!)
 *   bez proxy           → nenastavovať; použije sa adresa spojenia
 *
 * Keď premenná nie je nastavená, berie sa adresa TCP spojenia. To je vždy
 * pravdivé; za proxy to znamená, že všetci zdieľajú jeden limit – nepríjemné,
 * ale bezpečné. Opak (veriť podvrhnutej hlavičke) bezpečný nie je.
 */

const HLAVICKA = (process.env.VILA27_IP_HEADER || '').trim().toLowerCase();

let uzVarovane = false;

function klientskaIp(req) {
  const h = req.headers || {};

  if (HLAVICKA) {
    // Berieme PRVÚ adresu zľava – tú dopísala naša proxy.
    const prva = String(h[HLAVICKA] || '').split(',')[0].trim();
    if (prva) return prva.slice(0, 64);
  } else if (!uzVarovane && (h['x-forwarded-for'] || h['x-real-ip'])) {
    uzVarovane = true;
    console.warn(
      'VILA27_IP_HEADER nie je nastavená, ale požiadavky chodia cez proxy. '
      + 'Limity teraz počítajú všetkých návštevníkov ako jedného. '
      + 'Nastav názov hlavičky, ktorú tvoj hosting prepisuje (pozri api/_ip.js).',
    );
  }

  const sock = (req.socket && req.socket.remoteAddress) || '';
  return String(sock).slice(0, 64) || 'neznama';
}

module.exports = { klientskaIp, HLAVICKA };
