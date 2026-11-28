// Tests voor bibliotheek-bestanden.js (BOUWPLAN §4 P5, criteria 4 en 6): RIS heen en terug met de zeven
// gouden bronnen, de voorbeeldbestanden uit Zotero en EndNote, eigen notities alleen met de optie, het
// Excel-overzicht en de literatuurlijst voor Word. Zuiver: geen server nodig.
// Uitvoeren: node --test test/bibliotheek-bestanden.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { naarRis, leesRis, leesTekstBestand, bibliotheekBladen, literatuurBlokken } from '../public/js/beheer/bibliotheek-bestanden.js';
import { apaVerwijzing, legeBron, paginaStreep } from '../public/js/beheer/bibliotheek-regels.js';
import { maakXlsx, leesXlsx, maakDocx, leesZip } from '../public/js/beheer/bestanden.js';
import { GOUDEN } from './fixtures/bibliotheek-gouden.mjs';

const fixture = (naam) => readFileSync(fileURLToPath(new URL(`./fixtures/${naam}`, import.meta.url)));

/** Een gouden bron zoals hij uit de database zou komen (alle velden, met inhoud). */
function volledig(b, extra = {}) {
  return {
    ...legeBron(b.soort), ...b, details: { ...(b.details || {}) }, auteurs: b.auteurs || [],
    onderwerpen: ['werkdruk'], trefwoorden: ['JD-R-model', 'bevlogenheid'], samenvatting: 'Een korte samenvatting.',
    kernpunten: ['Eerste punt', 'Tweede punt'], notities: 'Geheime eigen notitie', ...extra,
  };
}

/** De velden die RIS heen en terug moet bewaren. */
function velden(b) {
  const d = { ...(b.details || {}) };
  if (d.paginas) d.paginas = paginaStreep(d.paginas);
  return {
    soort: b.soort, titel: b.titel, auteurs: b.auteurs, organisatie: b.organisatie || '', afkorting: b.afkorting || '', jaar: b.jaar ?? null,
    taal: b.taal, url: b.url || '', doi: b.doi || '', details: d, onderwerpen: b.onderwerpen, trefwoorden: b.trefwoorden,
    samenvatting: b.samenvatting, kernpunten: b.kernpunten,
  };
}

test('criterium 4: RIS heen en terug geeft dezelfde zeven gouden bronnen (zonder notities)', () => {
  const bronnen = Object.values(GOUDEN).map((b) => volledig(b));
  const ris = naarRis(bronnen);
  assert.ok(ris.includes('\r\n') && !ris.startsWith('﻿'));
  const { bronnen: terug, meldingen } = leesRis(ris);
  assert.deepEqual(meldingen, []);
  assert.equal(terug.length, bronnen.length);
  terug.forEach((b, i) => {
    assert.deepEqual(velden(b), velden(bronnen[i]), bronnen[i].titel);
    assert.equal(apaVerwijzing(b), apaVerwijzing(bronnen[i]));
    assert.equal(b.notities, '');
  });
});

test('besluit 6a (P7): namen met een voorvoegsel blijven gelijk in RIS heen en terug', () => {
  const p = (achternaam, voorletters, tussenvoegsel = '') => ({ achternaam, tussenvoegsel, voorletters });
  const auteurs = [p('Heuvel', 'S. G.', 'van den'), p('De Witte', 'H.'), p('Ancona', 'J.', "d'"), p('Vroome', 'E. M. M.', 'de')];
  const b = volledig({ ...GOUDEN.bakker, auteurs, details: { ...GOUDEN.bakker.details, redacteuren: undefined } });
  delete b.details.redacteuren;
  const ris = naarRis([b]);
  assert.ok(ris.includes('AU  - De Witte, H.\r\n') && ris.includes('AU  - Vroome, E. M. M. de\r\n') && ris.includes("AU  - Ancona, J. d'\r\n"), ris);
  const [terug] = leesRis(ris).bronnen;
  assert.deepEqual(terug.auteurs, auteurs);
  assert.equal(apaVerwijzing(terug).slice(0, 77), "Heuvel, S. G. van den, De Witte, H., Ancona, J. d', & Vroome, E. M. M. de. (2");
  // Zotero schrijft een Vlaamse naam met een hoofdletter en een Nederlandse met een kleine letter
  const zotero = 'TY  - JOUR\r\nTI  - Titel\r\nAU  - De Witte, Hans\r\nAU  - van der Klink, J. J. L.\r\nPY  - 2020\r\nER  - \r\n';
  assert.deepEqual(leesRis(zotero).bronnen[0].auteurs, [p('De Witte', 'H.'), p('Klink', 'J. J. L.', 'van der')]);
});

