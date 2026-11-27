// Tests voor public/js/beheer/privacy.js: de enige plek met de regels voor het verbergen van kleine aantallen.
// Uitvoeren: node --test test/privacy.test.mjs   (geen server nodig)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DREMPEL, LABEL_OVERIG, verbergReeks, onderdrukKolom, onderdrukAlles, verdeelInGroepen, maskeerKruistabel, maskeer,
  maskeerVerdeling, veiligAandeel, weggevallenVeilig, verzuimToonbaar,
} from '../public/js/beheer/privacy.js';
import { aanpassingsToets } from '../public/js/beheer/statistiek.js';

/** Vaste reeks "willekeurige" getallen (lineaire congruentiegenerator), zodat elke run hetzelfde test. */
function lcg(zaad) {
  let s = zaad >>> 0;
  const volgende = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  return { getal: volgende, geheel: (max) => Math.floor(volgende() * (max + 1)) };
}

const som = (a) => a.reduce((t, x) => t + x, 0);
const groepenVan = (aantallen, ni = 0) => [
  ...aantallen.map((n, i) => ({ sleutel: `o${i + 1}`, label: `Optie ${i + 1}`, n })),
  ...(ni > 0 ? [{ sleutel: null, label: 'Niet ingevuld', n: ni }] : []),
];
const nietGetoond = (r, groepen) => groepen.filter((g) => !r.zichtbaar.some((z) => z.sleutel === g.sleutel)).map((g) => g.sleutel);

/** Een aantal dat vaak klein is (0–4), soms middelgroot en soms groot. */
function aantal(r) {
  const k = r.getal();
  if (k < 0.45) return r.geheel(4);
  if (k < 0.8) return 5 + r.geheel(6);
  return 11 + r.geheel(25);
}

// ---------- verbergReeks en onderdrukKolom ----------

test('verbergReeks: kleine aantallen, nullen erbij en zo nodig de kleinste zichtbare', () => {
  assert.deepEqual(verbergReeks([12, 3, 0, 7]), [false, true, true, true]);
  assert.deepEqual(verbergReeks([20, 6, 8]), [false, false, false]);
  // Alleen nullen: niets te beschermen, dus niets verborgen.
  assert.deepEqual(verbergReeks([10, 0, 7]), [false, false, false]);
  // Samen al minstens 5: geen grote erbij.
  assert.deepEqual(verbergReeks([12, 3, 2, 7]), [false, true, true, false]);
  // Alles klein: alles verborgen.
  assert.deepEqual(verbergReeks([1, 2, 1]), [true, true, true]);
  // Gelijke aantallen: de eerste gaat eerst.
  assert.deepEqual(verbergReeks([6, 1, 6]), [true, true, false]);
  // Andere drempel
  assert.deepEqual(verbergReeks([12, 6, 0, 9], 7), [false, true, true, true]);
});

test('onderdrukKolom: verborgen cellen tellen samen minstens 5, nullen gaan mee, gelijk aan verbergReeks', () => {
  const r = lcg(11);
  for (let t = 0; t < 500; t++) {
    const aantallen = Array.from({ length: 2 + r.geheel(6) }, () => aantal(r));
    const cellen = aantallen.map((n) => ({ n }));
    onderdrukKolom(cellen);
    const verborgen = cellen.map((c) => !!c.verborgen);
    assert.deepEqual(verborgen, verbergReeks(aantallen), JSON.stringify(aantallen));
    if (verborgen.some(Boolean)) {
      const samen = som(aantallen.filter((_, i) => verborgen[i]));
      assert.ok(samen >= DREMPEL || verborgen.every(Boolean), `te klein verborgen totaal: ${JSON.stringify(aantallen)}`);
      aantallen.forEach((n, i) => {
        if (n === 0) assert.equal(verborgen[i], true, `een 0 moet mee als er iets verborgen is: ${JSON.stringify(aantallen)}`);
      });
    }
    aantallen.forEach((n, i) => {
      if (n > 0 && n < DREMPEL) assert.equal(verborgen[i], true);
    });
  }
});

