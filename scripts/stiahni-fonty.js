'use strict';
/**
 * Jednorazový vývojový nástroj: stiahne Source Sans 3 z Google Fonts a uloží
 * ho do public/fonts/ spolu s public/fonts/source-sans-3.css (F2).
 *
 * Vďaka tomu stránka nerobí ŽIADNU požiadavku na fonts.googleapis.com ani
 * fonts.gstatic.com – čo je zároveň podmienka, aby sa dala postaviť CSP bez
 * cudzích zdrojov (G1) a aby sa pred súhlasom neposielala IP návštevníka
 * tretej strane (F1/F2).
 *
 *   node scripts/stiahni-fonty.js
 *
 * Skript sa nespúšťa pri builde – výsledné súbory sú v gite.
 */
const fs = require('fs');
const path = require('path');

const RODINA = 'Source+Sans+3:wght@300;400;600;700;900';
const PODMNOZINY = ['latin', 'latin-ext'];          // slovenčina potrebuje obe
const CIEL = path.join(__dirname, '..', 'public', 'fonts');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function main() {
  fs.mkdirSync(CIEL, { recursive: true });

  const css = await (await fetch(
    `https://fonts.googleapis.com/css2?family=${RODINA}&display=swap`,
    { headers: { 'User-Agent': UA } },
  )).text();

  // CSS je poskladané z blokov „/* podmnožina */ @font-face { … }“
  const bloky = css.split('/*').slice(1).map(b => '/*' + b);
  const von = [];

  for (const blok of bloky) {
    const podmnozina = (/^\/\*\s*([a-z-]+)\s*\*\//.exec(blok) || [])[1];
    if (!PODMNOZINY.includes(podmnozina)) continue;

    const vaha = (/font-weight:\s*(\d+)/.exec(blok) || [])[1];
    const url = (/url\((https:[^)]+\.woff2)\)/.exec(blok) || [])[1];
    if (!vaha || !url) continue;

    const meno = `source-sans-3-${podmnozina}-${vaha}.woff2`;
    const data = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer());
    fs.writeFileSync(path.join(CIEL, meno), data);
    console.log(`${meno}  ${(data.length / 1024).toFixed(1)} kB`);

    von.push(blok
      .replace(/^\/\*[^*]*\*\/\s*/, '')
      .replace(/url\(https:[^)]+\.woff2\)/, `url("${meno}")`)
      .trim());
  }

  const hlavicka = [
    '/* Source Sans 3 — stiahnuté z Google Fonts skriptom scripts/stiahni-fonty.js.',
    ' * Licencia: SIL Open Font License 1.1 (https://openfontlicense.org/).',
    ' * Font je hosťovaný lokálne, stránka nevolá žiadny cudzí server (F2).',
    ' */',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(CIEL, 'source-sans-3.css'), hlavicka + von.join('\n\n') + '\n');
  console.log(`\nHotovo: ${von.length} rezov do ${path.relative(process.cwd(), CIEL)}`);
}

main().catch(e => { console.error('Fonty sa nepodarilo stiahnuť:', e.message); process.exit(1); });
