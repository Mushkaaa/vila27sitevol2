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

/**
 * Krátka pamäť v rámci bežiacej inštancie (D3).
 *
 * Pred ňou stálo každé zobrazenie jedálneho lístka alebo objednávkovej stránky
 * päť až šesť Redis príkazov. Za CDN to zachytila hlavička s-maxage, ale na
 * hostingu bez CDN nie – a Upstash má mesačný strop. Ponuka sa mení zriedka,
 * 30 sekúnd oneskorenia je rovnaké, aké už povoľuje s-maxage.
 */
const CACHE_MS = Number(process.env.MENU_CACHE_MS) || 5 * 60 * 1000;
const pamat = menu.VEREJNY_CACHE;

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Použite GET.' });
  }

  try {
    if (pamat.telo && pamat.do > Date.now()) {
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
      // stav otvorené/zatvorené sa počíta lokálne, Redis naň netreba
      return res.status(200).json({ ...pamat.telo, hodiny: hodiny.stav(), terminy: hodiny.terminy() });
    }
    const [rozvoz, jedalnylistok] = await Promise.all([
      menu.nacitaj('rozvoz'),
      menu.nacitaj('jedalnylistok'),
    ]);

    const telo = {
      ok: true,
      rozvoz: menu.ibaOnline(rozvoz),
      jedalnylistok: menu.ibaOnline(jedalnylistok),
      alergeny: menu.ALERGENY,
      ...(await menu.spolocne()),
    };
    pamat.telo = telo;
    pamat.do = Date.now() + CACHE_MS;

    // Krátko, nech sa úprava ponuky prejaví na stránke do minúty. Kratšie okno,
    // lebo v odpovedi je aj stav otvorené/zatvorené (C4).
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    // termíny sa nekešujú – posúvajú sa každou štvrťhodinou
    return res.status(200).json({ ...telo, hodiny: hodiny.stav(), terminy: hodiny.terminy() });
  } catch (e) {
    console.error('Menu sa nepodarilo poskladať:', e.message);   // H1
    return res.status(503).json({ ok: false, error: 'Ponuku sa nepodarilo načítať.' });
  }
};
