// Hercontrole van de integratiefixes: de kleinere punten (gepaarde t-toets, reden bij de correlatie, taal raden bij
// RIS, verloop van een kopie zonder kenmerk, gereserveerde namen, schaalscore maken). Zuiver: geen server nodig.
// Uitvoeren: node --test test/herstel-klein.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { maakRekenkern } from '../public/js/beheer/werkbank/rekenkern.js';
import { CIJFERSCHALEN, SCHALEN } from '../src/lib/schalen.js';
import { KENMERKEN } from '../public/js/beheer/kenmerken.js';

function exportLijst(vragen, antwoorden) {
  const q = (v) => ({ vragenlijst_id: 1, thema_id: 10, meetpunt_id: null, type: 'schaal', tekst: `Vraag ${v.id}`, toelichting: '', opties: '[]', schaal_soort: 'eens',
    meerdere_antwoorden: 0, verplicht: 0, weet_niet: 0, uitsplitsen: 0, bron_vraag_id: null, volgorde: v.id, kenmerk: '', ...v });
  return {
    export: { versie: 1, datum: '2026-11-28' },
    lijsten: { schalen: SCHALEN, cijferschalen: CIJFERSCHALEN, kenmerken: KENMERKEN, vraagtypen: {} },
    onderzoek: { id: 1, titel: 'T', bedrijfsnaam: 'X', status: 'actief' },
    themas: [{ id: 10, naam: 'Werkdruk', volgorde: 1 }, { id: 12, naam: 'Achtergrond', volgorde: 2 }], meetpunten: [], meetmomenten: [{ id: 30, naam: 'Nulmeting', volgorde: 1 }],
    vragenlijsten: [{ id: 1, titel: 'Lijst', meetmoment_id: 30, status: 'gesloten' }],
    vragen: vragen.map(q),
    inzendingen: antwoorden.map((a, i) => ({ id: (i + 1) * 31, vragenlijst_id: 1, datum: '2026-10-01', antwoorden: a })),
    eigen_invoer: [], stukken: [], acties: [], rapporten: [], werkbank_definities: [], werkbank_analyses: [],
    codes: [], coderingen: [], citaten: [], bronnen_gekoppeld: [], hr_instellingen: {}, personeelscijfers: [],
  };
}
function werkbank(data, definities = []) {
  const kern = maakRekenkern();
  const defs = definities.map((d) => ({ dataset_id: null, label: d.naam, verwijderd_op: null, ...d, definitie: JSON.stringify(d.definitie) }));
  kern.laad({ data, datasets: [], definities: defs, bron: { soort: 'lijst', id: 1 } });
  return (procedure, variabelen, { filter = null, opties = {} } = {}) => kern.voerUit({ versie: 1, bron: { soort: 'lijst', id: 1 }, filter, procedure, variabelen, opties }, { streng: false, nu: '2026-11-28' });
}
const tabelVan = (u, id) => u.onderdelen.find((o) => o.soort === 'tabel' && o.id.startsWith(id));
const meldingenVan = (u) => u.onderdelen.filter((o) => o.soort === 'melding').map((o) => o.tekst);
const dicht = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

// ---------- G2: de gepaarde t-toets spreekt zichzelf niet meer tegen ----------

