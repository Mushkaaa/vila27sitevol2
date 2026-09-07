'use strict';
/**
 * Minimalistický ESC/POS builder pre 80mm tlačiarne (CK710-USE a spol.).
 * Bez závislostí – všetko je čistý Node.
 *
 * Šírka papiera 80mm = 48 znakov vo Font A (12x24), 64 znakov vo Font B.
 */

// ---- CP852 (Latin-2 DOS) mapa – pre slovenskú diakritiku ----
const CP852 = {
  'Ç':0x80,'ü':0x81,'é':0x82,'â':0x83,'ä':0x84,'ů':0x85,'ć':0x86,'ç':0x87,
  'ł':0x88,'ë':0x89,'Ő':0x8A,'ő':0x8B,'î':0x8C,'Ź':0x8D,'Ä':0x8E,'Ć':0x8F,
  'É':0x90,'Ĺ':0x91,'ĺ':0x92,'ô':0x93,'ö':0x94,'Ľ':0x95,'ľ':0x96,'Ś':0x97,
  'ś':0x98,'Ö':0x99,'Ü':0x9A,'Ť':0x9B,'ť':0x9C,'Ł':0x9D,'č':0x9F,
  'á':0xA0,'í':0xA1,'ó':0xA2,'ú':0xA3,'Ą':0xA4,'ą':0xA5,'Ž':0xA6,'ž':0xA7,
  'Ę':0xA8,'ę':0xA9,'ź':0xAB,'Č':0xAC,
  'Á':0xB5,'Â':0xB6,'Ě':0xB7,'Ż':0xBD,'ż':0xBE,
  'đ':0xD0,'Đ':0xD1,'Ď':0xD2,'Ë':0xD3,'ď':0xD4,'Ň':0xD5,'Í':0xD6,'Î':0xD7,
  'ě':0xD8,'Ů':0xDE,
  'Ó':0xE0,'ß':0xE1,'Ô':0xE2,'Ń':0xE3,'ń':0xE4,'ň':0xE5,'Š':0xE6,'š':0xE7,
  'Ŕ':0xE8,'Ú':0xE9,'ŕ':0xEA,'Ű':0xEB,'ý':0xEC,'Ý':0xED,'´':0xEF,
  'ű':0xFB,'Ř':0xFC,'ř':0xFD,
};

// ---- fallback bez diakritiky ----
const STRIP = {
  'á':'a','ä':'a','â':'a','à':'a','č':'c','ć':'c','ç':'c','ď':'d','é':'e','ě':'e','ë':'e','ę':'e',
  'í':'i','î':'i','ĺ':'l','ľ':'l','ł':'l','ň':'n','ń':'n','ó':'o','ô':'o','ö':'o','ő':'o',
  'ŕ':'r','ř':'r','š':'s','ś':'s','ť':'t','ú':'u','ů':'u','ü':'u','ű':'u','ý':'y','ž':'z','ź':'z','ż':'z',
  'Á':'A','Ä':'A','Â':'A','Č':'C','Ć':'C','Ď':'D','É':'E','Ě':'E','Ë':'E','Í':'I','Ĺ':'L','Ľ':'L',
  'Ň':'N','Ń':'N','Ó':'O','Ô':'O','Ö':'O','Ŕ':'R','Ř':'R','Š':'S','Ś':'S','Ť':'T','Ú':'U','Ů':'U',
  'Ü':'U','Ý':'Y','Ž':'Z','Ź':'Z','€':'EUR','–':'-','—':'-','„':'"','“':'"','”':'"','’':"'",'·':'-',
};

function stripDia(s) {
  return String(s).split('').map(ch => STRIP[ch] !== undefined ? STRIP[ch] : (ch.charCodeAt(0) < 128 ? ch : '?')).join('');
}

