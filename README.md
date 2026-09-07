# Vila 27 — objednávky s tlačou na termotlačiareň

Stránka na Verceli prijme objednávku → uloží ju do fronty → malý program na počítači
v reštaurácii si ju o pár sekúnd vyzdvihne a vytlačí bloček na CK710-USE.

```
  zákazník            Vercel (cloud)              reštaurácia
 ┌─────────┐        ┌────────────────┐        ┌──────────────────┐
 │ mobil / │ POST   │ /api/orders    │  GET   │ print-agent.js   │
 │ web     ├───────►│ fronta         │◄───────┤ (Node, beží      │
 └─────────┘        │ /api/queue     │  každých│  na PC)         │
                    │ /admin         │   5 s   └────────┬─────────┘
                    └────────────────┘                  │ ESC/POS
                                                        ▼
                                                  ┌───────────┐
                                                  │ CK710-USE │
                                                  └───────────┘
```

**Prečo takto:** Vercel je serverless v cloude — nedosiahne na tlačiareň, ktorá je
u teba v sieti za routerom. Preto sa pýta agent zvonku dnu, nie naopak. Nepotrebuješ
verejnú IP, port forwarding ani VPN. Keď vypadne internet, objednávky ostanú vo fronte
a vytlačia sa, len čo sa spojenie vráti.

---

## 1. Súbory

```
index.html, jedalny-listok.html, kontakt.html, objednavka.html, *.css, logo.png
admin.html            – prehľad objednávok pre obsluhu (chránené tokenom)
vercel.json
dev-server.js         – lokálny server na test na jednom PC (namiesto Vercelu)
api/
  orders.js           – POST, prijme objednávku zo stránky
  queue.js            – GET/POST, fronta pre tlačového agenta
  _store.js           – úložisko (Upstash Redis, s fallbackom do pamäte)
agent/
  print-agent.js      – hlavný program, beží na PC v reštaurácii
  receipt.js          – rozloženie bločka (tu meň, ako bloček vyzerá)
  escpos.js           – ESC/POS príkazy + slovenská diakritika (CP852)
  transport.js        – odoslanie do tlačiarne (LAN / USB / lp)
  test-print.js       – testovacia tlač
  nahlad.js           – náhľad bločka v konzole (šetrí papier)
  config.json         – ⚠ tu nastav IP tlačiarne a token
  spustit-agenta.bat  – spustenie na Windows (sám sa reštartuje po páde)
```

`vila27 (1).html` som premenoval na `index.html` a prelinkoval — na Verceli by URL
s medzerou a zátvorkami robila problémy.

---

## 2. Nasadenie na Vercel

1. Nahraj celý priečinok do Gitu a naimportuj na Vercel (Framework preset: **Other**,
   nič sa nebuilduje).
2. V **Settings → Environment Variables** pridaj:

   | Premenná | Hodnota |
   |---|---|
   | `PRINT_TOKEN` | dlhé náhodné heslo, napr. z `openssl rand -hex 24` |

3. Databáza — v **Storage** pridaj **Upstash Redis** (free tier stačí). Vercel sám
   doplní `KV_REST_API_URL` a `KV_REST_API_TOKEN`.
   Bez nej to tiež beží, ale objednávky drží iba v pamäti funkcie a po pár minútach
   sa stratia — dobré akurát na prvý pokus.
4. Redeploy.

Skúška, či server žije:

```bash
curl -X POST https://tvoja-domena.vercel.app/api/orders \
  -H "content-type: application/json" \
  -d '{"mode":"odber","customer":{"name":"Test","phone":"+421900000000"},
       "items":[{"name":"Halušky","qty":1,"unitPrice":10.9}]}'
```

Má vrátiť `{"ok":true,"number":1,...}`.

### Lokálny test na jednom počítači (bez Vercelu)

Statický náhľad z VS Code (Live Preview, port 3000) nevie spustiť `/api`, preto
tam objednávka vždy skončí chybou. Na test bez Vercelu spusti v tomto priečinku:

```bash
node dev-server.js
```

