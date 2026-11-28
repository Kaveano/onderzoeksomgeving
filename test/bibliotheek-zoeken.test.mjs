// Tests voor bibliotheek-zoeken.js (BOUWPLAN §4 P5, criterium 3; D3 §8.2 zonder index): normaliseren,
// de stemmer, samengestelde woorden, synoniemen, alle-of-deel, facetten, filters, sorteren, markeringen en de
// snelheid op 1.000 bronnen. Zuiver: geen server nodig.
// Uitvoeren: node --test test/bibliotheek-zoeken.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { normaliseer, normaliseerMetKaart, stam, SYNONIEMEN, MIN_BEGIN, zoek, markeringen, zoekBijOnderzoek, leesZoekvraag } from '../public/js/beheer/bibliotheek-zoeken.js';
import { OPMAAK } from '../public/js/beheer/bibliotheek-regels.js';

let teller = 0;
const bron = (velden) => ({
  id: ++teller, collectie: 'eigen', soort: 'rapport', titel: '', auteurs: [], organisatie: '', afkorting: '', jaar: 2020, taal: 'nl',
  details: {}, onderwerpen: [], trefwoorden: [], samenvatting: '', kernpunten: [], betrouwbaarheid: 'onbekend', notities: '', verborgen: 0,
  onderzoeken: [], aangemaakt_op: `2026-01-${String(teller).padStart(2, '0')}T10:00:00.000Z`, ...velden,
});

test('normaliseer en de kaart terug naar de oorspronkelijke tekst', () => {
  assert.equal(normaliseer('Ziekteverzuim & Bevlogenheid — café’s'), 'ziekteverzuim bevlogenheid cafes');
  const { norm, kaart } = normaliseerMetKaart('Café');
  assert.equal(norm, 'cafe');
  assert.deepEqual(kaart, [0, 1, 2, 3]);
  assert.deepEqual(markeringen({ titel: 'Café' }, 'cafe').titel, [[0, 4]]);
  // Een teken dat twee letters wordt (ß → ss) en een samengesteld teken (e + accent)
  assert.deepEqual(markeringen({ titel: 'Die Straße' }, 'strasse').titel, [[4, 10]]);
  assert.deepEqual(markeringen({ titel: 'Café open' }, 'cafe').titel, [[0, 5]]);
  // De snelle normaliseer geeft precies hetzelfde als die met de kaart (500 willekeurige teksten met lastige tekens).
  const tekens = ['a', 'Z', 'é', 'é', 'ß', 'Æ', 'œ', 'Ø', 'ĳ', 'İ', '’', "'", ' ', '-', '—', '&', '1', '\n', '😀', 'ł', 'Ð', '´', 'ñ'];
  let zaad = 7;
  for (let n = 0; n < 500; n++) {
    let s = '';
    for (let k = 0; k < 12; k++) {
      zaad = (zaad * 1103515245 + 12345) % 2147483648;
      s += tekens[zaad % tekens.length];
    }
    assert.equal(normaliseer(s), normaliseerMetKaart(s).norm, JSON.stringify(s));
  }
});

test('de stemmer: alle voorbeelden uit D3 §2.7, ook wat moet blijven staan', () => {
  const tabel = {
    mogelijkheden: 'mogelijkheid', ontwikkelingen: 'ontwikkeling', organisaties: 'organisatie', studies: 'studie',
    medewerkersgroepen: 'medewerkersgroep', processen: 'proces', vrouwen: 'vrouw', leidinggevenden: 'leidinggevend',
    medewerkers: 'medewerker', teams: 'team', risicos: 'risico', proces: 'proces', status: 'status', stress: 'stress',
    focus: 'focus', leidinggevende: 'leidinggevend', gezonde: 'gezond', uur: 'uur',
  };
  for (const [w, s] of Object.entries(tabel)) assert.equal(stam(w), s, w);
});

test('samengesteld woord: "verzuim" vindt "Aanpak van ziekteverzuim"', () => {
  const b = bron({ titel: 'Aanpak van ziekteverzuim' });
  const r = zoek([b, bron({ titel: 'Iets anders' })], { tekst: 'verzuim' });
  assert.deepEqual(r.treffers.map((t) => t.id), [b.id]);
  assert.ok(r.treffers[0].score > 0);
});

