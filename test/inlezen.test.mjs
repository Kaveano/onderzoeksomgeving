// Tests voor het inlezen van Excel- en CSV-bestanden: de leesregels (zonder server) en de opslag op de server.
// Eigen testserver op poort 8795.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  kopEnRijen, herkenKolom, alsGetal, alsDatum, normaal, CIJFER_VELDEN, VRAAG_VELDEN, getalNotatie, isCodekolom,
  verwerkCijfers, verwerkVragen, koppelVragen, leesAntwoord, verwerkAntwoorden, kolomSoort, verdachteKolommen, verwerkDataset,
} from '../public/js/beheer/inlees-regels.js';
import { maakXlsx, leesXlsx, leesCsv } from '../public/js/beheer/bestanden.js';
import { excelBladen } from '../public/js/beheer/export-bestanden.js';

const POORT = 8795;
const BASIS = `http://127.0.0.1:${POORT}`;
const WACHTWOORD = 'test-wachtwoord-voor-tests';
let server;
let map;
let cookie = '';

before(async () => {
  map = mkdtempSync(join(tmpdir(), 'onderzoek-inlezen-'));
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', map], { stdio: 'ignore', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' } });
  server = spawn('npx', ['wrangler', 'dev', '--port', String(POORT), '--ip', '127.0.0.1', '--persist-to', map, '--var', `BEHEER_WACHTWOORD:${WACHTWOORD}`, '--show-interactive-dev-session=false'],
    { stdio: 'ignore', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, detached: true });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASIS}/api/sessie`)).ok) return;
    } catch { /* nog niet klaar */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Testserver start niet');
});

after(() => {
  try { process.kill(-server.pid); } catch { /* al gestopt */ }
  rmSync(map, { recursive: true, force: true });
});

async function roep(pad, { methode = 'GET', body, koekje = cookie } = {}) {
  const r = await fetch(BASIS + pad, {
    method: methode,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(koekje ? { Cookie: koekje } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch { /* geen json */ }
  return { status: r.status, data };
}
const B = '/api/beheer';
const s = {};

// ---------- Leesregels ----------

test('getallen en datums uit cellen', () => {
  assert.equal(alsGetal(7.4), 7.4);
  assert.equal(alsGetal('7,4'), 7.4);
  assert.equal(alsGetal(' 1.234,5 '), 1234.5);
  assert.equal(alsGetal('1,234.5'), 1234.5);
  assert.equal(alsGetal('45%'), 45);
  assert.equal(alsGetal('€ 12,50'), 12.5);
  assert.equal(alsGetal('-3'), -3);
  assert.equal(alsGetal('1.000.000'), 1000000);
  for (const geen of ['', '  ', 'abc', '12 stuks', '1e5', '--1', ',', null, undefined, NaN, Infinity]) assert.equal(alsGetal(geen), null, String(geen));
  assert.equal(alsDatum('2026-11-26'), '2026-11-26');
  assert.equal(alsDatum('2026-11-26 14:30'), '2026-11-26');
  assert.equal(alsDatum('26-11-2026'), '2026-11-26');
  assert.equal(alsDatum('1/2/26'), '2026-02-01');
  assert.equal(alsDatum('26.11.2026'), '2026-11-26');
  assert.equal(alsDatum('3 maart 2027'), '2027-03-03');
  assert.equal(alsDatum('15 okt. 2026'), '2026-10-15');
  for (const geen of ['31-02-2026', '2026-13-01', 'morgen', '', null, 45000, '32/1/2026']) assert.equal(alsDatum(geen), null, String(geen));
  assert.equal(normaal('  Thema: Wérkdruk & balans! '), 'thema werkdruk balans');
});

test('getallen met een punt: per kolom de notatie bepalen, nooit stil een duizendtal als decimaal lezen', () => {
  assert.equal(alsGetal('€ 12.500'), 12500);
  assert.equal(alsGetal('2.000'), 2000);
  assert.equal(alsGetal('12,500'), 12.5);
  assert.equal(alsGetal('12,500', 'en'), 12500);
  assert.equal(alsGetal('2.450', 'en'), 2.45);
  assert.equal(alsGetal('1.5'), 1.5, 'niet drie cijfers achter de punt: altijd een decimaalteken');
  assert.equal(getalNotatie(['€ 2.450', '€ 3.100,50']), 'nl');
  assert.equal(getalNotatie(['2.450', '3.10', '1,234.5']), 'en');
  assert.equal(getalNotatie(['2.450']), 'nl', 'zonder aanwijzing de Nederlandse notatie');
  const salaris = verwerkDataset(['Salaris'], [['€ 2.450'], ['€ 2.800'], ['€ 3.100,50']], [0]);
  assert.deepEqual(salaris.rijen.map((r) => r[0]), [2450, 2800, 3100.5]);
  assert.deepEqual(salaris.problemen, [], 'de notatie is zeker door de cel met komma');
  const twijfel = verwerkDataset(['Bedrag'], [['2.450'], ['2.800']], [0]);
  assert.deepEqual(twijfel.rijen.map((r) => r[0]), [2450, 2800]);
  assert.match(twijfel.problemen[0], /Kolom "Bedrag": getallen als "2\.450" zijn gelezen als 2450 \(met de punt tussen de duizendtallen\)/);
  const engels = verwerkDataset(['Score'], [['2.450'], ['3.10'], ['4.5']], [0]);
  assert.deepEqual(engels.rijen.map((r) => r[0]), [2.45, 3.1, 4.5]);
});

test('totaalrijen worden overgeslagen en regelnummers volgen Excel', () => {
  const { kop, rijen, nummers, totaalrijen } = kopEnRijen([[], ['Naam', 'Datum', 'Waarde'], ['Verzuim', '2026-01-31', 5], [], ['Verzuim', '2026-02-28', 'abc'], ['Totaal', null, 5], ['Gemiddelde:', null, 5]]);
  assert.deepEqual(kop, ['Naam', 'Datum', 'Waarde']);
  assert.equal(rijen.length, 2);
  assert.deepEqual(nummers, [3, 5]);
  assert.deepEqual(totaalrijen, [{ nummer: 6, tekst: 'Totaal' }, { nummer: 7, tekst: 'Gemiddelde:' }]);
  const koppeling = { titel: 0, datum: 1, waarde: 2, eenheid: -1, thema: -1, meetmoment: -1, tekst: -1 };
  const r = verwerkCijfers(rijen, koppeling, { themas: [{ id: 1, naam: 'T' }], meetmomenten: [], standaardThema: 1, nummers, totaalrijen });
  assert.equal(r.items.length, 1);
  assert.match(r.problemen.join('\n'), /Regel 6 \("Totaal"\) lijkt een totaal- of gemiddelderij en is overgeslagen/);
  assert.match(r.problemen.join('\n'), /Regel 5: waarde "abc" is geen getal/, 'het regelnummer zoals in Excel, ook na een lege rij');
  // Een afdeling die "Totaal" in de tweede kolom heeft, is wel een gewone rij
  assert.equal(kopEnRijen([['A', 'B'], ['x', 'Totaal']]).rijen.length, 1);
});

test('kolommen met codes (jaar, teamnummer) kunnen ook als groepen dienen', () => {
  assert.equal(isCodekolom([2025, 2026, 2025, 2026]), true);
  assert.equal(isCodekolom(['1', '2', '1', '2', '1']), true);
  assert.equal(isCodekolom([1.5, 2, 3]), false);
  assert.equal(isCodekolom(Array.from({ length: 30 }, (_, i) => i)), false, 'te veel verschillende waarden');
  assert.equal(isCodekolom([7]), false);
});

test('kopregel: eerste niet-lege rij, lege rijen weg, naamloze en dubbele kolommen', () => {
  const { kop, rijen } = kopEnRijen([[null, null], ['Naam', '', 'Naam', 'Waarde'], [], ['a', null, 'b', 1], [null, ' ', null], ['c']]);
  assert.deepEqual(kop, ['Naam', 'Kolom B', 'Naam (2)', 'Waarde']);
  assert.deepEqual(rijen, [['a', null, 'b', 1], ['c', null, null, null]]);
  assert.deepEqual(kopEnRijen([]), { kop: [], rijen: [], nummers: [], totaalrijen: [] });
  assert.equal(herkenKolom(['Peildatum', 'Naam cijfer', 'Waarde (%)'], CIJFER_VELDEN[1].herken), 0);
  assert.equal(herkenKolom(['x', 'y'], CIJFER_VELDEN[0].herken), -1);
});

test('cijfers: herkennen, omzetten en per regel melden wat niet kan', () => {
  const { kop, rijen } = kopEnRijen([
    ['Datum', 'Naam', 'Waarde', 'Eenheid', 'Thema', 'Meetmoment'],
    ['01-09-2026', 'Verzuim', '6,4', '%', 'werkdruk', 'Nulmeting'],
    ['2026-10-01', 'Verzuim', 5.9, '%', '', ''],
    ['geen datum', 'Verzuim', 5, '%', '', ''],
    ['2026-11-01', '', 'veel', '', 'Onbekend thema', 'Later'],
  ]);
  const koppeling = Object.fromEntries(CIJFER_VELDEN.map((f) => [f.sleutel, herkenKolom(kop, f.herken)]));
  assert.deepEqual(koppeling, { titel: 1, datum: 0, waarde: 2, eenheid: 3, thema: 4, meetmoment: 5, tekst: -1 });
  const context = { themas: [{ id: 1, naam: 'Werkdruk' }, { id: 2, naam: 'Overig' }], meetmomenten: [{ id: 9, naam: 'Nulmeting' }], standaardThema: 2 };
  const { items, problemen } = verwerkCijfers(rijen, koppeling, context);
  assert.deepEqual(items, [
    { titel: 'Verzuim', datum: '2026-09-01', waarde: 6.4, eenheid: '%', thema_id: 1, meetmoment_id: 9, tekst: '' },
    { titel: 'Verzuim', datum: '2026-10-01', waarde: 5.9, eenheid: '%', thema_id: 2, meetmoment_id: null, tekst: '' },
  ]);
  assert.equal(problemen.length, 2);
  assert.match(problemen[0], /^Regel 4: datum "geen datum" niet herkend\. Deze regel wordt overgeslagen\.$/);
  assert.match(problemen[1], /^Regel 5: geen naam; waarde "veel" is geen getal; thema "Onbekend thema" bestaat niet in dit onderzoek; meetmoment "Later" bestaat niet/);
});

test('vragen: soort afleiden, antwoordmogelijkheden splitsen en nieuwe thema\'s melden', () => {
  const { kop, rijen } = kopEnRijen([
    ['Thema', 'Vraag', 'Soort', 'Antwoordmogelijkheden', 'Verplicht'],
    ['Werkdruk', 'Ik kan mijn werk aan.', 'Schaal', '', 'ja'],
    ['werkdruk', 'Heb je pauze?', 'ja/nee', '', ''],
    ['Vitaliteit', 'Hoe kom je naar je werk?', '', 'Fiets; Auto ;OV;fiets', 'nee'],
    ['Vitaliteit', 'Wat kan beter?', 'open vraag', '', ''],
    ['', 'Zonder soort en zonder opties', '', '', ''],
    ['Werkdruk', '', 'schaal', '', ''],
    ['Werkdruk', 'Rare soort', 'matrix', '', ''],
    ['Werkdruk', 'Te weinig keuzes', 'meerkeuze', 'Alleen dit', ''],
  ]);
  const koppeling = Object.fromEntries(VRAAG_VELDEN.map((f) => [f.sleutel, herkenKolom(kop, f.herken)]));
  assert.deepEqual(koppeling, { tekst: 1, thema: 0, soort: 2, opties: 3, verplicht: 4 });
  const r = verwerkVragen(rijen, koppeling, { themas: [{ id: 5, naam: 'Werkdruk' }], standaardThema: 5, bestaand: 0, max: 100 });
  assert.deepEqual(r.items, [
    { tekst: 'Ik kan mijn werk aan.', type: 'schaal', opties: [], verplicht: true, thema: { id: 5 } },
    { tekst: 'Heb je pauze?', type: 'janee', opties: [], verplicht: false, thema: { id: 5 } },
    { tekst: 'Hoe kom je naar je werk?', type: 'meerkeuze', opties: ['Fiets', 'Auto', 'OV'], verplicht: false, thema: { nieuw: 'Vitaliteit' } },
    { tekst: 'Wat kan beter?', type: 'open', opties: [], verplicht: false, thema: { nieuw: 'Vitaliteit' } },
    { tekst: 'Zonder soort en zonder opties', type: 'schaal', opties: [], verplicht: false, thema: { id: 5 } },
  ]);
  assert.deepEqual(r.nieuweThemas, ['Vitaliteit']);
  assert.equal(r.problemen.length, 3);
  assert.match(r.problemen[0], /^Regel 7: geen vraagtekst/);
  assert.match(r.problemen[1], /^Regel 8: soort "matrix" niet herkend/);
  assert.match(r.problemen[2], /^Regel 9: een meerkeuzevraag heeft minstens twee/);
  // Maximum aantal vragen
  const vol = verwerkVragen(rijen, koppeling, { themas: [{ id: 5, naam: 'Werkdruk' }], standaardThema: 5, bestaand: 98, max: 100 });
  assert.equal(vol.items.length, 2);
  assert.match(vol.problemen[0], /Er passen nog 2 vragen/);
  assert.deepEqual(vol.nieuweThemas, [], 'een thema dat alleen bij afgekapte vragen hoort, wordt niet aangemaakt');
});

const VRAGEN = [
  { id: 11, type: 'schaal', tekst: 'Ik kan mijn werk goed aan.', schaal_soort: 'eens', weet_niet: 1 },
  { id: 12, type: 'schaal', tekst: 'Ik heb genoeg tijd.', schaal_soort: 'eens', weet_niet: 0 },
  { id: 13, type: 'janee', tekst: 'Zou je ons aanbevelen?' },
  { id: 14, type: 'meerkeuze', tekst: 'Op welke afdeling werk je?', meerdere_antwoorden: 0, opties: JSON.stringify([{ id: 'oa', label: 'Kantoor' }, { id: 'ob', label: 'Productie' }]) },
  { id: 15, type: 'meerkeuze', tekst: 'Wat vind je belangrijk?', meerdere_antwoorden: 1, opties: [{ id: 'ox', label: 'Salaris' }, { id: 'oy', label: 'Sfeer; plezier' }] },
  { id: 16, type: 'open', tekst: 'Wat kan beter?' },
];
const SCHALEN = { eens: ['Helemaal mee oneens', 'Mee oneens', 'Neutraal', 'Mee eens', 'Helemaal mee eens'] };

test('antwoorden: één cel lezen per soort vraag', () => {
  const lees = (i, cel) => leesAntwoord(VRAGEN[i], cel, SCHALEN);
  assert.deepEqual(lees(0, 4), { waarde: 4 });
  assert.deepEqual(lees(0, '5'), { waarde: 5 });
  assert.deepEqual(lees(0, 'mee eens'), { waarde: 4 });
  assert.deepEqual(lees(0, 'Weet niet / n.v.t.'), { waarde: 'weet_niet' });
  assert.equal(lees(1, 'weet niet').waarde, undefined, 'zonder de optie weet niet telt het als leeg');
  assert.match(lees(0, 6).fout, /geen score van 1 tot 5/);
  assert.match(lees(0, 3.5).fout, /geen score/);
  assert.match(lees(0, 'best wel').fout, /geen score/);
  assert.deepEqual(lees(0, ''), { waarde: undefined });
  assert.deepEqual(lees(2, 'JA'), { waarde: 'ja' });
  assert.deepEqual(lees(2, 'Nee'), { waarde: 'nee' });
  assert.deepEqual(lees(2, 0), { waarde: 'nee' });
  assert.match(lees(2, 'misschien').fout, /geen ja of nee/);
  assert.deepEqual(lees(3, 'productie'), { waarde: 'ob' });
  assert.match(lees(3, 'Magazijn').fout, /geen antwoordmogelijkheid/);
  assert.deepEqual(lees(4, 'Salaris | Sfeer; plezier'), { waarde: ['ox', 'oy'] });
  assert.deepEqual(lees(4, 'Sfeer; plezier'), { waarde: ['oy'] }, 'een hele cel die precies één mogelijkheid is, gaat voor splitsen');
  assert.match(lees(4, 'Salaris | Auto').fout, /"Auto" is geen antwoordmogelijkheid/);
  assert.deepEqual(lees(5, '  Meer overleg  '), { waarde: 'Meer overleg' });
});

test('antwoorden: kolommen koppelen aan vragen en rijen verwerken; namen komen niet mee', () => {
  const { kop, rijen } = kopEnRijen([
    ['Naam medewerker', 'Datum', 'V1. Ik kan mijn werk goed aan.', 'ik heb genoeg tijd', 'Zou je ons aanbevelen?', 'Afdeling', 'V5. Wat vind je belangrijk?', 'V6. Wat kan beter?'],
    ['Jan Jansen', '15-09-2026', 4, 'Neutraal', 'ja', 'Kantoor', 'Salaris', 'Meer overleg'],
    ['Piet', '', 'weet niet', 9, 'soms', 'Productie', '', ''],
    ['Niemand', '2026-09-16', '', '', '', '', '', ''],
    ['Kees', '01-01-2099', 2, 2, 'nee', 'productie', 'Sfeer; plezier | Salaris', '=1+1'],
  ]);
  const { koppeling, datum } = koppelVragen(kop, VRAGEN);
  assert.deepEqual(koppeling, { 11: 2, 12: 3, 13: 4, 15: 6, 16: 7 }, '"Afdeling" is niet vanzelf te koppelen');
  assert.equal(datum, 1);
  koppeling[14] = 5; // de gebruiker koppelt die kolom zelf
  const r = verwerkAntwoorden(rijen, koppeling, datum, VRAGEN, SCHALEN, '2026-11-26');
  assert.deepEqual(r.items, [
    { datum: '2026-09-15', antwoorden: { 11: 4, 12: 3, 13: 'ja', 14: 'oa', 15: ['ox'], 16: 'Meer overleg' } },
    { datum: '2026-11-26', antwoorden: { 11: 'weet_niet', 14: 'ob' } },
    { datum: '2026-11-26', antwoorden: { 11: 2, 12: 2, 13: 'nee', 14: 'ob', 15: ['oy', 'ox'], 16: '=1+1' } },
  ]);
  assert.doesNotMatch(JSON.stringify(r.items), /Jan|Piet|Kees/, 'de kolom met namen wordt nergens bewaard');
  assert.equal(r.overgeslagen, 1);
  assert.equal(r.problemen.length, 4);
  assert.match(r.problemen[0], /^Regel 5: de datum ligt in de toekomst/);
  assert.match(r.problemen.join('\n'), /"Ik heb genoeg tijd\.": één antwoord is niet herkend en blijft leeg \(regel 3; bijvoorbeeld: "9" is geen score van 1 tot 5\)/);
  assert.match(r.problemen.join('\n'), /"Zou je ons aanbevelen\?": één antwoord is niet herkend/);
  assert.match(r.problemen[3], /^Eén regel heeft geen enkel bruikbaar antwoord en wordt overgeslagen\.$/);
});

test('onze eigen Excel-export is weer in te lezen als antwoorden', async () => {
  const opties = (l) => JSON.stringify(l.map(([id, label]) => ({ id, label })));
  const data = {
    export: { datum: '2026-11-26' }, lijsten: { schalen: SCHALEN, vraagtypen: {}, invoersoorten: {}, actiestatussen: {} },
    onderzoek: { titel: 'T', bedrijfsnaam: 'B', onderzoeksvraag: '', status: 'actief' },
    themas: [{ id: 1, naam: 'Thema' }], meetpunten: [], meetmomenten: [], eigen_invoer: [], acties: [],
    vragenlijsten: [{ id: 1, titel: 'Lijst', meetmoment_id: null }],
    vragen: [
      { id: 11, vragenlijst_id: 1, thema_id: 1, type: 'schaal', tekst: 'Ik kan mijn werk goed aan.', schaal_soort: 'eens', weet_niet: 1, opties: '[]' },
      { id: 14, vragenlijst_id: 1, thema_id: 1, type: 'meerkeuze', tekst: 'Wat vind je belangrijk?', meerdere_antwoorden: 1, opties: opties([['ox', 'Salaris'], ['oy', 'Sfeer']]) },
      { id: 13, vragenlijst_id: 1, thema_id: 1, type: 'janee', tekst: 'Aanbevelen?', opties: '[]' },
    ],
    inzendingen: [
      { vragenlijst_id: 1, datum: '2026-09-15', antwoorden: { 11: 5, 14: ['ox', 'oy'], 13: 'nee' } },
      { vragenlijst_id: 1, datum: '2026-09-16', antwoorden: { 11: 'weet_niet', 13: 'ja' } },
    ],
  };
  const terug = await leesXlsx(maakXlsx(excelBladen(data)));
  const blad = terug.bladen.find((b) => b.naam === 'Antwoorden 1');
  const { kop, rijen } = kopEnRijen(blad.rijen);
  const vragen = data.vragen;
  const { koppeling, datum } = koppelVragen(kop, vragen);
  assert.deepEqual(koppeling, { 11: 2, 14: 3, 13: 4 });
  const r = verwerkAntwoorden(rijen, koppeling, datum, vragen, SCHALEN, '2026-11-26');
  assert.deepEqual(r.items, data.inzendingen.map((i) => ({ datum: i.datum, antwoorden: i.antwoorden })));
  assert.deepEqual(r.problemen, []);
});

test('dataset: soort per kolom, getallen met komma, waarschuwing voor persoonsgegevens', () => {
  const csv = 'Afdeling;Verzuim %;Leeftijd;Opmerking;E-mail\r\nKantoor;4,5;34;Prima;a@b.nl\r\nProductie;7,25;51;;c@d.nl\r\nKantoor;n.b.;29;Lang verhaal;e@f.nl\r\nLogistiek;6;45;x;g@h.nl\r\n;;;;\r\n';
  const { kop, rijen } = kopEnRijen(leesCsv(csv));
  assert.deepEqual(kop, ['Afdeling', 'Verzuim %', 'Leeftijd', 'Opmerking', 'E-mail']);
  assert.equal(rijen.length, 4);
  assert.equal(kolomSoort(rijen.map((r) => r[0])), 'categorie');
  assert.equal(kolomSoort(rijen.map((r) => r[2])), 'getal');
  assert.equal(kolomSoort(rijen.map((r) => r[4])), 'tekst');
  assert.equal(kolomSoort([null, '']), 'leeg');
  assert.deepEqual(verdachteKolommen(kop), ['E-mail']);
  assert.deepEqual(verdachteKolommen(['Naam', 'Personeelsnummer', 'Afdeling', 'Naamgeving']), ['Naam', 'Personeelsnummer']);
  const persoon = ['E-mailadres', 'Emailadres', 'Mailadres', 'Telefoonnummer', 'Tel.', 'Medewerkersnummer', 'Personeelsnr.', 'Volledige naam', 'Roepnaam', 'Woonplaats', 'Geb. datum', 'Zakelijk e-mailadres'];
  assert.deepEqual(verdachteKolommen(persoon), persoon);
  assert.deepEqual(verdachteKolommen(['Afdeling', 'Verzuim %', 'Leeftijd', 'Functie', 'Aantal medewerkers', 'Teamnaam', 'Ordernummer', 'Datum in dienst', 'Kostenplaats']), []);
  assert.deepEqual(verdachteKolommen(['Kolom A', 'Kolom B', 'Kolom C'], [['jan@x.nl', '06-12345678', 'Kantoor'], ['piet@y.com', '+31 6 1234 5678', 'Productie']]), ['Kolom A', 'Kolom B'], 'ook op de inhoud');
  // "Verzuim %" heeft 3 van de 4 als getal: geen 90%, dus geen getalkolom; met alleen getallen wel
  const d = verwerkDataset(kop, rijen, [0, 2]);
  assert.deepEqual(d, { kolommen: ['Afdeling', 'Leeftijd'], rijen: [['Kantoor', 34], ['Productie', 51], ['Kantoor', 29], ['Logistiek', 45]], soorten: ['categorie', 'getal'], problemen: [] });
  const veel = Array.from({ length: 30 }, (_, i) => [i % 2 ? 'A' : 'B', i === 3 ? 'onbekend' : `${i},5`]);
  const g = verwerkDataset(['Groep', 'Score'], veel, [0, 1], { maxRijen: 20 });
  assert.equal(g.soorten[1], 'getal');
  assert.equal(g.rijen[0][1], 0.5);
  assert.equal(g.rijen[3][1], null);
  assert.equal(g.rijen.length, 20);
  assert.match(g.problemen[0], /Kolom "Score": één cel is geen getal en blijft leeg/);
  assert.match(g.problemen[1], /alleen de eerste 20 worden bewaard/);
});

// ---------- Server ----------

test('voorbereiding: onderzoek met een vragenlijst', async () => {
  const li = await fetch(`${BASIS}/api/inloggen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wachtwoord: WACHTWOORD }) });
  cookie = li.headers.get('set-cookie').split(';')[0];
  const n = await roep(`${B}/onderzoeken`, { methode: 'POST', body: { bedrijfsnaam: 'Inleesbedrijf', titel: 'Onderzoek' } });
  s.onderzoek = n.data.id;
  const t = await roep(`${B}/onderzoeken/${s.onderzoek}/themas`, { methode: 'POST', body: { naam: 'Werkdruk' } });
  s.thema = t.data.id;
  const ander = await roep(`${B}/onderzoeken`, { methode: 'POST', body: { bedrijfsnaam: 'Ander', titel: 'Ander' } });
  s.ander = ander.data.id;
  s.anderThema = (await roep(`${B}/onderzoeken/${s.ander}/themas`, { methode: 'POST', body: { naam: 'Vreemd' } })).data.id;
  const detail = (await roep(`${B}/onderzoeken/${s.onderzoek}`)).data;
  s.meetmoment = detail.meetmomenten[0].id;
  const vl = await roep(`${B}/onderzoeken/${s.onderzoek}/vragenlijsten`, { methode: 'POST', body: { titel: 'Lijst' } });
  s.vl = vl.data.id;
});

