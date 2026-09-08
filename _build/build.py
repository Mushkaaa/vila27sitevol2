# -*- coding: utf-8 -*-
"""Generuje statické HTML stránky Vily 27 zo spoločnej hlavičky/pätičky.
Spustenie:  python3 _build/build.py   (potrebuje Node kvôli menu-data.js)
Voliteľné – stránky sa dajú upravovať aj priamo v HTML."""
import json, subprocess, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)          # koreň projektu (stránky sa zapíšu sem)

IMG = "https://www.vila27.sk/images/"   # fotky klienta z pôvodného webu (skopírovať do /img)
PHONE = "+421 914 271 271"; PHONE_HREF = "tel:+421914271271"
MAIL = "info@vila27.sk"
HOURS = "11:00 – 21:30"
FB = "https://fb.me/vila27besenova"; IG = "https://www.instagram.com/vila27__besenova/"

LOGO_SYMBOL = open(os.path.join(HERE, "logo-symbol.html"), encoding="utf-8").read()
MENU = json.loads(subprocess.check_output(
    ["node", "-e", 'process.stdout.write(JSON.stringify(require(process.argv[1]).MENU))', os.path.join(OUT, "menu-data.js")]))

NAV = [("restauracia.html", "Reštaurácia"), ("jedalny-listok.html", "Jedálny lístok"),
       ("ubytovanie.html", "Ubytovanie"), ("volny-cas.html", "Voľný čas"), ("kontakt.html", "Kontakt")]

def head(title, desc, extra=""):
    return f"""<!DOCTYPE html>
<html lang="sk">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{title}</title>
<meta name="description" content="{desc}" />
<link rel="icon" href="favicon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;600;700;900&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="site.css" />
{extra}</head>
<body>
{LOGO_SYMBOL}
"""

def header():
    links = "\n".join(f'      <a href="{h}">{t}</a>' for h, t in NAV)
    mlinks = "\n".join(f'  <a href="{h}">{t}</a>' for h, t in [("index.html", "Domov")] + NAV)
    return f"""<header class="site-header">
  <div class="wrap">
    <a href="index.html" class="brand" aria-label="Vila 27 — domov"><svg viewBox="0 0 390 110"><use href="#logo-full"/></svg></a>
    <nav class="nav-main" aria-label="Hlavná navigácia">
{links}
    </nav>
    <div class="nav-actions">
      <a href="objednavka.html" class="btn btn-sm">Objednať online</a>
      <button class="burger" id="burger" aria-label="Otvoriť menu" aria-expanded="false" aria-controls="mobileNav"><span></span><span></span><span></span></button>
    </div>
  </div>
</header>
<nav class="mobile-nav" id="mobileNav" aria-label="Mobilná navigácia">
{mlinks}
  <div class="mobile-actions">
    <a href="objednavka.html" class="btn btn-white">Objednať online</a>
  </div>
  <p class="mobile-meta">Otvorené denne {HOURS}<br /><a href="{PHONE_HREF}">{PHONE}</a></p>
</nav>
"""

def footer(extra_js=""):
    return f"""<footer class="site-footer">
  <div class="wrap">
    <a href="index.html" class="brand" aria-label="Vila 27"><svg viewBox="0 0 390 110"><use href="#logo-full"/></svg></a>
    <div class="foot-grid">
      <div>
        <p>Reštaurácia, bar a ubytovanie v súkromí v Bešeňovej na Liptove, pár minút od termálneho aquaparku.</p>
      </div>
      <div>
        <h4>Kde nás nájdete</h4>
        <p>A. Hlinku 210<br />034 83 Bešeňová<br />Slovensko</p>
        <a href="https://maps.google.com/?q=Vila+27,+A.+Hlinku+210,+Bešeňová" target="_blank" rel="noopener">Otvoriť v mapách</a>
      </div>
      <div>
        <h4>Kontakt</h4>
        <a href="{PHONE_HREF}"><b>{PHONE}</b></a>
        <a href="mailto:{MAIL}">{MAIL}</a>
        <a href="{FB}" target="_blank" rel="noopener">Facebook</a>
        <a href="{IG}" target="_blank" rel="noopener">Instagram</a>
      </div>
      <div>
        <h4>Otváracie hodiny</h4>
        <p>Pondelok – nedeľa<br /><b>{HOURS}</b></p>
      </div>
    </div>
    <div class="foot-bottom">
      <span>© 2026 Vila 27. Všetky práva vyhradené.</span>
      <span><a href="jedalny-listok.html">Jedálny lístok</a> &nbsp;·&nbsp; <a href="objednavka.html">Objednať online</a> &nbsp;·&nbsp; <a href="kontakt.html">Kontakt</a></span>
    </div>
  </div>
</footer>
<script src="site.js"></script>
{extra_js}</body>
</html>
"""

def page_head(title, lede, tracked=None, extra=""):
    tr = f'<span class="tracked">{tracked}</span>' if tracked else ""
    return f"""<section class="page-head">
  <div class="wrap ledger">
    <div class="ledger-head">{tr}<h1>{title}</h1></div>
    <div class="ledger-rule" aria-hidden="true"></div>
    <div class="ledger-body"><p class="lede">{lede}</p>{extra}</div>
  </div>
</section>
"""

def photo(src, alt, cls="photo"):
    return f'<div class="{cls}"><img src="{IMG}{src}" alt="{alt}" loading="lazy" /></div>'

def gallery(folder, files, alt, thumb_prefix="thumb_"):
    a = "\n".join(
        f'  <a href="{IMG}{folder}/{f}" aria-label="{alt} {i+1}"><img src="{IMG}{folder}/thumbs/{thumb_prefix}{f}" alt="{alt} {i+1}" loading="lazy" /></a>'
        for i, f in enumerate(files))
    return f'<div class="gallery">\n{a}\n</div>'

