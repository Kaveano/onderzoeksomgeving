// Tests voor pakket P2 (BOUWPLAN §4 P2): de cijfervraag (0–10 en 1–10) en het achtergrondkenmerk, zonder server.
// - kenmerken.js: kenmerkVoorTekst (alle teksten uit de sjablonen), klasseVan (alle opties uit de bibliotheek en de
//   patronen van D1 §3.1), isLieverNiet;
// - criterium 1: een cijfer telt nergens mee in een themagemiddelde (dashboard, rapport, SPSS themaNN, Excel,
//   Analyse);
// - dashboard: eNPS en rapportcijfer (referentiewaarden D1 §11.2), verloop, uitsplitsing per kolom onderdrukt,
//   meelezer;
// - criterium 6: de standaardsjablonen, samenvoegen en de synchronisatie van migratie 0017 (D1 §11.5);
// - criterium 7: SPSS-namen (afdeling, v07_enps), het Codeboek met de kolom Kenmerk;
// - inlezen (cijfer en kenmerk), de controle van een vraag en van een antwoord op de server, het rapport;
// - Alle resultaten rekent in de browser boven 60.000 antwoordcellen (beslissing van de orkestrator).
// Uitvoeren: node --test test/vraagmodel.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  KENMERKEN, KENMERKVRAGEN, KLASSEGRENZEN, LIEVER_NIET, kenmerkVoorTekst, klasseVan, isLieverNiet, magKenmerk,
} from '../public/js/beheer/kenmerken.js';
import { SCHALEN, CIJFERSCHALEN, VRAAGTYPEN, INVOERSOORTEN, ACTIESTATUSSEN } from '../src/lib/schalen.js';
import { dashboardUitRijen, rijenUitExport, rekenInBrowser, LOKAAL_BOVEN_CELLEN } from '../public/js/beheer/dashboard-rekenen.js';
import { kijkerDashboard, KIJK_MAX_CELLEN } from '../src/routes/delen.js';
import { verzamelFeiten, rapportNaarBlokken, standaardInhoud } from '../public/js/beheer/rapport-feiten.js';
import { excelBladen, spssGegevens, spssVariabeleNamen } from '../public/js/beheer/export-bestanden.js';
import { alleAntwoordenCsv } from '../public/js/beheer/export.js';
import { bouwModel, vragenVan, waardenVan, cijferWaarde, groepeerVragen } from '../public/js/beheer/analyse-model.js';
import { leesAntwoord, verwerkVragen, verwerkAntwoorden } from '../public/js/beheer/inlees-regels.js';
import { INGEBOUWD, controleerSjabloonInhoud, sjabloonUit } from '../src/lib/sjablonen-beheer.js';
import { voegSjablonenSamen } from '../src/lib/sjabloon-toepassen.js';
import { vraagVeldenUit, controleerKenmerk } from '../src/routes/vragenlijsten.js';
import { controleerAntwoord } from '../src/routes/publiek.js';
import { bereikTekst } from '../public/js/beheer/schermen/analyse.js';

const MIGRATIES = fileURLToPath(new URL('../migrations/', import.meta.url));
const ENPS_REF = [10, 9, 9, 10, 8, 7, 7, 8, 6, 5, 9, 10, 3, 8, 9, 6, 7, 10, 9, 4];
const RAPPORT_REF = [7, 8, 6, 7, 9, 5, 8, 7, 7, 6, 8, 4, 7, 8, 9, 6, 7, 7];
const LIJSTEN = { schalen: SCHALEN, vraagtypen: VRAAGTYPEN, invoersoorten: INVOERSOORTEN, actiestatussen: ACTIESTATUSSEN, cijferschalen: CIJFERSCHALEN, kenmerken: KENMERKEN };
const opties = (...labels) => JSON.stringify(labels.map((l, i) => ({ id: `o${i + 1}`, label: l })));

/**
 * Een export (zoals GET export/data) met twee vragenlijsten op twee meetmomenten. De vragen staan zo dat de
 * achtergrondvraag de derde stamvraag is en de aanbeveelvraag (0–10) de zevende (criterium 7).
 * Lijst 10: 20 respondenten, eNPS en rapportcijfer zoals de referentiewaarden; lijst 20 (kopie): 10 respondenten.
 */
function maakExport({ cijferWaarden = null } = {}) {
  const vragen = [];
  const vraag = (id, lijst, thema, type, tekst, extra = {}) => vragen.push({
    id, vragenlijst_id: lijst, thema_id: thema, meetpunt_id: null, type, tekst, toelichting: '', opties: '[]', schaal_soort: 'eens',
    meerdere_antwoorden: 0, verplicht: 0, weet_niet: 0, uitsplitsen: 0, bron_vraag_id: lijst === 20 ? id - 100 : null, volgorde: id % 100, kenmerk: '', ...extra,
  });
  for (const l of [10, 20]) {
    const b = l * 10;
    vraag(b + 1, l, 1, 'schaal', 'Ik werk hier graag.');
    vraag(b + 2, l, 1, 'schaal', 'Ik heb genoeg tijd voor mijn werk.');
    vraag(b + 3, l, 2, 'meerkeuze', 'Op welke afdeling werk je?', { opties: opties('Kantoor', 'Productie', 'Logistiek'), uitsplitsen: 1, kenmerk: 'afdeling' });
    vraag(b + 4, l, 1, 'janee', 'Werk je soms thuis?');
    vraag(b + 5, l, 1, 'cijfer', 'Welk rapportcijfer geef je je werk?', { schaal_soort: 'rapport', weet_niet: 1 });
    vraag(b + 6, l, 1, 'open', 'Wat kan beter?');
    vraag(b + 7, l, 1, 'cijfer', 'Hoe waarschijnlijk is het dat je ons als werkgever aanbeveelt?', { schaal_soort: 'nps' });
  }
  const inzendingen = [];
  // Lijst 10: 12 Kantoor, 6 Productie, 2 Logistiek. De laatste twee geven bij het rapportcijfer "weet niet".
  for (let i = 0; i < 20; i++) {
    const a = { 101: 4, 102: i % 2 ? 5 : 3, 103: i < 12 ? 'o1' : i < 18 ? 'o2' : 'o3', 104: i % 3 ? 'ja' : 'nee', 106: `Opmerking ${i}`, 107: ENPS_REF[i] };
    a[105] = i < 18 ? RAPPORT_REF[i] : 'weet_niet';
    if (cijferWaarden !== null) {
      a[105] = cijferWaarden;
      a[107] = cijferWaarden;
    }
    inzendingen.push({ id: 5000 + i, vragenlijst_id: 10, datum: `2026-10-${String(1 + (i % 3)).padStart(2, '0')}`, antwoorden: a });
  }
  for (let i = 0; i < 10; i++) {
    const a = { 201: 5, 202: 5, 203: i < 5 ? 'o1' : 'o2', 204: 'ja', 205: 8, 207: 9 };
    if (cijferWaarden !== null) {
      a[205] = cijferWaarden;
      a[207] = cijferWaarden;
    }
    inzendingen.push({ id: 7000 + i, vragenlijst_id: 20, datum: '2027-03-02', antwoorden: a });
  }
  return {
    export: { versie: 1, datum: '2026-11-27' },
    lijsten: LIJSTEN,
    onderzoek: { id: 1, titel: 'MTO', bedrijfsnaam: 'Voorbeeld B.V.', onderzoeksvraag: 'Hoe gaat het?', status: 'actief' },
    themas: [{ id: 1, naam: 'Werk', volgorde: 1 }, { id: 2, naam: 'Achtergrond', volgorde: 2 }],
    meetpunten: [],
    meetmomenten: [{ id: 1, naam: 'Nulmeting', datum: '2026-10-01', volgorde: 1 }, { id: 2, naam: 'Vervolgmeting', datum: '2027-03-01', volgorde: 2 }],
    vragenlijsten: [
      { id: 10, titel: 'Nul', status: 'gesloten', code: 'c10', meetmoment_id: 1, aantal_uitgenodigd: 30 },
      { id: 20, titel: 'Vervolg', status: 'gesloten', code: 'c20', meetmoment_id: 2, aantal_uitgenodigd: 20 },
    ],
    vragen,
    inzendingen,
    eigen_invoer: [],
    stukken: [],
    acties: [],
    rapporten: [],
  };
}