/** Zakóduje text do bajtov podľa zvolenej znakovej sady. */
function encodeText(str, charset) {
  if (charset === 'ascii') return Buffer.from(stripDia(str), 'latin1');
  // cp852
  const out = [];
  for (const ch of String(str)) {
    const code = ch.charCodeAt(0);
    if (code < 128) { out.push(code); continue; }
    if (CP852[ch] !== undefined) { out.push(CP852[ch]); continue; }
    // nepoznaný znak -> bez diakritiky
    const fb = stripDia(ch);
    for (const c of fb) out.push(c.charCodeAt(0) & 0xff);
  }
  return Buffer.from(out);
}

const ESC = 0x1b, GS = 0x1d;

class Receipt {
  /**
   * @param {{width?:number, charset?:'cp852'|'ascii'}} opts
   */
  constructor(opts = {}) {
    this.width = opts.width || 48;          // znakov na riadok (Font A, 80mm)
    this.charset = opts.charset || 'cp852';
    this.chunks = [];
    this.init();
  }

  raw(...bytes) { this.chunks.push(Buffer.from(bytes)); return this; }
  buf(b) { this.chunks.push(b); return this; }

  init() {
    this.raw(ESC, 0x40);                     // ESC @ – reset
    if (this.charset === 'cp852') {
      this.raw(ESC, 0x74, 18);               // ESC t 18 – code page PC852
    } else {
      this.raw(ESC, 0x74, 0);                // PC437
    }
    return this;
  }

  align(a) { return this.raw(ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0); }
  bold(on) { return this.raw(ESC, 0x45, on ? 1 : 0); }
  underline(on) { return this.raw(ESC, 0x2d, on ? 1 : 0); }
  invert(on) { return this.raw(GS, 0x42, on ? 1 : 0); }
  /** w/h: 1 = normál, 2 = dvojnásobok (max 8) */
  size(w = 1, h = 1) { return this.raw(GS, 0x21, ((w - 1) << 4) | (h - 1)); }

  text(s = '') { return this.buf(encodeText(s, this.charset)); }
  ln(s = '') { return this.text(s).raw(0x0a); }
  feed(n = 1) { return this.raw(ESC, 0x64, n); }
  hr(ch = '-') { return this.ln(ch.repeat(this.width)); }

  /** Riadok "vľavo .......... vpravo" so zalomením ľavej časti. */
  row(left, right = '', opts = {}) {
    const indent = opts.indent || 0;
    const hang = opts.hang != null ? opts.hang : indent;   // odsadenie zalomených riadkov
    const rightLen = visualLen(right);
    const leftWidth = this.width - rightLen - 1 - indent;
    const lines = wrap(String(left), leftWidth);
    lines.forEach((l, i) => {
      if (i === 0) {
        const gap = this.width - indent - visualLen(l) - rightLen;
        this.ln(' '.repeat(indent) + l + ' '.repeat(Math.max(1, gap)) + right);
      } else {
        this.ln(' '.repeat(hang) + l);
      }
    });
    return this;
  }

  /** Odstavec so zalomením na šírku papiera. */
  para(s, indent = 0) {
    wrap(String(s), this.width - indent).forEach(l => this.ln(' '.repeat(indent) + l));
    return this;
  }

  /** Pípnutie (nie každá tlačiareň podporuje). */
  beep(times = 2, ms = 3) { return this.raw(ESC, 0x42, times, ms); }

  /** Otvorenie pokladničnej zásuvky, ak je pripojená. */
  drawer(pin = 0) { return this.raw(ESC, 0x70, pin, 25, 250); }

  cut(partial = true) {
    this.feed(4);
    return this.raw(GS, 0x56, partial ? 0x42 : 0x41, 0x00);
  }

  build() { return Buffer.concat(this.chunks); }
}

function visualLen(s) { return String(s).length; }

/** Zalomí text na max. `w` znakov na riadok (láme na medzerách). */
function wrap(s, w) {
  if (w < 6) w = 6;
  const words = String(s).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (let word of words) {
    while (word.length > w) {                       // extrémne dlhé slovo
      if (cur) { lines.push(cur); cur = ''; }
      lines.push(word.slice(0, w));
      word = word.slice(w);
    }
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= w) cur += ' ' + word;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

module.exports = { Receipt, encodeText, stripDia, wrap, CP852 };
