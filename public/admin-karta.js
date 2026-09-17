/* Vila 27 — vykreslenie jednej objednávky na nástenke.

   Celá karta sa skladá cez DOM API a text sa vkladá výhradne cez textContent.
   Žiadny innerHTML, insertAdjacentHTML ani skladanie HTML z reťazcov (C6) –
   meno, adresa ani poznámka zákazníka sa tak nikdy nestanú značkami.

   Funkcia je zámerne čistá a berie `doc` ako parameter, aby sa dala otestovať
   bez prehliadača (tests/admin-karta.test.js).
*/
(function (root) {
  "use strict";

  var POPIS = { nova: "čaká na tlač", vytlacena: "vytlačená v kuchyni", hotova: "vybavená" };

  function vytvorKartu(doc, o, ctx) {
    var s = ctx.stav;
    var nevidena = !!ctx.nevidena;
    var eur = ctx.eur, vek = ctx.vek, cas = ctx.cas, stara = ctx.stara;
    var c = o.customer || {};

    function el(rodic, tag, trieda, text) {
      var n = doc.createElement(tag);
      if (trieda) n.className = trieda;
      if (text != null) n.textContent = String(text);
      if (rodic) rodic.appendChild(n);
      return n;
    }

    var karta = doc.createElement("article");
    karta.className = "card " + s + (nevidena ? " nevidena" : "") + (o.predobjednavka ? " predobj" : "");

    /* --- hlavička karty --- */
    var top = el(karta, "div", "c-top");
    el(top, "span", "c-num", "#" + (o.number != null ? o.number : "?"));
    el(top, "span", "c-mode" + (o.mode === "odber" ? " odber" : ""), o.mode === "odber" ? "Odber" : "Rozvoz");
    var age = el(top, "span", "c-age" + (stara(o.createdAt) && s !== "hotova" ? " stara" : ""));
    el(age, "span", "rel", vek(o.createdAt));
    el(age, "span", "abs", cas(o.createdAt));

    /* --- predobjednávka: obsluha musí vidieť, že sa to nerobí teraz --- */
    if (o.predobjednavka) {
      var pre = el(karta, "div", "c-predobj");
      el(pre, "b", null, "PREDOBJEDNÁVKA");
      if (o.pozadovanyCasPopis) el(pre, "span", "c-predobj-cas", "vydať " + o.pozadovanyCasPopis);
    }

    /* --- jedlo --- */
    var items = el(karta, "div", "c-items");
    (o.items || []).forEach(function (it) {
      var row = el(items, "div", "c-item");
      el(row, "span", "q", (it.qty || 1) + "×");
      el(row, "span", "n", it.name);
      (it.extras || []).forEach(function (x) { el(items, "div", "c-extra", "+ " + x); });
    });

    /* --- zákazník --- */
    var kto = el(karta, "div", "c-who");
    el(kto, "b", null, c.name || "");
    kto.appendChild(doc.createElement("br"));
    var tel = el(kto, "a", null, c.phone || "");
    tel.setAttribute("href", "tel:" + String(c.phone || "").replace(/\s/g, ""));
    if (c.address) el(kto, "div", "c-addr", c.address);
    el(kto, "div", "c-meta", [c.time, c.pay].filter(Boolean).join(" · "));
    var sum = el(kto, "div", "c-sum", eur(o.total));
    if (o.fee) el(sum, "span", "c-meta", " (z toho doprava " + eur(o.fee) + ")");

    /* --- poznámka zákazníka: najrizikovejší text na celej nástenke --- */
    if (c.note) {
      var pozn = el(karta, "div", "c-note");
      el(pozn, "b", null, "Poznámka");
      pozn.appendChild(doc.createTextNode(c.note));
    }

    el(karta, "div", "c-stav", POPIS[s] || "");

    /* --- tlačidlá --- */
    var act = el(karta, "div", "c-act");
    function tlacidlo(trieda, text, atribut) {
      var b = el(act, "button", trieda, text);
      b.setAttribute("type", "button");
      b.setAttribute(atribut, o.id);
      return b;
    }
    if (s === "hotova") {
      tlacidlo("b-vratit", "Vrátiť medzi rozrobené", "data-vrat");
    } else {
      if (nevidena) tlacidlo("b-videl", "Videl som", "data-ack");
      tlacidlo("b-hotove", "Hotové", "data-hotovo");
    }

    return karta;
  }

  var api = { vytvorKartu: vytvorKartu, POPIS: POPIS };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Vila27Karta = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
