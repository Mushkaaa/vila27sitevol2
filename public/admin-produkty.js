const $ = s => document.querySelector(s);
const DRAFT = "vila27_rozpracovane";      // len sessionStorage, nikdy localStorage
const ZOZNAMY = ["rozvoz", "jedalnylistok"];
const SEKCIE = [...ZOZNAMY, "doplnky", "doprava"];   // doplnky aj doprava sa ukladajú rovnakým tlačidlom ako ponuka
const PRAZDNE = () => ({ rozvoz: null, jedalnylistok: null, doplnky: null, doprava: null });

/* Zmeny sa zbierajú v prehliadači a na server idú naraz až tlačidlom
   „Uložiť zmeny“. Pre každý zoznam si držíme, ako vyzeral pri načítaní
   (povodne) a ako vyzerá teraz – z toho sa ráta, čo sa vlastne zmenilo. */
let data = PRAZDNE();
let zoznam = "rozvoz";
let ALERGENY = {};
let MODIFIKATORY = [];
let upravovany = null;        // id produktu v okne (null = nový)
let tmpPocitadlo = 0;         // dočasné id nových produktov, server im dá vlastné
let koniec = 0, tikot = null, minutSedenia = 20;

const esc = s => String(s ?? "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const eur = n => (Number(n) || 0).toFixed(2).replace(".", ",") + " €";
const kopia = x => JSON.parse(JSON.stringify(x));
const NAZOV = { rozvoz: "Rozvoz", jedalnylistok: "Jedálny lístok", doplnky: "Doplnky", doprava: "Doprava" };
const POPIS = {
  rozvoz: "Toto vidia zákazníci v objednávkovom formulári. Vypnutý produkt sa nedá objednať.",
  jedalnylistok: "Toto je jedálny a nápojový lístok na stránke. Vypnutý produkt sa na ňom nezobrazí.",
  doplnky: "Ceny doplnkov k jedlám a pizza doplnkov. Platia v online objednávke aj na jedálnom lístku. Prílohy majú cenu svojho produktu v Rozvoze.",
  doprava: "Kam rozvážate, koľko stojí doprava a od akej sumy objednávku beriete. Obec smie byť len v jednom pásme.",
};
const pocetSlovom = n => n === 1 ? "produkt" : (n >= 2 && n <= 4) ? "produkty" : "produktov";
function zmenyText(n){
  if (n === 1) return "1 neuložená zmena";
  if (n >= 2 && n <= 4) return n + " neuložené zmeny";
  return n + " neuložených zmien";
}

const kategorie = () => (data[zoznam] ? data[zoznam].teraz : []);
const vsetkyProdukty = z => (data[z] ? data[z].teraz.flatMap(c => c.items) : []);

let oznamT;
function oznam(text){
  const t = $("#oznam");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(oznamT);
  oznamT = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- komunikácia so serverom ---------- */
async function api(cesta, telo){
  const res = await fetch(cesta, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(telo),
  });
  if (res.status === 401){ vypadloPrihlasenie(); throw new Error("401"); }
  posunOdpocet();            // server sedenie predĺžil aj pri odmietnutom vstupe
  const data = await res.json().catch(() => ({ ok: false, error: "Server neodpovedal zrozumiteľne." }));
  if (!data.ok) throw new Error(data.error || "Nepodarilo sa to uložiť.");
  return data;
}

/* Prihlásenie vypršalo. Nazbierané zmeny nezahadzujeme – odložíme ich
   a po opätovnom prihlásení ich ponúkneme späť. */
function vypadloPrihlasenie(){
  if (jeCoUlozit()){
    const odlozene = {};
    SEKCIE.forEach(z => { if (data[z]) odlozene[z] = data[z].teraz; });
    try{ sessionStorage.setItem(DRAFT, JSON.stringify(odlozene)); }catch(e){}
  }
  naGate("Prihlásenie vypršalo. Prihláste sa znova.");
}

function naGate(chyba){
  clearInterval(tikot); tikot = null;
  data = PRAZDNE();
  upravovany = null;
  zavriVsetky();
  $("#lista").hidden = true;
  $("#app").hidden = true;
  $("#gate").hidden = false;
  $("#gateErr").textContent = chyba || "";
  const draft = sessionStorage.getItem(DRAFT);
  $("#gateDraft").hidden = !draft;
  if (draft) $("#gateDraft").textContent = "Neuložené zmeny sme neodhodili – po prihlásení budú späť tak, ako ste ich nechali.";
  $("#g-heslo").value = "";
  $("#g-meno").focus();
}

/* ---------- odpočet do konca prihlásenia ---------- */
function posunOdpocet(){ koniec = Date.now() + minutSedenia * 60000; }
function tik(){
  const zostava = Math.max(0, Math.round((koniec - Date.now()) / 1000));
  if (!zostava){ vypadloPrihlasenie(); return; }
  const m = Math.floor(zostava / 60), s = zostava % 60;
  $("#odpocet").textContent = `odhlásenie o ${m}:${String(s).padStart(2, "0")}`;
}

/* ---------- čo sa zmenilo ---------- */
function zmeneny(z){
  if (z === "doplnky") return !!data[z] && rozdiel(z).length > 0;   // „3“ a „3,00“ je tá istá cena
  return !!data[z] && JSON.stringify(data[z].povodne) !== JSON.stringify(data[z].teraz);
}
function jeCoUlozit(){ return SEKCIE.some(zmeneny); }

/** Ľudský zoznam zmien oproti stavu pri načítaní. */
function rozdiel(z){
  if (!data[z]) return [];
  if (z === "doprava") return zmeneny(z) ? ["upravená doprava"] : [];
  if (z === "doplnky"){
    const stare = new Map(data.doplnky.povodne.map(d => [d.id, Number(d.price)]));
    return data.doplnky.teraz.filter(d => d.price === "" || stare.get(d.id) !== Number(d.price)).map(d => `cena ${d.nazov}`);
  }
  const { povodne, teraz } = data[z];
  const out = [];

  povodne.forEach(c => { if (!teraz.some(x => x.id === c.id)) out.push(`zmazaná kategória ${c.cat}`); });
  teraz.forEach(c => { if (!povodne.some(x => x.id === c.id)) out.push(`nová kategória ${c.cat}`); });

  const stare = new Map(povodne.flatMap(c => c.items.map(i => [i.id, { p: i, cat: c }])));
  const nove = new Map(teraz.flatMap(c => c.items.map(i => [i.id, { p: i, cat: c }])));

  stare.forEach((v, id) => { if (!nove.has(id)) out.push(`zmazaný ${v.p.name}`); });
  nove.forEach((v, id) => {
    const s = stare.get(id);
    if (!s){ out.push(`nový ${v.p.name}`); return; }
    if (s.p.online !== v.p.online){ out.push(`${v.p.online ? "zapnutý" : "vypnutý"} ${v.p.name}`); return; }
    if (s.cat.id !== v.cat.id){ out.push(`${v.p.name} presunutý do ${v.cat.cat}`); return; }
    if (JSON.stringify(s.p) !== JSON.stringify(v.p)) out.push(`upravený ${v.p.name}`);
  });
  return out;
}

function oznacZmeny(){
  const vsetky = SEKCIE.flatMap(z => rozdiel(z).map(t => ({ z, t })));
  const pocet = vsetky.length;
  const lista = $("#lista");

  // lišta má stále rovnakú výšku – nič sa pod ňou nehýbe, keď pribudne zmena
  lista.hidden = pocet === 0;
  $("#ulozBtn").disabled = pocet === 0;
  if (pocet){
    $("#lPocet").textContent = zmenyText(pocet);
    $("#lCo").textContent = vsetky.slice(0, 3).map(x => x.t).join(", ") + (pocet > 3 ? " a ďalšie…" : "");
  }
  miestoPreListu();

  // na záložke so zmenami je to vidieť, aj keď je otvorená tá druhá;
  // popisky sa neprepisujú, len sa prepína značka – inak by blikali
  document.querySelectorAll(".tabs button").forEach(b => {
    const z = b.dataset.zoznam;
    b.classList.toggle("on", z === zoznam);
    const znacka = b.querySelector(".neulozene");
    if (znacka) znacka.hidden = !zmeneny(z);
  });
}

/** Lišta je fixná, tak jej pod obsahom vyhradíme presne toľko, koľko zaberá. */
function miestoPreListu(){
  const lista = $("#lista");
  const obal = document.querySelector(".obal");
  if (!obal) return;
  const vyska = lista.hidden ? 0 : lista.offsetHeight;
  obal.style.paddingBottom = vyska ? (vyska + 28) + "px" : "";
  document.documentElement.style.setProperty("--oznam-dno", (vyska ? vyska + 16 : 24) + "px");
}
addEventListener("resize", miestoPreListu);

/* ---------- vykreslenie zoznamu ---------- */
function riadok(p){
  const w = p.weight && p.weight.text ? p.weight.text : "";
  const alg = (p.allergens || []).length ? "alergény " + p.allergens.join(", ") : "bez alergénov";
  const zapnuty = p.online !== false;
  return `<div class="riadok ${zapnuty ? "" : "vypnuty"}">
    <div class="r-text">
      <div class="r-nazov">${esc(p.name)}</div>
      <div class="r-pod">${esc(w || "—")} · ${esc(alg)}</div>
      ${p.desc ? `<div class="r-popis">${esc(p.desc)}</div>` : ""}
    </div>
    <span class="prep-popis">${zapnuty ? "v ponuke" : "vypnuté"}</span>
    <button type="button" class="prep" role="switch" aria-pressed="${zapnuty}"
            aria-label="${zapnuty ? "Vypnúť" : "Zapnúť"} ${esc(p.name)}" data-prep="${esc(p.id)}"></button>
    <span class="r-cena">${eur(p.price)}</span>
    <span class="r-akcie">
      <button type="button" data-uprav="${esc(p.id)}">Upraviť</button>
      <button type="button" class="zmaz" data-zmaz="${esc(p.id)}">Zmazať</button>
    </span>
  </div>`;
}

/** Pásma sa píšu priamo do polí – prepisujú sa len pri pridaní či zmazaní,
    inak by pod rukami skákal kurzor. */
function vykresliDopravu(){
  const zony = data.doprava ? data.doprava.teraz : [];
  $("#vypis").innerHTML = zony.map((z, i) => `
    <section class="kat">
      <div class="kat-hlava">
        <h3>Pásmo ${i + 1}</h3>
        <span class="konce"><button type="button" data-zmaz-zonu="${i}">Zmazať pásmo</button></span>
      </div>
      <div class="dvojica">
        <div class="field"><label for="z-fee-${i}">Cena dopravy v eurách</label>
          <input id="z-fee-${i}" inputmode="decimal" data-zona="${i}" data-pole="fee" value="${esc(String(z.fee).replace(".", ","))}" /></div>
        <div class="field"><label for="z-min-${i}">Minimálna objednávka v eurách</label>
          <input id="z-min-${i}" inputmode="decimal" data-zona="${i}" data-pole="min" value="${esc(String(z.min).replace(".", ","))}" /></div>
      </div>
      <div class="field"><label for="z-obce-${i}">Obce – každá na vlastnom riadku</label>
        <textarea id="z-obce-${i}" data-zona="${i}" data-pole="villages" rows="${Math.max(3, z.villages.length)}">${esc(z.villages.join("\n"))}</textarea>
        <div class="hint">Presne tak, ako to má zákazník vidieť vo výbere obce.</div>
      </div>
    </section>`).join("") || '<p style="color:var(--grey);padding:8px 0">Zatiaľ tu nie je ani jedno pásmo.</p>';
}

/** Ceny doplnkov po skupinách. Polia sa rovnako ako pri doprave neprekresľujú pri písaní. */
function vykresliDoplnky(){
  const riadky = data.doplnky ? data.doplnky.teraz : [];
  const skupiny = [...new Set(riadky.map(d => d.skupina))];
  $("#vypis").innerHTML = skupiny.map(s => `
    <section class="kat">
      <div class="kat-hlava"><h3>${esc(s)}</h3></div>
      ${riadky.map((d, i) => d.skupina !== s ? "" : `
        <div class="riadok">
          <div class="r-text">
            <label class="r-nazov" for="d-${i}">${esc(d.nazov)}</label>
            ${d.viazane ? `<div class="r-popis" style="color:var(--grey)">Cena podľa produktu ${esc(d.viazane)} v Rozvoze</div>` : ""}
          </div>
          <div class="cena-pole"><input id="d-${i}" inputmode="decimal" data-doplnok="${i}"
            value="${esc(String(d.price).replace(".", ","))}" ${d.viazane ? "disabled" : ""} aria-label="Cena v eurách" /></div>
        </div>`).join("")}
    </section>`).join("") || '<p style="color:var(--grey);padding:8px 0">Doplnky sa nepodarilo načítať.</p>';
}

function vykresli(){
  $("#nadpis").textContent = NAZOV[zoznam];
  $("#podnadpis").textContent = POPIS[zoznam];

  const doprava = zoznam === "doprava", doplnky = zoznam === "doplnky";
  $("#novyBtn").hidden = doprava || doplnky;
  $("#novaKatBtn").hidden = doplnky;
  $("#novaKatBtn").textContent = doprava ? "Pridať pásmo" : "Pridať kategóriu";
  if (doprava){ vykresliDopravu(); oznacZmeny(); return; }
  if (doplnky){ vykresliDoplnky(); oznacZmeny(); return; }

  $("#vypis").innerHTML = kategorie().map(c => `
    <section class="kat">
      <div class="kat-hlava">
        <h3>${esc(c.cat)}</h3>
        <span class="pocet">${c.items.length} ${pocetSlovom(c.items.length)}</span>
        <span class="konce">
          <button type="button" data-do-kat="${esc(c.id)}">Pridať sem produkt</button>
          ${c.items.length ? "" : `<button type="button" data-zmaz-kat="${esc(c.id)}">Zmazať kategóriu</button>`}
        </span>
      </div>
      ${c.items.length ? c.items.map(riadok).join("") : '<p style="color:var(--grey);font-size:.9rem;padding:8px 0">Zatiaľ tu nič nie je.</p>'}
    </section>`).join("");

  oznacZmeny();
}

async function nacitaj(z){
  const odpoved = await api("/api/admin-menu", { akcia: "nacitaj", zoznam: z });
  ALERGENY = odpoved.alergeny || ALERGENY;
  MODIFIKATORY = odpoved.modifikatory || MODIFIKATORY;
  if (odpoved.doprava && !data.doprava) data.doprava = { povodne: kopia(odpoved.doprava), teraz: kopia(odpoved.doprava) };
  if (odpoved.doplnky && !data.doplnky) data.doplnky = { povodne: kopia(odpoved.doplnky), teraz: kopia(odpoved.doplnky) };
  data[z] = { povodne: kopia(odpoved.kategorie), teraz: kopia(odpoved.kategorie) };
  $("#bezDatabazy").hidden = odpoved.trvale !== false;
}

/* ---------- uloženie všetkého naraz ---------- */
async function publikuj(){
  if (!jeCoUlozit()) return;
  const btn = $("#ulozBtn");
  const popis = btn.textContent;
  btn.disabled = true; btn.textContent = "Ukladám…";
  try{
    const zmeny = {};
    SEKCIE.forEach(z => { if (zmeneny(z)) zmeny[z] = data[z].teraz; });
    const odpoved = await api("/api/admin-menu", { akcia: "ulozVsetko", zmeny });

    Object.keys(odpoved.zoznamy || {}).forEach(z => {
      data[z] = { povodne: kopia(odpoved.zoznamy[z]), teraz: kopia(odpoved.zoznamy[z]) };
    });
    // nové ceny doplnkov aj do zaškrtávacích políčok v okne produktu
    (odpoved.zoznamy && odpoved.zoznamy.doplnky || []).forEach(d => {
      const m = MODIFIKATORY.find(x => x.kluc === d.id);
      if (m) m.price = d.price;
    });
    sessionStorage.removeItem(DRAFT);
    vykresli();
    oznam("Zmeny sú uložené. Na stránke sa prejavia do minúty.");
  }catch(e){
    if (e.message !== "401") oznam(e.message);
  }finally{
    btn.disabled = false; btn.textContent = popis;
    oznacZmeny();
  }
}

function zahod(){
  if (!confirm("Zahodiť všetky neuložené zmeny a vrátiť sa k poslednej uloženej podobe?")) return;
  SEKCIE.forEach(z => { if (data[z]) data[z].teraz = kopia(data[z].povodne); });
  sessionStorage.removeItem(DRAFT);
  zavriVsetky();
  vykresli();
  oznam("Zmeny sú zahodené.");
}

/* ---------- okno produktu ---------- */
function zavriVsetky(){
  document.querySelectorAll(".zaclona").forEach(z => z.classList.remove("show"));
}

function poliaAlergenov(vybrane){
  $("#p-alerg").innerHTML = Object.keys(ALERGENY).map(n => `
    <label><input type="checkbox" value="${n}" ${vybrane.includes(Number(n)) ? "checked" : ""} />
    <span>${n} ${esc(ALERGENY[n])}</span></label>`).join("");
}

/** Staršie položky ešte nemajú zoznam kľúčov – tam sa doplnky odvodia z toho, čo majú uložené. */
function klucePre(produkt, catId){
  if (!produkt) return [];
  if (Array.isArray(produkt.mods)) return produkt.mods;
  return MODIFIKATORY.filter(m => m.pizza
    ? (produkt.pizzaToppings != null ? produkt.pizzaToppings : catId === "pizza")
    : (produkt.addonGroups || []).some(g => (g.options || []).some(o => o.name === m.name))
  ).map(m => m.kluc);
}

function poliaModifikatorov(vybrane){
  $("#p-mods").innerHTML = MODIFIKATORY.map(m => `
    <label><input type="checkbox" value="${esc(m.kluc)}" ${vybrane.includes(m.kluc) ? "checked" : ""} />
    <span>${esc(m.popis)}${m.pizza ? "" : " · " + eur(m.price)}</span></label>`).join("");
}

function otvorProdukt(produkt, catId){
  upravovany = produkt ? produkt.id : null;
  $("#pTitul").textContent = produkt ? "Upraviť produkt" : "Nový produkt";
  $("#pChyba").textContent = "";
  $("#p-nazov").value = produkt ? produkt.name : "";
  $("#p-cena").value = produkt ? String(produkt.price).replace(".", ",") : "";
  const w = produkt && produkt.weight || {};
  // staršie položky „400/150g“ majú value prázdne – číslo sa vytiahne z textu
  const zText = /^\s*(\d+(?:,\d+)?\/\d+(?:,\d+)?)\s*g\s*$/.exec(w.text || "");
  $("#p-vaha").value = w.value != null ? String(w.value).replace(".", ",") : (zText ? zText[1] : "");
  $("#p-jednotka").value = produkt && produkt.weight && produkt.weight.unit ? produkt.weight.unit : "g";
  $("#p-popis").value = produkt ? (produkt.desc || "") : "";
  $("#p-poradie").value = produkt && produkt.sort != null ? produkt.sort : "";
  poliaAlergenov(produkt ? (produkt.allergens || []) : []);

  const vKategorii = catId || (produkt ? (kategorie().find(c => c.items.some(i => i.id === produkt.id)) || {}).id : (kategorie()[0] || {}).id);
  poliaModifikatorov(klucePre(produkt, vKategorii));
  $("#p-kat").innerHTML = kategorie().map(c => `<option value="${esc(c.id)}" ${c.id === vKategorii ? "selected" : ""}>${esc(c.cat)}</option>`).join("");

  $("#oknoProdukt").classList.add("show");
  $("#p-nazov").focus();
}

/** Uloží produkt do rozpracovanej podoby zoznamu – na server ide až pri publikovaní. */
function ulozProdukt(){
  const name = $("#p-nazov").value.trim();
  const cena = Number($("#p-cena").value.replace(",", "."));
  const vahaText = $("#p-vaha").value.trim();
  const jednotka = $("#p-jednotka").value;
  const catId = $("#p-kat").value;

  const chyba = $("#pChyba");
  chyba.textContent = "";
  if (!name){ chyba.textContent = "Vyplňte názov."; return; }
  if (!Number.isFinite(cena) || cena < 0){ chyba.textContent = "Cena musí byť kladné číslo."; return; }
  let vaha = null;
  if (vahaText){
    // „350“ alebo „400/150“ (jedlo/príloha)
    if (!/^\d+([.,]\d+)?(\/\d+([.,]\d+)?)?$/.test(vahaText)){ chyba.textContent = "Gramáž musí byť číslo, prípadne v tvare 400/150."; return; }
    vaha = vahaText.includes("/") ? vahaText.replace(/\./g, ",") : Number(vahaText.replace(",", "."));
    if (vaha === 0){ chyba.textContent = "Gramáž musí byť kladné číslo."; return; }
  }
  const ciel = kategorie().find(c => c.id === catId);
  if (!ciel){ chyba.textContent = "Vyberte kategóriu."; return; }

  const stary = upravovany ? kategorie().flatMap(c => c.items).find(i => i.id === upravovany) : null;
  const poradie = Number($("#p-poradie").value);

  const produkt = {
    ...(stary || {}),
    id: upravovany || ("tmp-" + (++tmpPocitadlo)),
    name,
    price: Math.round(cena * 100) / 100,
    weight: { value: vaha, unit: jednotka, text: vaha != null ? `${String(vaha).replace(".", ",")} ${jednotka}` : "" },
    allergens: Array.from($("#p-alerg").querySelectorAll("input:checked")).map(i => Number(i.value)).sort((a, b) => a - b),
    desc: $("#p-popis").value.trim(),
    sort: Number.isFinite(poradie) ? poradie : 0,
    online: stary ? stary.online !== false : true,
    mods: Array.from($("#p-mods").querySelectorAll("input:checked")).map(i => i.value),
  };
  // skupiny s cenami poskladá server z kľúčov – lokálne by boli hneď neaktuálne
  delete produkt.addonGroups;
  delete produkt.pizzaToppings;

  kategorie().forEach(c => { c.items = c.items.filter(i => i.id !== produkt.id); });
  ciel.items.push(produkt);
  ciel.items.sort((a, b) => (a.sort || 0) - (b.sort || 0));

  upravovany = null;
  zavriVsetky();
  vykresli();
  oznam(stary ? "Produkt upravený. Nezabudnite zmeny uložiť." : "Produkt pridaný. Nezabudnite zmeny uložiť.");
}

/* ---------- akcie v zozname (všetky len lokálne) ---------- */
function prepni(id, zapnut){
  kategorie().forEach(c => c.items.forEach(i => { if (i.id === id) i.online = zapnut; }));
  vykresli();
}

function zmaz(id){
  const p = kategorie().flatMap(c => c.items).find(i => i.id === id);
  if (!p || !confirm(`Naozaj zmazať „${p.name}“?\n\nZmaže sa až pri uložení zmien.`)) return;
  kategorie().forEach(c => { c.items = c.items.filter(i => i.id !== id); });
  vykresli();
}

function zmazKategoriu(id){
  const c = kategorie().find(x => x.id === id);
  if (!c || !confirm(`Naozaj zmazať kategóriu „${c.cat}“?`)) return;
  data[zoznam].teraz = kategorie().filter(x => x.id !== id);
  vykresli();
}

function pridajKategoriu(){
  const nazov = $("#k-nazov").value.trim();
  const chyba = $("#kChyba");
  chyba.textContent = "";
  if (!nazov){ chyba.textContent = "Vyplňte názov kategórie."; return; }
  if (kategorie().some(c => c.cat.toLowerCase() === nazov.toLowerCase())){
    chyba.textContent = "Taká kategória už existuje."; return;
  }
  kategorie().push({
    id: "tmp-kat-" + (++tmpPocitadlo), cat: nazov,
    kind: $("#k-druh").value === "drink" ? "drink" : "food",
    note: "", sort: kategorie().length, items: [],
  });
  zavriVsetky();
  vykresli();
  oznam("Kategória pridaná. Nezabudnite zmeny uložiť.");
}

/* ---------- doprava ---------- */
function pridajZonu(){
  if (!data.doprava) return;
  data.doprava.teraz.push({ fee: 0, min: 0, villages: [] });
  vykresli();
  oznam("Pásmo pridané. Doplňte obce a uložte zmeny.");
}

function zmazZonu(i){
  const z = data.doprava && data.doprava.teraz[i];
  if (!z || !confirm(`Naozaj zmazať pásmo ${i + 1}?

Prestanete rozvážať do obcí: ${z.villages.join(", ") || "—"}`)) return;
  data.doprava.teraz.splice(i, 1);
  vykresli();
}

/* ---------- zálohy ---------- */
async function otvorZalohy(){
  try{
    const odpoved = await api("/api/admin-menu", { akcia: "zalohy" });
    const z = odpoved.zalohy || [];
    $("#zVypis").innerHTML = z.length ? z.map(x => {
      const d = new Date(x.kedy);
      const p = n => String(n).padStart(2, "0");
      return `<div class="zaloha-riadok">
        <span class="kedy">${p(d.getDate())}.${p(d.getMonth() + 1)}. ${p(d.getHours())}:${p(d.getMinutes())}</span>
        <span class="co">${esc(NAZOV[x.zoznam] || x.zoznam)} — ${esc(x.popis)} <span style="color:var(--grey)">(${x.poloziek} položiek)</span></span>
        <button type="button" data-obnov="${esc(x.id)}">Vrátiť</button>
      </div>`;
    }).join("") : '<p style="color:var(--grey)">Zatiaľ žiadne zálohy – vytvoria sa pri prvom uložení.</p>';
    $("#oknoZalohy").classList.add("show");
  }catch(e){ if (e.message !== "401") oznam(e.message); }
}

async function obnovZalohu(id){
  if (jeCoUlozit() && !confirm("Máte neuložené zmeny. Vrátením zálohy sa zahodia. Pokračovať?")) return;
  if (!confirm("Vrátiť ponuku do podoby spred tejto úpravy?")) return;
  try{
    const odpoved = await api("/api/admin-menu", { akcia: "obnov", id });
    zoznam = odpoved.zoznam;
    data[zoznam] = { povodne: kopia(odpoved.kategorie), teraz: kopia(odpoved.kategorie) };
    sessionStorage.removeItem(DRAFT);
    zavriVsetky();
    vykresli();
    oznam("Ponuka je vrátená späť.");
  }catch(e){ if (e.message !== "401") oznam(e.message); }
}

/* ---------- prihlásenie ---------- */
async function prihlas(){
  const meno = $("#g-meno").value.trim();
  const heslo = $("#g-heslo").value;
  if (!meno || !heslo){ $("#gateErr").textContent = "Vyplňte meno aj heslo."; return; }
  $("#gateErr").textContent = "";
  try{
    const res = await fetch("/api/admin-auth", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "prihlas", meno, heslo }),
    });
    const odpoved = await res.json().catch(() => ({}));
    if (!res.ok || !odpoved.ok){ $("#gateErr").textContent = odpoved.error || "Prihlásenie sa nepodarilo."; return; }

    $("#g-heslo").value = "";
    $("#gate").hidden = true;
    $("#app").hidden = false;
    minutSedenia = odpoved.minut || 20;
    posunOdpocet();
    clearInterval(tikot); tikot = setInterval(tik, 1000); tik();

    for (const z of ZOZNAMY) await nacitaj(z);
    obnovOdlozene();
    vykresli();
  }catch(e){
    $("#gateErr").textContent = "Server neodpovedá. Skúste to znova.";
  }
}