test('G2: gepaarde t-toets: tabel, uitleg en APA-zin hebben hetzelfde teken (eerste vraag min de tweede, zoals SPSS)', async () => {
  const x = Array.from({ length: 40 }, (_, i) => ((i * 3) % 5) + 1);
  const y = Array.from({ length: 40 }, (_, i) => Math.min(5, ((i * 7 + 2) % 5) + 1 + (i % 3 === 0 ? 1 : 0)));
  const data = exportLijst([{ id: 2, tekst: 'Betrokkenheid' }, { id: 3, tekst: 'Werkdruk en balans' }], x.map((w, i) => ({ 2: w, 3: y[i] })));
  const run = werkbank(data);
  // scipy.stats.ttest_rel(x, y): t = −1.1996492320521879, p = 0.2375130581050506; dz = −0.18968119832783928.
  const u = await run('gepaard', { x: ['v:2'], y: ['v:3'] });
  const rij = tabelVan(u, 'gepaard').rijen[0];
  dicht(rij[2].w, -0.275);
  dicht(rij[6].w, -1.1996492320521879, 1e-9);
  dicht(rij[8].w, 0.2375130581050506, 1e-9);
  dicht(rij[9].w, -0.18968119832783928, 1e-9);
  const zinnen = u.duiding.zinnen.join(' ');
  assert.match(zinnen, /gemiddeld 0,28 punt lager op “Betrokkenheid” dan op “Werkdruk en balans”/);
  assert.match(zinnen, /\(dz = −0,19\)/);
  const apa = JSON.stringify(u.apa);
  assert.match(apa, /op “Betrokkenheid” \(\*M\* = [^)]*\) niet significant anders dan op “Werkdruk en balans”/);
  assert.match(apa, /\*t\*\(39\) = −1,20/);
  assert.match(apa, /\*d\*z = −0,19/);
  assert.doesNotMatch(apa, /= 1,20|z = 0,19/);
  // Andersom (scipy.stats.ttest_rel(y, x)): alles positief, en "hoger".
  const om = await run('gepaard', { x: ['v:3'], y: ['v:2'] });
  dicht(tabelVan(om, 'gepaard').rijen[0][6].w, 1.1996492320521879, 1e-9);
  assert.match(om.duiding.zinnen.join(' '), /gemiddeld 0,28 punt hoger op “Werkdruk en balans” dan op “Betrokkenheid”/);
  assert.match(JSON.stringify(om.apa), /\*t\*\(39\) = 1,20; .*\*d\*z = 0,19/);
});

// ---------- Correlatie: de echte reden bij 1 tot 4 keer "liever niet" ----------

import { P_INDELING_ALS_GETAL } from '../public/js/beheer/werkbank/uitvoer-tekst.js';

test('correlatie met leeftijd bij 3 keer "liever niet": de privacyreden, niet "geen enkel paar"', async () => {
  const leeftijd = { id: 4, type: 'meerkeuze', thema_id: 12, tekst: 'Wat is je leeftijd?', kenmerk: 'leeftijd',
    opties: JSON.stringify([{ id: 'l1', label: 'Jonger dan 35 jaar' }, { id: 'l2', label: '35 tot 55 jaar' }, { id: 'l3', label: '55 jaar of ouder' }, { id: 'l4', label: 'Dat zeg ik liever niet' }]) };
  const a = Array.from({ length: 150 }, (_, i) => ({ 4: i < 3 ? 'l4' : `l${1 + (i % 3)}`, 2: 1 + (i % 5) }));
  const run = werkbank(exportLijst([leeftijd, { id: 2, tekst: 'Betrokkenheid' }], a));
  const u = await run('correlatie', { variabelen: ['v:4', 'v:2'] });
  assert.equal(u.geweigerd, true);
  // Vroeger: "Geen enkel paar heeft genoeg respondenten (minstens 10)", terwijl er 147 paren zijn.
  assert.equal(meldingenVan(u)[0], P_INDELING_ALS_GETAL('Wat is je leeftijd?'));
  // Te weinig paren blijft de oude tekst houden.
  const weinig = werkbank(exportLijst([{ id: 2, tekst: 'A' }, { id: 3, tekst: 'B' }], Array.from({ length: 8 }, (_, i) => ({ 2: 1 + (i % 5), 3: 1 + ((i * 2) % 5) }))));
  assert.match(meldingenVan(await weinig('correlatie', { variabelen: ['v:2', 'v:3'] }))[0], /Geen enkel paar heeft genoeg respondenten/);
});

// ---------- G6: RIS zonder LA ----------

import { leesRis, raadTaalRis, taalOnbekendTekst } from '../public/js/beheer/bibliotheek-bestanden.js';
import { readFileSync } from 'node:fs';

