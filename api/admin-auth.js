'use strict';
/**
 * POST /api/admin-auth  { akcia: 'start' | 'prihlas' | 'odhlas' }
 *
 *   start    – stránka sa práve načítala. Akékoľvek staré sedenie sa ruší,
 *              takže po obnovení stránky (F5, Späť, znovuotvorenie) treba
 *              zadať heslo nanovo. Odpoveď je vždy „neprihlásený“.
 *   prihlas  – overí meno a heslo, založí sedenie a nastaví cookie.
 *   odhlas   – zmaže sedenie na serveri aj cookie.
 */
const auth = require('./_auth');

const text = (v, max = 200) => String(v ?? '').trim().slice(0, max);

module.exports = async (req, res) => {
  auth.bezCache(res);

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Použi POST' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const akcia = text(body.akcia, 20);

    if (akcia === 'start') {
      await auth.zrus(req, res);
      return res.status(200).json({ ok: true, prihlaseny: false });
    }

    if (akcia === 'odhlas') {
      await auth.zrus(req, res);
      return res.status(200).json({ ok: true });
    }

    if (akcia === 'prihlas') {
      /* Rozlíšime „server nemá nastavené prihlásenie“ od „zadal si to zle“.
         Bez toho dostane majiteľ pri chýbajúcej premennej hlášku o nesprávnom
         hesle a hľadá chybu tam, kde nie je. Útočníkovi to nepomôže – aj tak
         sa nemá ako prihlásiť, keď na serveri nie sú žiadne údaje. */
      if (!auth.nastavene()) {
        console.error(
          'Prihlásenie do správy ponuky nie je nastavené: ADMIN_USER musí mať aspoň 3 znaky '
          + `a ADMIN_PASS aspoň ${auth.MIN_HESLO}. Doplň ich medzi premenné prostredia a reštartuj.`,
        );
        auth.zmazCookie(res);
        return res.status(503).json({
          ok: false,
          error: 'Prihlásenie zatiaľ nie je na serveri nastavené. Treba doplniť ADMIN_USER a ADMIN_PASS.',
        });
      }

      const meno = text(body.meno, 80);
      const heslo = text(body.heslo, 200);
      if (!auth.overUdaje(meno, heslo)) {
        auth.zmazCookie(res);
        return res.status(401).json({ ok: false, error: 'Nesprávne meno alebo heslo.' });
      }
      await auth.zaloz(res, meno);
      return res.status(200).json({ ok: true, minut: Math.round(auth.PLATNOST / 60) });
    }

    return res.status(400).json({ ok: false, error: 'Neznáma akcia' });
  } catch (e) {
    console.error('Chyba prihlásenia:', e);
    return res.status(500).json({ ok: false, error: 'Chyba servera' });
  }
};
