'use strict';
/**
 * npm run security:check
 *
 * 1. Prehľadá pracovný strom aj celú históriu gitu na tajomstvá (A1).
 * 2. Spustí všetky testy (node --test tests/) – tie si lokálny server
 *    spúšťajú samy; BASE_URL prepne HTTP testy na už bežiaci server.
 * 3. Vypíše tabuľku PASS/FAIL podľa položiek zo SECURITY-GOAL.md.
 *
 * Návratový kód je 0 iba vtedy, keď prejde úplne všetko.
 */
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const KOREN = path.join(__dirname, '..');
const C = { zel: '[32m', cerv: '[31m', sed: '[90m', tucne: '[1m', nic: '[0m' };
const farba = process.stdout.isTTY ? (k, s) => C[k] + s + C.nic : (k, s) => s;

/* ==================================================================== A1
   Hľadanie tajomstiev
   ==================================================================== */

/**
 * Reťazce, ktoré vyzerajú ako tajomstvo, ale ním nie sú. Každý má dôvod –
 * bez neho by tu nemal čo robiť.
 */
const ZNAME_NETAJOMSTVA = [
  { vzor: 'lokalny-vyvojovy-token-0123456789abcdef', preco: 'zástupný token pre dev-server.js, na ostro sa nepoužíva' },
  { vzor: 'testovaci-token-vila27-0123456789abcdef', preco: 'token používaný iba v tests/, nikdy nasadený' },
  { vzor: 'lokalne-heslo-na-vyvoj', preco: 'lokálne vývojové heslo pre /admin-produkty' },
  { vzor: 'testovacie-heslo-12', preco: 'heslo použité iba v testoch' },
  { vzor: '__VYGENERUJ_ASPON_32_ZNAKOV__', preco: 'zástupný text v .env.example' },
  { vzor: '__TOKEN_ROVNAKY_AKO_PRINT_TOKEN_NA_VERCELI__', preco: 'zástupný text v config.example.json' },
  { vzor: 'TU_DAJ_TAJNY_TOKEN_ROVNAKY_AKO_NA_VERCELI', preco: 'zástupný text v pôvodnom config.json' },
  { vzor: '__DOPLNIT__', preco: 'zástupný text' },
  { vzor: 'prikratky', preco: 'zámerne prikrátky reťazec v teste B1 – overuje, že ho server odmietne' },
  { vzor: 'falosny-token-len-pre-fake-upstash', preco: 'token pre tests/fake-upstash.js, ktorý beží na 127.0.0.1 – žiadna skutočná služba' },
  { vzor: 'falosny-token-pre-merani', preco: 'starší názov toho istého falošného tokenu, ostal v histórii gitu' },
];

const ZASTUPNE = /^(__|TU_DAJ|DOPLNIT|DOPLNIŤ|XXX|YOUR_|CHANGE|EXAMPLE|TEST|test)/;

/**
 * Tajomstvá, ktoré sú už len v HISTÓRII gitu, z kódu sú preč a v REPORT.md majú
 * pridelenú výmenu. Z pracovného stromu sú zmazané, prepisovať históriu sa
 * neoplatí – jediná skutočná náprava je výmena hodnoty. Hlásia sa ako
 * upozornenie, kontrolu nezhodia; keby sa taká hodnota vrátila do kódu,
 * zachytí ju sken pracovného stromu a ten padá.
 */
const NA_ROTACIU = [
  { vzor: 'adminvila27', preco: 'predvolené prihlasovacie údaje do správy ponuky – NEEDS MARTIN #1 v REPORT.md' },
];
const dovodRotacie = h => (NA_ROTACIU.find(z => h.includes(z.vzor)) || {}).preco || null;

