/* =========================================================
   Vila 27 — jediný zdroj jedálneho a nápojového lístka.
   Používa ho jedalny-listok.html (zobrazenie) aj objednavka.html
   (objednávanie). Zmena ceny = zmena tu, prejaví sa všade.

   kind:  "food" | "drink"
   order: kategória sa dá objednať online (rozvoz / odber)
   item.order === false  → položka sa zobrazí v lístku, ale nedá sa objednať
   item.orderOnly === true → len v objednávke (nie v tlačenom lístku)
   item.addons / addonGroups → doplnky ponúkané pri objednávke
   item.menuAddons / cat.extras → doplnky zobrazené v lístku
   ========================================================= */
(function (root) {
  var MENU = [
  {
    "id": "predjedla",
    "cat": "Predjedlá",
    "kind": "food",
    "order": true,
    "items": [
      {
        "id": "pd1",
        "name": "Tatársky biftek",
        "w": "150g",
        "price": 12.5,
        "desc": "hovädzia sviečkovica, cesnak, cibuľa, vajce, horčica, worčester, hrianka",
        "alg": "lepok, vajcia, horčica"
      },
      {
        "id": "pd2",
        "name": "Domáca hrianka s trhaným bravčovým mäsom a údeným syrom",
        "w": "150g",
        "price": 8.9,
        "desc": "trhané bravčové mäso, majonéza",
        "alg": "lepok, mlieko"
      }
    ]
  },
  {
    "id": "polievky",
    "cat": "Polievky",
    "kind": "food",
    "order": true,
    "items": [
      {
        "id": "po1",
        "name": "Slepačí vývar",
        "w": "0,33l",
        "price": 4.1,
        "desc": "s mäsom, domácimi rezancami a zeleninou",
        "alg": "lepok, zeler, vajcia"
      },
      {
        "id": "po2",
        "name": "Cesnaková polievka so syrom",
        "w": "0,33l",
        "price": 4.1,
        "desc": "silný vývar, cesnak, syr, krutóny",
        "alg": "lepok, mlieko"
      },
      {
        "id": "po3",
        "name": "Paradajková polievka",
        "w": "0,33l",
        "price": 4.5,
        "desc": "paradajky, koreňová zelenina, parmezán",
        "alg": "mlieko, zeler"
      }
    ]
  },
  {
    "id": "salaty",
    "cat": "Šaláty",
    "kind": "food",
    "order": true,
    "items": [
      {
        "id": "sa1",
        "name": "Cézar šalát",
        "w": "350g",
        "price": 8.9,
        "desc": "listový šalát, cherry paradajky, cézar dressing s parmezánom, krutóny",
        "alg": "mlieko, vajcia, ryby, horčica",
        "addons": [
          {
            "name": "100g kuracie prsia",
            "price": 3.0
          },
          {
            "name": "100g syr Halloumi",
            "price": 3.0
          }
        ],
        "menuAddons": [
          {
            "name": "100g kuracie prsia",
            "price": 3.0
          },
          {
            "name": "100g syr Halloumi",
            "price": 3.0
          }
        ]
      },
      {
        "id": "sa2",
        "name": "Letný šalát s bryndzou, karamelizovaným jabĺčkom a chrumkom",
        "w": "400/150g",
        "price": 11.9,
        "desc": "listový šalát, bryndza, karamelizované jablko, dresing",
        "alg": "mlieko, horčica"
      }
    ]
  },
  {
    "id": "cestoviny",
    "cat": "Cestoviny",
    "kind": "food",
    "order": true,
    "items": [
      {
        "id": "ce1",
        "name": "Tagliatelle s paradajkovou kompozíciou a parmezánom",
        "w": "380g",
        "price": 9.5,
        "alg": "lepok, mlieko",
        "addons": [
          {
            "name": "100g losos",
            "price": 5.0
          },
          {
            "name": "100g syr Halloumi",
            "price": 3.0
          }
        ],
        "menuAddons": [
          {
            "name": "100g losos",
            "price": 5.0
          },
          {
            "name": "100g syr Halloumi",
            "price": 3.0
          }
        ]
      },
      {
        "id": "ce2",
        "name": "Krémové smotanovo-citrónové tagliatelle",
        "w": "380g",
        "price": 9.5,
        "desc": "smotana, parmezán",
        "alg": "lepok, mlieko, vajcia",
        "addons": [
          {
            "name": "100g kuracie prsia",
            "price": 3.0
          }
        ],
        "menuAddons": [
          {
            "name": "100g kuracie prsia",
            "price": 3.0
          }
        ]
      }
    ]
  },
  {
    "id": "jedla-z-liptova",
    "cat": "Jedlá z Liptova",
    "kind": "food",
    "order": true,
    "items": [
      {
        "id": "lp1",
        "name": "Halušky s bryndzou",
        "w": "380g",
        "price": 10.9,
        "desc": "slanina",
        "alg": "lepok, mlieko, vajcia"
      },
      {
        "id": "lp2",
        "name": "Bravčový rezeň v panko strúhanke so zemiakovým pyré a cesnakovou majonézou",
        "w": "400/150g",
        "price": 12.9,
        "alg": "lepok, mlieko, vajcia"
      },
      {
        "id": "lp3",
        "name": "Vyprážaný údený syr s baby pečenými zemiakmi",
        "w": "400/150g",
        "price": 11.9,
        "desc": "s tatárskou omáčkou",
        "alg": "lepok, mlieko, vajce"
      }
    ]
  },
  {
    "id": "hlavne-jedla-bez-priloh",
    "cat": "Hlavné jedlá bez príloh",
    "kind": "food",
    "order": true,
    "extras": [
      {
        "name": "0,1l syrová omáčka",
        "price": 2.0
      },
      {
        "name": "0,1l demi-glace omáčka",
        "price": 2.0
      }
    ],
    "items": [
      {
        "id": "hb1",
        "name": "Kurací steak Sous-Vide",
        "w": "180g",
        "price": 8.5,
        "addonGroups": [
          {
            "title": "Omáčka",
            "max": 1,
            "options": [
              {
                "name": "0,1l syrová omáčka",
                "price": 0
              },
              {
                "name": "0,1l demi-glace omáčka",
                "price": 0
              }
            ]
          },
          {
            "title": "Príloha",
            "max": 2,
            "note": "Pri výbere 2 príloh dostanete každú v polovičnej porcii (50/50).",
            "options": [
              {
                "name": "Zemiakové hranolky",
                "price": 2.9
              },
              {
                "name": "Batátové hranolky",
                "price": 3.9
              },
              {
                "name": "Baby pečené zemiaky",
                "price": 2.9
              },
              {
                "name": "Ryža",
                "price": 2.3
              }
            ]
          }
        ]
      },
      {
        "id": "hb2",
        "name": "Bravčová panenka Sous-Vide",
        "w": "170g",
        "price": 9.5,
        "addonGroups": [
          {
            "title": "Omáčka",
            "max": 1,
            "options": [
              {
                "name": "0,1l syrová omáčka",
                "price": 0
              },
              {
                "name": "0,1l demi-glace omáčka",
                "price": 0
              }
            ]
          },
          {
            "title": "Príloha",
            "max": 2,
            "note": "Pri výbere 2 príloh dostanete každú v polovičnej porcii (50/50).",
            "options": [
              {
                "name": "Zemiakové hranolky",
                "price": 2.9
              },
              {
                "name": "Batátové hranolky",
                "price": 3.9
              },
              {
                "name": "Baby pečené zemiaky",
                "price": 2.9
              },
              {
                "name": "Ryža",
                "price": 2.3
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "hlavne-jedla",
    "cat": "Hlavné jedlá",
    "kind": "food",
    "order": true,
    "items": [
      {
        "id": "hj1",
        "name": "Grilovaný losos, zemiaky & karfiol v dvoch pyré, smotanovo-citrónová omáčka",
        "w": "400/200g",
        "price": 15.5,
        "alg": "zeler, ryby, mlieko"
      },
      {
        "id": "hj2",
        "name": "Kurací steak s jarnou zeleninou a karfiolovým pyré",
        "w": "350/180g",
        "price": 12.9,
        "alg": "mlieko"
      },
      {
        "id": "hj3",
        "name": "Krémové Bianco rizoto s kuracím mäsom a baby mrkvou",
        "w": "350g",
        "price": 12.9,
        "alg": "mlieko, zeler"
      },
      {
        "id": "hj4",
        "name": "BBQ Bravčové rebrá s baby opekanými zemiakmi a paradajkovo-citrónovou salzou",
        "w": "500/150g",
        "price": 15.5,
        "alg": "mlieko, zeler"
      },
      {
        "id": "hj5",
        "name": "Bravčová panenka na omáčke z čierneho cesnaku, štuchaný zemiak so slaninou a šalotkou, karamelizované jabĺčko",
        "w": "400/200g",
        "price": 15.9,
        "alg": "zeler, mlieko"
      },
      {
        "id": "hj6",
        "name": "Hovädzia hruď so zemiakovým pyré a omáčkou z portského vína",
        "w": "400/150g",
        "price": 19.9,
        "alg": "lepok, zeler, mlieko, vajce, horčica"
      }
    ]
  },
  {
    "id": "burger-s-hranolkami",
    "cat": "Burger s hranolkami",
    "kind": "food",
    "order": true,
    "note": "Namiesto hovädzieho mäsa použijeme na požiadanie syr Halloumi.",
    "extras": [
      {
        "name": "King size",
        "price": 3.0
      }
    ],
    "items": [
      {
        "id": "bu1",
        "name": "Cheeseburger",
        "w": "400g",
        "price": 13.9,
        "desc": "hovädzie mäso, Jack Daniels omáčka, červená cibuľa, slaninový džem, paradajka, syr Cheddar, listový šalát, majonéza, hranolky, tatárska omáčka",
        "alg": "lepok, mlieko, vajcia, sezamové semená",
        "addons": [
          {
            "name": "King size",
            "price": 3.0
          }
        ]
      },
      {
        "id": "bu2",
        "name": "Jalapeňos burger",
        "w": "350/150g",
        "price": 13.9,
        "desc": "hovädzie mäso, Jalapeňos omáčka, červená cibuľa, slaninový džem, slanina, paradajka, listový šalát, majonéza, hranolky, tatárska omáčka",
        "alg": "lepok, mlieko, vajcia, sezamové semená",
        "addons": [
          {
            "name": "King size",
            "price": 3.0
          }
        ]
      },
      {
        "id": "bu3",
        "name": "Burger Pulled s trhaným mäskom",
        "w": "350/150g",
        "price": 13.9,
        "desc": "trhané bravčové mäso, slaninový džem, červená cibuľa, cheddar, vajce, paradajka, listový šalát, hranolky, tatárska omáčka",
        "alg": "lepok, mlieko, vajcia, sezamové semená"
      }
    ]
  },
  {
    "id": "pizza",
    "cat": "Pizza",
    "kind": "food",
    "order": true,
    "note": "Doplnky si vyberiete po pridaní do košíka.",
    "extras": [
      {
        "name": "Bezlepkové cesto",
        "price": 2.0
      }
    ],
    "items": [
      {
        "id": "pz1",
        "name": "Margherita",
        "w": "320g",
        "price": 8.4,
        "desc": "paradajková omáčka, mozzarella, bylinky",
        "alg": "lepok, mlieko",
        "no": 1
      },
      {
        "id": "pz2",
        "name": "Classica",
        "w": "420g",
        "price": 8.9,
        "desc": "paradajková omáčka, mozzarella, šunka, kukurica, bylinky",
        "alg": "lepok, mlieko",
        "no": 2
      },
      {
        "id": "pz3",
        "name": "Prosciutto",
        "w": "380g",
        "price": 11.4,
        "desc": "paradajková omáčka, mozzarella, prosciutto, rukola, parmezán, bylinky",
        "alg": "lepok, mlieko",
        "no": 3
      },
      {
        "id": "pz4",
        "name": "Capricciosa",
        "w": "460g",
        "price": 8.9,
        "desc": "paradajková omáčka, mozzarella, šunka, šampiňóny čerstvé, bylinky",
        "alg": "lepok, mlieko",
        "no": 4
      },
      {
        "id": "pz5",
        "name": "All Salame",
        "w": "450g",
        "price": 10.9,
        "desc": "paradajková omáčka, mozzarella, šunka, saláma, slanina, bylinky",
        "alg": "lepok, mlieko",
        "no": 5
      },
      {
        "id": "pz6",
        "name": "Pollo",
        "w": "480g",
        "price": 10.9,
        "desc": "smotanový základ, mozzarella, kuracie mäso, brokolica, niva, bylinky",
        "alg": "lepok, mlieko",
        "no": 6
      },
      {
        "id": "pz7",
        "name": "Roma",
        "w": "480g",
        "price": 11.5,
        "desc": "paradajková omáčka, mozzarella, šunka, šampiňóny čerstvé, kukurica, slanina, feferóny, saláma, bylinky",
        "alg": "lepok, mlieko",
        "no": 7
      },
      {
        "id": "pz8",
        "name": "Al Capone",
        "w": "440g",
        "price": 9.9,
        "desc": "paradajková omáčka, cesnak, mozzarella, saláma, syr niva, olivy, bylinky",
        "alg": "lepok, mlieko",
        "no": 8
      },
      {
        "id": "pz9",
        "name": "Hawai",
        "w": "450g",
        "price": 9.4,
        "desc": "paradajková omáčka, mozzarella, šunka, ananás, bylinky",
        "alg": "lepok, mlieko",
        "no": 9
      },
      {
        "id": "pz10",
        "name": "Quattro Formaggi",
        "w": "440g",
        "price": 10.9,
        "desc": "paradajková omáčka, mozzarella, syr niva, eidam, parmezán",
        "alg": "lepok, mlieko",
        "no": 10
      },
      {
        "id": "pz11",
        "name": "Pizza s trhaným mäsom",
        "w": "400g",
        "price": 10.9,
        "desc": "paradajková omáčka, mozzarella, hovädzie trhané mäso, cibuľa, cheddar, rukola, bylinky",
        "alg": "lepok, mlieko",
        "no": 11
      },
      {
        "id": "pz12",
        "name": "Slovakia",
        "w": "410g",
        "price": 10.4,
        "desc": "kyslá smotana, bryndza, parmezán, slanina, karamelizovaná cibuľa, šunka, pažítka",
        "alg": "lepok, mlieko",
        "no": 12
      },
      {
        "id": "pz13",
        "name": "Mista",
        "w": "450g",
        "price": 10.4,
        "desc": "paradajková omáčka, mozzarella, šunka, šampiňóny čerstvé, kukurica, olivy, vajce, bylinky",
        "alg": "lepok, mlieko",
        "no": 13
      },
      {
        "id": "pz14",
        "name": "Mexicana",
        "w": "450g",
        "price": 10.4,
        "desc": "paradajková omáčka, mozzarella, šunka, saláma, kukurica, mexická fazuľa, feferóny, kyslá smotana, chili omáčka, bylinky",
        "alg": "lepok, mlieko",
        "no": 14
      },
      {
        "id": "pz15",
        "name": "Vila27",
        "w": "450g",
        "price": 10.4,
        "desc": "paradajková omáčka, mozzarella, saláma, pikantná klobása, čerstvé paradajky, bylinky",
        "alg": "lepok, mlieko",
        "no": 15
      },
      {
        "id": "pz16",
        "name": "Pepperoni",
        "w": "420g",
        "price": 9.9,
        "desc": "paradajková omáčka, mozzarella, saláma pepperoni, červená cibuľa, bylinky",
        "alg": "lepok, mlieko",
        "no": 16
      },
      {
        "id": "pzOwn",
        "name": "Poskladaj si vlastnú pizzu",
        "w": "",
        "price": 8.4,
        "desc": "cesto, mozzarella a bylinky — základ a doplnky podľa seba",
        "orderOnly": true,
        "buildYourOwn": true
      }
    ]
  },
  {
    "id": "prilohy",
    "cat": "Prílohy",
    "kind": "food",
    "order": true,
    "items": [
      {
        "id": "pr1",
        "name": "Zemiakové hranolky",
        "w": "200g",
        "price": 2.9
      },
      {
        "id": "pr2",
        "name": "Batátové hranolky",
        "w": "200g",
        "price": 3.9
      },
      {
        "id": "pr3",
        "name": "Baby pečené zemiaky",
        "w": "200g",
        "price": 2.9
      },
      {
        "id": "pr4",
        "name": "Ryža",
        "w": "200g",
        "price": 2.3
      },
      {
        "id": "pr5",
        "name": "Grilovaná zelenina",
        "w": "200g",
        "price": 3.9,
        "desc": "cuketa, šampiňóny, farebná paprika, tekvica"
      },
      {
        "id": "pr6",
        "name": "Miešaný zeleninový šalát",
        "w": "200g",
        "price": 3.9,
        "desc": "listový šalát, paradajka, paprika, uhorka, dresing",
        "alg": "mlieko, horčica"
      },
      {
        "id": "pr7",
        "name": "Pizza chlieb",
        "w": "100g",
        "price": 3.5,
        "desc": "cesnak",
        "alg": "lepok, mlieko, vajcia"
      },
      {
        "id": "pr8",
        "name": "Kečup",
        "w": "50g",
        "price": 1.5
      },
      {
        "id": "pr9",
        "name": "Tatárska omáčka",
        "w": "50g",
        "price": 1.5,
        "alg": "mlieko, vajcia, horčica"
      },
      {
        "id": "pr10",
        "name": "Dressing – cesnakový, cézar",
        "w": "50g",
        "price": 2.2,
        "alg": "mlieko, horčica"
      },
      {
        "id": "pr11",
        "name": "Domáca omáčka – Jack Daniels, BBQ, Jalapeňos",
        "w": "50g",
        "price": 2.9
      }
    ]
  },
  {
    "id": "dezerty",
    "cat": "Dezerty",
    "kind": "food",
    "order": true,
    "items": [
      {
        "id": "de1",
        "name": "Domáce palacinky s nutelou alebo džemom",
        "w": "150g",
        "price": 5.9,
        "desc": "so šľahačkou",
        "alg": "lepok, mlieko, vajcia"
      },
      {
        "id": "de2",
        "name": "Lávový koláč s horúcimi malinami a šľahačkou",
        "w": "150g",
        "price": 5.9,
        "alg": "lepok, mlieko, vajce"
      }
    ]
  },
  {
    "id": "vodka",
    "cat": "Vodka",
    "kind": "drink",
    "order": false,
    "items": [
      {
        "id": "vd1",
        "name": "Absolut 40%",
        "w": "0,04l",
        "price": 2.8
      }
    ]
  },
  {
    "id": "destilaty",
    "cat": "Destiláty",
    "kind": "drink",
    "order": false,
    "items": [
      {
        "id": "ds1",
        "name": "Borovička Konifer 37,5%",
        "w": "0,04l",
        "price": 2.6
      },
      {
        "id": "ds2",
        "name": "Gin Beefeater 40%",
        "w": "0,04l",
        "price": 2.9
      },
      {
        "id": "ds3",
        "name": "Hruškovica Jelínek 42%",
        "w": "0,04l",
        "price": 3.0
      },
      {
        "id": "ds4",
        "name": "Slivovica Jelínek 50%",
        "w": "0,04l",
        "price": 3.0
      },
      {
        "id": "ds5",
        "name": "Marhuľovica Jelínek 42%",
        "w": "0,04l",
        "price": 3.9
      }
    ]
  },
  {
    "id": "rum",
    "cat": "Rum",
    "kind": "drink",
    "order": false,
    "items": [
      {
        "id": "rm1",
        "name": "Havana 3yo 37,5%",
        "w": "0,04l",
        "price": 2.8
      },
      {
        "id": "rm2",
        "name": "Captain Morgan 35%",
        "w": "0,04l",
        "price": 2.6
      },
      {
        "id": "rm3",
        "name": "Don Papa 40%",
        "w": "0,04l",
        "price": 4.9
      },
      {
        "id": "rm4",
        "name": "Bumbu 40%",
        "w": "0,04l",
        "price": 3.9
      }
    ]
  },
  {
    "id": "brandy",
    "cat": "Brandy",
    "kind": "drink",
    "order": false,
    "items": [
      {
        "id": "br1",
        "name": "KBŠ 38%",
        "w": "0,04l",
        "price": 4.9
      },
      {
        "id": "br2",
        "name": "Ararat 7yo 40%",
        "w": "0,04l",
        "price": 3.2
      }
    ]
  },
  {
    "id": "whiskey",
    "cat": "Whiskey",
    "kind": "drink",
    "order": false,
    "items": [
      {
        "id": "wh1",
        "name": "Jameson 40%",
        "w": "0,04l",
        "price": 3.2
      },
      {
        "id": "wh2",
        "name": "Chivas Regal 40%",
        "w": "0,04l",
        "price": 4.9
      },
      {
        "id": "wh3",
        "name": "Jack Daniels 40%",
        "w": "0,04l",
        "price": 3.5
      }
    ]
  },
  {
    "id": "liker",
    "cat": "Likér",
    "kind": "drink",
    "order": false,
    "items": [
      {
        "id": "lk1",
        "name": "Becherovka 38%",
        "w": "0,04l",
        "price": 2.8
      },
      {
        "id": "lk2",
        "name": "Demänovka 38%",
        "w": "0,04l",
        "price": 2.8
      },
      {
        "id": "lk3",
        "name": "Fernet Stock 40%",
        "w": "0,04l",
        "price": 2.6
      },
      {
        "id": "lk4",
        "name": "Fernet Stock Citrus 30%",
        "w": "0,04l",
        "price": 2.6
      },
      {
        "id": "lk5",
        "name": "Jägermeister 35%",
        "w": "0,04l",
        "price": 3.2
      },
      {
        "id": "lk6",
        "name": "Tatranský čaj 52%",
        "w": "0,04l",
        "price": 2.8
      }
    ]
  },
  {
    "id": "miesane-napoje",
    "cat": "Miešané nápoje",
    "kind": "drink",
    "order": false,
    "items": [
      {
        "id": "mx1",
        "name": "Mojito",
        "w": "",
        "price": 4.6,
        "desc": "0,04l havana, cukor, limetková šťava, 10g mäta, 0,2l sóda"
      },
      {
        "id": "mx2",
        "name": "Caipiroska",
        "w": "",
        "price": 3.9,
        "desc": "0,04l absolut, limetka, cukrový sirup"
      },
      {
        "id": "mx3",
        "name": "Tom Collins",
        "w": "",
        "price": 4.4,
        "desc": "0,04l gin beefeater, citrónová šťava, cukrový sirup, sóda"
      },
      {
        "id": "mx4",
        "name": "Piña colada",
        "w": "",
        "price": 4.9,
        "desc": "0,04l havana, 0,04l kokosový likér, 0,1l ananásový džús"
      },
      {
        "id": "mx5",
        "name": "Mimosa",
        "w": "",
        "price": 3.6,
        "desc": "0,1l prosecco, 0,1l pomarančový džús"
      },
      {
        "id": "mx6",
        "name": "Aperol Spritz",
        "w": "",
        "price": 4.9,
        "desc": "0,06l prosecco, 0,04l aperol, 0,02l sóda"
      },
      {
        "id": "mx7",
        "name": "Hugo",
        "w": "",
        "price": 4.4,
        "desc": "0,1l prosecco, 0,05l sóda, bazový sirup, mäta"
      },
      {
        "id": "mx8",
        "name": "Cuba libre",
        "w": "",
        "price": 4.4,
        "desc": "0,04l havana, 0,15l coca cola, limetka"
      },
      {
        "id": "mx9",
        "name": "Tropical matcha fizz",
        "w": "",
        "price": 4.9,
        "desc": "matcha, ananás, sóda, ľad"
      },
      {
        "id": "mx10",
        "name": "Strawberry matcha latte",
        "w": "",
        "price": 4.9,
        "desc": "matcha, jahodové pyré, mlieko"
      },
      {
        "id": "mx11",
        "name": "Sunset matcha",
        "w": "",
        "price": 4.9,
        "desc": "matcha, grep, sóda, sirup, ľad"
      }
    ]
  },
  {
    "id": "sekt",
    "cat": "Sekt",
    "kind": "drink",
    "order": false,
    "note": "Všetky druhy sektu obsahujú alergén: siričitany.",
    "items": [
      {
        "id": "sk1",
        "name": "Hubert de Luxe",
        "w": "0,75l",
        "price": 15.0,
        "alg": "siričitany"
      },
      {
        "id": "sk2",
        "name": "Prosecco Frizante",
        "w": "0,10l",
        "price": 1.9,
        "alg": "siričitany"
      }
    ]
  },
  {
    "id": "vino-rozlievane",
    "cat": "Víno rozlievané",
    "kind": "drink",
    "order": false,
    "note": "Alergén: siričitany.",
    "items": [
      {
        "id": "vr1",
        "name": "Müller Thurgau PAVELKA",
        "w": "0,10l",
        "price": 2.0,
        "alg": "siričitany"
      },
      {
        "id": "vr2",
        "name": "Frankovka modrá PAVELKA",
        "w": "0,10l",
        "price": 2.0,
        "alg": "siričitany"
      },
      {
        "id": "vr3",
        "name": "Cabernet Rosé PAVELKA",
        "w": "0,10l",
        "price": 2.0,
        "alg": "siričitany"
      }
    ]
  },
  {
    "id": "vino-flaskove",
    "cat": "Víno fľaškové",
    "kind": "drink",
    "order": true,
    "note": "Alergén: siričitany.",
    "items": [
      {
        "id": "vf1",
        "name": "Devín KARPATSKÁ PERLA",
        "w": "0,75l",
        "price": 21.0,
        "alg": "siričitany"
      },
      {
        "id": "vf2",
        "name": "Rulandské šedé CHOVANIEC A KRAJČÍROVIČ",
        "w": "0,75l",
        "price": 21.0,
        "alg": "siričitany"
      },
      {
        "id": "vf3",
        "name": "André K. PERLA",
        "w": "0,75l",
        "price": 21.0,
        "alg": "siričitany"
      },
      {
        "id": "vf4",
        "name": "Alibernet CHOVANIEC A KRAJČÍROVIČ",
        "w": "0,75l",
        "price": 21.0,
        "alg": "siričitany"
      },
      {
        "id": "vf5",
        "name": "Rizling vlašský NICHTA",
        "w": "0,75l",
        "price": 21.0,
        "alg": "siričitany"
      },
      {
        "id": "vf6",
        "name": "Cabernet Sauvignon NICHTA",
        "w": "0,75l",
        "price": 21.0,
        "alg": "siričitany"
      }
    ]
  },
  {
    "id": "pivo",
    "cat": "Pivo",
    "kind": "drink",
    "order": true,
    "note": "Alergén: jačmenný slad.",
    "items": [
      {
        "id": "pv1",
        "name": "Plzeň 12%",
        "w": "0,5l",
        "price": 3.0,
        "alg": "jačmenný slad",
        "order": false
      },
      {
        "id": "pv2",
        "name": "Plzeň 12%",
        "w": "0,3l",
        "price": 1.9,
        "alg": "jačmenný slad",
        "order": false
      },
      {
        "id": "pv3",
        "name": "Šariš tmavý 12% fľ.",
        "w": "0,5l",
        "price": 2.8,
        "alg": "jačmenný slad"
      },
      {
        "id": "pv4",
        "name": "Radegast Birell nealko fľ.",
        "w": "0,5l",
        "price": 2.8,
        "alg": "jačmenný slad"
      },
      {
        "id": "pv5",
        "name": "Radler nealko pomelo-grep",
        "w": "0,5l",
        "price": 2.8,
        "alg": "jačmenný slad",
        "order": false
      }
    ]
  },
  {
    "id": "nealko",
    "cat": "Nealko",
    "kind": "drink",
    "order": true,
    "items": [
      {
        "id": "ne1",
        "name": "Coca-Cola, Zero",
        "w": "0,33l",
        "price": 2.7
      },
      {
        "id": "ne2",
        "name": "Fanta",
        "w": "0,33l",
        "price": 2.7
      },
      {
        "id": "ne3",
        "name": "Sprite",
        "w": "0,33l",
        "price": 2.7
      },
      {
        "id": "ne4",
        "name": "Tonic, Zázvor, Rosé",
        "w": "0,25l",
        "price": 2.7,
        "alg": "E150d"
      },
      {
        "id": "ne5",
        "name": "Ľadový čaj",
        "w": "0,25l",
        "price": 2.7
      },
      {
        "id": "ne6",
        "name": "Cappy džús",
        "w": "0,25l",
        "price": 2.7
      },
      {
        "id": "ne7",
        "name": "Römerquelle",
        "w": "0,33l",
        "price": 2.7
      },
      {
        "id": "ne8",
        "name": "Čapovaná kofola",
        "w": "0,10l",
        "price": 0.5,
        "alg": "E150d, E211",
        "order": false
      },
      {
        "id": "ne9",
        "name": "Red Bull plech",
        "w": "0,25l",
        "price": 3.5
      },
      {
        "id": "ne10",
        "name": "sóda, čistá voda",
        "w": "0,10l",
        "price": 0.5,
        "order": false
      }
    ]
  },
  {
    "id": "teple-napoje-doplnky",
    "cat": "Teplé nápoje, doplnky",
    "kind": "drink",
    "order": false,
    "items": [
      {
        "id": "tp1",
        "name": "Espresso",
        "w": "8g",
        "price": 2.7
      },
      {
        "id": "tp2",
        "name": "Caffè Latte",
        "w": "8g",
        "price": 3.2,
        "alg": "mlieko"
      },
      {
        "id": "tp3",
        "name": "Cappuccino",
        "w": "8g",
        "price": 3.1,
        "alg": "mlieko"
      },
      {
        "id": "tp4",
        "name": "Espresso doppio",
        "w": "8g",
        "price": 4.6
      },
      {
        "id": "tp5",
        "name": "Bezkofeínová káva",
        "w": "8g",
        "price": 2.8
      },
      {
        "id": "tp6",
        "name": "Čaj Teekanne",
        "w": "1,5g",
        "price": 2.5
      },
      {
        "id": "tp7",
        "name": "Čerstvý čaj zázvor, mäta",
        "w": "20g",
        "price": 3.2
      },
      {
        "id": "tp8",
        "name": "Horúca čokoláda",
        "w": "25g",
        "price": 3.2,
        "alg": "mlieko"
      },
      {
        "id": "tp9",
        "name": "Citrón",
        "w": "25g",
        "price": 0.5
      },
      {
        "id": "tp10",
        "name": "Med",
        "w": "20g",
        "price": 0.5
      }
    ]
  }
];

  var TOPPINGS = [
  {
    "g": "30g",
    "price": 1.0,
    "alg": "",
    "items": [
      "cibuľa",
      "feferóny"
    ]
  },
  {
    "g": "50g",
    "price": 1.2,
    "alg": "mlieko",
    "items": [
      "šunka",
      "šampiňóny",
      "saláma",
      "slanina",
      "olivy",
      "syr",
      "kukurica",
      "vajce",
      "paprika",
      "brokolica",
      "ananás",
      "paradajka"
    ]
  },
  {
    "g": "50g",
    "price": 1.5,
    "alg": "mlieko",
    "items": [
      "klobása",
      "syr niva",
      "syr parmezán"
    ]
  },
  {
    "g": "50g",
    "price": 1.9,
    "alg": "mlieko",
    "items": [
      "kuracie mäso",
      "bryndza",
      "prosciutto"
    ]
  }
];

  var GLUTEN_FREE = { name: "Bezlepkové cesto", price: 2.00 };
  var DELIVERY_FEE = 2.50;

  var api = { MENU: MENU, TOPPINGS: TOPPINGS, GLUTEN_FREE: GLUTEN_FREE, DELIVERY_FEE: DELIVERY_FEE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;   // Node (api/, agent/)
  else root.VILA27_MENU = api;                                                    // prehliadač
})(typeof window !== "undefined" ? window : this);
