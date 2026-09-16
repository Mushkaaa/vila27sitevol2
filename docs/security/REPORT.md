# Vila 27 — správa o bezpečnostnom prehliadnutí a doladení

**Vetva:** `security-hardening` · **Dátum:** 16. 9. 2026 · **Nenasadené na produkciu.**
Tento dokument **nie je verejne dostupný** (`docs/` je mimo `public/` aj v `.vercelignore`).

Podklady: [`inventory.md`](inventory.md) (obhliadka) a [`research.md`](research.md) (prieskum 2025–2026).

---

## 1. Ako to dopadlo

`npm run security:check` — **82 automatických kontrol, všetky prešli, návratový kód 0.**
Sken tajomstiev prešiel pracovný strom aj celú históriu gitu: **žiadny skutočný token
tam nikdy nebol**, iba názvy premenných a zástupné texty.

Z pôvodných 14 otvorených vecí (zoznam v [`inventory.md`, časť 7](inventory.md)) je
**13 opravených**; jedna — Vercel Hobby verzus komerčné použitie — je rozhodnutie
majiteľa. K tomu **23 položiek NEEDS MARTIN**: 7 sa týka tajomstiev a premenných
vo Verceli, 12 sú rozhodnutia a úkony, 4 patria právnikovi. Navyše je v repozitári
15 viditeľných `[DOPLNIŤ]` miest, ktoré treba vyplniť skutočnými údajmi.

---

## 2. Tabuľka: položka → stav → dôkaz

Legenda: **Opravené** = zmenil sa kód · **Už v poriadku** = bolo správne aj predtým ·
**NEEDS MARTIN** = potrebuje rozhodnutie, údaj alebo úkon majiteľa.

### A. Tajomstvá a čo server prezradí

| ID | Stav | Dôkaz |
|---|---|---|
| A1 | **Opravené** | Sken pracovného stromu aj `git log -p --all`: [`scripts/security-check.js:57-140`](../../scripts/security-check.js). Skutočný token nebol nikdy commitnutý. Odstránené natvrdo zapísané údaje `adminvila27` v [`api/_auth.js:15-24`](../../api/_auth.js). Rotácia → **NEEDS MARTIN #1**. |
| A2 | **Opravené** | Nový [`.gitignore`](../../.gitignore) (`.env*`, `agent/config.json`, `agent/vytlacene.json`, `*.log`), `agent/config.json` odstránený z gitu (`git rm --cached`). Vzory: [`.env.example`](../../.env.example), [`agent/config.example.json`](../../agent/config.example.json). Test `A2 – .gitignore zakrýva tokeny…`. |
| A3 | **Opravené** | Všetko verejné presunuté do [`public/`](../../public), zvyšok zakrytý cez [`.vercelignore`](../../.vercelignore). Test `A3 – nič okrem verejnej stránky nie je dostupné` overuje 29 ciest vrátane `/.env`, `/.git/config`, `/agent/**`, `/docs/**`, `/tests/**`, `/scripts/**`, `/SECURITY-GOAL.md`, `/package.json`, `/vercel.json`, `/api/_store`, `/vytlacene.json`. |
| A4 | **Opravené** | Pole `storage` z odpovede odstránené ([`api/orders.js:313`](../../api/orders.js) – odpoveď obsahuje len číslo, sumy a položky). Chyby Redisu sa nevypisujú ([`api/_store.js:50`](../../api/_store.js): `throw new Error('Redis ' + res.status)`). Testy `C1 – platná objednávka…` a `H1/A4 – žiadna odpoveď neprezradí…`. |

### B. Prihlasovanie (fronta + /admin)

