/* Vila 27 — spoločné správanie pre všetky stránky */
(function () {
  "use strict";

  /* aktívna položka v navigácii podľa URL (funguje aj s cleanUrls na Verceli) */
  var here = location.pathname.replace(/\/index(\.html)?$/, "/").replace(/\.html$/, "");
  document.querySelectorAll(".nav-main a, .mobile-nav > a").forEach(function (a) {
    var href = a.getAttribute("href").replace(/\.html$/, "");
    var abs = new URL(href, location.href).pathname.replace(/\/index$/, "/");
    if (abs === here || (here === "/" && /(^|\/)index$/.test(abs))) a.setAttribute("aria-current", "page");
  });

  /* mobilná navigácia */
  var burger = document.getElementById("burger");
  var mnav = document.getElementById("mobileNav");
  if (burger && mnav) {
    var setOpen = function (open) {
      mnav.classList.toggle("open", open);
      document.body.classList.toggle("nav-open", open);
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Zavrieť menu" : "Otvoriť menu");
    };
    burger.addEventListener("click", function () { setOpen(!mnav.classList.contains("open")); });
    mnav.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", function () { setOpen(false); }); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setOpen(false); });
    window.matchMedia("(min-width: 901px)").addEventListener("change", function (e) { if (e.matches) setOpen(false); });
  }

  /* galéria → lightbox */
  var galleries = document.querySelectorAll(".gallery");
  if (galleries.length) {
    var lb = document.createElement("div");
    lb.className = "lightbox";
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-label", "Fotografia");
    lb.innerHTML = '<button class="lb-close" aria-label="Zavrieť">×</button>' +
      '<button class="lb-prev" aria-label="Predchádzajúca">‹</button>' +
      '<img alt="" />' +
      '<button class="lb-next" aria-label="Ďalšia">›</button>' +
      '<div class="lb-count"></div>';
    document.body.appendChild(lb);
    var img = lb.querySelector("img"), count = lb.querySelector(".lb-count");
    var list = [], idx = 0, lastFocus = null;

    var show = function (i) {
      idx = (i + list.length) % list.length;
      img.src = list[idx].href;
      img.alt = list[idx].querySelector("img") ? list[idx].querySelector("img").alt : "";
      count.textContent = (idx + 1) + " / " + list.length;
    };
    var open = function (gallery, i) {
      list = Array.prototype.slice.call(gallery.querySelectorAll("a"));
      lastFocus = document.activeElement;
      lb.classList.add("open");
      document.body.style.overflow = "hidden";
      show(i);
      lb.querySelector(".lb-close").focus();
    };
    var close = function () {
      lb.classList.remove("open");
      document.body.style.overflow = "";
      img.src = "";
      if (lastFocus) lastFocus.focus();
    };

    galleries.forEach(function (g) {
      g.addEventListener("click", function (e) {
        var a = e.target.closest("a");
        if (!a) return;
        e.preventDefault();
        open(g, Array.prototype.indexOf.call(g.querySelectorAll("a"), a));
      });
    });
    lb.querySelector(".lb-close").addEventListener("click", close);
    lb.querySelector(".lb-prev").addEventListener("click", function () { show(idx - 1); });
    lb.querySelector(".lb-next").addEventListener("click", function () { show(idx + 1); });
    lb.addEventListener("click", function (e) { if (e.target === lb) close(); });
    document.addEventListener("keydown", function (e) {
      if (!lb.classList.contains("open")) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") show(idx - 1);
      if (e.key === "ArrowRight") show(idx + 1);
    });
  }
})();
