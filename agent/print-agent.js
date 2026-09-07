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
 */
const fs = require('fs');
const path = require('path');
const { buildReceipt } = require('./receipt');
const { print } = require('./transport');

const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const STATE_FILE = path.join(__dirname, 'vytlacene.json');
const LOG_FILE = path.join(__dirname, 'agent.log');

const ts = () => new Date().toLocaleString('sk-SK');
function log(msg) {
  const line = `[${ts()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

// ---- lokálna poistka proti dvojitej tlači ----
let printed = new Set();
try { printed = new Set(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))); } catch {}
function remember(id) {
  printed.add(id);
  const arr = [...printed].slice(-500);          // držíme posledných 500
  printed = new Set(arr);
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(arr)); } catch {}
}

const api = p => CFG.apiUrl.replace(/\/$/, '') + p;

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} – ${body.slice(0, 200)}`);
  try { return JSON.parse(body); } catch { throw new Error('Server nevrátil JSON: ' + body.slice(0, 200)); }
}

async function printOrder(order, copyLabel = '') {
  const data = buildReceipt(order, CFG.receipt, copyLabel);
  await print(data, CFG.printer);
}

async function tick() {
  const { orders = [] } = await fetchJson(api(`/api/queue?token=${encodeURIComponent(CFG.token)}`));
  if (!orders.length) return;

  const done = [];
  for (const order of orders.sort((a, b) => (a.number || 0) - (b.number || 0))) {
    if (printed.has(order.id)) { done.push(order.id); continue; }
    try {
      const copies = CFG.receipt.copies || 1;
      const labels = CFG.receipt.copyLabels || [];
      for (let i = 0; i < copies; i++) {
        await printOrder(order, labels[i] || '');
      }
      remember(order.id);
      done.push(order.id);
      log(`✓ Vytlačená objednávka #${order.number} – ${order.customer?.name || ''} – ${order.total} EUR`);
    } catch (e) {
      log(`✗ CHYBA TLAČE objednávky #${order.number}: ${e.message} (skúsim znova o chvíľu)`);
    }
  }

  if (done.length) {
    try {
      await fetchJson(api('/api/queue'), {
        method: 'POST',
        body: JSON.stringify({ token: CFG.token, ids: done }),
      });
    } catch (e) {
      log(`! Nepodarilo sa potvrdiť serveru (${e.message}) – nevadí, lokálna poistka zabráni dvojitej tlači`);
    }
  }
}

async function reprint(number) {
  const { orders = [] } = await fetchJson(api(`/api/queue?token=${encodeURIComponent(CFG.token)}&all=1`));
  const order = orders.find(o => String(o.number) === String(number));
  if (!order) { log(`Objednávku #${number} som nenašiel.`); process.exit(1); }
  await printOrder(order, 'KÓPIA');
  log(`✓ Znovu vytlačená objednávka #${number}`);
  process.exit(0);
}

async function main() {
  const idx = process.argv.indexOf('--reprint');
  if (idx !== -1) return reprint(process.argv[idx + 1]);

  log('─────────────────────────────────────────');
  log(`Tlačový agent Vila 27 spustený`);
  log(`Server:    ${CFG.apiUrl}`);
  log(`Tlačiareň: ${CFG.printer.mode}${CFG.printer.mode === 'tcp' ? ' → ' + CFG.printer.tcp.host + ':' + CFG.printer.tcp.port : ''}`);
  log(`Interval:  ${CFG.pollSeconds}s. Toto okno nechaj otvorené.`);
  log('─────────────────────────────────────────');

  let failStreak = 0;
  for (;;) {
    try {
      await tick();
      if (failStreak) { log('Spojenie so serverom obnovené.'); failStreak = 0; }
    } catch (e) {
      failStreak++;
      if (failStreak === 1 || failStreak % 20 === 0) log(`! Server nedostupný (${e.message})`);
    }
    await new Promise(r => setTimeout(r, (CFG.pollSeconds || 5) * 1000));
  }
}

main();
