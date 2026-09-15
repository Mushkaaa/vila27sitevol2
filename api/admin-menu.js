'use strict';
/**
 * POST /api/admin-menu – správa produktov pre majiteľa.
 *
 * Každé volanie najprv overí prihlásenie a až potom čokoľvek robí.
 * Akcie: nacitaj, uloz, zmaz, prepni, kategoria, zmazKategoriu, zalohy, obnov
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
  if (vaha.value !== '' && vaha.value != null) {
    hodnota = Number(String(vaha.value).replace(',', '.'));
    if (!Number.isFinite(hodnota) || hodnota <= 0) return { chyba: 'Gramáž musí byť kladné číslo.' };
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

  return {
    produkt: {
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
    },
  };
}

const najdiKategoriu = (kategorie, id) => kategorie.find(c => c.id === id);
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
      if (!ciele.length) return res.status(400).json({ ok: false, error: 'Nie je čo uložiť.' });

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
      return res.status(200).json({ ok: true, zoznam, kategorie, alergeny: menu.ALERGENY, trvale: store.hasRedis });
    }

    // ---- nová kategória ----
    if (akcia === 'kategoria') {
      const nazov = text(body.nazov, 60);
      if (!nazov) return res.status(400).json({ ok: false, error: 'Názov kategórie nesmie byť prázdny.' });
      const obsadene = new Set(kategorie.map(c => c.id));
      const id = jedineceId(nazov, obsadene);
      const kind = body.kind === 'drink' ? 'drink' : 'food';
      kategorie.push({ id, cat: nazov, kind, note: '', sort: kategorie.length, items: [] });
      await menu.uloz(zoznam, kategorie, `nová kategória ${nazov}`);
      return res.status(200).json({ ok: true, kategorie });
    }

    if (akcia === 'zmazKategoriu') {
      const id = text(body.id, 60);
      const k = najdiKategoriu(kategorie, id);
      if (!k) return res.status(404).json({ ok: false, error: 'Kategória sa nenašla.' });
      if (k.items.length) return res.status(400).json({ ok: false, error: 'Najprv presuňte alebo zmažte produkty v kategórii.' });
      await menu.uloz(zoznam, kategorie.filter(c => c.id !== id), `zmazaná kategória ${k.cat}`);
      return res.status(200).json({ ok: true, kategorie: await menu.nacitaj(zoznam) });
    }

    // ---- produkt ----
    if (akcia === 'uloz') {
      const catId = text(body.kategoria, 60);
      const ciel = najdiKategoriu(kategorie, catId);
      if (!ciel) return res.status(400).json({ ok: false, error: 'Vyberte kategóriu.' });

      const vstup = body.produkt || {};
      const povodneId = text(vstup.id, 60);
      const obsadene = new Set(kategorie.flatMap(c => c.items.map(i => i.id)));

      let povodne = null, staraKategoria = null;
      if (povodneId) {
        staraKategoria = kategorie.find(c => c.items.some(i => i.id === povodneId));
        if (!staraKategoria) return res.status(404).json({ ok: false, error: 'Produkt sa nenašiel.' });
        povodne = staraKategoria.items.find(i => i.id === povodneId);
        obsadene.delete(povodneId);
      }

      const { chyba, produkt } = skontrolujProdukt(vstup, obsadene, povodne);
      if (chyba) return res.status(400).json({ ok: false, error: chyba });

      if (staraKategoria) staraKategoria.items = staraKategoria.items.filter(i => i.id !== produkt.id);
      ciel.items.push(produkt);
      ciel.items.sort((a, b) => (a.sort || 0) - (b.sort || 0));

      await menu.uloz(zoznam, kategorie, `${povodne ? 'úprava' : 'nový produkt'} ${produkt.name}`);
      return res.status(200).json({ ok: true, kategorie, id: produkt.id });
    }

    if (akcia === 'zmaz') {
      const id = text(body.id, 60);
      const k = kategorie.find(c => c.items.some(i => i.id === id));
      if (!k) return res.status(404).json({ ok: false, error: 'Produkt sa nenašiel.' });
      const nazov = k.items.find(i => i.id === id).name;
      k.items = k.items.filter(i => i.id !== id);
      await menu.uloz(zoznam, kategorie, `zmazaný ${nazov}`);
      return res.status(200).json({ ok: true, kategorie });
    }

    if (akcia === 'prepni') {
      const id = text(body.id, 60);
      const k = kategorie.find(c => c.items.some(i => i.id === id));
      if (!k) return res.status(404).json({ ok: false, error: 'Produkt sa nenašiel.' });
      const p = k.items.find(i => i.id === id);
      p.online = body.online === true;
      await menu.uloz(zoznam, kategorie, `${p.online ? 'zapnutý' : 'vypnutý'} ${p.name}`);
      return res.status(200).json({ ok: true, online: p.online });
    }

    return res.status(400).json({ ok: false, error: 'Neznáma akcia' });
  } catch (e) {
    if (e.stav) return res.status(e.stav).json({ ok: false, error: e.message });
    console.error('Chyba správy menu:', e);
    return res.status(500).json({ ok: false, error: 'Zmenu sa nepodarilo uložiť.' });
  }
};
