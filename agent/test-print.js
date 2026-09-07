'use strict';
/**
 * Testovacia tlač – nepotrebuje server ani internet.
 * Spusti:  node test-print.js
 *
 * Ak chceš vidieť bloček ako text v konzole namiesto tlače:
 *   node test-print.js --nahlad
 *
 * Bloček pre osobný odber (bez adresy a telefónu):
 *   node test-print.js --odber --nahlad
 *
 * S cenami, dopravou a zúčtovaním (nemení config.json):
 *   node test-print.js --ceny --nahlad
 */
const fs = require('fs');
const path = require('path');
const { buildReceipt } = require('./receipt');
const { print } = require('./transport');

const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const odber = process.argv.includes('--odber');

const items = [
  { name: 'Halušky s bryndzou', qty: 2, unitPrice: 10.90, extras: ['slanina'], lineTotal: 21.80 },
  { name: 'Bravčový rezeň v panko strúhanke so zemiakovým pyré a cesnakovou majonézou', qty: 1, unitPrice: 12.90, extras: [], lineTotal: 12.90 },
  { name: 'Cézar šalát', qty: 1, unitPrice: 11.90, extras: ['100g kuracie prsia'], lineTotal: 11.90 },
  { name: 'Kofola 0,5l', qty: 2, unitPrice: 2.20, extras: [], lineTotal: 4.40 },
];

// Súčty rátame z položiek, nech sa pri úprave cien nerozídu.
const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
const fee = odber ? 0 : 2.50;   // pri osobnom odbere sa doprava neúčtuje

const vzor = {
  id: 'test',
  number: 42,
  createdAt: new Date().toISOString(),
  mode: odber ? 'odber' : 'rozvoz',
  customer: {
    name: 'Ján Novák',
    phone: '+421 900 123 456',
    address: 'A. Hlinku 210, Bešeňová',
    time: 'Čo najskôr',
    pay: 'Hotovosť pri prevzatí',
    note: 'Prosím zvoniť na Novák, alergia na orechy.',
  },
  items,
  subtotal,
  fee,
  total: subtotal + fee,
};

// --ceny zapne súčty len pre tento test, config.json ostáva nedotknutý
const receiptCfg = process.argv.includes('--ceny')
  ? Object.assign({}, CFG.receipt, { showPrices: true })
  : CFG.receipt;

const data = buildReceipt(vzor, receiptCfg, 'TEST');

if (process.argv.includes('--nahlad')) {
  require('./nahlad').render(data, receiptCfg.width || 48);
  process.exit(0);
}

print(data, CFG.printer)
  .then(() => console.log('✓ Odoslané do tlačiarne. Ak nič nevyšlo, pozri README – časť „Tlačiareň nereaguje".'))
  .catch(e => { console.error('✗ Chyba: ' + e.message); process.exit(1); });
