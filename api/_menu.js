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
const MAX_ZALOH = 20;

const ALERGENY = {
  1: 'obilniny obsahujúce lepok', 2: 'kôrovce', 3: 'vajcia', 4: 'ryby',
  5: 'arašidy', 6: 'sójové zrná', 7: 'mlieko', 8: 'orechy',
  9: 'zeler', 10: 'horčica', 11: 'sezamové semená', 12: 'oxid siričitý a siričitany',
  13: 'vlčí bôb', 14: 'mäkkýše',
};

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

/** Spoločné časti (pizza doplnky, bezlepkové cesto, rozvozové zóny). */
function spolocne() {
  const s = zoSuboru();
  return { toppings: s.toppings, glutenFree: s.glutenFree, deliveryZones: s.deliveryZones };
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

module.exports = { ZOZNAMY, ALERGENY, jeZoznam, nacitaj, uloz, zalohy, obnov, ibaOnline, podlaId, spolocne };