test('onderdrukAlles: een verborgen vraag verbergt ook het thema in die groep, en andersom', () => {
  const vragen = [{ thema_id: 1 }, { thema_id: 1 }];
  const groep = (q1, q2, t) => ({ vragen: [{ n: q1 }, { n: q2 }], themas: [{ n: t }] });
  const groepen = [groep(20, 20, 20), groep(10, 3, 10), groep(6, 6, 6)];
  onderdrukAlles(groepen, [1], vragen);
  assert.equal(groepen[1].vragen[1].verborgen, true);
  assert.equal(groepen[1].themas[0].verborgen, true, 'thema met een verborgen vraag');
  for (const k of [0, 1]) {
    const verborgen = groepen.filter((g) => g.vragen[k].verborgen);
    if (verborgen.length) assert.ok(verborgen.length >= 2 && som(verborgen.map((g) => g.vragen[k].n)) >= DREMPEL);
  }
  assert.equal(groepen[1].vragen[0].verborgen, true, 'het thema is verborgen, dus ook de andere vraag van dat thema');
});

// ---------- verdeelInGroepen (D1 §11.1) ----------

test('verdeelInGroepen: [12, 3, 1, 8] → 12 zichtbaar, de rest samen (12) met alle drie de namen', () => {
  const r = verdeelInGroepen(groepenVan([12, 3, 1, 8]));
  assert.deepEqual(r.zichtbaar, [{ sleutel: 'o1', label: 'Optie 1', n: 12 }]);
  assert.deepEqual(r.samengevoegd, { label: LABEL_OVERIG, n: 12, labels: ['Optie 2', 'Optie 3', 'Optie 4'], sleutels: ['o2', 'o3', 'o4'] });
  assert.equal(r.verborgen, null);
});

test('verdeelInGroepen: [6, 7, 1] → A en C samen, B zichtbaar (zoals de bestaande API-test)', () => {
  const r = verdeelInGroepen([{ sleutel: 'a', label: 'Afdeling A', n: 6 }, { sleutel: 'b', label: 'Afdeling B', n: 7 }, { sleutel: 'c', label: 'Afdeling C', n: 1 }]);
  assert.deepEqual(r.zichtbaar.map((g) => [g.label, g.n]), [['Afdeling B', 7]]);
  assert.deepEqual(r.samengevoegd.labels, ['Afdeling A', 'Afdeling C']);
  assert.equal(r.samengevoegd.n, 7);
  // [6, 2, 1]: na het samenvoegen blijft er geen groep over: alles verborgen, zonder aantal.
  const alles = verdeelInGroepen(groepenVan([6, 2, 1]));
  assert.deepEqual(alles.zichtbaar, []);
  assert.equal(alles.samengevoegd, null);
  assert.deepEqual(alles.verborgen.labels, ['Optie 1', 'Optie 2', 'Optie 3']);
});

test('verdeelInGroepen: alles onder de 5 → één verborgen groep zonder aantal', () => {
  const r = verdeelInGroepen(groepenVan([2, 1, 3], 1));
  assert.deepEqual(r.zichtbaar, []);
  assert.equal(r.samengevoegd, null);
  assert.deepEqual(r.verborgen, { labels: ['Optie 1', 'Optie 2', 'Optie 3', 'Niet ingevuld'], sleutels: ['o1', 'o2', 'o3', null] });
  assert.doesNotMatch(JSON.stringify(r), /"n":[1-4][,}]/);
});

test('verdeelInGroepen: een optie zonder respondenten staat in de lijst als er iets verborgen is', () => {
  const r = verdeelInGroepen(groepenVan([10, 0, 3, 9]));
  assert.deepEqual(r.zichtbaar.map((g) => g.label), ['Optie 1']);
  assert.deepEqual(r.samengevoegd.labels, ['Optie 2', 'Optie 3', 'Optie 4'], 'ook de optie met 0, anders verraadt de lijst waar de 3 zitten');
  // Niets verborgen: een optie zonder respondenten wordt dan gewoon niet getoond, en er is geen samengevoegde groep.
  const niets = verdeelInGroepen(groepenVan([10, 0, 9]));
  assert.deepEqual(niets.zichtbaar.map((g) => g.label), ['Optie 1', 'Optie 3']);
  assert.equal(niets.samengevoegd, null);
  assert.equal(niets.verborgen, null);
  // "Niet ingevuld" is een gewone groep
  const ni = verdeelInGroepen(groepenVan([10, 9], 2));
  assert.deepEqual(ni.zichtbaar.map((g) => g.label), ['Optie 1']);
  assert.deepEqual(ni.samengevoegd.labels, ['Optie 2', 'Niet ingevuld']);
});

