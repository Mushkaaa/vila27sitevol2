'use strict';
/**
 * Úložisko objednávok.
 *
 * Ak sú nastavené premenné prostredia (Upstash Redis / Vercel KV), použije sa Redis.
 * Ak nie, funguje pamäťový režim – dobrý na rýchly test na jednom počítači.
 *
 * POZOR (D2): pamäťový režim je povolený IBA v lokálnom vývoji. Na serverless
 * behu by ticho strácal objednávky, preto v produkcii radšej hlásime výpadok
 * a zákazníkovi ponúkneme telefón.
 *
 * Osobné údaje (E1): každá objednávka je vlastný kľúč s expiráciou
 * ORDER_TTL_DAYS (štandardne 30 dní). Zoznam je len register ID, ktoré po
 * expirácii dát ticho vypadnú. Kľúče s menu sú obsah, nie osobný údaj, tie
 * zámerne expiráciu nemajú.
 */

const URL_ENV = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN_ENV = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const LIST = 'vila27:objednavky';
const ORDER = id => `vila27:objednavka:${id}`;
const PRINTED = 'vila27:vytlacene';
const DONE = 'vila27:hotove';
const COUNTER = 'vila27:pocitadlo';
const MAX = 200;

const TIMEOUT_MS = Number(process.env.REDIS_TIMEOUT_MS) || 5000;      // D4
const ROK = 365 * 24 * 3600;

/** Koľko sekúnd žijú osobné údaje objednávky. */
function ttlSekundy() {
  const dni = Number(process.env.ORDER_TTL_DAYS);
  return Math.round((Number.isFinite(dni) && dni > 0 ? dni : 30) * 24 * 3600);
}

const hasRedis = Boolean(URL_ENV && TOKEN_ENV);
const jeProdukcia = process.env.VERCEL_ENV === 'production';

/** V produkcii bez Redisu nemá zmysel čokoľvek predstierať. */
const pamatovyRezimPovoleny = !jeProdukcia;

async function redis(...cmd) {
  const res = await fetch(URL_ENV, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN_ENV}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // Odpoveď Redisu sa nikam ďalej nevypisuje (A4/H1) – volajúci dostane len fakt zlyhania.
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  const { result } = await res.json();
  return result;
}

// ---- pamäťový fallback (iba lokálny vývoj) ----
const mem = globalThis.__vila27 || (globalThis.__vila27 = {
  orders: new Map(), index: [], printed: new Set(), done: new Set(),
  counter: 0, kv: new Map(), lists: new Map(),
});

function memGet(key) {
  const zaznam = mem.kv.get(key);
  if (!zaznam) return null;
  if (zaznam.do && zaznam.do < Date.now()) { mem.kv.delete(key); return null; }
  return zaznam.val;
}

/** Bez Redisu a v produkcii → výpadok, nie tiché ukladanie do vzduchu. */
function skontrolujDostupnost() {
  if (!hasRedis && !pamatovyRezimPovoleny) {
    const e = new Error('Úložisko objednávok nie je nastavené.');
    e.nedostupne = true;
    throw e;
  }
}

