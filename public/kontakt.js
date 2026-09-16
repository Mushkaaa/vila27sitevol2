  (function () {
    var f = document.getElementById("contactForm");
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = f.name.value.split(" ")[0] || "";
      document.getElementById("formNote").textContent = "Ďakujeme" + (name ? ", " + name : "") + ". Správu sme prijali (testovacia prevádzka) - čoskoro sa ozveme.";
      f.reset();
    });
  })();
