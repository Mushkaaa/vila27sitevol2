'use strict';
const { Receipt } = require('./escpos');

const eur = n => (Number(n) || 0).toFixed(2).replace('.', ',') + ' EUR';

function skDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}. ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Bloček je len informácia pre obsluhu — čo sa má pripraviť.
 * Do kasy si to obsluha zadá sama, takže ceny a súčty sa štandardne netlačia
 * (dajú sa zapnúť v config.json cez receipt.showPrices).
 *
 * Pri rozvoze pribudne blok s menom, telefónom a adresou.
 * Pri osobnom odbere je tam len meno a jedlo.
 */
function buildReceipt(order, cfg = {}, copyLabel = '') {
  const r = new Receipt({ width: cfg.width || 48, charset: cfg.charset || 'cp852' });
  const c = order.customer || {};
  const rozvoz = order.mode !== 'odber';
  const prices = cfg.showPrices === true;

  // ---- hlavička: číslo objednávky a typ ----
  r.align('center');
  r.ln('OBJEDNÁVKA');
  r.size(2, 2).bold(true).ln('#' + (order.number ?? '?')).bold(false).size(1, 1);
  r.ln(skDate(order.createdAt));
  r.feed(1);

  r.invert(true).size(1, 2).bold(true)
    .ln('  ' + (rozvoz ? 'ROZVOZ' : 'OSOBNÝ ODBER') + '  ')
    .bold(false).size(1, 1).invert(false);
  if (copyLabel) r.ln('( ' + copyLabel + ' )');
  r.align('left');

  // ---- doručenie: len pri rozvoze ----
  if (rozvoz) {
    r.hr('=');
    if (c.name) r.size(1, 2).bold(true).ln(c.name).bold(false).size(1, 1);
    if (c.phone) r.size(1, 2).ln(c.phone).size(1, 1);
    if (c.address) {
      r.feed(1);
      r.size(1, 2);
      r.para(c.address);
      r.size(1, 1);
    }
    if (c.time) r.ln('Čas: ' + c.time);
  } else if (c.name) {
    r.hr('=');
    r.size(1, 2).bold(true).ln(c.name).bold(false).size(1, 1);
    if (c.time) r.ln('Čas: ' + c.time);
  }

  // ---- jedlo ----
  r.hr('=');
  (order.items || []).forEach(it => {
    const qty = it.qty || 1;
    const price = prices
      ? eur(it.lineTotal != null ? it.lineTotal : (it.unitPrice || 0) * qty)
      : '';
    r.size(1, 2).bold(true);
    r.row(`${qty}x ${it.name}`, price, { hang: 4 });
    r.bold(false).size(1, 1);
    (it.extras || []).forEach(x => r.para('+ ' + x, 4));
    if (it.note) r.para('* ' + it.note, 4);
    r.feed(1);
  });

  // ---- súčty: len ak sú zapnuté v konfigu ----
  if (prices) {
    r.hr();
    r.row('Medzisúčet', eur(order.subtotal));
    if (order.fee) r.row('Doprava', eur(order.fee));
    r.bold(true).size(1, 2);
    r.row('SPOLU', eur(order.total));
    r.size(1, 1).bold(false);
    if (c.pay) r.ln('Platba: ' + c.pay);
  }

  // ---- poznámka zákazníka ----
  if (c.note && c.note.trim()) {
    r.hr('=');
    r.invert(true).bold(true).ln(' POZNÁMKA ').bold(false).invert(false);
    r.size(1, 2);
    r.para(c.note.trim());
    r.size(1, 1);
  }

  r.hr('=');
  r.cut();
  return r.build();
}

module.exports = { buildReceipt, eur };
