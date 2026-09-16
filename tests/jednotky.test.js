'use strict';
/**
 * Jednotkové testy bezpečnostných pravidiel.
 * Názov každého testu začína ID položky zo SECURITY-GOAL.md – podľa toho
 * scripts/security-check.js skladá tabuľku PASS/FAIL.
 *
 *   node --test tests/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const KOREN = path.join(__dirname, '..');

/* ==================================================================== C1/C2
   Prepočet cien a validácia košíka
   ==================================================================== */

const orders = require(path.join(KOREN, 'api', 'orders.js'));
const menuModul = require(path.join(KOREN, 'api', '_menu.js'));

/** Malá ponuka na testy – zodpovedá tvaru, aký vracia menu.podlaId(). */
function ponukaTest() {
  return new Map([
    ['b1', { id: 'b1', name: 'Cheeseburger', price: 13.9, catId: 'burger', addonGroups: [{ title: 'Doplnky', options: [{ name: 'King size', price: 3 }] }] }],
    ['p1', { id: 'p1', name: 'Pizza Vila27', price: 10.4, catId: 'pizza', pizzaToppings: true }],
  ]);
}
const spolocneTest = () => ({
  toppings: [{ g: 'Syry', items: ['Mozzarella'], price: 1.5 }],
  glutenFree: { name: 'Bezlepkové cesto', price: 2 },
  deliveryZones: [{ fee: 1.5, min: 15, villages: ['Bešeňová'] }],
});

test('C1 – cena sa ráta z menu, cena poslaná z prehliadača sa ignoruje', () => {
  // prehliadač si vypýtal cenu 0,01 € – server ju ignoruje a použije menu
  const v = orders.prepocitaj(
    [{ id: 'b1', qty: 2, price: 0.01, unitPrice: 0.01, lineTotal: 0.02, name: 'Zadarmo' }],
    ponukaTest(), spolocneTest(),
  );
  assert.equal(v.chyba, undefined);
  assert.equal(v.items[0].unitPrice, 13.9);
  assert.equal(v.items[0].lineTotal, 27.8);
  assert.equal(v.items[0].name, 'Cheeseburger');
  assert.equal(v.subtotal, 27.8);

  // úplne neznáme pole je naopak dôvod na odmietnutie
  const cudzie = orders.prepocitaj([{ id: 'b1', qty: 1, zlava: 99 }], ponukaTest(), spolocneTest());
  assert.equal(cudzie.chyba, 'Košík obsahuje neznáme údaje.');

  const ok = orders.prepocitaj([{ id: 'b1', qty: 2 }], ponukaTest(), spolocneTest());
  assert.equal(ok.chyba, undefined);
  assert.equal(ok.items[0].unitPrice, 13.9);
  assert.equal(ok.items[0].lineTotal, 27.8);
  assert.equal(ok.subtotal, 27.8);
});

test('C1 – doplnok sa ocení podľa menu, nie podľa prehliadača', () => {
  const v = orders.prepocitaj([{ id: 'b1', qty: 1, extras: ['King size'] }], ponukaTest(), spolocneTest());
  assert.equal(v.items[0].unitPrice, 16.9);
  const zly = orders.prepocitaj([{ id: 'b1', qty: 1, extras: ['Zlatá tehlička'] }], ponukaTest(), spolocneTest());
  assert.match(zly.chyba, /neponúkame/);
});

test('C2 – neznáme id jedla sa odmietne', () => {
  const v = orders.prepocitaj([{ id: 'neexistuje', qty: 1 }], ponukaTest(), spolocneTest());
  assert.match(v.chyba, /už nie je v ponuke/);
});

test('C2 – počet kusov 0, 21, 1.5 aj "5" sú chyba; 1 a 20 prejdú', () => {
  for (const qty of [0, 21, 1.5, '5', -3, null, undefined, NaN]) {
    const v = orders.prepocitaj([{ id: 'b1', qty }], ponukaTest(), spolocneTest());
    assert.match(v.chyba || '', /celé číslo/, `qty=${JSON.stringify(qty)} malo byť odmietnuté`);
  }
  for (const qty of [1, 20]) {
    const v = orders.prepocitaj([{ id: 'b1', qty }], ponukaTest(), spolocneTest());
    assert.equal(v.chyba, undefined, `qty=${qty} mala prejsť`);
  }
});

test('C2 – prázdny košík a viac ako 30 riadkov sa odmietnu', () => {
  assert.match(orders.prepocitaj([], ponukaTest(), spolocneTest()).chyba, /Prázdny košík/);
  const vela = Array.from({ length: 31 }, () => ({ id: 'b1', qty: 1 }));
  assert.match(orders.prepocitaj(vela, ponukaTest(), spolocneTest()).chyba, /najviac 30/);
});

test('C2 – katalóg doplnkov neprijme podvrhnutý kľúč', () => {
  assert.deepEqual(menuModul.doplnkyZKlucov(['zadarmo-vsetko']), { addonGroups: [], pizzaToppings: false });
});

/* ==================================================================== C5
   Čistenie textu pre tlačiareň
   ==================================================================== */

const sanit = require(path.join(KOREN, 'api', '_sanitize.js'));
const escpos = require(path.join(KOREN, 'agent', 'escpos.js'));

const KICK = String.fromCharCode(0x1b, 0x70, 0x00, 0x19, 0xfa);   // ESC p – zásuvka na peniaze
const CUT = String.fromCharCode(0x1d, 0x56, 0x00);                // GS V – odrezanie papiera