test('verdeelInGroepen weglaten: kleine groepen genoemd, zonder getallen; respondenten zonder groep tellen mee', () => {
  const r = verdeelInGroepen(groepenVan([12, 3, 0, 8]), { strategie: 'weglaten' });
  assert.deepEqual(r.zichtbaar.map((g) => g.label), ['Optie 1']);
  assert.deepEqual(r.weggelaten, [
    { sleutel: 'o2', label: 'Optie 2', reden: 'klein' },
    { sleutel: 'o3', label: 'Optie 3', reden: 'klein' },
    { sleutel: 'o4', label: 'Optie 4', reden: 'terugrekenen' },
  ]);
  // 3 respondenten zonder groep + 3 in een kleine groep = 6: genoeg, dus de grote groepen doen mee.
  const extra = verdeelInGroepen(groepenVan([12, 3, 8]), { strategie: 'weglaten', extraVerborgen: 3 });
  assert.deepEqual(extra.zichtbaar.map((g) => g.label), ['Optie 1', 'Optie 3']);
  // 2 zonder groep en verder niets klein: de kleinste doet ook niet mee.
  const alleenExtra = verdeelInGroepen(groepenVan([12, 8]), { strategie: 'weglaten', extraVerborgen: 2 });
  assert.deepEqual(alleenExtra.zichtbaar.map((g) => g.label), ['Optie 1']);
  assert.equal(alleenExtra.weggelaten[0].reden, 'terugrekenen');
});

test('B1: samenvoegen en weglaten verbergen op dezelfde groepen precies dezelfde groepen', () => {
  const r = lcg(2026);
  let getest = 0;
  for (let t = 0; t < 1000; t++) {
    const groepen = groepenVan(Array.from({ length: 2 + r.geheel(6) }, () => aantal(r)), r.getal() < 0.5 ? aantal(r) : 0);
    const a = verdeelInGroepen(groepen);
    const b = verdeelInGroepen(groepen, { strategie: 'weglaten' });
    assert.deepEqual(nietGetoond(a, groepen), nietGetoond(b, groepen), JSON.stringify(groepen.map((g) => g.n)));
    // Respondenten zonder groep als extraVerborgen (Analyse) geven hetzelfde als een kleine groep "Niet ingevuld".
    const ni = groepen.find((g) => g.sleutel === null);
    if (ni && ni.n < DREMPEL) {
      const c = verdeelInGroepen(groepen.filter((g) => g !== ni), { strategie: 'weglaten', extraVerborgen: ni.n });
      assert.deepEqual(c.zichtbaar, b.zichtbaar);
    }
    if (nietGetoond(a, groepen).length) getest++;
  }
  assert.ok(getest > 300);
});

// ---------- maskeerVerdeling ----------

test('maskeerVerdeling: "Anders: 1" verborgen, Niet ingevuld telt mee, percentages van de hele lijst', () => {
  const opties = [
    { waarde: 'm', label: 'Man', aantal: 9 },
    { waarde: 'v', label: 'Vrouw', aantal: 11 },
    { waarde: 'a', label: 'Anders', aantal: 1 },
  ];
  const r = maskeerVerdeling(opties, 23);
  assert.deepEqual(r.verdeling.map((v) => [v.label, v.aantal, v.verborgen]), [['Man', null, true], ['Vrouw', 11, false], ['Anders', null, true], ['Niet ingevuld', null, true]]);
  assert.equal(r.n_beantwoord, null, 'anders volgt Niet ingevuld uit 23 − n');
  assert.equal(r.iets_verborgen, true);
  assert.ok(Math.abs(r.verdeling[1].percentage - (11 / 23) * 100) < 1e-12);
  assert.equal(r.verdeling[0].percentage, null);
  // Niet ingevuld = 2 en verder alles groot: toch n_beantwoord null
  const ni = maskeerVerdeling([{ waarde: 'x', label: 'X', aantal: 10 }, { waarde: 'y', label: 'Y', aantal: 8 }], 20);
  assert.equal(ni.n_beantwoord, null);
  assert.deepEqual(ni.verdeling.map((v) => v.verborgen), [false, true, true]);
  // Niets klein: alles zichtbaar, n_beantwoord = som van de opties
  const goed = maskeerVerdeling([{ waarde: 'x', label: 'X', aantal: 10 }, { waarde: 'y', label: 'Y', aantal: 0 }, { waarde: 'z', label: 'Z', aantal: 7 }], 22);
  assert.equal(goed.n_beantwoord, 17);
  assert.equal(goed.iets_verborgen, false);
  assert.deepEqual(goed.verdeling.map((v) => v.aantal), [10, 0, 7, 5]);
  assert.equal(goed.verdeling[3].waarde, 'niet_ingevuld');
  assert.doesNotMatch(JSON.stringify(r), /"aantal":[1-4][,}]/);
});

