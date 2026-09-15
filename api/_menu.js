'use strict';
/**
 * Jedálny lístok a rozvozové menu.
 *
 * Zdroj pravdy je Redis. Keď v ňom nič nie je (prvé spustenie) alebo je
 * nedostupný, použije sa menu.json z repozitára – stránka teda funguje aj
 * vtedy, keď Redis vypadne.
 *
 * Pri každom uložení sa predchádzajúca verzia odloží pod časovú značku,
 * takže sa dá vrátiť späť.
 */
const fs = require('fs');
const path = require('path');
const store = require('./_store');

const ZOZNAMY = ['rozvoz', 'jedalnylistok'];
const KLUC = z => `vila27:menu:${z}`;
const KLUC_ZALOHY = 'vila27:menu:zalohy';
const KLUC_ZALOHA = id => `vila27:menu:zaloha:${id}`;
const KLUC_DOPRAVA = 'vila27:doprava';
const MAX_ZALOH = 20;

const ALERGENY = {
  1: 'obilniny obsahujúce lepok', 2: 'kôrovce', 3: 'vajcia', 4: 'ryby',
  5: 'arašidy', 6: 'sójové zrná', 7: 'mlieko', 8: 'orechy',
  9: 'zeler', 10: 'horčica', 11: 'sezamové semená', 12: 'oxid siričitý a siričitany',
  13: 'vlčí bôb', 14: 'mäkkýše',
};

/**
 * Doplnky, ktoré si majiteľ môže zaškrtnúť pri produkte.
 * Ceny a názvy sú len tu – z prehliadača prichádzajú iba kľúče, takže
 * nikto nepodstrčí vlastný doplnok ani vlastnú cenu.
 */
const MODIFIKATORY = [
  { kluc: 'halloumi-miesto-masa', popis: 'Halloumi namiesto hovädzieho mäsa', skupina: 'Mäso', max: 1, name: 'Syr Halloumi namiesto hovädzieho mäsa', price: 0 },
  { kluc: 'king-size', popis: 'King size', skupina: 'Doplnky', name: 'King size', price: 3 },
  { kluc: 'kuracie-prsia', popis: '100g kuracie prsia', skupina: 'Doplnky', name: '100g kuracie prsia', price: 3 },
  { kluc: 'syr-halloumi', popis: '100g syr Halloumi', skupina: 'Doplnky', name: '100g syr Halloumi', price: 3 },
  { kluc: 'losos', popis: '100g losos', skupina: 'Doplnky', name: '100g losos', price: 5 },
  { kluc: 'omacka-syrova', popis: '0,1l syrová omáčka', skupina: 'Omáčka', max: 1, name: '0,1l syrová omáčka', price: 2 },
  { kluc: 'omacka-demi-glace', popis: '0,1l demi-glace omáčka', skupina: 'Omáčka', max: 1, name: '0,1l demi-glace omáčka', price: 2 },
  { kluc: 'priloha-hranolky', popis: 'Zemiakové hranolky', skupina: 'Príloha', max: 2, name: 'Zemiakové hranolky', price: 2.9 },
  { kluc: 'priloha-batat', popis: 'Batátové hranolky', skupina: 'Príloha', max: 2, name: 'Batátové hranolky', price: 3.9 },
  { kluc: 'priloha-baby-zemiaky', popis: 'Baby pečené zemiaky', skupina: 'Príloha', max: 2, name: 'Baby pečené zemiaky', price: 2.9 },
  { kluc: 'priloha-ryza', popis: 'Ryža', skupina: 'Príloha', max: 2, name: 'Ryža', price: 2.3 },
  { kluc: 'pizza-doplnky', popis: 'Pizza doplnky (všetky toppingy + bezlepkové cesto)', pizza: true },
];

/** Zo zaškrtnutých kľúčov spraví doplnky produktu. Neznáme kľúče padnú pod stôl. */
function doplnkyZKlucov(kluce) {
  const skupiny = [];
  let pizza = false;
  for (const m of MODIFIKATORY) {
    if (!kluce.includes(m.kluc)) continue;
    if (m.pizza) { pizza = true; continue; }
    let g = skupiny.find(s => s.title === m.skupina);
    if (!g) { g = { title: m.skupina, options: [] }; if (m.max) g.max = m.max; skupiny.push(g); }
    g.options.push({ name: m.name, price: m.price });
  }
  return { addonGroups: skupiny, pizzaToppings: pizza };
}