test('synoniem: "verloop" vindt "employee turnover", lager dan "verloop" in de titel', () => {
  const engels = bron({ titel: 'Leaving the job', samenvatting: 'A study of employee turnover in hospitals.' });
  const titel = bron({ titel: 'Verloop in de zorg' });
  const r = zoek([engels, titel, bron({ titel: 'Ander onderwerp' })], { tekst: 'verloop' });
  assert.deepEqual(r.treffers.map((t) => t.id), [titel.id, engels.id]);
  assert.ok(r.treffers[0].score > r.treffers[1].score);
  assert.ok(SYNONIEMEN.some((g) => g.includes('verloop') && g.includes('turnover')));
  assert.ok(SYNONIEMEN.some((g) => g.includes('burn out')), 'burn-out wordt de woordgroep "burn out"');
});

test('eerst alle woorden, anders een deel ("deel")', () => {
  const v = bron({ titel: 'Verzuim in het mkb' });
  const o = bron({ titel: 'Onboarding van nieuwe medewerkers' });
  const beide = zoek([v, o], { tekst: 'verzuim onboarding' });
  assert.equal(beide.modus, 'deel');
  assert.deepEqual(beide.treffers.map((t) => t.id).sort(), [v.id, o.id].sort());
  const een = zoek([v, o], { tekst: 'verzuim mkb' });
  assert.equal(een.modus, 'alle');
  assert.deepEqual(een.treffers.map((t) => t.id), [v.id]);
  // Woordgroep tussen aanhalingstekens
  assert.equal(zoek([v, o], { tekst: '"nieuwe medewerkers"' }).totaal, 1);
  assert.equal(zoek([v, o], { tekst: '"medewerkers nieuwe"' }).totaal, 0);
  assert.deepEqual(leesZoekvraag('de werkdruk en het verzuim').termen.map((t) => t.t), ['werkdruk', 'verzuim']);
});

test('facetten: een gekozen onderwerp laat de aantallen van de andere onderwerpen staan', () => {
  const bronnen = [
    bron({ titel: 'A', onderwerpen: ['verzuim'] }), bron({ titel: 'B', onderwerpen: ['verzuim', 'werkdruk'] }),
    bron({ titel: 'C', onderwerpen: ['werkdruk'] }), bron({ titel: 'D', onderwerpen: ['onboarding'], soort: 'artikel' }),
  ];
  const zonder = zoek(bronnen);
  const met = zoek(bronnen, { filters: { onderwerpen: ['verzuim'] } });
  assert.equal(met.totaal, 2);
  assert.deepEqual(met.facetten.onderwerp, zonder.facetten.onderwerp);
  assert.deepEqual(zonder.facetten.onderwerp, { verzuim: 2, werkdruk: 2, onboarding: 1 });
  // Andere facetten tellen wel met het gekozen onderwerp
  assert.deepEqual(met.facetten.soort, { rapport: 2 });
});