const dashboardVan = (data, keuze = {}) => dashboardUitRijen(rijenUitExport(data), { vragenlijst: null, uitsplitsen: null, ...keuze });
const vraagIn = (d, id) => d.selectie.vragen.find((q) => q.id === id);

// ---------- kenmerken.js ----------

test('kenmerkVoorTekst herkent elke achtergrondvraag uit de sjablonen en de bibliotheek, en verder niets', () => {
  for (const [sleutel, v] of Object.entries(KENMERKVRAGEN)) {
    assert.equal(kenmerkVoorTekst(v.tekst), sleutel, v.tekst);
    assert.equal(kenmerkVoorTekst(v.tekst.replace('{bedrijf}', 'Bakkerij De Korenschoof B.V.')), sleutel);
    // Met de eigen antwoordmogelijkheden erbij (zo roepen het toepassen van een sjabloon en Vragen inlezen het aan).
    assert.equal(kenmerkVoorTekst(v.tekst.replace('{bedrijf}', 'Gemeente Utrecht'), v.opties), sleutel, `${v.tekst} met opties`);
  }
  // Elke vraag in elk standaardsjabloon: het herkende kenmerk is precies het kenmerk in het sjabloon (of geen).
  let getagd = 0;
  for (const s of INGEBOUWD) {
    for (const q of s.inhoud.vragen) {
      assert.equal(kenmerkVoorTekst(q.tekst), q.kenmerk || '', `${s.id}: ${q.tekst}`);
      assert.equal(kenmerkVoorTekst(q.tekst.replace('{bedrijf}', 'De Korenschoof'), q.opties || []), q.kenmerk || '', `${s.id}: ${q.tekst} met opties`);
      if (q.kenmerk) getagd++;
    }
  }
  assert.ok(getagd >= 25, `${getagd} achtergrondvragen met een kenmerk in de sjablonen`);
  // De teksten van migratie 0011 (ook in de verleden tijd bij vertrekonderzoek).
  assert.equal(kenmerkVoorTekst('Op welke afdeling werkte je?'), 'afdeling');
  assert.equal(kenmerkVoorTekst('Hoe lang heb je bij Voorbeeld B.V. gewerkt?'), 'diensttijd');
  assert.equal(kenmerkVoorTekst('  op welke AFDELING werk je  '), 'afdeling');
  for (const t of ['Hoe tevreden ben je over je werk?', 'Op welke afdeling zou je willen werken?', '', null]) assert.equal(kenmerkVoorTekst(t), '');
  // Geen diensttijd: na "bij" staat geen organisatie, of de antwoorden zijn geen duurklassen (review P2, bevinding 6).
  const duur = ['Korter dan 1 jaar', '1 tot 5 jaar', '5 jaar of langer'];
  for (const t of ['Hoe lang werk je bij voorkeur thuis?', 'Hoe lang werk je al bij deze afdeling?', 'Hoe lang werk je al bij je huidige team?', 'Hoe lang heb je bij deze leidinggevende gewerkt?']) {
    assert.equal(kenmerkVoorTekst(t), '', t);
    assert.equal(kenmerkVoorTekst(t, duur), '', `${t} (met duurklassen)`);
  }
  assert.equal(kenmerkVoorTekst('Hoe lang werk je al bij De Korenschoof?', ['Ochtend', 'Middag', 'Hele dag']), '', 'antwoorden zonder duur');
  assert.equal(kenmerkVoorTekst('Hoe lang werk je al bij De Korenschoof?', []), '', 'ja/nee of geen antwoorden');
  assert.equal(kenmerkVoorTekst('Hoe lang werk je al bij De Korenschoof?', duur), 'diensttijd');
  assert.equal(kenmerkVoorTekst('Hoe lang werk je al bij De Korenschoof?', [{ label: 'Korter dan 6 maanden' }, { label: '6 tot 12 maanden' }, { label: LIEVER_NIET }]), 'diensttijd');
  // De andere kenmerken kijken niet naar de antwoorden.
  assert.equal(kenmerkVoorTekst('Op welke afdeling werk je?', ['Kantoor', 'Productie']), 'afdeling');
  assert.equal(kenmerkVoorTekst('Geef je zelf leiding aan een of meer medewerkers?', []), 'leidinggevend');
});

test('klasseVan: elke antwoordmogelijkheid uit de bibliotheek met vaste grenzen, en de patronen van D1 §3.1', () => {
  // Eerst de vaste tabel: precies de grenzen uit KENMERKVRAGEN (B12).
  for (const v of Object.values(KENMERKVRAGEN)) {
    for (const lijst of [v.opties, ...Object.values(v.varianten || {})]) {
      for (const o of lijst) {
        const verwacht = o.eenheid ? { van: o.van, tot: o.tot, eenheid: o.eenheid } : null;
        assert.deepEqual(klasseVan(o.label), verwacht, o.label);
      }
    }
  }
  for (const [label, k] of Object.entries(KLASSEGRENZEN)) assert.deepEqual(klasseVan(label), k, label);
  assert.deepEqual(klasseVan('Een jaar of langer'), { van: 12, tot: null, eenheid: 'maand' });
  assert.deepEqual(klasseVan('Korter dan 3 maanden'), { van: null, tot: 3, eenheid: 'maand' });
  // Patronen voor oudere of eigen vragen.
  const gevallen = [
    ['Jonger dan 30 jaar', { van: null, tot: 30, eenheid: 'jaar' }],
    ['Korter dan 2 jaar', { van: null, tot: 2, eenheid: 'jaar' }],
    ['Korter dan 6 maanden', { van: null, tot: 6, eenheid: 'maand' }],
    ['Minder dan 24 uur', { van: null, tot: 24, eenheid: 'uur' }],
    ['30 tot 40 jaar', { van: 30, tot: 40, eenheid: 'jaar' }],
    ['3 tot 9 maanden', { van: 3, tot: 9, eenheid: 'maand' }],
    ['24 tot 32 uur', { van: 24, tot: 32, eenheid: 'uur' }],
    // "tot en met" en "t/m": de bovengrens hoort erbij, dus een 34-jarige valt in 25 t/m 34 (review P2, bevinding 4).
    ['25 tot en met 34 jaar', { van: 25, tot: 35, eenheid: 'jaar' }],
    ['25 t/m 34 jaar', { van: 25, tot: 35, eenheid: 'jaar' }],
    ['1 t/m 4 jaar', { van: 1, tot: 5, eenheid: 'jaar' }],
    ['3 t/m 5 maanden', { van: 3, tot: 6, eenheid: 'maand' }],
    ['32 tot en met 40 uur', { van: 32, tot: 41, eenheid: 'uur' }],
    ['5 t/m 5 jaar', { van: 5, tot: 6, eenheid: 'jaar' }],
    // Decimalen (een komma of een punt) en een punt als duizendtal.
    ['1,5 tot 3 jaar', { van: 1.5, tot: 3, eenheid: 'jaar' }],
    ['Korter dan 1,5 jaar', { van: null, tot: 1.5, eenheid: 'jaar' }],
    ['2.5 jaar of langer', { van: 2.5, tot: null, eenheid: 'jaar' }],
    ['1.000 uur of meer', { van: 1000, tot: null, eenheid: 'uur' }],
    ['60 jaar of ouder', { van: 60, tot: null, eenheid: 'jaar' }],
    ['15 jaar of langer', { van: 15, tot: null, eenheid: 'jaar' }],
    ['32 uur of meer', { van: 32, tot: null, eenheid: 'uur' }],
    ['Ouder dan 60 jaar', { van: 60, tot: null, eenheid: 'jaar' }],
    ['JONGER DAN 25 JAAR', { van: null, tot: 25, eenheid: 'jaar' }],
  ];
  for (const [label, k] of gevallen) assert.deepEqual(klasseVan(label), k, label);
  for (const label of [LIEVER_NIET, 'Afdeling A', 'Man', '55 tot 35 jaar', 'Ongeveer tien jaar', '', null]) assert.equal(klasseVan(label), null, String(label));
  // Met een streepje is niet te zien of de bovengrens erbij hoort ("18-24" of "25-35"): met de hand koppelen. Ook geen
  // klasse uit één getal met een decimaal, en geen "t/m" met een decimaal.
  for (const label of ['18-24 jaar', '45–55 jaar', '25 - 35 jaar', '1,5 jaar', '0 t/m 2,5 jaar', '5 t/m 4 jaar']) assert.equal(klasseVan(label), null, label);
});

