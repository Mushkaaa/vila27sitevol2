(function () {
  var eur = function (n) { return n.toFixed(2).replace(".", ",") + " €"; };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[<>&"]/g, function (c) { return {"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]; }); };

  var nav = document.getElementById("menuNavScroll");
  var root = document.getElementById("menu");

  fetch("/api/menu")
    .then(function (r) { if (!r.ok) throw new Error("server"); return r.json(); })
    .then(function (data) { if (!data.ok) throw new Error("server"); vykresli(data); })
    .catch(function () {
      root.innerHTML = '<p class="cat-note">Lístok sa nepodarilo načítať. Obnovte stránku alebo nám zavolajte na <a href="tel:+421914271271">+421 914 271 271</a>.</p>';
    });

  function vykresli(data) {
  var MENU = data.jedalnylistok, M = { TOPPINGS: data.toppings };
  var ALERGENY = data.alergeny || {};
  var html = "", navHtml = "";
  ["food", "drink"].forEach(function (kind) {
    var cats = MENU.filter(function (c) { return c.kind === kind; });
    var title = kind === "food" ? "Jedlá" : "Nápoje";
    navHtml += '<span class="tracked">' + title + '</span>';
    html += '<section class="menu-kind" id="' + (kind === "food" ? "jedla" : "napoje") + '"><h2 class="menu-kind-title">' + title + '</h2>';
    cats.forEach(function (c) {
      navHtml += '<a href="#cat-' + c.id + '">' + esc(c.cat) + '</a>';
      html += '<section class="menu-cat" id="cat-' + c.id + '"><h2>' + esc(c.cat) + '</h2>';
      if (c.note) html += '<p class="cat-note">' + esc(c.note) + '</p>';
      c.items.forEach(function (it) {
        var name = it.name;
        var w = it.weight && it.weight.text ? it.weight.text : "";
        html += '<div class="m-item">' + (w ? '<span class="m-w">' + esc(w) + '</span>' : "") + '<span class="m-name">' + esc(name) + '</span>' +
                '<span class="m-price">' + eur(it.price) + '</span>';
        if (it.desc) html += '<p class="m-desc">' + esc(it.desc) + '</p>';
        if (it.allergens && it.allergens.length) html += '<p class="m-alg">alergény: ' + it.allergens.join(", ") + '</p>';
        if (it.additives) html += '<p class="m-alg">prídavné látky: ' + esc(it.additives) + '</p>';
        (it.menuAddons || []).forEach(function (a) { html += '<div class="m-add"><span>+ ' + esc(a.name) + '</span><span>' + eur(a.price) + '</span></div>'; });
        html += '</div>';
      });
      if (c.extras && c.extras.length) {
        html += '<div class="m-extras">' + c.extras.map(function (a) { return '<div><span>+ ' + esc(a.name) + '</span><span>' + eur(a.price) + '</span></div>'; }).join("") + '</div>';
      }
      if (c.id === "pizza") {
        html += '<div class="m-extras"><h4>Pizza doplnky</h4>' + M.TOPPINGS.map(function (g) {
          return '<div><span>' + esc(g.g) + ' ' + esc(g.items.join(", ")) + (g.alg ? ' <span class="m-alg" class="d-inline">(alergény: ' + esc(g.alg) + ')</span>' : "") + '</span><span>' + eur(g.price) + '</span></div>';
        }).join("") + '</div>';
      }
      html += '</section>';
    });
    html += '</section>';
  });
  var legenda = Object.keys(ALERGENY).map(function (n) { return n + " " + ALERGENY[n]; }).join(", ");
  html += '<p class="menu-foot">Zoznam alergénov: ' + esc(legenda) + '. Váhy sú uvedené v surovom stave. Zmeny v ponuke vyhradené.</p>';
  root.innerHTML = html;
  nav.innerHTML = navHtml;

  /* zvýraznenie aktívnej kategórie */
  var links = {};
  nav.querySelectorAll("a").forEach(function (a) { links[a.getAttribute("href").slice(1)] = a; });
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting && links[e.target.id]) {
        nav.querySelectorAll("a.on").forEach(function (a) { a.classList.remove("on"); });
        links[e.target.id].classList.add("on");
        if (window.matchMedia("(max-width: 900px)").matches) links[e.target.id].scrollIntoView({ inline: "center", block: "nearest" });
      }
    });
  }, { rootMargin: "-30% 0px -60% 0px" });
  root.querySelectorAll(".menu-cat").forEach(function (s) { io.observe(s); });
  }
})();