test('C5 – server zahodí ESC p (zásuvka) aj GS V (rez) a nechá text', () => {
  const kick = sanit.ocisti(KICK);
  const cut = sanit.ocisti(CUT);
  const maRiadiaci = s => new RegExp(sanit.RIADIACE.source).test(s);
  assert.ok(!maRiadiaci(kick), 'v ESC p ostal riadiaci znak');
  assert.ok(!maRiadiaci(cut), 'v GS V ostal riadiaci znak');
  assert.equal(kick, 'pú');
  assert.equal(cut, 'V');
});

test('C5 – slovenská diakritika prežije čistenie', () => {
  assert.equal(sanit.ocisti('Šťastný žltý kôň'), 'Šťastný žltý kôň');
});

test('C5 – znak mimo CP852 sa nahradí otáznikom', () => {
  assert.equal(sanit.ocisti('pizza 🍕 tu'), 'pizza ? tu');
});

test('C5 – agent čistí text znova, do bajtov sa riadiaci znak nedostane', () => {
  const bajty = [...escpos.encodeText(KICK + CUT, 'cp852')];
  assert.ok(!bajty.includes(0x1b), 'v bajtoch ostal ESC');
  assert.ok(!bajty.includes(0x1d), 'v bajtoch ostal GS');
  assert.ok(!bajty.includes(0x00), 'v bajtoch ostal NUL');
  // diakritika sa zakóduje podľa CP852, nie ako otáznik
  assert.deepEqual([...escpos.encodeText('šô', 'cp852')], [0xe7, 0x93]);
});

test('C2 – telefón sa overuje na tvar', () => {
  assert.ok(sanit.jeTelefon('+421 914 271 271'));
  assert.ok(sanit.jeTelefon('0914271271'));
  assert.ok(!sanit.jeTelefon('123'));
  assert.ok(!sanit.jeTelefon('nie je telefón'));
  assert.equal(sanit.telefon('+421 914 271 271'), '+421914271271');
});

/* ==================================================================== B1/B2
   Overenie tokenu
   ==================================================================== */

const tokenModul = require(path.join(KOREN, 'api', '_token.js'));

test('B1 – bez PRINT_TOKEN alebo s krátkym tokenom sa odmietne všetko', () => {
  const povodny = process.env.PRINT_TOKEN;
  try {
    delete process.env.PRINT_TOKEN;
    assert.equal(tokenModul.tokenNastaveny(), false);
    assert.equal(tokenModul.overToken(''), false);
    assert.equal(tokenModul.overToken(undefined), false);
    // klasická chyba „undefined === undefined“ nesmie prejsť
    assert.equal(tokenModul.overToken(String(undefined)), false);

    process.env.PRINT_TOKEN = 'prikratky';
    assert.equal(tokenModul.tokenNastaveny(), false);
    assert.equal(tokenModul.overToken('prikratky'), false);
  } finally {
    if (povodny === undefined) delete process.env.PRINT_TOKEN;
    else process.env.PRINT_TOKEN = povodny;
  }
});

test('B1/B2 – správny token prejde, nesprávny ani iná dĺžka nie', () => {
  const povodny = process.env.PRINT_TOKEN;
  try {
    process.env.PRINT_TOKEN = 'a'.repeat(40);
    assert.equal(tokenModul.overToken('a'.repeat(40)), true);
    assert.equal(tokenModul.overToken('b'.repeat(40)), false);
    assert.equal(tokenModul.overToken('a'.repeat(39)), false);      // kratší
    assert.equal(tokenModul.overToken('a'.repeat(41)), false);      // dlhší
    assert.equal(tokenModul.overToken(''), false);
  } finally {
    if (povodny === undefined) delete process.env.PRINT_TOKEN;
    else process.env.PRINT_TOKEN = povodny;
  }
});

test('B3 – token sa číta iba z hlavičky Authorization: Bearer', () => {
  assert.equal(tokenModul.zHlavicky({ headers: { authorization: 'Bearer abc' } }), 'abc');
  assert.equal(tokenModul.zHlavicky({ headers: { authorization: 'bearer  abc  ' } }), 'abc');
  assert.equal(tokenModul.zHlavicky({ headers: {} }), '');
  assert.equal(tokenModul.zHlavicky({ headers: { authorization: 'abc' } }), '');
  // query string modul vôbec nepozná
  assert.equal(tokenModul.zHlavicky({ headers: {}, query: { token: 'abc' } }), '');
});

/* ==================================================================== D1/B5
   Počítadlo limitov
   ==================================================================== */

test('D1 – počítadlo limitov rastie v okne a po expirácii sa vynuluje', async () => {
  const store = require(path.join(KOREN, 'api', '_store.js'));
  assert.equal(store.hasRedis, false, 'test beží v pamäťovom režime');
  const kluc = 'test:limit:' + Math.random();

  const poradie = [];
  for (let i = 0; i < 6; i++) poradie.push(await store.pocitadlo(kluc, 60));
  assert.deepEqual(poradie, [1, 2, 3, 4, 5, 6]);

  // šiesty pokus už limit 5 prekračuje
  assert.ok(poradie[5] > 5);

  // iný kľúč (iná IP) má vlastné okno
  assert.equal(await store.pocitadlo('test:limit:ina-ip:' + Math.random(), 60), 1);

  // po uplynutí okna sa počítadlo naozaj vynuluje
  const kratky = 'test:limit:kratky:' + Math.random();
  assert.equal(await store.pocitadlo(kratky, 1), 1);
  assert.equal(await store.pocitadlo(kratky, 1), 2);
  await new Promise(r => setTimeout(r, 1100));
  assert.equal(await store.pocitadlo(kratky, 1), 1, 'po expirácii sa počítadlo vynuluje');
});