test('filters: jaar (zonder datum alleen zonder jaarfilter), collectie, betrouwbaarheid, notities, gekoppeld, verborgen', () => {
  const zd = bron({ titel: 'Zonder datum', jaar: null });
  const oud = bron({ titel: 'Oud', jaar: 2001, collectie: 'start', betrouwbaarheid: 'hoog' });
  const nieuw = bron({ titel: 'Nieuw', jaar: 2024, betrouwbaarheid: 'beperkt', notities: 'Mijn notitie', onderzoeken: [3] });
  const weg = bron({ titel: 'Verborgen', collectie: 'start', verborgen: 1 });
  const alle = [zd, oud, nieuw, weg];
  const ids = (r) => r.treffers.map((t) => t.id).sort((a, b) => a - b);
  assert.deepEqual(ids(zoek(alle)), [zd.id, oud.id, nieuw.id]);
  assert.deepEqual(ids(zoek(alle, { filters: { jaarVan: 2000 } })), [oud.id, nieuw.id]);
  assert.deepEqual(ids(zoek(alle, { filters: { jaarTot: 2010 } })), [oud.id]);
  assert.deepEqual(ids(zoek(alle, { filters: { collectie: 'start' } })), [oud.id]);
  assert.deepEqual(ids(zoek(alle, { filters: { collectie: 'eigen' } })), [zd.id, nieuw.id]);
  assert.deepEqual(ids(zoek(alle, { filters: { betrouwbaarheid: 'redelijk' } })), [oud.id]);
  assert.deepEqual(ids(zoek(alle, { filters: { metNotities: true } })), [nieuw.id]);
  assert.deepEqual(ids(zoek(alle, { filters: { alleenGekoppeldAan: '3' } })), [nieuw.id]);
  assert.deepEqual(ids(zoek(alle, { filters: { metVerborgen: true } })), [zd.id, oud.id, nieuw.id, weg.id]);
  assert.equal(zoek(alle).facetten.verborgen, 1);
  assert.deepEqual(zoek(alle).facetten.jaren, { min: 2001, max: 2024 });
});

test('sorteren: nieuw (z.d. achteraan), titel, auteur (APA), toegevoegd; zonder tekst is relevantie = nieuw', () => {
  const a = bron({ titel: 'Beta', jaar: 2019, auteurs: [{ achternaam: 'Vries', tussenvoegsel: 'de', voorletters: 'M.' }] });
  const b = bron({ titel: 'alfa', jaar: null, auteurs: [{ achternaam: 'Bakker', tussenvoegsel: '', voorletters: 'A.' }] });
  const c = bron({ titel: 'Gamma', jaar: 2023, organisatie: 'CBS' });
  const v = (sortering) => zoek([a, b, c], { sortering }).treffers.map((t) => t.bron.titel);
  assert.deepEqual(v('nieuw'), ['Gamma', 'Beta', 'alfa']);
  assert.deepEqual(v('relevantie'), ['Gamma', 'Beta', 'alfa']);
  assert.deepEqual(v('oud'), ['Beta', 'Gamma', 'alfa']);
  assert.deepEqual(v('titel'), ['alfa', 'Beta', 'Gamma']);
  assert.deepEqual(v('auteur'), ['alfa', 'Gamma', 'Beta'], 'Bakker, CBS, Vries (de Vries onder de V)');
  assert.deepEqual(v('toegevoegd'), ['Gamma', 'alfa', 'Beta']);
});

test('markeringen in titel, samenvatting, kernpunten en auteurs', () => {
  const b = bron({
    titel: 'Werkdruk en ziekteverzuim', samenvatting: 'Over burn-out en werkstress.', kernpunten: ['Geen treffer', 'Verzuim daalt'],
    auteurs: [{ achternaam: 'Bakker', tussenvoegsel: '', voorletters: 'A. B.' }],
  });
  const m = markeringen(b, 'verzuim bakker');
  assert.deepEqual(m.titel, [[12, 25]]);
  assert.deepEqual(m.kernpunten, [[], [[0, 7]]]);
  assert.deepEqual(m.auteurs, [[0, 6]]);
  const m2 = markeringen(b, 'werkdruk');
  assert.deepEqual(m2.titel, [[0, 8]]);
  assert.deepEqual(m2.samenvatting, [[5, 13], [17, 27]], 'burn-out (woordgroep "burn out") en werkstress zijn synoniemen');
});

test('passende bronnen bij een onderzoek (thema\'s en onderzoeksvraag)', () => {
  const bronnen = [bron({ titel: 'Werkdruk in de zorg' }), bron({ titel: 'Onboarding' }), bron({ titel: 'Pensioen' })];
  const r = zoekBijOnderzoek(bronnen, { themas: [{ naam: 'Werkdruk' }, { naam: 'Inwerken' }], onderzoeksvraag: 'Hoe ervaren medewerkers de werkdruk?' });
  assert.ok(r.tekst.includes('werkdruk'));
  assert.deepEqual(r.treffers.map((t) => t.bron.titel), ['Werkdruk in de zorg', 'Onboarding']);
  assert.equal(zoekBijOnderzoek(bronnen, {}).treffers.length, 0);
});

