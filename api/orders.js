'use strict';
/**
 * POST /api/orders  – prijme objednávku zo stránky, uloží ju do fronty.
 * Odpoveď: { ok: true, number: 12 }
 *
 * Z prehliadača berieme len to, ČO si zákazník vybral (id produktu, počet,
 * doplnky). Všetky ceny sa rátajú tu z uloženého menu – čokoľvek cenové, čo
 * príde z prehliadača, sa ignoruje.
 */
const store = require('./_store');
const menu = require('./_menu');

const GF_POPIS = 'bezlepkové cesto';          // ako sa bezlepkové cesto píše na bloček

const txt = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const round = n => Math.round(n * 100) / 100;

const zonaPre = (zony, obec) => zony.find(z => z.villages.includes(obec)) || null;

/** Cena doplnku podľa uloženého menu. null = taký doplnok k tomuto jedlu nepatrí. */
function cenaDoplnku(produkt, nazov, spolocne) {
  if (menu.maPizzaDoplnky(produkt)) {
    const skupina = spolocne.toppings.find(g => g.items.includes(nazov));
    return skupina ? skupina.price : null;
  }
  for (const g of produkt.addonGroups || []) {
    const o = (g.options || []).find(o => o.name === nazov);
    if (o) return Number(o.price) || 0;
  }
  return null;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Použi POST' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    const poslane = Array.isArray(body.items) ? body.items.slice(0, 60) : [];
    if (!poslane.length) return res.status(400).json({ ok: false, error: 'Prázdny košík' });

    const c = body.customer || {};
    if (!txt(c.name) || !txt(c.phone)) {
      return res.status(400).json({ ok: false, error: 'Chýba meno alebo telefón' });
    }

    const spolocne = await menu.spolocne();
    const mode = body.mode === 'odber' ? 'odber' : 'rozvoz';
    const village = mode === 'rozvoz' ? txt(c.village, 60) : '';
    const zone = mode === 'rozvoz' ? zonaPre(spolocne.deliveryZones, village) : null;
    if (mode === 'rozvoz' && !zone) {
      return res.status(400).json({ ok: false, error: 'Vyberte obec doručenia' });
    }
    if (mode === 'rozvoz' && !txt(c.address)) {
      return res.status(400).json({ ok: false, error: 'Chýba adresa doručenia' });
    }

    // ---- ceny sa rátajú z menu, nie z toho, čo poslal prehliadač ----
    const ponuka = menu.podlaId(await menu.nacitaj('rozvoz'));

    const items = [];
    for (const poslana of poslane) {
      const produkt = ponuka.get(txt(poslana.id, 60));
      if (!produkt) {
        return res.status(400).json({ ok: false, error: 'Niektoré jedlo z košíka už nie je v ponuke. Obnovte stránku.' });
      }
      if (produkt.online === false) {
        return res.status(400).json({ ok: false, error: `${produkt.name} práve nie je v ponuke. Obnovte stránku.` });
      }

      const qty = Math.max(1, Math.min(50, Math.round(Number(poslana.qty) || 1)));

      const nazvy = (Array.isArray(poslana.extras) ? poslana.extras : []).slice(0, 15).map(x => txt(x, 60));
      const extras = [];
      let priplatok = 0;
      for (const nazov of nazvy) {
        const cena = cenaDoplnku(produkt, nazov, spolocne);
        if (cena == null) {
          return res.status(400).json({ ok: false, error: `Doplnok „${nazov}“ k jedlu ${produkt.name} neponúkame.` });
        }
        priplatok += cena;
        extras.push(nazov);
      }

      const bezlepkove = poslana.gf === true && produkt.catId === 'pizza';
      if (bezlepkove) { priplatok += Number(spolocne.glutenFree.price) || 0; extras.push(GF_POPIS); }

      const unitPrice = round(Number(produkt.price) + priplatok);
      items.push({
        id: produkt.id,
        name: (produkt.no ? produkt.no + '. ' : '') + produkt.name,
        qty,
        unitPrice,
        extras,
        lineTotal: round(unitPrice * qty),
      });
    }

    const subtotal = round(items.reduce((s, i) => s + i.lineTotal, 0));
    if (zone && subtotal < zone.min) {
      return res.status(400).json({ ok: false, error: `Minimálna objednávka pre obec ${village} je ${zone.min.toFixed(2)} € (bez dopravy)` });
    }
    const fee = zone ? zone.fee : 0;
    const total = round(subtotal + fee);

    const order = {
      id: (globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2)),
      number: await store.nextNumber(),
      createdAt: new Date().toISOString(),
      mode,
      customer: {
        name: txt(c.name, 80),
        phone: txt(c.phone, 40),
        address: mode === 'rozvoz' ? `${txt(c.address, 160)}, ${village}` : '',
        village,
        time: txt(c.time, 60),
        pay: txt(c.pay, 60),
        note: txt(c.note, 400),
      },
      items,
      subtotal,
      fee,
      total,
    };

    await store.save(order);

    return res.status(200).json({
      ok: true,
      number: order.number,
      total: order.total,
      storage: store.hasRedis ? 'redis' : 'pamäť (dočasné!)',
    });
  } catch (e) {
    console.error('Chyba pri ukladaní objednávky:', e);
    return res.status(500).json({ ok: false, error: 'Objednávku sa nepodarilo uložiť' });
  }
};