test('isLieverNiet en magKenmerk', () => {
  assert.equal(isLieverNiet(LIEVER_NIET), true);
  assert.equal(isLieverNiet('dat zeg ik liever niet.'), true);
  assert.equal(isLieverNiet('Zeg ik liever niet'), true);
  assert.equal(isLieverNiet('Anders'), false);
  assert.equal(magKenmerk({ type: 'janee' }), true);
  assert.equal(magKenmerk({ type: 'meerkeuze', meerdere_antwoorden: 0 }), true);
  assert.equal(magKenmerk({ type: 'meerkeuze', meerdere_antwoorden: 1 }), false);
  for (const type of ['schaal', 'cijfer', 'open']) assert.equal(magKenmerk({ type }), false);
  assert.deepEqual(Object.keys(KENMERKEN), ['afdeling', 'leeftijd', 'geslacht', 'diensttijd', 'contract', 'uren', 'functieniveau', 'leidinggevend', 'locatie', 'opleiding', 'overig']);
});

// ---------- Criterium 1: een cijfer telt nergens mee in een themagemiddelde ----------

test('criterium 1: een rapportcijfer of aanbeveelcijfer van 10 verandert nergens een themagemiddelde', () => {
  const metCijfers = maakExport({ cijferWaarden: 10 });
  const zonder = maakExport();
  // Dezelfde gegevens zonder de cijfervragen (de antwoorden erop tellen dan nergens).
  zonder.vragen = zonder.vragen.filter((q) => q.type !== 'cijfer');
  const themaWerk = (data, lijst) => dashboardVan(data, { vragenlijst: lijst }).selectie.themas.find((t) => t.thema_id === 1);
  for (const lijst of [10, 20]) {
    const a = themaWerk(metCijfers, lijst);
    const b = themaWerk(zonder, lijst);
    assert.equal(a.gemiddelde, b.gemiddelde, `dashboard lijst ${lijst}`);
    assert.equal(a.aantal_vragen, 2, 'aantal_vragen telt alleen schaalvragen');
    assert.equal(a.antwoorden, b.antwoorden);
  }
  // Dashboard lijst 10: (20 × 4 + 10 × 3 + 10 × 5) / 40 = 4
  assert.equal(themaWerk(metCijfers, 10).gemiddelde, 4);
  // Verloop per thema
  assert.deepEqual(dashboardVan(metCijfers).verloop.themas, dashboardVan(zonder).verloop.themas);

  // Rapport: de vastgelegde themagemiddelden
  const feiten = (data) => verzamelFeiten({ data, dashboards: data.vragenlijsten.map((l) => dashboardVan(data, { vragenlijst: l.id })), peildatum: '2027-03-05' });
  assert.deepEqual(feiten(metCijfers).lijsten.map((l) => l.themas), feiten(zonder).lijsten.map((l) => l.themas));
  assert.deepEqual(feiten(metCijfers).toetsen.map((t) => [t.thema_naam, t.van.gemiddelde, t.naar.gemiddelde]), feiten(zonder).toetsen.map((t) => [t.thema_naam, t.van.gemiddelde, t.naar.gemiddelde]));

  // SPSS themaNN: dezelfde kolom met dezelfde waarden
  const thema = (data) => {
    const g = spssGegevens(data);
    const k = g.variabelen.findIndex((v) => v.naam === 'thema01');
    return g.rijen.map((r) => r[k]);
  };
  assert.deepEqual(thema(metCijfers), thema(zonder));
  assert.equal(thema(metCijfers)[0], 3.5);

  // Excel: Scores per thema
  const scores = (data) => excelBladen(data).find((b) => b.naam === 'Scores per thema').rijen;
  assert.deepEqual(scores(metCijfers), scores(zonder));

  // Analyse: t: en m: bevatten alleen schaalvragen; v: geeft wel het cijfer zelf.
  const model = bouwModel(metCijfers);
  const lijst = model.lijsten.find((l) => l.id === 10);
  assert.deepEqual(vragenVan(lijst, 't:1').map((q) => q.type), ['schaal', 'schaal']);
  assert.deepEqual(waardenVan(lijst, 't:1'), waardenVan(bouwModel(zonder).lijsten.find((l) => l.id === 10), 't:1'));
  assert.deepEqual(waardenVan(lijst, 'v:107').slice(0, 3), [10, 10, 10]);
});

// ---------- Dashboard ----------

test('dashboard: eNPS en rapportcijfer zoals de referentiewaarden, met weet niet apart', () => {
  const d = dashboardVan(maakExport(), { vragenlijst: 10 });
  const nps = vraagIn(d, 107);
  assert.equal(nps.type, 'cijfer');
  assert.equal(nps.schaal_soort, 'nps');
  assert.equal(nps.n, 20);
  assert.equal(nps.n_score, 20);
  assert.deepEqual(nps.cijferschaal, { min: 0, max: 10, laag: 'Zeer onwaarschijnlijk', hoog: 'Zeer waarschijnlijk' });
  assert.deepEqual({ ...nps.enps }, { promotors: 9, passief: 6, criticasters: 5, pct_promotors: 45, pct_passief: 30, pct_criticasters: 25, score: 20 });
  assert.equal(nps.verdeling.length, 11);
  assert.deepEqual(nps.verdeling.map((v) => v.aantal), [0, 0, 0, 1, 1, 1, 2, 3, 3, 5, 4]);
  assert.ok(Math.abs(nps.gemiddelde - ENPS_REF.reduce((t, x) => t + x, 0) / 20) < 1e-12);
  assert.equal(nps.pct_onvoldoende, undefined);

  const r = vraagIn(d, 105);
  assert.equal(r.schaal_soort, 'rapport');
  assert.equal(r.n, 20, 'n telt weet niet mee');
  assert.equal(r.n_score, 18);
  assert.ok(Math.abs(r.gemiddelde - 7) < 1e-12);
  assert.ok(Math.abs(r.pct_onvoldoende - 100 / 9) < 1e-9, `${r.pct_onvoldoende}`); // 11,111 %
  assert.deepEqual(r.verdeling.map((v) => v.waarde), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 'weet_niet']);
  assert.equal(r.verdeling.at(-1).aantal, 2);
  assert.equal(r.enps, undefined);
  assert.equal(r.beschermd, false);
});

test('dashboard: verloop van een cijfervraag per meetmoment (gemiddelde en eNPS), alleen met dezelfde cijferschaal', () => {
  const data = maakExport();
  const nps = vraagIn(dashboardVan(data, { vragenlijst: 10 }), 107);
  assert.deepEqual(nps.verloop.map((p) => [p.naam, p.enps_score, p.n]), [['Nulmeting', 20, 20], ['Vervolgmeting', 100, 10]]);
  assert.equal(nps.verloop[1].gemiddelde, 9);
  const r = vraagIn(dashboardVan(data, { vragenlijst: 10 }), 105);
  assert.deepEqual(r.verloop.map((p) => p.gemiddelde), [7, 8]);
  assert.ok(r.verloop.every((p) => !('enps_score' in p)));
  // De kopie kreeg een andere cijferschaal (nog zonder antwoorden aangepast): niet samentellen.
  const anders = maakExport();
  anders.vragen.find((q) => q.id === 207).schaal_soort = 'rapport';
  const zonderKopie = vraagIn(dashboardVan(anders, { vragenlijst: 10 }), 107);
  assert.equal(zonderKopie.verloop, undefined, 'maar één meetmoment met dezelfde schaal: geen verloop');
});

/**
 * Een kopie waarvan het type daarna veranderde (mag zolang de kopie geen antwoorden heeft): vraag 201, de kopie van de
 * schaalvraag 101, werd een rapportcijfer; vraag 204, de kopie van de ja/nee-vraag 104, een meerkeuzevraag.
 * In de vervolgmeting staat bij 201 een 3: een geldig cijfer én een geldige score op 1 tot 5.
 */
