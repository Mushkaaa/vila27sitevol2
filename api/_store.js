'use strict';
/**
 * Úložisko objednávok.
 *
 * Ak sú nastavené premenné prostredia (Upstash Redis / Vercel KV), použije sa Redis.
 * Ak nie, funguje pamäťový režim – dobrý na rýchly test, ale objednávky sa
 * po chvíli stratia (serverless funkcie sa uspávajú). Na ostro nastav Upstash.
 */

const URL_ENV = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN_ENV = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const LIST = 'vila27:objednavky';
const PRINTED = 'vila27:vytlacene';
const DONE = 'vila27:hotove';
const COUNTER = 'vila27:pocitadlo';
const MAX = 200;

const hasRedis = Boolean(URL_ENV && TOKEN_ENV);

async function redis(...cmd) {
  const res = await fetch(URL_ENV, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN_ENV}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}: ${await res.text()}`);
  const { result } = await res.json();
  return result;
}

// ---- pamäťový fallback ----
const mem = globalThis.__vila27 || (globalThis.__vila27 = {
  list: [], printed: new Set(), done: new Set(), counter: 0, kv: new Map(), lists: new Map(),
});

/** Pamäťový kľúč s expiráciou – vracia null, keď už vypršal. */
function memGet(key) {
  const zaznam = mem.kv.get(key);
  if (!zaznam) return null;
  if (zaznam.do && zaznam.do < Date.now()) { mem.kv.delete(key); return null; }
  return zaznam.val;
}

const store = {
  hasRedis,

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
    return Number(await redis('INCR', COUNTER));
  },

  async save(order) {
    if (!hasRedis) {
      mem.list.unshift(order);
      mem.list = mem.list.slice(0, MAX);
      return;
    }
    await redis('LPUSH', LIST, JSON.stringify(order));
    await redis('LTRIM', LIST, 0, MAX - 1);
  },

  async list(limit = 60) {
    if (!hasRedis) return mem.list.slice(0, limit);
    const rows = (await redis('LRANGE', LIST, 0, limit - 1)) || [];
    return rows.map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
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
  },
};

module.exports = store;
