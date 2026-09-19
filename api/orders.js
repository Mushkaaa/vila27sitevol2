'use strict';
/**
 * POST /api/orders – prijme objednávku zo stránky, uloží ju do fronty.
 * Odpoveď: { ok: true, number: 12, total: 23.4, items: [...] }
 *
 * Z prehliadača berieme len to, ČO si zákazník vybral (id produktu, počet,
 * doplnky). Všetky ceny sa rátajú tu z uloženého menu – čokoľvek cenové, čo
 * príde z prehliadača, sa ignoruje (C1).
 *
 * Endpoint je verejný, preto tu sedí celá obrana: rovnaký pôvod (C9),
 * veľkosť tela (C3), prísna schéma (C2), čistenie textu pre tlačiareň (C5),
 * otváracie hodiny (C4), anti-spam (C7), idempotencia (C8) a limity (D1).
 */
const store = require('./_store');
const menu = require('./_menu');
const hodiny = require('./_hours');
const { ocisti, jeTelefon, telefon } = require('./_sanitize');
const { klientskaIp } = require('./_ip');

const GF_POPIS = 'bezlepkové cesto';          // ako sa bezlepkové cesto píše na bloček

const MAX_TELO = 10 * 1024;                   // C3
const MAX_RIADKOV = 30;                       // C2
const MAX_KS = 20;                            // C2
const MAX_DOPLNKOV = 15;
const MIN_TRVANIE_MS = 3000;                  // C7 – človek nevyplní formulár za sekundu

const LIMIT_IP = Number(process.env.ORDER_IP_LIMIT) || 5;
const OKNO_IP = Number(process.env.ORDER_IP_WINDOW_S) || 10 * 60;
const LIMIT_GLOBAL = Number(process.env.ORDER_GLOBAL_LIMIT) || 60;
const OKNO_GLOBAL = 60 * 60;

const TEL_PODPORA = '+421 914 271 271';

const round = n => Math.round(n * 100) / 100;
const zonaPre = (zony, obec) => zony.find(z => z.villages.includes(obec)) || null;

// C2 – nič iné ako tieto kľúče sa neprijme.
// Cenové polia sú zámerne v zozname: staršie verzie stránky ich posielali.
// Neodmietame ich, ale ani im neveríme – cenu vždy ráta server (C1).
const IGNOROVANE_CENY = ['price', 'unitPrice', 'lineTotal', 'subtotal', 'total', 'fee'];
const POLIA_TELO = new Set(['mode', 'customer', 'items', 'orderKey', 'trvanieMs', 'web', 'turnstileToken', 'pozadovanyCas', ...IGNOROVANE_CENY]);
const POLIA_ZAKAZNIK = new Set(['name', 'phone', 'village', 'address', 'time', 'pay', 'note']);
const POLIA_POLOZKA = new Set(['id', 'qty', 'extras', 'gf', 'name', ...IGNOROVANE_CENY]);

const chyba = (res, kod, sprava) => res.status(kod).json({ ok: false, error: sprava });

/** Neznáme kľúče = pokus podstrčiť niečo navyše. Radšej odmietnuť ako ticho zahodiť. */
function neznameKluce(obj, povolene) {
  return Object.keys(obj || {}).filter(k => !povolene.has(k));
}

/** Presné celé číslo v rozsahu – „5“, 1.5 ani 0 neprejdú. */
function celeCislo(v, min, max) {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) return null;
  return v;
}

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

/**
 * Prepočet objednávky na serveri. Vytiahnuté zvlášť, aby sa dalo testovať
 * bez HTTP (test: „price calc ignores client prices“).
 * @returns {{chyba?:string, items?:Array, subtotal?:number}}
 */
