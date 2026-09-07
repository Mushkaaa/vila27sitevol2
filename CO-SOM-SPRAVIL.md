# Čo som spravil — objednávkový systém Vila 27

**Zadanie:** objednávka zo stránky sa má niekde zaznamenať a vytlačiť ako bloček
na termotlačiarni CK710-USE. Web na Verceli, testovacia fáza.

---

## 1. Architektúra

Vercel je serverless v cloude — nedosiahne na tlačiareň, ktorá je v reštaurácii
za routerom. Preto som to otočil: **nepýta sa cloud dnu, ale lokálny agent von.**

```
  zákazník            Vercel (cloud)              reštaurácia
 ┌─────────┐        ┌────────────────┐        ┌──────────────────┐
 │ mobil / │ POST   │ /api/orders    │  GET   │ print-agent.js   │
 │ web     ├───────►│ fronta (Redis) │◄───────┤ (Node, beží      │
 └─────────┘        │ /api/queue     │ každých│  na PC)          │
                    │ /admin         │   5 s  └────────┬─────────┘
                    └────────────────┘                 │ ESC/POS
                                                       ▼
                                                 ┌───────────┐
                                                 │ CK710-USE │
                                                 └───────────┘
```

Dôsledky tohto rozhodnutia:

- žiadna verejná IP, žiadny port forwarding, žiadna VPN
- výpadok internetu nič nestratí — objednávky počkajú vo fronte
- funguje rovnako, či je tlačiareň na LAN alebo na USB

---

## 2. Serverová časť (beží na Verceli)

| Súbor | Čo robí |
|---|---|
| `api/orders.js` | POST z formulára. Validuje vstup, ošetrí reťazce, **prepočíta súčty na serveri**, pridelí poradové číslo, uloží do fronty. |
| `api/queue.js` | GET vráti agentovi nevytlačené objednávky, POST ich označí za vytlačené. Chránené tokenom (`PRINT_TOKEN`). |
| `api/_store.js` | Úložisko. Upstash Redis cez REST (bez npm balíka), s pamäťovým fallbackom, keď Redis nie je nastavený. |
| `vercel.json` | `cleanUrls`, `noindex` na `/admin`. |

Fronta je Redis list + set vytlačených ID. Poradové čísla cez `INCR`.

---

## 3. Lokálny tlačový agent

**Nula npm závislostí** — čistý Node 18+, žiadne `npm install`, žiadne natívne
moduly (tie sú pri tlačiarňach na Windows najčastejší zdroj bolesti).

| Súbor | Čo robí |
|---|---|
| `agent/print-agent.js` | Hlavná slučka. Polling, tlač, potvrdenie serveru, log do súboru, dotlač cez `--reprint`. |
| `agent/receipt.js` | Rozloženie bločka. Tu sa mení, ako bloček vyzerá. |
| `agent/escpos.js` | Vlastný ESC/POS builder — zarovnanie, veľkosti písma, inverzia, rez, zalamovanie riadkov na 48 znakov. Vrátane **mapy CP852**, aby vyšla slovenská diakritika. |
| `agent/transport.js` | Odoslanie bajtov. Nastavené na **`windows`** — USB tlačiareň zdieľaná pod menom, dáta idú cez `copy /b` surovo (RAW). Pripravené sú aj `tcp` (LAN, port 9100), `command` (Linux `lp -o raw`) a `file` (ladenie bez papiera). |
| `agent/nahlad.js` | Renderer, ktorý prečíta ESC/POS bajty a nakreslí bloček do konzoly. |
| `agent/test-print.js` | Testovacia tlač vzorovej objednávky. |
| `agent/config.json` | Meno zdieľania tlačiarne, token, počet kópií, prepínač cien. |
| `agent/spustit-agenta.bat` | Spustenie na Windows, sám sa reštartuje po páde. |

### Poistky proti dvojitej tlači

Dve nezávislé vrstvy: server si drží set vytlačených ID, agent navyše lokálny
`vytlacene.json`. Ak zlyhá potvrdenie serveru (výpadok siete tesne po tlači),
agent to aj tak nevytlačí druhýkrát.

Ak zlyhá samotná tlač, objednávka sa **nepotvrdí** a skúsi sa znova v ďalšom cykle.

---

## 4. Bloček

Bloček je **len informácia pre obsluhu, čo pripraviť.** Do kasy si to obsluha
zadá sama, takže ceny ani súčty tam nie sú. Pri rozvoze pribudne meno, telefón
a adresa; pri osobnom odbere len meno.

**Rozvoz:**