a otvor **http://localhost:3005/objednavka.html**. Server obsluhuje stránku aj
`/api/*` rovnako ako Vercel, len objednávky drží v pamäti (po vypnutí zmiznú) a
`PRINT_TOKEN` je `test` – ten zadaj v `/admin`, prípadne do `agent/config.json`
(`token`: `test`, `apiUrl`: `http://localhost:3005`) na test celej cesty až po tlač.

---

## 3. Tlačiareň (USB)

Štítok hovorí: **80 mm, ESC/POS, USB + Serial + Ethernet, DC24V**. Ideš cez USB,
takže postup je takýto:

1. Nainštaluj ovládač. Funguje generický **POS-80 / XPrinter**, ale úplne
   spoľahlivo aj vstavaný **Generic / Text Only** — my aj tak posielame surové
   ESC/POS bajty, ovládač do nich nemá čo hovoriť.
2. **Ovládacie panely → Zariadenia a tlačiarne** → pravý klik na tlačiareň →
   *Vlastnosti tlačiarne* → záložka **Zdieľanie** → zaškrtni zdieľanie a daj jej
   meno `POS80` (bez medzier a diakritiky — cez to meno jej posielame dáta).
3. Ak Windows zdieľanie odmieta, zapni *Zisťovanie siete a zdieľanie súborov
   a tlačiarní* v nastaveniach siete.
4. V `agent/config.json` je už prednastavené:

```json
"printer": {
  "mode": "windows",
  "windows": { "share": "\\\\localhost\\POS80" }
}
```

Agent zapíše bajty do dočasného súboru a pošle ich cez `copy /b` na zdieľanie —
Windows ich prepustí surovo (RAW) až do tlačiarne.

### Keby si to raz chcel prehodiť na sieť

Tlačiareň má aj Ethernet a je to o čosi menej krehké (nezáleží na tom, ktorý PC
beží). Stačí zapojiť LAN, zistiť IP (vypni tlačiareň, podrž **FEED**, zapni —
vytlačí self-test s IP), dať jej na routeri rezervovanú IP a v configu prehodiť
`"mode": "tcp"` s tou IP. Na Linuxe/Raspberry je tam ešte `"mode": "command"`
s `lp -d POS80 -o raw`.

### Test bez servera

```bash
cd agent
node test-print.js --nahlad            # náhľad rozvozu v konzole, papier sa nemíňa
node test-print.js --odber --nahlad    # náhľad osobného odberu
node test-print.js                     # skutočná tlač
```

Ak `test-print.js` prejde, agent bude tlačiť tiež — používa presne tú istú cestu.

---

## 4. Spustenie agenta

Treba **Node.js 18+** (nič sa neinštaluje, žiadne `npm install` — kód nemá závislosti).

1. V `agent/config.json` nastav:
   - `apiUrl` — adresa tvojho webu na Verceli
   - `token` — presne to isté, čo máš v `PRINT_TOKEN` na Verceli
   - `printer` — podľa kapitoly 3
2. Spusti `spustit-agenta.bat` (Windows) alebo `node print-agent.js`.
3. Okno nechaj otvorené. Vypíše každú vytlačenú objednávku, log ide aj do `agent.log`.