// ---------- Bevindingen van de review van P7 (zoeken in de echte startcollectie; de rangorde daar staat in bibliotheek-start.test.mjs) ----------

test('het begin van een woord telt pas vanaf 4 letters: "WOR" vindt niet "work"', () => {
  assert.equal(MIN_BEGIN, 4);
  const engels = bron({ titel: 'Work and workers in Europe' });
  const wor = bron({ titel: 'Medezeggenschap', samenvatting: 'De WOR regelt de rechten van de ondernemingsraad.' });
  const werkdruk = bron({ titel: 'Werkdruk in de zorg' });
  const ids = (tekst) => zoek([engels, wor, werkdruk], { tekst }).treffers.map((t) => t.id);
  assert.deepEqual(ids('WOR'), [wor.id]);
  assert.deepEqual(ids('wor'), [wor.id], 'ook in kleine letters: alleen het hele woord');
  assert.deepEqual(ids('werk'), [werkdruk.id], 'vanaf 4 letters wel het begin van een woord');
  assert.deepEqual(ids('werkd'), [werkdruk.id]);
  assert.deepEqual(markeringen(wor, 'WOR').samenvatting, [[3, 6]]);
  assert.deepEqual(markeringen(engels, 'wor').titel, [], 'geen markering in "Work"');
  // Een synoniem met een korte stam ("lonen" → "lon") zoekt ook alleen het hele woord: niet "longitudinal"
  const lang = bron({ titel: 'A longitudinal study of nurses' });
  const cao = bron({ titel: 'Cao-lonen stijgen in 2025 met 5,0 procent' });
  assert.deepEqual(zoek([lang, cao], { tekst: 'salaris' }).treffers.map((t) => t.id), [cao.id]);
});

test('synoniemen: wetgeving ~ regelgeving (onderwerp "Wet- en regelgeving"), loon ~ lonen ~ cao, diversiteit ~ diversity', () => {
  const avg = bron({ titel: 'De AVG in het kort', onderwerpen: ['wetgeving'] });
  const wetenschap = bron({ titel: 'Wetenschappelijk onderzoek naar wettelijke regels' });
  const lijst = [avg, wetenschap];
  for (const tekst of ['wetgeving', 'Wetgeving', 'regelgeving', 'wet- en regelgeving', '"wet- en regelgeving"']) {
    assert.deepEqual(zoek(lijst, { tekst }).treffers.map((t) => t.id), [avg.id], tekst);
  }
  assert.ok(SYNONIEMEN.some((g) => g.includes('wetgeving') && g.includes('regelgeving') && g.includes('wet en regelgeving')));
  assert.ok(!SYNONIEMEN.some((g) => g.includes('wet') || g.includes('wetten')), 'de stam "wet" is ook het begin van "wetenschap"');
  const cao = bron({ titel: 'Cao-lonen stijgen in 2025 met 5,0 procent' });
  const pay = bron({ titel: 'A meta-analysis of pay level satisfaction' });
  for (const tekst of ['loon', 'lonen', 'salaris', 'beloning']) {
    assert.deepEqual(zoek([cao, pay, wetenschap], { tekst }).treffers.map((t) => t.id).sort(), [cao.id, pay.id].sort(), tekst);
  }
  const div = bron({ titel: 'Work group diversity and group performance' });
  const inc = bron({ titel: 'Inclusion in work groups' });
  assert.deepEqual(zoek([div, inc, cao], { tekst: 'diversiteit' }).treffers.map((t) => t.id).sort(), [div.id, inc.id].sort());
});