def eur(n): return f"{n:.2f}".replace(".", ",") + " €"

def find(cat_id, item_id):
    for c in MENU:
        if c["id"] == cat_id:
            for i in c["items"]:
                if i["id"] == item_id: return i
    raise KeyError(item_id)

def write(name, html):
    open(os.path.join(OUT, name), "w", encoding="utf-8").write(html)
    print("→", name, len(html), "b")

# =====================================================================
# DOMOV
# =====================================================================
picks = [("pizza", "pz15"), ("jedla-z-liptova", "lp1"), ("burger-s-hranolkami", "bu1"),
         ("hlavne-jedla", "hj4"), ("salaty", "sa2"), ("dezerty", "de2")]
dishes = ""
for cid, iid in picks:
    it = find(cid, iid)
    name = (f"{it['no']}. " if it.get("no") else "") + it["name"]
    if cid == "pizza": name = "Pizza " + it["name"]
    desc = it.get("desc", "")
    dishes += f'    <li><div><b>{name}</b>{f"<small>{desc}</small>" if desc else ""}</div><span class="price">{eur(it["price"])}</span></li>\n'

index = head("Vila 27 — reštaurácia, bar & ubytovanie v Bešeňovej",
             "Vila 27 v Bešeňovej na Liptove: reštaurácia a bar s modernou aj tradičnou liptovskou kuchyňou, objednávka jedla online a ubytovanie v súkromí pár minút od termálneho aquaparku.") + header() + f"""
<main>
<section class="hero">
  <div class="hero-text">
    <h1 class="display">Dobre sa najesť a vyspať kúsok od termálnej vody.</h1>
    <p class="lede">Reštaurácia, bar a ubytovanie v súkromí v Bešeňovej na Liptove. Moderná kuchyňa aj liptovská klasika, vykurované terasy, izby a apartmány pár minút od aquaparku.</p>
    <div class="btn-row">
      <a href="objednavka.html" class="btn btn-white">Objednať jedlo online</a>
      <a href="jedalny-listok.html" class="btn btn-ghost-white">Jedálny lístok</a>
    </div>
    <div class="hero-facts">
      <div><b>Otvorené denne</b>{HOURS}</div>
      <div><b>A. Hlinku 210</b>Bešeňová, Liptov</div>
      <div><b>1 km</b>od aquaparku Bešeňová</div>
    </div>
  </div>
  <div class="hero-photo"><img src="{IMG}carousel/steak2.jpg" alt="Steak z reštaurácie Vila 27" /></div>
</section>

<section class="section">
  <div class="wrap ledger">
    <div class="ledger-head">
      <h2>Reštaurácia &amp; bar</h2>
      <p>Moderná aj tradičná liptovská kuchyňa, k tomu pivo, víno, miešané nápoje a dobrá káva.</p>
    </div>
    <div class="ledger-rule" aria-hidden="true"></div>
    <div class="ledger-body">
      <div class="text">
        <p>V priestrannej reštaurácii nájdete to najlepšie z modernej aj tradičnej liptovskej kuchyne: burgery, cestoviny, jedlá z mäsa a rýb, pizzu z ručne robeného cesta, aj pirohy a bryndzové halušky. Posedieť si môžete vnútri alebo na letnej či zimnej terase – obe sú v chladných mesiacoch vykurované.</p>
      </div>
      <ul class="dishes" style="margin-top:28px">
{dishes}      </ul>
      <div class="btn-row">
        <a href="jedalny-listok.html" class="btn">Celý jedálny lístok</a>
        <a href="restauracia.html" class="btn btn-outline">Viac o reštaurácii</a>
      </div>
      <div class="photo-strip">
        {photo("gallery/1.jpg", "Interiér reštaurácie Vila 27")}
        {photo("carousel/bar.jpg", "Bar vo Vile 27")}
        {photo("gallery/4.jpg", "Terasa reštaurácie")}
      </div>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap ledger">
    <div class="ledger-head">
      <h2>Ubytovanie</h2>
      <p>Priestranné izby a dvojizbové apartmány s raňajkami v cene.</p>
    </div>
    <div class="ledger-rule" aria-hidden="true"></div>
    <div class="ledger-body">
      <div class="text">
        <p>Izby sú moderne a pohodlne zariadené, aby ste si dovolenku na Liptove naozaj užili. Ráno vás čakajú raňajky v našej reštaurácii a za večerou nemusíte chodiť ďaleko – varíme priamo v dome.</p>
      </div>
      <ul class="facts">
        <li><span>Raňajky v reštaurácii</span><span>v cene</span></li>
        <li><span>Wi-Fi v celom objekte</span><span>zdarma</span></li>
        <li><span>Káblová televízia</span><span>každá izba</span></li>
        <li><span>Samostatné WC a kúpeľňa</span><span>každá izba</span></li>
        <li><span>Termálny aquapark Bešeňová</span><span>pár minút</span></li>
      </ul>
      <div class="btn-row">
        <a href="ubytovanie.html" class="btn">Viac o ubytovaní</a>
        <a href="kontakt.html" class="btn btn-outline">Rezervovať pobyt</a>
      </div>
      {photo("accomodation/izba2.jpg", "Izba vo Vile 27", "photo photo-wide")}
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap ledger">
    <div class="ledger-head">
      <h2>Voľný čas na Liptove</h2>
      <p>Bešeňová leží na pomedzí horného a dolného Liptova – všade je blízko.</p>
    </div>
    <div class="ledger-rule" aria-hidden="true"></div>
    <div class="ledger-body">
      <div class="text">
        <p>Termálne kúpaliská, lyžiarske strediská, jaskyne, hrady a Liptovská Mara. V lete aj v zime je Vila 27 dobrým východiskom pre výlety po celom regióne.</p>
      </div>
      <ul class="facts">
        <li><span>Aquapark Bešeňová</span><span>1 km</span></li>
        <li><span>Kúpele Lúčky – Aqua Vital Wellness</span><span>6 km</span></li>
        <li><span>SkiPark Ružomberok</span><span>15 km</span></li>
        <li><span>Tatralandia</span><span>16 km</span></li>
        <li><span>Vlkolínec (UNESCO)</span><span>17 km</span></li>
        <li><span>Jasná – Nízke Tatry</span><span>29 km</span></li>
      </ul>
      <div class="btn-row">
        <a href="volny-cas.html" class="btn btn-outline">Všetky tipy na okolie</a>
      </div>
    </div>
  </div>
</section>

<section class="band">
  <div class="wrap ledger">
    <div class="ledger-head">
      <h2>Objednajte si jedlo online</h2>
      <p>Rozvoz po Bešeňovej a okolí alebo osobný odber v reštaurácii.</p>
    </div>
    <div class="ledger-rule" aria-hidden="true"></div>
    <div class="ledger-body">
      <p class="lede">Vyberiete si z jedálneho lístka, pridáte do košíka a zaplatíte pri prevzatí – v hotovosti alebo kartou. Objednávku vidí kuchyňa hneď po odoslaní.</p>
      <div class="btn-row">
        <a href="objednavka.html" class="btn btn-white">Objednať online</a>
        <a href="{PHONE_HREF}" class="btn btn-ghost-white">Zavolať {PHONE}</a>
      </div>
    </div>
  </div>
</section>
</main>
""" + footer()
write("index.html", index)

