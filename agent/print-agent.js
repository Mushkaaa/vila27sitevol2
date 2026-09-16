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

async function tick() {
  const { orders = [] } = await fetchJson(api('/api/queue'));
  if (!orders.length) return;

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
  const { orders = [] } = await fetchJson(api('/api/queue?all=1'));
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
  log(`Interval:  ${CFG.pollSeconds || 5}s. Toto okno nechaj otvorené.`);
  log('─────────────────────────────────────────');

  const zaklad = (CFG.pollSeconds || 5) * 1000;
  let failStreak = 0;
  for (;;) {
    let cakaj = zaklad;
    try {
      await tick();
      if (failStreak) { log('Spojenie so serverom obnovené.'); failStreak = 0; }
    } catch (e) {
      failStreak++;
      // D4 – pri výpadku sa interval zdvojnásobuje, aby agent server nebil
      cakaj = Math.min(zaklad * 2 ** Math.min(failStreak, 8), MAX_CAKANIE_MS);
      if (failStreak === 1 || failStreak % 10 === 0) {
        log(`! Server nedostupný (${e.message}), skúsim o ${Math.round(cakaj / 1000)}s`);
      }
    }
    await new Promise(r => setTimeout(r, cakaj));
  }
}

module.exports = { orez, nacitajStav, skontrolujKonfiguraciu };

if (require.main === module) main();
