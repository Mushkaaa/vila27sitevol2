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
  // `produkt` = cena sa berie z tejto položky v kategórii Prílohy (price je len záloha, keby ju niekto zmazal)
  { kluc: 'priloha-hranolky', popis: 'Zemiakové hranolky', skupina: 'Príloha', max: 2, name: '200g zemiakové hranolky', price: 2.9, produkt: 'pr1' },
  { kluc: 'priloha-batat', popis: 'Batátové hranolky', skupina: 'Príloha', max: 2, name: '200g batátové hranolky', price: 3.9, produkt: 'pr2' },
  { kluc: 'priloha-baby-zemiaky', popis: 'Baby pečené zemiaky', skupina: 'Príloha', max: 2, name: '200g baby pečené zemiaky', price: 2.9, produkt: 'pr3' },
  { kluc: 'priloha-ryza', popis: 'Ryža', skupina: 'Príloha', max: 2, name: '200g ryža', price: 2.3, produkt: 'pr4' },
  { kluc: 'pizza-doplnky', popis: 'Pizza doplnky (všetky toppingy + bezlepkové cesto)', pizza: true },
];

/** Zo zaškrtnutých kľúčov spraví doplnky produktu. Neznáme kľúče padnú pod stôl.
 *  `cena` vráti aktuálnu cenu doplnku (cenník z adminu, naviazaná príloha). */