# =====================================================================
# REŠTAURÁCIA & BAR
# =====================================================================
rest = head("Reštaurácia & bar — Vila 27, Bešeňová",
            "Reštaurácia a bar Vila 27 v Bešeňovej: moderná aj liptovská kuchyňa, pizza, burgery, vykurované terasy, veľkoplošné TV, detský kútik a posedenia pre uzavretú spoločnosť.") + header() + f"""
<main>
{page_head("Reštaurácia &amp; bar", "V priestrannej reštaurácii nájdete to najlepšie z modernej aj tradičnej liptovskej kuchyne. Hamburgery, cestoviny, jedlá z mäsa a rýb, pizza, aj pirohy a bryndzové halušky. K tomu široký výber piva, vína, destilátov a miešaných nápojov.", "Vila 27")}

<section class="section">
  <div class="wrap ledger">
    <div class="ledger-head">
      <h2>Priestor</h2>
      <p>Vnútri, na terase, pri športe alebo s deťmi.</p>
    </div>
    <div class="ledger-rule" aria-hidden="true"></div>
    <div class="ledger-body">
      <div class="text">
        <p>Okrem interiéru si môžete posedieť aj na letnej alebo zimnej terase – v zimných mesiacoch sú obe vykurované. V reštaurácii sú veľkoplošné televízory na športové prenosy a spoľahlivé Wi-Fi. Pre najmenších máme trampolínu a množstvo hračiek.</p>
        <p>Priestory reštaurácie sú nefajčiarske s výnimkou exteriérovej terasy.</p>
      </div>
      <ul class="facts">
        <li><span>Letná a zimná terasa</span><span>v zime vykurované</span></li>
        <li><span>Veľkoplošné televízory</span><span>športové prenosy</span></li>
        <li><span>Wi-Fi</span><span>zdarma</span></li>
        <li><span>Trampolína a hračky</span><span>pre deti</span></li>
        <li><span>Fajčenie</span><span>len vonkajšia terasa</span></li>
      </ul>
      {gallery("gallery", ["1.jpg","2.jpg","3.jpg","4.jpg","5.jpg","6.jpg"], "Reštaurácia Vila 27").replace('class="gallery"', 'class="gallery cols-3"')}
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap ledger">
    <div class="ledger-head">
      <h2>Bar</h2>
      <p>Štýlovo zariadený bar so širokou ponukou nápojov.</p>
    </div>
    <div class="ledger-rule" aria-hidden="true"></div>
    <div class="ledger-body">
      <div class="text">
        <p>Ochutnajte z ponuky slovenských vín, čapovaného piva, destilátov a miešaných nápojov – od klasického Mojita a Aperol Spritzu až po matcha limonády. Po dobrom jedle padne vhod aj šálka kávy alebo horúca čokoláda.</p>
      </div>
      <div class="btn-row">
        <a href="jedalny-listok.html#napoje" class="btn btn-outline">Nápojový lístok</a>
      </div>
      {photo("blog/intro/wine.jpg", "Bar vo Vile 27", "photo photo-wide")}
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap ledger">
    <div class="ledger-head">
      <h2>Oslavy a uzavretá spoločnosť</h2>
      <p>Do 30 osôb.</p>
    </div>
    <div class="ledger-rule" aria-hidden="true"></div>
    <div class="ledger-body">
      <div class="text">
        <p>Ak chcete usporiadať oslavu, firemné posedenie alebo rodinné stretnutie, ozvite sa nám. V reštaurácii vieme pripraviť posedenie pre uzavretú spoločnosť do kapacity 30 ľudí – dohodneme menu aj termín.</p>
      </div>
      <div class="btn-row">
        <a href="kontakt.html" class="btn">Napísať nám</a>
        <a href="{PHONE_HREF}" class="btn btn-outline">{PHONE}</a>
      </div>
    </div>
  </div>
</section>

<section class="band">
  <div class="wrap ledger">
    <div class="ledger-head">
      <h2>Jedálny lístok</h2>
      <p>Aktuálna ponuka s alergénmi a cenami.</p>
    </div>
    <div class="ledger-rule" aria-hidden="true"></div>
    <div class="ledger-body">
      <p class="lede">Pozrite si celý jedálny a nápojový lístok, alebo si jedlo rovno objednajte – rozvozom po Bešeňovej a okolí alebo na osobný odber.</p>
      <div class="btn-row">
        <a href="jedalny-listok.html" class="btn btn-white">Jedálny lístok</a>
        <a href="objednavka.html" class="btn btn-ghost-white">Objednať online</a>
      </div>
    </div>
  </div>
</section>
</main>
""" + footer()
write("restauracia.html", rest)

