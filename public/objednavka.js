/* Vila 27 - objednávka online. Ponuku aj ceny berie zo servera (/api/menu);
   na server sa posielajú len id jedál a doplnkov, ceny si prepočíta sám. */
(function () {
  "use strict";
  var ORDER_API = "/api/orders";
  var MENU_API = "/api/menu";

  var MENU = [], TOPPINGS = [], GLUTEN_FREE = { name: "", price: 0 }, ZONES = [];
  var PIZZA_IDS = new Set(), ALL = [];

  var eur = function (n) { return n.toFixed(2).replace(".", ",") + " €"; };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[<>&"]/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]; }); };
  var $ = function (id) { return document.getElementById(id); };
  var displayName = function (it) { return it.name; };
  var vaha = function (it) { return it.weight && it.weight.text ? it.weight.text : ""; };

  var cart = [];          // [{key,id,name,base,extras:[{name,price}],gf,qty}]
  var mode = "rozvoz";
  var village = "";

  var zoneFor = function (v) {
    return ZONES.find(function (z) { return z.villages.indexOf(v) !== -1; }) || null;
  };
  var findItem = function (id) { return ALL.find(function (i) { return i.id === id; }); };

  /* ---- štart: najprv ponuka zo servera, potom sa dá klikať ---- */
  fetch(MENU_API)
    .then(function (r) { if (!r.ok) throw new Error("server"); return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error("server");
      MENU = data.rozvoz || [];
      TOPPINGS = data.toppings || [];
      GLUTEN_FREE = data.glutenFree || { name: "", price: 0 };
      ZONES = data.deliveryZones || [];
      ALL = MENU.reduce(function (a, g) { return a.concat(g.items); }, []);
      PIZZA_IDS = new Set((MENU.find(function (g) { return g.id === "pizza"; }) || { items: [] }).items.map(function (i) { return i.id; }));
      spusti();
    })
    .catch(function () {
      $("menuCol").innerHTML = '<p class="cat-note">Ponuku sa nepodarilo načítať. Obnovte stránku alebo nám zavolajte na <a href="tel:+421914271271">+421 914 271 271</a>.</p>';
    });

  function spusti() {
    vykresliPonuku();
    naplnObce();
    napojUdalosti();
    render();
  }

  /* ---- vykreslenie ponuky ---- */
  function vykresliPonuku() {
    var html = "";
    MENU.forEach(function (group) {
      html += '<section class="menu-cat" id="o-' + group.id + '"><h2>' + esc(group.cat) + '</h2>' +
              (group.note ? '<p class="cat-note">' + esc(group.note) + '</p>' : "");
      group.items.forEach(function (it) {
        var w = vaha(it);
        html += '<div class="m-item">' +
          (w ? '<span class="m-w">' + esc(w) + '</span>' : "") + '<span class="m-name">' + esc(displayName(it)) + '</span>' +
          '<span class="m-price">' + eur(it.price) + '</span>' +
          '<button class="add-btn" type="button" data-id="' + esc(it.id) + '" aria-label="Pridať ' + esc(displayName(it)) + '">+</button>' +
          (it.desc ? '<p class="m-desc">' + esc(it.desc) + '</p>' : "") +
          (it.allergens && it.allergens.length ? '<p class="m-alg">alergény: ' + it.allergens.join(", ") + '</p>' : "") +
          '</div>';
      });
      html += '</section>';
    });
    $("menuCol").innerHTML = html;
  }

  /* dropdown obcí - skupiny podľa ceny dopravy a minimálnej objednávky */
  function naplnObce() {
    var sel = $("f-village");
    sel.innerHTML = '<option value="">Vyberte obec…</option>' + ZONES.map(function (z) {
      return '<optgroup label="Doprava ' + eur(z.fee) + ' · min. objednávka ' + eur(z.min) + '">' +
        z.villages.map(function (v) { return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; }).join("") +
        '</optgroup>';
    }).join("");
    sel.addEventListener("change", function () { village = sel.value; render(); });
  }

  /* ---- košík ---- */
  var unit = function (e) { return e.base + e.extras.reduce(function (s, x) { return s + x.price; }, 0) + (e.gf ? GLUTEN_FREE.price : 0); };
  var sig = function (id, extras, gf) { return id + "#" + extras.map(function (x) { return x.name; }).sort().join(",") + "#" + gf; };

  function addToCart(id, extras, gf) {
    extras = extras || []; gf = !!gf;
    var key = sig(id, extras, gf);
    var found = cart.find(function (e) { return e.key === key; });
    if (found) found.qty++;
    else { var it = findItem(id); cart.push({ key: key, id: id, name: displayName(it), base: it.price, extras: extras, gf: gf, qty: 1 }); }
    render();
  }
  // pizza doplnky sa zapínajú v admine; staršie položky príznak nemajú, tam rozhoduje kategória
  var maPizzaDoplnky = function (it) { return it.pizzaToppings != null ? !!it.pizzaToppings : PIZZA_IDS.has(it.id); };

  function add(id) {
    var it = findItem(id);
    if (maPizzaDoplnky(it) || (it.addonGroups && it.addonGroups.length)) { openAddons(id); return; }
    addToCart(id);
    flash(displayName(it));
  }
  function setQty(key, d) {
    var e = cart.find(function (x) { return x.key === key; }); if (!e) return;
    e.qty += d; if (e.qty <= 0) cart = cart.filter(function (x) { return x !== e; });
    render();
  }

  function render() {
    var body = $("cartBody"), sub = 0;
    if (!cart.length) {
      body.innerHTML = '<div class="cart-empty">Košík je prázdny.<br />Pridajte si niečo z ponuky.</div>';
    } else {
      body.innerHTML = cart.map(function (e) {
        var u = unit(e), sum = u * e.qty; sub += sum;
        var extraTxt = e.extras.map(function (x) { return x.name; }).concat(e.gf ? [GLUTEN_FREE.name] : []).join(", ");
        return '<div class="line">' +
          '<div class="line-name">' + esc(e.name) + '<small>' + eur(u) + (extraTxt ? " · " + esc(extraTxt) : "") + '</small></div>' +
          '<div class="qty"><button type="button" data-dec="' + e.key + '" aria-label="Menej">−</button><span>' + e.qty + '</span><button type="button" data-inc="' + e.key + '" aria-label="Viac">+</button></div>' +
          '<div class="line-sum">' + eur(sum) + '</div></div>';
      }).join("");
    }
    var count = cart.reduce(function (n, e) { return n + e.qty; }, 0);
    var zone = mode === "rozvoz" ? zoneFor(village) : null;
    var fee = (zone && sub > 0) ? zone.fee : 0;
    $("pillCount").textContent = count;
    $("subtotal").textContent = eur(sub);
    $("villageField").style.display = (mode === "rozvoz") ? "block" : "none";
    $("feeRow").style.display = (mode === "rozvoz") ? "flex" : "none";
    $("fee").textContent = zone ? eur(zone.fee) : "podľa obce";
    $("total").textContent = eur(sub + fee);
    $("orderTotal").textContent = eur(sub + fee);

    var note = "", blocked = false;
    if (mode === "rozvoz" && cart.length) {
      if (!zone) {
        note = "Vyberte obec doručenia - podľa nej sa určí cena dopravy a minimálna objednávka.";
        blocked = true;
      } else if (sub < zone.min) {
        note = "Minimálna objednávka pre obec " + village + " je " + eur(zone.min) + " (bez dopravy) - chýba " + eur(zone.min - sub) + ".";
        blocked = true;
      }
    }
    $("minNote").textContent = note;
    $("checkoutBtn").disabled = !cart.length || blocked;
  }

  /* ---- udalosti ---- */
  function napojUdalosti() {
    document.addEventListener("click", function (e) {
      var a = e.target.closest("[data-id]"); if (a) { add(a.dataset.id); return; }
      var dec = e.target.closest("[data-dec]"); if (dec) { setQty(dec.dataset.dec, -1); return; }
      var inc = e.target.closest("[data-inc]"); if (inc) { setQty(inc.dataset.inc, +1); return; }
    });

    document.querySelectorAll(".mode-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll(".mode-btn").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        mode = b.dataset.mode;
        $("modeLabel").textContent = mode === "rozvoz" ? "Rozvoz · Bešeňová a okolie" : "Osobný odber · Vila 27";
        $("addrField").style.display = (mode === "rozvoz") ? "block" : "none";
        $("f-addr").required = (mode === "rozvoz");
        render();
      });
    });

    $("orderClose").addEventListener("click", closeOrder);
    orderModal.addEventListener("click", function (e) { if (e.target === orderModal) closeOrder(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeOrder(); closeAddons(); } });
    $("cartPill").addEventListener("click", function () { $("cart").scrollIntoView({ behavior: "smooth", block: "start" }); });

    $("checkoutBtn").addEventListener("click", function () {
      if (!cart.length) return;
      if (mode === "rozvoz") $("addrLabel").textContent = "Ulica a číslo · " + village;
      orderModal.classList.add("show");
      $("f-name").focus();
    });

    $("orderForm").addEventListener("submit", odosli);

    modal.addEventListener("change", function () { enforceLimits(); updateTopSum(); });
    modal.addEventListener("click", function (e) { if (e.target === modal) closeAddons(); });
    $("topClose").addEventListener("click", closeAddons);
    $("topSkip").addEventListener("click", function () {
      var name = displayName(findItem(pendingItem));
      addToCart(pendingItem); flash(name); closeAddons();
    });
    $("topAdd").addEventListener("click", function () {
      var name = displayName(findItem(pendingItem));
      addToCart(pendingItem, chosenExtras(), chosenGf()); flash(name); closeAddons();
    });
  }

  var orderModal = document.getElementById("orderModal");
  var closeOrder = function () { orderModal.classList.remove("show"); };

  function odosli(e) {
    e.preventDefault();
    var f = e.target, el = f.elements, btn = f.querySelector('button[type="submit"]');
    if (btn.disabled) return;
    if (mode === "rozvoz" && !zoneFor(village)) { flash("Vyberte obec doručenia v košíku.", 5000, true); return; }
    var label = btn.textContent;
    btn.disabled = true; btn.textContent = "Odosielam…";

    var payload = {
      mode: mode,
      customer: {
        name: el.name.value.trim(),
        phone: el.phone.value.trim(),
        village: mode === "rozvoz" ? village : "",
        address: mode === "rozvoz" ? el.address.value.trim() : "",
        time: el.time.value,
        pay: el.pay.value,
        note: el.note.value.trim()
      },
      items: cart.map(function (it) {
        return { id: it.id, qty: it.qty, extras: it.extras.map(function (x) { return x.name; }), gf: it.gf };
      })
    };

    fetch(ORDER_API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
      .then(function (res) {
        return res.json().catch(function () { throw new Error("server objednávok neodpovedá"); })
          .then(function (data) { return { res: res, data: data }; });
      })
      .then(function (r) {
        if (!r.res.ok || !r.data.ok) throw new Error(r.data.error || "Server neprijal objednávku");
        flash("Ďakujeme, " + payload.customer.name.split(" ")[0] + ". Objednávka č. " + r.data.number + " je prijatá - " +
          (payload.mode === "rozvoz" ? "kuriér vám zavolá z čísla +421 910 201 271." : "ozveme sa na " + payload.customer.phone + "."), 7000, true);
        cart = []; f.reset(); closeOrder(); render();
        window.scrollTo({ top: 0, behavior: "smooth" });
      })
      .catch(function (err) {
        var why = err.name === "TypeError" ? "nie je pripojenie k serveru" : err.message;
        flash("Objednávku sa nepodarilo odoslať (" + why + "). Skúste to znova alebo zavolajte na +421 914 271 271.", 8000, true);
      })
      .then(function () { btn.disabled = false; btn.textContent = label; });
  }

  /* ---- doplnky (pizza aj bežné doplnky k jedlu) ---- */
  var pendingItem = null;
  var modal = document.getElementById("topModal");

  var chosenExtras = function () {
    return Array.prototype.map.call(modal.querySelectorAll(".top-opt input.top-cb:checked"), function (cb) {
      return { name: cb.dataset.name, price: parseFloat(cb.dataset.price) };
    });
  };
  var chosenGf = function () { var el = $("gfCheck"); return el ? el.checked : false; };

  function updateTopSum() {
    if (!pendingItem) return;
    var total = findItem(pendingItem).price + chosenExtras().reduce(function (s, x) { return s + x.price; }, 0) + (chosenGf() ? GLUTEN_FREE.price : 0);
    $("topSum").textContent = eur(total);
  }
  function enforceLimits() {
    modal.querySelectorAll(".top-group[data-max]").forEach(function (g) {
      var max = +g.dataset.max;
      var boxes = Array.prototype.slice.call(g.querySelectorAll("input.top-cb"));
      var checked = boxes.filter(function (b) { return b.checked; }).length;
      boxes.forEach(function (b) { if (!b.checked) b.disabled = checked >= max; });
    });
  }
  var optRow = function (name, price) {
    return '<label class="top-opt"><input type="checkbox" class="top-cb" data-name="' + esc(name) + '" data-price="' + price + '">' +
           '<span class="tname">' + esc(name) + '</span><span class="m-price">' + (price > 0 ? "+ " + eur(price) : "zdarma") + '</span></label>';
  };
  var groupBlock = function (g) {
    var head = (g.title || g.max)
      ? '<div class="top-group-head"><span>' + esc(g.title || "Doplnky") + '</span>' + (g.max ? '<span class="top-alg">vyberte max. ' + g.max + '</span>' : "") + '</div>' : "";
    var note = g.note ? '<p class="top-note">' + esc(g.note) + '</p>' : "";
    return '<div class="top-group"' + (g.max ? ' data-max="' + g.max + '"' : "") + '>' + head + note +
           g.options.map(function (a) { return optRow(a.name, a.price); }).join("") + '</div>';
  };

  function openAddons(id) {
    pendingItem = id;
    var it = findItem(id), isPizza = maPizzaDoplnky(it);
    $("topTitle").textContent = isPizza ? "Pizza doplnky" : "Doplnky k jedlu";
    $("topFor").textContent = displayName(it) + " · " + eur(it.price);

    if (isPizza) {
      $("topBody").innerHTML =
        TOPPINGS.map(function (gr) {
          return '<div class="top-group"><div class="top-group-head"><span>' + esc(gr.g) + ' · ' + eur(gr.price) + '</span>' +
                 (gr.alg ? '<span class="top-alg">alergény: ' + esc(gr.alg) + '</span>' : "") + '</div>' +
                 gr.items.map(function (n) { return optRow(n, gr.price); }).join("") + '</div>';
        }).join("") +
        '<div class="top-group"><label class="top-opt"><input type="checkbox" id="gfCheck"><span class="tname">' + esc(GLUTEN_FREE.name) + '</span><span class="m-price">+ ' + eur(GLUTEN_FREE.price) + '</span></label></div>';
    } else {
      $("topBody").innerHTML = (it.addonGroups || []).map(groupBlock).join("");
    }
    enforceLimits(); updateTopSum();
    modal.classList.add("show");
  }
  function closeAddons() { modal.classList.remove("show"); pendingItem = null; }

  /* ---- oznámenie ---- */
  var toastT;
  function flash(msg, ms, raw) {
    var t = $("toast");
    t.innerHTML = raw ? esc(msg) : 'Pridané: <b>' + esc(msg) + '</b>';
    t.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove("show"); }, ms || 1600);
  }
})();