test('criterium 6: eigen notities staan alleen in RIS met de optie', () => {
  const b = volledig(GOUDEN.bakker);
  assert.ok(!naarRis([b]).includes('Geheime eigen notitie'));
  const met = naarRis([b], { metNotities: true });
  assert.ok(met.includes('Geheime eigen notitie'));
  assert.equal(leesRis(met).bronnen[0].notities, 'Geheime eigen notitie');
  // In Excel wel (eigen overzicht), behalve als je het uitzet.
  assert.ok(JSON.stringify(bibliotheekBladen([b])).includes('Geheime eigen notitie'));
  assert.ok(!JSON.stringify(bibliotheekBladen([b], { metNotities: false })).includes('Geheime eigen notitie'));
  // De literatuurlijst voor Word nooit.
  assert.ok(!JSON.stringify(literatuurBlokken([b])).includes('Geheime'));
});

test('criterium 4: het voorbeeldbestand uit Zotero', () => {
  const { bronnen, meldingen } = leesRis(leesTekstBestand(fixture('zotero-export.ris')));
  assert.deepEqual(meldingen, []);
  assert.equal(bronnen.length, 2);
  const [a, boek] = bronnen;
  assert.equal(a.soort, 'artikel');
  assert.equal(a.titel, 'Werkdruk en herstel bij verpleegkundigen: een dagboekstudie');
  assert.deepEqual(a.auteurs, [
    { achternaam: 'Hendriks', tussenvoegsel: '', voorletters: 'M.' },
    { achternaam: 'Dijk', tussenvoegsel: 'van', voorletters: 'P. J.' },
    { achternaam: 'Oosterhout', tussenvoegsel: 'de', voorletters: 'K.' },
  ]);
  assert.equal(a.jaar, 2022);
  assert.equal(a.doi, '10.5117/tva2022.2.004.hend', 'het voorvoegsel https://doi.org/ is eraf');
  assert.equal(a.url, 'https://example.org/tva/2022/hendriks');
  assert.deepEqual(a.details, { tijdschrift: 'Tijdschrift voor Arbeidsvraagstukken', jaargang: '38', nummer: '2', paginas: '145–163', datum: '2022-06' });
  assert.ok(a.samenvatting.startsWith('In deze verzonnen studie') && a.samenvatting.includes('tien werkdagen lang een korte vragenlijst. Wie meer werkdruk'),
    'de vervolgregel van AB hoort bij de samenvatting');
  assert.deepEqual(a.onderwerpen, ['werkdruk'], 'een trefwoord gelijk aan een onderwerp wordt dat onderwerp');
  assert.deepEqual(a.trefwoorden, ['werkdruk', 'herstel']);
  assert.equal(a.taal, 'nl');
  assert.equal(a.notities, 'Verzonnen record voor de tests van de Onderzoeksomgeving.');
  assert.equal(apaVerwijzing(a),
    'Hendriks, M., Dijk, P. J. van, & Oosterhout, K. de. (2022). Werkdruk en herstel bij verpleegkundigen: een dagboekstudie. *Tijdschrift voor Arbeidsvraagstukken, 38*(2), 145–163. https://doi.org/10.5117/tva2022.2.004.hend');
  assert.equal(boek.soort, 'boek');
  assert.equal(boek.details.druk, '2');
  assert.equal(boek.details.uitgever, 'Uitgeverij Voorbeeld');
  assert.equal(apaVerwijzing(boek), 'Jansen, A. (2020). *Goed begonnen: onboarding in de praktijk* (2e dr.). Uitgeverij Voorbeeld.');
});

