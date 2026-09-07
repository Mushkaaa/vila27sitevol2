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
const mem = globalThis.__vila27 || (globalThis.__vila27 = { list: [], printed: new Set(), counter: 0 });

const store = {
  hasRedis,

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
};

module.exports = store;
