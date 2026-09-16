'use strict';
/**
 * D3 – zmestí sa mesačná prevádzka do bezplatného Upstashu?
 *
 * Nepočítame od stola. Cez falošný Upstash (tests/fake-upstash.js) zmeriame,
 * koľko Redis príkazov naozaj stojí každý druh požiadavky, a potom to
 * vynásobíme modelom prevádzky. Model je zámerne pesimistický – nie priemerný
 * deň, ale deň, keď sa nezastavia.
 *
 * Bezplatný Upstash Redis: 500 000 príkazov mesačne (stav 9/2026).
 * Test padá, keď sa projekcia priblíži k stropu – to je jeho zmysel.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { vytvor } = require('./fake-upstash.js');

const KOREN = path.join(__dirname, '..');
const TOKEN = 'testovaci-token-vila27-0123456789abcdef';
const PORT_REDIS = 3121;
const PORT_WEB = 3122;
const BASE = `http://127.0.0.1:${PORT_WEB}`;

/* ---------- model prevádzky: pesimistický deň ---------- */
const MODEL = {
  dniVMesiaci: 31,
  otvorenychHodin: 11.5,          // 10:30–22:00, kedy agent aj nástenka bežia
  agentSekund: 12,                // agent/config.example.json → pollSeconds
  nastenkaSekund: 20,             // public/admin-objednavky.js → POLL_RUSNO_MS
  objednavokDenne: 150,           // veľmi rušný deň na dedinskú reštauráciu
  zobrazeniPonukyDenne: 3000,     // návštevy jedálneho lístka a objednávky
  menuCacheSekund: 300,           // api/menu.js → MENU_CACHE_MS
};
const STROP_MESACNE = 500000;
const CACHE_NA_MERANIE_MS = 1200;      // len na zmeranie ceny studeného a teplého cache

let redis, web;

test.before(async () => {
  redis = vytvor();
  await redis.pocuvaj(PORT_REDIS);

  web = spawn(process.execPath, [path.join(KOREN, 'dev-server.js')], {
    cwd: KOREN,
    env: {
      ...process.env,
      PORT: String(PORT_WEB),
      PRINT_TOKEN: TOKEN,
      // testy si posielajú vlastnú IP – hosting to robí prepísaním tejto hlavičky
      VILA27_IP_HEADER: 'x-forwarded-for',
      ADMIN_USER: 'test',
      ADMIN_PASS: 'testovacie-heslo-12',
      VILA27_HOURS_FILE: path.join(__dirname, 'fixtures', 'hodiny-otvorene.json'),
      KV_REST_API_URL: `http://127.0.0.1:${PORT_REDIS}`,
      KV_REST_API_TOKEN: 'falosny-token-len-pre-fake-upstash',
      ORDER_GLOBAL_LIMIT: '100000',
      ORDER_IP_LIMIT: '100000',
      MENU_CACHE_MS: String(CACHE_NA_MERANIE_MS),   // krátky, nech sa test nečaká päť minút
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  web.stderr.on('data', d => process.stderr.write('[server] ' + d));

  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(BASE + '/robots.txt')).ok) return; } catch { /* čakáme */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('dev-server sa nerozbehol');
});

test.after(async () => {
  try { web.kill(); } catch { /* už padol */ }
  try { await redis.zavri(); } catch { /* nevadí */ }
});

const bearer = { Authorization: 'Bearer ' + TOKEN };

/** Zmeria, koľko Redis príkazov stojí jedno zavolanie `akcia`. */
async function cena(akcia) {
  redis.vynuluj();
  await akcia();
  return redis.spolu();
}

let ipCitac = 0;
async function posliObjednavku() {
  const r = await fetch(BASE + '/api/orders', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `203.0.113.${(ipCitac++ % 250) + 1}`,
    },
    body: JSON.stringify({
      mode: 'odber',
      customer: { name: 'Meraný Zákazník', phone: '+421900111222', time: 'Čo najskôr', pay: 'Hotovosť', note: '' },
      items: [{ id: 'po1', qty: 1 }],
      trvanieMs: 60000,
    }),
  });
  assert.equal(r.status, 201, 'objednávka v meraní neprešla');
  return r.json();
}