| ID | Stav | Dôkaz |
|---|---|---|
| B1 | **Opravené** | [`api/_token.js:28-32`](../../api/_token.js): `tokenNastaveny()` vyžaduje reťazec ≥ 32 znakov, inak 503 a nič neprejde. [`api/_auth.js:20-23`](../../api/_auth.js): bez `ADMIN_USER`/`ADMIN_PASS` (≥ 12 znakov) sa neprihlási nikto. Testy `B1 – bez PRINT_TOKEN…`, `B1 – správa ponuky nemá zapísané prihlasovacie údaje`. |
| B2 | **Opravené** | [`api/_token.js:21-26`](../../api/_token.js): `crypto.timingSafeEqual` nad dvoma 32-bajtovými SHA-256 odtlačkami, takže neunikne ani dĺžka. Test `B1/B2 – správny token prejde, nesprávny ani iná dĺžka nie`. |
| B3 | **Opravené** | [`api/_token.js:34-38`](../../api/_token.js) číta iba `Authorization: Bearer`. Nástenka [`public/admin-objednavky.js:10`](../../public/admin-objednavky.js) aj agent [`agent/print-agent.js:152`](../../agent/print-agent.js) posielajú hlavičku. Testy `B3 – …token v URL vráti 401` a `B3 – token sa číta iba z hlavičky…`. |
| B4 | **Opravené** | `/api/orders` len POST, inak 405 + `Allow: POST` ([`api/orders.js:164-167`](../../api/orders.js)); `/api/queue` overuje token pri každej metóde, inak 405 + `Allow: GET, POST` ([`api/queue.js:19-25`](../../api/queue.js)). Verejné vypisovanie objednávok neexistuje. Testy `B4 – …405 s Allow` (2×). |
| B5 | **Opravené** | [`api/_token.js:57-87`](../../api/_token.js): 10 zlých pokusov / 15 min na IP → 429 + `Retry-After`. Počíta sa iba neúspech, takže agent si limit nemíňa. Test `B5 – opakované zlé pokusy o token z jednej IP skončia na 429`. |
| B6 | **Opravené** | Kód v `sessionStorage` ([`public/admin-objednavky.js:8-10`](../../public/admin-objednavky.js)), prihlasovacia obrazovka, tlačidlo *Odhlásiť*, `noindex` v HTML aj `X-Robots-Tag`, `Cache-Control: no-store` ([`vercel.json`](../../vercel.json)). Bez kódu sa nezobrazia žiadne dáta. Test `G4/B6 – /admin sa neindexuje a nekešuje`. |

### C. Vstup objednávky a obchodná logika

| ID | Stav | Dôkaz |
|---|---|---|
| C1 | **Opravené** | [`api/orders.js:77-124`](../../api/orders.js) `prepocitaj()` berie ceny výhradne z `menu.json` / Redisu. Cenové polia z prehliadača sa prijmú, ale ignorujú. Testy `C1 – cena sa ráta z menu…`, `C1 – doplnok sa ocení podľa menu…`, `C1 – platná objednávka prejde a súčet ráta server, aj keď klient pošle price 0.01`. |
| C2 | **Opravené** | Známe `id`, `qty` celé číslo 1–20, max 30 riadkov, dĺžky 80/40/160/400, tvar telefónu, odmietnutie neznámych kľúčov, `trim` a `normalize('NFC')` ([`api/orders.js:38-57`, `77-124`, `262-277`](../../api/orders.js), [`api/_sanitize.js`](../../api/_sanitize.js)). Testy `C2 …` (6×). |
| C3 | **Opravené** | Telo ≤ 10 kB → 413, `application/json` povinné → 415, pokazený JSON → 400 so všeobecnou hláškou ([`api/orders.js:179-208`](../../api/orders.js)). Testy `C3 …` (3×). |
| C4 | **Opravené** | [`api/_hours.js`](../../api/_hours.js) + [`config/otvaracie-hodiny.json`](../../config/otvaracie-hodiny.json), pásmo `Europe/Bratislava`, týždenné intervaly aj dni zatvorenia. Front-end ukáže stav z `/api/menu` ([`public/objednavka.js`](../../public/objednavka.js), pás `#stavPas`). Testy `C4 …` (6×). Skutočné hodiny → **NEEDS MARTIN #8, #9**. |
| C5 | **Opravené** | [`api/_sanitize.js`](../../api/_sanitize.js) na serveri a [`agent/escpos.js:44-53`](../../agent/escpos.js) v agente. `ESC p` sa vytlačí ako text „pú“, `GS V` ako „V“. Testy `C5 …` (5×) a E2E kontrola počtu príkazov rezu v bajtoch. |
| C6 | **Opravené** | Nové [`public/admin-karta.js`](../../public/admin-karta.js) skladá kartu výhradne cez `createElement` / `textContent`. Testy `C6 – XSS v mene a poznámke skončí ako text` (payload `<img src=x onerror=alert(1)>`) a `C6 – zdrojový kód nástenky nepoužíva innerHTML`. |
| C7 | **Opravené** | Skryté pole `web` + minimálny čas 3 s ([`api/orders.js:26`, `215-220`](../../api/orders.js), [`public/objednavka.html`](../../public/objednavka.html)). Turnstile je pripravený, ale bez kľúčov vypnutý ([`api/orders.js:127-142`](../../api/orders.js)). Testy `C7 …` (2×). Zapnutie Turnstile → **NEEDS MARTIN #14**. |
| C8 | **Opravené** | `orderKey` z prehliadača, server drží odpoveď 15 minút a duplicitu vráti bez uloženia ([`api/orders.js:234-243`](../../api/orders.js)); tlačidlo sa počas odosielania vypína. Test `C8 – rovnaký orderKey nevyrobí druhú objednávku`. |
| C9 | **Opravené** | Kontrola `Origin` proti `Host` ([`api/orders.js:169-178`](../../api/orders.js)). Nikde nie je `Access-Control-Allow-Origin`. Testy `C9 – cudzí Origin dostane 403`, `C9 – vlastný Origin prejde` a kontrola vo `vercel.json`. |