```
                  OBJEDNÁVKA
                     # 4 2
                 20.08. 22:25

                   █ROZVOZ█
================================================
Ján Novák
+421 900 123 456

A. Hlinku 210, Bešeňová
Čas: Čo najskôr
================================================
2x Halušky s bryndzou
    + slanina

1x Bravčový rezeň v panko strúhanke so
    zemiakovým pyré a cesnakovou majonézou

1x Cézar šalát
    + 100g kuracie prsia

================================================
 █POZNÁMKA█
Prosím zvoniť na Novák, alergia na orechy.
================================================
─ ✂ ─ ✂ ─ ✂ ─ ✂ ─ ✂ ─ ✂ ─ ✂ ─ ✂ ─ ✂ ─ ✂ ─ ✂ ─
```

**Osobný odber** — to isté, len bez telefónu a adresy.

Názvy jedál sú dvojitou výškou písma, nech sa to dá prečítať z ruky cez kuchyňu.
Ceny sa dajú kedykoľvek zapnúť prepínačom `receipt.showPrices` v configu.

Detaily, ktoré bolo treba doriešiť:

- **Diakritika** — mapa CP852 (Latin-2 DOS) priamo v kóde, prepínač `charset`
  na `"ascii"` ako záruka, keby tlačiareň mala inú tabuľku.
- **Dvojitá šírka písma** — na 80 mm sa pri `size(2,2)` zmestí len ~24 znakov,
  takže `OSOBNÝ ODBER` by sa škaredo zalomilo. Prehodené na dvojitú výšku pri
  normálnej šírke, veľké ostalo len číslo objednávky.
- **Zalamovanie dlhých názvov jedál** — s odsadením pokračovacích riadkov.
- Náhľad označí `⚠` každý riadok, ktorý by sa nezmestil.

---

## 5. Prehľad pre obsluhu — `/admin`

Samoobnovujúca sa nástenka objednávok (5 s), kartičky štylizované ako bločky,
v palete webu. Nové objednávky orámované, voliteľné pípnutie cez Web Audio,
telefón ako klikateľný `tel:` odkaz. Vstup chránený tým istým tokenom.

---

## 6. Zmeny v pôvodnom webe

- `objednavka.html` — demo toast nahradený skutočným `fetch` na `/api/orders`:
  stav tlačidla počas odosielania, poradové číslo v potvrdení, zmysluplná
  chybová hláška s telefónom na reštauráciu. Opravený aj prístup k poliam
  formulára (`form.name` vracia atribút formulára, nie input — pôvodný kód
  by meno neprečítal).
- `vila27 (1).html` → `index.html` a prelinkované vo všetkých súboroch
  (medzera a zátvorky v URL by na Verceli robili problémy).
- Ostatné stránky a CSS nedotknuté.

---

## 7. Čo som otestoval

- objednávka cez API → uloženie → agent ju vyzdvihne → vytlačí → potvrdí
- druhý beh agenta tú istú objednávku **nevytlačí znova**
- dotlač cez `--reprint 2`
- odmietnutie zlého tokenu
- náhľad bločka pre rozvoz aj osobný odber, vrátane zalomení a diakritiky
- syntax všetkých súborov

Netestované naživo: samotná tlačiareň (nemám ju tu) a Upstash Redis
(v teste bežal pamäťový fallback).

---

## 8. Čo ostáva pred ostrým spustením

Zoradené podľa toho, ako veľmi mi to vadí:

1. **Ceny sa berú z prehliadača.** Na bločku už ceny nie sú, takže obsluhu to
   nepomýli — ale súčet vidí zákazník na stránke aj obsluha v `/admin`, a ten
   sa počíta z jednotkových cien poslaných z prehliadača. V konzole si ich vie
   ktokoľvek prepísať. Riešenie: vytiahnuť `MENU` z `objednavka.html` do
   `menu.json` a v `api/orders.js` brať ceny odtiaľ. Asi hodina roboty.
2. **Otváracie hodiny** — teraz sa dá objednať o tretej ráno. Kontrola patrí
   na server.
3. **Potvrdenie zákazníkovi** — SMS alebo e-mail. Teraz sa dozvie len toast.
4. **Rate limit** na `/api/orders`, inak niekto z nudy minie celú rolku.
5. **GDPR** — meno, telefón, adresa. Nastaviť `EXPIRE` v Redise a doplniť
   informáciu k formuláru.
6. **Vercel Hobby je len na nekomerčné použitie** — web reštaurácie pod to
   nespadá, na ostro treba Pro.
7. **Tlač je viazaná na ten jeden počítač** (USB). Keď je vypnutý alebo spí,
   objednávky sa hromadia vo fronte a vytlačia sa až po zapnutí — nič sa
   nestratí a medzitým sú vidieť v `/admin`, ale treba vypnúť uspávanie
   a nastaviť autoštart. Ak by to raz bolo na obtiaž, tlačiareň má aj Ethernet
   a v configu stačí prehodiť jeden riadok.
8. `/admin` chránený jedným tokenom je na test OK, na ostro radšej normálne
   prihlásenie alebo Vercel Password Protection.