test('cijfers in één keer inlezen: alles of niets, met het regelnummer bij een fout', async () => {
  const pad = `${B}/onderzoeken/${s.onderzoek}/invoer/reeks`;
  assert.equal((await roep(pad, { methode: 'POST', body: { items: [] }, koekje: '' })).status, 401);
  assert.equal((await roep(pad, { methode: 'POST', body: { items: [] } })).status, 400);
  const items = Array.from({ length: 25 }, (_, i) => ({ titel: 'Verzuim', datum: `2026-${String((i % 12) + 1).padStart(2, '0')}-01`, waarde: 4 + i / 10, eenheid: '%', thema_id: s.thema, meetmoment_id: i === 0 ? s.meetmoment : null }));
  const fout = await roep(pad, { methode: 'POST', body: { items: [...items, { titel: 'Kapot', datum: '2026-01-01', waarde: 'veel', thema_id: s.thema }] } });
  assert.equal(fout.status, 400);
  assert.match(fout.data.fout, /^Regel 26: Waarde moet een getal zijn\.$/);
  assert.equal((await roep(`${B}/onderzoeken/${s.onderzoek}/invoer`)).data.invoer.length, 0, 'bij een fout wordt niets opgeslagen');
  const vreemd = await roep(pad, { methode: 'POST', body: { items: [{ titel: 'X', datum: '2026-01-01', waarde: 1, thema_id: s.anderThema }] } });
  assert.match(vreemd.data.fout, /^Regel 1: Kies een thema van dit onderzoek\.$/);
  const goed = await roep(pad, { methode: 'POST', body: { items } });
  assert.equal(goed.status, 201);
  assert.equal(goed.data.aantal, 25);
  const invoer = (await roep(`${B}/onderzoeken/${s.onderzoek}/invoer`)).data.invoer;
  assert.equal(invoer.length, 25);
  assert.ok(invoer.every((e) => e.soort === 'cijfer' && e.titel === 'Verzuim'));
  assert.equal((await roep(pad, { methode: 'POST', body: { items: Array.from({ length: 301 }, () => items[0]) } })).status, 400);
});

