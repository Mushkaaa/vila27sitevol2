'use strict';
/**
 * GET  /api/queue?token=...        – vráti objednávky, ktoré ešte neboli vytlačené
 * GET  /api/queue?token=...&all=1  – vráti posledných 60 objednávok (pre admin a dotlač)
 * POST /api/queue  { token, ids }  – označí objednávky ako vytlačené
 *
 * Token sa nastavuje na Verceli ako premenná prostredia PRINT_TOKEN
 * a musí sa zhodovať s tokenom v agent/config.json.
 */
const store = require('./_store');

function authorized(req, tokenFromBody) {
  const expected = process.env.PRINT_TOKEN;
  if (!expected) return false;                        // bez nastaveného tokenu radšej nič nepustíme
  const given = tokenFromBody
    || (req.query && req.query.token)
    || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return given === expected;
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Neplatný token' });

      const all = req.query && (req.query.all === '1' || req.query.all === 'true');
      const orders = await store.list(60);
      if (all) return res.status(200).json({ ok: true, orders });

      const printed = await store.printedIds();
      return res.status(200).json({ ok: true, orders: orders.filter(o => !printed.has(o.id)) });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (!authorized(req, body.token)) return res.status(401).json({ ok: false, error: 'Neplatný token' });

      const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).slice(0, 100);
      await store.markPrinted(ids);
      return res.status(200).json({ ok: true, marked: ids.length });
    }

    return res.status(405).json({ ok: false, error: 'Nepodporovaná metóda' });
  } catch (e) {
    console.error('Chyba fronty:', e);
    return res.status(500).json({ ok: false, error: 'Chyba servera' });
  }
};
