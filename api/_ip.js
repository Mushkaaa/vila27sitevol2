'use strict';
/**
 * IP klienta pre limity (D1, B5).
 *
 * Predpoklad: aplikácia beží za Vercel edge, ktorý hlavičku `x-forwarded-for`
 * prepisuje (klient ju nevie podvrhnúť). Berieme PRVÚ adresu zľava – tú tam
 * dopísal Vercel. Mimo Vercelu (lokálny beh) padneme na adresu soketu.
 * Keď sa hosting zmení, tento predpoklad treba znova overiť.
 */
function klientskaIp(req) {
  const h = req.headers || {};
  const xff = h['x-vercel-forwarded-for'] || h['x-real-ip'] || h['x-forwarded-for'] || '';
  const prva = String(xff).split(',')[0].trim();
  if (prva) return prva.slice(0, 64);
  const sock = (req.socket && req.socket.remoteAddress) || '';
  return String(sock).slice(0, 64) || 'neznama';
}

module.exports = { klientskaIp };