test('vragen inlezen: gecontroleerd als gewone vragen, achteraan toegevoegd', async () => {
  const pad = `${B}/vragenlijsten/${s.vl}/vragen/reeks`;
  const vragen = [
    { thema_id: s.thema, type: 'schaal', tekst: 'Ik kan mijn werk goed aan.', weet_niet: true },
    { thema_id: s.thema, type: 'schaal', tekst: 'Ik heb genoeg tijd.' },
    { thema_id: s.thema, type: 'janee', tekst: 'Zou je ons aanbevelen?' },
    { thema_id: s.thema, type: 'meerkeuze', tekst: 'Op welke afdeling werk je?', opties: ['Kantoor', 'Productie'] },
    { thema_id: s.thema, type: 'meerkeuze', tekst: 'Wat vind je belangrijk?', opties: ['Salaris', 'Sfeer'], meerdere_antwoorden: true },
    { thema_id: s.thema, type: 'open', tekst: 'Wat kan beter?' },
  ];
  const fout = await roep(pad, { methode: 'POST', body: { vragen: [...vragen, { thema_id: s.thema, type: 'meerkeuze', tekst: 'Te weinig', opties: ['Eén'] }] } });
  assert.equal(fout.status, 400);
  assert.match(fout.data.fout, /^Regel 7: Geef minimaal twee antwoordmogelijkheden op\.$/);
  assert.match((await roep(pad, { methode: 'POST', body: { vragen: [{ thema_id: s.anderThema, type: 'open', tekst: 'x' }] } })).data.fout, /Regel 1: Kies een thema van dit onderzoek/);
  const goed = await roep(pad, { methode: 'POST', body: { vragen } });
  assert.equal(goed.status, 201);
  s.vragen = (await roep(`${B}/vragenlijsten/${s.vl}`)).data.vragen;
  assert.deepEqual(s.vragen.map((q) => q.tekst), vragen.map((q) => q.tekst));
  assert.deepEqual(s.vragen.map((q) => q.volgorde), [1, 2, 3, 4, 5, 6]);
  assert.equal(s.vragen[0].weet_niet, true);
  assert.match(s.vragen[3].opties[0].id, /^o[a-z0-9]{6}$/);
  // Het maximum van 100 vragen geldt ook hier
  const veel = Array.from({ length: 95 }, (_, i) => ({ thema_id: s.thema, type: 'open', tekst: `Vraag ${i}` }));
  const vol = await roep(pad, { methode: 'POST', body: { vragen: veel } });
  assert.equal(vol.status, 409);
  assert.match(vol.data.fout, /je kunt er nog 94 inlezen/);
});