test('G6: een Engelse HR-bron zonder signaalwoord wordt niet stil Nederlands; zonder aanknopingspunt noemen we hem', () => {
  const titels = [
    ['en', 'Job demands-resources theory: Taking stock and looking forward Journal of Occupational Health Psychology'],
    ['en', 'Burnout and work engagement: The JD-R approach Annual Review of Organizational Psychology and Organizational Behavior'],
    ['en', 'Psychological safety and learning behavior in work teams Administrative Science Quarterly'],
    ['en', 'Employee turnover: A meta-analytic review Personnel Psychology'],
    ['en', 'Transformational leadership Journal of Applied Psychology'],
    ['en', 'Perceived organizational support Journal of Applied Psychology'],
    ['en', 'Work engagement Journal of Organizational Behavior'],
    ['en', 'Organizational commitment Human Resource Management Review'],
    ['nl', 'Werkdruk in de zorg Tijdschrift voor HRM'],
    ['nl', 'Duurzame inzetbaarheid Gedrag & Organisatie'],
    ['nl', 'Verzuim Tijdschrift voor Bedrijfs- en Verzekeringsgeneeskunde'],
    ['nl', 'Medewerkerstevredenheid onderzoek Tijdschrift voor HRM'],
  ];
  for (const [taal, tekst] of titels) assert.equal(raadTaalRis(tekst), taal, tekst);
  assert.equal(raadTaalRis('Xyz 2020'), null, 'geen aanknopingspunt');
  // Het bestand van de reviewer (zoals Google Scholar, zonder LA).
  const ris = `TY  - JOUR\nAU  - Meyer, John P.\nTI  - Organizational commitment\nT2  - Human Resource Management Review\nPY  - 1991\nER  - \n\nTY  - JOUR\nAU  - Vries, Jan de\nTI  - Duurzame inzetbaarheid van oudere medewerkers\nT2  - Tijdschrift voor HRM\nPY  - 2021\nER  - \n\nTY  - JOUR\nAU  - Kahn, W. A.\nTI  - Xyz\nPY  - 1990\nER  - \n`;
  const { bronnen, taalGeraden, taalOnbekend } = leesRis(ris);
  assert.deepEqual(bronnen.map((b) => b.taal), ['en', 'nl', 'nl']);
  assert.equal(taalGeraden, 3);
  assert.deepEqual(taalOnbekend, ['Xyz']);
  assert.equal(taalOnbekendTekst(['Xyz']), 'Bij 1 bron konden we de taal niet raden: “Xyz”. Die staat nu op Nederlands. Kies zelf de juiste taal bij de bron.');
  const scherm = readFileSync(new URL('../public/js/beheer/schermen/bibliotheek.js', import.meta.url), 'utf8');
  assert.match(scherm, /taalOnbekend\.length \? melding\(taalOnbekendTekst\(taalOnbekend\), 'waarschuwing'\)/, 'de importdialoog noemt ze');
});

// ---------- P4-fix: het verloop van een kopie zonder kenmerk ----------

import { dashboardUitRijen } from '../public/js/beheer/dashboard-rekenen.js';
import { kijkerDashboard } from '../src/routes/delen.js';

/** Lijst A (Nulmeting) met de ja/nee-vraag als kenmerk; kopie B (Vervolg) zonder kenmerk; eventueel kopie C op Nulmeting. */
function rijenVerloop([jaA, neeA, leegA], [jaB, neeB, leegB], kopieC = null) {
  const q = (id, lijst, bron, extra) => ({
    id, vragenlijst_id: lijst, thema_id: 9, meetpunt_id: null, type: 'janee', tekst: 'Geef je leiding aan anderen?', toelichting: '', opties: '[]',
    schaal_soort: 'eens', meerdere_antwoorden: 0, verplicht: 0, weet_niet: 0, uitsplitsen: 0, bron_vraag_id: bron, volgorde: 1, kenmerk: '', ...extra,
  });
  const inz = [];
  const voeg = (lijst, vraag, ja, nee, leeg) => {
    for (let k = 0; k < ja; k++) inz.push({ vragenlijst_id: lijst, datum: '2026-01-01', a: { [vraag]: 'ja' } });
    for (let k = 0; k < nee; k++) inz.push({ vragenlijst_id: lijst, datum: '2026-01-01', a: { [vraag]: 'nee' } });
    for (let k = 0; k < leeg; k++) inz.push({ vragenlijst_id: lijst, datum: '2026-01-01', a: {} });
  };
  voeg(1, 11, jaA, neeA, leegA);
  voeg(2, 21, jaB, neeB, leegB);
  const lijsten = [
    { id: 1, titel: 'Nulmeting', status: 'gesloten', code: 'a', meetmoment_id: 1, aantal_uitgenodigd: null },
    { id: 2, titel: 'Vervolg', status: 'gesloten', code: 'b', meetmoment_id: 2, aantal_uitgenodigd: null },
  ];
  const vragen = [q(11, 1, null, { kenmerk: 'leidinggevend' }), q(21, 2, 11)];
  if (kopieC) {
    lijsten.push({ id: 3, titel: 'Nulmeting kopie', status: 'gesloten', code: 'c', meetmoment_id: 1, aantal_uitgenodigd: null });
    vragen.push(q(31, 3, 11));
    voeg(3, 31, ...kopieC);
  }
  return {
    onderzoek: { id: 1, bedrijfsnaam: 'X', titel: 'Y', status: 'actief' }, schalen: {}, themas: [{ id: 9, naam: 'Achtergrond' }], meetpunten: [],
    meetmomenten: [{ id: 1, naam: 'Nulmeting', datum: '2025-01-01' }, { id: 2, naam: 'Vervolg', datum: '2026-01-01' }],
    vragenlijsten: lijsten, vragen, inzendingen: inz, eigen_invoer: [],
  };
}
const MAG = { dashboard: true, open_antwoorden: false, tussenstand: false, stukken: [], rapporten: [] };
const verloopVan = (rijen, lijst, kijker = true) => {
  const d = dashboardUitRijen(rijen, { vragenlijst: lijst, uitsplitsen: null });
  return (kijker ? kijkerDashboard(structuredClone(d), MAG) : d).selectie.vragen[0].verloop;
};