// ---------- Kruistabellen ----------

test('maskeer met één tabel is gelijk aan maskeerKruistabel; verschiltabellen volgen regel D', () => {
  const r = lcg(77);
  for (let t = 0; t < 300; t++) {
    const tabel = Array.from({ length: 2 + r.geheel(3) }, () => Array.from({ length: 2 + r.geheel(3) }, () => aantal(r)));
    assert.deepEqual(maskeer([tabel]), maskeerKruistabel(tabel));
  }
  // Hoofdtabel zonder kleine cellen, maar de buurselectie verschilt in één cel met 2: die cel en de kleinste
  // andere in dezelfde rij en kolom gaan dicht.
  const hoofd = [[10, 12], [9, 15]];
  const verschil = [[2, 0], [0, 0]];
  const m = maskeer([hoofd, verschil], DREMPEL, [[true, false], [false, false]]);
  assert.equal(m[0][0], true);
  for (const lijn of [[m[0][0], m[0][1]], [m[0][0], m[1][0]]]) assert.ok(lijn.filter(Boolean).length >= 2);
  // vooraf verborgen telt mee
  assert.deepEqual(maskeer([[[10, 10], [10, 10]]], DREMPEL, [[true, false], [false, false]]), [[true, true], [true, true]]);
});

// ---------- Invariantie (D1 §11.1, PR-08) ----------

/**
 * Alles wat een kijker over één indeling te zien krijgt: de groepen (beide strategieën), de verdeling en de
 * representativiteitstoets op de gemaskeerde categorieën. Bevat dit iets dat afhangt van hoe de verborgen
 * aantallen precies verdeeld zijn, dan is er een lek.
 */
function uitvoer(aantallen, ni, populatie) {
  const groepen = groepenVan(aantallen, ni);
  const samen = verdeelInGroepen(groepen);
  const weg = verdeelInGroepen(groepen, { strategie: 'weglaten' });
  const lijstN = som(aantallen) + ni;
  const verdeling = maskeerVerdeling(aantallen.map((a, i) => ({ waarde: `o${i + 1}`, label: `Optie ${i + 1}`, aantal: a })), lijstN);
  const pop = (sleutel) => (sleutel === null ? 3 : populatie[Number(sleutel.slice(1)) - 1]);
  let toets = null;
  if (!samen.verborgen) {
    const cat = samen.zichtbaar.map((g) => [g.n, pop(g.sleutel)]);
    if (samen.samengevoegd) cat.push([samen.samengevoegd.n, som(samen.samengevoegd.sleutels.map(pop))]);
    toets = aanpassingsToets(cat.map((c) => c[0]), cat.map((c) => c[1]));
  }
  return JSON.stringify({
    samen,
    weg: { zichtbaar: weg.zichtbaar, nietGetoond: weg.weggelaten.map((g) => g.label).sort() },
    verdeling,
    toets,
  });
}