test('antwoorden inlezen: zelfde controle als bij invullen, alleen antwoorden en datum bewaard', async () => {
  const pad = `${B}/vragenlijsten/${s.vl}/inzendingen/reeks`;
  const [q1, q2, q3, q4, q5, q6] = s.vragen;
  const goed = { datum: '2026-09-15', naam: 'Jan Jansen', email: 'jan@voorbeeld.nl', antwoorden: { [q1.id]: 4, [q2.id]: 3, [q3.id]: 'ja', [q4.id]: q4.opties[0].id, [q5.id]: [q5.opties[1].id], [q6.id]: 'Meer overleg', 999999: 'onbekende vraag' } };
  const r = await roep(pad, { methode: 'POST', body: { inzendingen: [goed, { antwoorden: { [q1.id]: 'weet_niet' } }, { datum: '2026-09-16', antwoorden: { [q1.id]: 9 } }] } });
  assert.equal(r.status, 400);
  assert.match(r.data.fout, /^Regel 3: Ongeldig antwoord op een schaalvraag\. \(vraag: "Ik kan mijn werk goed aan\."\)$/);
  assert.match((await roep(pad, { methode: 'POST', body: { inzendingen: [{ datum: '2099-01-01', antwoorden: { [q1.id]: 3 } }] } })).data.fout, /Regel 1: De datum ligt in de toekomst/);
  assert.match((await roep(pad, { methode: 'POST', body: { inzendingen: [{ antwoorden: { 999999: 'x' } }] } })).data.fout, /Regel 1: Deze respondent heeft geen enkel geldig antwoord/);
  assert.match((await roep(pad, { methode: 'POST', body: { inzendingen: [{ antwoorden: { [q4.id]: 'Kantoor' } }] } })).data.fout, /Regel 1: Ongeldig antwoord op een meerkeuzevraag/);
  const zes = Array.from({ length: 6 }, (_, i) => ({ datum: '2026-09-17', antwoorden: { [q1.id]: (i % 5) + 1, [q3.id]: i % 2 ? 'ja' : 'nee' } }));
  const ok = await roep(pad, { methode: 'POST', body: { inzendingen: [goed, { antwoorden: { [q1.id]: 'weet_niet' } }, ...zes] } });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.aantal, 8);
  const exp = (await roep(`${B}/onderzoeken/${s.onderzoek}/export/data`)).data;
  assert.equal(exp.inzendingen.length, 8);
  assert.doesNotMatch(JSON.stringify(exp.inzendingen), /Jan Jansen|voorbeeld\.nl|onbekende vraag/);
  assert.deepEqual(Object.keys(exp.inzendingen[0]).sort(), ['antwoorden', 'datum', 'vragenlijst_id']);
  const eerste = exp.inzendingen.find((i) => i.datum === '2026-09-15');
  assert.deepEqual(eerste.antwoorden, { [q1.id]: 4, [q2.id]: 3, [q3.id]: 'ja', [q4.id]: q4.opties[0].id, [q5.id]: [q5.opties[1].id], [q6.id]: 'Meer overleg' });
  // Het dashboard telt de ingelezen antwoorden mee
  const d = (await roep(`${B}/onderzoeken/${s.onderzoek}/dashboard?vragenlijst=${s.vl}`)).data;
  assert.equal(d.selectie.n, 8);
  // Het ingestelde maximum aantal inzendingen geldt ook bij inlezen
  await roep(`${B}/vragenlijsten/${s.vl}`, { methode: 'PUT', body: { titel: 'Lijst', max_inzendingen: 9 } });
  const teveel = await roep(pad, { methode: 'POST', body: { inzendingen: zes } });
  assert.equal(teveel.status, 409);
});

