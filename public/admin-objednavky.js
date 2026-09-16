/* Prístupový kód žije len v sessionStorage – zavretím karty je preč (B6).
   Do URL sa nedostane nikdy, posiela sa výhradne hlavičkou Authorization (B3). */
const KEY = "vila27_sprava_kod";
const NKEY = "vila27_admin_notif";
const FKEY = "vila27_admin_filter";
const TITLE = document.title;
const $ = s => document.querySelector(s);

let token = sessionStorage.getItem(KEY) || "";
const hlavicky = () => ({ Authorization: "Bearer " + token });
let orders = [], printed = new Set(), hotove = new Set();
let seen = new Set();            // čo už nástenka niekedy zobrazila – na detekciu nových
let unack = new Set();           // nové, ktoré obsluha ešte nepotvrdila
let filter = localStorage.getItem(FKEY) || "vsetky";   // nič sa neskrýva, kým si obsluha nevyberie
let soundOn = false, notifOn = false, first = true, titleT = null, actx = null;

/* D3 – ako často sa pýtať. Pri zmenách rýchlo, po chvíli ticha pomalšie.
   Namerané v tests/kvoty.test.js, vysvetlené v docs/security/REPORT.md časť D3. */
const POLL_RUSNO_MS = 20000;
const POLL_POKOJ_MS = 60000;
const TICHYCH_NA_POKOJ = 4;            // ~1 minúta bez zmeny a spomalíme
let poslednaVerzia = null;
let tichychZasebou = 0;
let obnovovanie = null;

const eur = n => (Number(n) || 0).toFixed(2).replace(".", ",") + " €";
const cas = iso => { const d = new Date(iso), p = n => String(n).padStart(2, "0"); return `${p(d.getHours())}:${p(d.getMinutes())}`; };

/* Vek objednávky sa číta rýchlejšie ako hodiny – stará objednávka tak bije do očí. */
function vek(iso){
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "teraz";
  if (min < 60) return "pred " + min + " min";
  const h = Math.floor(min / 60), z = min % 60;
  return "pred " + h + " h" + (z ? " " + z + " min" : "");
}
const stara = iso => (Date.now() - new Date(iso).getTime()) > 20 * 60000;

const stav = o => hotove.has(o.id) ? "hotova" : (printed.has(o.id) ? "vytlacena" : "nova");

/* Dvojité pípnutie: dva oddelené tóny. Jeden audio kontext na celú stránku –
   prehliadač ich viac ako pár nepovolí. */
function beep(){
  try{
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    [[0, 880], [.26, 1175]].forEach(([t, hz]) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = "square"; o.frequency.value = hz;
      o.connect(g); g.connect(actx.destination);
      const at = actx.currentTime + t;
      g.gain.setValueAtTime(.0001, at);
      g.gain.exponentialRampToValueAtTime(.3, at + .012);
      g.gain.setValueAtTime(.3, at + .15);
      g.gain.exponentialRampToValueAtTime(.0001, at + .2);
      o.start(at); o.stop(at + .21);
    });
  }catch(e){}
}

/* ---------- upozornenie na novú objednávku ---------- */
function raiseAlert(fresh){
  fresh.forEach(o => unack.add(o.id));
  refreshAlert();
  try{ if (navigator.vibrate) navigator.vibrate([300, 120, 300]); }catch(e){}
  notify(fresh);
  if (soundOn) beep();
}

function refreshAlert(){
  const nums = orders.filter(o => unack.has(o.id)).map(o => "#" + o.number);
  const on = unack.size > 0;
  $("#alertNums").textContent = nums.join("  ");
  $("#alert").hidden = !on;
  document.body.style.paddingTop = on ? ($("#alert").offsetHeight + 4) + "px" : "";

  if (on && !titleT){
    let flip = false;
    titleT = setInterval(() => {
      flip = !flip;
      document.title = flip ? `NOVÁ OBJEDNÁVKA (${unack.size})` : TITLE;
    }, 900);
  }
  if (!on && titleT){ clearInterval(titleT); titleT = null; document.title = TITLE; }
}
addEventListener("resize", refreshAlert);

function ack(id){
  if (!unack.delete(id)) return;
  refreshAlert(); draw();
}
function clearAlert(){ unack.clear(); refreshAlert(); draw(); }

/* Systémové okienko – prebudí aj zakrytý prehliadač. Zámerne bez zvuku,
   reproduktory na počítači idú do reštaurácie. */
function notify(fresh){
  if (!notifOn || !("Notification" in window) || Notification.permission !== "granted") return;
  fresh.forEach(o => {
    try{
      const n = new Notification(`Nová objednávka #${o.number}`, {
        body: `${o.mode === "odber" ? "Osobný odber" : "Rozvoz"} · ${eur(o.total)}\n${o.customer?.name || ""}`,
        tag: "vila27-" + o.id, requireInteraction: true, silent: true, icon: "favicon.svg",
      });
      n.onclick = () => { window.focus(); n.close(); };
    }catch(e){}
  });
}