### D. Limity, dostupnosť a náklady

| ID | Stav | Dôkaz |
|---|---|---|
| D1 | **Opravené** | 5 objednávok / 10 min na IP a 60 / hod celkovo → 429 s priateľskou slovenskou hláškou a `Retry-After` ([`api/orders.js:28-31`, `225-240`](../../api/orders.js)). IP z hlavičky, ktorú prepisuje Vercel, predpoklad zapísaný v [`api/_ip.js`](../../api/_ip.js). Testy `D1 – šiesta objednávka…`, `D1 – celkový strop…`, `D1 – počítadlo limitov…`. |
| D2 | **Opravené** | [`api/_store.js:36-41`, `74-81`](../../api/_store.js): pri `VERCEL_ENV=production` bez Redisu sa vyhodí chyba a `/api/orders` vráti 503 s textom *„Objednávky sú dočasne nedostupné, zavolajte nám, prosím, na +421 914 271 271.“* Pamäťový režim ostáva len lokálne. Test `D2 – pamäťový režim je v produkcii zakázaný`. |
| D3 | **Opravené** (čísla nižšie) | [`agent/print-agent.js:39-68`](../../agent/print-agent.js): mimo otváracích hodín 300 s, po minúte ticha 15 s, pri objednávkach 5 s. Prepočet v časti 4. |
| D4 | **Opravené** | `AbortSignal.timeout` na Redise ([`api/_store.js:48`](../../api/_store.js)), na Turnstile ([`api/orders.js:135`](../../api/orders.js)) aj v agente ([`agent/print-agent.js:156`](../../agent/print-agent.js)); agent pri výpadku zdvojnásobuje čakanie až na 5 minút. Test `D4 – každé volanie von má timeout`. |

### E. Osobné údaje

| ID | Stav | Dôkaz |
|---|---|---|
| E1 | **Opravené** | Každá objednávka je vlastný kľúč s `EX` podľa `ORDER_TTL_DAYS` (30 dní), rovnako zoznam aj množiny vytlačených a hotových; počítadlo čísel má 365 dní ([`api/_store.js:30-35`, `158-172`, `190-215`](../../api/_store.js)). Žiadny kľúč s osobnými údajmi nezostáva bez expirácie. Test `E1 – objednávky sa ukladajú s expiráciou…`. Nastavenie premennej → **NEEDS MARTIN #4**. |
| E2 | **Opravené** | Do logu ide len číslo objednávky, počet položiek a maskovaný telefón ([`api/orders.js:145`, `317`](../../api/orders.js)); agent loguje len číslo ([`agent/print-agent.js:182`](../../agent/print-agent.js)). Test `E2 – v logoch nekončia celé objednávky ani plné telefónne čísla`. |
| E3 | **Opravené** | [`public/ochrana-osobnych-udajov.html`](../../public/ochrana-osobnych-udajov.html) — prevádzkovateľ, zoznam údajov, účely a právne základy, 30-dňová lehota (zhodná s E1), príjemcovia (Vercel, Upstash, Google), práva a dozorný orgán. Test `E3 – stránka o ochrane údajov obsahuje všetko podľa čl. 13 GDPR`. Právna kontrola → **NEEDS MARTIN #20**. |
| E4 | **Opravené** | Krátka informácia a odkaz priamo nad tlačidlom *Odoslať objednávku* ([`public/objednavka.html`](../../public/objednavka.html), `.suhlas-note`); žiadne predzaškrtnuté políčko. Test `E4 – objednávkový formulár informuje o údajoch…`. |

### F. Cookies a súhlas