function maakTypeKopie() {
  const data = maakExport();
  Object.assign(data.vragen.find((q) => q.id === 201), { type: 'cijfer', schaal_soort: 'rapport' });
  Object.assign(data.vragen.find((q) => q.id === 204), { type: 'meerkeuze', opties: opties('Ja', 'Nee', 'Soms') });
  for (const i of data.inzendingen.filter((x) => x.vragenlijst_id === 20)) Object.assign(i.antwoorden, { 201: 3, 204: 'o1' });
  return data;
}

test('kopie met een ander type (schaal → rapportcijfer, ja/nee → meerkeuze): nergens samengeteld (dashboard, SPSS, Analyse)', () => {
  const data = maakTypeKopie();
  // Dashboard (ook de bron van de rapportfeiten): geen verloop meer over twee verschillende soorten vragen.
  const nul = dashboardVan(data, { vragenlijst: 10 });
  const vervolg = dashboardVan(data, { vragenlijst: 20 });
  assert.equal(vraagIn(nul, 101).verloop, undefined, 'de schaalvraag staat maar op één meetmoment');
  assert.equal(vraagIn(vervolg, 201).verloop, undefined, 'het rapportcijfer staat maar op één meetmoment');
  assert.equal(vraagIn(nul, 104).verloop, undefined, 'de ja/nee-vraag telt niet samen met de meerkeuzevraag');
  assert.deepEqual([vraagIn(vervolg, 201).gemiddelde, vraagIn(vervolg, 201).n_score], [3, 10], 'het cijfer zelf staat er gewoon');
  // Zonder typewijziging is er wel een verloop (controle van de opzet).
  assert.deepEqual(vraagIn(dashboardVan(maakExport(), { vragenlijst: 10 }), 101).verloop.map((p) => p.gemiddelde), [4, 5]);

  // SPSS: de kopie is een eigen variabele (v08, SCALE) en de schaalvraag v01 heeft bij de vervolgmeting geen waarde.
  const { variabelen, rijen } = spssGegevens(data);
  const namen = variabelen.map((v) => v.naam);
  assert.deepEqual(namen, ['respondent', 'vragenlijst', 'meetmoment', 'datum', 'v01', 'v02', 'afdeling', 'v04', 'v05', 'v06', 'v07', 'v07_enps', 'v08', 'v09', 'thema01']);
  const k = (naam) => namen.indexOf(naam);
  assert.deepEqual([...new Set(rijen.slice(0, 20).map((r) => r[k('v01')]))], [4]);
  assert.ok(rijen.slice(20).every((r) => r[k('v01')] === null), 'een rapportcijfer staat nooit in de kolom van een schaalvraag');
  assert.ok(rijen.slice(20).every((r) => r[k('v08')] === 3));
  assert.ok(rijen.slice(0, 20).every((r) => r[k('v08')] === null));
  assert.equal(variabelen[k('v08')].meetniveau, 'SCALE');
  assert.deepEqual(variabelen[k('v08')].waardelabels, { 1: 'Zeer slecht', 10: 'Uitstekend', 99: 'Weet niet / n.v.t.' });
  assert.ok(rijen.slice(20).every((r) => r[k('v04')] === null && r[k('v09')] === 1), 'een meerkeuzeantwoord staat niet in de ja/nee-kolom');
  const nm = spssVariabeleNamen(data);
  assert.deepEqual([nm.vraag.get(101), nm.vraag.get(201), nm.vraag.get(104)], ['v01', 'v08', 'v04']);

  // Analyse (stap voor stap) en werkbank: per stam één soort vraag; v:101 bestaat in de vervolgmeting niet.
  const model = bouwModel(data);
  const soorten = new Map();
  for (const l of model.lijsten) for (const q of l.vragen) soorten.set(q.stam, new Set([...(soorten.get(q.stam) || []), `${q.type}:${q.type === 'cijfer' ? q.schaal_soort : ''}`]));
  assert.ok([...soorten.values()].every((s) => s.size === 1), 'elke stam heeft één soort vraag');
  const [l10, l20] = [10, 20].map((id) => model.lijsten.find((l) => l.id === id));
  assert.deepEqual([l10.vragen[0].stam, l20.vragen[0].stam, l20.vragen[1].stam], [101, 201, 102], 'een gewone kopie houdt de stam');
  assert.deepEqual(waardenVan(l10, 'v:101'), Array(20).fill(4));
  assert.equal(waardenVan(l20, 'v:101'), null, 'de schaalvraag is in de vervolgmeting niet gevraagd');
  assert.deepEqual(waardenVan(l20, 'v:201'), Array(10).fill(3));
  assert.deepEqual(vragenVan(l10, 'v:201'), []);
  // Een themascore blijft schaal-only: in de vervolgmeting telt alleen vraag 202 mee.
  assert.deepEqual(vragenVan(l20, 't:1').map((q) => q.id), [202]);

  // De stamvraag houdt zijn stam, ook als zijn vragenlijst later in de export staat; zonder stamvraag krijgt de
  // eerste kopie de stam.
  const omgekeerd = maakTypeKopie();
  omgekeerd.vragenlijsten.reverse();
  const m2 = bouwModel(omgekeerd);
  assert.deepEqual([m2.lijsten[0].vragen[0].stam, m2.lijsten[1].vragen[0].stam], [201, 101]);
  const zonderStam = maakTypeKopie();
  zonderStam.vragenlijsten = zonderStam.vragenlijsten.filter((l) => l.id === 20);
  zonderStam.vragen = zonderStam.vragen.filter((q) => q.vragenlijst_id === 20);
  assert.equal(bouwModel(zonderStam).lijsten[0].vragen[0].stam, 101);
});

test('dashboard: uitsplitsing met een kolom per cijfervraag, elke kolom apart onderdrukt', () => {
  const data = maakExport();
  // Productie en Logistiek: alleen 4 van de 8 geven een rapportcijfer.
  for (const i of data.inzendingen.filter((x) => x.vragenlijst_id === 10 && x.antwoorden[103] !== 'o1').slice(0, 4)) i.antwoorden[105] = 'weet_niet';
  const u = dashboardVan(data, { vragenlijst: 10, uitsplitsen: 103 }).selectie.uitsplitsing;
  assert.deepEqual(u.cijfervragen, [
    { vraag_id: 105, tekst: 'Welk rapportcijfer geef je je werk?', schaal_soort: 'rapport' },
    { vraag_id: 107, tekst: 'Hoe waarschijnlijk is het dat je ons als werkgever aanbeveelt?', schaal_soort: 'nps' },
  ]);
  const [kantoor, overig] = u.groepen;
  assert.equal(kantoor.label, 'Kantoor');
  assert.equal(overig.label, 'Overige groepen samen');
  assert.equal(overig.n, 8);
  // Rapportcijfer: Overige heeft 2 cijfers (< 5), dus verborgen; Kantoor gaat mee (anders terug te rekenen).
  const rapport = (g) => g.cijfers.find((c) => c.vraag_id === 105);
  assert.deepEqual(rapport(overig), { vraag_id: 105, n: null, gemiddelde: null, enps: null, verborgen: true });
  assert.equal(rapport(kantoor).verborgen, true);
  assert.equal(rapport(kantoor).gemiddelde, null);
  // eNPS: beide groepen groot genoeg; afgerond (eNPS op een geheel getal, gemiddelde op 1 decimaal).
  const nps = (g) => g.cijfers.find((c) => c.vraag_id === 107);
  const kantoorNps = ENPS_REF.slice(0, 12);
  const pk = kantoorNps.filter((x) => x >= 9).length;
  const ck = kantoorNps.filter((x) => x <= 6).length;
  assert.equal(nps(kantoor).enps, Math.round(((pk - ck) / 12) * 100));
  assert.equal(nps(kantoor).gemiddelde, Math.round((kantoorNps.reduce((t, x) => t + x, 0) / 12) * 10) / 10);
  assert.equal(nps(overig).n, 8);
  // De themacellen zijn niet veranderd door de cijfervragen.
  assert.deepEqual(kantoor.themas.map((t) => t.thema_id), [1]);
  assert.deepEqual(kantoor.vragen.map((v) => v.vraag_id), [101, 102]);
});