/** Vráti { v } z odpovede fronty. */
async function frontaAgent(v) {
  const r = await fetch(BASE + '/api/queue' + (v === null ? '' : `?v=${v}`), { headers: bearer });
  assert.equal(r.status, 200);
  return r.json();
}
async function frontaNastenka(v) {
  const r = await fetch(BASE + '/api/queue?all=1' + (v === null ? '' : `&v=${v}`), { headers: bearer });
  assert.equal(r.status, 200);
  return r.json();
}

test('D3 – prázdna otázka na frontu stojí práve jeden Redis príkaz', async () => {
  // rozbehneme sa: nech je čo čítať a nech poznáme verziu
  await posliObjednavku();
  let { v } = await frontaAgent(null);
  assert.equal(typeof v, 'number');

  const agentIdle = await cena(async () => {
    const o = await frontaAgent(v);
    assert.equal(o.nezmenene, true, 'server nespoznal, že sa nič nezmenilo');
    assert.deepEqual(o.orders, [], 'pri nezmenenej fronte sa nesmú posielať objednávky');
  });

  const { v: vn } = await frontaNastenka(null);
  const nastenkaIdle = await cena(async () => {
    const o = await frontaNastenka(vn);
    assert.equal(o.nezmenene, true);
  });

  console.log(`\n  prázdna otázka agenta:   ${agentIdle} príkaz(y)`);
  console.log(`  prázdna otázka nástenky: ${nastenkaIdle} príkaz(y)`);

  assert.equal(agentIdle, 1, 'prázdna otázka agenta musí stáť jeden príkaz');
  assert.equal(nastenkaIdle, 1, 'prázdna otázka nástenky musí stáť jeden príkaz');
});