test('invariantie: aantallen herverdelen binnen de verborgen cellen verandert niets aan de uitvoer (500 tabellen)', () => {
  const r = lcg(500);
  let vergeleken = 0;
  let tabellenMetVerborgen = 0;
  for (let t = 0; t < 500; t++) {
    const k = 2 + r.geheel(6);
    const aantallen = Array.from({ length: k }, () => aantal(r));
    const ni = r.getal() < 0.4 ? aantal(r) : 0;
    const populatie = aantallen.map(() => 5 + r.geheel(60));
    const cellen = [...aantallen, ni];
    const verborgen = verbergReeks(cellen);
    // "Niet ingevuld" bestaat als groep alleen als iemand de vraag oversloeg (BOUWPLAN §3.1); is het 0, dan blijft het 0.
    const pos = cellen.map((_, i) => i).filter((i) => verborgen[i] && (i < k || ni > 0));
    if (pos.length < 2) continue;
    tabellenMetVerborgen++;
    const basis = uitvoer(aantallen, ni, populatie);
    const totaal = som(pos.map((i) => cellen[i]));
    for (let poging = 0; poging < 6; poging++) {
      const nieuw = [...cellen];
      if (poging < 3) {
        // De verborgen aantallen onderling verwisselen.
        const waarden = pos.map((i) => cellen[i]);
        for (let i = waarden.length - 1; i > 0; i--) {
          const j = r.geheel(i);
          [waarden[i], waarden[j]] = [waarden[j], waarden[i]];
        }
        pos.forEach((p, i) => { nieuw[p] = waarden[i]; });
      } else {
        // Het verborgen totaal willekeurig opnieuw verdelen.
        let rest = totaal;
        pos.forEach((p, i) => {
          const deel = i === pos.length - 1 ? rest : r.geheel(rest);
          nieuw[p] = deel;
          rest -= deel;
        });
      }
      const nieuwVerborgen = verbergReeks(nieuw);
      // Alleen vergelijkbaar als dezelfde cellen verborgen zijn; anders ziet de lezer sowieso een ander patroon.
      if (nieuwVerborgen.some((v, i) => v !== verborgen[i])) continue;
      // Of iemand de vraag oversloeg (de groep "Niet ingevuld" bestaat), blijft ook gelijk.
      if ((nieuw[k] > 0) !== (ni > 0)) continue;
      vergeleken++;
      assert.equal(uitvoer(nieuw.slice(0, k), nieuw[k], populatie), basis, `lek bij ${JSON.stringify(cellen)} → ${JSON.stringify(nieuw)}`);
    }
  }
  assert.ok(tabellenMetVerborgen > 200, `te weinig tabellen met verborgen cellen: ${tabellenMetVerborgen}`);
  assert.ok(vergeleken > 600, `te weinig vergelijkingen: ${vergeleken}`);
});

// ---------- Losse controles ----------

test('veiligAandeel en weggevallenVeilig', () => {
  assert.equal(veiligAandeel(5, 10), true);
  assert.equal(veiligAandeel(4, 20), false);
  assert.equal(veiligAandeel(16, 20), false, '4 in de andere groep');
  assert.equal(veiligAandeel(0, 20), false, '0 telt als klein');
  assert.equal(weggevallenVeilig(0), true);
  assert.equal(weggevallenVeilig(3), false);
  assert.equal(weggevallenVeilig(5), true);
});

test('verzuimToonbaar: minstens 10 medewerkers en niemand met meer dan de helft van de dagen', () => {
  assert.deepEqual(verzuimToonbaar({ n: 9, dagenPerPersoon: [1, 2, 3] }), { toonbaar: false, reden: 'klein' });
  const dagen = [60, 10, 10, 5, 5, 5, 5, 0, 0, 0];
  assert.deepEqual(verzuimToonbaar({ n: 10, dagenPerPersoon: dagen }), { toonbaar: false, reden: 'dominant' }, '60 van 100 dagen = 60%');
  assert.deepEqual(verzuimToonbaar({ n: 10, dagenPerPersoon: [50, 10, 10, 10, 10, 10, 0, 0, 0, 0] }), { toonbaar: true, reden: null }, 'precies de helft mag');
  assert.deepEqual(verzuimToonbaar({ n: 12, dagenPerPersoon: [] }), { toonbaar: true, reden: null }, 'geen verzuim');
  // minN kan nooit onder de drempel
  assert.deepEqual(verzuimToonbaar({ n: 4, dagenPerPersoon: [1, 1, 1, 1] }, { minN: 2 }), { toonbaar: false, reden: 'klein' });
  assert.deepEqual(verzuimToonbaar({ n: 6, dagenPerPersoon: [1, 1, 1, 1, 1, 1] }, { minN: 2 }), { toonbaar: true, reden: null });
});