test('meelezer: een cijfervraag met 4 scores geeft geen verdeling, gemiddelde of eNPS; afgerond op 2 decimalen', () => {
  const data = maakExport();
  // Lijst 20 (10 respondenten): maar 4 geven een aanbeveelcijfer.
  for (const i of data.inzendingen.filter((x) => x.vragenlijst_id === 20).slice(4)) delete i.antwoorden[207];
  const kijk = kijkerDashboard(dashboardVan(data, { vragenlijst: 20 }), { dashboard: true, open_antwoorden: false, tussenstand: false });
  const q = vraagIn(kijk, 207);
  assert.equal(q.verborgen, true);
  assert.deepEqual(q.verdeling, []);
  assert.equal(q.gemiddelde, null);
  assert.equal(q.enps, null);
  assert.equal(q.n, null);
  assert.equal(q.n_score, undefined);
  // Het thema blijft (een cijfervraag zit niet in het themagemiddelde).
  assert.equal(kijk.selectie.themas.find((t) => t.thema_id === 1).verborgen, undefined);
  // Lijst 10: wel zichtbaar, afgerond.
  const tien = kijkerDashboard(dashboardVan(maakExport(), { vragenlijst: 10 }), { dashboard: true, tussenstand: false });
  const r = vraagIn(tien, 105);
  assert.equal(r.pct_onvoldoende, 11.11);
  assert.equal(vraagIn(tien, 107).enps.score, 20);
  // Verloop: punten met enps_score; een te klein punt zonder getal.
  const v = vraagIn(kijkerDashboard(dashboardVan(data, { vragenlijst: 10 }), { dashboard: true, tussenstand: false }), 107).verloop;
  assert.deepEqual(v.map((p) => [p.enps_score, p.n]), [[20, 20], [null, null]]);
});

test('Alle resultaten rekent in de browser boven 1.500 inzendingen of boven 60.000 antwoordcellen', () => {
  assert.equal(LOKAAL_BOVEN_CELLEN, KIJK_MAX_CELLEN, 'zelfde grens als bij meelezers');
  assert.equal(rekenInBrowser([{ aantal_inzendingen: 1000, aantal_vragen: 60 }], { maxInzendingen: 1500 }), false, 'precies 60.000 cellen');
  assert.equal(rekenInBrowser([{ aantal_inzendingen: 1000, aantal_vragen: 61 }], { maxInzendingen: 1500 }), true);
  // Opgeteld over de vragenlijsten: 2 × 700 inzendingen × 45 vragen = 63.000 cellen, 1.400 inzendingen.
  assert.equal(rekenInBrowser([{ aantal_inzendingen: 700, aantal_vragen: 45 }, { aantal_inzendingen: 700, aantal_vragen: 45 }], { maxInzendingen: 1500 }), true);
  assert.equal(rekenInBrowser([{ aantal_inzendingen: 1501, aantal_vragen: 1 }], { maxInzendingen: 1500 }), true);
  assert.equal(rekenInBrowser([{ aantal_inzendingen: 1500, aantal_vragen: 2 }], { maxInzendingen: 1500 }), false);
  assert.equal(rekenInBrowser([], { maxInzendingen: 1500 }), false);
  assert.equal(rekenInBrowser([{ aantal_inzendingen: '900', aantal_vragen: '70' }]), true, 'getallen als tekst');
});

// ---------- Analyse-model ----------

test('analyse-model: cijferWaarde gebruikt het bereik uit de export, nooit een standaard 0–10 (B13)', () => {
  const model = bouwModel(maakExport());
  const l = model.lijsten.find((x) => x.id === 10);
  const r = l.vragen.find((q) => q.id === 105);
  const n = l.vragen.find((q) => q.id === 107);
  assert.deepEqual([r.bereik.min, r.bereik.max, n.bereik.min, n.bereik.max], [1, 10, 0, 10]);
  assert.equal(cijferWaarde(r, 0), null, '0 is geen rapportcijfer');
  assert.equal(cijferWaarde(n, 0), 0);
  assert.equal(cijferWaarde(r, 'weet_niet'), null);
  assert.equal(cijferWaarde(r, 7.5), null);
  assert.equal(r.kenmerk, '');
  assert.equal(l.vragen.find((q) => q.id === 103).kenmerk, 'afdeling');
  // Zonder cijferschalen in de export: geen enkel cijfer telt (liever geen getal dan een verkeerd getal).
  const zonder = maakExport();
  zonder.lijsten = { ...zonder.lijsten, cijferschalen: undefined };
  const z = bouwModel(zonder).lijsten.find((x) => x.id === 10);
  assert.equal(z.vragen.find((q) => q.id === 105).bereik, null);
  assert.ok(waardenVan(z, 'v:105').every((w) => w === null));
  // groepeerVragen: uitsplitsvragen, eerst die met een kenmerk (B11).
  const lijst = { vragen: [
    { id: 1, type: 'janee', uitsplitsen: true, kenmerk: '' },
    { id: 2, type: 'meerkeuze', meerdere: false, uitsplitsen: true, kenmerk: 'afdeling' },
    { id: 3, type: 'meerkeuze', meerdere: false, uitsplitsen: false, kenmerk: 'diensttijd' },
    { id: 4, type: 'meerkeuze', meerdere: true, uitsplitsen: true, kenmerk: '' },
  ] };
  assert.deepEqual(groepeerVragen(lijst).map((q) => q.id), [2, 1]);
});

