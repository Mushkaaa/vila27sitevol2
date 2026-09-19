# Vila 27 — správa o bezpečnostnom prehliadnutí a doladení

**Vetva:** `security-hardening` · **Dátum:** 16. 9. 2026 · **Nenasadené na produkciu.**
Tento dokument **nie je verejne dostupný** (`docs/` je mimo `public/` aj v `.vercelignore`).

Podklady: [`inventory.md`](inventory.md) (obhliadka) a [`research.md`](research.md) (prieskum 2025–2026).

---

## 1. Ako to dopadlo

`npm run security:check` — **89 automatických kontrol, všetky prešli, návratový kód 0.**
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
| D1 | **Opravené** | 5 objednávok / 10 min na IP a 60 / hod celkovo → 429 s priateľskou slovenskou hláškou a `Retry-After` ([`api/orders.js:28-31`, `225-240`](../../api/orders.js)). IP sa berie iba z hlavičky pomenovanej v `VILA27_IP_HEADER`, inak z adresy spojenia – podvrhnutou hlavičkou sa limit obísť nedá ([`api/_ip.js`](../../api/_ip.js), viď časť 7.3). Testy `D1 – šiesta objednávka…`, `D1 – celkový strop…`, `D1 – počítadlo limitov…`, `D1 – bez nastavenej dôveryhodnej hlavičky…`, `D1 – hlavička s IP platí len vtedy…`. |
| D2 | **Opravené** | Pamäťový režim sa zapína výslovne premennou `VILA27_ALLOW_MEMORY_STORE=1`; inak sa bez Redisu vráti 503 s textom *„Objednávky sú dočasne nedostupné, zavolajte nám, prosím, na +421 914 271 271.“* ([`api/_store.js:38-62`](../../api/_store.js)). Predtým to viselo na `VERCEL_ENV`, čo na inom hostingu znamenalo tiché zlyhanie smerom von – podrobnosti v časti 7.1. Testy `D2 – pamäťový režim sa zapína výslovne…`, `D2 – objednávka uložená do Redisu sa naozaj vráti vo fronte`. |
| D3 | **Opravené a zmerané** | Fronta má verziu, takže prázdna otázka stojí jeden Redis príkaz namiesto štyroch ([`api/queue.js:31-44`](../../api/queue.js), [`api/_store.js:152-168`](../../api/_store.js)). Agent 12/40/900 s ([`agent/print-agent.js:39-68`](../../agent/print-agent.js)), nástenka 20/60 s a pri skrytej karte nič ([`public/admin-objednavky.js:17-23`](../../public/admin-objednavky.js)), ponuka 5 minút v pamäti ([`api/menu.js:12-21`](../../api/menu.js)). Namerané testami `D3 …` (3×), čísla v časti 4. |
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