test('D3 – nameraná mesačná spotreba sa zmestí do bezplatného Upstashu', async () => {
  // ---- namerané jednotkové ceny ----
  const { v: v0 } = await frontaAgent(null);
  const idle = await cena(() => frontaAgent(v0));

  const { v: vn0 } = await frontaNastenka(null);
  const idleNastenka = await cena(() => frontaNastenka(vn0));

  const plnyAgent = await cena(() => frontaAgent(null));
  const plnaNastenka = await cena(() => frontaNastenka(null));

  const objednavka = await cena(() => posliObjednavku());

  // označenie vytlačenej a vybavenej objednávky
  const { orders } = await frontaNastenka(null);
  const id = orders[0].id;
  const vytlacene = await cena(() => fetch(BASE + '/api/queue', {
    method: 'POST', headers: { 'content-type': 'application/json', ...bearer },
    body: JSON.stringify({ ids: [id] }),
  }));
  const vybavene = await cena(() => fetch(BASE + '/api/queue', {
    method: 'POST', headers: { 'content-type': 'application/json', ...bearer },
    body: JSON.stringify({ hotove: [id], stav: true }),
  }));

  // Ponuka: prvé zavolanie po vypršaní ide do Redisu, ďalšie do pamäte inštancie.
  // Merací server má cache zámerne krátky; do projekcie sa dosadí skutočná
  // hodnota z api/menu.js, aby test netrval päť minút.
  const menuStudene = await cena(async () => {
    await new Promise(r => setTimeout(r, CACHE_NA_MERANIE_MS + 200));
    await fetch(BASE + '/api/menu');
  });
  const menuTeple = await cena(() => fetch(BASE + '/api/menu'));

  // ---- projekcia na mesiac ----
  const oknoSekund = MODEL.otvorenychHodin * 3600;
  const otazokAgenta = Math.round(oknoSekund / MODEL.agentSekund);
  const otazokNastenky = Math.round(oknoSekund / MODEL.nastenkaSekund);

  // každá zmena prinúti oboch klientov spraviť raz plný dotaz
  const zmienDenne = MODEL.objednavokDenne * 3;      // prijatie + vytlačenie + vybavenie
  const menuMinutiaDenne = Math.min(
    MODEL.zobrazeniPonukyDenne,
    Math.ceil(oknoSekund / MODEL.menuCacheSekund),
  );

  const polozky = [
    ['prázdne otázky agenta', (otazokAgenta - zmienDenne) * idle],
    ['prázdne otázky nástenky', (otazokNastenky - zmienDenne) * idleNastenka],
    ['plné dotazy agenta po zmene', zmienDenne * plnyAgent],
    ['plné dotazy nástenky po zmene', zmienDenne * plnaNastenka],
    ['prijatie objednávky', MODEL.objednavokDenne * objednavka],
    ['označenie vytlačené', MODEL.objednavokDenne * vytlacene],
    ['označenie vybavené', MODEL.objednavokDenne * vybavene],
    ['ponuka (studený cache)', menuMinutiaDenne * menuStudene],
    ['ponuka (teplý cache)', Math.max(0, MODEL.zobrazeniPonukyDenne - menuMinutiaDenne) * menuTeple],
  ];

  const denne = polozky.reduce((s, [, n]) => s + n, 0);
  const mesacne = denne * MODEL.dniVMesiaci;

  console.log('\n  ── namerané jednotkové ceny (Redis príkazov) ──');
  console.log(`  prázdna otázka agenta        ${idle}`);
  console.log(`  prázdna otázka nástenky      ${idleNastenka}`);
  console.log(`  plný dotaz agenta            ${plnyAgent}`);
  console.log(`  plný dotaz nástenky          ${plnaNastenka}`);
  console.log(`  prijatie objednávky          ${objednavka}`);
  console.log(`  označenie vytlačené          ${vytlacene}`);
  console.log(`  označenie vybavené           ${vybavene}`);
  console.log(`  ponuka bez cache             ${menuStudene}`);
  console.log(`  ponuka z cache               ${menuTeple}`);
  console.log('\n  ── pesimistický deň ──');
  polozky.forEach(([n, v]) => console.log(`  ${n.padEnd(32)} ${String(v).padStart(7)}`));
  console.log(`  ${'SPOLU ZA DEŇ'.padEnd(32)} ${String(denne).padStart(7)}`);
  console.log(`  ${`SPOLU ZA ${MODEL.dniVMesiaci} DNÍ`.padEnd(32)} ${String(mesacne).padStart(7)}`);
  console.log(`  ${'z limitu Upstash Free'.padEnd(32)} ${(mesacne / STROP_MESACNE * 100).toFixed(1)} %\n`);

  assert.ok(menuTeple === 0, 'ponuka sa pri teplom cache nesmie pýtať Redisu');
  /* Pre porovnanie ešte bežný deň: menej objednávok, menej návštev a hlavne
     dlhé obdobia ticha, počas ktorých agent aj nástenka spomalia na pokojný
     interval. Toto je to, čo sa naozaj bude diať. */
  const bezny = (() => {
    const objednavok = 50;
    const zmien = objednavok * 3;
    const otazokA = Math.round(oknoSekund / 40);       // idlePollSeconds agenta
    const otazokN = Math.round(oknoSekund / 60);       // POLL_POKOJ_MS nástenky
    const menuMiss = Math.ceil(oknoSekund / MODEL.menuCacheSekund);
    return (
      Math.max(0, otazokA - zmien) * idle +
      Math.max(0, otazokN - zmien) * idleNastenka +
      zmien * plnyAgent + zmien * plnaNastenka +
      objednavok * (objednavka + vytlacene + vybavene) +
      menuMiss * menuStudene
    ) * MODEL.dniVMesiaci;
  })();
  console.log(`  ${'bežný mesiac (50 objednávok/deň)'.padEnd(32)} ${String(bezny).padStart(7)}  = ${(bezny / STROP_MESACNE * 100).toFixed(1)} %\n`);

  assert.ok(
    mesacne < STROP_MESACNE,
    `pesimistický mesiac spotrebuje ${mesacne} príkazov, limit je ${STROP_MESACNE}`,
  );
  /* Model vyššie je zámerne najhorší mysliteľný deň (150 objednávok, celých
     11,5 hodiny bez jedinej chvíle ticha, 3000 zobrazení ponuky). Preto stačí
     rezerva 15 % – nie 25 %, to by už znamenalo pesimizmus na druhú. Bežný
     mesiac vyššie ukazuje, kde sa prevádzka reálne pohybuje. */
  assert.ok(
    mesacne < STROP_MESACNE * 0.85,
    `spotreba ${mesacne} je bližšie než 15 % k limitu ${STROP_MESACNE} – zvýš intervaly`,
  );
  assert.ok(
    bezny < STROP_MESACNE * 0.5,
    `aj bežný mesiac (${bezny}) míňa vyše polovice limitu – niečo je zle`,
  );
});