**Autoštart na Windows:** `Win+R` → `shell:startup` → hoď tam odkaz na
`spustit-agenta.bat`. Na dlhodobú prevádzku je lepšie spraviť z toho službu cez
[NSSM](https://nssm.cc) — beží aj bez prihláseného používateľa.

**Dotlač bločka:**

```bash
node print-agent.js --reprint 12
```

### Čo je na bločku

Bloček je **len informácia pre obsluhu, čo pripraviť** — do kasy si to obsluha
zadá sama, takže ceny ani súčty tam nie sú:

- číslo objednávky, čas, typ (ROZVOZ / OSOBNÝ ODBER)
- **pri rozvoze** navyše meno, telefón a adresa
- zoznam jedál s počtami a doplnkami, veľkým písmom
- poznámka zákazníka, ak nejakú napísal

### Nastavenie bločka

- **Ceny a súčty:** `receipt.showPrices` — teraz `false`. Prehodením na `true`
  sa dotlačí medzisúčet, doprava, SPOLU a spôsob platby.
- **Počet kópií:** `receipt.copies` (teraz 1). Ak by si chcel dve — napr.
  kuchyňa + rozvoz — daj `2` a do `copyLabels` napíš `["KUCHYŇA", "ROZVOZ"]`.
- **Diakritika:** `receipt.charset` = `"cp852"`. Ak by z tlačiarne liezli
  namiesto `č ť ž` divné znaky, prehoď na `"ascii"` — vytlačí sa bez dĺžňov,
  ale vždy čitateľne.
- **Rozloženie:** celé je v `agent/receipt.js`, obyčajný JS. Po každej zmene
  si to pozri cez `node test-print.js --nahlad`.
- Pozor na dvojitú šírku písma: na 80 mm sa pri `size(2,2)` zmestí len ~24 znakov.
  Náhľad ti dlhé riadky označí `⚠`.

---

## 5. Obsluha: /admin

`https://tvoja-domena.vercel.app/admin` — zadá sa `PRINT_TOKEN` a beží prehľad
objednávok, ktorý sa sám obnovuje každých 5 s. Má aj zvukové upozornenie na novú
objednávku (treba ho raz zapnúť tlačidlom, prehliadače inak zvuk nepustia).

Je to len jednoduché heslo v URL parametri — pre testovaciu fázu OK, pred ostrým
spustením by som to prehodil na normálne prihlásenie alebo aspoň Vercel Password
Protection.

---

## 6. Keď niečo nefunguje

| Príznak | Kde hľadať |
|---|---|
| Agent píše „Server nedostupný" | zlá `apiUrl`, alebo web ešte nie je nasadený |
| `Neplatný token` | `token` v config.json ≠ `PRINT_TOKEN` na Verceli (pozor na medzery) |
| Tlačiareň nereaguje | zdieľanie nie je zapnuté, alebo sa meno zdieľania nezhoduje s configom |
| `copy` skončil s kódom 1 | meno zdieľania má medzeru/diakritiku, alebo nie je zapnuté zdieľanie tlačiarní |
| Vyjde prázdny papier / hieroglyfy | skús `"charset": "ascii"`; ak stále, tlačiareň asi nie je v ESC/POS režime |
| Bloček sa nevytlačil, ale objednávka prišla | pozri `agent.log`; po oprave `node print-agent.js --reprint ČÍSLO` |
| Objednávky miznú | nemáš pripojený Upstash — beží pamäťový fallback |
| Vytlačilo dvakrát | bežia dve inštancie agenta naraz |

---

## 7. Než to pustíš naostro

Toto som zámerne nechal na tebe, ale bez toho by som to zákazníkovi nepúšťal:

1. **Ceny sa berú z prehliadača.** Server prepočíta súčty, ale jednotkové ceny
   posiela klient — v konzole si ich vie ktokoľvek prepísať. Vytiahni `MENU`
   z `objednavka.html` do `menu.json`, načítaj ho aj v `api/orders.js` a ceny
   ber odtiaľ. Je to asi hodina roboty a je to jediná vec, ktorú považujem
   za skutočnú dieru.
2. **Otváracie hodiny** — teraz sa dá objednať aj o tretej ráno. Kontrola patrí
   na server, nie do JS.
3. **Potvrdenie zákazníkovi** — SMS alebo e-mail (Resend, Twilio). Teraz sa
   dozvie len toast v prehliadači.
4. **Antispam** — jednoduchý rate limit na IP v `api/orders.js`, inak ti niekto
   z nudy minie celú kotúčovú rolku.
5. **GDPR** — meno, telefón a adresa sú osobné údaje. Nastav mazanie po pár dňoch
   (`EXPIRE` v Redise) a doplň informáciu o spracovaní k formuláru.
6. **Vercel Hobby plán je len na nekomerčné použitie.** Web reštaurácie pod to
   nespadá — na ostro treba Pro. Pri 5-sekundovom pollingu je to ~17 tisíc
   volaní denne; ak by to bolo veľa, zdvihni `pollSeconds` na 10.
