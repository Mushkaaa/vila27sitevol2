'use strict';
/**
 * VILA 27 – lokálny tlačový agent
 * ---------------------------------
 * Beží na počítači v reštaurácii. Každých pár sekúnd sa opýta servera
 * (Vercel), či pribudla nová objednávka, a hneď ju vytlačí na termotlačiarni.
 *
 * Spustenie:   node print-agent.js
 * Test tlače:  node test-print.js
 * Znova blok:  node print-agent.js --reprint 12
 *
 * Vyžaduje Node.js 18 alebo novší (kvôli vstavanému fetch).
 *
 * Bezpečnosť:
 *  J1 – komunikuje iba cez HTTPS s platným certifikátom; token sa posiela
 *       hlavičkou Authorization: Bearer, nikdy v URL. Token sa berie
 *       z premennej VILA27_TOKEN alebo z config.json (ten nie je v gite).
 *  J3 – vytlacene.json sa preberá (7 dní) a pokazený súbor sa ticho obnoví.
 *  D4 – každé volanie má timeout a pri výpadku sa čaká exponenciálne dlhšie.
 */
const fs = require('fs');
const path = require('path');
const { buildReceipt } = require('./receipt');
const { print } = require('./transport');

const CFG_FILE = process.env.VILA27_AGENT_CONFIG || path.join(__dirname, 'config.json');
const CFG = fs.existsSync(CFG_FILE) ? JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')) : {};

// Token radšej z prostredia; config.json je záloha pre jednoduchú inštaláciu.
const TOKEN = process.env.VILA27_TOKEN || CFG.token || '';

const STATE_FILE = path.join(__dirname, 'vytlacene.json');
const LOG_FILE = path.join(__dirname, 'agent.log');

const DNI_HISTORIE = Number(CFG.keepPrintedDays) || 7;      // J3
const TIMEOUT_MS = Number(CFG.timeoutMs) || 10000;          // D4
const MAX_CAKANIE_MS = 5 * 60 * 1000;

/* ---- D3: koľko sa smie pýtať servera ----
   Bezplatný Upstash dáva 500 000 príkazov mesačne a delíme sa oň s nástenkou
   v kuchyni. Preto sa agent pýta troma spôsobmi:
     • otázka „zmenilo sa niečo?“ posiela naposledy videnú verziu fronty a
       server na ňu odpovie JEDNÝM Redis príkazom (predtým to boli tri),
     • keď je chvíľu ticho, interval sa predĺži,
     • mimo otváracích hodín sa pýta len raz za štvrťhodinu.
   Namerané čísla sú v docs/security/REPORT.md, časť D3, a stráži ich
   test tests/kvoty.test.js. */
const HODINY = CFG.hodiny || { od: '10:30', do: '22:00' };
const POLL_RUSNO = Number(CFG.pollSeconds) || 12;
const POLL_POKOJ = Number(CFG.idlePollSeconds) || 40;
const POLL_ZATVORENE = Number(CFG.closedPollSeconds) || 900;
const PRAZDNYCH_NA_POKOJ = 6;           // ~1 minúta ticha a spomalíme

const naMinuty = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };

/** Je teraz v otváracom okne podľa hodín počítača v reštaurácii? */
function vHodinach(teraz = new Date()) {
  if (CFG.pollAlways === true) return true;
  const m = teraz.getHours() * 60 + teraz.getMinutes();
  const a = naMinuty(HODINY.od), b = naMinuty(HODINY.do);
  return a <= b ? (m >= a && m < b) : (m >= a || m < b);
}

let prazdnychZasebou = 0;

/** Ako dlho čakať do ďalšej otázky. */
function dalsiInterval() {
  if (!vHodinach()) return POLL_ZATVORENE * 1000;
  return (prazdnychZasebou >= PRAZDNYCH_NA_POKOJ ? POLL_POKOJ : POLL_RUSNO) * 1000;
}