function doplnkyZKlucov(kluce, cena = m => m.price) {
  const skupiny = [];
  let pizza = false;
  for (const m of MODIFIKATORY) {
    if (!kluce.includes(m.kluc)) continue;
    if (m.pizza) { pizza = true; continue; }
    let g = skupiny.find(s => s.title === m.skupina);
    if (!g) { g = { title: m.skupina, options: [] }; if (m.max) g.max = m.max; skupiny.push(g); }
    g.options.push({ name: m.name, price: cena(m) });
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

/**
 * Jednorazová oprava: staršie uloženie zmazalo gramáž v tvare „400/150g“.
 * Doplní ju z menu.json a raz uloží, potom sa už nespúšťa.
 */
async function opravVahy(zoznam, data) {
  const kluc = `vila27:oprava:vaha:${zoznam}`;
  if (await store.get(kluc)) return data;
  const povodne = new Map(zoSuboru()[zoznam].flatMap(c => c.items.map(i => [i.id, i.weight])));
  data.forEach(c => c.items.forEach(i => {
    const w = povodne.get(i.id);
    if (w && w.text && w.text.includes('/') && !(i.weight && i.weight.text)) i.weight = { ...w };
  }));
  await store.set(KLUC(zoznam), JSON.stringify(data));
  await store.set(kluc, '1');
  return data;
}

/* ---------- cenník doplnkov (upravuje sa v admine na záložke Doplnky) ---------- */
const KLUC_CENY = 'vila27:ceny-doplnkov';
const BEZLEPKOVE = 'bezlepkove';
const toppingId = i => `topping-${i}`;

/** Uložené ceny { id: cena }; čo tam nie je, platí cena z kódu / menu.json. */
async function nacitajCeny() {
  try {
    const raw = await store.get(KLUC_CENY);
    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return d && typeof d === 'object' ? d : {};
  } catch (e) {
    console.error('Cenník doplnkov sa nepodarilo načítať:', e.message);
    return {};
  }
}
const ulozCeny = ceny => store.set(KLUC_CENY, JSON.stringify(ceny));

/** Cena doplnku: príloha podľa svojho produktu, inak cenník, inak cena v kóde. */
const cenaModifikatora = (m, ceny, produkty) =>
  produkty.has(m.produkt) ? produkty.get(m.produkt) : (ceny[m.kluc] ?? m.price);

/**
 * Doplnky sa vždy poskladajú z MODIFIKATORY – zmena názvu alebo ceny sa tak
 * prejaví aj na uložených produktoch. Staršie položky bez `mods` sa spoznajú
 * podľa názvu (aktuálneho alebo pôvodného v `popis`). Rovnaké ceny dostanú aj
 * riadky doplnkov na jedálnom lístku (menuAddons, extras kategórie).
 */
function aktualneDoplnky(data, ceny) {
  const produkty = new Map(data.flatMap(c => c.items).map(i => [i.id, i.price]));
  const cena = m => cenaModifikatora(m, ceny, produkty);
  const gf = zoSuboru().glutenFree;
  const riadok = a => {
    const m = MODIFIKATORY.find(x => !x.pizza && x.name === a.name);
    if (m) a.price = cena(m);
    else if (a.name === gf.name) a.price = ceny[BEZLEPKOVE] ?? gf.price;
  };
  data.forEach(c => {
    (c.extras || []).forEach(riadok);
    c.items.forEach(i => {
      (i.menuAddons || []).forEach(riadok);
      if (!Array.isArray(i.mods)) {
        const mena = (i.addonGroups || []).flatMap(g => (g.options || []).map(o => o.name));
        if (!mena.length) return;
        i.mods = MODIFIKATORY.filter(m => !m.pizza && (mena.includes(m.name) || mena.includes(m.popis))).map(m => m.kluc);
        if (i.pizzaToppings) i.mods.push('pizza-doplnky');
      }
      Object.assign(i, doplnkyZKlucov(i.mods, cena));
    });
  });
  return data;
}

/** Kategórie jedného zoznamu. Redis → menu.json. */
async function nacitaj(zoznam) {
  if (!jeZoznam(zoznam)) throw new Error('Neznámy zoznam: ' + zoznam);
  const ceny = await nacitajCeny();
  try {
    const raw = await store.get(KLUC(zoznam));
    if (raw) {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(data) && data.length) return aktualneDoplnky(await opravVahy(zoznam, data), ceny);
    }
  } catch (e) {
    console.error('Menu z Redisu sa nepodarilo načítať, beriem menu.json:', e.message);
  }
  return aktualneDoplnky(kopia(zoSuboru()[zoznam]), ceny);
}

/**
 * Všetky doplnky s cenou pre admin. Prílohy sú `viazane` – ich cena sa mení
 * cenou produktu v Rozvoze, tu sa len zobrazia.
 */
async function cennikDoplnkov() {
  const ceny = await nacitajCeny();
  const rozvoz = (await nacitaj('rozvoz')).flatMap(c => c.items);
  const produkty = new Map(rozvoz.map(i => [i.id, i.price]));
  const s = zoSuboru();
  return [
    ...MODIFIKATORY.filter(m => !m.pizza).map(m => {
      const p = rozvoz.find(i => i.id === m.produkt);
      return { id: m.kluc, nazov: m.name, skupina: m.skupina, price: cenaModifikatora(m, ceny, produkty), viazane: p ? p.name : null };
    }),
    ...s.toppings.map((g, i) => ({ id: toppingId(i), nazov: `${g.g} ${g.items.join(', ')}`, skupina: 'Pizza doplnky', price: ceny[toppingId(i)] ?? g.price, viazane: null })),
    { id: BEZLEPKOVE, nazov: s.glutenFree.name, skupina: 'Pizza doplnky', price: ceny[BEZLEPKOVE] ?? s.glutenFree.price, viazane: null },
  ];
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
  const ceny = await nacitajCeny();
  return {
    toppings: s.toppings.map((g, i) => ({ ...g, price: ceny[toppingId(i)] ?? g.price })),
    glutenFree: { ...s.glutenFree, price: ceny[BEZLEPKOVE] ?? s.glutenFree.price },
    deliveryZones: await nacitajZony(),
  };
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

module.exports = { cennikDoplnkov, nacitajCeny, ulozCeny, ZOZNAMY, ALERGENY, MODIFIKATORY, doplnkyZKlucov, maPizzaDoplnky, jeZoznam, nacitaj, uloz, nacitajZony, ulozZony, zalohy, obnov, ibaOnline, podlaId, spolocne };
