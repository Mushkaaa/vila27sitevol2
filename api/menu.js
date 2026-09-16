'use strict';
/**
 * GET /api/menu – jedálny lístok a rozvozová ponuka pre verejné stránky.
 *
 * Vracia len položky, ktoré sú zapnuté – vypnuté sa k zákazníkovi vôbec
 * nedostanú. Odpoveď drží CDN minútu, aby bežná návštevnosť nechodila
 * zakaždým do Redisu, ale úprava ponuky sa prejavila rýchlo.
 */
const menu = require('./_menu');
const hodiny = require('./_hours');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Použite GET.' });
  }

  try {
    const [rozvoz, jedalnylistok] = await Promise.all([
      menu.nacitaj('rozvoz'),
      menu.nacitaj('jedalnylistok'),
    ]);

    // Krátko, nech sa úprava ponuky prejaví na stránke do minúty. Zvyšok
    // návštevnosti aj tak odchytí CDN, do Redisu sa chodí nanajvýš raz za minútu.
    // Kratšie okno, lebo v odpovedi je aj stav otvorené/zatvorené (C4).
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({
      ok: true,
      rozvoz: menu.ibaOnline(rozvoz),
      jedalnylistok: menu.ibaOnline(jedalnylistok),
      alergeny: menu.ALERGENY,
      hodiny: hodiny.stav(),
      ...(await menu.spolocne()),
    });
  } catch (e) {
    console.error('Menu sa nepodarilo poskladať:', e.message);   // H1
    return res.status(503).json({ ok: false, error: 'Ponuku sa nepodarilo načítať.' });
  }
};