# =====================================================================
# JEDÁLNY LÍSTOK (vykresľuje sa z menu-data.js)
# =====================================================================
menu_page = head("Jedálny a nápojový lístok — Vila 27, Bešeňová",
                 "Jedálny a nápojový lístok reštaurácie Vila 27 v Bešeňovej: predjedlá, polievky, jedlá z Liptova, hlavné jedlá, burgery, pizza, dezerty, víno, pivo a miešané nápoje. Ceny a alergény.") + header() + f"""
<main>
{page_head("Jedálny lístok", "Pri každom jedle uvádzame gramáž a alergény. Ceny sú v eurách vrátane DPH. Jedlo si môžete objednať aj online na rozvoz alebo osobný odber.", "Reštaurácia &amp; bar",
           '<div class="btn-row" style="margin-top:20px"><a href="objednavka.html" class="btn">Objednať online</a><a href="#napoje" class="btn btn-outline">Nápojový lístok</a></div>')}

<div class="wrap menu-layout">
  <nav class="menu-nav" id="menuNav" aria-label="Kategórie lístka">
    <div class="menu-nav-scroll" id="menuNavScroll"></div>
  </nav>
  <div class="ledger-rule" aria-hidden="true"></div>
  <div id="menu">
    <noscript><p>Na zobrazenie jedálneho lístka je potrebný JavaScript. Zavolajte nám na <a href="{PHONE_HREF}">{PHONE}</a>.</p></noscript>
  </div>
</div>
</main>
""" + footer(f"""<script src="menu-data.js"></script>
<script>
(function () {{
  var M = window.VILA27_MENU, MENU = M.MENU;
  var eur = function (n) {{ return n.toFixed(2).replace(".", ",") + " €"; }};
  var esc = function (s) {{ return String(s == null ? "" : s).replace(/[<>&"]/g, function (c) {{ return {{"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}}[c]; }}); }};

  var nav = document.getElementById("menuNavScroll");
  var root = document.getElementById("menu");
  var html = "", navHtml = "";
  ["food", "drink"].forEach(function (kind) {{
    var cats = MENU.filter(function (c) {{ return c.kind === kind; }});
    var title = kind === "food" ? "Jedlá" : "Nápoje";
    navHtml += '<span class="tracked">' + title + '</span>';
    html += '<section class="menu-kind" id="' + (kind === "food" ? "jedla" : "napoje") + '"><h2 class="menu-kind-title">' + title + '</h2>';
    cats.forEach(function (c) {{
      navHtml += '<a href="#cat-' + c.id + '">' + esc(c.cat) + '</a>';
      html += '<section class="menu-cat" id="cat-' + c.id + '"><h2>' + esc(c.cat) + '</h2>';
      if (c.note) html += '<p class="cat-note">' + esc(c.note) + '</p>';
      c.items.forEach(function (it) {{
        if (it.orderOnly) return;
        var name = (it.no ? it.no + ". " : "") + it.name;
        html += '<div class="m-item">' + (it.w ? '<span class="m-w">' + esc(it.w) + '</span>' : "") + '<span class="m-name">' + esc(name) + '</span>' +
                '<span class="m-price">' + eur(it.price) + '</span>';
        if (it.desc) html += '<p class="m-desc">' + esc(it.desc) + '</p>';
        if (it.alg) html += '<p class="m-alg">alergény: ' + esc(it.alg) + '</p>';
        (it.menuAddons || []).forEach(function (a) {{ html += '<div class="m-add"><span>+ ' + esc(a.name) + '</span><span>' + eur(a.price) + '</span></div>'; }});
        html += '</div>';
      }});
      if (c.extras && c.extras.length) {{
        html += '<div class="m-extras">' + c.extras.map(function (a) {{ return '<div><span>+ ' + esc(a.name) + '</span><span>' + eur(a.price) + '</span></div>'; }}).join("") + '</div>';
      }}
      if (c.id === "pizza") {{
        html += '<div class="m-extras"><h4>Pizza doplnky</h4>' + M.TOPPINGS.map(function (g) {{
          return '<div><span>' + esc(g.g) + ' ' + esc(g.items.join(", ")) + (g.alg ? ' <span class="m-alg" style="display:inline">(alergény: ' + esc(g.alg) + ')</span>' : "") + '</span><span>' + eur(g.price) + '</span></div>';
        }}).join("") + '</div>';
      }}
      html += '</section>';
    }});
    html += '</section>';
  }});
  html += '<p class="menu-foot">Zoznam alergénov: 1 lepok, 3 vajcia, 4 ryby, 7 mlieko, 9 zeler, 10 horčica, 11 sezam, 12 siričitany. Váhy sú uvedené v surovom stave. Zmeny v ponuke vyhradené.</p>';
  root.innerHTML = html;
  nav.innerHTML = navHtml;

  /* zvýraznenie aktívnej kategórie */
  var links = {{}};
  nav.querySelectorAll("a").forEach(function (a) {{ links[a.getAttribute("href").slice(1)] = a; }});
  var io = new IntersectionObserver(function (entries) {{
    entries.forEach(function (e) {{
      if (e.isIntersecting && links[e.target.id]) {{
        nav.querySelectorAll("a.on").forEach(function (a) {{ a.classList.remove("on"); }});
        links[e.target.id].classList.add("on");
        if (window.matchMedia("(max-width: 900px)").matches) links[e.target.id].scrollIntoView({{ inline: "center", block: "nearest" }});
      }}
    }});
  }}, {{ rootMargin: "-30% 0px -60% 0px" }});
  root.querySelectorAll(".menu-cat").forEach(function (s) {{ io.observe(s); }});
}})();
</script>
""")
write("jedalny-listok.html", menu_page)