/* ---------- vykreslenie ----------
   Karty skladá admin-karta.js cez DOM API. Na nástenke sa nepoužíva innerHTML
   so žiadnym údajom z objednávky (C6) – meno ani poznámka sa nikdy nestanú HTML. */
function draw(){
  const vsetky = orders;
  const podla = {
    nove: vsetky.filter(o => stav(o) === "nova"),
    vytlacene: vsetky.filter(o => stav(o) === "vytlacena"),
    hotove: vsetky.filter(o => stav(o) === "hotova"),
    vsetky,
  };
  $("#nNove").textContent = podla.nove.length;
  $("#nVytlacene").textContent = podla.vytlacene.length;
  $("#nHotove").textContent = podla.hotove.length;
  $("#nVsetky").textContent = vsetky.length;
  document.querySelectorAll(".tally button").forEach(b => b.classList.toggle("on", b.dataset.filter === filter));

  const zoznam = podla[filter] || vsetky;
  const prazdne = {
    nove: "Všetko je vybavené. Nová objednávka sa tu objaví sama.",
    vytlacene: "Nič nečaká na výdaj.",
    hotove: "Zatiaľ nie je nič označené ako vybavené.",
    vsetky: "Nové objednávky sa tu objavia samé.",
  };

  const board = $("#board");
  board.textContent = "";

  if (filter === "hotove"){
    const p = document.createElement("p");
    p.className = "pasmo";
    p.textContent = "Archív vybavených objednávok. Nástenka drží posledných 60 objednávok, staršie sa už nezobrazujú.";
    board.appendChild(p);
  }

  if (!zoznam.length){
    const box = document.createElement("div");
    box.className = "empty";
    const b = document.createElement("b");
    b.textContent = "Nič tu nie je";
    box.appendChild(b);
    box.appendChild(document.createTextNode(prazdne[filter] || prazdne.vsetky));
    board.appendChild(box);
    return;
  }

  const pomocky = { eur, vek, cas, stara };
  zoznam.forEach(o => {
    board.appendChild(Vila27Karta.vytvorKartu(document, o, {
      ...pomocky, stav: stav(o), nevidena: unack.has(o.id),
    }));
  });
}

let oznamT;
function oznam(text){
  const t = $("#oznam");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(oznamT);
  oznamT = setTimeout(() => t.classList.remove("show"), 3200);
}

/* ---------- načítanie ---------- */
async function load(){
  try{
    // D3 – ak sa od minule nič nezmenilo, server odpovie jedným Redis príkazom
    // namiesto štyroch. Nástenka beží v kuchyni celý deň, takže práve toto
    // rozhoduje o tom, či sa zmestíme do bezplatného limitu Upstashu.
    const adresa = poslednaVerzia === null
      ? "/api/queue?all=1"
      : "/api/queue?all=1&v=" + encodeURIComponent(poslednaVerzia);
    const res = await fetch(adresa, { headers: hlavicky(), cache: "no-store" });
    if (res.status === 401){ logout("Prístupový kód neplatí."); return; }
    const data = await res.json();
    if (typeof data.v === "number") poslednaVerzia = data.v;

    if (data.nezmenene){
      tichychZasebou++;
      $("#liveBox").classList.remove("off");
      $("#live").textContent = "obnovené " + new Date().toLocaleTimeString("sk-SK");
      return;
    }
    tichychZasebou = 0;

    orders = data.orders || [];
    printed = new Set(data.printed || []);
    hotove = new Set(data.hotove || []);

    // vybavenú objednávku netreba ohlasovať – mohol ju medzitým zavrieť kolega
    const fresh = orders.filter(o => !seen.has(o.id) && !hotove.has(o.id));
    orders.forEach(o => seen.add(o.id));

    // pruh smie svietiť len za objednávku, ktorá je stále v zozname a nie je vybavená
    const su = new Set(orders.map(o => o.id));
    unack.forEach(id => { if (!su.has(id) || hotove.has(id)) unack.delete(id); });

    if (fresh.length && !first) raiseAlert(fresh);
    else refreshAlert();

    draw();
    first = false;
    $("#liveBox").classList.remove("off");
    $("#live").textContent = "obnovené " + new Date().toLocaleTimeString("sk-SK");
  }catch(e){
    $("#liveBox").classList.add("off");
    $("#live").textContent = "bez spojenia, skúšam znova…";
  }
}

async function oznacHotove(id, hotova){
  try{
    const res = await fetch("/api/queue", {
      method: "POST",
      headers: { "content-type": "application/json", ...hlavicky() },
      body: JSON.stringify({ hotove: [id], stav: hotova }),
    });
    if (res.status === 401){ logout("Prístupový kód neplatí."); return; }
    if (hotova) hotove.add(id); else hotove.delete(id);
    unack.delete(id);
    poslednaVerzia = null;          // vlastnú zmenu si necháme potvrdiť plným dotazom
    tichychZasebou = 0;
    refreshAlert(); draw();
    naplanujObnovu();

    const o = orders.find(x => x.id === id);
    const cislo = o ? "#" + o.number : "Objednávka";
    if (hotova) oznam(`${cislo} je vybavená. Nájdete ju pod Hotové.`);
    else oznam(`${cislo} je späť medzi rozrobenými.`);
  }catch(e){
    $("#liveBox").classList.add("off");
    $("#live").textContent = "zmenu sa nepodarilo uložiť";
  }
}