| ID | Stav | Dôkaz |
|---|---|---|
| F1 | **Opravené** | Úplný zoznam v [`inventory.md`, časť 5 a 6](inventory.md). Test `F1 – verejné stránky nenačítajú nič cudzie pred súhlasom` kontroluje `src`/`link href` na `/`, `/kontakt` a `/objednavka`. |
| F2 | **Opravené** | Source Sans 3 v [`public/fonts/`](../../public/fonts) (10 rezov, latin + latin-ext, 468 kB), stiahnuté [`scripts/stiahni-fonty.js`](../../scripts/stiahni-fonty.js). Test `F2 – žiadna stránka nevolá Google Fonts`. |
| F3 | **Opravené** | [`public/cookies.js`](../../public/cookies.js): tri tlačidlá s rovnakou triedou `ck-btn`, kategórie Nevyhnutné / Externý obsah / Analytické, nič predzaškrtnuté, súhlas s verziou a časovou značkou, platnosť 12 mesiacov, pasca na fokus, `role="dialog"`, Escape, rešpekt k `prefers-reduced-motion`, pruh dole neblokuje čítanie. Odkaz *Nastavenia cookies* je v päte každej verejnej stránky. Testy `F3 …` (2×). |
| F4 | **Opravené** | [`public/kontakt.html`](../../public/kontakt.html): miesto mapy je zástupka s tlačidlom *Načítať mapu Google* a odkazom *Otvoriť v Mapách Google*. Test `F4 – mapa Google je na stránke Kontakt až po súhlase`. |
| F5 | **Opravené** | [`public/cookies.html`](../../public/cookies.html) — tabuľka názov / typ / poskytovateľ / účel / trvanie / kategória, plus zoznam interných kľúčov `/admin`. Test `F5 – zásady cookies majú tabuľku…`. |

### G. Hlavičky

