'use strict';
/**
 * POST /api/orders  – prijme objednávku zo stránky, uloží ju do fronty.
 * Odpoveď: { ok: true, number: 12 }
 */
const store = require('./_store');

const { DELIVERY_ZONES } = require('../menu-data.js');
const zoneFor = v => DELIVERY_ZONES.find(z => z.villages.includes(v)) || null;

const txt = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round = n => Math.round(n * 100) / 100;

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Použi POST' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    const items = Array.isArray(body.items) ? body.items.slice(0, 60) : [];
    if (!items.length) return res.status(400).json({ ok: false, error: 'Prázdny košík' });

    const c = body.customer || {};
    if (!txt(c.name) || !txt(c.phone)) {
      return res.status(400).json({ ok: false, error: 'Chýba meno alebo telefón' });
    }

    const mode = body.mode === 'odber' ? 'odber' : 'rozvoz';
    const village = mode === 'rozvoz' ? txt(c.village, 60) : '';
    const zone = mode === 'rozvoz' ? zoneFor(village) : null;
    if (mode === 'rozvoz' && !zone) {
      return res.status(400).json({ ok: false, error: 'Vyberte obec doručenia' });
    }
    if (mode === 'rozvoz' && !txt(c.address)) {
      return res.status(400).json({ ok: false, error: 'Chýba adresa doručenia' });
    }

    // sumy prepočítame na serveri, nespoliehame sa na to, čo poslal prehliadač
    const cleanItems = items.map(it => {
      const qty = Math.max(1, Math.min(50, Math.round(num(it.qty) || 1)));
      const unitPrice = round(num(it.unitPrice));
      return {
        name: txt(it.name, 120),
        qty,
        unitPrice,
        extras: (Array.isArray(it.extras) ? it.extras : []).slice(0, 15).map(x => txt(x, 60)),
        lineTotal: round(unitPrice * qty),
      };
    });

    const subtotal = round(cleanItems.reduce((s, i) => s + i.lineTotal, 0));
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
      items: cleanItems,
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
