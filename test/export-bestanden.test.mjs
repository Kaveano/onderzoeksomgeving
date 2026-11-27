// Tests voor de export naar Excel, SPSS, Word en de agenda (zonder server: met vaste voorbeeldgegevens).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { excelBladen, excelWerkboek, spssGegevens, spssPakket, stukkenAlsZip, agendaAfspraken, agendaBestand, spssVariabeleNamen } from '../public/js/beheer/export-bestanden.js';
import { leesXlsx, leesZip, leesCsv } from '../public/js/beheer/bestanden.js';
import { volledigeJson } from '../public/js/beheer/export.js';

const SCHALEN = { eens: ['Helemaal mee oneens', 'Mee oneens', 'Neutraal', 'Mee eens', 'Helemaal mee eens'] };
const opties = (lijst) => JSON.stringify(lijst.map(([id, label]) => ({ id, label })));

/** Twee vragenlijsten (nulmeting en een kopie als vervolgmeting) met vijf soorten vragen. */
function voorbeeld() {
  const vragen = [];
  const maak = (vlId, basisId, bron) => {
    const q = (n, extra) => vragen.push({ id: basisId + n, vragenlijst_id: vlId, bron_vraag_id: bron ? 100 + n : null, volgorde: n, verplicht: 0, weet_niet: 0, meerdere_antwoorden: 0, uitsplitsen: 0, schaal_soort: 'eens', opties: '[]', meetpunt_id: null, ...extra });
    q(1, { thema_id: 1, type: 'schaal', tekst: 'Ik kan mijn werk goed aan.', weet_niet: 1 });
    q(2, { thema_id: 1, type: 'schaal', tekst: 'Ik heb genoeg tijd; ook "s avonds".' });
    q(3, { thema_id: 2, type: 'janee', tekst: 'Zou je ons aanbevelen?' });
    q(4, { thema_id: 2, type: 'meerkeuze', tekst: 'Op welke afdeling werk je?', opties: opties([[`a${vlId}`, 'Kantoor'], [`b${vlId}`, 'Productie']]), uitsplitsen: 1 });
    q(5, { thema_id: 2, type: 'meerkeuze', tekst: 'Wat vind je belangrijk?', meerdere_antwoorden: 1, opties: opties([[`x${vlId}`, 'Salaris'], [`y${vlId}`, 'Sfeer'], [`z${vlId}`, 'Vrije tijd']]) });
    q(6, { thema_id: 2, type: 'open', tekst: 'Wat kan beter?' });
  };
  maak(1, 100, false);
  maak(2, 200, true);
  return {
    export: { versie: 1, datum: '2026-11-26' },
    lijsten: { schalen: SCHALEN, vraagtypen: { schaal: 'Schaal 1–5', janee: 'Ja/nee', meerkeuze: 'Meerkeuze', open: 'Open vraag' }, invoersoorten: { cijfer: 'Cijfer', interview: 'Interview' }, actiestatussen: { te_doen: 'Te doen', bezig: 'Bezig', klaar: 'Klaar' } },
    onderzoek: { id: 7, titel: 'MTO 2026', bedrijfsnaam: 'Bakkerij Zoë & Zn.', onderzoeksvraag: 'Hoe gaat het?', status: 'actief' },
    themas: [{ id: 1, naam: 'Werkdruk' }, { id: 2, naam: 'Achtergrond' }],
    meetpunten: [],
    meetmomenten: [{ id: 1, naam: 'Nulmeting', datum: '2026-09-15', omschrijving: 'Eerste meting' }, { id: 2, naam: 'Vervolgmeting', datum: null, omschrijving: '' }],
    vragenlijsten: [{ id: 1, titel: 'Vragenlijst: nul/meting [1]', meetmoment_id: 1 }, { id: 2, titel: 'Vervolg', meetmoment_id: 2 }],
    vragen,
    inzendingen: [
      { vragenlijst_id: 1, datum: '2026-09-16', antwoorden: { 101: 4, 102: 2, 103: 'ja', 104: 'a1', 105: ['x1', 'z1'], 106: 'Meer overleg;\nen "duidelijkheid"' } },
      { vragenlijst_id: 1, datum: '2026-09-17', antwoorden: { 101: 'weet_niet', 102: 5, 103: 'nee', 104: 'b1', 105: [], 106: '=SOM(A1)' } },
      { vragenlijst_id: 1, datum: '2026-09-17', antwoorden: { 101: 3 } },
      { vragenlijst_id: 2, datum: '2027-03-02', antwoorden: { 201: 5, 202: 4, 203: 'ja', 204: 'b2', 205: ['y2'], 206: '' } },
    ],
    eigen_invoer: [{ datum: '2026-10-01', soort: 'cijfer', thema_id: 1, meetpunt_id: null, meetmoment_id: 1, titel: 'Verzuim', waarde: 6.4, eenheid: '%', tekst: '' }],
    stukken: [{ id: 1, titel: 'Bevindingen', soort: 'bevindingen', inhoud: '## Kop\n\nTekst met **vet**.\n\n- punt' }, { id: 2, titel: 'Bevindingen', soort: 'notitie', inhoud: '' }],
    rapporten: [{ id: 1, soort: 'eind', titel: 'Eindrapport', inhoud: '{"secties":[{"id":"a","tekst":"Mijn tekst"}]}' }],
    acties: [
      { id: 1, titel: 'Uitnodiging versturen', status: 'te_doen', datum: '2026-12-01', notitie: 'Via Outlook' },
      { id: 2, titel: 'Al gedaan', status: 'klaar', datum: '2026-11-01', notitie: '' },
      { id: 3, titel: 'Zonder datum', status: 'bezig', datum: null, notitie: '' },
    ],
  };
}

