'use strict';
/**
 * Odoslanie surových ESC/POS bajtov do tlačiarne.
 * Štyri režimy – vyber v config.json podľa toho, ako máš tlačiareň zapojenú:
 *
 *  "tcp"      – tlačiareň v sieti (LAN kábel), port 9100.  ODPORÚČANÉ.
 *  "windows"  – USB tlačiareň nainštalovaná vo Windows a zdieľaná pod menom.
 *  "command"  – Linux/macOS: pošle bajty do `lp -d NAZOV -o raw`.
 *  "file"     – nič netlačí, uloží bajty do súboru (na ladenie).
 */
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

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

function printWindowsShare(data, { share }) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `vila27-${Date.now()}.bin`);
    fs.writeFileSync(tmp, data);
    // copy /b súbor \\localhost\NAZOV_ZDIELANIA  -> pošle bajty surovo
    const p = spawn('cmd', ['/c', 'copy', '/b', tmp, share], { windowsVerbatimArguments: false });
    let err = '';
    p.stderr.on('data', d => err += d);
    p.on('close', code => {
      fs.unlink(tmp, () => {});
      code === 0 ? resolve() : reject(new Error(`copy skončil s kódom ${code} ${err}`));
    });
    p.on('error', reject);
  });
}

function printCommand(data, { command }) {
  return new Promise((resolve, reject) => {
    const p = spawn('sh', ['-c', command]);
    let err = '';
    p.stderr.on('data', d => err += d);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`príkaz skončil s kódom ${code} ${err}`)));
    p.on('error', reject);
    p.stdin.end(data);
  });
}

async function print(data, cfg) {
  const mode = cfg.mode || 'tcp';
  if (mode === 'tcp') return printTcp(data, cfg.tcp || {});
  if (mode === 'windows') return printWindowsShare(data, cfg.windows || {});
  if (mode === 'command') return printCommand(data, cfg.command || {});
  if (mode === 'file') {
    const out = (cfg.file && cfg.file.path) || './posledny-blocek.bin';
    fs.writeFileSync(out, data);
    console.log(`   (režim "file" – bajty uložené do ${out}, netlačí sa)`);
    return;
  }
  throw new Error(`Neznámy režim tlačiarne: ${mode}`);
}

module.exports = { print };