test('P4-fix (V3): het punt van een kopie zonder kenmerk blijft zichtbaar; het verborgen punt van lijst A niet', () => {
  // V3: A veilig (ja 6, nee 15), kopie B zonder kenmerk (ja 3, nee 17, leeg 2). B toont zelf Ja 3, Nee 17.
  const v3 = rijenVerloop([6, 15, 0], [3, 17, 2]);
  for (const kijker of [true, false]) {
    const vervolg = verloopVan(v3, 2, kijker).find((p) => p.meetmoment_id === 2);
    assert.equal(vervolg.n, 20, 'vroeger null');
    assert.equal(vervolg.percentage_ja, 15);
    assert.equal(verloopVan(v3, 2, kijker).find((p) => p.meetmoment_id === 1).n, 21);
  }
  // s1 blijft dicht: A met ja 3, nee 18, leeg 2 is verborgen, vanuit A en vanuit B.
  const s1 = rijenVerloop([3, 18, 2], [10, 12, 0]);
  for (const lijst of [1, 2]) assert.equal(verloopVan(s1, lijst).find((p) => p.meetmoment_id === 1).percentage_ja, null);
  // V2: een kopie C zonder kenmerk op hetzelfde meetmoment als A: het samengestelde punt blijft verborgen.
  const v2 = rijenVerloop([3, 18, 2], [10, 12, 0], [8, 9, 0]);
  for (const lijst of [1, 2, 3]) assert.equal(verloopVan(v2, lijst).find((p) => p.meetmoment_id === 1).percentage_ja, null, `vanuit ${lijst}`);
});

// ---------- R10: Antwoorden wissen noemt de codes en citaten die meegaan ----------

import { codeerwerkTekst, codeerwerkGewist } from '../public/js/beheer/schermen/vragenlijst-bewerken.js';

test('R10: de bevestiging en de melding noemen de gegeven codes en citaten; zonder codeerwerk niets extra', () => {
  assert.equal(codeerwerkTekst({ coderingen: 4, citaten: 2 }), 'Ook de 4 codes die je aan deze antwoorden gaf en de 2 citaten eruit worden gewist. Het codeboek zelf blijft staan.');
  assert.equal(codeerwerkTekst({ coderingen: 1, citaten: 0 }), 'Ook de code die je aan deze antwoorden gaf wordt gewist. Het codeboek zelf blijft staan.');
  assert.equal(codeerwerkTekst({ coderingen: 0, citaten: 1 }), 'Ook het citaat eruit wordt gewist. Het codeboek zelf blijft staan.');
  assert.equal(codeerwerkTekst({ coderingen: 0, citaten: 0 }), null);
  assert.equal(codeerwerkGewist({ coderingen: 4, citaten: 2 }), 'Ook 4 gegeven codes en 2 citaten zijn gewist.');
  const scherm = readFileSync(new URL('../public/js/beheer/schermen/vragenlijst-bewerken.js', import.meta.url), 'utf8');
  assert.match(scherm, /codeerwerkTekst\(telling\)/, 'de bevestiging gebruikt de verse telling');
  const handleiding = readFileSync(new URL('../docs/handleiding.md', import.meta.url), 'utf8');
  assert.match(handleiding, /\*\*Antwoorden wissen\*\*[^\n]*codes die je aan die antwoorden gaf en de citaten eruit worden dan gewist; het codeboek zelf blijft staan/);
});

