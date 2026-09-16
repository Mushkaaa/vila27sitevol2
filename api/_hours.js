'use strict';
/**
 * Otváracie hodiny (C4) – rozhoduje server, nie prehliadač.
 *
 * Konfigurácia je v config/otvaracie-hodiny.json (týždenné intervaly + dni,
 * keď je zatvorené). Všetko sa počíta v pásme Europe/Bratislava, takže
 * prechod na letný/zimný čas ani pásmo servera nič nepokazí.
 */
// Štandardne konfigurácia z repozitára. VILA27_HOURS_FILE dovolí nasadiť iné
// hodiny bez zásahu do kódu (a testom podstrčiť pevne otvorený/zatvorený deň).
const CFG = process.env.VILA27_HOURS_FILE
  ? JSON.parse(require('fs').readFileSync(process.env.VILA27_HOURS_FILE, 'utf8'))
  : require('../config/otvaracie-hodiny.json');

const PASMO = CFG.casovePasmo || 'Europe/Bratislava';

const formaty = new Map();
function formatPre(pasmo) {
  if (!formaty.has(pasmo)) {
    formaty.set(pasmo, new Intl.DateTimeFormat('en-GB', {
      timeZone: pasmo, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short',
    }));
  }
  return formaty.get(pasmo);
}

const DNI = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Dátum → { datum:'2026-09-16', den:1..7 (po..ne), minuty: od polnoci } */
function miestnyCas(kedy = new Date(), pasmo = PASMO) {
  const p = Object.fromEntries(formatPre(pasmo).formatToParts(kedy).map(x => [x.type, x.value]));
  const hod = p.hour === '24' ? 0 : Number(p.hour);       // niektoré ICU vracajú 24
  return {
    datum: `${p.year}-${p.month}-${p.day}`,
    den: DNI[p.weekday] || 1,
    minuty: hod * 60 + Number(p.minute),
  };
}

const naMinuty = hhmm => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};

/** Je `minuty` vnútri intervalu? Interval, ktorý prechádza polnoc, sa rozdelí. */
function vIntervale(minuty, [od, doo]) {
  const a = naMinuty(od), b = naMinuty(doo);
  return a <= b ? (minuty >= a && minuty < b) : (minuty >= a || minuty < b);
}

const DNI_SK = ['', 'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota', 'nedeľa'];

/**
 * Čistá verzia – berie konfiguráciu ako parameter, aby sa dala testovať.
 * @returns {{otvorene:boolean, dovod:string, sprava:string, dnes:string[]}}
 */
function stavPre(cfg, kedy = new Date()) {
  const t = miestnyCas(kedy, cfg.casovePasmo || PASMO);
  const CFG = cfg;
  const dnes = (CFG.tyzden && CFG.tyzden[String(t.den)]) || [];
  const popisDnes = dnes.map(([a, b]) => `${a} – ${b}`);

  if ((CFG.zatvorene || []).includes(t.datum)) {
    return {
      otvorene: false, dovod: 'zatvorene-den', dnes: popisDnes,
      sprava: 'Dnes máme zatvorené. Objednávky opäť prijímame v najbližší otvorený deň.',
    };
  }
  if (!dnes.length) {
    return {
      otvorene: false, dovod: 'zatvoreny-den', dnes: popisDnes,
      sprava: `V ${DNI_SK[t.den]} objednávky neprijímame.`,
    };
  }
  if (dnes.some(i => vIntervale(t.minuty, i))) {
    return { otvorene: true, dovod: 'otvorene', dnes: popisDnes, sprava: '' };
  }
  return {
    otvorene: false, dovod: 'mimo-hodin', dnes: popisDnes,
    sprava: `Objednávky prijímame ${popisDnes.join(', ')}. Mimo tohto času nám, prosím, zavolajte.`,
  };
}

const stav = (kedy = new Date()) => stavPre(CFG, kedy);
const otvorene = kedy => stav(kedy).otvorene;

module.exports = { stav, stavPre, otvorene, miestnyCas, vIntervale, naMinuty, PASMO, CFG };
