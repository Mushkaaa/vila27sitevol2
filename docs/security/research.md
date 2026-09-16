# Čo sa v rokoch 2025–2026 najčastejšie láme na „vibe-coded“ weboch

Prieskum k 16. 9. 2026. Cieľom nebolo spraviť rešerš, ale zistiť, **ktoré z bežných chýb
platia pre Vilu 27** a priradiť ich k položkám kontrolného zoznamu v `SECURITY-GOAL.md`.

Každý riadok má: čo zdroj tvrdí → platí to tu? → kam to patrí.

---

## Zdroje

| # | Zdroj | O čom je |
|---|---|---|
| Z1 | [SecurityWeek — *Vibe-Coded Apps Riddled With Exploitable Security Flaws*](https://www.securityweek.com/vibe-coded-apps-riddled-with-exploitable-security-flaws/) | Xint.io: 434 zneužiteľných chýb (196 v nových appkách, 238 v jednej väčšej). Najčastejšie chýbajúce limity/DoS, potom autorizácia (IDOR), SSRF a directory traversal. Kritické: zapísané tajomstvá a debug režim. |
| Z2 | [Escape.tech — *How we discovered vulnerabilities in apps built with vibe coding*](https://escape.tech/blog/methodology-how-we-discovered-vulnerabilities-apps-built-with-vibe-coding/) | Metodika: verejné endpointy bez autorizácie, dáta viditeľné cez API, chýbajúce limity. |
| Z3 | [benavlabs/vibe-check](https://github.com/benavlabs/vibe-check) | 17-položkový zoznam: nechránené API, zapísané tajomstvá, IDOR, kľúče vo frontende, SSRF, CSRF, chýbajúce hlavičky, wildcard CORS, žiadne limity, SQLi, XSS, neoverené webhooky, nahrávanie súborov, ukecané chyby, slabé hashovanie hesiel, halucinované balíky. |
| Z4 | [OWASP Top 10:2025](https://owasp.org/Top10/2025/0x00_2025-Introduction/) | Nové poradie: A01 Broken Access Control (už vrátane SSRF a BOLA/BFLA), A02 Security Misconfiguration, **A03 Software Supply Chain Failures (nové)**, A04 Cryptographic Failures, A05 Injection, A06 Insecure Design, A07 Authentication Failures, A08 Software and Data Integrity Failures, A09 Security Logging and Alerting Failures, **A10 Mishandling of Exceptional Conditions (nové)**. |
| Z5 | [Cloud Security Alliance — *Vibe Coding's Security Debt: The AI-Generated CVE Surge*](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-generated-code-vulnerability-surge-2026/) | Nárast CVE v kóde písanom s AI počas Q1 2026. |
| Z6 | [Georgia Tech Research — *Bad Vibes: AI-Generated Code is Vulnerable*](https://news.research.gatech.edu/2026/04/13/bad-vibes-ai-generated-code-vulnerable-researchers-warn) | „Vibe Security Radar“: 56 CVE za prvý štvrťrok 2026, z toho 35 v marci. Chýbajúca autentifikácia nie je preklep, ale chyba návrhu. |
| Z7 | [OX Security — *Why 62% of AI-generated code ships with vulnerabilities*](https://www.ox.security/blog/vibe-coding-security/) | Obrana proti XSS zlyhala v 86 % prípadov, log injection v 88 %. |
| Z8 | [Kaspersky — *Security risks of vibe coding and LLM assistants*](https://www.kaspersky.com/blog/vibe-coding-2025-risks/54584/) | Chýbajúca validácia vstupu, žiadna sanitizácia, ukecané chybové hlášky. |
| Z9 | [SoftwareSeni — *91,5 % vibe-coded appiek má zraniteľnosti (Q1 2026)*](https://www.softwareseni.com/91-5-percent-of-vibe-coded-apps-have-vulnerabilities-and-what-the-q1-2026-research-actually-shows/) | Zhrnutie výskumov Q1 2026; „funkčne správne ≠ bezpečné“. |
| Z10 | [Arnica — *Vibe Coding Security Risks You Can't Ignore 2026*](https://www.arnica.io/blog/vibe-coding-security-risks) | Tajomstvá v repozitári a v histórii gitu; rotácia po úniku. |
| Z11 | [Vercel — Functions Limits](https://vercel.com/docs/functions/limitations) a [Pricing](https://vercel.com/pricing) | Hobby: 1 mil. volaní funkcií a 1 mil. edge requestov mesačne, 100 GB prenosu. |
| Z12 | [Upstash — Pricing & Limits](https://upstash.com/docs/redis/overall/pricing), [New Pricing for Upstash Redis](https://upstash.com/blog/redis-new-pricing) | Free: 256 MB dát a **500 000 príkazov mesačne** (od marca 2025 nahradilo starý denný limit 10 000). |

---

## Nálezy a ich priradenie

| # | Nález | Zdroj | Platí pre Vilu 27? | Kam patrí |
|---|---|---|---|---|
| 1 | **Chýbajúce limity / DoS je najčastejšia chyba vôbec.** | Z1, Z2, Z3 | **Áno.** `POST /api/orders` bol úplne otvorený. Na Hobby pláne to znamená aj účet a vyčerpané kvóty. | **D1**, **B5**, D3 |
| 2 | **Slabá autorizácia, IDOR.** | Z1, Z3, Z4 (A01) | **Čiastočne.** Objednávky sa neadresujú podľa ID zvonku, takže klasické IDOR nehrozí. Riziko bolo inde: `/api/queue` sa dalo volať s tokenom v URL a `POST` prijímal token v tele. | **B3**, **B4**, B1 |
| 3 | **Zapísané tajomstvá a predvolené prihlasovacie údaje — najkritickejší nález.** | Z1, Z3, Z10, Z6 | **Áno.** `api/_auth.js` mal natvrdo `adminvila27 / adminvila27`. Token v `agent/config.json` mieril do gitu (chýbal `.gitignore`). | **A1**, **A2**, **B1** |
| 4 | **Chýbajúca autentifikácia ako chyba návrhu, nie preklep.** | Z6, Z2 | **Áno.** Overenie tokenu nekontrolovalo dĺžku ani to, či je vôbec nastavený. | **B1** |
| 5 | **Ceny a sumy prichádzajúce z prehliadača.** | Z2, Z4 (A06 Insecure Design) | **Áno, priamo.** Toto bola najdrahšia diera: košík posielal ceny. | **C1** |
| 6 | **XSS — obrana zlyháva v 86 % prípadov.** | Z3, Z7, Z8 | **Áno.** Nástenka `/admin-objednavky` skladala HTML z reťazcov vrátane poznámky zákazníka. | **C6** |
| 7 | **Injekcia do iného kanála než HTML/SQL.** | Z4 (A05), Z7 (log injection) | **Áno, a v nezvyčajnej podobe.** Text zákazníka ide do ESC/POS tlačiarne — `ESC p` otvorí zásuvku na peniaze, `GS V` odreže papier. | **C5**, J4 |
| 8 | **Príkazová injekcia cez shell.** | Z4 (A05), Z3 | **Áno.** Agent volá `copy /b` pre USB tlačiareň. Reťazcový príkaz by bol otvorené dvere. | **J2** |
| 9 | **Chýbajúce bezpečnostné hlavičky.** | Z3, Z4 (A02) | **Áno.** `vercel.json` mal len `X-Robots-Tag` na `/admin`. | **G1–G4** |
| 10 | **Wildcard CORS.** | Z3 | **Nie** — nikde nebol žiadny `Access-Control-Allow-Origin`. Doplnená je aspoň kontrola pôvodu na POST. | **C9** (overené testom) |
| 11 | **CSRF.** | Z3, Z4 (A01) | **Čiastočne.** `/api/orders` je verejný, takže CSRF nemá čo ukradnúť, ale cudzí web by cezeň mohol spamovať. Prihlásenie do správy ponuky používa `SameSite=Strict`. | **C9** |
| 12 | **SQL injection.** | Z3, Z4 (A05) | **Nie** — žiadna SQL databáza. Redis sa volá cez REST s poľom argumentov, nie skladaním príkazu. | — (uvedené v REPORT, časť K) |
| 13 | **SSRF a directory traversal.** | Z1, Z4 (A01) | **Čiastočne.** Server nesťahuje URL od používateľa. Statický server mohol servírovať čokoľvek z repozitára — to je príbuzný problém a bol skutočný. | **A3** |
| 14 | **Nahrávanie súborov.** | Z3 | **Nie** — nikde sa nedá nahrať súbor. | — |
| 15 | **Neoverené webhooky (Stripe a pod.).** | Z3 | **Nie** — neexistuje platobná brána, platí sa pri prevzatí. | — |
| 16 | **Slabé hashovanie hesiel.** | Z3 | **Nie tak, ako to myslia.** Heslá sa neukladajú, porovnávajú sa s premennou prostredia. Porovnanie je ale konštantné v čase, aby neunikla dĺžka. | **B2** |
| 17 | **Ukecané chybové hlášky a debug režim.** | Z1, Z3, Z8, Z4 (A10) | **Áno.** `/api/orders` vracal `storage: "redis"` a chyby Redisu sa dostávali do odpovede. | **A4**, **H1**, **H2** |
| 18 | **Halucinované balíky (slopsquatting).** | Z3, Z4 (A03) | **Nie** — projekt nemá ani jednu behovú závislosť a `package.json` sme vytvorili až teraz, prázdny. | **I1** |
| 19 | **Zlyhanie dodávateľského reťazca (A03, nové v 2025).** | Z4, Z5 | **Áno, v malom.** Stránka načítavala písmo z Google Fonts — cudzí server v kritickej ceste, bez SRI a bez súhlasu. | **F2**, G5 |
| 20 | **Chýbajúce logovanie a upozornenia (A09).** | Z4 | **Čiastočne.** Server loguje zlyhania, ale nikam neupozorňuje. Pri tejto veľkosti prevádzky je to primerané; nástenka aj agent hlásia výpadok obsluhe. | K (uvedené ako prijaté riziko) |
| 21 | **Nesprávne zvládnuté výnimočné stavy (A10, nové v 2025).** | Z4 | **Áno, nenápadne.** Pri výpadku Redisu sa ticho zapisovalo do pamäte serverless funkcie a objednávka sa stratila — zákazník aj tak videl „prijaté“. | **D2** |
| 22 | **Osobné údaje bez lehoty a bez informovania.** | GDPR čl. 5, 13 (nie je to typický „vibe“ nález, ale pri objednávkovom formulári je to prvé, čo skontroluje úrad) | **Áno.** V Redise neexistovala žiadna expirácia a stránka nemala informáciu o spracúvaní. | **E1–E4** |
| 23 | **Cookies a externý obsah bez súhlasu.** | zákon č. 452/2021 Z. z. § 109 ods. 8 | **Áno.** Mapa Google aj Google Fonts sa načítavali hneď pri otvorení stránky. | **F1, F3, F4, F5** |

---

## Čo z toho vyplynulo navyše (časť K)

Tieto veci vyšli z prieskumu alebo z obhliadky a v pôvodnom zozname A–J neboli:

- **K1 — Celý repozitár sa nasadzoval.** Vercel bez výstupného priečinka servíruje všetko.
  `agent/print-agent.js`, `SECURITY-GOAL.md`, `package.json` aj `menu.json` boli verejné.
  Súvisí s nálezom 13. → vyriešené presunom do `public/` (**A3**).
- **K2 — Interval agenta vs. bezplatné kvóty.** Otázka nákladov je aj otázka dostupnosti:
  vyčerpaná kvóta = nefunkčné objednávky. Prepočet je v `REPORT.md`, časť **D3**.
- **K3 — Vercel Hobby a komerčné použitie.** Hobby plán je pre nekomerčné projekty.
  Reštaurácia prijímajúca objednávky komerčná je. → **NEEDS MARTIN**.
- **K4 — Zdvojený príjem objednávky.** Dvojklik alebo obnovenie stránky vyrobili dve
  rovnaké objednávky. Nie je to únik, ale v kuchyni to narobí škodu. → **C8**.
- **K5 — Žiadne upozornenie pri zlyhaní (A09).** Prijaté riziko, popísané v REPORT.
- **K6 — Inline skripty a štýly.** Bez ich odstránenia sa nedá postaviť CSP bez
  `'unsafe-inline'`, teda ani reálna obrana proti XSS. → **G1**.

---

## Čo sa z prieskumu naopak nepotvrdilo

SQL injection, SSRF, nahrávanie súborov, webhooky platobnej brány, ukladanie hesiel
a halucinované balíky — nič z toho tento projekt nemá, lebo nemá databázu s SQL,
neposiela požiadavky na adresy od používateľa, neprijíma súbory, nespracúva platby,
neukladá heslá a nemá závislosti. Zapísané sú tu preto, aby bolo jasné, že sa
kontrolovali, a aby sa na ne pri ďalšej funkcii nezabudlo.