// ---------- R11: "Schaalscore maken" maakt geen tweede, gelijke score ----------

import { zelfdeScore } from '../public/js/beheer/werkbank/definities.js';

test('R11: zelfdeScore vindt een eigen score met dezelfde vragen, omscoring en minimum; het scherm verwijst ernaar', () => {
  const defs = [
    { id: 1, soort: 'bereken', naam: 'samenwerking_en_sfeer_mi', dataset_id: null, verwijderd: false, definitie: { functie: 'gemiddelde', variabelen: ['v:3', 'v:2'], min_geldig: 1 } },
    { id: 2, soort: 'bereken', naam: 'weg', dataset_id: null, verwijderd: true, definitie: { functie: 'gemiddelde', variabelen: ['v:7'], min_geldig: 1 } },
    { id: 3, soort: 'bereken', naam: 'om', dataset_id: null, verwijderd: false, definitie: { functie: 'gemiddelde', variabelen: [{ id: 'v:4', omscoren: true }, 'v:5'], min_geldig: 1 } },
    { id: 4, soort: 'bereken', naam: 'ander_bron', dataset_id: 9, verwijderd: false, definitie: { functie: 'gemiddelde', variabelen: ['v:8'], min_geldig: 1 } },
  ];
  // Dezelfde vragen in een andere volgorde, met { id, omscoren: false }: dezelfde score.
  assert.equal(zelfdeScore(defs, { functie: 'gemiddelde', variabelen: ['v:2', { id: 'v:3', omscoren: false }], min_geldig: 1 })?.naam, 'samenwerking_en_sfeer_mi');
  assert.equal(zelfdeScore(defs, { functie: 'gemiddelde', variabelen: ['v:2', 'v:3'], min_geldig: 2 }), null, 'ander minimum');
  assert.equal(zelfdeScore(defs, { functie: 'som', variabelen: ['v:2', 'v:3'], min_geldig: 1 }), null, 'andere functie');
  assert.equal(zelfdeScore(defs, { functie: 'gemiddelde', variabelen: ['v:2', 'v:3', 'v:9'], min_geldig: 1 }), null, 'andere vragen');
  assert.equal(zelfdeScore(defs, { functie: 'gemiddelde', variabelen: ['v:7'], min_geldig: 1 }), null, 'verwijderd telt niet');
  assert.equal(zelfdeScore(defs, { functie: 'gemiddelde', variabelen: ['v:4', 'v:5'], min_geldig: 1 }), null, 'zonder omscoren is het een andere score');
  assert.equal(zelfdeScore(defs, { functie: 'gemiddelde', variabelen: ['v:5', { id: 'v:4', omscoren: true }], min_geldig: 1 })?.naam, 'om');
  assert.equal(zelfdeScore(defs, { functie: 'gemiddelde', variabelen: ['v:8'], min_geldig: 1 }), null, 'andere gegevensbron');
  assert.equal(zelfdeScore(defs, { functie: 'gemiddelde', variabelen: ['v:8'], min_geldig: 1 }, { datasetId: 9 })?.naam, 'ander_bron');
  assert.equal(zelfdeScore(defs, { functie: 'gemiddelde', variabelen: ['v:2', 'v:3'], min_geldig: 1 }, { zonderId: 1 }), null, 'de score die je aanpast');
  const scherm = readFileSync(new URL('../public/js/beheer/schermen/werkbank-variabelen.js', import.meta.url), 'utf8');
  assert.match(scherm, /Er is al een schaalscore van deze vragen: \$\{naam\}/);
  assert.match(scherm, /Toon \$\{al\.naam\}/, 'de rij verwijst naar de bestaande score');
  assert.match(scherm, /const dubbel = zelfdeScore\(wb\.definities, def/, 'het venster maakt geen dubbele');
});