test('een treffer in de naam van een onderwerp telt minder dan een treffer in de titel of de samenvatting', () => {
  // Het onderwerp "Sociale veiligheid, diversiteit en inclusie" bevat het woord, maar de bron gaat over iets anders
  const psa = bron({ titel: 'Psychosociale arbeidsbelasting', onderwerpen: ['sociale-veiligheid'] });
  const titel = bron({ titel: 'Work group diversity and group performance' });
  const samenvatting = bron({ titel: 'Teams', samenvatting: 'Over diversiteit in teams.' });
  const r = zoek([psa, titel, samenvatting], { tekst: 'diversiteit' });
  assert.deepEqual(r.treffers.map((t) => t.id), [titel.id, samenvatting.id, psa.id], 'synoniem in de titel, precies in de samenvatting, dan het onderwerp');
  // Alleen het onderwerp: de bron wordt nog steeds gevonden
  assert.deepEqual(zoek([psa], { tekst: 'inclusie' }).treffers.map((t) => t.id), [psa.id]);
  assert.deepEqual(zoek([bron({ titel: 'X', onderwerpen: ['verzuim'] })], { tekst: 'vitaliteit' }).totaal, 1);
  // Bij "Passende bronnen" komt de zoekvraag uit de thema's: daar telt het onderwerp wel zwaar (gewicht 4, D3 §2.7)
  const metOnderwerp = bron({ titel: 'Psychosociale arbeidsbelasting', onderwerpen: ['werkdruk'] });
  const inSamenvatting = bron({ titel: 'Teams', samenvatting: 'Over werkdruk in teams.' });
  assert.deepEqual(zoek([inSamenvatting, metOnderwerp], { tekst: 'werkdruk' }).treffers.map((t) => t.id), [inSamenvatting.id, metOnderwerp.id]);
  assert.deepEqual(zoekBijOnderzoek([inSamenvatting, metOnderwerp], { themas: ['Werkdruk'] }).treffers.map((t) => t.id), [metOnderwerp.id, inSamenvatting.id]);
  // Een kort woord uit de onderzoeksvraag ("hoe") is niet meer het begin van "hoeverre"
  const hoeverre = bron({ titel: 'In hoeverre draagt een hoge werkdruk bij?' });
  assert.deepEqual(zoekBijOnderzoek([hoeverre], { onderzoeksvraag: 'Hoe tevreden zijn medewerkers?' }).treffers, []);
});

test('auteurs ook op de naam zoals in de tekst: "d\'Ancona" uit Citeer vindt "Ancona, J. d\'."', () => {
  const p = (achternaam, voorletters, tussenvoegsel = '') => ({ achternaam, tussenvoegsel, voorletters });
  const ancona = bron({ titel: 'Werk en welzijn', auteurs: [p('Ancona', 'J.', "d'")] });
  const vroome = bron({ titel: 'Arbobalans', auteurs: [p('Heuvel', 'S. G.', 'van den'), p('Vroome', 'E. M. M.', 'de')] });
  const witte = bron({ titel: 'Burnout', auteurs: [p('De Witte', 'H.')] });
  const andere = bron({ titel: 'Dancing at work', auteurs: [p('Dekker', 'F.')] });
  const alle = [ancona, vroome, witte, andere];
  const ids = (tekst) => zoek(alle, { tekst }).treffers.map((t) => t.id);
  for (const q of ["d'Ancona", 'd’Ancona', "D'Ancona", 'dAncona', 'Ancona', "d'ancona 2022"]) {
    assert.deepEqual(ids(q).slice(0, 1), [ancona.id], q);
  }
  assert.deepEqual(ids("d'Ancona"), [ancona.id]);
  assert.deepEqual(ids('De Vroome'), [vroome.id]);
  assert.deepEqual(ids('Van den Heuvel'), [vroome.id]);
  assert.deepEqual(ids('De Witte'), [witte.id]);
  // De markering staat op de regel uit de lijst ("Ancona, J. d'"); daar staat de naam
  assert.deepEqual(markeringen(ancona, 'Ancona').auteurs, [[0, 6]]);
  // Met de naam uit de tekst ("d'Ancona") krijgen beide delen een markering: "Ancona" en "d'"
  for (const q of ["d'Ancona", 'd’Ancona', "D'Ancona", 'dAncona', "d'ancona 2022"]) {
    assert.deepEqual(markeringen(ancona, q).auteurs, [[0, 6], [11, 13]], q);
  }
  assert.deepEqual(markeringen(bron({ auteurs: [p('Smit', 'A.'), p('Ancona', 'J.', "d'"), p('Dekker', 'F.')] }), "d'Ancona").auteurs, [[10, 16], [21, 23]],
    '"Smit, A., Ancona, J. d\', & Dekker, F.": alleen de tweede persoon');
  assert.deepEqual(markeringen(bron({ auteurs: [p('Ancona', '', "d'")] }), "d'Ancona").auteurs, [[0, 6], [8, 10]], 'zonder voorletters: "Ancona, d\'"');
  // Andere tussenvoegsels blijven zoals ze waren: "De Vroome" markeert alleen "Vroome"
  assert.deepEqual(markeringen(vroome, 'De Vroome').auteurs, [[25, 31]]);
  // Met het tussenvoegsel vooraan ('voor') staat "d'Ancona" al als één woord in de regel
  OPMAAK.tussenvoegsel = 'voor';
  try {
    assert.deepEqual(markeringen(ancona, "d'Ancona").auteurs, [[0, 8]]);
  } finally {
    OPMAAK.tussenvoegsel = 'achter';
  }
});