# =====================================================================
# OBJEDNÁVKA
# =====================================================================
order_page = head("Objednať jedlo online — Vila 27, Bešeňová",
                  "Objednajte si jedlo z reštaurácie Vila 27 online: rozvoz po Bešeňovej a okolí alebo osobný odber. Platba v hotovosti alebo kartou pri prevzatí.") + header() + f"""
<main>
<section class="page-head">
  <div class="wrap ledger">
    <div class="ledger-head"><span class="tracked">Reštaurácia &amp; bar</span><h1>Objednávka online</h1></div>
    <div class="ledger-rule" aria-hidden="true"></div>
    <div class="ledger-body">
      <p class="lede">Vyberte si z ponuky, pridajte do košíka a dokončite objednávku. Rozvoz po Bešeňovej a okolí alebo osobný odber priamo v reštaurácii.</p>
      <div class="order-modes" role="group" aria-label="Spôsob prevzatia" style="margin-top:22px">
        <button type="button" class="mode-btn" data-mode="rozvoz" aria-pressed="true">Rozvoz</button>
        <button type="button" class="mode-btn" data-mode="odber" aria-pressed="false">Osobný odber</button>
      </div>
    </div>
  </div>
</section>

<div class="wrap order-layout">
  <div class="order-menu" id="menuCol">
    <noscript><p>Na online objednávku je potrebný JavaScript. Zavolajte nám na <a href="{PHONE_HREF}">{PHONE}</a>.</p></noscript>
  </div>
  <aside>
    <div class="cart" id="cart">
      <div class="cart-head">
        <h3>Váš košík</h3>
        <span id="modeLabel">Rozvoz · Bešeňová a okolie</span>
      </div>
      <div class="cart-body" id="cartBody"></div>
      <div class="cart-foot">
        <div class="row"><span>Medzisúčet</span><span id="subtotal">0,00 €</span></div>
        <div class="row" id="feeRow"><span>Doprava</span><span id="fee">2,50 €</span></div>
        <div class="row total"><span>Spolu</span><span id="total">0,00 €</span></div>
        <button class="btn btn-block" id="checkoutBtn" disabled>Pokračovať k objednávke</button>
      </div>
    </div>
    <p class="order-info">Objednávky prijímame denne <b>{HOURS}</b>. Platba v hotovosti alebo kartou pri prevzatí. Kuriér vám pri rozvoze zavolá z čísla <a href="tel:+421910201271"><b>+421 910 201 271</b></a>. Otázky: <a href="{PHONE_HREF}"><b>{PHONE}</b></a>.</p>
  </aside>
</div>
<button class="cart-pill" id="cartPill" type="button">Košík <b id="pillCount">0</b></button>
</main>

<div class="modal-back" id="orderModal" role="dialog" aria-modal="true" aria-labelledby="orderTitle">
  <form class="modal" id="orderForm">
    <div class="modal-head">
      <div>
        <h3 id="orderTitle">Údaje k objednávke</h3>
        <p>Vyplňte kontaktné údaje a odošlite objednávku.</p>
      </div>
      <button type="button" class="modal-close" id="orderClose" aria-label="Zavrieť">×</button>
    </div>
    <div class="modal-body">
      <div class="grid2">
        <div class="field"><label for="f-name">Meno a priezvisko</label><input id="f-name" required name="name" autocomplete="name" /></div>
        <div class="field"><label for="f-phone">Telefón</label><input id="f-phone" required name="phone" type="tel" autocomplete="tel" placeholder="+421 …" /></div>
      </div>
      <div class="field" id="addrField"><label for="f-addr">Adresa doručenia</label><input id="f-addr" name="address" autocomplete="street-address" placeholder="Ulica a číslo, obec" /></div>
      <div class="grid2">
        <div class="field"><label for="f-time">Čas</label>
          <select id="f-time" name="time">
            <option>Čo najskôr</option>
            <option>Do 30 minút</option>
            <option>Do 1 hodiny</option>
            <option>Neskôr (uvediem v poznámke)</option>
          </select>
        </div>
        <div class="field"><label for="f-pay">Platba</label>
          <select id="f-pay" name="pay">
            <option>Hotovosť pri prevzatí</option>
            <option>Kartou pri prevzatí</option>
          </select>
        </div>
      </div>
      <div class="field"><label for="f-note">Poznámka</label><textarea id="f-note" name="note" rows="2" placeholder="Alergie, zvonček, čas…"></textarea></div>
    </div>
    <div class="modal-foot">
      <div class="sum"><span>Spolu</span><span id="orderTotal">0,00 €</span></div>
      <button class="btn btn-block" type="submit">Odoslať objednávku</button>
    </div>
  </form>
</div>

<div class="modal-back" id="topModal" role="dialog" aria-modal="true" aria-labelledby="topTitle">
  <div class="modal">
    <div class="modal-head">
      <div>
        <h3 id="topTitle">Doplnky</h3>
        <p id="topFor"></p>
      </div>
      <button type="button" class="modal-close" id="topClose" aria-label="Zavrieť">×</button>
    </div>
    <div class="modal-body" id="topBody"></div>
    <div class="modal-foot">
      <div class="sum"><span>Spolu</span><span id="topSum"></span></div>
      <button type="button" class="btn btn-block" id="topAdd">Pridať do košíka</button>
      <button type="button" class="btn btn-outline btn-block" id="topSkip">Bez doplnkov</button>
    </div>
  </div>
</div>

<div class="toast" id="toast" role="status" aria-live="polite"></div>
""" + footer("""<script src="menu-data.js"></script>
<script src="objednavka.js"></script>
""")
write("objednavka.html", order_page)

