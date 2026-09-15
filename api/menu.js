'use strict';
/**
 * GET /api/menu – jedálny lístok a rozvozová ponuka pre verejné stránky.
 *
 * Vracia len položky, ktoré sú zapnuté – vypnuté sa k zákazníkovi vôbec
 * nedostanú. Odpoveď drží CDN minútu, aby bežná návštevnosť nechodila
 * zakaždým do Redisu, ale úprava ponuky sa prejavila rýchlo.
 */
const menu = require('./_menu');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Použi GET' });

  try {
    const [rozvoz, jedalnylistok] = await Promise.all([
      menu.nacitaj('rozvoz'),
      menu.nacitaj('jedalnylistok'),
    ]);

    // Krátko, nech sa úprava ponuky prejaví na stránke do minúty. Zvyšok
    // návštevnosti aj tak odchytí CDN, do Redisu sa chodí nanajvýš raz za minútu.
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      ok: true,
      rozvoz: menu.ibaOnline(rozvoz),
      jedalnylistok: menu.ibaOnline(jedalnylistok),
      alergeny: menu.ALERGENY,
      ...menu.spolocne(),
    });
  } catch (e) {
    console.error('Menu sa nepodarilo poskladať:', e);
    return res.status(500).json({ ok: false, error: 'Menu sa nepodarilo načítať' });
  }
};