test('criterium 4: het voorbeeldbestand uit EndNote (organisatie als auteur, A1, Y2, onbekend type, geen titel)', () => {
  const { bronnen, meldingen } = leesRis(leesTekstBestand(fixture('endnote-export.ris')));
  assert.equal(bronnen.length, 2);
  assert.deepEqual(meldingen, ['Regel 20: geen titel; overgeslagen.']);
  const [r, onbekend] = bronnen;
  assert.equal(r.soort, 'rapport');
  assert.deepEqual(r.auteurs, []);
  assert.equal(r.organisatie, 'Kenniscentrum Arbeid en Gezondheid');
  assert.equal(r.jaar, 2024);
  assert.deepEqual(r.details, { uitgever: 'Kenniscentrum Arbeid en Gezondheid', rapportnummer: 'KAG-2024-07', geraadpleegd: '2026-11-20' });
  assert.deepEqual(r.trefwoorden, ['verzuim', 'mkb']);
  assert.deepEqual(r.onderwerpen, []);
  assert.ok(r.samenvatting.startsWith('Verzonnen monitor'));
  assert.equal(apaVerwijzing(r),
    'Kenniscentrum Arbeid en Gezondheid. (2024). *Monitor verzuim in het mkb 2024* (Rapportnr. KAG-2024-07). Geraadpleegd op 20 november 2026, van https://example.org/kag/monitor-verzuim-2024');
  assert.equal(onbekend.soort, 'overig', 'een onbekend type wordt overig');
  assert.deepEqual(onbekend.auteurs, [{ achternaam: 'Smit', tussenvoegsel: '', voorletters: 'J.' }]);
});

test('RIS: geen bronnen, en een te lange samenvatting', () => {
  assert.deepEqual(leesRis('Dit is geen RIS').bronnen, []);
  assert.equal(leesRis('Dit is geen RIS').meldingen.length, 1);
  const lang = naarRis([volledig(GOUDEN.cbs, { samenvatting: 'x'.repeat(4500) })]);
  const r = leesRis(lang);
  assert.equal(r.bronnen[0].samenvatting.length, 4000);
  assert.ok(r.meldingen[0].includes('ingekort'));
});

test('tekstbestand: UTF-8, anders windows-1252', () => {
  assert.equal(leesTekstBestand(new TextEncoder().encode('﻿Café')), 'Café');
  assert.equal(leesTekstBestand(new Uint8Array([0x43, 0x61, 0x66, 0xe9])), 'Café');
});

test('Excel-overzicht: twee bladen, leesbaar met leesXlsx', async () => {
  const bronnen = Object.values(GOUDEN).map((b) => volledig(b, { collectie: b.citeersleutel === 'cbs2024' ? 'start' : 'eigen', onderzoeken: [3] }));
  const bladen = bibliotheekBladen(bronnen, { onderzoeken: { 3: 'Medewerkersonderzoek 2026' } });
  assert.deepEqual(bladen.map((b) => b.naam), ['Bronnen', 'Uitleg']);
  const { bladen: terug } = await leesXlsx(maakXlsx(bladen));
  const [kop, ...rijen] = terug[0].rijen;
  assert.equal(rijen.length, 7);
  const kol = (naam) => kop.indexOf(naam);
  const bakker = rijen.find((r) => r[kol('Citeersleutel')] === 'bakker2017');
  assert.equal(bakker[kol('Auteurs')], 'Bakker, A. B.; Demerouti, E.');
  assert.equal(bakker[kol('Kernpunten')], 'Eerste punt\nTweede punt');
  assert.equal(bakker[kol('Gebruikt in onderzoeken')], 'Medewerkersonderzoek 2026');
  assert.equal(bakker[kol('Jaar')], 2017);
  assert.equal(rijen.find((r) => r[kol('Citeersleutel')] === 'vrieszd')[kol('Jaar')], 'z.d.');
  assert.equal(rijen.find((r) => r[kol('Citeersleutel')] === 'cbs2024')[kol('Collectie')], 'Startcollectie');
  assert.equal(bakker[kol('APA-verwijzing')], apaVerwijzing(bronnen[0]).replace(/\*/g, ''));
});

test('literatuurlijst voor Word: APA-volgorde, cursief, maakDocx werkt', async () => {
  const blokken = literatuurBlokken(Object.values(GOUDEN));
  assert.deepEqual(blokken[0], { soort: 'kop', niveau: 1, tekst: 'Literatuurlijst' });
  assert.deepEqual(blokken.slice(1).map((b) => b.tekst.slice(0, 12)), [
    'Arbeidsomsta', 'Arboportaal.', 'Bakker, A. B', 'Centraal Bur', 'Jansen, P., ', 'Smit, A. (20', 'Vries, J. de',
  ]);
  assert.ok(blokken.every((b, i) => i === 0 || b.hangend === true));
  const docx = maakDocx({ titel: 'Bronnen', blokken });
  const xml = new TextDecoder().decode((await leesZip(docx)).get('word/document.xml'));
  assert.ok(xml.includes('Journal of Occupational Health Psychology, 22'));
  assert.ok(xml.includes('<w:i/>'), 'cursief in Word');
});
