'use strict';
/**
 * Jednorazový prevod pôvodného menu-data.js → menu.json. Už prebehol; ostáva
 * tu, aby sa dal zopakovať, keby bolo treba menu.json postaviť nanovo.
 *
 *   node _build/migrate-menu.js
 *
 * Z jedného zoznamu s príznakmi (order / orderOnly / order:false) spraví dva
 * nezávislé zoznamy, ktoré potom majiteľ upravuje oddelene:
 *
 *   rozvoz         – čo sa dá objednať cez web (kategórie order:true)
 *   jedalnylistok  – čo je v tlačenom lístku (všetko okrem orderOnly)
 *
 * ID položiek sa NEMENIA – visí na nich objednávkový formulár aj tlačový agent.
 * Textové alergény sa prekladajú na čísla podľa EÚ zoznamu, éčka idú bokom
 * do "additives", aby sa informácia nestratila.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const M = require(path.join(__dirname, 'menu-data-povodne.js'));

const ALERGENY = [
  [/lepok|obilnin/i, 1], [/kôrovc/i, 2], [/vajc/i, 3], [/ryb/i, 4],
  [/arašid/i, 5], [/sój/i, 6], [/mliek/i, 7], [/orech/i, 8],
  [/zeler/i, 9], [/horčic/i, 10], [/sezam/i, 11], [/siričit/i, 12],
  [/vlčí bôb/i, 13], [/mäkkýš/i, 14],
];

/** "lepok, mlieko, E150d" → { allergens: [1,7], additives: "E150d" } */
function prelozAlergeny(text) {
  const allergens = [], additives = [];
  String(text || '').split(',').map(s => s.trim()).filter(Boolean).forEach(kus => {
    const najdene = ALERGENY.find(([re]) => re.test(kus));
    if (najdene) { if (!allergens.includes(najdene[1])) allergens.push(najdene[1]); }
    else additives.push(kus);
  });
  return { allergens: allergens.sort((a, b) => a - b), additives: additives.join(', ') };
}

/** "0,33l" → 330 ml, "150g" → 150 g, "400/150g" → necháme pôvodný text */
function prelozVahu(w) {
  const text = String(w || '').trim();
  if (!text) return { value: null, unit: 'g', text: '' };

  let m = text.match(/^(\d+(?:[.,]\d+)?)\s*g$/i);
  if (m) return { value: Number(m[1].replace(',', '.')), unit: 'g', text };

  m = text.match(/^(\d+(?:[.,]\d+)?)\s*l$/i);
  if (m) return { value: Math.round(Number(m[1].replace(',', '.')) * 1000), unit: 'ml', text };

  m = text.match(/^(\d+(?:[.,]\d+)?)\s*ml$/i);
  if (m) return { value: Number(m[1].replace(',', '.')), unit: 'ml', text };

  m = text.match(/^(\d+)\s*ks$/i);
  if (m) return { value: Number(m[1]), unit: 'ks', text };

  return { value: null, unit: 'g', text };            // napr. "400/150g" – zložená váha
}

function polozka(it, poradie, doplnky) {
  const { allergens, additives } = prelozAlergeny(it.alg);
  const p = {
    id: it.id,
    name: it.name,
    price: Number(it.price),
    weight: prelozVahu(it.w),
    allergens,
    additives,
    desc: it.desc || '',
    no: it.no != null ? it.no : null,
    sort: poradie,
    online: true,
  };
  if (doplnky === 'rozvoz') {
    if (it.addonGroups) p.addonGroups = it.addonGroups;
    else if (it.addons && it.addons.length) p.addonGroups = [{ title: 'Doplnky', options: it.addons }];
  } else if (it.menuAddons && it.menuAddons.length) {
    p.menuAddons = it.menuAddons;
  }
  return p;
}

function kategoria(c, items, note, poradie, extras) {
  const k = { id: c.id, cat: c.cat, kind: c.kind, note: note || '', sort: poradie, items };
  if (extras && extras.length) k.extras = extras;
  return k;
}

// ---- rozvoz: čo sa dá objednať online ----
const rozvoz = [];
M.MENU.filter(c => c.order).forEach((c, ci) => {
  const items = c.items.filter(i => i.order !== false).map((i, ii) => polozka(i, ii, 'rozvoz'));
  if (items.length) rozvoz.push(kategoria(c, items, c.orderNote || c.note, ci));
});

// ---- jedálny lístok: čo je v tlačenom lístku ----
const jedalnylistok = [];
M.MENU.forEach((c, ci) => {
  const items = c.items.filter(i => !i.orderOnly).map((i, ii) => polozka(i, ii, 'listok'));
  if (items.length) jedalnylistok.push(kategoria(c, items, c.note, ci, c.extras));
});

const menu = {
  verzia: 1,
  rozvoz,
  jedalnylistok,
  toppings: M.TOPPINGS,
  glutenFree: M.GLUTEN_FREE,
  deliveryZones: M.DELIVERY_ZONES,
};

const ciel = path.join(ROOT, 'menu.json');
fs.writeFileSync(ciel, JSON.stringify(menu, null, 2) + '\n', 'utf8');

const spocitaj = zoznam => zoznam.reduce((n, c) => n + c.items.length, 0);
console.log('menu.json zapísané');
console.log(`  rozvoz:        ${rozvoz.length} kategórií, ${spocitaj(rozvoz)} položiek`);
console.log(`  jedálny lístok: ${jedalnylistok.length} kategórií, ${spocitaj(jedalnylistok)} položiek`);