function prepocitaj(poslane, ponuka, spolocne) {
  if (!Array.isArray(poslane) || !poslane.length) return { chyba: 'Prázdny košík' };
  if (poslane.length > MAX_RIADKOV) return { chyba: `Objednávka môže mať najviac ${MAX_RIADKOV} rôznych položiek.` };

  const items = [];
  for (const poslana of poslane) {
    if (!poslana || typeof poslana !== 'object' || Array.isArray(poslana)) return { chyba: 'Košík má neplatný tvar.' };
    const navyse = neznameKluce(poslana, POLIA_POLOZKA);
    if (navyse.length) return { chyba: 'Košík obsahuje neznáme údaje.' };

    const produkt = ponuka.get(ocisti(poslana.id, 60));
    if (!produkt) return { chyba: 'Niektoré jedlo z košíka už nie je v ponuke. Obnovte stránku.' };
    if (produkt.online === false) return { chyba: `${produkt.name} práve nie je v ponuke. Obnovte stránku.` };

    const qty = celeCislo(poslana.qty, 1, MAX_KS);
    if (qty === null) return { chyba: `Počet kusov musí byť celé číslo od 1 do ${MAX_KS}.` };

    if (poslana.extras !== undefined && !Array.isArray(poslana.extras)) return { chyba: 'Doplnky majú neplatný tvar.' };
    const nazvy = (poslana.extras || []).slice(0, MAX_DOPLNKOV).map(x => ocisti(x, 60));
    if ((poslana.extras || []).length > MAX_DOPLNKOV) return { chyba: 'Priveľa doplnkov k jednej položke.' };

    if (poslana.gf !== undefined && typeof poslana.gf !== 'boolean') return { chyba: 'Doplnky majú neplatný tvar.' };

    const extras = [];
    let priplatok = 0;
    for (const nazov of nazvy) {
      const cena = cenaDoplnku(produkt, nazov, spolocne);
      if (cena == null) return { chyba: `Doplnok „${nazov}“ k jedlu ${produkt.name} neponúkame.` };
      priplatok += cena;
      extras.push(nazov);
    }

    const bezlepkove = poslana.gf === true && produkt.catId === 'pizza';
    if (bezlepkove) { priplatok += Number(spolocne.glutenFree.price) || 0; extras.push(GF_POPIS); }

    const unitPrice = round(Number(produkt.price) + priplatok);
    items.push({
      id: produkt.id,
      name: ocisti((produkt.no ? produkt.no + '. ' : '') + produkt.name, 120),
      qty,
      unitPrice,
      extras: extras.map(x => ocisti(x, 60)),
      lineTotal: round(unitPrice * qty),
    });
  }

  return { items, subtotal: round(items.reduce((s, i) => s + i.lineTotal, 0)) };
}

/** Voliteľné overenie Cloudflare Turnstile (C7). Bez kľúčov sa preskočí. */
async function turnstileOk(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;                                  // hook je pripravený, ale vypnutý
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: String(token || ''), remoteip: ip }),
      signal: AbortSignal.timeout(5000),                     // D4
    });
    const d = await r.json();
    return d.success === true;
  } catch {
    return false;
  }
}

/** Telefón do logu len čiastočne (E2). */
const maskuj = t => { const s = String(t || ''); return s.length < 5 ? '***' : s.slice(0, 4) + '***' + s.slice(-2); };

