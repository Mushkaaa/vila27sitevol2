'use strict';
/**
 * Náhľad bločka v konzole – prečíta ESC/POS bajty a nakreslí, ako to bude
 * vyzerať na papieri. Šetrí papier pri ladení rozloženia.
 */
const { CP852 } = require('./escpos');

const REV = {};
for (const [ch, code] of Object.entries(CP852)) REV[code] = ch;

const ESC = 0x1b, GS = 0x1d;

function render(buf, width = 48) {
  let i = 0, align = 0, sizeW = 1, sizeH = 1, bold = false, inv = false;
  const lines = [];
  let cur = '';

  const push = () => {
    const w = Math.floor(width / sizeW);
    let txt = cur;
    if (sizeW > 1) txt = txt.split('').join(' ');          // naznačíme širšie písmo
    const visual = sizeW > 1 ? cur.length * sizeW : cur.length;
    let pad = 0;
    if (align === 1) pad = Math.max(0, Math.floor((width - visual) / 2));
    if (align === 2) pad = Math.max(0, width - visual);
    let line = ' '.repeat(pad) + txt;
    if (inv) line = line.replace(/^(\s*)(.*?)(\s*)$/, (_, a, b, c) => a + '\u2588' + b + '\u2588' + c);
    lines.push({ line, bold, big: sizeH > 1, over: visual > width });
    if (sizeH > 1) lines.push({ line: '', bold: false, big: false, over: false });
    cur = '';
  };

  while (i < buf.length) {
    const b = buf[i];
    if (b === ESC) {
      const c = buf[i + 1];
      if (c === 0x40) { i += 2; continue; }                          // reset
      if (c === 0x74) { i += 3; continue; }                          // codepage
      if (c === 0x61) { align = buf[i + 2]; i += 3; continue; }      // align
      if (c === 0x45) { bold = !!buf[i + 2]; i += 3; continue; }     // bold
      if (c === 0x2d) { i += 3; continue; }                          // underline
      if (c === 0x64) { const n = buf[i + 2]; for (let k = 0; k < n; k++) lines.push({ line: '' }); i += 3; continue; }
      if (c === 0x42) { i += 4; continue; }                          // beep
      if (c === 0x70) { i += 5; continue; }                          // drawer
      i += 2; continue;
    }
    if (b === GS) {
      const c = buf[i + 1];
      if (c === 0x21) { const n = buf[i + 2]; sizeW = (n >> 4) + 1; sizeH = (n & 0x0f) + 1; i += 3; continue; }
      if (c === 0x42) { inv = !!buf[i + 2]; i += 3; continue; }
      if (c === 0x56) { lines.push({ line: '', cut: true }); i += 4; continue; }
      i += 2; continue;
    }
    if (b === 0x0a) { push(); i++; continue; }
    cur += b < 128 ? String.fromCharCode(b) : (REV[b] || '?');
    i++;
  }
  if (cur) push();

  const top = '┌' + '─'.repeat(width + 2) + '┐';
  const bot = '└' + '─'.repeat(width + 2) + '┘';
  console.log('\n' + top);
  for (const l of lines) {
    if (l.cut) { console.log('├' + '─ ✂ '.repeat(Math.floor((width + 2) / 4)).padEnd(width + 2, '─') + '┤'); continue; }
    const text = (l.line || '').slice(0, width);
    const warn = l.over ? ' ⚠' : '';
    console.log('│ ' + text.padEnd(width) + '│' + warn);
  }
  console.log(bot);
  console.log('  ⚠ = riadok je širší ako papier a tlačiareň ho zalomí\n');
}

module.exports = { render };