function logout(msg){
  sessionStorage.removeItem(KEY); token = "";
  clearTimeout(obnovovanie); obnovovanie = null;
  poslednaVerzia = null; tichychZasebou = 0;
  orders = []; seen = new Set(); printed = new Set(); hotove = new Set(); first = true;
  clearAlert();
  $("#app").hidden = true; $("#gate").hidden = false; $("#err").textContent = msg || "";
}

/* ---------- ovládanie ---------- */
$("#enter").addEventListener("click", () => {
  const v = $("#tok").value.trim();
  if (!v){ $("#err").textContent = "Zadajte prístupový kód."; return; }
  sessionStorage.setItem(KEY, v); token = v;
  $("#gate").hidden = true; $("#app").hidden = false;
  askPermission();
  load().then(naplanujObnovu);
});
$("#tok").addEventListener("keydown", e => { if (e.key === "Enter") $("#enter").click(); });
$("#logout").addEventListener("click", () => logout());

$("#sound").addEventListener("click", e => {
  soundOn = !soundOn;
  e.target.classList.toggle("on", soundOn);
  e.target.textContent = soundOn ? "Zvuk: zap" : "Zvuk: vyp";
  if (soundOn) beep();
});

document.querySelector(".tally").addEventListener("click", e => {
  const b = e.target.closest("[data-filter]");
  if (!b) return;
  filter = b.dataset.filter;
  localStorage.setItem(FKEY, filter);
  draw();
});

$("#board").addEventListener("click", e => {
  const videl = e.target.closest("[data-ack]");
  if (videl){ ack(videl.dataset.ack); return; }
  const hotovo = e.target.closest("[data-hotovo]");
  if (hotovo){ oznacHotove(hotovo.dataset.hotovo, true); return; }
  const vrat = e.target.closest("[data-vrat]");
  if (vrat){ oznacHotove(vrat.dataset.vrat, false); }
});

/* Prepínač sa dá vždy prepnúť. Keď systémové okienko blokuje prehliadač,
   voľba sa aj tak uloží a pod lištou sa ukáže, čo s tým. */
function paintNotif(){
  $("#notif").classList.toggle("on", notifOn);
  $("#notif").textContent = notifOn ? "Upozornenia: zap" : "Upozornenia: vyp";
  const hint = $("#notifHint");
  let msg = "";
  if (notifOn && !("Notification" in window)){
    msg = "Systémové okienka tento prehliadač nevie zobraziť. Blikajúci pruh hore funguje aj tak.";
  }else if (notifOn && Notification.permission === "denied"){
    msg = "Systémové okienka blokuje prehliadač – povoľte ich cez ikonu vedľa adresy a stránku obnovte. Blikajúci pruh hore funguje aj tak.";
  }
  hint.textContent = msg;
  hint.hidden = !msg;
}
$("#notif").addEventListener("click", async () => {
  notifOn = !notifOn;
  localStorage.setItem(NKEY, notifOn ? "1" : "0");
  if (notifOn) await askPermission();
  paintNotif();
});

/* Povolenie musí dať človek, kódom sa nastaviť nedá – pýtame si ho hneď po
   otvorení nástenky. Firefox a Safari to dovolia len po kliknutí, preto je
   pripravená aj náhrada na prvý klik kdekoľvek na stránke. */
async function askPermission(){
  if (!("Notification" in window) || Notification.permission !== "default") return;
  try{ await Notification.requestPermission(); }catch(e){}
  paintNotif();
}
function armPermissionAsk(){
  if (!("Notification" in window) || Notification.permission !== "default") return;
  const once = () => { document.removeEventListener("click", once); askPermission(); };
  document.addEventListener("click", once);
}

notifOn = localStorage.getItem(NKEY) !== "0";
paintNotif();

if (token){
  $("#app").hidden = false;
  askPermission(); armPermissionAsk();
  load().then(naplanujObnovu);
} else {
  $("#gate").hidden = false;
}
/* Namiesto pevného intervalu sa ďalšie načítanie plánuje až po tom
   predchádzajúcom – pomalé spojenie tak dotazy nehromadí. */
function naplanujObnovu(){
  clearTimeout(obnovovanie);
  if (!token || $("#app").hidden) return;
  const o = tichychZasebou >= TICHYCH_NA_POKOJ ? POLL_POKOJ_MS : POLL_RUSNO_MS;
  obnovovanie = setTimeout(async () => { await load(); naplanujObnovu(); }, o);
}

// prepočet „pred X minútami“ je čisto lokálny, Redis sa ho netýka
setInterval(() => { if (token && !$("#app").hidden && orders.length) draw(); }, 30000);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) { clearTimeout(obnovovanie); obnovovanie = null; }
  else if (token && !$("#app").hidden) { load().then(naplanujObnovu); }
});