/** Má produkt pizza doplnky? Staršie položky príznak nemajú – tam rozhoduje kategória. */
const maPizzaDoplnky = p => (p.pizzaToppings != null ? !!p.pizzaToppings : p.catId === 'pizza');

let zaloha = null;                                    // menu.json načítané raz za beh funkcie
function zoSuboru() {
  if (!zaloha) zaloha = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'menu.json'), 'utf8'));
  return zaloha;
}

/** Kópia, nie odkaz – volajúci so zoznamom ďalej pracuje a mení ho. Keby dostal
 *  rovnaký objekt, záloha pri prvom uložení by už obsahovala vykonanú zmenu. */
const kopia = x => JSON.parse(JSON.stringify(x));

const jeZoznam = z => ZOZNAMY.includes(z);

/** Kategórie jedného zoznamu. Redis → menu.json. */
async function nacitaj(zoznam) {
  if (!jeZoznam(zoznam)) throw new Error('Neznámy zoznam: ' + zoznam);
  try {
    const raw = await store.get(KLUC(zoznam));
    if (raw) {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(data) && data.length) return data;
    }
  } catch (e) {
    console.error('Menu z Redisu sa nepodarilo načítať, beriem menu.json:', e.message);
  }
  return kopia(zoSuboru()[zoznam]);
}

/** Rozvozové pásma. Redis → menu.json, rovnako ako ponuka. */
async function nacitajZony() {
  try {
    const raw = await store.get(KLUC_DOPRAVA);
    if (raw) {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(data) && data.length) return data;
    }
  } catch (e) {
    console.error('Doprava z Redisu sa nepodarila načítať, beriem menu.json:', e.message);
  }
  return kopia(zoSuboru().deliveryZones);
}

// ponytail: pásma sa nezálohujú – je ich pár riadkov a prepíšu sa celé naraz
const ulozZony = zony => store.set(KLUC_DOPRAVA, JSON.stringify(zony));

/** Spoločné časti (pizza doplnky, bezlepkové cesto, rozvozové pásma). */
async function spolocne() {
  const s = zoSuboru();
  return { toppings: s.toppings, glutenFree: s.glutenFree, deliveryZones: await nacitajZony() };
}

/** Uloží zoznam a starú verziu odloží ako zálohu. */
async function uloz(zoznam, kategorie, popis) {
  if (!jeZoznam(zoznam)) throw new Error('Neznámy zoznam: ' + zoznam);

  const predtym = await nacitaj(zoznam);
  const id = `${zoznam}-${Date.now()}`;
  await store.set(KLUC_ZALOHA(id), JSON.stringify(predtym));
  await store.pushCapped(KLUC_ZALOHY, JSON.stringify({
    id, zoznam, kedy: new Date().toISOString(), popis: popis || 'úprava',
    poloziek: predtym.reduce((n, c) => n + c.items.length, 0),
  }), MAX_ZALOH);

  await store.set(KLUC(zoznam), JSON.stringify(kategorie));
}

async function zalohy() {
  const rows = await store.range(KLUC_ZALOHY, MAX_ZALOH);
  return rows.map(r => { try { return typeof r === 'string' ? JSON.parse(r) : r; } catch { return null; } })
    .filter(Boolean);
}

/** Vráti zálohu späť do ostrej verzie (a tú pred ňou tiež odloží). */
async function obnov(id) {
  const raw = await store.get(KLUC_ZALOHA(id));
  if (!raw) { const e = new Error('Záloha sa nenašla.'); e.stav = 404; throw e; }
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const zoznam = String(id).split('-')[0];
  if (!jeZoznam(zoznam)) throw new Error('Neznáma záloha');
  await uloz(zoznam, data, 'pred vrátením zálohy');
  return zoznam;
}

/** Len to, čo má zákazník vidieť – vypnuté položky a prázdne kategórie preč. */
function ibaOnline(kategorie) {
  return kategorie
    .map(c => ({ ...c, items: c.items.filter(i => i.online !== false) }))
    .filter(c => c.items.length);
}

/** Plochá mapa id → položka, na prepočet objednávky na serveri. */
function podlaId(kategorie) {
  const mapa = new Map();
  kategorie.forEach(c => c.items.forEach(i => mapa.set(i.id, { ...i, cat: c.cat, catId: c.id })));
  return mapa;
}

module.exports = { ZOZNAMY, ALERGENY, MODIFIKATORY, doplnkyZKlucov, maPizzaDoplnky, jeZoznam, nacitaj, uloz, nacitajZony, ulozZony, zalohy, obnov, ibaOnline, podlaId, spolocne };
