/* Vila 27 — súhlas s cookies a externým obsahom.
   Vanilla JS, žiadny externý CMP, žiadny inline kód (kvôli CSP, G1).

   Zákon 452/2021 Z. z. § 109 ods. 8 + GDPR:
   – nič, čo nie je nevyhnutné, sa nespustí pred súhlasom,
   – odmietnuť musí byť rovnako ľahké ako prijať (žiadne tmavé vzory),
   – súhlas sa dá kedykoľvek zmeniť odkazom „Nastavenia cookies“ v päte.
*/
(function () {
  "use strict";

  var KLUC = "vila27_suhlas";
  var VERZIA = 1;                       // zmena verzie = pýtame sa znova
  var PLATNOST_DNI = 365;               // 12 mesiacov

  var KATEGORIE = [
    {
      id: "nevyhnutne", nazov: "Nevyhnutné", vzdy: true,
      popis: "Potrebné na fungovanie stránky: zapamätanie si vašej voľby v tomto okne a obsah košíka počas objednávky. Bez nich by sa stránka nedala používať. Neukladajú sa na ne žiadne identifikátory na sledovanie."
    },
    {
      id: "externy", nazov: "Externý obsah",
      popis: "Mapa Google na stránke Kontakt. Keď ju povolíte, spoločnosť Google sa dozvie vašu IP adresu a môže si uložiť vlastné cookies. Bez súhlasu sa mapa nenačíta a namiesto nej ponúkame obyčajný odkaz."
    },
    {
      id: "analyticke", nazov: "Analytické",
      popis: "Anonymné meranie návštevnosti. Momentálne žiadnu analytiku nepoužívame – voľba je pripravená, keby sme ju v budúcnosti zaviedli."
    }
  ];

  /* ---------- uloženie voľby ---------- */

  function nacitaj() {
    try {
      var raw = localStorage.getItem(KLUC);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || d.v !== VERZIA || !d.ts) return null;
      if (Date.now() - d.ts > PLATNOST_DNI * 864e5) return null;
      return d;
    } catch (e) { return null; }
  }

  function uloz(volby) {
    var d = { v: VERZIA, ts: Date.now(), volby: volby };
    try { localStorage.setItem(KLUC, JSON.stringify(d)); } catch (e) {}
    return d;
  }

  var aktualne = nacitaj();
  var povolene = function (id) {
    if (id === "nevyhnutne") return true;
    return !!(aktualne && aktualne.volby && aktualne.volby[id]);
  };

  /* ---------- uplatnenie súhlasu ---------- */

  function uplatni() {
    /* skripty čakajúce na súhlas: <script type="text/plain" data-consent="analyticke"> */
    document.querySelectorAll('script[type="text/plain"][data-consent]').forEach(function (s) {
      if (!povolene(s.dataset.consent)) return;
      var n = document.createElement("script");
      if (s.src) n.src = s.src; else n.textContent = s.textContent;
      s.parentNode.replaceChild(n, s);
    });

    /* vložený obsah tretej strany: <div data-consent-frame="externy" data-src="…"> */
    document.querySelectorAll("[data-consent-frame]").forEach(function (box) {
      var kat = box.dataset.consentFrame;
      if (!povolene(kat)) { box.classList.remove("nacitane"); return; }
      if (box.classList.contains("nacitane")) return;
      var f = document.createElement("iframe");
      f.src = box.dataset.src;
      f.title = box.dataset.title || "Vložený obsah";
      f.loading = "lazy";
      f.referrerPolicy = "no-referrer";
      f.setAttribute("allowfullscreen", "");
      box.textContent = "";
      box.appendChild(f);
      box.classList.add("nacitane");
    });

    document.dispatchEvent(new CustomEvent("vila27:suhlas", { detail: aktualne }));
  }

  function rozhodni(volby) {
    aktualne = uloz(volby);
    skryBanner();
    zavriNastavenia();
    uplatni();
  }

  var vsetkyAno = function () { var o = {}; KATEGORIE.forEach(function (k) { o[k.id] = true; }); return o; };
  var vsetkyNie = function () { var o = {}; KATEGORIE.forEach(function (k) { o[k.id] = !!k.vzdy; }); return o; };

  /* ---------- drobné pomôcky na DOM ---------- */

  function el(tag, trieda, text) {
    var n = document.createElement(tag);
    if (trieda) n.className = trieda;
    if (text != null) n.textContent = text;
    return n;
  }
  function tlacidlo(trieda, text, akcia) {
    var b = el("button", trieda, text);
    b.type = "button";
    b.addEventListener("click", akcia);
    return b;
  }

  /* ---------- spodný pruh ---------- */

  var banner = null;

  function ukazBanner() {
    if (banner) return;
    banner = el("div", "ck-banner");
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Súhlas s cookies");

    var text = el("div", "ck-text");
    text.appendChild(el("h2", null, "Cookies na tejto stránke"));
    var p = el("p", null, "Nevyhnutné cookies potrebujeme na fungovanie objednávky. Mapu Google a prípadné meranie návštevnosti načítame len s vaším súhlasom. Viac v ");
    var a = el("a", null, "Zásadách používania cookies");
    a.href = "cookies.html";
    p.appendChild(a);
    p.appendChild(document.createTextNode("."));
    text.appendChild(p);

    var akcie = el("div", "ck-akcie");
    akcie.appendChild(tlacidlo("ck-btn", "Prijať všetko", function () { rozhodni(vsetkyAno()); }));
    akcie.appendChild(tlacidlo("ck-btn", "Odmietnuť všetko", function () { rozhodni(vsetkyNie()); }));
    akcie.appendChild(tlacidlo("ck-btn", "Nastavenia", function () { otvorNastavenia(); }));

    banner.appendChild(text);
    banner.appendChild(akcie);
    document.body.appendChild(banner);
    document.body.classList.add("ck-open");
  }

  function skryBanner() {
    if (!banner) return;
    banner.remove();
    banner = null;
    document.body.classList.remove("ck-open");
  }

  /* ---------- okno s nastaveniami ---------- */

  var dialog = null, predtymFokus = null;

  function otvorNastavenia() {
    if (dialog) return;
    predtymFokus = document.activeElement;

    var back = el("div", "ck-back");
    dialog = el("div", "ck-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "ck-title");

    var h = el("h2", null, "Nastavenia cookies");
    h.id = "ck-title";
    dialog.appendChild(h);
    dialog.appendChild(el("p", "ck-uvod", "Vyberte, čo smieme načítať. Voľbu môžete kedykoľvek zmeniť odkazom „Nastavenia cookies“ v päte stránky."));

    var prepinace = {};
    KATEGORIE.forEach(function (k) {
      var row = el("div", "ck-kat");
      var lab = el("label", "ck-kat-hlava");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = k.vzdy ? true : povolene(k.id);     // nič nie je vopred zaškrtnuté
      cb.disabled = !!k.vzdy;
      prepinace[k.id] = cb;
      lab.appendChild(cb);
      lab.appendChild(el("span", "ck-kat-nazov", k.nazov + (k.vzdy ? " (vždy zapnuté)" : "")));
      row.appendChild(lab);
      row.appendChild(el("p", "ck-kat-popis", k.popis));
      dialog.appendChild(row);
    });

    var akcie = el("div", "ck-akcie");
    akcie.appendChild(tlacidlo("ck-btn", "Prijať všetko", function () { rozhodni(vsetkyAno()); }));
    akcie.appendChild(tlacidlo("ck-btn", "Odmietnuť všetko", function () { rozhodni(vsetkyNie()); }));
    akcie.appendChild(tlacidlo("ck-btn", "Uložiť voľbu", function () {
      var o = {};
      KATEGORIE.forEach(function (k) { o[k.id] = k.vzdy ? true : prepinace[k.id].checked; });
      rozhodni(o);
    }));
    dialog.appendChild(akcie);

    var zavri = tlacidlo("ck-zavri", "×", zavriNastavenia);
    zavri.setAttribute("aria-label", "Zavrieť nastavenia");
    dialog.appendChild(zavri);

    back.appendChild(dialog);
    back.addEventListener("click", function (e) { if (e.target === back) zavriNastavenia(); });
    document.body.appendChild(back);
    dialog.__back = back;

    document.addEventListener("keydown", klavesy, true);
    (dialog.querySelector("input, button") || dialog).focus();
  }

  /* Escape zatvára, Tab sa točí vnútri okna (pasca na fokus). */
  function klavesy(e) {
    if (!dialog) return;
    if (e.key === "Escape") { e.preventDefault(); zavriNastavenia(); return; }
    if (e.key !== "Tab") return;
    var f = dialog.querySelectorAll("button, input:not([disabled]), a[href]");
    if (!f.length) return;
    var prvy = f[0], posledny = f[f.length - 1];
    if (e.shiftKey && document.activeElement === prvy) { e.preventDefault(); posledny.focus(); }
    else if (!e.shiftKey && document.activeElement === posledny) { e.preventDefault(); prvy.focus(); }
  }

  function zavriNastavenia() {
    if (!dialog) return;
    document.removeEventListener("keydown", klavesy, true);
    dialog.__back.remove();
    dialog = null;
    if (predtymFokus && predtymFokus.focus) predtymFokus.focus();
  }

  /* ---------- štart ---------- */

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-cookie-settings]");
    if (t) { e.preventDefault(); otvorNastavenia(); }
  });

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-consent-allow]");
    if (!t) return;
    e.preventDefault();
    var volby = (aktualne && aktualne.volby) ? Object.assign({}, aktualne.volby) : vsetkyNie();
    volby[t.dataset.consentAllow] = true;
    rozhodni(volby);
  });

  uplatni();
  if (!aktualne) ukazBanner();

  window.Vila27Suhlas = { povolene: povolene, otvorNastavenia: otvorNastavenia, KATEGORIE: KATEGORIE, VERZIA: VERZIA };
})();