test('eigen dataset: opslaan, teruglezen, begrenzen en verwijderen', async () => {
  const pad = `${B}/onderzoeken/${s.onderzoek}/datasets`;
  const body = { naam: 'Verzuim per afdeling', kolommen: ['Afdeling', 'Verzuim', 'Opmerking'], rijen: [['Kantoor', 4.5, 'x'], ['Productie', 7.25, null], ['Kantoor', '', '  spatie  '], ['Logistiek', 6, true]] };
  assert.equal((await roep(pad, { methode: 'POST', body, koekje: '' })).status, 401);
  assert.equal((await roep(pad, { methode: 'POST', body: { ...body, naam: '' } })).status, 400);
  assert.match((await roep(pad, { methode: 'POST', body: { ...body, kolommen: ['A', 'a', 'B'] } })).data.fout, /komt twee keer voor/);
  assert.match((await roep(pad, { methode: 'POST', body: { ...body, rijen: [['te', 'kort']] } })).data.fout, /Rij 1 heeft niet evenveel cellen/);
  assert.match((await roep(pad, { methode: 'POST', body: { ...body, rijen: [[{ a: 1 }, 1, 2]] } })).data.fout, /Rij 1 bevat een ongeldige cel/);
  assert.equal((await roep(pad, { methode: 'POST', body: { ...body, kolommen: Array.from({ length: 41 }, (_, i) => `k${i}`) } })).status, 400);
  assert.equal((await roep(pad, { methode: 'POST', body: { naam: 'Groot', kolommen: ['a'], rijen: Array.from({ length: 2001 }, () => [1]) } })).status, 400);
  const r = await roep(pad, { methode: 'POST', body });
  assert.equal(r.status, 201);
  const lijst = (await roep(pad)).data.datasets;
  assert.deepEqual(lijst.map((d) => [d.naam, d.kolommen, d.aantal_rijen]), [['Verzuim per afdeling', ['Afdeling', 'Verzuim', 'Opmerking'], 4]]);
  const d = (await roep(`${B}/datasets/${r.data.id}`)).data.dataset;
  assert.equal(d.naam, 'Verzuim per afdeling');
  assert.deepEqual(d.rijen, [['Kantoor', 4.5, 'x'], ['Productie', 7.25, null], ['Kantoor', null, 'spatie'], ['Logistiek', 6, 'ja']]);
  assert.equal((await roep(`${B}/datasets/${r.data.id}`, { koekje: '' })).status, 401);
  // Maximaal 10 datasets
  for (let i = 0; i < 9; i++) assert.equal((await roep(pad, { methode: 'POST', body: { naam: `D${i}`, kolommen: ['a'], rijen: [[i]] } })).status, 201);
  assert.equal((await roep(pad, { methode: 'POST', body: { naam: 'Elfde', kolommen: ['a'], rijen: [[1]] } })).status, 409);
  assert.equal((await roep(`${B}/datasets/${r.data.id}`, { methode: 'DELETE' })).status, 200);
  assert.equal((await roep(`${B}/datasets/${r.data.id}`)).status, 404);
});