async function precitajTelo(req) {
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  const kusy = [];
  let dlzka = 0;
  for await (const c of req) {
    dlzka += c.length;
    if (dlzka > MAX_TELO) { const e = new Error('prilis velke'); e.velke = true; throw e; }
    kusy.push(c);
  }
  return Buffer.concat(kusy).toString('utf8');
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  // B4 – verejne je dovolený iba POST, žiadne verejné vypisovanie objednávok
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return chyba(res, 405, 'Použite POST.');
  }

  // C9 – požiadavka musí prísť z našej stránky
  const origin = req.headers.origin;
  if (origin) {
    let ok = false;
    try {
      const o = new URL(origin);
      ok = o.host === req.headers.host;
    } catch { ok = false; }
    if (!ok) return chyba(res, 403, 'Objednávku prijímame iba z našej stránky.');
  }

  // C3 – typ obsahu
  const ct = String(req.headers['content-type'] || '');
  if (!/^application\/json\b/i.test(ct)) {
    return chyba(res, 415, 'Očakávame application/json.');
  }

  // C3 – veľkosť tela
  const ohlasena = Number(req.headers['content-length'] || 0);
  if (ohlasena > MAX_TELO) return chyba(res, 413, 'Objednávka je príliš veľká.');

  let surove;
  try {
    surove = await precitajTelo(req);
  } catch (e) {
    if (e.velke) return chyba(res, 413, 'Objednávka je príliš veľká.');
    return chyba(res, 400, 'Objednávku sa nepodarilo prečítať.');
  }
  if (Buffer.byteLength(surove, 'utf8') > MAX_TELO) return chyba(res, 413, 'Objednávka je príliš veľká.');

  let body;
  try {
    body = JSON.parse(surove || '{}');
  } catch {
    return chyba(res, 400, 'Objednávku sa nepodarilo prečítať.');     // H1 – žiadny detail parsera
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return chyba(res, 400, 'Objednávku sa nepodarilo prečítať.');
  }

  // C2 – neznáme polia neprejdú
  if (neznameKluce(body, POLIA_TELO).length) return chyba(res, 400, 'Objednávka obsahuje neznáme údaje.');
  const c = body.customer;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return chyba(res, 400, 'Chýbajú kontaktné údaje.');
  if (neznameKluce(c, POLIA_ZAKAZNIK).length) return chyba(res, 400, 'Objednávka obsahuje neznáme údaje.');

  // C7 – pasca na roboty: skryté pole musí ostať prázdne
  if (ocisti(body.web, 50)) return chyba(res, 400, 'Objednávku sa nepodarilo odoslať.');
  const trvanie = Number(body.trvanieMs);
  if (Number.isFinite(trvanie) && trvanie >= 0 && trvanie < MIN_TRVANIE_MS) {
    return chyba(res, 400, 'Objednávku sa nepodarilo odoslať. Skúste to, prosím, znova.');
  }

  const ip = klientskaIp(req);

  try {
    // D1 – limity. Pri výpadku počítadla radšej pustíme ďalej než zablokovať predaj.
    let naIp = 0, globalne = 0;
    try {
      naIp = await store.pocitadlo(`vila27:limit:ip:${ip}`, OKNO_IP);
      globalne = await store.pocitadlo('vila27:limit:vsetky', OKNO_GLOBAL);
    } catch { /* počítadlo nie je kritické */ }
    if (naIp > LIMIT_IP) {
      res.setHeader('Retry-After', String(OKNO_IP));
      return chyba(res, 429, `Priveľa objednávok z jedného zariadenia. Skúste to o chvíľu alebo zavolajte na ${TEL_PODPORA}.`);
    }
    if (globalne > LIMIT_GLOBAL) {
      res.setHeader('Retry-After', '600');
      return chyba(res, 429, `Práve máme nezvyčajne veľa objednávok. Skúste to o chvíľu alebo zavolajte na ${TEL_PODPORA}.`);
    }

    // C7 – voliteľné Turnstile
    if (!await turnstileOk(body.turnstileToken, ip)) {
      return chyba(res, 400, 'Overenie sa nepodarilo. Skúste to, prosím, znova.');
    }

    /* C4 – otváracie hodiny rozhoduje server.
        Predobjednávka je výnimka: práve preto existuje, aby sa dalo objednať
        aj cez zatvorené. Termín však musí sedieť do otváracích hodín, o tom
        rozhoduje hodiny.overTermin() nižšie. */
    let termin = null;
    if (body.pozadovanyCas !== undefined) {
      if (typeof body.pozadovanyCas !== 'string') {
        return chyba(res, 400, 'Čas predobjednávky nie je platný.');
      }
      const overenie = hodiny.overTermin(body.pozadovanyCas);
      if (!overenie.ok) return chyba(res, 400, overenie.chyba);
      termin = overenie.termin;
    } else {
      const h = hodiny.stav();
      if (!h.otvorene) {
        return res.status(409).json({
          ok: false, zatvorene: true, predobjednavkaMozna: hodiny.terminy().length > 0,
          error: `${h.sprava} Môžete si však spraviť predobjednávku na neskôr, alebo nám zavolať na ${TEL_PODPORA}.`,
        });
      }
    }

    // C8 – dvojité odoslanie (dvojklik, obnovenie) nesmie vyrobiť dve objednávky
    const kluc = ocisti(body.orderKey, 64).replace(/[^A-Za-z0-9_-]/g, '');
    const klucRedis = kluc ? `vila27:idem:${kluc}` : '';
    if (klucRedis) {
      const uz = await store.get(klucRedis);
      if (uz) {
        try { return res.status(200).json({ ok: true, ...JSON.parse(uz), duplicita: true }); }
        catch { /* pokazený záznam – pokračujeme normálne */ }
      }
    }

    // ---- validácia zákazníka (C2) ----
    const meno = ocisti(c.name, 80);
    if (meno.length < 2) return chyba(res, 400, 'Zadajte, prosím, meno a priezvisko.');
    if (!jeTelefon(c.phone)) return chyba(res, 400, 'Zadajte, prosím, telefón v tvare +421 9xx xxx xxx.');
    const tel = telefon(c.phone);

    const spolocne = await menu.spolocne();
    const mode = body.mode === 'odber' ? 'odber' : 'rozvoz';
    if (body.mode !== undefined && body.mode !== 'odber' && body.mode !== 'rozvoz') {
      return chyba(res, 400, 'Neznámy spôsob prevzatia.');
    }
    const village = mode === 'rozvoz' ? ocisti(c.village, 60) : '';
    const zone = mode === 'rozvoz' ? zonaPre(spolocne.deliveryZones, village) : null;
    if (mode === 'rozvoz' && !zone) return chyba(res, 400, 'Vyberte obec doručenia.');
    const ulica = mode === 'rozvoz' ? ocisti(c.address, 160) : '';
    if (mode === 'rozvoz' && ulica.length < 3) return chyba(res, 400, 'Zadajte, prosím, adresu doručenia.');

    // ---- ceny sa rátajú z menu, nie z toho, čo poslal prehliadač (C1) ----
    const ponuka = menu.podlaId(await menu.nacitaj('rozvoz'));
    const vysledok = prepocitaj(body.items, ponuka, spolocne);
    if (vysledok.chyba) return chyba(res, 400, vysledok.chyba);

    const { items, subtotal } = vysledok;
    if (zone && subtotal < zone.min) {
      return chyba(res, 400, `Minimálna objednávka pre obec ${village} je ${zone.min.toFixed(2)} € (bez dopravy).`);
    }
    const fee = zone ? zone.fee : 0;
    const total = round(subtotal + fee);

    const order = {
      id: (globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2)),
      number: await store.nextNumber(),
      createdAt: new Date().toISOString(),
      mode,
      customer: {
        name: meno,
        phone: tel,
        address: mode === 'rozvoz' ? `${ulica}, ${village}` : '',
        village,
        time: ocisti(c.time, 60),
        pay: ocisti(c.pay, 60),
        note: ocisti(c.note, 400),
      },
      items,
      subtotal,
      fee,
      total,
      predobjednavka: Boolean(termin),
      pozadovanyCas: termin ? termin.iso : '',
      pozadovanyCasPopis: termin ? termin.popis : '',
    };

    await store.save(order);

    const odpoved = {
      number: order.number, total: order.total, subtotal, fee, mode,
      predobjednavka: order.predobjednavka,
      pozadovanyCasPopis: order.pozadovanyCasPopis,
      items: items.map(i => ({ name: i.name, qty: i.qty })),
    };
    if (klucRedis) { try { await store.set(klucRedis, JSON.stringify(odpoved), 15 * 60); } catch { /* nevadí */ } }

    // E2 – do logu nejde celé telo objednávky ani plný telefón
    console.log(`${order.predobjednavka ? 'Predobjednávka' : 'Objednávka'} #${order.number} prijatá `
      + `(${mode}, ${items.length} položiek, tel ${maskuj(tel)}`
      + `${order.predobjednavka ? ', na ' + order.pozadovanyCasPopis : ''})`);

    return res.status(201).json({ ok: true, ...odpoved });
  } catch (e) {
    // D2 – výpadok úložiska nesmie vyzerať ako úspech
    const uloziskoPadlo = Boolean(e && (e.nedostupne || /Redis|TimeoutError|fetch failed/i.test(String(e.message))));
    console.error('Chyba pri ukladaní objednávky:', e.message);      // H1 – bez stacku a bez osobných údajov
    if (uloziskoPadlo) {
      return res.status(503).json({ ok: false, error: `Objednávky sú dočasne nedostupné, zavolajte nám, prosím, na ${TEL_PODPORA}.` });
    }
    return res.status(500).json({ ok: false, error: 'Objednávku sa nepodarilo spracovať. Skúste to, prosím, znova.' });
  }
};

module.exports.prepocitaj = prepocitaj;
module.exports.MAX_TELO = MAX_TELO;
module.exports.MAX_KS = MAX_KS;
module.exports.MAX_RIADKOV = MAX_RIADKOV;