/* ==================================================================== C4
   Otváracie hodiny
   ==================================================================== */

const hodiny = require(path.join(KOREN, 'api', '_hours.js'));
const CFG_OTV = require('./fixtures/hodiny-otvorene.json');
const CFG_ZATV = require('./fixtures/hodiny-zatvorene.json');

const OBED = {
  casovePasmo: 'Europe/Bratislava',
  tyzden: { 1: [['11:00', '21:30']], 2: [['11:00', '21:30']], 3: [['11:00', '21:30']], 4: [['11:00', '21:30']], 5: [['11:00', '21:30']], 6: [['11:00', '21:30']], 7: [['11:00', '21:30']] },
  zatvorene: ['2026-12-24'],
};

test('C4 – otvorené a zatvorené podľa času v pásme Europe/Bratislava', () => {
  // 2026-09-16 je streda. 12:00 v Bratislave = 10:00 UTC (letný čas).
  assert.equal(hodiny.stavPre(OBED, new Date('2026-09-16T10:00:00Z')).otvorene, true);
  // 09:00 v Bratislave = 07:00 UTC → ešte zatvorené
  const rano = hodiny.stavPre(OBED, new Date('2026-09-16T07:00:00Z'));
  assert.equal(rano.otvorene, false);
  assert.equal(rano.dovod, 'mimo-hodin');
  assert.match(rano.sprava, /11:00 – 21:30/);
  // 22:00 v Bratislave = 20:00 UTC → už zatvorené
  assert.equal(hodiny.stavPre(OBED, new Date('2026-09-16T20:00:00Z')).otvorene, false);
});

test('C4 – deň zo zoznamu „zatvorené“ neprijíma objednávky', () => {
  // 24.12.2026 o 12:00 miestneho času, hoci hodiny inak sedia
  const s = hodiny.stavPre(OBED, new Date('2026-12-24T11:00:00Z'));
  assert.equal(s.otvorene, false);
  assert.equal(s.dovod, 'zatvorene-den');
});

test('C4 – prechod polnoci: zimný čas aj interval cez polnoc', () => {
  // 23:30 UTC v zime = 00:30 nasledujúceho dňa v Bratislave (UTC+1) → zatvorené
  const polnoc = hodiny.stavPre(OBED, new Date('2026-01-15T23:30:00Z'));
  assert.equal(polnoc.otvorene, false);
  assert.equal(hodiny.miestnyCas(new Date('2026-01-15T23:30:00Z'), 'Europe/Bratislava').datum, '2026-01-16');
  assert.equal(hodiny.miestnyCas(new Date('2026-01-15T23:30:00Z'), 'Europe/Bratislava').minuty, 30);

  // interval, ktorý prechádza polnocou, platí pred aj po nej
  assert.equal(hodiny.vIntervale(23 * 60 + 30, ['22:00', '02:00']), true);
  assert.equal(hodiny.vIntervale(60, ['22:00', '02:00']), true);
  assert.equal(hodiny.vIntervale(180, ['22:00', '02:00']), false);
});

test('C4 – testovacie konfigurácie sú naozaj otvorené/zatvorené', () => {
  assert.equal(hodiny.stavPre(CFG_OTV, new Date('2026-09-16T02:00:00Z')).otvorene, true);
  assert.equal(hodiny.stavPre(CFG_ZATV, new Date('2026-09-16T12:00:00Z')).otvorene, false);
});

/* ==================================================================== C6
   Nástenka objednávok nerobí HTML z údajov zákazníka
   ==================================================================== */

const { vytvorKartu } = require(path.join(KOREN, 'public', 'admin-karta.js'));

/** Najmenší možný DOM. innerHTML tu neexistuje – keby ho kód použil, test padne. */
function fakeDoc() {
  const uzol = (tag, text) => {
    const n = {
      tag, deti: [], atributy: {}, className: '',
      _text: text || '',
      appendChild(d) { this.deti.push(d); return d; },
      setAttribute(k, v) { this.atributy[k] = String(v); },
    };
    Object.defineProperty(n, 'textContent', {
      get() { return n._text; },
      set(v) { n._text = String(v); n.deti.length = 0; },
    });
    Object.defineProperty(n, 'innerHTML', {
      set() { throw new Error('innerHTML sa na nástenke nesmie použiť (C6)'); },
      get() { throw new Error('innerHTML sa na nástenke nesmie použiť (C6)'); },
    });
    return n;
  };
  return {
    createElement: t => uzol(t),
    createTextNode: t => uzol('#text', t),
  };
}

/** Prevedie strom na text tak, ako by ho videl používateľ. */
function akoText(n) {
  return (n._text || '') + n.deti.map(akoText).join('');
}
/** Serializácia ako v skutočnom DOM: text sa escapuje, značky vyrába len createElement. */
const escHtml = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function akoHtml(n) {
  if (n.tag === '#text') return escHtml(n._text);
  const atr = Object.entries(n.atributy).map(([k, v]) => ` ${k}="${escHtml(v)}"`).join('');
  return `<${n.tag}${n.className ? ` class="${escHtml(n.className)}"` : ''}${atr}>${escHtml(n._text)}${n.deti.map(akoHtml).join('')}</${n.tag}>`;
}