test('Analyse: de zin onder een uitkomst noemt het bereik van een cijfervraag, anders de schaal van 1 tot 5', () => {
  const l = bouwModel(maakExport()).lijsten.find((x) => x.id === 10);
  assert.equal(bereikTekst([l], 'v:107'), 'cijfer van 0 (laagst) tot 10 (hoogst)');
  assert.equal(bereikTekst([l], 'v:105'), 'rapportcijfer van 1 (laagst) tot 10 (hoogst)');
  for (const sleutel of ['v:101', 't:1', 'm:1']) assert.equal(bereikTekst([l], sleutel), 'schaal van 1 (laagst) tot 5 (hoogst)', sleutel);
  // De kopregel van "Verschil tussen meetmomenten" en "Verschil tussen groepen" gebruikt bereikTekst, geen vaste 1 tot 5.
  const bron = readFileSync(new URL('../public/js/beheer/schermen/analyse.js', import.meta.url), 'utf8');
  assert.equal((bron.match(/; schaal van 1 \(laagst\) tot 5 \(hoogst\)`/g) || []).length, 0);
  assert.equal((bron.match(/\$\{bereikTekst\(/g) || []).length, 2);
  assert.ok(bron.includes('niet gemeten met een schaal- of cijfervraag'));
});

// ---------- Criterium 7: SPSS en Codeboek ----------

test('criterium 7: SPSS-naam afdeling in plaats van v03, v07_enps 1/2/3 (ORDINAL), cijfer als SCALE met 99', () => {
  const data = maakExport();
  const { variabelen, rijen } = spssGegevens(data);
  const namen = variabelen.map((v) => v.naam);
  assert.deepEqual(namen, ['respondent', 'vragenlijst', 'meetmoment', 'datum', 'v01', 'v02', 'afdeling', 'v04', 'v05', 'v06', 'v07', 'v07_enps', 'thema01']);
  const v = (naam) => variabelen.find((x) => x.naam === naam);
  const k = (naam) => namen.indexOf(naam);
  assert.equal(v('afdeling').meetniveau, 'NOMINAL');
  assert.deepEqual(v('afdeling').waardelabels, { 1: 'Kantoor', 2: 'Productie', 3: 'Logistiek' });
  assert.equal(v('v05').meetniveau, 'SCALE');
  assert.deepEqual(v('v05').waardelabels, { 1: 'Zeer slecht', 10: 'Uitstekend', 99: 'Weet niet / n.v.t.' });
  assert.deepEqual(v('v05').ontbrekend, [99]);
  assert.deepEqual(v('v07').waardelabels, { 0: 'Zeer onwaarschijnlijk', 10: 'Zeer waarschijnlijk', 99: 'Weet niet / n.v.t.' });
  assert.equal(v('v07_enps').meetniveau, 'ORDINAL');
  assert.deepEqual(v('v07_enps').waardelabels, { 1: 'Criticaster (0–6)', 2: 'Passief (7–8)', 3: 'Promotor (9–10)' });
  // Respondent 1 (cijfer 10): promotor; respondent 9 (6): criticaster; respondent 5 (8): passief.
  assert.deepEqual([rijen[0][k('v07')], rijen[0][k('v07_enps')]], [10, 3]);
  assert.deepEqual([rijen[8][k('v07')], rijen[8][k('v07_enps')]], [6, 1]);
  assert.deepEqual([rijen[4][k('v07')], rijen[4][k('v07_enps')]], [8, 2]);
  assert.equal(rijen[18][k('v05')], 99, 'weet niet');
  assert.equal(rijen[0][k('afdeling')], 1);
  // De vervolgmeting (kopie) in dezelfde kolommen.
  assert.deepEqual([rijen[20][k('v05')], rijen[20][k('v07')], rijen[20][k('v07_enps')]], [8, 9, 3]);
  // spssVariabeleNamen: dezelfde namen, ook enps.
  const nm = spssVariabeleNamen(data);
  assert.deepEqual([...nm.gebruikt], namen);
  assert.equal(nm.vraag.get(103), 'afdeling');
  assert.equal(nm.enps.get(107), 'v07_enps');
  assert.equal(nm.enps.size, 1);
  // 'Ander kenmerk' (overig) krijgt geen leesbare naam; twee keer hetzelfde kenmerk krijgt _2.
  const metOverig = maakExport();
  metOverig.vragen.find((q) => q.id === 104).kenmerk = 'overig';
  assert.equal(spssVariabeleNamen(metOverig).vraag.get(104), 'v04');
});

test('criterium 7: het Codeboek heeft een laatste kolom Kenmerk; Excel en CSV tonen het cijfer', () => {
  const data = maakExport();
  const bladen = excelBladen(data);
  const codeboek = bladen.find((b) => b.naam === 'Codeboek').rijen;
  assert.equal(codeboek[0].at(-1), 'Kenmerk');
  assert.equal(codeboek[0].length, 10);
  const rij = (tekst) => codeboek.find((r) => r[5] === tekst && r[0] === 'Nul');
  assert.equal(rij('Op welke afdeling werk je?').at(-1), 'Afdeling');
  assert.equal(rij('Ik werk hier graag.').at(-1), '');
  assert.equal(rij('Welk rapportcijfer geef je je werk?')[7], '1 = Zeer slecht … 10 = Uitstekend; weet niet / n.v.t.');
  assert.equal(rij('Hoe waarschijnlijk is het dat je ons als werkgever aanbeveelt?')[7], '0 = Zeer onwaarschijnlijk … 10 = Zeer waarschijnlijk');
  assert.equal(rij('Welk rapportcijfer geef je je werk?')[6], 'Cijfer (0–10 of 1–10)');
  const antwoorden = bladen.find((b) => b.naam === 'Antwoorden 1').rijen;
  assert.equal(antwoorden[1][2 + 4], 7);
  assert.equal(antwoorden[19][2 + 4], 'weet niet / n.v.t.');
  const csv = alleAntwoordenCsv(data).split('\r\n');
  assert.match(csv[0], /;Score \(1-5\);Cijfer \(0-10\)$/);
  assert.ok(csv.some((r) => /;Cijfer \(0–10 of 1–10\);10;;10$/.test(r)), 'cijfer in de laatste kolom, niet in Score (1-5)');
});

// ---------- Criterium 6: sjablonen en migratie 0017 ----------

/** Alle tekstwaarden ('…') uit één SQL-opdracht, in volgorde. */
function sqlTeksten(opdracht) {
  return [...opdracht.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
}

const origineel = (s) => ({
  naam: String(s.naam || s.id).trim().slice(0, 150),
  omschrijving: String(s.omschrijving || '').trim().slice(0, 1000),
  inhoud: JSON.stringify(controleerSjabloonInhoud(s.inhoud)),
});

test('criterium 6: elk standaardsjabloon is geldig, met hooguit één vraag per kenmerk', () => {
  assert.equal(INGEBOUWD.length, 12);
  for (const s of INGEBOUWD) {
    const c = controleerSjabloonInhoud(s.inhoud);
    const kenmerken = c.vragen.map((q) => q.kenmerk).filter(Boolean);
    assert.equal(new Set(kenmerken).size, kenmerken.length, s.id);
    assert.ok(kenmerken.includes('afdeling') && kenmerken.includes('diensttijd'), s.id);
    assert.ok(c.vragen.length <= 100);
    // Geen ja/nee-vraag over aanbevelen meer (B16); leeftijd staat niet in de sjablonen.
    assert.ok(!c.vragen.some((q) => /aanbevelen als werkgever/.test(q.tekst)), s.id);
    assert.ok(!kenmerken.includes('leeftijd'), s.id);
    for (const q of c.vragen.filter((x) => x.kenmerk)) assert.ok(magKenmerk({ type: q.type, meerdere_antwoorden: q.meerdere_antwoorden }));
    // Een vraag zonder kenmerk heeft het veld niet (zo blijft de vaste vorm gelijk).
    for (const q of c.vragen.filter((x) => !x.kenmerk)) assert.ok(!('kenmerk' in q));
  }
  const vind = (id) => controleerSjabloonInhoud(INGEBOUWD.find((s) => s.id === id).inhoud).vragen;
  const enps = 'Hoe waarschijnlijk is het dat je {bedrijf} als werkgever aanbeveelt aan vrienden of bekenden?';
  for (const id of ['medewerkerstevredenheid', 'onboarding', 'vertrekonderzoek']) {
    const q = vind(id).find((x) => x.tekst === enps);
    assert.deepEqual([q.type, q.schaal_soort], ['cijfer', 'nps'], id);
  }
  assert.deepEqual(vind('medewerkerstevredenheid').filter((q) => q.type === 'cijfer').map((q) => [q.schaal_soort, q.thema]), [['rapport', 'Betrokkenheid'], ['nps', 'Betrokkenheid']]);
  assert.equal(vind('leiderschap').find((q) => q.type === 'janee' && q.thema === 'Achtergrond').kenmerk, 'leidinggevend');
  // Vertrekonderzoek: kenmerk wel, uitsplitsen bewust niet (K P12).
  assert.deepEqual(vind('vertrekonderzoek').filter((q) => q.kenmerk).map((q) => [q.kenmerk, q.uitsplitsen]), [['afdeling', false], ['diensttijd', false]]);
});

test('criterium 6: samenvoegen houdt het kenmerk (het eerste sjabloon wint) en de eNPS-vraag één keer', () => {
  const alle = voegSjablonenSamen(INGEBOUWD.map((s) => s.inhoud));
  const kenmerken = alle.vragen.filter((q) => q.kenmerk).map((q) => q.kenmerk);
  assert.deepEqual(kenmerken, ['afdeling', 'diensttijd', 'leidinggevend']);
  assert.equal(alle.vragen.filter((q) => q.type === 'cijfer' && q.schaal_soort === 'nps').length, 1);
  assert.equal(alle.vragen.filter((q) => q.type === 'cijfer' && q.schaal_soort === 'rapport').length, 1);
  // Onboarding na medewerkerstevredenheid: de diensttijd in maanden krijgt geen tweede kenmerk.
  const ob = voegSjablonenSamen(['medewerkerstevredenheid', 'onboarding'].map((id) => INGEBOUWD.find((s) => s.id === id).inhoud));
  assert.equal(ob.vragen.find((q) => q.tekst === 'Hoe lang werk je bij {bedrijf}?').kenmerk, undefined);
  assert.equal(ob.vragen.find((q) => q.tekst === 'Hoe lang werk je al bij {bedrijf}?').kenmerk, 'diensttijd');
  assert.doesNotThrow(() => controleerSjabloonInhoud(ob));
  // Een ongeldig kenmerk of een kenmerk bij een open vraag valt weg; weet niet blijft bij een cijfervraag.
  const los = voegSjablonenSamen([{ themas: [{ naam: 'A' }], vragen: [
    { thema: 'A', type: 'open', tekst: 'Open?', kenmerk: 'afdeling' },
    { thema: 'A', type: 'janee', tekst: 'Ja?', kenmerk: 'bestaat-niet' },
    { thema: 'A', type: 'cijfer', tekst: 'Cijfer?', schaal_soort: 'onzin', weet_niet: true },
  ] }]);
  assert.deepEqual(los.vragen.map((q) => [q.kenmerk, q.schaal_soort, q.weet_niet]), [[undefined, 'eens', false], [undefined, 'eens', false], [undefined, 'rapport', true]]);
});

test('sjablooncontrole: cijfer en kenmerk, met meldingen die het probleem benoemen', () => {
  const basis = (vragen) => ({ themas: [{ naam: 'A' }], vragen });
  const c = controleerSjabloonInhoud(basis([{ thema: 'A', type: 'cijfer', tekst: 'Cijfer?', weet_niet: true }]));
  assert.deepEqual([c.vragen[0].schaal_soort, c.vragen[0].weet_niet], ['rapport', true]);
  assert.equal(controleerSjabloonInhoud(basis([{ thema: 'A', type: 'cijfer', tekst: 'NPS?', schaal_soort: 'nps' }])).vragen[0].schaal_soort, 'nps');
  const fouten = [
    [[{ thema: 'A', type: 'cijfer', tekst: 'X?', schaal_soort: 'eens' }], /Vraag 1: kies een geldige cijferschaal/],
    [[{ thema: 'A', type: 'schaal', tekst: 'X?', kenmerk: 'afdeling' }], /Vraag 1: een kenmerk kan alleen bij een meerkeuzevraag met één antwoord of bij een ja\/nee-vraag/],
    [[{ thema: 'A', type: 'janee', tekst: 'X?', kenmerk: 'schoenmaat' }], /Vraag 1: kies een geldig kenmerk/],
    [[{ thema: 'A', type: 'janee', tekst: 'X?', kenmerk: 'leidinggevend' }, { thema: 'A', type: 'janee', tekst: 'Y?', kenmerk: 'leidinggevend' }], /Vraag 2: het kenmerk Geeft leiding staat al bij vraag 1/],
    [[{ thema: 'A', type: 'janee', tekst: 'X?', weet_niet: true }], /Vraag 1: het antwoord "weet niet" kan alleen bij een schaalvraag of een cijfervraag/],
  ];
  for (const [vragen, patroon] of fouten) assert.throws(() => controleerSjabloonInhoud(basis(vragen)), patroon);
  // 'Ander kenmerk' mag vaker voorkomen.
  const overig = controleerSjabloonInhoud(basis([{ thema: 'A', type: 'janee', tekst: 'X?', kenmerk: 'overig' }, { thema: 'A', type: 'janee', tekst: 'Y?', kenmerk: 'overig' }]));
  assert.deepEqual(overig.vragen.map((q) => q.kenmerk), ['overig', 'overig']);
});

test('criterium 6: migratie 0017 is de hoogste en zet elk ongewijzigd standaardsjabloon precies op de code (D1 §11.5)', () => {
  const bestanden = readdirSync(MIGRATIES).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  assert.equal(bestanden.at(-1), '0017_sjablonen_kenmerken.sql', 'de sjabloonmigratie is altijd de hoogste');
  const sql = readFileSync(new URL('../migrations/0017_sjablonen_kenmerken.sql', import.meta.url), 'utf8');
  const opdrachten = sql.split('\n').filter((r) => r.startsWith('UPDATE'));
  assert.equal(opdrachten.length, INGEBOUWD.length);
  // De versie die nu in de database staat: wat migratie 0010 erin zette (de code is sindsdien niet veranderd).
  const oud10 = new Map(readFileSync(new URL('../migrations/0010_sjablonen_bijwerken.sql', import.meta.url), 'utf8').split('\n')
    .filter((r) => r.startsWith('UPDATE')).map((r) => {
      const [inhoud, bron] = sqlTeksten(r);
      return [bron, inhoud];
    }));
  for (const opdracht of opdrachten) {
    assert.ok(Buffer.byteLength(opdracht) < 100_000, 'een opdracht is kleiner dan 100 KB');
    assert.match(opdracht, /^UPDATE sjablonen SET naam = '.*', omschrijving = '.*', inhoud = '.*' WHERE bron = '[a-z-]+' AND naam = '.*' AND omschrijving = '.*' AND inhoud = '.*';$/);
    const [naam, omschrijving, inhoud, bron, oudNaam, oudOmschrijving, oudInhoud] = sqlTeksten(opdracht);
    const s = INGEBOUWD.find((x) => x.id === bron);
    assert.ok(s, bron);
    assert.deepEqual({ naam, omschrijving, inhoud }, origineel(s), `${bron}: de nieuwe inhoud is precies de code`);
    assert.equal(oudInhoud, oud10.get(bron), `${bron}: de oude inhoud is wat 0010 erin zette`);
    assert.deepEqual([oudNaam, oudOmschrijving], [naam, omschrijving]);
    // Na de migratie leest een ongewijzigd sjabloon "gewijzigd: false"; een aangepast sjabloon blijft staan.
    const rij = { id: 1, bron, naam: oudNaam, omschrijving: oudOmschrijving, inhoud: oudInhoud, aangemaakt_op: '', bijgewerkt_op: null };
    const voorMigratie = sjabloonUit(rij);
    assert.equal(voorMigratie.gewijzigd, true, `${bron}: zonder 0017 zou het sjabloon als gewijzigd tellen`);
    const na = { ...rij, naam, omschrijving, inhoud };
    assert.equal(sjabloonUit(na).gewijzigd, false, bron);
  }
});

// ---------- Server: controle van een vraag en een antwoord ----------

test('vraagVeldenUit: cijferschaal, weet niet en kenmerk worden gecontroleerd', () => {
  const themas = new Set([1]);
  const mp = new Map();
  const v = (extra) => vraagVeldenUit({ thema_id: 1, tekst: 'Vraag?', ...extra }, themas, mp);
  assert.deepEqual([v({ type: 'cijfer' }).schaal_soort, v({ type: 'cijfer', schaal_soort: 'nps' }).schaal_soort], ['rapport', 'nps']);
  assert.equal(v({ type: 'cijfer', weet_niet: true }).weet_niet, 1);
  assert.equal(v({ type: 'janee', weet_niet: true }).weet_niet, 0);
  assert.equal(v({ type: 'schaal', schaal_soort: 'tevreden' }).schaal_soort, 'tevreden');
  assert.equal(v({ type: 'open', schaal_soort: 'nps' }).schaal_soort, 'eens');
  assert.equal(v({ type: 'janee', kenmerk: 'leidinggevend' }).kenmerk, 'leidinggevend');
  assert.equal(v({ type: 'meerkeuze', opties: ['A', 'B'], kenmerk: 'afdeling' }).kenmerk, 'afdeling');
  assert.equal(v({ type: 'janee' }).kenmerk, '');
  const fout = (extra, status, patroon) => assert.throws(() => v(extra), (e) => e.status === status && patroon.test(e.message), JSON.stringify(extra));
  fout({ type: 'cijfer', schaal_soort: 'eens' }, 400, /Cijferschaal/);
  fout({ type: 'schaal', kenmerk: 'afdeling' }, 400, /^Een kenmerk kan alleen bij een meerkeuzevraag met één antwoord of bij een ja\/nee-vraag\.$/);
  fout({ type: 'meerkeuze', opties: ['A', 'B'], meerdere_antwoorden: true, kenmerk: 'afdeling' }, 400, /Een kenmerk kan alleen/);
  fout({ type: 'cijfer', kenmerk: 'afdeling' }, 400, /Een kenmerk kan alleen/);
  fout({ type: 'janee', kenmerk: 'schoenmaat' }, 400, /^Kies een geldig kenmerk\.$/);
  fout({ type: 'janee', kenmerk: 5 }, 400, /^Kies een geldig kenmerk\.$/);
  assert.equal(controleerKenmerk('', { type: 'schaal' }), '');
  assert.equal(controleerKenmerk(null, { type: 'schaal' }), '');
});

test('controleerAntwoord: 0 en 10 bij 0–10; 11, −1 en 5,5 niet; 0 niet bij 1–10; weet niet alleen als het mag', () => {
  const nps = { type: 'cijfer', schaal_soort: 'nps', weet_niet: 0 };
  const rapport = { type: 'cijfer', schaal_soort: 'rapport', weet_niet: 1 };
  assert.equal(controleerAntwoord(nps, 0), 0);
  assert.equal(controleerAntwoord(nps, 10), 10);
  assert.equal(controleerAntwoord(nps, '7'), 7);
  assert.equal(controleerAntwoord(rapport, 1), 1);
  assert.equal(controleerAntwoord(rapport, 'weet_niet'), 'weet_niet');
  assert.equal(controleerAntwoord(nps, ''), undefined);
  for (const [q, w] of [[nps, 11], [nps, -1], [nps, 5.5], [nps, 'tien'], [nps, true], [rapport, 0], [rapport, 11], [nps, 'weet_niet'], [nps, [5]]]) {
    assert.throws(() => controleerAntwoord(q, w), (e) => e.status === 400 && e.message === 'Ongeldig antwoord op een cijfervraag.', `${q.schaal_soort} ${JSON.stringify(w)}`);
  }
});

// ---------- Inlezen ----------

test('inlezen: soort cijfer/rapportcijfer/eNPS, antwoorden binnen de schaal en kenmerken herkend aan de tekst', () => {
  const kop = ['Thema', 'Vraag', 'Soort', 'Antwoordmogelijkheden'];
  const rijen = [
    ['Werk', 'Welk rapportcijfer geef je je werk?', 'rapportcijfer', ''],
    ['Werk', 'Hoe waarschijnlijk is het dat je ons aanbeveelt?', 'cijfer 0 tot 10', ''],
    ['Werk', 'Score voor de kantine', 'cijfer', ''],
    ['Werk', 'eNPS', 'eNPS', ''],
    ['Achtergrond', 'Op welke afdeling werk je?', 'meerkeuze', 'Kantoor; Productie'],
    ['Achtergrond', 'Op welke afdeling werkte je?', 'meerkeuze', 'Kantoor; Productie'],
    ['Achtergrond', 'Geef je zelf leiding aan een of meer medewerkers?', 'ja/nee', ''],
    ['Achtergrond', 'Wat is je leeftijd?', 'open', ''],
  ];
  const koppeling = { thema: 0, tekst: 1, soort: 2, opties: 3, verplicht: -1 };
  const r = verwerkVragen(rijen, koppeling, { themas: [{ id: 1, naam: 'Werk' }, { id: 2, naam: 'Achtergrond' }], standaardThema: 1, bestaand: 0, max: 100, kenmerken: ['leidinggevend'] });
  assert.deepEqual(r.items.map((q) => [q.type, q.schaal_soort, q.kenmerk]), [
    ['cijfer', 'rapport', undefined],
    ['cijfer', 'nps', undefined],
    ['cijfer', 'rapport', undefined],
    ['cijfer', 'nps', undefined],
    ['meerkeuze', undefined, 'afdeling'],
    ['meerkeuze', undefined, undefined], // afdeling stond al eerder in het bestand
    ['janee', undefined, undefined], // leidinggevend staat al in de vragenlijst
    ['open', undefined, undefined], // een open vraag krijgt geen kenmerk
  ]);
  assert.deepEqual(r.problemen, []);
  const nps = { id: 1, type: 'cijfer', schaal_soort: 'nps', tekst: 'NPS' };
  const rapport = { id: 2, type: 'cijfer', schaal_soort: 'rapport', weet_niet: 1, tekst: 'Rapport' };
  assert.deepEqual(leesAntwoord(nps, 0, SCHALEN, CIJFERSCHALEN), { waarde: 0 });
  assert.deepEqual(leesAntwoord(nps, '10', SCHALEN, CIJFERSCHALEN), { waarde: 10 });
  assert.deepEqual(leesAntwoord(nps, 11, SCHALEN, CIJFERSCHALEN), { fout: '"11" is geen cijfer van 0 tot 10' });
  assert.deepEqual(leesAntwoord(rapport, 0, SCHALEN, CIJFERSCHALEN), { fout: '"0" is geen cijfer van 1 tot 10' });
  assert.deepEqual(leesAntwoord(rapport, '7,5', SCHALEN, CIJFERSCHALEN), { fout: '"7,5" is geen cijfer van 1 tot 10' });
  assert.deepEqual(leesAntwoord(rapport, 'weet niet', SCHALEN, CIJFERSCHALEN), { waarde: 'weet_niet' });
  assert.equal(leesAntwoord(nps, 'n.v.t.', SCHALEN, CIJFERSCHALEN).waarde, undefined);
  const a = verwerkAntwoorden([[7, 0], [12, 3]], { 1: 0, 2: 1 }, -1, [nps, rapport], SCHALEN, '2026-11-27', { cijferschalen: CIJFERSCHALEN });
  assert.deepEqual(a.items.map((i) => i.antwoorden), [{ 1: 7 }, { 2: 3 }]);
  assert.equal(a.problemen.length, 2);
});

// ---------- Rapport ----------

test('rapport: tabel Cijfervragen in Resultaten (minder dan 5 cijfers niet getoond) en de soort in de bijlage', () => {
  const data = maakExport();
  for (const i of data.inzendingen.filter((x) => x.vragenlijst_id === 20).slice(3)) delete i.antwoorden[205];
  const dashboards = data.vragenlijsten.map((l) => dashboardVan(data, { vragenlijst: l.id }));
  const feiten = verzamelFeiten({ data, dashboards, peildatum: '2027-03-05' });
  const vervolg = feiten.lijsten.find((l) => l.id === 20);
  const klein = vervolg.vragen.find((q) => q.tekst === 'Welk rapportcijfer geef je je werk?');
  assert.deepEqual([klein.verborgen, klein.n, klein.schaal_soort], [true, null, 'rapport']);
  const nul = feiten.lijsten.find((l) => l.id === 10).vragen.find((q) => q.type === 'cijfer' && q.schaal_soort === 'nps');
  assert.deepEqual([nul.n_score, nul.enps.score, nul.enps.promotors], [20, 20, 9]);

  // De feitenblokken staan in een blok 'feiten' per hoofdstuk.
  const plat = (blokken) => blokken.flatMap((b) => (b.soort === 'feiten' ? b.blokken : [b]));
  const tabellen = (lijst) => {
    const inhoud = { ...standaardInhoud('eind'), lijst };
    return plat(rapportNaarBlokken({ titel: 'R', soort: 'eind', inhoud, feiten })).filter((b) => b.soort === 'tabel' && /^Cijfervragen – /.test(b.bijschrift));
  };
  const [t10] = tabellen(10);
  assert.deepEqual(t10.kop, ['Vraag', 'Soort', 'Gemiddelde', 'eNPS', 'Onvoldoende (5 of lager)', 'Cijfers']);
  assert.deepEqual(t10.rijen, [
    ['Welk rapportcijfer geef je je werk?', 'rapportcijfer 1–10', '7,0', '–', '11%', 18],
    ['Hoe waarschijnlijk is het dat je ons als werkgever aanbeveelt?', 'cijfer 0–10', '7,7', '+20', '–', 20],
  ]);
  const [t20] = tabellen(20);
  assert.deepEqual(t20.rijen[0], ['Welk rapportcijfer geef je je werk?', 'rapportcijfer 1–10', 'niet getoond', '–', '–', 'minder dan 5']);
  // Een cijfervraag staat niet nog eens als losse verdeling bij zijn thema.
  const blokken = plat(rapportNaarBlokken({ titel: 'R', soort: 'eind', inhoud: { ...standaardInhoud('eind'), lijst: 10 }, feiten }));
  assert.ok(!blokken.some((b) => b.soort === 'tabel' && /Welk rapportcijfer/.test(b.bijschrift)));
  // Bijlage: de soort van elke vraag.
  const bijlage = blokken.filter((b) => b.soort === 'lijst').flatMap((b) => b.items);
  assert.ok(bijlage.includes('Welk rapportcijfer geef je je werk? (rapportcijfer 1–10)'));
  assert.ok(bijlage.includes('Hoe waarschijnlijk is het dat je ons als werkgever aanbeveelt? (cijfer 0–10)'));
});