const ts = () => new Date().toLocaleString('sk-SK');
function log(msg) {
  const line = `[${ts()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch { /* log nesmie zhodiť tlač */ }
}

/* ---- kontrola nastavenia ešte pred prvým volaním ---- */
function skontrolujKonfiguraciu() {
  const chyby = [];
  if (!fs.existsSync(CFG_FILE)) {
    console.error(`Chýba ${CFG_FILE}. Skopíruj agent/config.example.json a doplň údaje.`);
    process.exit(1);
  }
  if (!TOKEN || TOKEN.length < 32 || /^__|TU_DAJ/.test(TOKEN)) {
    chyby.push('Token nie je vyplnený alebo je kratší ako 32 znakov (PRINT_TOKEN z Vercelu).');
  }
  let u;
  try { u = new URL(CFG.apiUrl); } catch { chyby.push('apiUrl nie je platná adresa.'); }
  // J1 – po nešifrovanom spojení by token letel po sieti v čitateľnej podobe
  if (u && u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
    chyby.push('apiUrl musí začínať https:// (výnimka je len localhost pri testovaní).');
  }
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    chyby.push('NODE_TLS_REJECT_UNAUTHORIZED=0 vypína overovanie certifikátu – agent takto bežať nebude.');
  }
  if (chyby.length) {
    chyby.forEach(c => console.error('CHYBA NASTAVENIA: ' + c));
    process.exit(1);
  }
}

/* ---- lokálna poistka proti dvojitej tlači (J3) ----
   Formát je { "<id>": "<ISO dátum>" }. Starší formát (obyčajné pole) sa
   načíta tiež, len bez dátumov – tie sa doplnia dneškom. Pokazený súbor
   sa zahodí a začne sa odznova, tlač nesmie kvôli nemu stáť. */
let printed = new Map();

function nacitajStav() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const dnes = new Date().toISOString();
    if (Array.isArray(raw)) return new Map(raw.map(id => [String(id), dnes]));
    if (raw && typeof raw === 'object') {
      return new Map(Object.entries(raw).filter(([, v]) => typeof v === 'string'));
    }
    throw new Error('neznámy tvar');
  } catch (e) {
    if (fs.existsSync(STATE_FILE)) {
      log(`! ${path.basename(STATE_FILE)} sa nepodarilo prečítať (${e.message}) – začínam s prázdnym zoznamom.`);
      try { fs.renameSync(STATE_FILE, STATE_FILE + '.pokazene'); } catch { /* nevadí */ }
    }
    return new Map();
  }
}

function orez(mapa) {
  const hranica = Date.now() - DNI_HISTORIE * 864e5;
  for (const [id, kedy] of mapa) {
    const t = Date.parse(kedy);
    if (!Number.isFinite(t) || t < hranica) mapa.delete(id);
  }
  return mapa;
}

function remember(id) {
  printed.set(String(id), new Date().toISOString());
  orez(printed);
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(Object.fromEntries(printed), null, 0)); }
  catch (e) { log(`! Stav sa nepodarilo uložiť: ${e.message}`); }
}

printed = orez(nacitajStav());

/* ---- komunikácia so serverom ---- */
const api = p => CFG.apiUrl.replace(/\/$/, '') + p;

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      // B3/J1 – token výhradne v hlavičke, nikdy v URL
      Authorization: `Bearer ${TOKEN}`,
      ...(opts.headers || {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),          // D4
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} – ${body.slice(0, 120)}`);
  try { return JSON.parse(body); } catch { throw new Error('Server nevrátil JSON'); }
}

async function printOrder(order, copyLabel = '') {
  const data = buildReceipt(order, CFG.receipt, copyLabel);
  return print(data, CFG.printer);
}

/* Posledná videná verzia fronty. null = spýtaj sa naplno.
   Po neúspešnej tlači ju zámerne zahodíme, inak by server odpovedal
   „nezmenené“ a objednávka by sa už nikdy nevytlačila. */