Testov: 89   prešlo: 89   zlyhalo: 0   nálezov tajomstiev: 0
VÝSLEDOK: PASS – všetky kontroly prešli.
```

Rozpis podľa položiek je v tabuľke, ktorú príkaz vypisuje (A1–A4, B1–B6, C1–C9,
D1–D4, E1–E4, F1–F5, G1–G4, H1, H2, I1, J1–J4, P1–P7, E2E).
Mimo automatických testov ostávajú **D3** (prepočet nižšie), **G5** (niet cudzieho
skriptu) a **K** (zoznam vyššie).

---

## 4. D3 — zmestíme sa do bezplatného Upstashu?

Pôvodná verzia tejto správy to počítala od stola a **počítala zle** — nezapočítala
nástenku v kuchyni, ktorá sa pýtala každých 5 sekúnd po štyroch Redis príkazoch.
Len ona sama by minula okolo **2 000 000 príkazov mesačne**, teda štvornásobok
bezplatného limitu. Preto sa to už nepočíta, ale **meria**.

`tests/fake-upstash.js` je maličký Upstash cez REST, ktorý počíta príkazy.
`tests/kvoty.test.js` cezeň zmeria cenu každého druhu požiadavky a vynásobí ju
modelom prevádzky. Keď sa priblížime k stropu, test padne.

### Čo sa zmenilo

| Zmena | Prečo |
|---|---|
| Fronta má **verziu** (`vila27:verzia`). Klient pošle tú, ktorú videl naposledy; ak sedí, server odpovie jedným `GET` a prázdnym telom. | Drvivá väčšina otázok je prázdnych. Z 3–4 príkazov sa stal jeden. |
| **Nástenka**: 20 s pri zmenách, 60 s po minúte ticha, pri skrytej karte nepýta nič. | Chýbala v pôvodnom prepočte a bola najväčším žrútom. |
| **Agent**: 12 s pri objednávkach, 40 s v pokoji, 900 s mimo otváracích hodín. | Bloček je v kuchyni do 12 sekúnd, čo stačí. |
| **Ponuka** sa drží 5 minút v pamäti inštancie. | Bez CDN stálo každé zobrazenie 6 príkazov. |
| `EXPIRE` sa nastavuje len pri prvom `INCR`, nie pri každom. | Ušetrí jeden príkaz na objednávku. |
| Overenie správneho tokenu nesiaha do Redisu vôbec. | Bol to jeden `GET` pri každej otázke agenta aj nástenky — polovica celej spotreby. |

### Namerané jednotkové ceny (Redis príkazov)

| Požiadavka | Predtým | Teraz |
|---|---|---|
| prázdna otázka agenta | 4 | **1** |
| prázdna otázka nástenky | 5 | **1** |
| plný dotaz agenta (po zmene) | 4 | 4 |
| plný dotaz nástenky (po zmene) | 5 | 5 |
| prijatie objednávky | 15 | 13 |
| označenie vytlačené / vybavené | 3 | 3 |
| zobrazenie ponuky (studený cache) | 6 | 6 |
| zobrazenie ponuky (z cache) | 6 | **0** |

### Projekcia na mesiac (31 dní)

Bezplatný Upstash Redis: **500 000 príkazov mesačne** (stav 9/2026).

| Scenár | Príkazov / mesiac | Z limitu |
|---|---|---|
| **Pesimistický deň** — 150 objednávok, 11,5 h bez jedinej chvíle ticha, 3000 zobrazení ponuky | **382 788** | **76,6 %** |
| **Bežný deň** — 50 objednávok, dlhé obdobia ticha | **141 143** | **28,2 %** |
| ~~Pôvodné nastavenie (5 s, bez verzie, s nástenkou)~~ | ~~cez 2 500 000~~ | ~~cez 500 %~~ |

Test drží dve hranice: pesimistický mesiac musí ostať pod 500 000 a zároveň mať
aspoň 15 % rezervu; bežný mesiac musí ostať pod polovicou limitu. Keď niekto
zrýchli interval alebo pridá Redis volanie do horúcej cesty, test padne a povie,
o koľko.

Nastavuje sa v `agent/config.json` (`pollSeconds`, `idlePollSeconds`,
`closedPollSeconds`), v `public/admin-objednavky.js` (`POLL_RUSNO_MS`,
`POLL_POKOJ_MS`) a premennou `MENU_CACHE_MS`.

### Čo to neznamená

Čísla platia pre **Upstash**. Limity Vercelu už nie sú podstatné — projekt ide na
iný hosting (viď NEEDS MARTIN #13). Ak sa vymení aj databáza, tento prepočet treba
spraviť nanovo; test sa dá prenastaviť zmenou `STROP_MESACNE` v `tests/kvoty.test.js`.

---

## 4b. Dve chyby, ktoré sa našli pri meraní

Obe boli v kóde, ktorý žiadny test nikdy nespustil, lebo všetky testy dovtedy
bežali v pamäťovom režime bez Redisu.

**1. Fronta by na ostrom Redise bola vždy prázdna.** `save()` ukladá objednávku pod
kľúč `vila27:objednavka:<id>`, ale `list()` robil `MGET` na holé `<id>` bez predpony.
Na Upstashi by sa teda **nevytlačila ani jedna objednávka a nástenka by ostala
prázdna**, hoci by sa dáta ukladali správne. Opravené v
[`api/_store.js:204-207`](../../api/_store.js); stráži to test
`D2 – objednávka uložená do Redisu sa naozaj vráti vo fronte`.

**2. Cudzí mohol odstaviť tlač objednávok.** Počítadlo neúspešných prihlásení sa
čítalo pri **každej** požiadavke, aj tej úspešnej. Okrem toho, že to bola polovica
mesačnej spotreby, to znamenalo, že desať nesprávnych tokenov z tej istej IP
(a reštaurácia býva s okolím za spoločným NAT) zablokovalo na štvrť hodiny aj
tlačového agenta so správnym tokenom. Teraz sa počítadlo číta aj zapisuje iba na
chybovej ceste ([`api/_token.js:57-87`](../../api/_token.js)). Uhádnuť 32-znakový
náhodný token sa nedá, takže obmedzovanie je tu proti hluku, nie ako jediná obrana.

## 5. NEEDS MARTIN

### 5.1 Tajomstvá a premenné vo Verceli

| # | Čo treba | Prečo |
|---|---|---|
| 1 | **Pred ostrým spustením** zmeniť `ADMIN_USER` a `ADMIN_PASS`. Počas testovacej fázy to nehorí. | Údaje `adminvila27 / adminvila27` boli natvrdo v kóde a ostávajú v histórii gitu, takže ich treba považovať za verejné. Rovnako dopadlo aj testovacie heslo `vila27adminko` z 19. 9. 2026 (commity `309b6af`, `a4da9cf`) – repozitár je na GitHube **verejný**, takže čokoľvek, čo tam raz je, tam ostane. Kým je to test, nič sa nedeje; v deň, keď na to pôjdu skutočné objednávky, musia byť iné. Heslo aspoň 12 znakov, a nie do `.env.example` ale do `.env` (lokálne) alebo do premenných prostredia hostingu. |
| 2 | **Overiť `PRINT_TOKEN`** — musí mať aspoň 32 znakov, inak API odmietne všetko. Vygenerovať: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Testovací token stačí vymeniť spolu s bodom 1. | Nová podmienka B1. Rovnaký token patrí do `agent/config.json` alebo do premennej `VILA27_TOKEN` na počítači v reštaurácii. |
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
| 13 | **Zmena hostingu.** Projekt nepôjde na Vercel. Tým padá otázka Hobby verzus komerčné použitie, ale vzniká väčšia: veľká časť ochrany dnes stojí na `vercel.json` a na tom, že Vercel zverejňuje iba `public/`. Na inom hostingu to treba nastaviť nanovo — zoznam je v časti 7. |
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

---

## 7. Presun na iný hosting — čo musí nový hosting splniť

Projekt bol spevnený v čase, keď bežal na Verceli, a **časť ochrany stála na
Verceli, nie na kóde**. To je nebezpečné práve preto, že sa to nepokazí hlučne:
nová adresa bude fungovať, stránka sa načíta, objednávka prejde — a ochrana
proste nebude. Nižšie je zoznam, čo z toho už stráži kód sám a čo treba na novom
hostingu nastaviť ručne.

Kým nie je hosting vybraný, toto je otvorená položka **NEEDS MARTIN #13**.

### 7.1 Čo už kód ustráži sám (host-nezávislé)

| Ochrana | Ako je to zabezpečené |
|---|---|
| **Pamäťové úložisko sa v produkcii nepoužije** (D2) | Prepínač už nevisí na `VERCEL_ENV`. Pamäťový režim treba výslovne povoliť premennou `VILA27_ALLOW_MEMORY_STORE=1`; bez nej a bez Redisu vráti `/api/orders` 503. Na novom hostingu ju **nenastavuj**. Overuje test `D2 – pamäťový režim sa zapína výslovne…`. |
| **Limity sa nedajú obísť podvrhnutou IP** (D1, B5) | `api/_ip.js` verí iba hlavičke, ktorú pomenuješ v `VILA27_IP_HEADER`. Bez nej sa použije adresa spojenia. Overujú testy `D1 – bez nastavenej dôveryhodnej hlavičky…` a `D1 – hlavička s IP platí len vtedy…`. |
| **Token, ceny, otváracie hodiny, čistenie textu, limity, expirácia údajov** | Všetko je v `api/` a `agent/`, na hostingu nezávisí. |

### 7.2 Čo musí nastaviť nový hosting

| # | Požiadavka | Čo sa stane, ak sa zabudne |
|---|---|---|
| H1 | **Koreň webu musí byť `public/`.** Nič z `agent/`, `docs/`, `tests/`, `scripts/`, `config/`, `.env`, `.git/`, `menu.json`, `package.json` sa nesmie dať stiahnuť. | Verejný `agent/config.json` s tokenom, verejná táto správa, verejné `.git`. Ticho. **Najzávažnejšie zo všetkého.** |
| H2 | **Bezpečnostné hlavičky** z `vercel.json` prepísať do formátu hostingu. | CSP, HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, COOP a `Permissions-Policy` jednoducho zmiznú (G1–G3). Stránka funguje ďalej, nikto si nevšimne. |
| H3 | **`Cache-Control: no-store` na `/api/*` a `/admin*`** (G4). | Odpoveď s osobnými údajmi sa môže odložiť na CDN alebo v prehliadači. |
| H4 | **Neznáma adresa → stav 404 a obsah `public/404.html`** (P1). | Mäkká 200, alebo — horšie — výpis obsahu priečinka. |
| H5 | **Adresy bez `.html`** (`/kontakt`, `/objednavka`, …), teda to, čo robil `cleanUrls`. | `sitemap.xml`, `canonical` aj `robots.txt` ukazujú na adresy bez prípony; bez toho vedú na 404. |
| H6 | **HTTPS s platným certifikátom**, prípadne presmerovanie z HTTP. | Prihlásenie do správy ponuky používa cookie s príznakom `Secure`, takže by sa **vôbec nedalo prihlásiť**; tlačový agent odmietne `http://` adresu (J1). |
| H7 | **Node.js 18+** pre `api/*.js` a smerovanie `/api/<meno>` na `api/<meno>.js`. Súbory začínajúce podčiarkovníkom (`api/_store.js`, …) **nesmú** byť dostupné ako endpoint ani ako statický súbor. | Buď objednávky nefungujú, alebo sa dá stiahnuť vnútro aplikácie. |
| H8 | **Premenné prostredia**: `PRINT_TOKEN`, `ADMIN_USER`, `ADMIN_PASS`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `ORDER_TTL_DAYS`, `VILA27_IP_HEADER`. | Bez prvých piatich sa nedá objednávať ani prihlásiť (fail closed, čiže hlučne — to je v poriadku). |

### 7.3 Hodnota `VILA27_IP_HEADER` podľa hostingu

| Hosting | Hodnota |
|---|---|
| Cloudflare (Pages, Workers, proxy) | `cf-connecting-ip` |
| Netlify | `x-nf-client-connection-ip` |
| Vercel | `x-vercel-forwarded-for` |
| vlastný nginx / Caddy | `x-real-ip` — **a proxy ju musí prepisovať, nie prepúšťať od klienta** |
| priamo vystavený Node bez proxy | nenastavovať |

Zlá hodnota je horšia než žiadna: ak sa nastaví hlavička, ktorú proxy neprepisuje,
limity sa dajú obísť jedným riadkom v `curl`.

### 7.4 Poznámka k vlastnému serveru (VPS)

`dev-server.js` nie je len vývojová hračka — číta hlavičky priamo z `vercel.json`,
servíruje výhradne `public/`, rieši adresy bez prípony aj skutočnú 404 a spúšťa
`api/*.js`. Na VPS za nginxom (kvôli TLS a kompresii) splní H1 až H5 a H7 bez
ďalšej práce. Pred takým použitím ale treba:

1. nastaviť `VILA27_IP_HEADER` podľa proxy (H1 v 7.3),
2. **nenastaviť** `VILA27_ALLOW_MEMORY_STORE`,
3. premenné prostredia dodať cez systemd alebo `.env` mimo koreňa webu,
4. spúšťať ho pod vlastným systémovým používateľom bez práv na zápis do repozitára.

Toto nie je odskúšané — je to návrh, nie hotová konfigurácia.

### 7.5 Čo testy o novom hostingu nepovedia

Testy `A3` a `G1–G4` bežia proti `dev-server.js`. Ten číta `vercel.json` a
servíruje iba `public/`, takže **budú svietiť nazeleno aj vtedy, keď na ostrom
hostingu nebude platiť ani jedna hlavička a `.env` bude verejný**. Overujú
zámer, nie nasadenie.

Po nasadení preto treba to isté odmerať proti skutočnej adrese:

```
BASE_URL=https://<nova-adresa> npm run security:check
```

`BASE_URL` prepne HTTP testy na zadaný server. Testy, ktoré si spúšťajú vlastný
server (zatvorené hodiny, globálny strop, podvrhnutá IP), ostanú lokálne — to je
v poriadku, tie overujú logiku, nie nasadenie.

Minimum, čo treba po nasadení vyskúšať ručne:

```
curl -sI https://<adresa>/ | grep -i 'content-security-policy\|strict-transport'
curl -so /dev/null -w '%{http_code}\n' https://<adresa>/.env
curl -so /dev/null -w '%{http_code}\n' https://<adresa>/agent/config.json
curl -so /dev/null -w '%{http_code}\n' https://<adresa>/docs/security/REPORT.md
curl -so /dev/null -w '%{http_code}\n' https://<adresa>/neexistuje     # musí byť 404
curl -so /dev/null -w '%{http_code}\n' https://<adresa>/kontakt        # musí byť 200
```

Prvé štyri musia vrátiť 404. Ak čokoľvek z toho vráti 200, hosting nie je
nastavený správne a body H1 až H4 neplatia.