test('Excel-werkboek: tabbladen, antwoorden als getallen en tekst, en terug te lezen', async () => {
  const data = voorbeeld();
  const bladen = excelBladen(data);
  assert.deepEqual(bladen.map((b) => b.naam), ['Overzicht', 'Antwoorden 1', 'Antwoorden 2', 'Scores per thema', 'Codeboek', 'Eigen invoer', 'Acties', 'Meetmomenten']);
  const terug = await leesXlsx(excelWerkboek(data));
  assert.deepEqual(terug.bladen.map((b) => b.naam), bladen.map((b) => b.naam));
  const a1 = terug.bladen[1].rijen;
  assert.deepEqual(a1[0].slice(0, 3), ['Respondent', 'Datum', 'V1. Ik kan mijn werk goed aan.']);
  assert.deepEqual(a1[1], [1, '2026-09-16', 4, 2, 'ja', 'Kantoor', 'Salaris | Vrije tijd', 'Meer overleg;\nen "duidelijkheid"']);
  assert.equal(a1[2][2], 'weet niet / n.v.t.');
  assert.equal(a1[2][7], '=SOM(A1)', 'tekst die op een formule lijkt, blijft tekst');
  assert.equal(a1.length, 4);
  // Scores per thema: (4 + 2 + 5 + 3) / 4 = 3,5 over 3 respondenten
  const scores = terug.bladen[3].rijen;
  assert.deepEqual(scores[1], ['Vragenlijst: nul/meting [1]', 'Nulmeting', 'Werkdruk', 2, 3.5, 3]);
  assert.deepEqual(scores[2], ['Vervolg', 'Vervolgmeting', 'Werkdruk', 2, 4.5, 1]);
  const codeboek = terug.bladen[4].rijen;
  assert.equal(codeboek.length, 13);
  assert.match(codeboek[1][7], /^1 = Helemaal mee oneens; .*; weet niet \/ n\.v\.t\.$/);
  assert.equal(codeboek[5][7], 'Salaris; Sfeer; Vrije tijd (meerdere antwoorden mogelijk)');
  assert.deepEqual(terug.bladen[6].rijen[1], ['Uitnodiging versturen', 'Te doen', '2026-12-01', 'Via Outlook']);
  assert.deepEqual(terug.bladen[5].rijen[1].slice(0, 8), ['2026-10-01', 'Cijfer', 'Werkdruk', null, 'Nulmeting', 'Verzuim', 6.4, '%']);
});