const PRAVIDLA = [
  { id: 'súkromný kľúč', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { id: 'AWS prístupový kľúč', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { id: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { id: 'OpenAI/Anthropic kľúč', re: /\b(?:sk|sk-ant)-[A-Za-z0-9_-]{24,}\b/g },
  { id: 'Upstash REST URL s tokenom', re: /https:\/\/[a-z0-9-]+\.upstash\.io[^\s"']*[?&](?:_token|token)=[A-Za-z0-9=_-]{8,}/g },
  // hodnota priradená premennej, ktorá vyzerá ako tajomstvo
  { id: 'hodnota tajnej premennej', re: /\b(PRINT_TOKEN|ADMIN_PASS|KV_REST_API_TOKEN|UPSTASH_REDIS_REST_TOKEN|TURNSTILE_SECRET_KEY)\s*[:=]\s*["']?([^\s"',;]{8,})/g, skupina: 2 },
  // natvrdo zapísaná náhrada: process.env.ADMIN_PASS || 'heslo'
  { id: 'zapísaná náhrada za premennú', re: /\b(?:PRINT_TOKEN|ADMIN_PASS|ADMIN_USER|KV_REST_API_TOKEN|UPSTASH_REDIS_REST_TOKEN)\s*\|\|\s*['"]([^'"]{3,})['"]/g, skupina: 1 },
  // "token": "…" v konfiguráciách
  { id: 'token v konfigurácii', re: /"(?:token|password|heslo|secret)"\s*:\s*"([^"]{8,})"/g, skupina: 1 },
];

/** Maska – do výstupu sa nikdy nedostane celá nájdená hodnota. */
const maskuj = s => (s.length <= 6 ? '***' : s.slice(0, 3) + '…' + `[${s.length} znakov]`);

function jeZname(hodnota) {
  return ZNAME_NETAJOMSTVA.some(z => hodnota.includes(z.vzor) || z.vzor.includes(hodnota));
}

function prehladaj(text, kde, nalezy) {
  for (const p of PRAVIDLA) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(text)) !== null) {
      const hodnota = p.skupina ? m[p.skupina] : m[0];
      if (!hodnota) continue;
      if (jeZname(hodnota)) continue;
      if (ZASTUPNE.test(hodnota)) continue;
      if (/^(process\.env|import\.meta|\$\{|\$\()/.test(hodnota)) continue;   // len odkaz na premennú
      const vHistorii = kde === 'história gitu';
      nalezy.push({
        pravidlo: p.id, kde, ukazka: maskuj(hodnota),
        evidovane: vHistorii ? dovodRotacie(hodnota) : null,
      });
    }
  }
}

function skenTajomstiev() {
  const nalezy = [];

  // 1. pracovný strom (iba súbory, ktoré pozná git)
  const subory = execFileSync('git', ['ls-files'], { cwd: KOREN, encoding: 'utf8' })
    .split('\n').map(s => s.trim()).filter(Boolean);
  for (const f of subory) {
    if (/\.(jpg|jpeg|png|ico|woff2?|pdf|bin)$/i.test(f)) continue;
    const cesta = path.join(KOREN, f);
    if (!fs.existsSync(cesta)) continue;
    prehladaj(fs.readFileSync(cesta, 'utf8'), 'strom:' + f, nalezy);
  }

  // 2. celá história gitu
  const historia = spawnSync('git', ['log', '-p', '--all'], { cwd: KOREN, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (historia.status === 0) prehladaj(historia.stdout, 'história gitu', nalezy);
  else nalezy.push({ pravidlo: 'skenovanie histórie zlyhalo', kde: 'git log', ukazka: '—' });

  // 3. súbory, ktoré v gite nemajú čo robiť
  for (const zakazany of ['.env', 'agent/config.json', 'agent/vytlacene.json', 'agent/agent.log']) {
    if (subory.includes(zakazany)) nalezy.push({ pravidlo: 'tajný súbor je v gite', kde: zakazany, ukazka: '—' });
  }

  return nalezy;
}

/* ==================================================================== testy */

function spustiTesty() {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/*.test.js'], {
    cwd: KOREN, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  const vystup = (r.stdout || '') + (r.stderr || '');
  const riadky = vystup.split('\n');

  const testy = [];
  for (let i = 0; i < riadky.length; i++) {
    // TAP môže podtesty odsadiť, preto povolíme medzery na začiatku
    const m = /^\s*(not ok|ok) \d+ - (.+?)\s*$/.exec(riadky[i]);
    if (!m) continue;
    const meno = m[2].replace(/\s+#.*$/, '').trim();
    if (/\.test\.js$/.test(meno) || meno === 'tests' || !meno) continue;   // súhrn za celý súbor
    testy.push({ ok: m[1] === 'ok', meno });
  }

  // Poistka proti tichému podpočítaniu: TAP na konci hlási, koľko testov prešlo.
  // Keby sa tvar výstupu zmenil a parser prestal chytať, kontrola musí padnúť,
  // nie tváriť sa, že je všetko v poriadku.
  const hlasene = riadky
    .map(r => /^#\s*(pass|fail)\s+(\d+)/.exec(r.trim()))
    .filter(Boolean)
    .reduce((s, m) => s + Number(m[2]), 0);
  const nesedi = hlasene > 0 && hlasene !== testy.length
    ? `TAP hlási ${hlasene} testov, parser ich našiel ${testy.length}`
    : null;

  return { testy, vystup, kod: r.status, nesedi };
}

/** „G1/G3 – …“ → ['G1','G3'] */
function idZMena(meno) {
  const hlava = meno.split('–')[0].split('-')[0].trim();
  const ids = hlava.match(/\b[A-K]\d{0,2}\b|\bP[1-7]\b|\bE2E\b/g) || [];
  return ids.length ? ids : ['ostatné'];
}

const POPISY = {
  A1: 'Žiadne tajomstvá v kóde ani v histórii',
  A2: 'Tajné súbory v .gitignore, vzory s placeholdermi',
  A3: 'Verejné je iba public/ – nič iné nie je dostupné',
  A4: 'Odpovede neprezrádzajú vnútro servera',
  B1: 'Autorizácia zlyháva bezpečne (fail closed)',
  B2: 'Porovnanie tokenu v konštantnom čase',
  B3: 'Token iba v hlavičke Authorization: Bearer',
  B4: 'Chránené metódy + 405 s hlavičkou Allow',
  B5: 'Limit neúspešných prihlásení na IP',
  B6: 'Nástenka: sessionStorage, noindex, no-store',
  C1: 'Ceny počíta server z menu.json',
  C2: 'Prísna schéma objednávky',
  C3: 'Veľkosť tela, Content-Type, pokazený JSON',
  C4: 'Otváracie hodiny kontroluje server',
  C5: 'Čistenie textu pre tlačiareň (ESC/POS)',
  C6: 'Nástenka nerobí HTML z údajov zákazníka',
  C7: 'Anti-spam: pasca a minimálny čas',
  C8: 'Idempotencia objednávky',
  C9: 'Kontrola rovnakého pôvodu',
  D1: 'Limity na IP aj celkovo',
  D2: 'Pamäťový režim zakázaný v produkcii',
  D3: 'Dotazovanie sa zmestí do bezplatného Upstashu',
  D4: 'Timeouty a exponenciálne čakanie',
  E1: 'Expirácia osobných údajov (ORDER_TTL_DAYS)',
  E2: 'V logoch nie sú osobné údaje',
  E3: 'Stránka o ochrane osobných údajov',
  E4: 'Informácia pri odoslaní objednávky',
  F1: 'Pred súhlasom sa nenačíta nič cudzie',
  F2: 'Písmo hosťované lokálne',
  F3: 'Banner súhlasu bez tmavých vzorov',
  F4: 'Mapa Google až po súhlase',
  F5: 'Zásady cookies s tabuľkou',
  G1: 'CSP bez unsafe-inline a unsafe-eval',
  G2: 'HSTS',
  G3: 'Ostatné bezpečnostné hlavičky',
  G4: 'Cache-Control pre API, admin a statiku',
  H1: 'Všeobecné chybové hlášky bez detailov',
  H2: 'Žiadne interné poznámky v HTML',
  I1: 'package.json, lockfile, žiadne závislosti',
  J1: 'Agent: HTTPS, TLS, token v hlavičke',
  J2: 'Agent: žiadny shell, argumenty poľom',
  J3: 'Agent: preberanie zoznamu vytlačených',
  J4: 'Agent: čistenie textu a suchý režim',
  P1: 'Vlastná stránka 404 so stavom 404',
  P2: 'Stavy a hlášky na objednávkovej stránke',
  P3: 'Päta s prevádzkovateľom a právnymi odkazmi',
  P4: 'SEO a meta značky',
  P5: 'security.txt',
  P6: 'Prístupnosť',
  P7: 'Výkon: alt, lazy loading',
  E2E: 'Celá cesta objednávky až po bloček',
};

/** Položky, ktoré sa dajú overiť iba prečítaním – patria do REPORT.md. */
const BEZ_TESTU = {
  G5: 'Integrita cudzích skriptov – stránka žiadny cudzí skript nenačítava (overuje F1/F2)',
  K: 'Ďalšie nálezy z prieskumu – zoznam je v REPORT.md',
};

/* ==================================================================== výpis */

function tabulka(riadky) {
  const sirkaId = Math.max(4, ...riadky.map(r => r.id.length));
  const sirkaPopis = Math.max(6, ...riadky.map(r => r.popis.length));
  const ciara = '─'.repeat(sirkaId + sirkaPopis + 24);
  console.log(ciara);
  console.log(`${'ID'.padEnd(sirkaId)}  ${'Kontrola'.padEnd(sirkaPopis)}  ${'Stav'.padEnd(6)}  Testov`);
  console.log(ciara);
  for (const r of riadky) {
    const stav = r.ok ? farba('zel', 'PASS  ') : farba('cerv', 'FAIL  ');
    console.log(`${r.id.padEnd(sirkaId)}  ${r.popis.padEnd(sirkaPopis)}  ${stav}  ${r.pocet}`);
    if (!r.ok) r.zlyhane.forEach(m => console.log(`${' '.repeat(sirkaId + 2)}  ${farba('cerv', '↳ ' + m)}`));
  }
  console.log(ciara);
}

function main() {
  console.log(farba('tucne', '\n═══ Vila 27 – bezpečnostná kontrola ═══\n'));

  console.log('A1 – hľadám tajomstvá v pracovnom strome a v histórii gitu…');
  const vsetkyNalezy = skenTajomstiev();
  const nalezy = vsetkyNalezy.filter(n => !n.evidovane);
  const evidovane = vsetkyNalezy.filter(n => n.evidovane);

  if (nalezy.length) {
    console.log(farba('cerv', `  Nájdené ${nalezy.length} podozrivé miesta (hodnoty sú zámerne skryté):`));
    nalezy.forEach(n => console.log(`  • ${n.pravidlo} – ${n.kde} – ${n.ukazka}`));
  } else {
    console.log(farba('sed', '  V kóde nič. Nájdené boli iba názvy premenných a zástupné texty.'));
  }
  if (evidovane.length) {
    console.log(farba('sed', `  ${evidovane.length}× nález iba v histórii gitu, z kódu je preč a výmena je evidovaná:`));
    evidovane.forEach(n => console.log(farba('sed', `  • ${n.pravidlo} – ${n.ukazka} – ${n.evidovane}`)));
  }

  console.log('\nSpúšťam testy (node --test tests/*.test.js)…');
  const { testy, vystup, kod, nesedi } = spustiTesty();
  if (!testy.length) {
    console.log(farba('cerv', 'Testy sa nepodarilo spustiť:'));
    console.log(vystup.slice(-3000));
    process.exit(1);
  }
  if (nesedi) {
    console.log(farba('cerv', 'Výstup testov sa nepodarilo spoľahlivo prečítať: ' + nesedi));
    process.exit(1);
  }

  const skupiny = new Map();
  for (const t of testy) {
    for (const id of idZMena(t.meno)) {
      if (!skupiny.has(id)) skupiny.set(id, { id, pocet: 0, zlyhane: [] });
      const s = skupiny.get(id);
      s.pocet++;
      if (!t.ok) s.zlyhane.push(t.meno);
    }
  }
  skupiny.set('A1', { id: 'A1', pocet: 1, zlyhane: nalezy.length ? [`sken tajomstiev: ${nalezy.length} nálezov`] : [] });

  const poradie = id => {
    if (id === 'ostatné') return 'ZZ';
    if (id === 'E2E') return 'ZY';
    return id.replace(/(\d+)/, m => String(m).padStart(2, '0'));
  };
  const riadky = [...skupiny.values()]
    .sort((a, b) => poradie(a.id).localeCompare(poradie(b.id)))
    .map(s => ({ ...s, popis: POPISY[s.id] || '—', ok: s.zlyhane.length === 0 }));

  console.log('');
  tabulka(riadky);

  console.log('\nOverené prečítaním, nie testom (podrobnosti v docs/security/REPORT.md):');
  for (const [id, popis] of Object.entries(BEZ_TESTU)) console.log(`  ${id.padEnd(4)} ${popis}`);

  const zlych = riadky.filter(r => !r.ok);
  const spolu = testy.length;
  const padlo = testy.filter(t => !t.ok).length;

  console.log('');
  console.log(`Testov: ${spolu}   prešlo: ${spolu - padlo}   zlyhalo: ${padlo}   nálezov tajomstiev: ${nalezy.length}`);

  if (zlych.length || padlo || nalezy.length || kod !== 0) {
    if (padlo) console.log('\n' + vystup.split('\n').filter(r => /^not ok|^\s+(error|expected|actual|stack):/.test(r)).slice(0, 60).join('\n'));
    console.log(farba('cerv', farba('tucne', '\nVÝSLEDOK: FAIL\n')));
    process.exit(1);
  }
  console.log(farba('zel', farba('tucne', '\nVÝSLEDOK: PASS – všetky kontroly prešli.\n')));
  process.exit(0);
}

main();