test('na archiveren kan er niets meer worden ingelezen; verwijderen ruimt datasets op', async () => {
  await roep(`${B}/onderzoeken/${s.onderzoek}/archiveren`, { methode: 'POST', body: {} });
  assert.equal((await roep(`${B}/onderzoeken/${s.onderzoek}/invoer/reeks`, { methode: 'POST', body: { items: [{ titel: 'X', datum: '2026-01-01', waarde: 1, thema_id: s.thema }] } })).status, 409);
  assert.equal((await roep(`${B}/vragenlijsten/${s.vl}/vragen/reeks`, { methode: 'POST', body: { vragen: [{ thema_id: s.thema, type: 'open', tekst: 'x' }] } })).status, 409);
  assert.equal((await roep(`${B}/vragenlijsten/${s.vl}/inzendingen/reeks`, { methode: 'POST', body: { inzendingen: [{ antwoorden: { [s.vragen[0].id]: 3 } }] } })).status, 409);
  assert.equal((await roep(`${B}/onderzoeken/${s.onderzoek}/datasets`, { methode: 'POST', body: { naam: 'N', kolommen: ['a'], rijen: [[1]] } })).status, 409);
  const over = (await roep(`${B}/onderzoeken/${s.onderzoek}/datasets`)).data.datasets;
  assert.equal(over.length, 9);
  assert.equal((await roep(`${B}/datasets/${over[0].id}`, { methode: 'DELETE' })).status, 409);
  assert.equal((await roep(`${B}/onderzoeken/${s.onderzoek}`, { methode: 'DELETE', body: { bevestiging: 'Inleesbedrijf' } })).status, 200);
  assert.equal((await roep(`${B}/datasets/${over[0].id}`)).status, 404);
});
