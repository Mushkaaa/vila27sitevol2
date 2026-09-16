'use strict';
/**
 * Odoslanie surových ESC/POS bajtov do tlačiarne.
 * Režim sa vyberá v config.json podľa toho, ako je tlačiareň zapojená:
 *
 *  "tcp"      – tlačiareň v sieti (LAN kábel), port 9100.
 *  "windows"  – USB tlačiareň nainštalovaná vo Windows a zdieľaná pod menom.
 *  "command"  – vlastný program, ktorému sa podhodí cesta k dočasnému súboru.
 *  "file"     – nič sa netlačí, bajty sa uložia do priečinka (test a ladenie).
 *
 * Bezpečnosť (J2): žiadny režim neskladá príkaz do reťazca pre shell.
 * Vždy sa volá execFile s poľom argumentov a cesta k dočasnému súboru má
 * pevný tvar `vila27-<16 hex>.bin` v systémovom temp priečinku – do príkazu
 * sa teda nikdy nedostane text z objednávky.
 *
 * Ladenie bez papiera: node test-print.js --nahlad
 */
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

/** Pevný tvar názvu – žiadny vstup zvonka sa doň nedostane. */
function docasnySubor() {
  return path.join(os.tmpdir(), `vila27-${crypto.randomBytes(8).toString('hex')}.bin`);
}

/** execFile bez shellu: argumenty sa odovzdávajú ako pole, nie ako príkazový riadok. */
function spusti(program, argumenty, timeout = 20000) {
  return new Promise((resolve, reject) => {
    execFile(program, argumenty, { shell: false, timeout, windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${program} zlyhal: ${err.message} ${String(stderr || '').slice(0, 200)}`));
      resolve(String(stdout || ''));
    });
  });
}

function printTcp(data, { host, port = 9100, timeout = 8000 }) {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    let done = false;
    const fail = err => { if (!done) { done = true; sock.destroy(); reject(err); } };
    sock.setTimeout(timeout, () => fail(new Error(`Tlačiareň ${host}:${port} neodpovedá (timeout)`)));
    sock.on('error', fail);
    sock.connect(port, host, () => {
      sock.write(data, () => {
        // krátka pauza, nech stihne prijať buffer, potom zavrieme
        setTimeout(() => { done = true; sock.end(); resolve(); }, 300);
      });
    });
  });
}

async function cezSubor(data, akcia) {
  const tmp = docasnySubor();
  fs.writeFileSync(tmp, data);
  try { await akcia(tmp); }
  finally { try { fs.unlinkSync(tmp); } catch { /* nevadí */ } }
}

async function printWindowsShare(data, { share }) {
  if (!share) throw new Error('Chýba názov zdieľania tlačiarne (printer.windows.share).');
  // `copy` je vstavaný príkaz cmd.exe, preto cmd /c – ale argumenty idú poľom,
  // nie zlepené do jedného reťazca, a obsahujú len našu cestu a názov z configu.
  await cezSubor(data, tmp => spusti(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'copy', '/b', tmp, share]));
}

async function printCommand(data, cfg) {
  const { program, args = [] } = cfg;
  if (!program) throw new Error('Chýba printer.command.program.');
  if (!Array.isArray(args)) throw new Error('printer.command.args musí byť pole.');
  // {file} v argumentoch sa nahradí cestou k dočasnému súboru
  await cezSubor(data, tmp => spusti(program, args.map(a => String(a).replace('{file}', tmp))));
}

/** Suchý beh: bloček sa uloží ako súbor, nič sa netlačí. */
async function printFile(data, cfg) {
  const dir = cfg.dir || path.join(__dirname, 'tlac');
  fs.mkdirSync(dir, { recursive: true });
  const meno = `blocek-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}.bin`;
  const cesta = path.join(dir, meno);
  fs.writeFileSync(cesta, data);
  return cesta;
}

async function print(data, cfg) {
  const mode = cfg.mode || 'tcp';
  if (mode === 'tcp') return printTcp(data, cfg.tcp || {});
  if (mode === 'windows') return printWindowsShare(data, cfg.windows || {});
  if (mode === 'command') return printCommand(data, cfg.command || {});
  if (mode === 'file') return printFile(data, cfg.file || {});
  throw new Error(`Neznámy režim tlačiarne: ${mode}`);
}

module.exports = { print, printFile, docasnySubor, spusti };