test('SPSS: alle respondenten onder elkaar, dezelfde vraag in dezelfde kolom, met labels en codes', () => {
  const data = voorbeeld();
  const { variabelen, rijen } = spssGegevens(data);
  const namen = variabelen.map((v) => v.naam);
  assert.deepEqual(namen, ['respondent', 'vragenlijst', 'meetmoment', 'datum', 'v01', 'v02', 'v03', 'v04', 'v05_1', 'v05_2', 'v05_3', 'v06', 'thema01']);
  assert.equal(rijen.length, 4);
  // Respondent 1 van de nulmeting
  assert.deepEqual(rijen[0], [1, 1, 1, '2026-09-16', 4, 2, 1, 1, 1, 0, 1, 'Meer overleg;\nen "duidelijkheid"', 3]);
  // weet niet = 99; leeg meerkeuze-antwoord = alles 0; themascore alleen op basis van de geldige antwoorden (1 van 2 = de helft)
  assert.deepEqual(rijen[1].slice(4, 11), [99, 5, 0, 2, 0, 0, 0]);
  assert.equal(rijen[1][12], 5);
  // Niet beantwoord blijft leeg
  assert.deepEqual(rijen[2].slice(5, 12), [null, null, null, null, null, null, '']);
  // De vervolgmeting (gekopieerde vragenlijst met andere optie-id's) komt in dezelfde kolommen en met dezelfde codes
  assert.deepEqual(rijen[3], [1, 2, 2, '2027-03-02', 5, 4, 1, 2, 0, 1, 0, '', 4.5]);
  const v01 = variabelen[4];
  assert.equal(v01.label, 'Werkdruk: Ik kan mijn werk goed aan.');
  assert.equal(v01.waardelabels[99], 'Weet niet / n.v.t.');
  assert.deepEqual(v01.ontbrekend, [99]);
  assert.deepEqual(variabelen[7].waardelabels, { 1: 'Kantoor', 2: 'Productie' });
  assert.equal(variabelen[8].label, 'Achtergrond: Wat vind je belangrijk? – Salaris');
  assert.deepEqual(variabelen[1].waardelabels, { 1: 'Vragenlijst: nul/meting [1]', 2: 'Vervolg' });
  assert.equal(variabelen[11].soort, 'tekst');
  assert.ok(variabelen[11].breedte >= 30);
});

test('SPSS: een hernoemde of toegevoegde antwoordmogelijkheid in een kopie blijft in de juiste kolom', () => {
  const data = voorbeeld();
  // Zoals een echte kopie: dezelfde optie-id's als het origineel; daarna één hernoemd en één toegevoegd
  for (const q of data.vragen.filter((x) => x.vragenlijst_id === 2 && x.type === 'meerkeuze')) {
    const bron = data.vragen.find((x) => x.id === q.id - 100);
    const opties = JSON.parse(bron.opties);
    if (q.meerdere_antwoorden) {
      opties[0].label = 'Salaris en voorwaarden';
      opties.push({ id: 'nieuw', label: 'Thuiswerken' });
    }
    q.opties = JSON.stringify(opties);
  }
  data.inzendingen[3].antwoorden = { 201: 5, 203: 'ja', 204: 'b1', 205: ['x1', 'nieuw'] };
  const { variabelen, rijen } = spssGegevens(data);
  const meer = variabelen.filter((v) => /^v05_/.test(v.naam));
  assert.deepEqual(meer.map((v) => v.label.replace(/^.*– /, '')), ['Salaris / Salaris en voorwaarden', 'Sfeer', 'Vrije tijd', 'Thuiswerken']);
  const k = (naam) => variabelen.findIndex((v) => v.naam === naam);
  assert.deepEqual([rijen[3][k('v05_1')], rijen[3][k('v05_2')], rijen[3][k('v05_4')]], [1, 0, 1]);
  assert.equal(rijen[0][k('v05_4')], null, 'in de nulmeting bestond "Thuiswerken" niet: leeg, niet 0');
  assert.equal(rijen[3][k('v04')], 2, 'zelfde code voor Productie in beide metingen');
});

test('SPSS-pakket: zip met leesmij, gegevens (punt als decimaalteken, geen regeleinden in cellen) en syntax', async () => {
  const pakket = spssPakket(voorbeeld());
  assert.equal(pakket.naam, 'bakkerij-zoe-zn-2026-11-26-spss.zip');
  const zip = await leesZip(pakket.inhoud);
  assert.deepEqual([...zip.keys()], ['LEESMIJ.txt', 'bakkerij-zoe-zn-2026-11-26-gegevens.csv', 'bakkerij-zoe-zn-2026-11-26-syntax.sps']);
  const csv = new TextDecoder().decode(zip.get('bakkerij-zoe-zn-2026-11-26-gegevens.csv'));
  const regels = csv.trimEnd().split('\r\n');
  assert.equal(regels.length, 5, 'één kopregel en vier respondenten: geen regeleinden binnen een cel');
  assert.equal(regels[0], 'respondent;vragenlijst;meetmoment;datum;v01;v02;v03;v04;v05_1;v05_2;v05_3;v06;thema01');
  assert.equal(regels[1], '1;1;1;2026-09-16;4;2;1;1;1;0;1;"Meer overleg; en ""duidelijkheid""";3');
  assert.equal(regels[4], '1;2;2;2027-03-02;5;4;1;2;0;1;0;;4.5');
  assert.deepEqual(leesCsv(csv)[1][11], 'Meer overleg; en "duidelijkheid"');
  const syntax = new TextDecoder().decode(zip.get('bakkerij-zoe-zn-2026-11-26-syntax.sps'));
  assert.match(syntax, /\/FILE='bakkerij-zoe-zn-2026-11-26-gegevens\.csv'/);
  assert.match(syntax, /thema01 F8\.2\./);
  assert.match(syntax, /MISSING VALUES\n {2}v01\n {2}v02 \(99\)\./);
  assert.match(syntax, /v04\n {4}1 'Kantoor'\n {4}2 'Productie'/);
  const leesmij = new TextDecoder().decode(zip.get('LEESMIJ.txt'));
  assert.match(leesmij, /4 rijen, 13 variabelen/);
});

