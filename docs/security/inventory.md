# Vila 27 — bezpečnostná inventúra

Stav ku dňu **16. 9. 2026**, vetva `security-hardening`.
Tento dokument **nie je verejný** — priečinok `docs/` je mimo `public/` aj v `.vercelignore` (A3).

---

## 1. Súbory a čo sa z nich dostane na internet

Nasadzuje sa iba `public/` (výstupný priečinok Vercelu) a `api/` (serverless funkcie).
Všetko ostatné je interné.

| Cesta | Verejné? | Čo to je |
|---|---|---|
| `public/*.html` (10 strán) | ✅ | index, restauracia, jedalny-listok, ubytovanie, volny-cas, kontakt, objednavka, 404, cookies, ochrana-osobnych-udajov |
| `public/admin.html`, `admin-objednavky.html`, `admin-produkty.html` | ✅ (dostupné, `noindex`) | rozcestník, nástenka objednávok, správa ponuky |
| `public/site.css`, `admin*.css` | ✅ | štýly |
| `public/site.js`, `objednavka.js`, `cookies.js`, `kontakt.js`, `jedalny-listok.js`, `admin-karta.js`, `admin-objednavky.js`, `admin-produkty.js` | ✅ | skripty (žiadny inline, kvôli CSP) |
| `public/fonts/*` (10× woff2 + css) | ✅ | Source Sans 3, hosťované lokálne |
| `public/img/`, `public/vila27foto/` | ✅ | fotografie |
| `public/favicon.svg`, `logo.svg`, `logo-white.svg`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` | ✅ | ikony |
| `public/robots.txt`, `sitemap.xml`, `site.webmanifest`, `.well-known/security.txt` | ✅ | metasúbory |
| `api/*.js` bez podčiarkovníka (`orders`, `queue`, `menu`, `admin-auth`, `admin-menu`) | ✅ ako endpoint | serverless funkcie |
| `api/_store.js`, `_menu.js`, `_auth.js`, `_token.js`, `_sanitize.js`, `_hours.js`, `_ip.js` | ❌ | pomocné moduly (Vercel z nich funkcie nerobí) |
| `menu.json`, `config/otvaracie-hodiny.json` | ❌ | dáta čítané serverom |
| `agent/**` | ❌ | lokálny tlačový agent, beží v reštaurácii |
| `docs/**`, `tests/**`, `scripts/**` | ❌ | interné |
| `vercel.json`, `package.json`, `package-lock.json`, `dev-server.js`, `SECURITY-GOAL.md`, `README.md`, `.env*` | ❌ | konfigurácia a dokumentácia |

Overené testom `A3 – nič okrem verejnej stránky nie je dostupné` (29 ciest, všetky 404).

---

## 2. Endpointy

| Endpoint | Metóda | Autorizácia | Čo robí |
|---|---|---|---|
| `POST /api/orders` | POST | **verejné** | prijme objednávku; iné metódy → 405 + `Allow: POST` |
| `GET /api/queue` | GET | `Authorization: Bearer <PRINT_TOKEN>` | nevytlačené objednávky (agent) |
| `GET /api/queue?all=1` | GET | Bearer | posledných 60 objednávok + stavy (nástenka) |
| `POST /api/queue` | POST | Bearer | `{ids}` = vytlačené, `{hotove,stav}` = vybavené |
| `GET /api/menu` | GET | verejné | ponuka bez vypnutých položiek + stav otvorené/zatvorené |
| `POST /api/admin-auth` | POST | meno + heslo (`ADMIN_USER`/`ADMIN_PASS`) | prihlásenie do správy ponuky |
| `/api/admin-menu` | GET/POST | cookie sedenia (`vila27_sprava`) | úprava ponuky, pásiem a cenníka doplnkov |

Nikde nie je `Access-Control-Allow-Origin` — všetko je same-origin.

---

## 3. Premenné prostredia

| Premenná | Kde sa číta | Povinná? | Poznámka |
|---|---|---|---|
| `PRINT_TOKEN` | `api/_token.js` | **áno** | min. 32 znakov, inak sa odmietne všetko |
| `ADMIN_USER` | `api/_auth.js` | áno pre správu ponuky | bez nej sa neprihlási nikto |
| `ADMIN_PASS` | `api/_auth.js` | áno pre správu ponuky | min. 12 znakov |
| `KV_REST_API_URL` / `UPSTASH_REDIS_REST_URL` | `api/_store.js` | áno v produkcii | bez nej v produkcii → 503 |
| `KV_REST_API_TOKEN` / `UPSTASH_REDIS_REST_TOKEN` | `api/_store.js` | áno v produkcii | |
| `ORDER_TTL_DAYS` | `api/_store.js` | nie (30) | koľko dní žijú osobné údaje |
| `ORDER_IP_LIMIT`, `ORDER_IP_WINDOW_S` | `api/orders.js` | nie (5 / 600 s) | limit na IP |
| `ORDER_GLOBAL_LIMIT` | `api/orders.js` | nie (60/h) | celkový strop |
| `AUTH_FAIL_LIMIT`, `AUTH_FAIL_WINDOW_S` | `api/_token.js` | nie (10 / 900 s) | limit zlých pokusov |
| `REDIS_TIMEOUT_MS` | `api/_store.js` | nie (5000) | |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | `api/orders.js` | nie | bez nich je overenie vypnuté |
| `VILA27_HOURS_FILE` | `api/_hours.js` | nie | iná konfigurácia hodín (testy) |
| `VERCEL_ENV` | `api/_store.js` | nastavuje Vercel | `production` zakáže pamäťový režim |
| `VILA27_TOKEN` | `agent/print-agent.js` | odporúčané | token agenta z prostredia namiesto configu |

Vzory bez hodnôt: `.env.example`, `agent/config.example.json`.

---

## 4. Kadiaľ tečie vstup od používateľa

```
prehliadač (objednavka.js)
   │  JSON: mode, customer{name,phone,village,address,time,pay,note},
   │        items[{id,qty,extras,gf}], orderKey, trvanieMs, web
   ▼
POST /api/orders
   │  1. metóda (405) → Origin (403) → Content-Type (415) → veľkosť ≤10 kB (413)
   │  2. JSON.parse (400) → neznáme kľúče (400)
   │  3. pasca `web` + minimálny čas (400)
   │  4. limity na IP a celkovo (429)   [Redis: INCR + EXPIRE]
   │  5. otváracie hodiny (409)
   │  6. idempotencia podľa orderKey     [Redis: GET/SET]
   │  7. validácia mena, telefónu, obce, adresy
   │  8. ceny sa NAČÍTAJÚ Z MENU, nie z požiadavky
   │  9. každé textové pole cez ocisti() – riadiace znaky preč, mimo CP852 → „?“
   ▼
Redis (Upstash REST)
   vila27:objednavka:<uuid>   JSON objednávky   TTL 30 dní
   vila27:objednavky          zoznam ID          TTL 30 dní
   vila27:vytlacene           SET ID             TTL 30 dní
   vila27:hotove              SET ID             TTL 30 dní
   vila27:pocitadlo           číslo objednávky   TTL 365 dní
   vila27:limit:ip:<ip>       počítadlo          TTL 10 min
   vila27:limit:vsetky        počítadlo          TTL 1 h
   vila27:auth:zle:<ip>       počítadlo          TTL 15 min
   vila27:idem:<kluc>         odpoveď            TTL 15 min
   vila27:menu:*, vila27:doprava, vila27:ceny-doplnkov   (obsah, bez expirácie)
   vila27:sprava:sedenie:<id> prihlásenie        TTL 20 min
   ▼
GET /api/queue (Bearer)
   ├──► nástenka /admin-objednavky
   │       vykreslenie výhradne cez DOM API (admin-karta.js), žiadny innerHTML
   └──► tlačový agent
           receipt.js → escpos.js
             ocisti() ešte raz (obrana v druhej vrstve)
             CP852; znak mimo mapy → „?“
           transport.js
             tcp | windows | command | file — vždy execFile s poľom argumentov
           ▼
        termotlačiareň (alebo súbor v režime „file“)
```

Druhý vstup: **kontaktný formulár** na `/kontakt`. Nič neodosiela — `kontakt.js` len
vypíše poďakovanie a formulár vyčistí. Žiadne dáta neopúšťajú prehliadač.

Tretí vstup: **správa ponuky** `/admin-produkty` → `POST /api/admin-menu`. Vstup zadáva
majiteľ po prihlásení; text sa pri vykresľovaní escapuje funkciou `esc()`.

---

## 5. Požiadavky na tretie strany

| Odkiaľ | Kam | Kedy |
|---|---|---|
| ~~všetky stránky~~ | ~~`fonts.googleapis.com`, `fonts.gstatic.com`~~ | **odstránené** — písmo je v `public/fonts/` |
| `/kontakt` | `www.google.com/maps?...&output=embed` | **iba po súhlase** s kategóriou „Externý obsah“ |
| `api/orders.js` | `challenges.cloudflare.com` (Turnstile) | iba ak je nastavený `TURNSTILE_SECRET_KEY` (teraz nie) |
| `api/_store.js` | Upstash REST endpoint | pri každej objednávke |
| `agent/print-agent.js` | vlastné `/api/queue` cez HTTPS | podľa intervalu |

Obyčajné odkazy (Facebook, Instagram, Mapy Google, weby atrakcií na `/volny-cas`)
nesťahujú nič — sú to len `<a href>`.

---

## 6. Čo sa ukladá v prehliadači

| Kľúč | Úložisko | Kde | Trvanie | Kategória |
|---|---|---|---|---|
| `vila27_suhlas` | localStorage | verejné stránky | 12 mesiacov | nevyhnutné |
| `vila27_sprava_kod` | sessionStorage | `/admin-objednavky` | do zavretia karty | nevyhnutné |
| `vila27_admin_notif` | localStorage | `/admin-objednavky` | trvalé | nevyhnutné |
| `vila27_admin_filter` | localStorage | `/admin-objednavky` | trvalé | nevyhnutné |
| `vila27_rozpracovane` | sessionStorage | `/admin-produkty` | do zavretia karty | nevyhnutné |
| `vila27_sprava` | cookie `HttpOnly; Secure; SameSite=Strict` | `/admin-produkty` | 20 min nečinnosti | nevyhnutné |
| cookies Google Maps | cookie tretej strany | `/kontakt` | podľa Google | externý obsah |

Košík objednávky žije iba v pamäti otvorenej karty — nikde sa neukladá.

---

## 7. Čo bolo otvorené pred touto prácou

1. Ceny sa dali poslať z prehliadača — server ich preberal iba čiastočne.
2. Token `PRINT_TOKEN` sa dal poslať v URL (`?token=…`) aj v tele požiadavky.
3. Nástenka objednávok skladala HTML z reťazcov vrátane poznámky zákazníka.
4. Prístupový kód obsluhy ležal v `localStorage`.
5. `api/_auth.js` mal natvrdo zapísané meno aj heslo (`adminvila27`).
6. Žiadne limity, žiadna kontrola otváracích hodín, žiadna kontrola pôvodu.
7. Žiadna expirácia v Redise — objednávky s osobnými údajmi tam ostávali navždy.
8. Odpoveď `/api/orders` prezrádzala, či beží Redis (`storage`).
9. Riadiace znaky z poznámky išli rovno do tlačiarne.
10. Repozitár sa nasadzoval celý — `agent/`, `SECURITY-GOAL.md` aj `package.json` boli verejné.
11. Žiadne bezpečnostné hlavičky okrem `X-Robots-Tag` na `/admin`.
12. Písmo sa načítavalo z Google Fonts — bez súhlasu a bez možnosti CSP bez cudzích zdrojov.
13. Mapa Google sa načítavala hneď, bez súhlasu.
14. Žiadny súbor `.gitignore` — `agent/config.json` s tokenom mieril do gitu.

Všetky sú vyriešené v `REPORT.md`; čo ostalo na majiteľa, je tam pod **NEEDS MARTIN**.
