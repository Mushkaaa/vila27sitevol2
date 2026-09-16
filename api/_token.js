'use strict';
/**
 * Overenie PRINT_TOKEN pre /api/queue a nástenku objednávok (B1–B3, B5).
 *
 *  - Token sa berie VÝHRADNE z hlavičky `Authorization: Bearer …`.
 *    V URL ani v tele požiadavky sa naň neprihliada – query string končí
 *    v logoch, v histórii prehliadača aj v hlavičke Referer.
 *  - Keď PRINT_TOKEN nie je nastavený alebo je kratší ako 32 znakov,
 *    odmietne sa VŠETKO (fail closed). Žiadne „undefined === undefined“.
 *  - Porovnáva sa v konštantnom čase cez odtlačky rovnakej dĺžky.
 *  - Neúspešné pokusy sa počítajú na IP; po prekročení limitu → 429.
 */
const crypto = require('crypto');
const store = require('./_store');
const { klientskaIp } = require('./_ip');

const MIN_DLZKA = 32;
const POKUSY_LIMIT = Number(process.env.AUTH_FAIL_LIMIT) || 10;
const POKUSY_OKNO = Number(process.env.AUTH_FAIL_WINDOW_S) || 15 * 60;   // 15 minút

const odtlacok = v => crypto.createHash('sha256').update(String(v), 'utf8').digest();

/** Konštantný čas – porovnávajú sa vždy 32-bajtové odtlačky, takže ani dĺžka neunikne. */
function rovnake(a, b) {
  return crypto.timingSafeEqual(odtlacok(a), odtlacok(b));
}

/** Je server vôbec nastavený tak, aby sa dalo bezpečne autorizovať? */
function tokenNastaveny() {
  const t = process.env.PRINT_TOKEN;
  return typeof t === 'string' && t.length >= MIN_DLZKA;
}

/** Vytiahne token iba z hlavičky Authorization: Bearer. */
function zHlavicky(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
  return m ? m[1].trim() : '';
}

/**
 * Čisté overenie bez HTTP – testovateľné.
 * @returns {boolean}
 */
function overToken(dany) {
  if (!tokenNastaveny()) return false;                  // fail closed
  if (typeof dany !== 'string' || !dany) return false;
  return rovnake(dany, process.env.PRINT_TOKEN);
}

const KLUC_POKUS = ip => `vila27:auth:zle:${ip}`;

/**
 * Stráž pre chránené endpointy. Sama odpovie 401/429/503 a vráti false.
 * @returns {Promise<boolean>} true = požiadavka smie pokračovať
 */
async function straz(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!tokenNastaveny()) {
    // Nie je to chyba klienta – server nie je nakonfigurovaný. Detail ostáva v logu.
    console.error('PRINT_TOKEN nie je nastavený alebo je kratší ako 32 znakov – odmietam všetko.');
    res.status(503).json({ ok: false, error: 'Služba nie je dostupná.' });
    return false;
  }

  /* Správny token sa overí bez jediného dotazu do Redisu (D3).
     Počítadlo neúspechov sa číta aj zapisuje IBA na chybovej ceste. Má to dva
     dôvody:
       – tlačový agent a nástenka sa pýtajú celý deň; jeden GET navyše pri
         každej otázke bol polovicou celej mesačnej spotreby,
       – a hlavne: keby limit platil aj pre správny token, stačilo by poslať
         desať nesprávnych z tej istej IP (napr. cez rovnaké NAT ako
         reštaurácia) a tlač objednávok by stála štvrť hodiny. Uhádnuť
         32-znakový náhodný token sa aj tak nedá, throttling je tu proti
         hluku, nie ako jediná obrana. */
  if (overToken(zHlavicky(req))) return true;

  const ip = klientskaIp(req);
  let zlych = 1;
  try { zlych = await store.pocitadlo(KLUC_POKUS(ip), POKUSY_OKNO); } catch { zlych = 1; }

  if (zlych > POKUSY_LIMIT) {
    res.setHeader('Retry-After', String(POKUSY_OKNO));
    res.status(429).json({ ok: false, error: 'Priveľa pokusov. Skúste to neskôr.' });
    return false;
  }

  res.status(401).json({ ok: false, error: 'Neplatný token' });
  return false;
}

module.exports = { straz, overToken, tokenNastaveny, zHlavicky, MIN_DLZKA, POKUSY_LIMIT, POKUSY_OKNO };