test('D3 – nastavenia agenta, nástenky a cache sedia s modelom v tomto teste', () => {
  const fs = require('node:fs');
  const menuKod = fs.readFileSync(path.join(KOREN, 'api', 'menu.js'), 'utf8');
  const cache = /MENU_CACHE_MS\)?\s*\|\|\s*(\d+)\s*\*\s*60\s*\*\s*1000/.exec(menuKod);
  assert.ok(cache, 'nenašiel som predvolený MENU_CACHE_MS v api/menu.js');
  assert.equal(Number(cache[1]) * 60, MODEL.menuCacheSekund, 'api/menu.js a model testu sa rozišli');
  const cfg = JSON.parse(fs.readFileSync(path.join(KOREN, 'agent', 'config.example.json'), 'utf8'));
  assert.equal(cfg.pollSeconds, MODEL.agentSekund, 'config.example.json a model testu sa rozišli');
  assert.ok(cfg.idlePollSeconds >= cfg.pollSeconds);
  assert.ok(cfg.closedPollSeconds >= cfg.idlePollSeconds);

  const nastenka = fs.readFileSync(path.join(KOREN, 'public', 'admin-objednavky.js'), 'utf8');
  const rusno = Number(/POLL_RUSNO_MS = (\d+)/.exec(nastenka)[1]);
  const pokoj = Number(/POLL_POKOJ_MS = (\d+)/.exec(nastenka)[1]);
  assert.equal(rusno / 1000, MODEL.nastenkaSekund, 'nástenka a model testu sa rozišli');
  assert.ok(pokoj >= rusno);
});

/* ==================================================================== D2
   Regresia: cesta cez skutočný Redis
   ==================================================================== */

test('D2 – objednávka uložená do Redisu sa naozaj vráti vo fronte', async () => {
  /* Toto raz nefungovalo a nikto si to nevšimol: zoznam držal holé ID, ale
     MGET sa pýtal na holé ID namiesto kľúča s predponou, takže fronta bola
     navždy prázdna. Všetky ostatné testy bežali v pamäťovom režime, kde sa
     tento kód vôbec nevykoná. Odvtedy sa aspoň jeden test pozerá na Redis. */
  const prijata = await posliObjednavku();

  const agent = await frontaAgent(null);
  const mojaAgent = agent.orders.find(o => o.number === prijata.number);
  assert.ok(mojaAgent, 'tlačový agent by objednávku nikdy nevytlačil');
  assert.equal(mojaAgent.customer.name, 'Meraný Zákazník');
  assert.ok(Array.isArray(mojaAgent.items) && mojaAgent.items.length, 'objednávka prišla bez položiek');

  const nastenka = await frontaNastenka(null);
  assert.ok(nastenka.orders.some(o => o.number === prijata.number), 'nástenka objednávku nevidí');

  // a verzia fronty sa zmenou naozaj pohla, inak by sa nikto nedozvedel o novej objednávke
  const predtym = nastenka.v;
  await posliObjednavku();
  const potom = await frontaNastenka(predtym);
  assert.ok(!potom.nezmenene, 'nová objednávka nezvýšila verziu fronty');
  assert.ok(potom.v > predtym);
});