# =====================================================================
# UBYTOVANIE
# =====================================================================
stay = head("Ubytovanie — Vila 27, Bešeňová",
            "Ubytovanie v súkromí vo Vile 27 v Bešeňovej: priestranné izby a dvojizbové apartmány s raňajkami, Wi-Fi a káblovou TV, pár minút od termálneho aquaparku Bešeňová.") + header() + f"""
<main>
{page_head("Ubytovanie", "Vila 27 ponúka ubytovanie v súkromí v priestranných izbách alebo dvojizbových apartmánoch. Izby sú moderne a pohodlne zariadené, aby ste si dovolenku na Liptove naozaj užili. Ubytovanie ponúkame s raňajkami v našej reštaurácii.", "Vila 27",
           f'<div class="btn-row" style="margin-top:20px"><a href="kontakt.html" class="btn">Rezervovať pobyt</a><a href="{PHONE_HREF}" class="btn btn-outline">{PHONE}</a></div>')}

<section class="section">
  <div class="wrap ledger">
    <div class="ledger-head">
      <h2>Izby a apartmány</h2>
      <p>Pohodlie a relax pár minút od termálnej vody.</p>
    </div>
    <div class="ledger-rule" aria-hidden="true"></div>
    <div class="ledger-body">
      <ul class="facts">
        <li><span>Raňajky v našej reštaurácii</span><span>v cene</span></li>
        <li><span>Wi-Fi v celom objekte</span><span>zdarma</span></li>
        <li><span>Káblová televízia</span><span>každá izba</span></li>
        <li><span>Samostatné WC a kúpeľňa</span><span>každá izba</span></li>
        <li><span>Požičovňa bicyklov</span><span>pripravujeme</span></li>
        <li><span>Reštaurácia a bar</span><span>priamo v dome</span></li>
      </ul>
      {gallery("gallery2", [f"{i:02d}.jpg" for i in range(1, 13)], "Izba vo Vile 27")}
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap ledger">
    <div class="ledger-head">
      <h2>Cena a rezervácia</h2>
      <p>Ozvite sa nám cez formulár alebo telefonicky.</p>
    </div>
    <div class="ledger-rule" aria-hidden="true"></div>
    <div class="ledger-body">
      <div class="text">
        <p>V cene ubytovania sú raňajky v našej reštaurácii a obecný poplatok za lôžko. Ak izba nie je plne obsadená (napríklad dvojlôžková izba pre jednu osobu), radi vám pripravíme individuálnu cenovú ponuku.</p>
        <p>Hostia môžu využiť výhodné vstupy do aquaparku Bešeňová alebo Tatralandia – spýtajte sa pri rezervácii.</p>
      </div>
      <div class="btn-row">
        <a href="kontakt.html" class="btn">Rezervovať pobyt</a>
        <a href="mailto:{MAIL}" class="btn btn-outline">{MAIL}</a>
      </div>
    </div>
  </div>
</section>

<section class="band">
  <div class="wrap ledger">
    <div class="ledger-head">
      <h2>Čo robiť na Liptove</h2>
      <p>Aquaparky, lyžovanie, hory, jaskyne a hrady.</p>
    </div>
    <div class="ledger-rule" aria-hidden="true"></div>
    <div class="ledger-body">
      <p class="lede">Bešeňová leží na pomedzí horného a dolného Liptova. Termálna voda je o kilometer ďalej, lyžiarske strediská do polhodiny cesty a Liptovská Mara na skok.</p>
      <div class="btn-row">
        <a href="volny-cas.html" class="btn btn-white">Tipy na voľný čas</a>
      </div>
    </div>
  </div>
</section>
</main>
""" + footer()
write("ubytovanie.html", stay)

# =====================================================================
# VOĽNÝ ČAS
# =====================================================================
def facts(rows):
    out = ""
    for r in rows:
        if len(r) == 1:
            out += f'        <li class="sec">{r[0]}</li>\n'; continue
        name, dist, link = (r + (None,))[:3]
        label = f'<a href="{link}" target="_blank" rel="noopener">{name}</a>' if link else name
        out += f'        <li><span>{label}</span><span>{dist}</span></li>\n'
    return f'      <ul class="facts">\n{out}      </ul>'

