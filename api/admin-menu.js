'use strict';
/**
 * POST /api/admin-menu – správa produktov pre majiteľa.
 *
 * Každé volanie najprv overí prihlásenie a až potom čokoľvek robí.
 * Akcie: nacitaj, ulozVsetko, zalohy, obnov
 *
 * Kontroly sú tu, nie v prehliadači – z prehliadača môže prísť čokoľvek.
 */
const auth = require('./_auth');
const menu = require('./_menu');
const store = require('./_store');

const text = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const round = n => Math.round(n * 100) / 100;
const JEDNOTKY = ['g', 'ml', 'ks'];

/** Z ľubovoľného vstupu spraví bezpečné id: "Nové jedlo" → "nove-jedlo" */
function naId(zaklad) {
  const bez = String(zaklad).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return bez.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function jedineceId(zaklad, obsadene) {
  const koren = naId(zaklad) || 'polozka';
  let id = koren, i = 2;
  while (obsadene.has(id)) id = `${koren}-${i++}`;
  return id;
}

/** Skontroluje produkt z formulára. Vracia { chyba } alebo { produkt }. */
function skontrolujProdukt(vstup, obsadeneId, povodne) {
  const name = text(vstup.name, 120);
  if (!name) return { chyba: 'Názov nesmie byť prázdny.' };

  const cena = Number(String(vstup.price).replace(',', '.'));
  if (!Number.isFinite(cena)) return { chyba: 'Cena musí byť číslo.' };
  if (cena < 0) return { chyba: 'Cena nesmie byť záporná.' };
  if (cena > 1000) return { chyba: 'Cena je nezmyselne vysoká.' };

  const vaha = vstup.weight || {};
  const jednotka = JEDNOTKY.includes(vaha.unit) ? vaha.unit : 'g';
  let hodnota = null;
  // staršie „400/150g“ majú value prázdne a údaj len v texte – bez tohto by ho uloženie zmazalo
  const zText = /^\s*(\d+(?:,\d+)?\/\d+(?:,\d+)?)\s*g\s*$/.exec(vaha.text || '');
  if ((vaha.value === '' || vaha.value == null) && zText) vaha.value = zText[1];
  if (vaha.value !== '' && vaha.value != null) {
    const s = String(vaha.value).trim();
    // „400/150“ = jedlo/príloha – ostáva ako text
    if (/^\d+([.,]\d+)?\/\d+([.,]\d+)?$/.test(s)) hodnota = s.replace(/\./g, ',');
    else {
      hodnota = Number(s.replace(',', '.'));
      if (!Number.isFinite(hodnota) || hodnota <= 0) return { chyba: 'Gramáž musí byť kladné číslo alebo v tvare 400/150.' };
    }
  }

  const alergeny = Array.isArray(vstup.allergens) ? vstup.allergens : [];
  const cisla = [];
  for (const a of alergeny) {
    const n = Number(a);
    if (!Number.isInteger(n) || !menu.ALERGENY[n]) return { chyba: `Neznámy alergén: ${a}` };
    if (!cisla.includes(n)) cisla.push(n);
  }

  // id sa nikdy neopakuje: buď ostáva pôvodné, alebo dostane číslo navyše
  const id = povodne ? povodne.id : jedineceId(name, obsadeneId);
  const poradie = Number(vstup.sort);

  const produkt = {
    ...(povodne || {}),
    id,
    name,
    price: round(cena),
    weight: {
      value: hodnota,
      unit: jednotka,
      text: hodnota != null ? `${String(hodnota).replace('.', ',')} ${jednotka}` : '',
    },
    allergens: cisla.sort((a, b) => a - b),
    additives: text(vstup.additives, 80),
    desc: text(vstup.desc, 400),
    no: povodne ? povodne.no : null,
    sort: Number.isFinite(poradie) ? poradie : 0,
    online: vstup.online !== false,
  };

  // doplnky: z prehliadača berieme len zaškrtnuté kľúče, skupiny s cenami staviame tu
  if (Array.isArray(vstup.mods)) {
    produkt.mods = vstup.mods.filter(k => menu.MODIFIKATORY.some(m => m.kluc === k));
    Object.assign(produkt, menu.doplnkyZKlucov(produkt.mods));
  }

  return { produkt };
}

/** Skontroluje rozvozové pásma z formulára. Vracia { chyba } alebo { zony }. */
function skontrolujZony(vstup) {
  if (!Array.isArray(vstup) || !vstup.length) return { chyba: 'Musí ostať aspoň jedno pásmo.' };
  if (vstup.length > 30) return { chyba: 'Pásiem je príliš veľa.' };

  const zony = [];
  const obsadene = new Map();
  for (const z of vstup) {
    const cena = Number(String(z.fee).replace(',', '.'));
    if (!Number.isFinite(cena) || cena < 0) return { chyba: 'Cena dopravy musí byť číslo od nuly.' };
    if (cena > 100) return { chyba: 'Cena dopravy je nezmyselne vysoká.' };

    const limit = Number(String(z.min).replace(',', '.'));
    if (!Number.isFinite(limit) || limit < 0) return { chyba: 'Minimálna objednávka musí byť číslo od nuly.' };
    if (limit > 1000) return { chyba: 'Minimálna objednávka je nezmyselne vysoká.' };

    const obce = [];
    for (const o of (Array.isArray(z.villages) ? z.villages : [])) {
      const obec = text(o, 60);
      if (!obec) continue;
      // jedna obec v dvoch pásmach = zákazník by platil podľa toho, ktoré je v zozname skôr
      if (obsadene.has(obec)) return { chyba: `Obec ${obec} je v dvoch pásmach.` };
      obsadene.set(obec, true);
      obce.push(obec);
    }
    if (!obce.length) return { chyba: `Pásmo za ${round(cena)} € nemá ani jednu obec.` };

    zony.push({ fee: round(cena), min: round(limit), villages: obce });
  }
  return { zony };
}

const NAZOV = { rozvoz: 'Rozvoz', jedalnylistok: 'Jedálny lístok' };

/**
 * Skontroluje celý zoznam naraz – majiteľ si nazbiera zmeny v prehliadači
 * a pošle ich jedným tlačidlom. Z prehliadača sa preberá len to, čo sa dá
 * upraviť vo formulári; doplnky k jedlám, poznámky kategórií a poradové čísla
 * sa berú z uloženej verzie, aby sa nedali podstrčiť.
 */
function skontrolujZoznam(vstup, stare) {
  if (!Array.isArray(vstup) || !vstup.length) return { chyba: 'Zoznam je prázdny.' };

  const stareProdukty = new Map(stare.flatMap(c => c.items.map(i => [i.id, i])));
  const stareKategorie = new Map(stare.map(c => [c.id, c]));
  const vsetkyId = new Set(stareProdukty.keys());
  const pouzite = new Set();
  const kategorie = [];

  for (const c of vstup) {
    const cat = text(c.cat, 60);
    if (!cat) return { chyba: 'Kategória bez názvu.' };

    const catId = text(c.id, 60) || jedineceId(cat, new Set(kategorie.map(k => k.id)));
    if (kategorie.some(k => k.id === catId)) return { chyba: `Kategória ${cat} je v zozname dvakrát.` };
    const staraKat = stareKategorie.get(catId);

    const items = [];
    for (const p of (Array.isArray(c.items) ? c.items : [])) {
      const id = text(p.id, 60);
      const povodne = id && stareProdukty.has(id) ? stareProdukty.get(id) : null;

      const { chyba, produkt } = skontrolujProdukt(p, vsetkyId, povodne);
      if (chyba) return { chyba: `${cat} – ${chyba}` };

      // rovnaký názov je v poriadku (to isté pivo v 0,3 l aj 0,5 l), rovnaké id nie
      if (pouzite.has(produkt.id)) return { chyba: `Produkt ${produkt.name} je v zozname dvakrát.` };
      pouzite.add(produkt.id);
      vsetkyId.add(produkt.id);
      items.push(produkt);
    }

    const k = {
      id: catId,
      cat,
      kind: c.kind === 'drink' ? 'drink' : 'food',
      note: staraKat ? staraKat.note || '' : '',
      sort: Number.isFinite(Number(c.sort)) ? Number(c.sort) : kategorie.length,
      items,
    };
    if (staraKat && staraKat.extras) k.extras = staraKat.extras;
    kategorie.push(k);
  }

  return { kategorie };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    auth.bezCache(res);
    return res.status(405).json({ ok: false, error: 'Použi POST' });
  }

  const sedenie = await auth.straz(req, res);       // 401 skôr, než sa čokoľvek stane
  if (!sedenie) return;

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const akcia = text(body.akcia, 20);
    const zoznam = text(body.zoznam, 20);

    if (akcia === 'zalohy') {
      return res.status(200).json({ ok: true, zalohy: await menu.zalohy() });
    }

    // uloženie všetkých nazbieraných zmien naraz
    if (akcia === 'ulozVsetko') {
      const zmeny = body.zmeny && typeof body.zmeny === 'object' ? body.zmeny : {};
      const ciele = Object.keys(zmeny).filter(z => menu.jeZoznam(z));
      if (!ciele.length && !zmeny.doprava) return res.status(400).json({ ok: false, error: 'Nie je čo uložiť.' });

      let zony = null;
      if (zmeny.doprava) {
        const vysledok = skontrolujZony(zmeny.doprava);
        if (vysledok.chyba) return res.status(400).json({ ok: false, error: `Doprava: ${vysledok.chyba}` });
        zony = vysledok.zony;
      }

      // najprv sa skontroluje všetko, až potom sa zapisuje – nech neostane uložená polovica
      const pripravene = [];
      for (const z of ciele) {
        const { chyba, kategorie } = skontrolujZoznam(zmeny[z], await menu.nacitaj(z));
        if (chyba) return res.status(400).json({ ok: false, error: `${NAZOV[z]}: ${chyba}` });
        pripravene.push({ zoznam: z, kategorie });
      }

      const vysledok = {};
      for (const p of pripravene) {
        await menu.uloz(p.zoznam, p.kategorie, 'hromadná úprava');
        vysledok[p.zoznam] = p.kategorie;
      }
      if (zony) { await menu.ulozZony(zony); vysledok.doprava = zony; }
      return res.status(200).json({ ok: true, zoznamy: vysledok });
    }

    if (akcia === 'obnov') {
      const obnoveny = await menu.obnov(text(body.id, 60));
      return res.status(200).json({ ok: true, zoznam: obnoveny, kategorie: await menu.nacitaj(obnoveny) });
    }

    if (!menu.jeZoznam(zoznam)) return res.status(400).json({ ok: false, error: 'Neznámy zoznam.' });
    const kategorie = await menu.nacitaj(zoznam);

    if (akcia === 'nacitaj') {
      // bez databázy si každé volanie funkcie drží vlastnú pamäť – úpravy by sa
      // navonok nikdy neprejavili, a to musí majiteľ vedieť
      return res.status(200).json({ ok: true, zoznam, kategorie, alergeny: menu.ALERGENY, modifikatory: menu.MODIFIKATORY, doprava: await menu.nacitajZony(), trvale: store.hasRedis });
    }

    return res.status(400).json({ ok: false, error: 'Neznáma akcia' });
  } catch (e) {
    if (e.stav) return res.status(e.stav).json({ ok: false, error: e.message });
    console.error('Chyba správy menu:', e);
    return res.status(500).json({ ok: false, error: 'Zmenu sa nepodarilo uložiť.' });
  }
};

module.exports.skontrolujZony = skontrolujZony;   // pre api/_menu.test.js