test('stukken als Word-bestanden: één .docx per stuk met unieke namen', async () => {
  const z = stukkenAlsZip(voorbeeld());
  assert.equal(z.naam, 'bakkerij-zoe-zn-stukken-word.zip');
  const zip = await leesZip(z.inhoud);
  assert.deepEqual([...zip.keys()], ['01-bevindingen.docx', '02-bevindingen.docx']);
  const docx = await leesZip(zip.get('01-bevindingen.docx'));
  const xml = new TextDecoder().decode(docx.get('word/document.xml'));
  assert.match(xml, /Bevindingen/);
  assert.match(xml, /<w:b\/>/);
});

test('agenda: meetmomenten en openstaande acties met een datum', () => {
  const data = voorbeeld();
  const afspraken = agendaAfspraken(data);
  assert.deepEqual(afspraken.map((a) => [a.titel, a.datum]), [['Meetmoment Nulmeting – MTO 2026', '2026-09-15'], ['Uitnodiging versturen – MTO 2026', '2026-12-01']]);
  const ics = agendaBestand(data, '2026-11-26T10:00:00Z');
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 2);
  assert.match(ics, /DTSTART;VALUE=DATE:20261201\r\nDTEND;VALUE=DATE:20261202\r\nSUMMARY:Uitnodiging versturen – MTO 2026/);
  assert.match(ics, /UID:actie-1-onderzoek-7@onderzoeksomgeving/);
  assert.doesNotMatch(ics, /Al gedaan|Zonder datum/);
});

test('volledige JSON-export bevat de rapporten met leesbare inhoud', () => {
  const uit = JSON.parse(volledigeJson(voorbeeld()));
  assert.equal(uit.rapporten[0].inhoud.secties[0].tekst, 'Mijn tekst');
  assert.equal(uit.acties.length, 3);
});

test('SPSS-namen: spssVariabeleNamen geeft precies de namen die spssGegevens gebruikt', () => {
  const data = voorbeeld();
  const namen = spssVariabeleNamen(data);
  const { variabelen } = spssGegevens(data);
  assert.deepEqual(namen.systeem, { respondent: 'respondent', vragenlijst: 'vragenlijst', meetmoment: 'meetmoment', datum: 'datum' });
  // Per stamvraag (de kopie in de vervolgmeting heeft dezelfde stam); meerdere antwoorden: per mogelijkheid.
  assert.deepEqual([...namen.vraag.entries()], [[101, 'v01'], [102, 'v02'], [103, 'v03'], [104, 'v04'], [106, 'v06']]);
  // De kopie heeft andere optie-id's met dezelfde tekst: die komen in dezelfde kolom.
  assert.deepEqual([...namen.optie.entries()], [['105:x1', 'v05_1'], ['105:x2', 'v05_1'], ['105:y1', 'v05_2'], ['105:y2', 'v05_2'], ['105:z1', 'v05_3'], ['105:z2', 'v05_3']]);
  assert.deepEqual([...namen.thema.entries()], [[1, 'thema01']]);
  assert.deepEqual([...namen.gebruikt], variabelen.map((v) => v.naam));
  assert.equal(namen.meetpunt.size, 0);
  assert.equal(namen.enps.size, 0);
  // Zonder meetmomenten is er geen variabele meetmoment.
  const zonder = spssVariabeleNamen({ ...data, meetmomenten: [] });
  assert.equal(zonder.systeem.meetmoment, null);
  assert.deepEqual([...zonder.gebruikt], spssGegevens({ ...data, meetmomenten: [] }).variabelen.map((v) => v.naam));
});