leisure = head("Voľný čas na Liptove — Vila 27, Bešeňová",
               "Tipy na voľný čas v okolí Vily 27 v Bešeňovej: termálne kúpaliská a aquaparky, lyžiarske strediská, turistika, cykloturistika, jaskyne, hrady a múzeá Liptova.") + header() + f"""
<main>
{page_head("Voľný čas", "Liptov ponúka priestor pre letné aj zimné športy a vychádzky do prírody. Vila 27 leží na pomedzí horného a dolného Liptova, takže je dobrým východiskom pre akýkoľvek druh aktivít. Vzdialenosti sú od Vily 27.", "Liptov")}

<section class="section">
  <div class="wrap ledger">
    <div class="ledger-head">
      <h2>Kúpanie a vodné športy</h2>
      <p>Termálna voda po celý rok, v lete aj Liptovská Mara.</p>
    </div>
    <div class="ledger-rule" aria-hidden="true"></div>
    <div class="ledger-body">
{facts([
  ("Aquapark Bešeňová", "1 km", "https://www.besenova.com"),
  ("Kúpele Lúčky – Aqua Vital Wellness", "6 km", "https://www.kupele-lucky.sk/aqua-vital-wellness/"),
  ("Tatralandia – aquapark a zábavný park", "16 km", "https://www.tatralandia.sk/"),
  ("Aquapark Gothal, Liptovská Osada", "25 km", "https://www.gothal.sk"),
  ("AquaRelax Dolný Kubín", "28 km", "https://www.aquakubin.eu/"),
])}
      <div class="text" style="margin-top:28px">
        <p>V lete sa dá zájsť aj na kúpalisko v Liptovskom Jáne alebo k prírodnej termálnej vyvieračke v Kalamenoch. Liptovská Mara láka na vodné športy, rybolov a plavbu výletnou loďou. Rybárčiť sa dá aj na Váhu, pár desiatok metrov za Vilou 27.</p>
      </div>
      {gallery("gallery5", ["tatralandia.jpg", "tatralandia2.jpg", "01.jpg", "02.jpg"], "Kúpanie na Liptove")}
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap ledger">
    <div class="ledger-head">
      <h2>Lyžovanie</h2>
      <p>Od obecných vlekov po Jasnú. Väčšina stredísk má umelé zasnežovanie.</p>
    </div>
    <div class="ledger-rule" aria-hidden="true"></div>
    <div class="ledger-body">
{facts([
  ("Kalameny – obecný vlek", "5 km"),
  ("Turík – obecný vlek", "5 km"),
  ("Lúčky – obecný vlek", "6 km"),
  ("SkiPark Ružomberok", "15 km", "https://www.skipark.sk/"),
  ("Jasná, Nízke Tatry", "29 km", "https://www.jasna.sk/"),
  ("Park Snow Donovaly", "37 km", "https://www.parksnow.sk/"),
])}
      <div class="text" style="margin-top:28px">
        <p>V okolitých pohoriach sú aj výborné možnosti na skialpinizmus, freeride a bežky. Za zmienku stojí freeridová zóna v Jasnej pod Chopkom.</p>
      </div>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap ledger">
    <div class="ledger-head">
      <h2>Hory, turistika, bicykel</h2>
      <p>Chočské vrchy, Nízke a Západné Tatry, Veľká Fatra.</p>
    </div>
    <div class="ledger-rule" aria-hidden="true"></div>
    <div class="ledger-body">
{facts([
  ("Turistika",),
  ("Prosiecka a Kvačianska dolina", "tiesňavy"),
  ("Chočské vrchy – Choč, Liptovský hrad", "túry"),
  ("Nízke Tatry – Chopok, Ďumbier", "lanovka na Chopok", "https://www.jasna.sk/"),
  ("Západné Tatry – Žiarska dolina, Baranec, Bystrá", "vysokohorské túry"),
  ("Veľká Fatra – Ploská, Borišov, Krížna, Malinô Brdo", "lanovka na Malinô Brdo", "https://www.skipark.sk/"),
  ("Cykloturistika a bike parky",),
  ("Cyklokorytnička, Ružomberok", "10 km"),
  ("Bike Park Malinô Brdo", "15 km", "https://www.bikepark.sk/"),
  ("Bike World Jasná", "29 km", "https://www.jasna.sk/"),
  ("Bike Park Donovaly", "37 km", "https://www.parksnow.sk/"),
  ("Cyklotrasy okolo Liptovskej Mary", "od dverí"),
  ("Lanové parky a lezenie",),
  ("Tarzánia Hrabovo", "15 km", "https://www.tarzania.sk/"),
  ("Tarzánia Jasná", "29 km", "https://www.tarzania.sk/"),
  ("Skalolezecké lokality Haliny, Machnaté a ďalšie", "okolie", "https://www.lezci.sk/lokality"),
])}
      {gallery("gallery5", ["03.jpg", "04.jpg", "05.jpg", "06.jpg"], "Hory Liptova")}
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap ledger">
    <div class="ledger-head">
      <h2>Jaskyne, pamiatky a hrady</h2>
      <p>Krasové útvary, ľudová architektúra a múzeá regiónu.</p>
    </div>
    <div class="ledger-rule" aria-hidden="true"></div>
    <div class="ledger-body">
{facts([
  ("Jaskyne",),
  ("Demänovská ľadová jaskyňa", "23 km", "https://www.ssj.sk/sk/jaskyna/5-demanovska-ladova-jaskyna"),
  ("Demänovská jaskyňa Slobody", "25 km", "https://www.ssj.sk/sk/jaskyna/4-demanovska-jaskyna-slobody"),
  ("Stanišovská jaskyňa", "28 km", "https://www.stanisovska.sk/"),
  ("Važecká jaskyňa", "46 km", "https://www.ssj.sk/sk/jaskyna/13-vazecka-jaskyna"),
  ("Kultúra a ľudová architektúra",),
  ("Archeoskanzen Havránok", "10 km", "https://liptovskemuzeum.sk/"),
  ("Liptovské múzeum a Galéria Ľudovíta Fullu, Ružomberok", "12 km", "https://liptovskemuzeum.sk/"),
  ("Vlkolínec – pamiatka UNESCO", "17 km", "https://www.vlkolinec.sk/"),
  ("Slovenské múzeum ochrany prírody a jaskyniarstva, L. Mikuláš", "18 km", "https://www.smopaj.sk/sk"),
  ("Múzeum liptovskej dediny, Pribylina", "36 km"),
  ("Hrady",),
  ("Hrad Likava", "14 km"),
  ("Oravský hrad", "35 km"),
  ("Hrad Strečno", "65 km", "https://www.hradstrecno.sk/"),
])}
      {gallery("gallery5", ["07.jpg", "08.jpg", "09.jpg", "10.jpg", "11.jpg", "12.jpg"], "Pamiatky Liptova")}
    </div>
  </div>
</section>

<section class="band">
  <div class="wrap ledger">
    <div class="ledger-head">
      <h2>Prespite u nás</h2>
      <p>Izby a apartmány s raňajkami.</p>
    </div>
    <div class="ledger-rule" aria-hidden="true"></div>
    <div class="ledger-body">
      <p class="lede">Po celom dni v horách alebo vo vode sa vráťte na dobrú večeru a do pohodlnej izby. Za stravou nemusíte chodiť ďaleko – reštaurácia je priamo v dome.</p>
      <div class="btn-row">
        <a href="ubytovanie.html" class="btn btn-white">Ubytovanie</a>
        <a href="kontakt.html" class="btn btn-ghost-white">Rezervovať</a>
      </div>
    </div>
  </div>
</section>
</main>
""" + footer()
write("volny-cas.html", leisure)