test('C6 – XSS v mene a poznámke skončí ako text, nie ako značka', () => {
  const utok = '<img src=x onerror=alert(1)>';
  const objednavka = {
    id: 'id-1', number: 7, mode: 'rozvoz', total: 21.4, fee: 1.5,
    createdAt: new Date().toISOString(),
    customer: { name: utok, phone: '+421900000000', address: utok, time: 'Čo najskôr', pay: 'Hotovosť', note: utok },
    items: [{ qty: 1, name: utok, extras: [utok] }],
  };
  const karta = vytvorKartu(fakeDoc(), objednavka, {
    stav: 'nova', nevidena: true,
    eur: n => Number(n).toFixed(2) + ' €',
    vek: () => 'teraz', cas: () => '12:00', stara: () => false,
  });

  const text = akoText(karta);
  assert.ok(text.includes(utok), 'payload sa mal objaviť ako text');

  const html = akoHtml(karta);
  assert.ok(!/<img/i.test(html), 'z payloadu sa stal skutočný <img> prvok');
  assert.ok(!/<[a-z]+[^>]*\son[a-z]+=/i.test(html), 'z payloadu sa stal atribút on…');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'payload sa nevykreslil ako neškodný text');
  assert.ok(html.includes('href="tel:+421900000000"'), 'telefón sa nevykreslil ako odkaz');
});

test('C6 – zdrojový kód nástenky nepoužíva innerHTML s údajmi objednávky', () => {
  const src = fs.readFileSync(path.join(KOREN, 'public', 'admin-objednavky.js'), 'utf8');
  const karta = fs.readFileSync(path.join(KOREN, 'public', 'admin-karta.js'), 'utf8');
  const bezKomentarov = k => k.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const [meno, kod] of [['admin-objednavky.js', bezKomentarov(src)], ['admin-karta.js', bezKomentarov(karta)]]) {
    const riadky = kod.split(/\r?\n/).filter(r => /innerHTML|insertAdjacentHTML|outerHTML/.test(r));
    assert.deepEqual(riadky, [], `${meno} používa HTML z reťazcov: ${riadky.join(' | ')}`);
  }
});

/* ==================================================================== J2/J3/J4
   Tlačový agent
   ==================================================================== */

const transport = require(path.join(KOREN, 'agent', 'transport.js'));

test('J2 – režim command odovzdáva argumenty poľom, nie príkazovým riadkom', async () => {
  const vypis = path.join(os.tmpdir(), `vila27-test-args-${Date.now()}.txt`);
  const nebezpecny = 'a b & echo hacked > ' + path.join(os.tmpdir(), 'vila27-hacked.txt');
  try {
    process.env.VILA27_TEST_OUT = vypis;
    await transport.print(Buffer.from('bajty'), {
      mode: 'command',
      command: {
        program: process.execPath,
        args: ['-e', 'require("fs").writeFileSync(process.env.VILA27_TEST_OUT, JSON.stringify(process.argv.slice(1)))', '{file}', nebezpecny],
      },
    });

    const prijate = JSON.parse(fs.readFileSync(vypis, 'utf8'));
    assert.equal(prijate.length, 2, 'program mal dostať presne dva argumenty');
    // 1) cesta k dočasnému súboru má pevný tvar, nič z objednávky sa do nej nedostane
    assert.match(path.basename(prijate[0]), /^vila27-[0-9a-f]{16}\.bin$/);
    // 2) metaznaky shellu doleteli doslova – žiadny shell ich nerozobral
    assert.equal(prijate[1], nebezpecny);
    assert.equal(fs.existsSync(path.join(os.tmpdir(), 'vila27-hacked.txt')), false, 'shell vykonal presmerovanie!');
  } finally {
    delete process.env.VILA27_TEST_OUT;
    try { fs.unlinkSync(vypis); } catch { /* nevadí */ }
  }
});