const store = {
  hasRedis,
  jeProdukcia,
  pamatovyRezimPovoleny,
  ttlSekundy,
  skontrolujDostupnost,

  // ---- všeobecné kľúče (menu, zálohy, prihlásenia majiteľa) ----

  async get(key) {
    if (!hasRedis) return memGet(key);
    return (await redis('GET', key)) ?? null;
  },

  /** ttl v sekundách; 0 = bez expirácie */
  async set(key, value, ttl = 0) {
    if (!hasRedis) {
      mem.kv.set(key, { val: value, do: ttl ? Date.now() + ttl * 1000 : 0 });
      return;
    }
    if (ttl) await redis('SET', key, value, 'EX', String(ttl));
    else await redis('SET', key, value);
  },

  async del(key) {
    if (!hasRedis) { mem.kv.delete(key); return; }
    await redis('DEL', key);
  },

  /** Predĺži životnosť kľúča – používa sa na osvieženie prihlásenia. */
  async touch(key, ttl) {
    if (!hasRedis) {
      const zaznam = mem.kv.get(key);
      if (zaznam) zaznam.do = Date.now() + ttl * 1000;
      return;
    }
    await redis('EXPIRE', key, String(ttl));
  },

  /**
   * Počítadlo v okne (D1, B5). Vráti, koľký pokus to je. Kľúč vždy expiruje,
   * takže sa nemá ako hromadiť.
   */
  async pocitadlo(key, oknoSekund) {
    if (!hasRedis) {
      const zaznam = mem.kv.get(key);
      const platny = zaznam && (!zaznam.do || zaznam.do >= Date.now());
      const n = (platny ? Number(zaznam.val) : 0) + 1;
      mem.kv.set(key, { val: String(n), do: (platny && zaznam.do) || Date.now() + oknoSekund * 1000 });
      return n;
    }
    const n = Number(await redis('INCR', key));
    if (n === 1) await redis('EXPIRE', key, String(oknoSekund));
    return n;
  },

  /** Zoznam s obmedzenou dĺžkou – register záloh menu. */
  async pushCapped(key, value, max) {
    if (!hasRedis) {
      const arr = mem.lists.get(key) || [];
      arr.unshift(value);
      mem.lists.set(key, arr.slice(0, max));
      return;
    }
    await redis('LPUSH', key, value);
    await redis('LTRIM', key, 0, max - 1);
  },

  async range(key, limit) {
    if (!hasRedis) return (mem.lists.get(key) || []).slice(0, limit);
    return (await redis('LRANGE', key, 0, limit - 1)) || [];
  },

  async nextNumber() {
    if (!hasRedis) return ++mem.counter;
    const n = Number(await redis('INCR', COUNTER));
    await redis('EXPIRE', COUNTER, String(ROK));      // žiadny kľúč bez expirácie (E1)
    return n;
  },

  async save(order) {
    skontrolujDostupnost();
    const ttl = ttlSekundy();
    if (!hasRedis) {
      mem.orders.set(order.id, { val: order, do: Date.now() + ttl * 1000 });
      mem.index.unshift(order.id);
      mem.index = mem.index.slice(0, MAX);
      return;
    }
    await redis('SET', ORDER(order.id), JSON.stringify(order), 'EX', String(ttl));
    await redis('LPUSH', LIST, order.id);
    await redis('LTRIM', LIST, 0, MAX - 1);
    await redis('EXPIRE', LIST, String(ttl));
  },

  async list(limit = 60) {
    skontrolujDostupnost();
    if (!hasRedis) {
      return mem.index
        .map(id => mem.orders.get(id))
        .filter(z => z && z.do > Date.now())
        .map(z => z.val)
        .slice(0, limit);
    }
    const ids = (await redis('LRANGE', LIST, 0, limit - 1)) || [];
    if (!ids.length) return [];
    const rows = (await redis('MGET', ...ids)) || [];
    return rows
      .map(r => { try { return r ? JSON.parse(r) : null; } catch { return null; } })
      .filter(Boolean);
  },

  async printedIds() {
    if (!hasRedis) return mem.printed;
    const ids = (await redis('SMEMBERS', PRINTED)) || [];
    return new Set(ids);
  },

  async markPrinted(ids) {
    if (!ids.length) return;
    if (!hasRedis) { ids.forEach(i => mem.printed.add(i)); return; }
    await redis('SADD', PRINTED, ...ids);
    await redis('EXPIRE', PRINTED, String(ttlSekundy()));
  },

  // ---- vybavené objednávky (označuje obsluha na nástenke) ----

  async doneIds() {
    if (!hasRedis) return mem.done;
    return new Set((await redis('SMEMBERS', DONE)) || []);
  },

  async markDone(ids, hotove) {
    if (!ids.length) return;
    if (!hasRedis) { ids.forEach(i => hotove ? mem.done.add(i) : mem.done.delete(i)); return; }
    await redis(hotove ? 'SADD' : 'SREM', DONE, ...ids);
    await redis('EXPIRE', DONE, String(ttlSekundy()));
  },
};

module.exports = store;