# =====================================================================
# KONTAKT
# =====================================================================
contact = head("Kontakt — Vila 27, Bešeňová",
               "Kontakt na Vilu 27 v Bešeňovej: A. Hlinku 210, telefón +421 914 271 271, info@vila27.sk. Rezervácia stola, ubytovania alebo osláv.") + header() + f"""
<main>
{page_head("Kontakt", "Napíšte nám alebo zavolajte – radi vám rezervujeme stôl, ubytovanie alebo pripravíme posedenie pre uzavretú spoločnosť.", "Vila 27")}

<div class="wrap contact-grid">
  <div>
    <ul class="contact-list">
      <li><span>Adresa</span><span>A. Hlinku 210<small>034 83 Bešeňová, Slovensko</small></span></li>
      <li><span>Telefón</span><span><a href="{PHONE_HREF}">{PHONE}</a></span></li>
      <li><span>E-mail</span><span><a href="mailto:{MAIL}">{MAIL}</a></span></li>
      <li><span>Otvorené</span><span>Pondelok – nedeľa<small>{HOURS}</small></span></li>
      <li><span>Sociálne siete</span><span><a href="{FB}" target="_blank" rel="noopener">Facebook</a><br /><a href="{IG}" target="_blank" rel="noopener">Instagram</a></span></li>
    </ul>

    <h3 style="margin:40px 0 12px">Fakturačné údaje</h3>
    <ul class="contact-list tight">
      <li><span>Prevádzkovateľ</span><span>Bc. Tomáš Remenár</span></li>
      <li><span>Sídlo</span><span>Karola Salvu 1985/9<small>034 01 Ružomberok</small></span></li>
      <li><span>IČO</span><span>40 930 661</span></li>
      <li><span>DIČ</span><span>1071013284</span></li>
      <li><span>IČ DPH</span><span>SK1071013284</span></li>
    </ul>

    <div class="map">
      <iframe title="Mapa – Vila 27, Bešeňová"
        src="https://www.google.com/maps?q=Vila+27,+A.+Hlinku+210,+034+83+Be%C5%A1e%C5%88ov%C3%A1&output=embed"
        loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
    </div>
  </div>

  <form class="contact-form" id="contactForm">
    <h2>Rezervácia a otázky</h2>
    <p>Ozveme sa čo najskôr. Pre rýchlu rezerváciu stola zavolajte na <a href="{PHONE_HREF}">{PHONE}</a>.</p>
    <div class="grid2">
      <div class="field"><label for="c-name">Meno a priezvisko</label><input id="c-name" required name="name" autocomplete="name" /></div>
      <div class="field"><label for="c-phone">Telefón</label><input id="c-phone" name="phone" type="tel" autocomplete="tel" placeholder="+421 …" /></div>
    </div>
    <div class="field"><label for="c-mail">E-mail</label><input id="c-mail" required name="email" type="email" autocomplete="email" /></div>
    <div class="field"><label for="c-subj">Predmet</label>
      <select id="c-subj" name="subject">
        <option>Rezervácia stola</option>
        <option>Ubytovanie</option>
        <option>Oslava / uzavretá spoločnosť</option>
        <option>Iné</option>
      </select>
    </div>
    <div class="field"><label for="c-msg">Správa</label><textarea id="c-msg" required name="message" rows="5" placeholder="Termín, počet osôb, poznámky…"></textarea></div>
    <button class="btn btn-block" type="submit">Odoslať správu</button>
    <p class="form-note" id="formNote">Formulár zatiaľ správy neodosiela (testovacia prevádzka). Napíšte nám na <a href="mailto:{MAIL}">{MAIL}</a>.</p>
  </form>
</div>
</main>
""" + footer("""<script>
  (function () {
    var f = document.getElementById("contactForm");
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = f.name.value.split(" ")[0] || "";
      document.getElementById("formNote").textContent = "Ďakujeme" + (name ? ", " + name : "") + ". Správu sme prijali (testovacia prevádzka) – čoskoro sa ozveme.";
      f.reset();
    });
  })();
</script>
""")
write("kontakt.html", contact)
print("hotovo")
