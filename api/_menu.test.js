'use strict';
/* Kontrola doplnkov: node api/_menu.test.js */
const assert = require('assert');
const menu = require('./_menu');

// katalóg musí presne zopakovať to, čo majú burgery v menu.json
assert.deepStrictEqual(
  menu.doplnkyZKlucov(['king-size', 'halloumi-miesto-masa']).addonGroups,
  [
    { title: 'Mäso', options: [{ name: 'Syr Halloumi namiesto hovädzieho mäsa', price: 0 }], max: 1 },
    { title: 'Doplnky', options: [{ name: 'King size', price: 3 }] },
  ]
);

// jedna skupina, dve možnosti, limit ostáva
const priloha = menu.doplnkyZKlucov(['priloha-ryza', 'priloha-hranolky']).addonGroups[0];
assert.strictEqual(priloha.max, 2);
assert.strictEqual(priloha.options.length, 2);

// podvrhnutý kľúč neprejde
assert.deepStrictEqual(menu.doplnkyZKlucov(['zadarmo-vsetko']), { addonGroups: [], pizzaToppings: false });

// pizza príznak
assert.strictEqual(menu.doplnkyZKlucov(['pizza-doplnky']).pizzaToppings, true);
assert.strictEqual(menu.maPizzaDoplnky({ catId: 'pizza' }), true);            // stará položka bez príznaku
assert.strictEqual(menu.maPizzaDoplnky({ catId: 'pizza', pizzaToppings: false }), false); // vypnuté v admine
assert.strictEqual(menu.maPizzaDoplnky({ catId: 'burger', pizzaToppings: true }), true);  // zapnuté inde

console.log('doplnky OK');

// ---- rozvozové pásma ----
const { skontrolujZony } = require('./admin-menu');

const ok = skontrolujZony([{ fee: '1,50', min: '15', villages: ['Lúčky', ' Potok '] }]);
assert.deepStrictEqual(ok.zony, [{ fee: 1.5, min: 15, villages: ['Lúčky', 'Potok'] }]);

// tá istá obec v dvoch pásmach by tichučko rozhodovala o cene podľa poradia
assert.match(skontrolujZony([
  { fee: 1, min: 10, villages: ['Lúčky'] },
  { fee: 3, min: 10, villages: ['Lúčky'] },
]).chyba, /dvoch pásmach/);

assert.match(skontrolujZony([{ fee: 'zadarmo', min: 10, villages: ['Lúčky'] }]).chyba, /Cena dopravy/);
assert.match(skontrolujZony([{ fee: 1, min: -5, villages: ['Lúčky'] }]).chyba, /Minimálna objednávka/);
assert.match(skontrolujZony([{ fee: 1, min: 10, villages: [] }]).chyba, /nemá ani jednu obec/);
assert.match(skontrolujZony([]).chyba, /aspoň jedno pásmo/);

console.log('doprava OK');
