'use strict';
/**
 * Prihlásenie majiteľa do správy produktov.
 *
 * Meno a heslo sa berú z premenných prostredia ADMIN_USER / ADMIN_PASS.
 * Kým nie sú na Verceli nastavené, platia dočasné testovacie údaje nižšie.
 *
 * Prihlásenie žije v Redise s krátkou platnosťou a v prehliadači len ako
 * session cookie (httpOnly) – po zavretí karty je preč. Každé načítanie
 * stránky sedenie ruší, takže po obnovení stránky sa treba prihlásiť znova.
 */
const crypto = require('crypto');
const store = require('./_store');

const MENO = process.env.ADMIN_USER || 'adminvila27';
const HESLO = process.env.ADMIN_PASS || 'adminvila27';

const COOKIE = 'vila27_sprava';
const PLATNOST = 20 * 60;                 // 20 minút nečinnosti a sedenie padá
const KLUC = id => `vila27:sprava:sedenie:${id}`;

/** Porovnanie odolné voči meraniu času – cez odtlačok, aby neunikla ani dĺžka. */
function rovnake(a, b) {
  const x = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const y = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(x, y);
}

function overUdaje(meno, heslo) {
  const menoOk = rovnake(meno, MENO);
  const hesloOk = rovnake(heslo, HESLO);
  return menoOk && hesloOk;                // obe sa počítajú vždy, bez skratky
}

function precitajCookie(req, nazov) {
  const hlavicka = req.headers && req.headers.cookie;
  if (!hlavicka) return '';
  for (const kus of String(hlavicka).split(';')) {
    const i = kus.indexOf('=');
    if (i === -1) continue;
    if (kus.slice(0, i).trim() === nazov) return decodeURIComponent(kus.slice(i + 1).trim());
  }
  return '';
}

/** Session cookie – zámerne bez Expires aj Max-Age, aby zomrela so zatvorením karty. */
function nastavCookie(res, hodnota) {
  res.setHeader('Set-Cookie',
    `${COOKIE}=${encodeURIComponent(hodnota)}; Path=/; HttpOnly; Secure; SameSite=Strict`);
}

function zmazCookie(res) {
  res.setHeader('Set-Cookie',
    `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}

/** Nič z administrácie sa nesmie držať v cache ani v histórii prehliadača. */
function bezCache(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
}

async function zaloz(res, meno) {
  const id = crypto.randomBytes(32).toString('hex');
  await store.set(KLUC(id), JSON.stringify({ meno, vznik: new Date().toISOString() }), PLATNOST);
  nastavCookie(res, id);
  return id;
}

/** Vráti sedenie a predĺži jeho platnosť, alebo null. */
async function platne(req) {
  const id = precitajCookie(req, COOKIE);
  if (!id) return null;
  const raw = await store.get(KLUC(id));
  if (!raw) return null;
  await store.touch(KLUC(id), PLATNOST);       // aktivita posúva koniec platnosti
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { id, ...data };
  } catch { return null; }
}

async function zrus(req, res) {
  const id = precitajCookie(req, COOKIE);
  if (id) await store.del(KLUC(id));
  zmazCookie(res);
}

/**
 * Stráž pre zapisujúce volania: overí sedenie ešte predtým, než sa čokoľvek
 * urobí. Keď neplatí, sama odpovie 401 a vráti null.
 */
async function straz(req, res) {
  bezCache(res);
  const sedenie = await platne(req);
  if (!sedenie) {
    res.status(401).json({ ok: false, error: 'Prihlásenie vypršalo. Prihláste sa znova.' });
    return null;
  }
  return sedenie;
}

module.exports = { COOKIE, PLATNOST, overUdaje, zaloz, platne, zrus, straz, bezCache, zmazCookie };