let poslednaVerzia = null;

async function tick() {
  const otazka = poslednaVerzia === null
    ? '/api/queue'
    : `/api/queue?v=${encodeURIComponent(poslednaVerzia)}`;
  const odpoved = await fetchJson(api(otazka));

  if (typeof odpoved.v === 'number') poslednaVerzia = odpoved.v;
  if (odpoved.nezmenene) { prazdnychZasebou++; return; }

  const { orders = [] } = odpoved;
  if (!orders.length) { prazdnychZasebou++; return; }
  prazdnychZasebou = 0;

  const done = [];
  for (const order of orders.sort((a, b) => (a.number || 0) - (b.number || 0))) {
    if (printed.has(order.id)) { done.push(order.id); continue; }
    try {
      const copies = CFG.receipt.copies || 1;
      const labels = CFG.receipt.copyLabels || [];
      for (let i = 0; i < copies; i++) await printOrder(order, labels[i] || '');
      remember(order.id);
      done.push(order.id);
      log(`✓ Vytlačená objednávka #${order.number}`);       // E2 – bez mena a telefónu v logu
    } catch (e) {
      // ďalší dotaz musí byť plný, inak by sa na nevytlačenú objednávku zabudlo
      poslednaVerzia = null;
      prazdnychZasebou = 0;
      log(`✗ CHYBA TLAČE objednávky #${order.number}: ${e.message} (skúsim znova o chvíľu)`);
    }
  }

  if (done.length) {
    try {
      await fetchJson(api('/api/queue'), { method: 'POST', body: JSON.stringify({ ids: done }) });
    } catch (e) {
      log(`! Nepodarilo sa potvrdiť serveru (${e.message}) – nevadí, lokálna poistka zabráni dvojitej tlači`);
    }
  }
}

async function reprint(number) {
  const { orders = [] } = await fetchJson(api('/api/queue?all=1'));   // dotlač sa vždy pýta naplno
  const order = orders.find(o => String(o.number) === String(number));
  if (!order) { log(`Objednávku #${number} som nenašiel.`); process.exit(1); }
  await printOrder(order, 'KÓPIA');
  log(`✓ Znovu vytlačená objednávka #${number}`);
  process.exit(0);
}

async function main() {
  skontrolujKonfiguraciu();

  const idx = process.argv.indexOf('--reprint');
  if (idx !== -1) return reprint(process.argv[idx + 1]);

  log('─────────────────────────────────────────');
  log('Tlačový agent Vila 27 spustený');
  log(`Server:    ${CFG.apiUrl}`);
  log(`Tlačiareň: ${CFG.printer.mode}`);
  log(`Interval:  ${POLL_RUSNO}s pri objednávkach, ${POLL_POKOJ}s v pokoji, ${POLL_ZATVORENE}s mimo ${HODINY.od}–${HODINY.do}.`);
  log('Toto okno nechaj otvorené.');
  log('─────────────────────────────────────────');

  let failStreak = 0;
  for (;;) {
    let cakaj = dalsiInterval();
    try {
      await tick();
      if (failStreak) { log('Spojenie so serverom obnovené.'); failStreak = 0; }
      cakaj = dalsiInterval();
    } catch (e) {
      failStreak++;
      poslednaVerzia = null;                 // po výpadku radšej plný dotaz
      // D4 – pri výpadku sa interval zdvojnásobuje, aby agent server nebil
      cakaj = Math.min(POLL_RUSNO * 1000 * 2 ** Math.min(failStreak, 8), MAX_CAKANIE_MS);
      if (failStreak === 1 || failStreak % 10 === 0) {
        log(`! Server nedostupný (${e.message}), skúsim o ${Math.round(cakaj / 1000)}s`);
      }
    }
    await new Promise(r => setTimeout(r, cakaj));
  }
}

module.exports = { orez, nacitajStav, skontrolujKonfiguraciu, vHodinach, dalsiInterval };

if (require.main === module) main();
