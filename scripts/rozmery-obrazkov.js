'use strict';
/**
 * P7 – doplní do každého <img> skutočné width/height, aby stránka pri načítaní
 * neposkakovala (Cumulative Layout Shift). Rozmery sa čítajú priamo z hlavičiek
 * JPEG/PNG, bez akejkoľvek závislosti.
 *
 *   node scripts/rozmery-obrazkov.js          # doplní a prepíše HTML
 *   node scripts/rozmery-obrazkov.js --kontrola   # len nahlási, čo chýba
 */
const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', 'public');
const LEN_KONTROLA = process.argv.includes('--kontrola');

/** Rozmery z hlavičky PNG alebo JPEG. null = neviem prečítať. */
function rozmery(subor) {
  const b = fs.readFileSync(subor);
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) {          // PNG
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {             // JPEG
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      // SOF0–SOF15 okrem DHT(C4), JPG(C8) a DAC(CC) nesú rozmery
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

let doplnene = 0;
const chybajuce = [];

for (const subor of fs.readdirSync(PUB).filter(f => f.endsWith('.html'))) {
  const cesta = path.join(PUB, subor);
  let html = fs.readFileSync(cesta, 'utf8');
  const povodne = html;

  html = html.replace(/<img\b[^>]*>/g, znacka => {
    if (/\swidth=/.test(znacka)) return znacka;
    const src = (/\ssrc="([^"]+)"/.exec(znacka) || [])[1];
    if (!src || /^(https?:|data:)/.test(src)) return znacka;
    const obr = path.join(PUB, src);
    if (!fs.existsSync(obr)) { chybajuce.push(`${subor}: chýba súbor ${src}`); return znacka; }
    const r = rozmery(obr);
    if (!r) { chybajuce.push(`${subor}: neviem prečítať rozmery ${src}`); return znacka; }
    doplnene++;
    return znacka.replace(/\s*\/?>$/, ` width="${r.w}" height="${r.h}"$&`).replace(/>\s*width=/, ' width=');
  });

  if (html !== povodne && !LEN_KONTROLA) fs.writeFileSync(cesta, html);
}

if (chybajuce.length) chybajuce.forEach(c => console.error('! ' + c));
console.log(LEN_KONTROLA
  ? `Bez rozmerov: ${doplnene} obrázkov.`
  : `Doplnené rozmery do ${doplnene} obrázkov.`);
process.exit(chybajuce.length ? 1 : 0);