test('criterium 3: 1.000 bronnen van ongeveer 2 KB, mediaan van zoek onder 15 ms', () => {
  // Vast zaad (LCG), zodat de bronnen elke keer hetzelfde zijn.
  let zaad = 20261127;
  const willekeurig = () => {
    zaad = (zaad * 1664525 + 1013904223) % 4294967296;
    return zaad / 4294967296;
  };
  const woorden = ('werkdruk verzuim medewerkers organisatie leiderschap onboarding betrokkenheid tevredenheid ontwikkeling ' +
    'loopbaan cultuur verandering thuiswerken hybride vitaliteit gezondheid stress herstel team leidinggevende beloning ' +
    'arbeidsvoorwaarden inclusie diversiteit veiligheid pesten vertrek behoud retentie onderzoek vragenlijst analyse zorg ' +
    'onderwijs overheid industrie kennis vaardigheden scholing training jongeren ouderen deeltijd flexibel autonomie').split(' ');
  const zin = (n) => Array.from({ length: n }, () => woorden[Math.floor(willekeurig() * woorden.length)]).join(' ');
  const onderwerpen = ['verzuim', 'werkdruk', 'onboarding', 'leiderschap', 'tevredenheid', 'ontwikkeling', 'hybride'];
  const bronnen = Array.from({ length: 1000 }, (_, i) => bron({
    titel: zin(8), samenvatting: zin(180), kernpunten: [zin(12), zin(12), zin(12)], trefwoorden: [zin(1), zin(1), zin(2)],
    onderwerpen: [onderwerpen[i % onderwerpen.length]], jaar: 1990 + (i % 35),
    auteurs: [{ achternaam: `Auteur${i}`, tussenvoegsel: '', voorletters: 'A.' }],
  }));
  const grootte = JSON.stringify(bronnen).length / bronnen.length;
  assert.ok(grootte > 1500 && grootte < 3000, `gemiddeld ${grootte} tekens per bron`);
  const t0 = performance.now();
  zoek(bronnen, { tekst: 'werkdruk' }); // de eerste keer worden de velden voorbereid
  const voorbereiden = performance.now() - t0;
  const vragen = ['werkdruk', 'verzuim jongeren', 'werkdruk zorg', 'onboarding', '"herstel team"', 'burnout', 'leiderschap ouderen', 'stres'];
  const tijden = [];
  for (let i = 0; i < 20; i++) {
    const s = performance.now();
    const r = zoek(bronnen, { tekst: vragen[i % vragen.length], filters: i % 3 ? {} : { onderwerpen: ['werkdruk'] } });
    tijden.push(performance.now() - s);
    assert.ok(r.totaal > 0);
  }
  tijden.sort((a, b) => a - b);
  const mediaan = (tijden[9] + tijden[10]) / 2;
  console.log(`# voorbereiden + eerste zoekvraag: ${voorbereiden.toFixed(1)} ms; mediaan zoek: ${mediaan.toFixed(2)} ms`);
  assert.ok(voorbereiden < 400, `voorbereiden ${voorbereiden} ms`);
  assert.ok(mediaan < 15, `mediaan ${mediaan} ms`);
});