/** Po opätovnom prihlásení vrátime nazbierané zmeny späť. */
function obnovOdlozene(){
  const raw = sessionStorage.getItem(DRAFT);
  if (!raw) return;
  sessionStorage.removeItem(DRAFT);
  let d; try{ d = JSON.parse(raw); }catch{ return; }
  let vratene = 0;
  SEKCIE.forEach(z => {
    if (d[z] && data[z]){ data[z].teraz = d[z]; vratene++; }
  });
  if (vratene) oznam("Neuložené zmeny sú späť. Uložte ich tlačidlom dole.");
}

async function odhlas(){
  if (jeCoUlozit() && !confirm("Máte neuložené zmeny. Odhlásiť sa a zahodiť ich?")) return;
  sessionStorage.removeItem(DRAFT);
  data = PRAZDNE();
  try{ await fetch("/api/admin-auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ akcia: "odhlas" }) }); }catch(e){}
  naGate("");
}

/* ---------- napojenie ovládania ---------- */
$("#prihlas").addEventListener("click", prihlas);
$("#g-heslo").addEventListener("keydown", e => { if (e.key === "Enter") prihlas(); });
$("#g-meno").addEventListener("keydown", e => { if (e.key === "Enter") $("#g-heslo").focus(); });
$("#odhlas").addEventListener("click", odhlas);
$("#zalohyBtn").addEventListener("click", otvorZalohy);
$("#ulozBtn").addEventListener("click", publikuj);
$("#zahodBtn").addEventListener("click", zahod);

document.querySelector(".tabs").addEventListener("click", e => {
  const b = e.target.closest("[data-zoznam]");
  if (!b || b.dataset.zoznam === zoznam) return;
  zavriVsetky();
  zoznam = b.dataset.zoznam;      // rozpracované zmeny druhého zoznamu ostávajú
  vykresli();
});

$("#novyBtn").addEventListener("click", () => {
  if (!kategorie().length){ oznam("Najprv pridajte kategóriu."); return; }
  otvorProdukt(null, null);
});
$("#novaKatBtn").addEventListener("click", () => {
  if (zoznam === "doprava"){ pridajZonu(); return; }
  $("#k-nazov").value = ""; $("#kChyba").textContent = "";
  $("#oknoKat").classList.add("show");
  $("#k-nazov").focus();
});

// pásma sa píšu rovno do modelu, prekresľovať sa nesmie – kurzor by odskočil
$("#vypis").addEventListener("input", e => {
  const dopl = e.target.closest("[data-doplnok]");
  if (dopl && data.doplnky){
    const d = data.doplnky.teraz[Number(dopl.dataset.doplnok)];
    if (d) d.price = dopl.value.trim().replace(",", ".");   // číslo skontroluje a zaokrúhli server
    oznacZmeny();
    return;
  }
  const el = e.target.closest("[data-zona]");
  if (!el || !data.doprava) return;
  const z = data.doprava.teraz[Number(el.dataset.zona)];
  if (!z) return;
  if (el.dataset.pole === "villages") z.villages = el.value.split("\n").map(o => o.trim()).filter(Boolean);
  else z[el.dataset.pole] = el.value;      // číslo skontroluje a zaokrúhli server
  oznacZmeny();
});

$("#vypis").addEventListener("click", e => {
  const zmazZ = e.target.closest("[data-zmaz-zonu]");
  if (zmazZ){ zmazZonu(Number(zmazZ.dataset.zmazZonu)); return; }
  const prep = e.target.closest("[data-prep]");
  if (prep){ prepni(prep.dataset.prep, prep.getAttribute("aria-pressed") !== "true"); return; }
  const uprav = e.target.closest("[data-uprav]");
  if (uprav){
    const p = kategorie().flatMap(c => c.items).find(i => i.id === uprav.dataset.uprav);
    if (p) otvorProdukt(p, null);
    return;
  }
  const zmazBtn = e.target.closest("[data-zmaz]");
  if (zmazBtn){ zmaz(zmazBtn.dataset.zmaz); return; }
  const doKat = e.target.closest("[data-do-kat]");
  if (doKat){ otvorProdukt(null, doKat.dataset.doKat); return; }
  const zmazKat = e.target.closest("[data-zmaz-kat]");
  if (zmazKat){ zmazKategoriu(zmazKat.dataset.zmazKat); }
});

$("#zVypis").addEventListener("click", e => {
  const b = e.target.closest("[data-obnov]");
  if (b) obnovZalohu(b.dataset.obnov);
});

$("#pUloz").addEventListener("click", ulozProdukt);
$("#kUloz").addEventListener("click", pridajKategoriu);

function zavriProdukt(){ upravovany = null; zavriVsetky(); }
$("#pZavri").addEventListener("click", zavriProdukt);
$("#pZrus").addEventListener("click", zavriProdukt);
$("#kZavri").addEventListener("click", zavriVsetky);
$("#kZrus").addEventListener("click", zavriVsetky);
$("#zZavri").addEventListener("click", zavriVsetky);

document.addEventListener("keydown", e => { if (e.key === "Escape") zavriProdukt(); });

/* Obnovenie stránky odhlasuje – nech neprídu o nazbierané zmeny bez varovania. */
addEventListener("beforeunload", e => {
  if (!jeCoUlozit()) return;
  e.preventDefault();
  e.returnValue = "";
});

/* Štart: server zruší akékoľvek staré sedenie, takže sa vždy začína prihlásením. */
(async () => {
  try{
    await fetch("/api/admin-auth", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "start" }),
    });
  }catch(e){}
  naGate("");
})();
