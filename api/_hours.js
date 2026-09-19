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


/* ==================================================================== P1
   Predobjednávky – termíny na dnes a zajtra
   ==================================================================== */

const KROK_MINUT = 15;          // termíny po štvrťhodinách
const MIN_DOPREDU = 30;         // kuchyňa potrebuje aspoň pol hodinu
const DNI_DOPREDU = 1;          // dnes + zajtra, nič ďalej

const dvojciferne = n => String(n).padStart(2, '0');
const naHhmm = m => dvojciferne(Math.floor(m / 60)) + ':' + dvojciferne(m % 60);

/** Posun pásma v danom okamihu, v minútach (koľko je miestny čas pred UTC). */
function posunPasma(instant, pasmo) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: pasmo, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(instant).map(x => [x.type, x.value]),
  );
  const hod = p.hour === '24' ? 0 : Number(p.hour);
  const akoKebyUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hod, Number(p.minute), Number(p.second));
  return (akoKebyUtc - instant.getTime()) / 60000;
}

/**
 * Miestny dátum a čas → skutočný okamih.
 *
 * Dva prechody: prvý odhad urobíme, akoby miestny čas bol UTC, zistíme posun
 * pásma v tom okamihu a opravíme. Druhý prechod doladí prípad, keď oprava
 * prešla cez zmenu letného času.
 */
function naInstant(datum, hhmm, pasmo = PASMO) {
  const [Y, M, D] = datum.split('-').map(Number);
  const [h, m] = hhmm.split(':').map(Number);
  const naivne = Date.UTC(Y, M - 1, D, h, m);
  let t = naivne - posunPasma(new Date(naivne), pasmo) * 60000;
  t = naivne - posunPasma(new Date(t), pasmo) * 60000;
  return new Date(t);
}

/** '2026-09-17' + 1 → '2026-09-18' (obyčajná kalendárna aritmetika) */
function pridajDni(datum, dni) {
  const [Y, M, D] = datum.split('-').map(Number);
  const d = new Date(Date.UTC(Y, M - 1, D) + dni * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Deň v týždni 1..7 (pondelok..nedeľa) pre dátum 'YYYY-MM-DD'. */
function denVTyzdni(datum) {
  const [Y, M, D] = datum.split('-').map(Number);
  return ((new Date(Date.UTC(Y, M - 1, D)).getUTCDay() + 6) % 7) + 1;
}

const DNI_POPIS = ['dnes', 'zajtra'];

/**
 * Voľné termíny na predobjednávku. Iba dnes a zajtra, iba v otváracích
 * hodinách, najskôr o MIN_DOPREDU minút, po štvrťhodinách.
 *
 * Intervaly prechádzajúce polnoc sa preskočia – Vila 27 také nemá a správne
 * priradenie termínu k dňu by bolo zbytočne zamotané. Keby raz pribudli,
 * padne na to test nižšie.
 */
function terminy(kedy = new Date(), cfg = CFG) {
  const pasmo = cfg.casovePasmo || PASMO;
  const dnes = miestnyCas(kedy, pasmo).datum;
  const najskor = kedy.getTime() + MIN_DOPREDU * 60000;
  const von = [];

  for (let posun = 0; posun <= DNI_DOPREDU; posun++) {
    const datum = pridajDni(dnes, posun);
    if ((cfg.zatvorene || []).includes(datum)) continue;
    for (const [od, doo] of (cfg.tyzden && cfg.tyzden[String(denVTyzdni(datum))]) || []) {
      const a = naMinuty(od);
      const b = naMinuty(doo);
      if (b <= a) continue;                       // interval cez polnoc – nepodporujeme
      for (let m = Math.ceil(a / KROK_MINUT) * KROK_MINUT; m < b; m += KROK_MINUT) {
        const instant = naInstant(datum, naHhmm(m), pasmo);
        if (instant.getTime() < najskor) continue;
        von.push({
          iso: instant.toISOString(),
          datum,
          cas: naHhmm(m),
          den: DNI_POPIS[posun],
          popis: DNI_POPIS[posun] + ' o ' + naHhmm(m),
        });
      }
    }
  }
  return von;
}

/**
 * Overí termín, ktorý prišiel z prehliadača. Zámerne sa porovnáva proti
 * zoznamu z terminy() – žiadna druhá kópia pravidiel, ktorá by sa mohla
 * rozísť s tou prvou.
 * @returns {{ok:boolean, chyba?:string, termin?:object}}
 */
function overTermin(iso, kedy = new Date(), cfg = CFG) {
  if (typeof iso !== 'string' || !iso) return { ok: false, chyba: 'Vyberte, prosím, čas predobjednávky.' };
  const cas = new Date(iso);
  if (Number.isNaN(cas.getTime())) return { ok: false, chyba: 'Čas predobjednávky nie je platný.' };

  const moznosti = terminy(kedy, cfg);
  const najdeny = moznosti.find(t => t.iso === cas.toISOString());
  if (najdeny) return { ok: true, termin: najdeny };

  if (cas.getTime() < kedy.getTime() + MIN_DOPREDU * 60000) {
    return { ok: false, chyba: 'Predobjednávku prijímame najskôr ' + MIN_DOPREDU + ' minút vopred.' };
  }
  if (cas.getTime() > kedy.getTime() + (DNI_DOPREDU + 1) * 86400000) {
    return { ok: false, chyba: 'Predobjednať sa dá len na dnes alebo zajtra.' };
  }
  return { ok: false, chyba: 'V tomto čase nevaríme. Vyberte, prosím, iný termín.' };
}

/** Čitateľný popis termínu pre bloček a nástenku: „zajtra 18:30“. */
function popisTerminu(iso, kedy = new Date(), cfg = CFG) {
  const t = terminy(kedy, cfg).find(x => x.iso === iso);
  if (t) return t.popis;
  const pasmo = cfg.casovePasmo || PASMO;
  const m = miestnyCas(new Date(iso), pasmo);
  return m.datum + ' o ' + naHhmm(m.minuty);
}

const stav = (kedy = new Date()) => stavPre(CFG, kedy);
const otvorene = kedy => stav(kedy).otvorene;

module.exports = {
  stav, stavPre, otvorene, miestnyCas, vIntervale, naMinuty, PASMO, CFG,
  terminy, overTermin, popisTerminu, naInstant, pridajDni, denVTyzdni,
  KROK_MINUT, MIN_DOPREDU, DNI_DOPREDU,
};
