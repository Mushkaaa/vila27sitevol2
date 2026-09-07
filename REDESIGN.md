# Redizajn Vila 27 — čo je kde

## Stránky
| Súbor | Obsah |
|---|---|
| `index.html` | domov – hero, reštaurácia, ubytovanie, voľný čas, výzva na objednávku |
| `restauracia.html` | reštaurácia & bar, priestor, galéria, oslavy (text z vila27.sk) |
| `jedalny-listok.html` | jedálny + nápojový lístok, vykresľuje sa z `menu-data.js` |
| `objednavka.html` | online objednávka (rozvoz / odber), logika v `objednavka.js` |
| `ubytovanie.html` | izby, apartmány, galéria, cena a rezervácia (text z vila27.sk) |
| `volny-cas.html` | tipy na okolie so vzdialenosťami (text z vila27.sk) |
| `kontakt.html` | kontakty, fakturačné údaje, mapa, formulár (zatiaľ demo) |
| `admin.html` | nástenka objednávok pre obsluhu – len prefarbená, logika nezmenená |

Backend (`api/`, `agent/`, `vercel.json`) je bez zmeny.

## Spoločné súbory
- `site.css` – jediný štýl pre všetky stránky (nahrádza main.css, styles.css, objednavka.css)
- `site.js` – mobilné menu, aktívna položka v navigácii, lightbox galérií
- `menu-data.js` – **jediný zdroj jedálneho a nápojového lístka** (ceny, gramáže, alergény, doplnky).
  Používa ho lístok aj objednávka; v Node sa dá `require()`-nuť aj v `api/orders.js`
  na prepočet cien na serveri (otvorený bod z CO-SOM-SPRAVIL.md).
  - `order: false` pri položke = zobrazí sa v lístku, ale nedá sa objednať (čapované pivo, sóda…)
  - `orderOnly: true` = len v objednávke (Poskladaj si vlastnú pizzu)
- `logo.svg`, `logo-white.svg`, `favicon.svg` – vyčistené SVG z logo balíka; v stránkach je logo
  inline ako `<symbol id="logo-full">` a farbí sa cez `currentColor`

## Dizajnový systém (odvodený z loga)
- Písmo **Source Sans 3** (Google Fonts; = Source Sans Pro z logo balíka). Black 900 nadpisy, Light 300 sekundárny text.
- Farby v `:root` v `site.css`: `--black`, `--paper #F5F4F0`, `--ink`, `--grey`, `--rule`, `--accent #BA2727` (červený akcent: tlačidlá, linky, aktívne položky, fokus).
- Motív „ledger“: nadpis vľavo | zvislá linka | obsah vpravo (`.ledger`). Ten istý rytmus má lístok
  (gramáž | názov | cena) aj voľný čas (miesto | vzdialenosť).

## Na dokončenie
1. **Fotky** sú hotlinkované z `https://www.vila27.sk/images/…` – skopíruj ich do `img/`
   a v `_build/build.py` zmeň konštantu `IMG` (alebo Find & Replace v HTML).
2. **Otváracie hodiny**: tu 11:00–21:30, pôvodný web uvádza 11:00–22:30 – konštanta `HOURS` v build.py
   (v HTML je na 3 miestach: hero, mobilné menu, pätička + objednávka a kontakt).
3. **Omáčky k sous-vide**: v lístku 2,00 €, v objednávke boli v pôvodnej verzii zadarmo – nechané zadarmo
   (`addonGroups` v `menu-data.js`), over s majiteľom.
4. Kontaktný formulár nič neodosiela – dorobiť (Vercel funkcia + e-mail, alebo Formspree).
5. Lístok sa vykresľuje JavaScriptom; ak chceš statické HTML kvôli SEO, dá sa vygenerovať v build.py.

## Generátor stránok (voliteľné)
Hlavička a pätička sú v každom HTML zduplikované. Ak meníš navigáciu alebo pätičku,
uprav `_build/build.py` a spusti `python3 _build/build.py` v koreňi projektu (potrebuje Node).
Stránky sa dajú upravovať aj priamo – generátor je len pohodlnosť.
