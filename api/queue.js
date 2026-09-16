'use strict';
/**
 * GET  /api/queue          – objednávky, ktoré ešte neboli vytlačené
 * GET  /api/queue?all=1    – posledných 60 objednávok (nástenka a dotlač)
 * POST /api/queue  { ids }            – agent hlási, čo vytlačil
 * POST /api/queue  { hotove, stav }   – obsluha označí objednávku za vybavenú
 *
 * Autorizácia (B1–B3): VŽDY a IBA hlavička `Authorization: Bearer <PRINT_TOKEN>`.
 * Token v URL sa zámerne ignoruje – skončil by v logoch CDN, v histórii
 * prehliadača aj v hlavičke Referer. Bez nastaveného tokenu sa neprepustí nič.
 *
 * Tvar odpovede (`orders`) ostáva kvôli tlačovému agentovi nezmenený.
 */
const store = require('./_store');
const { straz } = require('./_token');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Nepodporovaná metóda.' });
  }

  // B4 – token sa overuje pri každej metóde, ešte pred akoukoľvek prácou
  if (!await straz(req, res)) return;

  try {
    if (req.method === 'GET') {
      const all = req.query && (req.query.all === '1' || req.query.all === 'true');

      /* D3 – lacná otázka „zmenilo sa niečo?“.
         Klient pošle verziu, ktorú naposledy videl. Ak sedí, odpovieme jedným
         Redis príkazom namiesto štyroch a bez tela. Drvivá väčšina otázok je
         práve taká, takže to rozhoduje o tom, či sa zmestíme do bezplatného
         limitu Upstashu. Klient bez `v` dostane plnú odpoveď ako predtým. */
      const v = await store.verzia();
      const znama = Number(req.query && req.query.v);
      if (Number.isInteger(znama) && znama === v) {
        return res.status(200).json({ ok: true, v, nezmenene: true, orders: [] });
      }

      const orders = await store.list(60);
      const printed = await store.printedIds();

      if (all) {
        const hotove = await store.doneIds();
        const su = new Set(orders.map(o => o.id));
        return res.status(200).json({
          ok: true,
          v,
          orders,
          printed: [...printed].filter(id => su.has(id)),
          hotove: [...hotove].filter(id => su.has(id)),
        });
      }

      return res.status(200).json({ ok: true, v, orders: orders.filter(o => !printed.has(o.id)) });
    }

    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    } catch {
      return res.status(400).json({ ok: false, error: 'Neplatný obsah požiadavky.' });
    }

    // obsluha na nástenke označuje vybavené objednávky
    if (Array.isArray(body.hotove)) {
      const hotove = body.hotove.map(String).slice(0, 100);
      await store.markDone(hotove, body.stav !== false);
      return res.status(200).json({ ok: true, marked: hotove.length });
    }

    // tlačový agent hlási, čo už vytlačil
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).slice(0, 100);
    await store.markPrinted(ids);
    return res.status(200).json({ ok: true, marked: ids.length });
  } catch (e) {
    console.error('Chyba fronty:', e.message);         // H1 – detail ostáva v logu
    return res.status(503).json({ ok: false, error: 'Fronta objednávok je dočasne nedostupná.' });
  }
};