test('J2 – zdrojový kód agenta nepúšťa nič cez shell', () => {
  const kod = fs.readFileSync(path.join(KOREN, 'agent', 'transport.js'), 'utf8');
  assert.ok(!/\bexec\s*\(/.test(kod), 'transport.js používa exec() so shellom');
  assert.ok(!/shell:\s*true/.test(kod), 'transport.js zapína shell');
  assert.match(kod, /shell:\s*false/);
});

test('J4 – režim file zapíše bloček na disk namiesto tlače', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vila27-tlac-'));
  const cesta = await transport.print(Buffer.from([0x41, 0x42]), { mode: 'file', file: { dir } });
  assert.ok(fs.existsSync(cesta));
  assert.deepEqual([...fs.readFileSync(cesta)], [0x41, 0x42]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('J3 – zoznam vytlačených sa preberá a pokazený súbor prežije', () => {
  const agent = require(path.join(KOREN, 'agent', 'print-agent.js'));
  const stary = new Date(Date.now() - 30 * 864e5).toISOString();
  const novy = new Date().toISOString();
  const m = agent.orez(new Map([['stary', stary], ['novy', novy], ['pokazeny', 'toto nie je dátum']]));
  assert.deepEqual([...m.keys()], ['novy']);
});

/* ==================================================================== A2
   Tajomstvá nie sú v gite
   ==================================================================== */

test('A2 – .gitignore zakrýva tokeny, stav agenta a logy', () => {
  const gi = fs.readFileSync(path.join(KOREN, '.gitignore'), 'utf8');
  for (const vzor of ['.env', 'agent/config.json', 'agent/vytlacene.json', '*.log']) {
    assert.ok(gi.split(/\r?\n/).includes(vzor), `.gitignore neobsahuje ${vzor}`);
  }
  assert.ok(fs.existsSync(path.join(KOREN, '.env.example')));
  assert.ok(fs.existsSync(path.join(KOREN, 'agent', 'config.example.json')));
  const vzor = JSON.parse(fs.readFileSync(path.join(KOREN, 'agent', 'config.example.json'), 'utf8'));
  assert.match(vzor.token, /^__/, 'vzorový config obsahuje niečo iné než zástupný text');
});

/* ==================================================================== F2/F3
   Súhlas a fonty
   ==================================================================== */

test('F2 – žiadna stránka nevolá Google Fonts', () => {
  const pub = path.join(KOREN, 'public');
  const chyby = [];
  for (const f of fs.readdirSync(pub)) {
    if (!/\.(html|css|js)$/.test(f)) continue;
    const s = fs.readFileSync(path.join(pub, f), 'utf8');
    if (/fonts\.(googleapis|gstatic)\.com/.test(s)) chyby.push(f);
  }
  assert.deepEqual(chyby, []);
  assert.ok(fs.existsSync(path.join(pub, 'fonts', 'source-sans-3.css')));
});

test('F3 – banner má tri rovnocenné tlačidlá a nič nie je vopred zaškrtnuté', () => {
  const s = fs.readFileSync(path.join(KOREN, 'public', 'cookies.js'), 'utf8');
  for (const t of ['Prijať všetko', 'Odmietnuť všetko', 'Nastavenia']) {
    assert.ok(s.includes(t), `chýba tlačidlo ${t}`);
  }
  // všetky tri majú rovnakú triedu, teda rovnakú vizuálnu váhu
  const tlacidla = s.match(/tlacidlo\("ck-btn"/g) || [];
  assert.ok(tlacidla.length >= 3);
  assert.match(s, /cb\.checked = k\.vzdy \? true : povolene\(k\.id\)/);
  assert.match(s, /PLATNOST_DNI = 365/);
  assert.match(s, /d\.v !== VERZIA/);
});

test('F3 – odkaz „Nastavenia cookies“ je v päte každej verejnej stránky', () => {
  const pub = path.join(KOREN, 'public');
  const verejne = fs.readdirSync(pub).filter(f => f.endsWith('.html') && !f.startsWith('admin'));
  assert.ok(verejne.length >= 9, 'čakal som aspoň 9 verejných stránok, našiel ' + verejne.length);
  for (const f of verejne) {
    const s = fs.readFileSync(path.join(pub, f), 'utf8');
    assert.ok(s.includes('data-cookie-settings'), `${f} nemá odkaz na nastavenia cookies`);
    assert.ok(s.includes('ochrana-osobnych-udajov.html'), `${f} nemá odkaz na ochranu údajov`);
    assert.ok(s.includes('cookies.html'), `${f} nemá odkaz na zásady cookies`);
  }
});

test('G1 – v HTML nie je inline skript, inline štýl ani on… atribút', () => {
  const pub = path.join(KOREN, 'public');
  const chyby = [];
  for (const f of fs.readdirSync(pub).filter(x => x.endsWith('.html'))) {
    const s = fs.readFileSync(path.join(pub, f), 'utf8');
    if (/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/.test(s)) chyby.push(f + ': inline <script>');
    if (/<style[\s>]/.test(s)) chyby.push(f + ': inline <style>');
    if (/\sstyle="/.test(s)) chyby.push(f + ': style="…"');
    if (/\son(click|load|error|change|submit|input|focus|blur|mouseover)=/.test(s)) chyby.push(f + ': on… atribút');
  }
  assert.deepEqual(chyby, []);
});

test('P6 – každá verejná stránka má lang="sk", skip link a titulok', () => {
  const pub = path.join(KOREN, 'public');
  for (const f of fs.readdirSync(pub).filter(x => x.endsWith('.html') && !x.startsWith('admin'))) {
    const s = fs.readFileSync(path.join(pub, f), 'utf8');
    assert.match(s, /<html lang="sk">/, f);
    assert.match(s, /class="skip-link"/, f);
    assert.match(s, /<title>[^<]{5,}<\/title>/, f);
  }
});

test('P4 – meta popis a canonical sú unikátne na každej indexovanej stránke', () => {
  const pub = path.join(KOREN, 'public');
  const popisy = new Map(), kanony = new Map();
  for (const f of fs.readdirSync(pub).filter(x => x.endsWith('.html') && !x.startsWith('admin'))) {
    const s = fs.readFileSync(path.join(pub, f), 'utf8');
    if (/name="robots" content="noindex/.test(s)) continue;        // 404 canonical nemá
    const popis = (/<meta name="description" content="([^"]+)"/.exec(s) || [])[1];
    const kanon = (/<link rel="canonical" href="([^"]+)"/.exec(s) || [])[1];
    assert.ok(popis, `${f} nemá meta description`);
    assert.ok(kanon, `${f} nemá canonical`);
    assert.ok(!popisy.has(popis), `${f} má rovnaký popis ako ${popisy.get(popis)}`);
    assert.ok(!kanony.has(kanon), `${f} má rovnaký canonical ako ${kanony.get(kanon)}`);
    popisy.set(popis, f); kanony.set(kanon, f);
  }
  assert.ok(popisy.size >= 8);
});

test('P6 – každé vstupné pole má vlastný <label> a rozumný autocomplete', () => {
  const pub = path.join(KOREN, "public");
  const chyby = [];
  let pocet = 0;
  for (const f of fs.readdirSync(pub).filter(x => x.endsWith(".html"))) {
    const s = fs.readFileSync(path.join(pub, f), "utf8");
    const labels = new Set([...s.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map(m => m[1]));
    const polia = s.match(/<(?:input|select|textarea)\s[^>]*>/g) || [];
    pocet += polia.length;
    for (const pole of polia) {
      if (/type="(?:hidden|submit|button)"/.test(pole)) continue;
      const id = (/\sid="([^"]+)"/.exec(pole) || [])[1];
      const maPopis = /\saria-label(?:ledby)?=/.test(pole) || (id && labels.has(id));
      if (!maPopis) chyby.push(`${f}: ${pole.slice(0, 70)}`);
    }
  }
  assert.ok(pocet > 15, `čakal som viac vstupných polí, našiel ${pocet} – výraz nič nechytá`);
  assert.deepEqual(chyby, []);

  const obj = fs.readFileSync(path.join(pub, "objednavka.html"), "utf8");
  assert.match(obj, /id="f-name"[^>]*autocomplete="name"/);
  assert.match(obj, /id="f-phone"[^>]*inputmode="tel"/);
  assert.match(obj, /id="f-addr"[^>]*autocomplete="street-address"/);
  // viditeľné ohraničenie fokusu a preskočenie na obsah
  const css = fs.readFileSync(path.join(pub, "site.css"), "utf8");
  assert.match(css, /:focus-visible[^{]*{[^}]*outline:\s*3px/);
  assert.match(css, /\.skip-link:focus/);
  // stránka musí byť použiteľná aj na 320 px: jediná vec širšia než obrazovka
  // smie byť tabuľka v zásadách, a tá je v obale s vodorovným posunom
  const bezMedia = css.replace(/@media[^{]*{/g, "{");
  const siroke = [...bezMedia.matchAll(/([^{}]+){([^}]*min-width:\s*(\d{3,})px[^}]*)}/g)]
    .filter(m => Number(m[3]) > 320)
    .map(m => m[1].trim());
  assert.deepEqual(siroke, [".pravne table"], "v CSS pribudla pevná šírka nad 320 px");
  assert.match(css, /\.tabulka-obal{[^}]*overflow-x:\s*auto/);
  assert.deepEqual([...bezMedia.matchAll(/[^-]width:\s*(\d{3,})px/g)].map(m => m[1]), [],
    "v CSS je pevná width v pixeloch");
});
test('P7 – obrázky majú alt, rozmery a tie pod ohybom sa načítavajú lenivo', () => {
  const pub = path.join(KOREN, 'public');
  const chyby = [];
  for (const f of fs.readdirSync(pub).filter(x => x.endsWith('.html'))) {
    const s = fs.readFileSync(path.join(pub, f), 'utf8');
    const obrazky = s.match(/<img\b[^>]*>/g) || [];
    obrazky.forEach((img, i) => {
      if (!/\salt=/.test(img)) chyby.push(`${f}#${i}: bez alt`);
      // prvý obrázok na stránke je hero (fetchpriority), ostatné majú byť lazy
      if (i > 0 && !/loading="lazy"/.test(img)) chyby.push(`${f}#${i}: bez loading="lazy"`);
      if (!/ width="\d+"/.test(img) || !/ height="\d+"/.test(img)) chyby.push(`${f}#${i}: bez width/height`);
    });
  }
  assert.deepEqual(chyby, []);
});

test('H2 – v HTML nezostali interné poznámky ani TODO', () => {
  const pub = path.join(KOREN, 'public');
  const chyby = [];
  for (const f of fs.readdirSync(pub).filter(x => x.endsWith('.html'))) {
    const s = fs.readFileSync(path.join(pub, f), 'utf8');
    for (const k of s.match(/<!--[\s\S]*?-->/g) || []) {
      if (/TODO|FIXME|HACK|XXX|heslo|token|debug/i.test(k)) chyby.push(`${f}: ${k.slice(0, 60)}`);
    }
  }
  assert.deepEqual(chyby, []);
});

test('G2/G3 – vercel.json nastavuje všetky bezpečnostné hlavičky', () => {
  const v = JSON.parse(fs.readFileSync(path.join(KOREN, 'vercel.json'), 'utf8'));
  const globalne = v.headers.find(h => h.source === '/(.*)');
  const mapa = Object.fromEntries(globalne.headers.map(h => [h.key, h.value]));
  assert.match(mapa['Content-Security-Policy'], /script-src 'self'/);
  assert.ok(!/unsafe-inline|unsafe-eval/.test(mapa['Content-Security-Policy']), 'CSP povoľuje unsafe-*');
  assert.match(mapa['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.equal(mapa['Strict-Transport-Security'], 'max-age=63072000; includeSubDomains');
  assert.ok(!/preload/.test(mapa['Strict-Transport-Security']), 'HSTS preload má byť rozhodnutie majiteľa');
  assert.equal(mapa['X-Content-Type-Options'], 'nosniff');
  assert.equal(mapa['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(mapa['X-Frame-Options'], 'DENY');
  assert.equal(mapa['Cross-Origin-Opener-Policy'], 'same-origin');
  assert.match(mapa['Permissions-Policy'], /camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\), usb=\(\)/);
  // žiadne CORS dokorán
  const cely = JSON.stringify(v);
  assert.ok(!/Access-Control-Allow-Origin/.test(cely), 'vercel.json rozdáva CORS');
});

test('E1 – objednávky sa ukladajú s expiráciou podľa ORDER_TTL_DAYS', () => {
  const store = require(path.join(KOREN, 'api', '_store.js'));
  const povodne = process.env.ORDER_TTL_DAYS;
  try {
    delete process.env.ORDER_TTL_DAYS;
    assert.equal(store.ttlSekundy(), 30 * 24 * 3600);
    process.env.ORDER_TTL_DAYS = '7';
    assert.equal(store.ttlSekundy(), 7 * 24 * 3600);
    process.env.ORDER_TTL_DAYS = 'nezmysel';
    assert.equal(store.ttlSekundy(), 30 * 24 * 3600, 'nezmyselná hodnota má padnúť na 30 dní');
  } finally {
    if (povodne === undefined) delete process.env.ORDER_TTL_DAYS;
    else process.env.ORDER_TTL_DAYS = povodne;
  }
  const kod = fs.readFileSync(path.join(KOREN, 'api', '_store.js'), 'utf8');
  assert.match(kod, /redis\('SET', ORDER\(order\.id\), JSON\.stringify\(order\), 'EX'/);
  assert.match(kod, /redis\('EXPIRE', PRINTED/);
});

test('D2 – pamäťový režim je v produkcii zakázaný', () => {
  const kod = fs.readFileSync(path.join(KOREN, 'api', '_store.js'), 'utf8');
  assert.match(kod, /VERCEL_ENV === 'production'/);
  assert.match(kod, /pamatovyRezimPovoleny = !jeProdukcia/);
  assert.match(kod, /e\.nedostupne = true/);
});

test('D4 – každé volanie von má timeout', () => {
  const store = fs.readFileSync(path.join(KOREN, 'api', '_store.js'), 'utf8');
  const agent = fs.readFileSync(path.join(KOREN, 'agent', 'print-agent.js'), 'utf8');
  const orders = fs.readFileSync(path.join(KOREN, 'api', 'orders.js'), 'utf8');
  assert.match(store, /AbortSignal\.timeout\(TIMEOUT_MS\)/);
  assert.match(orders, /AbortSignal\.timeout\(5000\)/);
  assert.match(agent, /AbortSignal\.timeout\(TIMEOUT_MS\)/);
  assert.match(agent, /2 \*\* Math\.min\(failStreak, 8\)/);       // exponenciálne čakanie
});

test('J1 – agent odmietne http:// aj vypnuté overovanie certifikátu', () => {
  const kod = fs.readFileSync(path.join(KOREN, 'agent', 'print-agent.js'), 'utf8');
  assert.match(kod, /u\.protocol !== 'https:'/);
  assert.match(kod, /NODE_TLS_REJECT_UNAUTHORIZED === '0'/);
  assert.match(kod, /Authorization: `Bearer \$\{TOKEN\}`/);
  assert.ok(!/queue\?token=/.test(kod), 'agent posiela token v URL');
});

test('B1 – správa ponuky nemá zapísané prihlasovacie údaje', () => {
  const kod = fs.readFileSync(path.join(KOREN, 'api', '_auth.js'), 'utf8');
  assert.ok(!/adminvila27/.test(kod), 'v _auth.js ostali natvrdo zapísané údaje');
  const auth = require(path.join(KOREN, 'api', '_auth.js'));
  const u = process.env.ADMIN_USER, p = process.env.ADMIN_PASS;
  try {
    delete process.env.ADMIN_USER; delete process.env.ADMIN_PASS;
    // modul si hodnoty načítal pri require – overujeme aspoň logiku nastavenosti
    assert.equal(typeof auth.nastavene, 'function');
  } finally {
    if (u !== undefined) process.env.ADMIN_USER = u;
    if (p !== undefined) process.env.ADMIN_PASS = p;
  }
});

/* ==================================================================== E3/E4/F5
   Právne stránky a formulár
   ==================================================================== */

const citaj = p => fs.readFileSync(path.join(KOREN, 'public', p), 'utf8');

test('E3 – stránka o ochrane údajov obsahuje všetko podľa čl. 13 GDPR', () => {
  const s = citaj('ochrana-osobnych-udajov.html');
  for (const cast of [
    'Prevádzkovateľ', 'Právny základ', 'Ako dlho', 'Komu sa údaje dostanú',
    'Vaše práva', 'Úrad na ochranu osobných údajov', 'Vercel', 'Upstash', '30 dní',
  ]) {
    assert.ok(s.includes(cast), `chýba časť „${cast}“`);
  }
  // retencia sa musí zhodovať s tým, čo naozaj robí úložisko (E1)
  const store = require(path.join(KOREN, 'api', '_store.js'));
  assert.equal(store.ttlSekundy(), 30 * 24 * 3600);
  // nevymyslené údaje sú viditeľne označené
  assert.match(s, /\[DOPLNIŤ:/);
});

test('E4 – objednávkový formulár informuje o údajoch a nemá predzaškrtnuté políčko', () => {
  const s = citaj('objednavka.html');
  assert.match(s, /class="suhlas-note"/);
  assert.match(s, /ochrana-osobnych-udajov\.html/);
  assert.ok(!/checked/.test(s), 'vo formulári je predzaškrtnuté políčko');
  assert.match(s, /id="f-web"/, 'chýba pasca na roboty');
  assert.match(s, /class="hp-pole"/);
});

test('F5 – zásady cookies majú tabuľku so všetkými stĺpcami a skutočným obsahom', () => {
  const s = citaj('cookies.html');
  for (const stlpec of ['Názov', 'Poskytovateľ', 'Účel', 'Trvanie', 'Kategória']) {
    assert.ok(s.includes(`<th>${stlpec}</th>`), `v tabuľke chýba stĺpec ${stlpec}`);
  }
  assert.match(s, /vila27_suhlas/);
  assert.match(s, /Google Ireland Limited/);
  assert.match(s, /452\/2021/);
  // to, čo sľubujeme, musí sedieť s kódom
  const js = citaj('cookies.js');
  assert.match(js, /KLUC = "vila27_suhlas"/);
  assert.match(s, /12 mesiacov/);
});

test('P2 – objednávková stránka má miesto na stavy a hlášky', () => {
  const html = citaj('objednavka.html');
  assert.match(html, /id="stavPas"/);
  assert.match(html, /id="formChyba"/);
  const js = citaj('objednavka.js');
  for (const stav of ['429', '503', '409', '413']) {
    assert.ok(js.includes(stav), `obsluha stavu ${stav} chýba`);
  }
  assert.match(js, /HODINY\.otvorene/);
  assert.match(js, /orderKey: objednavkaKluc\(\)/);
});

test('P3 – päta má údaje prevádzkovateľa a všetky právne odkazy', () => {
  const pub = path.join(KOREN, 'public');
  for (const f of fs.readdirSync(pub).filter(x => x.endsWith('.html') && !x.startsWith('admin'))) {
    const s = fs.readFileSync(path.join(pub, f), 'utf8');
    assert.match(s, /foot-legal/, f);
    assert.match(s, /Prevádzkovateľ:/, f);
    assert.match(s, /Ochrana osobných údajov<\/a>/, f);
    assert.match(s, /Zásady cookies<\/a>/, f);
    assert.match(s, /Nastavenia cookies<\/button>/, f);
  }
});

test('I1 – package.json a lockfile existujú a projekt nemá behové závislosti', () => {
  const p = JSON.parse(fs.readFileSync(path.join(KOREN, 'package.json'), 'utf8'));
  assert.deepEqual(p.dependencies, {}, 'pribudla behová závislosť – treba ju preveriť');
  assert.deepEqual(p.devDependencies, {});
  assert.ok(p.scripts['security:check']);
  assert.ok(fs.existsSync(path.join(KOREN, 'package-lock.json')));
  // agent nesmie mať závislosti vôbec
  const a = JSON.parse(fs.readFileSync(path.join(KOREN, 'agent', 'package.json'), 'utf8'));
  assert.equal(a.dependencies, undefined);
});

test('A3 – .vercelignore drží interné priečinky mimo nasadenia', () => {
  const v = fs.readFileSync(path.join(KOREN, '.vercelignore'), 'utf8').split(/\r?\n/);
  for (const cesta of ['docs/', 'tests/', 'scripts/', 'agent/', 'SECURITY-GOAL.md']) {
    assert.ok(v.includes(cesta), `.vercelignore neobsahuje ${cesta}`);
  }
  // verejné sú iba súbory v public/
  assert.ok(fs.existsSync(path.join(KOREN, 'public', 'index.html')));
  assert.ok(!fs.existsSync(path.join(KOREN, 'index.html')));
});

test('P1 – stránka 404 existuje, je slovenská a neindexuje sa', () => {
  const s = citaj('404.html');
  assert.match(s, /<html lang="sk">/);
  assert.match(s, /noindex/);
  assert.match(s, /Túto stránku sme nenašli/);
  for (const odkaz of ['index.html', 'jedalny-listok.html', 'objednavka.html', 'kontakt.html']) {
    assert.ok(s.includes(`href="${odkaz}"`), `na 404 chýba odkaz na ${odkaz}`);
  }
});

test('F4 – mapa Google je na stránke Kontakt až po súhlase a má náhradný odkaz', () => {
  const s = citaj('kontakt.html');
  assert.ok(!/<iframe/.test(s), 'mapa je vložená natvrdo');
  assert.match(s, /data-consent-frame="externy"/);
  assert.match(s, /data-consent-allow="externy"/);
  assert.match(s, /Otvoriť v Mapách Google/);
});

test('E2 – v logoch nekončia celé objednávky ani plné telefónne čísla', () => {
  const ordersKod = fs.readFileSync(path.join(KOREN, 'api', 'orders.js'), 'utf8');
  const agentKod = fs.readFileSync(path.join(KOREN, 'agent', 'print-agent.js'), 'utf8');
  const logy = [...ordersKod.matchAll(/console\.(log|error|warn)\(([^\n]*)\)/g)].map(m => m[2]);
  for (const l of logy) {
    assert.ok(!/JSON\.stringify\(body|JSON\.stringify\(order|customer\b(?!\.)/.test(l), 'do logu ide celá objednávka: ' + l);
  }
  assert.match(ordersKod, /maskuj\(tel\)/);
  assert.ok(!/customer\?\.name/.test(agentKod), 'agent loguje meno zákazníka');
});