| ID | Stav | Dôkaz |
|---|---|---|
| G1 | **Opravené** | CSP vo [`vercel.json`](../../vercel.json) presne podľa zadania, bez `unsafe-inline` a `unsafe-eval`. Aby to bolo možné, všetky inline `<script>`, `<style>` a `style="…"` sú v súboroch. Testy `G1 – v HTML nie je inline skript…`, `G1/G3 – bezpečnostné hlavičky…` (2×). |
| G2 | **Opravené** | `Strict-Transport-Security: max-age=63072000; includeSubDomains`, **bez** `preload`. Test `G2/G3 – vercel.json nastavuje všetky bezpečnostné hlavičky`. Rozhodnutie o preload → **NEEDS MARTIN #12**. |
| G3 | **Opravené** | `nosniff`, `strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `COOP: same-origin`, `Permissions-Policy` (camera, microphone, geolocation, payment, usb) + `X-Permitted-Cross-Domain-Policies: none`. Rovnaké testy ako G2. |
| G4 | **Opravené** | `no-store` na `/api/*` a `/admin*`, rok na `/fonts/`, `/img/`, `/vila27foto/`, hodina na ostatnú statiku. Testy `G4 …` (3×). |
| G5 | **Už v poriadku** | Stránka nenačítava žiadny cudzí skript, takže nie je k čomu pridať SRI. Overuje to test `F1 – verejné stránky nenačítajú nič cudzie` spolu s `F2`. |

### H. Chyby a únik informácií

| ID | Stav | Dôkaz |
|---|---|---|
| H1 | **Opravené** | Všetky odpovede sú všeobecné slovenské vety; detaily iba do `console.error` bez osobných údajov a bez stacku ([`api/orders.js:320-327`](../../api/orders.js), [`api/queue.js:71-74`](../../api/queue.js), [`api/menu.js`](../../api/menu.js)). Test `H1/A4 – žiadna odpoveď neprezradí stack trace ani vnútro úložiska` (6 rôznych chybových ciest). |
| H2 | **Opravené** | V HTML nezostali komentáre s TODO, heslami ani ladiacimi poznámkami; ladiaci výpis prihlasovacích údajov z `dev-server.js` nahradený odkazom na premenné prostredia. Test `H2 – v HTML nezostali interné poznámky ani TODO`. |

### I. Závislosti

| ID | Stav | Dôkaz |
|---|---|---|
| I1 | **Opravené** | Nový [`package.json`](../../package.json) (žiadne `dependencies` ani `devDependencies`) a commitnutý [`package-lock.json`](../../package-lock.json). `npm audit` → *found 0 vulnerabilities*. Agent nemá závislosti tiež. Test `I1 – package.json a lockfile existujú a projekt nemá behové závislosti`. Halucinovaný balík nemá kde vzniknúť. |

### J. Tlačový agent

| ID | Stav | Dôkaz |
|---|---|---|
| J1 | **Opravené** | [`agent/print-agent.js:78-100`](../../agent/print-agent.js): agent sa nespustí pri `http://` (okrem localhost) ani pri `NODE_TLS_REJECT_UNAUTHORIZED=0`; token z `VILA27_TOKEN` alebo z `config.json` (mimo gitu), posielaný ako Bearer. Test `J1 – agent odmietne http:// aj vypnuté overovanie certifikátu`. |
| J2 | **Opravené** | [`agent/transport.js`](../../agent/transport.js): všetko cez `execFile` s `shell: false` a poľom argumentov; dočasný súbor má pevný tvar `vila27-<16 hex>.bin`. Testy `J2 – režim command odovzdáva argumenty poľom` (skúša argument `a b & echo hacked > …` a overuje, že sa nevykonal) a `J2 – zdrojový kód agenta nepúšťa nič cez shell`. |
| J3 | **Opravené** | `vytlacene.json` je mapa `id → dátum`, preberá sa na 7 dní; pokazený súbor sa odloží ako `.pokazene` a začne sa načisto ([`agent/print-agent.js:102-142`](../../agent/print-agent.js)). Test `J3 – zoznam vytlačených sa preberá a pokazený súbor prežije`. |
| J4 | **Opravené** | Čistenie z C5 je aj v [`agent/escpos.js`](../../agent/escpos.js); pribudol režim `file` (suchý beh) a `command`. Testy `J4 – režim file zapíše bloček na disk` a E2E. |

### K. Ďalšie nálezy

| ID | Stav | Dôkaz |
|---|---|---|
| K1 — celý repozitár bol verejný | **Opravené** | Viď A3. |
| K2 — interval agenta vs. bezplatné kvóty | **Opravené** | Viď D3 a časť 4. |
| K3 — Vercel Hobby a komerčné použitie | **NEEDS MARTIN #13** | Hobby plán je určený pre nekomerčné projekty; reštaurácia prijímajúca objednávky komerčná je. |
| K4 — zdvojená objednávka pri dvojkliku | **Opravené** | Viď C8. |
| K5 — žiadne upozornenie pri zlyhaní (OWASP A09) | **Prijaté riziko** | Server loguje, nástenka aj agent hlásia výpadok obsluhe na obrazovke. Automatické upozornenie (e-mail, SMS) je nad rámec tejto veľkosti prevádzky; keby pribudlo, patrí k **NEEDS MARTIN #15**. |
| K6 — inline skripty a štýly bránili CSP | **Opravené** | Viď G1. |
| K7 — SQL injection, SSRF, nahrávanie súborov, webhooky, hashovanie hesiel | **Netýka sa** | Projekt nemá SQL, nesťahuje adresy od používateľa, neprijíma súbory, nespracúva platby ani neukladá heslá. Zdôvodnenie v [`research.md`](research.md). |

### Doladenie (P)

| ID | Stav | Dôkaz |
|---|---|---|
| P1 | **Opravené** | [`public/404.html`](../../public/404.html) — logo, hlavička, päta, `noindex`, odkazy na Domov / Jedálny lístok / Objednávka / Kontakt. Test `P1 – neznáma adresa vráti skutočný stav 404 a vlastnú slovenskú stránku` overuje **HTTP 404**, nie mäkkú 200. |
| P2 | **Opravené** | Pás `#stavPas` a hláška `#formChyba` ([`public/objednavka.html`](../../public/objednavka.html)); obsluha stavov 409 (zatvorené), 429, 503, 413, výpadku siete aj potvrdenia so zhrnutím objednávky ([`public/objednavka.js`](../../public/objednavka.js)). Test `P2 – objednávková stránka má miesto na stavy a hlášky`. |
| P3 | **Opravené** | Päta s prevádzkovateľom a odkazmi *Ochrana osobných údajov*, *Zásady cookies*, *Nastavenia cookies* na všetkých 10 verejných stránkach. Testy `P3 …`, `F3 – odkaz „Nastavenia cookies“ je v päte každej verejnej stránky`. |
| P4 | **Opravené** | `lang="sk"`, unikátny `<title>` a popis, Open Graph, canonical, favicon + apple-touch-icon + `site.webmanifest`, `robots.txt` (zakazuje `/admin` a `/api/`), `sitemap.xml`, `cleanUrls`. Testy `P4 – meta popis a canonical sú unikátne…`, `P4/P5 – robots.txt, sitemap.xml a security.txt…`. Doména → **NEEDS MARTIN #11**. |
| P5 | **Opravené** | [`public/.well-known/security.txt`](../../public/.well-known/security.txt) s `Contact`, `Expires: 2027-09-16` a `Canonical`. Test overuje aj to, že dátum vypršania je v budúcnosti. Kontaktný e-mail → **NEEDS MARTIN #17**. |
| P6 | **Opravené** | Menovka pri každom poli (pribudla aj na prihlasovacom poli nástenky), `autocomplete`/`inputmode`, `alt` pri každom obrázku, viditeľný `:focus-visible` s obrysom 3 px, preskočenie na obsah, žiadna pevná šírka nad 320 px. Testy `P6 …` (2×). Kontrast → **NEEDS MARTIN #19**. |
| P7 | **Opravené** | Každý obrázok má `width`/`height` z hlavičky súboru ([`scripts/rozmery-obrazkov.js`](../../scripts/rozmery-obrazkov.js), 23 obrázkov), `loading="lazy"` všade pod ohybom, žiadna cudzia požiadavka blokujúca vykreslenie. Test `P7 – obrázky majú alt, rozmery a tie pod ohybom sa načítavajú lenivo`. Zmenšenie fotiek → **NEEDS MARTIN #18**. |

---

## 3. Výsledok `npm run security:check`

```
A1 – hľadám tajomstvá v pracovnom strome a v histórii gitu…
  Nič. Nájdené boli iba názvy premenných a zástupné texty.

Testov: 82   prešlo: 82   zlyhalo: 0   nálezov tajomstiev: 0
VÝSLEDOK: PASS – všetky kontroly prešli.
```

Rozpis podľa položiek je v tabuľke, ktorú príkaz vypisuje (A1–A4, B1–B6, C1–C9,
D1–D4, E1–E4, F1–F5, G1–G4, H1, H2, I1, J1–J4, P1–P7, E2E).
Mimo automatických testov ostávajú **D3** (prepočet nižšie), **G5** (niet cudzieho
skriptu) a **K** (zoznam vyššie).

---

## 4. D3 — koľko si agent smie dovoliť

Zmerané kvóty ([Vercel](https://vercel.com/docs/functions/limitations),
[Upstash](https://upstash.com/docs/redis/overall/pricing), september 2026):

| | Vercel **Hobby** | Upstash **Free** |
|---|---|---|
| mesačne | 1 000 000 volaní funkcií, 1 000 000 edge requestov, 100 GB prenosu | 500 000 príkazov, 256 MB dát |

Jeden dotaz agenta = 1 volanie funkcie a **3 príkazy Redisu** (`LRANGE`, `MGET`, `SMEMBERS`).

| Nastavenie | Dotazov / deň | Volaní funkcií / mesiac | Príkazov Redisu / mesiac | Verdikt |
|---|---|---|---|---|
| **Pôvodné: 5 s nonstop** | 17 280 | ~518 000 (**52 % Hobby**) | ~1 555 000 (**311 % Upstash Free**) | Neprijateľné |
| **Nové, rušný deň** (5 s počas 10:30–22:00, inak 300 s) | 8 442 | ~253 000 (25 %) | ~760 000 (152 %) | Cez Upstash Free |
| **Nové, bežný deň** (po minúte ticha 15 s) | 2 922 | ~88 000 (9 %) | ~263 000 (**53 %**) | V poriadku |

Záver: samotná zmena intervalu zrazila spotrebu na pätinu a bežná prevádzka sa
do bezplatných limitov pohodlne zmestí. **Ak by reštaurácia mala objednávky
prakticky nepretržite celý deň, Upstash Free nestačí** — vtedy stačí zdvihnúť
`pollSeconds` na 10 alebo prejsť na platený režim Upstash (**NEEDS MARTIN #16**).
Nastavuje sa v `agent/config.json`: `pollSeconds`, `idlePollSeconds`,
`closedPollSeconds`, `hodiny`.

---

## 5. NEEDS MARTIN

### 5.1 Tajomstvá a premenné vo Verceli

| # | Čo treba | Prečo |
|---|---|---|
| 1 | **Zmeniť `ADMIN_USER` a `ADMIN_PASS`** a nastaviť ich vo Verceli. | V repozitári boli natvrdo zapísané údaje `adminvila27 / adminvila27`. Sú v histórii gitu, takže sa musia považovať za prezradené. Heslo aspoň 12 znakov. |
| 2 | **Overiť `PRINT_TOKEN`** — musí mať aspoň 32 znakov, inak API odmietne všetko. Vygenerovať: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. | Nová podmienka B1. Rovnaký token patrí do `agent/config.json` alebo do premennej `VILA27_TOKEN` na počítači v reštaurácii. |
| 3 | **Skontrolovať, kde všade sa `PRINT_TOKEN` doteraz objavil** — v odkazoch typu `/api/queue?token=…` skončil v histórii prehliadača a v logoch CDN. Ak sa taký odkaz niekedy použil, token vymeniť. | Kód ho už v URL neprijíma, staré záznamy však ostávajú. |
| 4 | **Pridať `ORDER_TTL_DAYS`** (odporúčam `30`). | Bez nej platí 30 dní z kódu; explicitná hodnota je lepšia, lebo presne to sľubuje stránka o ochrane údajov. |
| 5 | **Voliteľne pridať** `ORDER_IP_LIMIT`, `ORDER_GLOBAL_LIMIT`, `AUTH_FAIL_LIMIT`. | Predvolené hodnoty (5/10 min, 60/hod, 10/15 min) sú rozumné; ak by boli priúzke, ide o jednu premennú. |
| 6 | **Nevyplnené necháte `TURNSTILE_SITE_KEY` a `TURNSTILE_SECRET_KEY`**, kým sa nerozhodne o Turnstile. | Prázdne = overenie vypnuté, nič sa nedeje. |
| 7 | **Overiť región Upstash databázy a región funkcií vo Verceli.** | Údaj patrí do stránky o ochrane osobných údajov (teraz `[DOPLNIŤ]`), a región mimo EHP znamená doložiť štandardné zmluvné doložky. |

### 5.2 Rozhodnutia a úkony

| # | Čo treba |
|---|---|
| 8 | **Potvrdiť otváracie hodiny pre príjem objednávok.** Teraz je v `config/otvaracie-hodiny.json` 11:00–21:30 denne, prevzaté zo stránky. Ak sa objednávky prijímajú len do 21:00, treba to zmeniť. |
| 9 | **Doplniť dni, keď je zatvorené** (sviatky, dovolenka) do toho istého súboru. Teraz sú tam len dva ukážkové dátumy na Vianoce 2026. |
| 10 | **Nainštalovať agenta v reštaurácii**: skopírovať `agent/config.example.json` na `config.json`, doplniť `apiUrl` a token, otestovať `node print-agent.js` a odskúšať tlač. Do gitu `config.json` nepatrí. |
| 11 | **Rozhodnúť o finálnej doméne.** Kanonické adresy, `sitemap.xml`, `robots.txt` aj Open Graph teraz ukazujú na `https://www.vila27.sk`. Ak sa použije iná, treba ich prepísať. |
| 12 | **HSTS preload** — až keď bude ostrá doména a istota, že celá vrátane podstránok pobeží navždy cez HTTPS. Preload sa ťažko vracia späť. |
| 13 | **Vercel Hobby a komerčné použitie.** Hobby plán je podľa podmienok Vercelu určený pre nekomerčné projekty. Reštaurácia prijímajúca objednávky je komerčná prevádzka — treba prejsť na Pro alebo si to s Vercelom vyjasniť. |
| 14 | **Rozhodnúť o Cloudflare Turnstile.** Pasca na roboty plus limity zatiaľ stačia; hook je pripravený, keby spam pribudol. |
| 15 | **Potvrdenie objednávky zákazníkovi (SMS/e-mail)** — mimo rozsahu tejto práce. Ak pribudne, e-mail alebo telefón sa stane ďalším osobným údajom a stránka o ochrane údajov sa musí doplniť. |
| 16 | **Sledovať spotrebu Upstash.** Pri nepretržitej prevádzke celý deň bezplatný limit nestačí — viď časť 4. |
| 17 | **Doplniť e-mail na hlásenie bezpečnostných problémov** do `public/.well-known/security.txt` (teraz `[DOPLNIT-security-email@vila27.sk]`) a raz ročne posunúť `Expires`. |
| 18 | **Zmenšiť fotografie.** Rozmery sú doplnené, ale `img/jedlo-burger.jpg` má 1800 px šírky a `vila27foto/` obsahuje aj 4K obrázky. Export na 1600 px a kvalitu ~80 stránku citeľne zrýchli. |
| 19 | **Dať skontrolovať farebný kontrast** (najmä sivý text `--grey #6B6B6B` na svetlom podklade). Automaticky sa to overiť nedá, treba nástroj alebo oko. |

### 5.3 Právne — na kontrolu právnikovi

| # | Čo treba |
|---|---|
| 20 | **Dať skontrolovať obe právne stránky** (`ochrana-osobnych-udajov.html`, `cookies.html`). Nie sú právnym poradenstvom. |
| 21 | **Doložiť zmluvy o spracúvaní podľa čl. 28 GDPR** s Vercelom aj Upstashom. |
| 22 | **Potvrdiť s účtovníkom**, ktoré doklady sa musia archivovať a ako dlho — v texte je to zatiaľ `[DOPLNIŤ]`. |
| 23 | **Rozhodnúť, či je potrebná zodpovedná osoba** (DPO). Pri tejto veľkosti prevádzky spravidla nie, ale text sa na to pýta. |

### 5.4 Úplný zoznam `[DOPLNIŤ]` v repozitári

| Súbor | Miesto | Čo chýba |
|---|---|---|
| `config/otvaracie-hodiny.json` | `_poznamka` | či sa príjem objednávok končí skôr ako prevádzka |
| `config/otvaracie-hodiny.json` | `_zatvorene_poznamka` | skutočný zoznam dní, keď je zatvorené |
| `public/ochrana-osobnych-udajov.html` | „Účinné od“ | dátum účinnosti |
| `public/ochrana-osobnych-udajov.html` | Zodpovedná osoba | či je určená a jej kontakt |
| `public/ochrana-osobnych-udajov.html` | tabuľka právnych základov | ktoré doklady a na aký čas (účtovníctvo) |
| `public/ochrana-osobnych-udajov.html` | lehoty uchovávania | lehota podľa zákona o účtovníctve |
| `public/ochrana-osobnych-udajov.html` | príjemcovia | región funkcií vo Verceli |
| `public/ochrana-osobnych-udajov.html` | príjemcovia | región databázy Upstash |
| `public/ochrana-osobnych-udajov.html` | prenosy | zmluvy podľa čl. 28 GDPR |
| `public/cookies.html` | „Účinné od“ | dátum účinnosti |
| `public/*.html` (10×) | päta, `foot-legal` | príslušný inšpektorát SOI |
| `public/.well-known/security.txt` | `Contact` | e-mail na hlásenie bezpečnostných problémov |
| `.env.example` | `ADMIN_USER`, `ADMIN_PASS` | hodnoty patria do Vercelu, nie do súboru |
| `.env.example` | `KV_REST_API_URL`, `KV_REST_API_TOKEN` | to isté |
| `agent/config.example.json` | `apiUrl`, `token` | vypĺňa sa až pri inštalácii v reštaurácii |

Údaje prevádzkovateľa v päte a na stránke o ochrane údajov (Bc. Tomáš Remenár,
Karola Salvu 1985/9, 034 01 Ružomberok, IČO 40 930 661, DIČ 1071013284,
IČ DPH SK1071013284) nie sú vymyslené — sú prevzaté zo stránky `kontakt.html`,
ktorá už v repozitári bola. Napriek tomu ich, prosím, skontrolujte.

---

## 6. Čo sa nerobilo

- **Nenasadzovalo sa.** `vercel --prod` nebol spustený, všetko sa overovalo lokálne
  cez `dev-server.js`, ktorý číta hlavičky priamo z `vercel.json`.
- **Nemenili sa premenné vo Verceli.** Zoznam zmien je v časti 5.1.
- **Nevypísala sa žiadna skutočná hodnota tajomstva** — ani v tejto správe, ani
  vo výstupe skenu (ten hodnoty maskuje).
- **E2E v prehliadači.** Playwright by bol nová závislosť, a zadanie ho nevyžaduje
  bezpodmienečne. Kroky, ktoré sa dajú overiť bez prehliadača, overujú testy
  (`F1`, `F3`, `F4`, `C6`, E2E až po bloček). Zvyšok je ručný zoznam nižšie.

### Ručná kontrola v prehliadači (pred nasadením)

1. Otvoriť `/` v novom anonymnom okne → objaví sa pruh so súhlasom; v *Nástrojoch
   pre vývojárov → Sieť* nesmie byť žiadna požiadavka mimo vlastnej domény.
2. Kliknúť **Odmietnuť všetko** → na `/kontakt` sa mapa nenačíta, ostáva tlačidlo
   a odkaz do Máp Google. V *Aplikácia → Local Storage* je jediný kľúč `vila27_suhlas`.
3. Kliknúť **Nastavenia cookies** v päte → dialóg sa otvorí, `Tab` sa točí vnútri,
   `Escape` ho zavrie a fokus sa vráti na odkaz.
4. Zapnúť *Externý obsah* → mapa sa načíta bez obnovenia stránky.
5. Prejsť celú stránku klávesnicou: prvý `Tab` ponúkne *Preskočiť na obsah*, každý
   prvok má viditeľný obrys.
6. Zmenšiť okno na 320 px → nikde sa neobjaví vodorovný posuvník okrem tabuľky
   v zásadách cookies.
