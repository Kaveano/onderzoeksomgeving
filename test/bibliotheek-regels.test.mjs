// Tests voor bibliotheek-regels.js (BOUWPLAN §4 P5, criteria 1 en 2): APA-verwijzingen volgens de Nederlandse
// afspraken van B20, verwijzingen in de tekst, de literatuurlijst, namen lezen, citeersleutels, "Plak een
// verwijzing" en het omzetten van records van de startcollectie. Zuiver: geen server nodig.
// Uitvoeren: node --test test/bibliotheek-regels.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import {
  OPMAAK, apaVerwijzing, apaInTekst, apaKort, sorteerLiteratuur, citeersleutelBasis, vrijeCiteersleutel, leesAuteur, voorletters,
  leesApaVerwijzing, normaliseerStartbron, leesStartDetails, normaliseer, paginaTekst, dubbeleVan, nlDatumKort, auteursRegel, CITEERSLEUTEL,
  BRONSOORTEN, DETAILVELDEN, ONDERWERPEN, onderwerpUitTekst, leesTijdschriftDeel, dubbelZoeker, reeksDelen, MAX_PER_REEKS, MAX_REEKS_BYTES, MAX_REEKS_VERZOEK, kaleDoi,
  LIMIETEN,
} from '../public/js/beheer/bibliotheek-regels.js';
import { planReeks, insertWaarden, controleerBron } from '../src/lib/bibliotheek.js';

import { A, GOUDEN } from './fixtures/bibliotheek-gouden.mjs';

test('B20: de Nederlandse afspraken staan vast in OPMAAK', () => {
  assert.deepEqual(OPMAAK, { amp: { lijst: '&', haakjes: '&', verhalend: 'en' }, kommaVoorAmp: true, tussenvoegsel: 'achter' });
});

test('criterium 1: gouden verwijzingen in de literatuurlijst', () => {
  assert.equal(apaVerwijzing(GOUDEN.bakker),
    'Bakker, A. B., & Demerouti, E. (2017). Job demands-resources theory: Taking stock and looking forward. *Journal of Occupational Health Psychology, 22*(3), 273–285. https://doi.org/10.1037/ocp0000056');
  assert.equal(apaVerwijzing(GOUDEN.jansen),
    'Jansen, P., Vries, M. de, & Bos, K. L. (2023). *Werkdruk in de zorg* (Rapportnr. 2023-R101). TNO. https://example.org/r');
  assert.equal(apaVerwijzing(GOUDEN.cbs), 'Centraal Bureau voor de Statistiek. (2024). *Voorbeeldrapport ziekteverzuim*. https://www.cbs.nl/voorbeeld');
  assert.equal(apaVerwijzing(GOUDEN.smit),
    'Smit, A. (2021). Onboarding als proces. In B. Kok & C. van den Berg (Red.), *Handboek HRM* (pp. 45–67). Noordhoff.');
  assert.ok(apaVerwijzing(GOUDEN.smit).includes('In B. Kok & C. van den Berg (Red.), *Handboek HRM* (pp. 45–67). Noordhoff.'));
  // D3 §8.1 gevallen 6 en 7 ongewijzigd; geval 4 met een punt na het tussenvoegsel (besluit 6b van het onderzoeksteam, P7)
  assert.equal(apaVerwijzing(GOUDEN.vries), 'Vries, J. de. (z.d.). *Praktisch HR-onderzoek* (3e dr.). Boom.');
  assert.equal(apaVerwijzing(GOUDEN.arboportaal),
    'Arboportaal. (2024, 5 maart). *Werkdruk*. Geraadpleegd op 20 november 2026, van https://www.arboportaal.nl/onderwerpen/werkdruk');
  assert.equal(apaVerwijzing(GOUDEN.arbowet), 'Arbeidsomstandighedenwet. (1998). https://wetten.overheid.nl/BWBR0010346');
});

test('criterium 1: gouden verwijzingen in de tekst', () => {
  assert.equal(apaInTekst([{ bron: GOUDEN.bakker }]), '(Bakker & Demerouti, 2017)');
  assert.equal(apaInTekst([{ bron: GOUDEN.bakker }], { verhalend: true }), 'Bakker en Demerouti (2017)');
  assert.equal(apaInTekst([{ bron: GOUDEN.jansen }]), '(Jansen et al., 2023)');
  assert.equal(apaInTekst([{ bron: GOUDEN.vries }]), '(De Vries, z.d.)');
  assert.equal(apaInTekst([{ bron: GOUDEN.arbowet }]), '(Arbeidsomstandighedenwet, 1998)');

  // Organisatie met afkorting: de eerste keer voluit, daarna de afkorting.
  const gezien = new Set();
  assert.equal(apaInTekst([{ bron: GOUDEN.cbs }], { eersteKeer: gezien }), '(Centraal Bureau voor de Statistiek [CBS], 2024)');
  assert.equal(apaInTekst([{ bron: GOUDEN.cbs }], { eersteKeer: gezien }), '(CBS, 2024)');
  const verhalend = new Set();
  assert.equal(apaInTekst([{ bron: GOUDEN.cbs }], { verhalend: true, eersteKeer: verhalend }), 'Centraal Bureau voor de Statistiek (CBS, 2024)');
  assert.equal(apaInTekst([{ bron: GOUDEN.cbs }], { verhalend: true, eersteKeer: verhalend }), 'CBS (2024)');
  assert.equal(apaKort(GOUDEN.cbs), '(CBS, 2024)');
});

test('criterium 1: [@cbs2024b; @bakker2017, p. 12] met a/b uit de literatuurlijst', () => {
  const cbsA = { ...GOUDEN.cbs, citeersleutel: 'cbs2024', titel: 'Arbeid in cijfers' };
  const cbsB = { ...GOUDEN.cbs, citeersleutel: 'cbs2024b', titel: 'Verzuim in cijfers' };
  const lijst = sorteerLiteratuur([cbsB, GOUDEN.bakker, cbsA]);
  assert.deepEqual(lijst.map((l) => [l.bron.citeersleutel, l.suffix]), [['bakker2017', ''], ['cbs2024', 'a'], ['cbs2024b', 'b']]);
  const suffix = new Map(lijst.map((l) => [l.bron.citeersleutel, l.suffix]));
  assert.equal(
    apaInTekst([{ bron: cbsB, suffix: suffix.get('cbs2024b') }, { bron: GOUDEN.bakker, pagina: '12' }]),
    '(Bakker & Demerouti, 2017, p. 12; Centraal Bureau voor de Statistiek [CBS], 2024b)',
  );
  // Dezelfde suffixen in de lijst
  assert.equal(apaVerwijzing(cbsA, { suffix: 'a' }), 'Centraal Bureau voor de Statistiek. (2024a). *Arbeid in cijfers*. https://www.cbs.nl/voorbeeld');
  assert.equal(apaVerwijzing({ ...GOUDEN.vries }, { suffix: 'b' }).slice(0, 27), 'Vries, J. de. (z.d.-b). *Pr');
});

test('tussenvoegsel vooraan ("voor") geeft De Vries, J.', () => {
  OPMAAK.tussenvoegsel = 'voor';
  try {
    assert.equal(apaVerwijzing(GOUDEN.vries), 'De Vries, J. (z.d.). *Praktisch HR-onderzoek* (3e dr.). Boom.');
    assert.equal(apaInTekst([{ bron: GOUDEN.vries }]), '(De Vries, z.d.)');
  } finally {
    OPMAAK.tussenvoegsel = 'achter';
  }
});

test('in de tekst: samenvoegen, pagina\'s, 21 auteurs', () => {
  const b2019 = { ...GOUDEN.bakker, citeersleutel: 'bakker2019', auteurs: [A('Bakker', 'A. B.')], jaar: 2019 };
  const b2017 = { ...GOUDEN.bakker, citeersleutel: 'bakker2017x', auteurs: [A('Bakker', 'A. B.')], jaar: 2017 };
  assert.equal(apaInTekst([{ bron: b2019 }, { bron: b2017 }]), '(Bakker, 2017, 2019)');
  assert.equal(apaInTekst([{ bron: b2019, pagina: '12-14' }], { verhalend: true }), 'Bakker (2019, pp. 12–14)');
  assert.equal(paginaTekst('12'), 'p. 12');
  assert.equal(paginaTekst('12-14'), 'pp. 12–14');
  assert.equal(paginaTekst('hoofdstuk 3'), 'hoofdstuk 3');
  const veel = { soort: 'artikel', jaar: 2020, titel: 'Groot team', auteurs: Array.from({ length: 22 }, (_, i) => A(`Naam${i + 1}`, 'X.')) };
  const t = apaVerwijzing(veel);
  assert.ok(t.startsWith('Naam1, X., Naam2, X.,'));
  assert.ok(t.includes('Naam19, X., … Naam22, X. (2020).'), t);
  assert.ok(!t.includes('Naam20'));
});

test('sorteren: z.d. voor een jaartal, "Vries, M. de" onder de V, accenten', () => {
  const vries2017 = { ...GOUDEN.vries, citeersleutel: 'vries2017', jaar: 2017 };
  const ab = { soort: 'boek', auteurs: [A('Åberg', 'L.')], jaar: 2010, titel: 'A' };
  const ae = { soort: 'boek', auteurs: [A('Aebi', 'M.')], jaar: 2010, titel: 'B' };
  const ve = { soort: 'boek', auteurs: [A('Velde', 'J.')], jaar: 2010, titel: 'C' };
  const lijst = sorteerLiteratuur([vries2017, ve, GOUDEN.vries, ab, ae]).map((l) => l.bron);
  assert.deepEqual(lijst.map((b) => b.auteurs[0].achternaam + (b.jaar ?? 'zd')), ['Åberg2010', 'Aebi2010', 'Velde2010', 'Vrieszd', 'Vries2017']);
});

test('leesAuteur: alle vormen uit D3 §2.8', () => {
  const p = (achternaam, tussenvoegsel, vl) => ({ achternaam, tussenvoegsel, voorletters: vl });
  assert.deepEqual(leesAuteur('Bakker, A. B.'), p('Bakker', '', 'A. B.'));
  assert.deepEqual(leesAuteur('Bakker, Arnold B.'), p('Bakker', '', 'A. B.'));
  assert.deepEqual(leesAuteur('de Vries, J.'), p('Vries', 'de', 'J.'));
  // Besluit 6a (P7): met een hoofdletter hoort het voorvoegsel bij de achternaam (Vlaamse of buitenlandse naam)
  assert.deepEqual(leesAuteur('De Vries, J.'), p('De Vries', '', 'J.'));
  assert.deepEqual(leesAuteur('Vries, J. de'), p('Vries', 'de', 'J.'));
  assert.deepEqual(leesAuteur('Jan de Vries'), p('Vries', 'de', 'J.'));
  assert.deepEqual(leesAuteur('van der Berg, K.'), p('Berg', 'van der', 'K.'));
  assert.deepEqual(leesAuteur('Bakker A.B.'), p('Bakker', '', 'A. B.'));
  assert.deepEqual(leesAuteur('C. van den Berg'), p('Berg', 'van den', 'C.'));
  assert.deepEqual(leesAuteur('Centraal Bureau voor de Statistiek'), { organisatie: 'Centraal Bureau voor de Statistiek' });
  assert.deepEqual(leesAuteur('TNO'), { organisatie: 'TNO' });
  assert.deepEqual(leesAuteur('Kenniscentrum Voorbeeld'), { organisatie: 'Kenniscentrum Voorbeeld' });
  assert.deepEqual(leesAuteur('Jan de Raad'), p('Raad', 'de', 'J.'));
  assert.deepEqual(leesAuteur('Raad voor Werk en Inkomen'), { organisatie: 'Raad voor Werk en Inkomen' });
  assert.equal(leesAuteur('  '), null);
});

test('besluit 6a (P7): een voorvoegsel met een hoofdletter hoort bij de achternaam, met een kleine letter is het een tussenvoegsel', () => {
  const p = (achternaam, tussenvoegsel, vl) => ({ achternaam, tussenvoegsel, voorletters: vl });
  // Vlaamse en buitenlandse namen zoals het onderzoeksteam ze schrijft
  assert.deepEqual(leesAuteur('De Witte, H.'), p('De Witte', '', 'H.'));
  assert.deepEqual(leesAuteur('De Dreu, C. K. W.'), p('De Dreu', '', 'C. K. W.'));
  assert.deepEqual(leesAuteur('Van Dyne, L.'), p('Van Dyne', '', 'L.'));
  assert.deepEqual(leesAuteur("D'Ancona, J."), p("D'Ancona", '', 'J.'));
  assert.deepEqual(leesAuteur('Hans De Witte'), p('De Witte', '', 'H.'));
  assert.deepEqual(leesAuteur('De Witte H.'), p('De Witte', '', 'H.'));
  // Nederlandse namen: het tussenvoegsel klein, vooraan of achter de voorletters
  assert.deepEqual(leesAuteur('de Vroome, E. M. M.'), p('Vroome', 'de', 'E. M. M.'));
  assert.deepEqual(leesAuteur('Vroome, E. M. M. de'), p('Vroome', 'de', 'E. M. M.'));
  assert.deepEqual(leesAuteur('Vroome, E. M. M. de.'), p('Vroome', 'de', 'E. M. M.'), 'met de punt uit de literatuurlijst');
  assert.deepEqual(leesAuteur('van der Meulen-de Vries, G. H.'), p('Meulen-de Vries', 'van der', 'G. H.'));
  assert.deepEqual(leesAuteur('Meulen-de Vries, G. H. van der.'), p('Meulen-de Vries', 'van der', 'G. H.'));
  assert.deepEqual(leesAuteur("d'Ancona, J."), p('Ancona', "d'", 'J.'));
  assert.deepEqual(leesAuteur("Ancona, J. d'."), p('Ancona', "d'", 'J.'));
  assert.deepEqual(leesAuteur("'t Hart, J."), p('Hart', "'t", 'J.'));
  assert.deepEqual(leesAuteur('Hans de Witte'), p('Witte', 'de', 'H.'));
  assert.deepEqual(leesAuteur('de Witte H.'), p('Witte', 'de', 'H.'));
});

test('besluiten 6a en 6b (P7): de voorbeelden van de Radboud-gids in de lijst en in de tekst', () => {
  const boek = (auteurs, jaar = 2022, titel = 'Titel') => ({ soort: 'boek', titel, jaar, auteurs, details: { uitgever: 'Uitgever' } });
  const meulen = boek([A('Meulen-de Vries', 'G. H.', 'van der')]);
  const ancona = boek([A('Ancona', 'J.', "d'")]);
  const vroome = boek([A('Vroome', 'E. M. M.', 'de')], 2025);
  const witte = boek([A('De Witte', 'H.')], 2020);
  // 6b: een punt na een tussenvoegsel aan het eind van de auteurs
  assert.equal(apaVerwijzing(meulen), 'Meulen-de Vries, G. H. van der. (2022). *Titel*. Uitgever.');
  assert.equal(apaVerwijzing(ancona), "Ancona, J. d'. (2022). *Titel*. Uitgever.");
  assert.equal(apaVerwijzing(vroome), 'Vroome, E. M. M. de. (2025). *Titel*. Uitgever.');
  assert.equal(apaVerwijzing(boek([A('Heuvel', 'S. G.', 'van den'), A('Bouwens', 'L.'), A('Vroome', 'E. M. M.', 'de')], 2025)),
    'Heuvel, S. G. van den, Bouwens, L., & Vroome, E. M. M. de. (2025). *Titel*. Uitgever.');
  assert.equal(apaVerwijzing(boek([A('Knippenberg', 'D.', 'van'), A('De Dreu', 'C. K. W.'), A('Homan', 'A. C.')], 2004)),
    'Knippenberg, D. van, De Dreu, C. K. W., & Homan, A. C. (2004). *Titel*. Uitgever.', 'midden in de lijst geen extra punt');
  // 6a: een voorvoegsel dat bij de achternaam hoort, staat vooraan
  assert.equal(apaVerwijzing(witte), 'De Witte, H. (2020). *Titel*. Uitgever.');
  assert.equal(apaVerwijzing(boek([A('Schaufeli', 'W. B.'), A('Desart', 'S.'), A('De Witte', 'H.')], 2020)),
    'Schaufeli, W. B., Desart, S., & De Witte, H. (2020). *Titel*. Uitgever.');
  // In de tekst altijd met een hoofdletter, behalve d' (klein en vast aan de naam)
  assert.equal(apaInTekst([{ bron: meulen }]), '(Van der Meulen-de Vries, 2022)');
  assert.equal(apaInTekst([{ bron: meulen }], { verhalend: true }), 'Van der Meulen-de Vries (2022)');
  assert.equal(apaInTekst([{ bron: vroome }], { verhalend: true }), 'De Vroome (2025)');
  assert.equal(apaInTekst([{ bron: ancona }]), "(d'Ancona, 2022)");
  assert.equal(apaInTekst([{ bron: ancona }], { verhalend: true }), "d'Ancona (2022)");
  assert.equal(apaInTekst([{ bron: witte }]), '(De Witte, 2020)');
  assert.equal(apaInTekst([{ bron: boek([A('Bakker', 'A. B.'), A('Dijk', 'P.', 'van')], 2021) }], { verhalend: true }), 'Bakker en Van Dijk (2021)');
  assert.equal(apaInTekst([{ bron: boek([A('van Dijk', 'P.')], 2021) }]), '(Van Dijk, 2021)', 'ook een achternaam die met een kleine letter is ingevuld');
  assert.equal(apaKort(vroome), '(De Vroome, 2025)');
  // Redacteuren: voorletters, tussenvoegsel en naam; d' vast aan de naam
  const hoofdstuk = { soort: 'hoofdstuk', titel: 'H', jaar: 2021, auteurs: [A('Smit', 'A.')],
    details: { boektitel: 'Boek', redacteuren: [A('Ancona', 'J.', "d'"), A('Berg', 'C.', 'van den')], uitgever: 'U' } };
  assert.equal(apaVerwijzing(hoofdstuk), "Smit, A. (2021). H. In J. d'Ancona & C. van den Berg (Red.), *Boek*. U.");
  // Volgorde: een Nederlandse naam op de hoofdnaam, een Vlaamse of buitenlandse onder D of V
  const bronnen = [vroome, witte, meulen, ancona, boek([A('Dijk', 'P.')], 2020), boek([A('Vos', 'K.')], 2020)].map((b, i) => ({ ...b, citeersleutel: `b${i}` }));
  const lijst = sorteerLiteratuur(bronnen).map((l) => l.bron.auteurs[0].achternaam);
  assert.deepEqual(lijst, ['Ancona', 'De Witte', 'Dijk', 'Meulen-de Vries', 'Vos', 'Vroome']);
  // Bij 'voor' staat het tussenvoegsel vooraan, met d' vast aan de naam
  OPMAAK.tussenvoegsel = 'voor';
  try {
    assert.equal(apaVerwijzing(ancona), "d'Ancona, J. (2022). *Titel*. Uitgever.");
    assert.equal(apaVerwijzing(meulen), 'Van der Meulen-de Vries, G. H. (2022). *Titel*. Uitgever.');
  } finally {
    OPMAAK.tussenvoegsel = 'achter';
  }
});

test('APA 7 §9.44: letter voor letter sorteren (DeBase en Dekker voor De Vries), spaties en apostrofs tellen niet mee', () => {
  const boek = (achternaam, vl, jaar, titel, tv = '') => ({ soort: 'boek', titel, jaar, auteurs: [A(achternaam, vl, tv)], citeersleutel: titel.toLowerCase() });
  const bronnen = [boek('De Witte', 'H.', 2020, 'Een'), boek('Dekker', 'F.', 2019, 'Twee'), boek('De Vries', 'R. E.', 2012, 'Drie'),
    boek('DeBase', 'A.', 2018, 'Vier'), boek('MacNeil', 'K.', 2010, 'Vijf'), boek("M'Carthy", 'L.', 2010, 'Zes'), boek('Devos', 'P.', 2011, 'Zeven')];
  assert.deepEqual(sorteerLiteratuur(bronnen).map((l) => l.bron.auteurs[0].achternaam),
    ['DeBase', 'Dekker', 'Devos', 'De Vries', 'De Witte', 'MacNeil', "M'Carthy"]);
  // "Nothing precedes something" blijft: Brown voor Browning, en dezelfde naam met minder voorletters eerst
  assert.deepEqual(sorteerLiteratuur([boek('Browning', 'A. R.', 2010, 'A'), boek('Brown', 'J. R.', 2010, 'B'), boek('Brown', 'J.', 2010, 'C')])
    .map((l) => `${l.bron.auteurs[0].achternaam} ${l.bron.auteurs[0].voorletters}`), ['Brown J.', 'Brown J. R.', 'Browning A. R.']);
});

test('besluit van het onderzoeksteam (P7, record 37): een buitenlandse naam die de auteur zelf klein schrijft, als object', () => {
  // Y.-A. de Montjoye (Belg) schrijft "de" klein; het hoort bij de achternaam (APA 7: zoals de auteur het schrijft)
  const montjoye = { achternaam: 'de Montjoye', tussenvoegsel: '', voorletters: 'Y.-A.' };
  const record = (auteurs) => ({ titel: 'Estimating', auteurs, jaar: 2019, soort: 'wetenschappelijk artikel', taal: 'en', doi: '10.1038/s41467-019-10933-3', onderwerpen: ['privacy-ethiek'] });
  let r = normaliseerStartbron(record(['Rocher, L.', 'Hendrickx, J. M.', montjoye]));
  assert.deepEqual(r.fouten, []);
  assert.deepEqual(r.bron.auteurs[2], montjoye);
  assert.equal(apaVerwijzing(r.bron), 'Rocher, L., Hendrickx, J. M., & de Montjoye, Y.-A. (2019). Estimating. https://doi.org/10.1038/s41467-019-10933-3');
  assert.equal(apaInTekst([{ bron: r.bron }]), '(Rocher et al., 2019)');
  // Als tekst blijft het een Nederlands tussenvoegsel: aan een tekst zie je niet wie het is. Nederlandse namen veranderen niet.
  r = normaliseerStartbron(record(['Rocher, L.', 'Hendrickx, J. M.', 'de Montjoye, Y.-A.']));
  assert.deepEqual(r.bron.auteurs[2], { achternaam: 'Montjoye', tussenvoegsel: 'de', voorletters: 'Y.-A.' });
  assert.equal(normaliseerStartbron(record(['de Vroome, E. M. M.'])).bron.auteurs[0].tussenvoegsel, 'de');
  assert.deepEqual(normaliseerStartbron(record([{ achternaam: 'Vroome', tussenvoegsel: 'de', voorletters: 'E. M. M.' }])).bron.auteurs[0],
    { achternaam: 'Vroome', tussenvoegsel: 'de', voorletters: 'E. M. M.' }, 'een Nederlandse naam als object kan ook');
  // Letter voor letter op "deMontjoye" (APA 7 §9.44): na Dekker, voor Devos; een Nederlandse "Montjoye, P. de." onder de M
  const boek = (a, titel) => ({ soort: 'boek', titel, jaar: 2019, auteurs: [a], citeersleutel: titel, details: { uitgever: 'U' } });
  const lijst = sorteerLiteratuur([boek(A('Mol', 'A.'), 'a'), boek(A('Montjoye', 'P.', 'de'), 'b'), boek(A('De Vries', 'R.'), 'c'), boek(A('Devos', 'P.'), 'd'),
    boek(montjoye, 'e'), boek(A('Dekker', 'F.'), 'f')]);
  assert.deepEqual(lijst.map((l) => apaVerwijzing(l.bron).split(' (')[0]), ['Dekker, F.', 'de Montjoye, Y.-A.', 'Devos, P.', 'De Vries, R.', 'Mol, A.', 'Montjoye, P. de.']);
  // Als eerste auteur: de citeersleutel en, volgens de regel voor de tekst (altijd een hoofdletter vooraan), "De Montjoye"
  assert.equal(citeersleutelBasis(boek(montjoye, 'e')), 'demontjoye2019');
  assert.equal(apaVerwijzing(boek(montjoye, 'e')), 'de Montjoye, Y.-A. (2019). *e*. U.');
  assert.equal(apaInTekst([{ bron: boek(montjoye, 'e') }], { verhalend: true }), 'De Montjoye (2019)');
});

test('APA 7 §8.12: meerdere bronnen tussen haakjes in de volgorde van de literatuurlijst', () => {
  const boek = (auteurs, jaar, titel) => ({ soort: 'boek', titel, jaar, auteurs, citeersleutel: titel.toLowerCase(), details: { uitgever: 'U' } });
  const dierendonck = boek([A('Dierendonck', 'D.', 'van')], 2011, 'Dienend');
  const heuvel = boek([A('Heuvel', 'S. G.', 'van den'), A('Bouwens', 'L.'), A('Vroome', 'E. M. M.', 'de')], 2025, 'Arbobalans');
  const schaufeli = boek([A('Schaufeli', 'W. B.'), A('Desart', 'S.'), A('De Witte', 'H.')], 2020, 'BAT');
  assert.equal(apaInTekst([{ bron: schaufeli }, { bron: heuvel }, { bron: dierendonck }]),
    '(Van Dierendonck, 2011; Van den Heuvel et al., 2025; Schaufeli et al., 2020)');
  assert.deepEqual(sorteerLiteratuur([schaufeli, heuvel, dierendonck]).map((l) => l.bron), [dierendonck, heuvel, schaufeli]);
  const abbing = boek([A('Abbing', 'J.')], 2020, 'Een');
  const vroome = boek([A('Vroome', 'E. M. M.', 'de')], 2025, 'Twee');
  const witte = boek([A('De Witte', 'H.')], 2020, 'Drie');
  const smit = boek([A('Smit', 'P.')], 2020, 'Vier');
  assert.equal(apaInTekst([vroome, witte, smit, abbing].map((bron) => ({ bron }))), '(Abbing, 2020; De Witte, 2020; Smit, 2020; De Vroome, 2025)');
  // Een organisatie op de volle naam, ook als de tekst de afkorting gebruikt; dezelfde auteur blijft samengevoegd
  const cbs = { soort: 'rapport', titel: 'Cijfers', jaar: 2024, organisatie: 'Centraal Bureau voor de Statistiek', afkorting: 'CBS', citeersleutel: 'cbs2024' };
  const bakker = boek([A('Bakker', 'A. B.')], 2019, 'Werk');
  const bakker2 = boek([A('Bakker', 'A. B.')], 2017, 'Druk');
  const dekker = boek([A('Dekker', 'F.')], 2019, 'Dekker');
  assert.equal(apaInTekst([{ bron: dekker }, { bron: cbs }, { bron: bakker }, { bron: bakker2 }], { eersteKeer: new Set(['cbs2024']) }),
    '(Bakker, 2017, 2019; CBS, 2024; Dekker, 2019)');
  // In de zin blijft de volgorde waarin je ze noemt
  assert.equal(apaInTekst([{ bron: schaufeli }, { bron: dierendonck }], { verhalend: true }), 'Schaufeli et al. (2020) en Van Dierendonck (2011)');
});

test('APA 7 §9.47 en §8.20: a en b alleen bij dezelfde mensen; dezelfde naam in de tekst bij twee mensen krijgt voorletters', () => {
  const boek = (auteurs, jaar, titel) => ({ soort: 'boek', titel, jaar, auteurs, citeersleutel: titel.toLowerCase().replace(/\W/g, ''), details: { uitgever: 'U' } });
  const hWitte = boek([A('De Witte', 'H.')], 2020, 'Drie');
  const jWitte = boek([A('Witte', 'J.', 'de')], 2020, 'Vijf');
  const vriesBe = boek([A('De Vries', 'R. E.')], 2012, 'Acht');
  const vriesNl = boek([A('Vries', 'R. E.', 'de')], 2012, 'Negen');
  const hWitte2 = boek([A('De Witte', 'H.')], 2020, 'Een ander boek');
  const lijst = sorteerLiteratuur([jWitte, hWitte, vriesNl, vriesBe, hWitte2]);
  assert.deepEqual(lijst.map((l) => [l.bron.titel, l.suffix, l.voorletters]), [
    ['Acht', '', true], ['Drie', 'a', true], ['Een ander boek', 'b', true], ['Negen', '', true], ['Vijf', '', true]]);
  assert.deepEqual(lijst.map((l) => apaVerwijzing(l.bron, { suffix: l.suffix }).split(' *')[0]), [
    'De Vries, R. E. (2012).', 'De Witte, H. (2020a).', 'De Witte, H. (2020b).', 'Vries, R. E. de. (2012).', 'Witte, J. de. (2020).']);
  // In de tekst met de voorletters uit de lijst: "H. De Witte" en "J. de Witte" (tussenvoegsel klein na de voorletters)
  const item = (bron) => { const l = lijst.find((x) => x.bron === bron); return { bron, suffix: l.suffix, voorletters: l.voorletters }; };
  assert.equal(apaInTekst([item(jWitte), item(hWitte)]), '(H. De Witte, 2020a; J. de Witte, 2020)');
  assert.equal(apaInTekst([item(jWitte)], { verhalend: true }), 'J. de Witte (2020)');
  assert.equal(apaInTekst([item(hWitte), item(hWitte2)]), '(H. De Witte, 2020a, 2020b)', 'dezelfde mens: samengevoegd');
  // Zonder voorletters (zoals in Citeer voor één bron) worden twee mensen met dezelfde naam niet samengevoegd
  assert.equal(apaInTekst([{ bron: jWitte }, { bron: hWitte }]), '(De Witte, 2020; De Witte, 2020)');
  // Voorletters alleen bij de eerste auteur; d' vast aan de naam
  const anconaJ = boek([A('Ancona', 'J.', "d'"), A('Smit', 'P.')], 2022, 'Elf');
  const anconaM = boek([A('Ancona', 'M.', "d'")], 2021, 'Twaalf');
  const l2 = sorteerLiteratuur([anconaJ, anconaM]);
  assert.deepEqual(l2.map((l) => l.voorletters), [true, true]);
  assert.equal(apaInTekst(l2.map(({ bron, suffix, voorletters }) => ({ bron, suffix, voorletters }))), "(J. d'Ancona & Smit, 2022; M. d'Ancona, 2021)");
  // Dezelfde eerste auteur met "et al." en andere medeauteurs in hetzelfde jaar: a en b (anders is de tekst dubbelzinnig)
  const s1 = boek([A('Schaufeli', 'W. B.'), A('Bakker', 'A. B.'), A('Taris', 'T.')], 2020, 'Een');
  const s2 = boek([A('Schaufeli', 'W. B.'), A('Desart', 'S.'), A('De Witte', 'H.')], 2020, 'Twee');
  const s3 = boek([A('Schaufeli', 'W. B.')], 2020, 'Drie');
  assert.deepEqual(sorteerLiteratuur([s1, s2, s3]).map((l) => [l.bron.titel, l.suffix, l.voorletters]), [['Drie', '', false], ['Een', 'a', false], ['Twee', 'b', false]]);
  // Eén mens, één naam: geen voorletters
  assert.deepEqual(sorteerLiteratuur([GOUDEN.bakker, GOUDEN.cbs]).map((l) => l.voorletters), [false, false]);
});

test('besluiten 6a en 6b (P7): "Plak een verwijzing" leest de nieuwe vorm terug', () => {
  let r = leesApaVerwijzing('Heuvel, S. G. van den, Bouwens, L., & Vroome, E. M. M. de. (2025). Arbobalans 2024 (Rapportnr. TNO 2025 R11108). TNO. https://monitorarbeid.tno.nl/publicaties/arbobalans-2024/');
  assert.deepEqual(r.bron.auteurs, [A('Heuvel', 'S. G.', 'van den'), A('Bouwens', 'L.'), A('Vroome', 'E. M. M.', 'de')]);
  assert.equal(r.bron.jaar, 2025);
  assert.equal(r.bron.titel, 'Arbobalans 2024');
  assert.equal(apaVerwijzing(r.bron),
    'Heuvel, S. G. van den, Bouwens, L., & Vroome, E. M. M. de. (2025). *Arbobalans 2024* (Rapportnr. TNO 2025 R11108). TNO. https://monitorarbeid.tno.nl/publicaties/arbobalans-2024/');
  r = leesApaVerwijzing('Schaufeli, W. B., Desart, S., & De Witte, H. (2020). Burnout Assessment Tool (BAT)—Development, Validity, and Reliability. International Journal of Environmental Research and Public Health, 17(24), 9495. https://doi.org/10.3390/ijerph17249495');
  assert.deepEqual(r.bron.auteurs, [A('Schaufeli', 'W. B.'), A('Desart', 'S.'), A('De Witte', 'H.')], 'een geplakte "De Witte, H." blijft "De Witte, H."');
  assert.equal(r.bron.soort, 'artikel');
  r = leesApaVerwijzing('Meulen-de Vries, G. H. van der. (2022). Werken in de zorg. Boom.');
  assert.deepEqual(r.bron.auteurs, [A('Meulen-de Vries', 'G. H.', 'van der')]);
  assert.equal(r.bron.titel, 'Werken in de zorg');
  r = leesApaVerwijzing("Ancona, J. d'. (2022). Werken in de zorg. Boom.");
  assert.deepEqual(r.bron.auteurs, [A('Ancona', 'J.', "d'")]);
  assert.equal(apaVerwijzing(r.bron), "Ancona, J. d'. (2022). *Werken in de zorg*. Boom.");
  // De oude vorm zonder punt wordt ook nog gelezen
  r = leesApaVerwijzing('Rocher, L., Hendrickx, J. M., & Montjoye, Y.-A. de (2019). Estimating the success of re-identifications. Nature Communications, 10(1), 3069.');
  assert.deepEqual(r.bron.auteurs, [A('Rocher', 'L.'), A('Hendrickx', 'J. M.'), A('Montjoye', 'Y.-A.', 'de')]);
});

test('voorletters', () => {
  assert.equal(voorletters('Arnold Bernard'), 'A. B.');
  assert.equal(voorletters('A.B.'), 'A. B.');
  assert.equal(voorletters('Jan-Willem'), 'J.-W.');
  assert.equal(voorletters('J.P.M.'), 'J. P. M.');
  assert.equal(voorletters('J.-W.'), 'J.-W.');
  assert.equal(voorletters('Th.'), 'Th.');
  assert.equal(voorletters('AB'), 'A. B.');
});

test('citeersleutels: basis, vrij en botsing', () => {
  assert.equal(citeersleutelBasis(GOUDEN.bakker), 'bakker2017');
  assert.equal(citeersleutelBasis(GOUDEN.cbs), 'cbs2024');
  assert.equal(citeersleutelBasis({ ...GOUDEN.vries, jaar: 2020 }), 'vries2020');
  assert.equal(citeersleutelBasis(GOUDEN.vries), 'vrieszd');
  assert.equal(citeersleutelBasis({ organisatie: 'TNO', jaar: 2023 }), 'tno2023');
  assert.equal(citeersleutelBasis(GOUDEN.arbowet), 'arbeidsomstandighede1998');
  assert.equal(citeersleutelBasis({ auteurs: [A('Øster-Ålund', 'K.')], jaar: 2001 }), 'osteralund2001');
  for (const b of Object.values(GOUDEN)) assert.match(citeersleutelBasis(b), CITEERSLEUTEL);
  assert.equal(vrijeCiteersleutel('bakker2017', new Set()), 'bakker2017');
  assert.equal(vrijeCiteersleutel('bakker2017', new Set(['bakker2017'])), 'bakker2017b');
  assert.equal(vrijeCiteersleutel('bakker2017', new Set(['bakker2017', 'bakker2017b'])), 'bakker2017c');
});

test('criterium 2: "Plak een verwijzing" herkent de zes gouden invoeren', () => {
  const velden = (r) => ({
    soort: r.bron.soort, auteurs: r.bron.auteurs.map((a) => `${a.tussenvoegsel ? `${a.tussenvoegsel} ` : ''}${a.achternaam}, ${a.voorletters}`),
    organisatie: r.bron.organisatie, jaar: r.bron.jaar, titel: r.bron.titel, tijdschrift: r.bron.details.tijdschrift ?? '',
    jaargang: r.bron.details.jaargang ?? '', nummer: r.bron.details.nummer ?? '', paginas: r.bron.details.paginas ?? '', doi: r.bron.doi, url: r.bron.url,
  });
  // 1. Google Scholar, knop Citeer (APA): alleen de beginpagina, geen DOI
  let r = leesApaVerwijzing('Bakker, A. B., & Demerouti, E. (2017). Job demands–resources theory: Taking stock and looking forward. Journal of occupational health psychology, 22(3), 273.');
  assert.deepEqual(velden(r), {
    soort: 'artikel', auteurs: ['Bakker, A. B.', 'Demerouti, E.'], organisatie: '', jaar: 2017, titel: 'Job demands–resources theory: Taking stock and looking forward',
    tijdschrift: 'Journal of occupational health psychology', jaargang: '22', nummer: '3', paginas: '273', doi: '', url: '',
  });
  assert.deepEqual(r.ontbreekt, ['DOI of link']);
  // 2. Organisatie als auteur, rapport met een link
  r = leesApaVerwijzing('Centraal Bureau voor de Statistiek. (2024). Ziekteverzuim in Nederland 2023. https://www.cbs.nl/nl-nl/publicatie/2024/12/ziekteverzuim-2023');
  assert.deepEqual(velden(r), {
    soort: 'rapport', auteurs: [], organisatie: 'Centraal Bureau voor de Statistiek', jaar: 2024, titel: 'Ziekteverzuim in Nederland 2023',
    tijdschrift: '', jaargang: '', nummer: '', paginas: '', doi: '', url: 'https://www.cbs.nl/nl-nl/publicatie/2024/12/ziekteverzuim-2023',
  });
  assert.equal(r.bron.taal, 'nl');
  // 3. Boek met (3e dr.) en tussenvoegsel de
  r = leesApaVerwijzing('Vries, J. de (2019). Praktisch HR-onderzoek (3e dr.). Boom.');
  assert.deepEqual(velden(r), {
    soort: 'boek', auteurs: ['de Vries, J.'], organisatie: '', jaar: 2019, titel: 'Praktisch HR-onderzoek',
    tijdschrift: '', jaargang: '', nummer: '', paginas: '', doi: '', url: '',
  });
  assert.equal(r.bron.details.druk, '3');
  assert.equal(r.bron.details.uitgever, 'Boom');
  assert.equal(apaVerwijzing(r.bron), 'Vries, J. de. (2019). *Praktisch HR-onderzoek* (3e dr.). Boom.');
  // 4. DOI als link
  r = leesApaVerwijzing('Schaufeli, W. B., & Bakker, A. B. (2004). Job demands, job resources, and their relationship with burnout and engagement: A multi-sample study. Journal of Organizational Behavior, 25(3), 293–315. https://doi.org/10.1002/job.248');
  assert.deepEqual(velden(r), {
    soort: 'artikel', auteurs: ['Schaufeli, W. B.', 'Bakker, A. B.'], organisatie: '', jaar: 2004,
    titel: 'Job demands, job resources, and their relationship with burnout and engagement: A multi-sample study',
    tijdschrift: 'Journal of Organizational Behavior', jaargang: '25', nummer: '3', paginas: '293–315', doi: '10.1002/job.248', url: '',
  });
  assert.equal(r.bron.taal, 'en');
  assert.deepEqual(r.ontbreekt, []);
  // 5. Nederlandse lijst met "en"
  r = leesApaVerwijzing('Jansen, P., Vries, M. de en Bos, K. L. (2023). Werkdruk in de zorg (Rapportnr. 2023-R101). TNO. https://example.org/r');
  assert.deepEqual(velden(r), {
    soort: 'rapport', auteurs: ['Jansen, P.', 'de Vries, M.', 'Bos, K. L.'], organisatie: 'TNO', jaar: 2023, titel: 'Werkdruk in de zorg',
    tijdschrift: '', jaargang: '', nummer: '', paginas: '', doi: '', url: 'https://example.org/r',
  });
  assert.equal(apaVerwijzing(r.bron), apaVerwijzing(GOUDEN.jansen));
  // 6. Hoofdstuk met (Red.)
  r = leesApaVerwijzing('Smit, A. (2021). Onboarding als proces. In B. Kok & C. van den Berg (Red.), Handboek HRM (pp. 45–67). Noordhoff.');
  assert.deepEqual(velden(r), {
    soort: 'hoofdstuk', auteurs: ['Smit, A.'], organisatie: '', jaar: 2021, titel: 'Onboarding als proces',
    tijdschrift: '', jaargang: '', nummer: '', paginas: '45–67', doi: '', url: '',
  });
  assert.equal(apaVerwijzing(r.bron), apaVerwijzing(GOUDEN.smit));
  assert.ok(r.zeker.includes('redacteuren') && r.zeker.includes('boektitel'));
});

test('"Plak een verwijzing": website, wet en lege invoer', () => {
  let r = leesApaVerwijzing('Arboportaal. (2024, 5 maart). Werkdruk. Geraadpleegd op 20 november 2026, van https://www.arboportaal.nl/onderwerpen/werkdruk');
  assert.equal(r.bron.soort, 'website');
  assert.equal(apaVerwijzing({ ...r.bron, details: { ...r.bron.details, sitenaam: 'Arboportaal' } }), apaVerwijzing(GOUDEN.arboportaal));
  r = leesApaVerwijzing('Arbeidsomstandighedenwet. (1998). https://wetten.overheid.nl/BWBR0010346');
  assert.equal(r.bron.soort, 'wet');
  assert.equal(apaVerwijzing(r.bron), apaVerwijzing(GOUDEN.arbowet));
  r = leesApaVerwijzing('   ');
  assert.deepEqual(r.zeker, []);
  assert.equal(r.meldingen.length, 1);
});

test('normaliseer, datums, auteursregel en dubbele bronnen', () => {
  assert.equal(normaliseer('Ziekteverzuim & Bevlogenheid — café’s'), 'ziekteverzuim bevlogenheid cafes');
  assert.equal(normaliseer('Straße Æon œuvre Ørsted ĳs'), 'strasse aeon oeuvre orsted ijs');
  assert.equal(nlDatumKort('2024-03-05'), '5 maart 2024');
  assert.equal(nlDatumKort('2024-03'), 'maart 2024');
  assert.equal(auteursRegel(GOUDEN.bakker), 'Bakker, A. B., & Demerouti, E.');
  assert.equal(auteursRegel(GOUDEN.cbs), 'Centraal Bureau voor de Statistiek');
  const bestaand = [{ id: 1, doi: '10.1037/OCP0000056', titel: 'X', jaar: 2017 }, { id: 2, titel: 'Werkdruk in de zorg', jaar: 2023 }];
  assert.equal(dubbeleVan({ doi: 'https://doi.org/10.1037/ocp0000056' }, bestaand).id, 1);
  assert.equal(dubbeleVan({ titel: 'Werkdruk in de Zorg!', jaar: 2023 }, bestaand).id, 2);
  assert.equal(dubbeleVan({ titel: 'Werkdruk in de zorg', jaar: 2024 }, bestaand), null);
});

test('startcollectie: een record van het onderzoeksteam omzetten', () => {
  const { bron, meldingen, fouten } = normaliseerStartbron({
    titel: 'Job demands-resources theory: Taking stock and looking forward', auteurs: ['Bakker, A. B.', 'Demerouti, E.'], jaar: 2017,
    soort: 'journal article', taal: 'Engels', doi: 'https://doi.org/10.1037/ocp0000056', onderwerpen: ['werkdruk', 'Tevredenheid en betrokkenheid', 'Burn-out'],
    samenvatting: 'Kort.', kernpunten: ['Een', 'Twee'], betrouwbaarheid: { niveau: 'high', toelichting: 'Peer-reviewed.' },
    tijdschrift: 'Journal of Occupational Health Psychology', jaargang: 22, nummer: '3', paginas: '273-285', uitgever: 'APA',
    gecontroleerd_op: '2026-11-27', gecontroleerd_door: 'Onderzoeksteam',
  });
  assert.deepEqual(fouten, []);
  assert.equal(bron.soort, 'artikel');
  assert.equal(bron.taal, 'en');
  assert.equal(bron.doi, '10.1037/ocp0000056');
  assert.deepEqual(bron.onderwerpen, ['werkdruk', 'tevredenheid']);
  assert.deepEqual(bron.trefwoorden, ['Burn-out']);
  assert.ok(meldingen.some((m) => m.includes('Burn-out') && m.includes('trefwoord')));
  assert.ok(meldingen.some((m) => m.includes('uitgever')), 'een veld dat niet bij de soort hoort wordt gemeld');
  assert.equal(bron.betrouwbaarheid, 'hoog');
  assert.equal(bron.betrouwbaarheid_toelichting, 'Peer-reviewed.');
  assert.deepEqual(bron.details, {
    tijdschrift: 'Journal of Occupational Health Psychology', jaargang: '22', nummer: '3', paginas: '273–285', gecontroleerd_op: '2026-11-27', gecontroleerd_door: 'Onderzoeksteam',
  });
  assert.equal(apaVerwijzing(bron), apaVerwijzing(GOUDEN.bakker));

  // Organisatie als auteur, http en harde fouten
  let r = normaliseerStartbron({ titel: 'Monitor', auteurs: ['Centraal Bureau voor de Statistiek'], afkorting: 'CBS', jaar: '2024', soort: 'Rapport of onderzoek', url: 'http://www.cbs.nl/x', onderwerpen: ['verzuim-vitaliteit'], betrouwbaarheid: 'Redelijk: bekend instituut' });
  assert.deepEqual(r.fouten, []);
  assert.equal(r.bron.organisatie, 'Centraal Bureau voor de Statistiek');
  assert.deepEqual(r.bron.auteurs, []);
  assert.deepEqual(r.bron.onderwerpen, ['verzuim']);
  assert.equal(r.bron.betrouwbaarheid, 'redelijk');
  assert.equal(r.bron.betrouwbaarheid_toelichting, 'bekend instituut');
  assert.ok(r.meldingen.some((m) => m.includes('http://')));
  r = normaliseerStartbron({ soort: 'iets', onderwerpen: ['onbekend'] });
  assert.equal(r.fouten.length, 4, r.fouten.join(' | '));
  // Lange velden worden ingekort, met een melding
  r = normaliseerStartbron({ titel: 'T', soort: 'boek', url: 'https://x.nl', onderwerpen: ['methode'], samenvatting: 'x'.repeat(4100) });
  assert.equal(r.bron.samenvatting.length, 4000);
  assert.ok(r.meldingen.some((m) => m.includes('ingekort')));
});

test('startcollectie: de onderwerp-sleutels en bron_details van het onderzoeksteam', () => {
  // Zo levert het onderzoeksteam (bronnen/startcollectie.json): eigen sleutels voor onderwerpen en de
  // tijdschriftgegevens als vrije tekst in bron_details.
  const record = (extra) => ({
    titel: 'Survey response rates: Trends and a validity assessment framework', auteurs: ['Holtom, B.', 'Baruch, Y.'], jaar: 2022,
    soort: 'wetenschappelijk artikel', taal: 'en', doi: '10.1177/00187267211070769', geraadpleegd: '2026-11-27', ...extra,
  });
  let r = normaliseerStartbron(record({
    onderwerpen: ['onderzoeksmethode', 'privacy-ethiek', 'tevredenheid-bevlogenheid', 'vertrek-verloop', 'diversiteit-inclusie', 'wet-regelgeving', 'werkdruk-werkstress'],
    bron_details: 'Human Relations, 75(8), 1560–1584',
  }));
  assert.deepEqual(r.fouten, []);
  // wet-regelgeving is sinds P7 een vast onderwerp (besluit van het onderzoeksteam): geen trefwoord meer
  assert.deepEqual(r.bron.onderwerpen, ['methode', 'privacy', 'tevredenheid', 'vertrek', 'sociale-veiligheid', 'wetgeving', 'werkdruk']);
  assert.deepEqual(r.bron.trefwoorden, []);
  assert.ok(!r.meldingen.some((m) => m.includes('"wet-regelgeving"')));
  assert.ok(!r.meldingen.some((m) => m.includes('geraadpleegd')), 'geraadpleegd valt bij een artikel stil weg');
  assert.deepEqual(r.bron.details, { tijdschrift: 'Human Relations', jaargang: '75', nummer: '8', paginas: '1560–1584' });
  assert.equal(apaVerwijzing(r.bron),
    'Holtom, B., & Baruch, Y. (2022). Survey response rates: Trends and a validity assessment framework. *Human Relations, 75*(8), 1560–1584. https://doi.org/10.1177/00187267211070769');
  // Een record met alleen een onbekend onderwerp blijft een harde fout (vraag het onderzoeksteam)
  r = normaliseerStartbron(record({ onderwerpen: ['astrologie'], bron_details: 'Human Relations, 75(8), 1560–1584' }));
  assert.deepEqual(r.fouten, ['Geen onderwerp uit de vaste lijst.']);
  // Een toelichting na het tijdschriftdeel wordt gemeld, niet overgenomen
  r = normaliseerStartbron(record({ onderwerpen: ['statistiek'], bron_details: 'International Review of Social Psychology, 30(1), 92–101. In 2022 is een correctie verschenen.' }));
  assert.deepEqual(r.bron.details, { tijdschrift: 'International Review of Social Psychology', jaargang: '30', nummer: '1', paginas: '92–101' });
  assert.ok(r.meldingen.some((m) => m.includes('niet overgenomen: "In 2022 is een correctie verschenen."')));
  // Artikelnummers
  assert.deepEqual(normaliseerStartbron(record({ onderwerpen: ['methode'], bron_details: 'BMC Health Services Research, 9(1), artikel 160' })).bron.details,
    { tijdschrift: 'BMC Health Services Research', jaargang: '9', nummer: '1', artikelnummer: '160' });
  assert.deepEqual(normaliseerStartbron(record({ onderwerpen: ['methode'], bron_details: 'Frontiers in Psychology, 4, artikel 863' })).bron.details,
    { tijdschrift: 'Frontiers in Psychology', jaargang: '4', artikelnummer: '863' });
  // Losse velden gaan voor; bij andere soorten wordt bron_details niet gelezen
  r = normaliseerStartbron(record({ onderwerpen: ['methode'], tijdschrift: 'Human Relations', jaargang: '75', bron_details: 'Iets anders, 1(1), 1–2' }));
  assert.deepEqual(r.bron.details, { tijdschrift: 'Human Relations', jaargang: '75' });
  assert.ok(r.meldingen.some((m) => m.includes('niet gebruikt')));
  r = normaliseerStartbron({ titel: 'Cao-lonen 2025', organisatie: 'CBS', jaar: 2025, soort: 'website', url: 'https://www.cbs.nl/x', onderwerpen: ['arbeidsvoorwaarden'], bron_details: 'CBS-nieuwsbericht, 31-12-2025.' });
  assert.deepEqual(r.fouten, []);
  assert.equal(r.bron.details.tijdschrift, undefined);
  // Sinds P7: bij een webpagina wordt alleen de ondubbelzinnige datum gelezen (zie de tests van leesStartDetails)
  assert.equal(r.bron.details.datum, '2025-12-31');
  assert.ok(r.meldingen.some((m) => m.startsWith('Uit bron_details overgenomen: datum "2025-12-31"')));
  r = normaliseerStartbron(record({ onderwerpen: ['methode'], bron_details: 'Zonder jaargang' }));
  assert.deepEqual(r.bron.details, {});
  assert.ok(r.meldingen.some((m) => m.includes('geen tijdschrift met jaargang')));
  // Andere namen; niets raden
  assert.equal(onderwerpUitTekst('Onderzoeksmethode'), 'methode');
  assert.equal(onderwerpUitTekst('Tevredenheid en betrokkenheid'), 'tevredenheid');
  assert.equal(onderwerpUitTekst('wet-regelgeving'), 'wetgeving');
  assert.equal(onderwerpUitTekst('Wet- en regelgeving'), 'wetgeving');
  assert.equal(onderwerpUitTekst('regelgeving'), 'wetgeving');
  assert.equal(onderwerpUitTekst('wet'), null, 'te algemeen: niet raden');
  assert.equal(onderwerpUitTekst('toString'), null);
});

test('leesTijdschriftDeel: pagina\'s, artikelnummers en geen tijdschrift', () => {
  assert.deepEqual(leesTijdschriftDeel('Journal of Applied Psychology, 91(2), 392-413.'), { tijdschrift: 'Journal of Applied Psychology', jaargang: '91', nummer: '2', paginas: '392–413' });
  assert.deepEqual(leesTijdschriftDeel('PLOS ONE, 12(10), e0184594'), { tijdschrift: 'PLOS ONE', jaargang: '12', nummer: '10', artikelnummer: 'e0184594' });
  assert.deepEqual(leesTijdschriftDeel('Journal of Public Health Management and Practice, 23(4), e1–e4'),
    { tijdschrift: 'Journal of Public Health Management and Practice', jaargang: '23', nummer: '4', paginas: 'e1–e4' }, 'een reeks zijn pagina\'s');
  assert.deepEqual(leesTijdschriftDeel('Tijdschrift voor HRM, 22, Artikel e123'), { tijdschrift: 'Tijdschrift voor HRM', jaargang: '22', artikelnummer: 'e123' });
  assert.deepEqual(leesTijdschriftDeel('Behavioral Sciences, 13(3), 244'), { tijdschrift: 'Behavioral Sciences', jaargang: '13', nummer: '3', paginas: '244' });
  assert.equal(leesTijdschriftDeel('Boom'), null);
  assert.equal(leesTijdschriftDeel(''), null);
});

// ---------- Besluiten van het onderzoeksteam bij de startcollectie (BOUWPLAN P7, besluiten a–d) ----------

const startWebpagina = (extra) => ({
  titel: 'Cao-lonen stijgen in 2025 met 5,0 procent', auteurs: [], organisatie: 'Centraal Bureau voor de Statistiek (CBS)', jaar: 2025,
  soort: 'website', taal: 'nl', url: 'https://www.cbs.nl/nl-nl/nieuws/2026/01/cao-lonen-stijgen-in-2025-met-5-0-procent', doi: '',
  onderwerpen: ['arbeidsvoorwaarden'], betrouwbaarheid: 'overheid', geraadpleegd: '2026-11-27',
  bron_details: 'CBS-nieuwsbericht, 31-12-2025. Cao-lonen per uur inclusief bijzondere beloningen.', relevantie: 'x', open_access: true, ...extra,
});

test('startcollectie (b): de betrouwbaarheid van het onderzoeksteam wordt een niveau', () => {
  const art = { titel: 'T', auteurs: ['Bakker, A. B.'], jaar: 2017, soort: 'wetenschappelijk artikel', doi: '10.1037/ocp0000056', onderwerpen: ['werkdruk'] };
  let r = normaliseerStartbron({ ...art, betrouwbaarheid: 'peer-reviewed' });
  assert.equal(r.bron.betrouwbaarheid, 'hoog');
  assert.match(r.bron.betrouwbaarheid_toelichting, /peer review/);
  // overheid: het CBS is officiële statistiek (hoog), andere overheid redelijk
  r = normaliseerStartbron(startWebpagina());
  assert.equal(r.bron.betrouwbaarheid, 'hoog');
  assert.equal(r.bron.betrouwbaarheid_toelichting, 'Officiële statistiek van het CBS.');
  r = normaliseerStartbron(startWebpagina({ organisatie: 'Centraal Bureau voor de Statistiek' }));
  assert.equal(r.bron.betrouwbaarheid, 'hoog', 'ook zonder afkorting');
  for (const organisatie of ['Autoriteit Persoonsgegevens', 'Sociaal-Economische Raad (SER)', 'Nederlandse Arbeidsinspectie',
    'Ministerie van Sociale Zaken en Werkgelegenheid (Arboportaal)', 'TNO en CBS']) {
    r = normaliseerStartbron(startWebpagina({ organisatie }));
    assert.equal(r.bron.betrouwbaarheid, 'redelijk', organisatie);
    assert.equal(r.bron.betrouwbaarheid_toelichting, 'Informatie van een overheidsorganisatie.');
  }
  r = normaliseerStartbron(startWebpagina({ organisatie: 'TNO', betrouwbaarheid: 'Kennisinstituut' }));
  assert.equal(r.bron.betrouwbaarheid, 'redelijk');
  assert.equal(r.bron.betrouwbaarheid_toelichting, 'Publicatie van een kennisinstituut.');
  r = normaliseerStartbron(startWebpagina({ organisatie: 'TNO en CBS', betrouwbaarheid: 'kennisinstituut' }));
  assert.equal(r.bron.betrouwbaarheid, 'redelijk', 'kennisinstituut blijft redelijk, ook samen met het CBS');
  // Een eigen toelichting in het record gaat voor; de oude vormen werken nog
  r = normaliseerStartbron({ ...art, betrouwbaarheid: 'peer-reviewed', betrouwbaarheid_toelichting: 'Meta-analyse.' });
  assert.equal(r.bron.betrouwbaarheid_toelichting, 'Meta-analyse.');
  assert.equal(normaliseerStartbron({ ...art, betrouwbaarheid: 'hoog' }).bron.betrouwbaarheid, 'hoog');
  r = normaliseerStartbron({ ...art, betrouwbaarheid: 'blog' });
  assert.equal(r.bron.betrouwbaarheid, 'onbekend');
  assert.equal(r.bron.betrouwbaarheid_toelichting, 'blog');
});

test('startcollectie: een afkorting tussen haakjes achter de organisatie wordt de afkorting (APA)', () => {
  const { bron, fouten } = normaliseerStartbron(startWebpagina());
  assert.deepEqual(fouten, []);
  assert.equal(bron.organisatie, 'Centraal Bureau voor de Statistiek');
  assert.equal(bron.afkorting, 'CBS');
  assert.equal(citeersleutelBasis(bron), 'cbs2025');
  const eerste = new Set();
  assert.equal(apaInTekst([{ bron: { ...bron, citeersleutel: 'cbs2025' } }], { eersteKeer: eerste }), '(Centraal Bureau voor de Statistiek [CBS], 2025)');
  assert.equal(apaInTekst([{ bron: { ...bron, citeersleutel: 'cbs2025' } }], { eersteKeer: eerste }), '(CBS, 2025)');
  assert.equal(apaKort(bron), '(CBS, 2025)', 'zoals bij een vergelijkingswaarde: "Ter vergelijking: 5,0% (CBS, 2025)"');
  assert.equal(normaliseerStartbron(startWebpagina({ organisatie: 'Sociaal-Economische Raad (SER)' })).bron.afkorting, 'SER');
  // Een andere afkorting in het record: niets splitsen, wel melden
  let r = normaliseerStartbron(startWebpagina({ afkorting: 'KCV' }));
  assert.equal(r.bron.organisatie, 'Centraal Bureau voor de Statistiek (CBS)');
  assert.equal(r.bron.afkorting, 'KCV');
  assert.ok(r.meldingen.some((m) => m.includes('niet als afkorting of website is herkend')));
  // Geen afkorting (kleine letters) en geen website met die naam: zo laten, met een melding
  r = normaliseerStartbron(startWebpagina({ organisatie: 'Stichting Voorbeeld (Utrecht)', bron_details: '' }));
  assert.equal(r.bron.organisatie, 'Stichting Voorbeeld (Utrecht)');
  assert.equal(r.bron.afkorting, '');
  assert.ok(r.meldingen.some((m) => m.includes('"Stichting Voorbeeld (Utrecht)"')));
  // De naam van de website tussen haakjes, en bron_details noemt dezelfde website: auteur + website (APA)
  r = normaliseerStartbron(startWebpagina({
    titel: 'Psychosociale arbeidsbelasting (PSA)', organisatie: 'Ministerie van Sociale Zaken en Werkgelegenheid (Arboportaal)', jaar: 2026,
    url: 'https://www.arboportaal.nl/onderwerpen/psychosociale-arbeidsbelasting',
    bron_details: 'Themapagina op Arboportaal, de arbosite van het Ministerie van SZW. Laatst gewijzigd 12 augustus 2026 volgens de paginametadata (geen zichtbare datum).',
  }));
  assert.equal(r.bron.organisatie, 'Ministerie van Sociale Zaken en Werkgelegenheid');
  assert.deepEqual(r.bron.details, { sitenaam: 'Arboportaal', geraadpleegd: '2026-11-27' });
  // Besluit 7: de datum staat alleen in de metadata, dus z.d. met de raadpleegdatum
  assert.equal(r.bron.jaar, null);
  assert.equal(apaVerwijzing(r.bron), 'Ministerie van Sociale Zaken en Werkgelegenheid. (z.d.). *Psychosociale arbeidsbelasting (PSA)*. Arboportaal. '
    + 'Geraadpleegd op 27 november 2026, van https://www.arboportaal.nl/onderwerpen/psychosociale-arbeidsbelasting');
  assert.ok(r.meldingen.some((m) => m.includes('alleen in de metadata')), 'een datum uit de metadata wordt niet gebruikt');
});

test('startcollectie (c): leesStartDetails leest alleen wat ondubbelzinnig in bron_details staat', () => {
  const web = (tekst, jaar = 2025, organisatie = 'Centraal Bureau voor de Statistiek') => leesStartDetails(tekst, { soort: 'website', jaar, organisatie });
  assert.deepEqual(web('CBS-nieuwsbericht, 31-12-2025. Cao-lonen per uur.').velden, { datum: '2025-12-31' });
  assert.deepEqual(web('CBS-nieuwsbericht, 10-2-2026, op basis van de publicatie X.', 2026).velden, { datum: '2026-02-10' });
  assert.deepEqual(web('Nieuwsbericht op TNO Monitor Arbeid, 22 januari 2024, over het rapport (publicatiepagina 13 december 2023).', 2024, 'TNO').velden,
    { datum: '2024-01-22', sitenaam: 'TNO Monitor Arbeid' }, 'de eerste datum, direct na het nieuwsbericht');
  assert.deepEqual(web('Webpagina van de Autoriteit Persoonsgegevens, thema Basis AVG. Pagina bijgewerkt op 16 september 2026. Artikel 4 AVG.', 2026, 'Autoriteit Persoonsgegevens').velden,
    { datum: '2026-09-16' });
  // Niet: een datum die alleen in de metadata staat, een datum in een ander jaar, een datum die niet bestaat, geen datum
  let r = web('Webpagina van de Nederlandse Arbeidsinspectie. Laatst gewijzigd 9 september 2026 volgens de paginametadata (geen zichtbare datum op de pagina).', 2026);
  assert.deepEqual(r.velden, {});
  assert.ok(r.meldingen.some((m) => m.includes('alleen in de metadata')));
  assert.equal(r.zonderDatum, true, 'besluit 7: de bron krijgt z.d.');
  r = web('CBS-nieuwsbericht, 31-12-2025.', 2026);
  assert.deepEqual(r.velden, {});
  assert.ok(r.meldingen.some((m) => m.includes('past niet bij het jaar 2026')));
  assert.deepEqual(web('CBS-nieuwsbericht, 31-2-2025.').velden, {});
  assert.deepEqual(web('CBS-nieuwsbericht, 1-1-20251.').velden, {}, 'geen half getal');
  r = web('Webpagina van de SER, thema Medezeggenschap. Geen publicatiedatum vermeld (z.d.; geraadpleegd 27-11-2026).', null, 'Sociaal-Economische Raad');
  assert.deepEqual(r.velden, {});
  assert.ok(r.meldingen.some((m) => m.startsWith('Uit bron_details is niets overgenomen')));
  assert.deepEqual(web('Webpagina op Arboportaal (Ministerie van SZW), onderdeel RI&E.', 2026, 'Ministerie').velden, { sitenaam: 'Arboportaal' });
  assert.deepEqual(web('Nieuwsbericht op CBS, 14-8-2025.', 2025, 'CBS').velden, { datum: '2025-08-14' }, 'website = auteur: geen aparte naam');
  // Rapporten: alleen het rapportnummer
  const rapport = (tekst) => leesStartDetails(tekst, { soort: 'rapport', jaar: 2021, organisatie: 'TNO' }).velden;
  assert.deepEqual(rapport('TNO-rapport TNO 2021 R11794 (publicatiepagina 29 november 2021), 156 pagina\'s.'), { rapportnummer: 'TNO 2021 R11794' });
  assert.deepEqual(rapport('TNO-rapport TNO 2025 R11108, mei 2025 (publicatiepagina 28 mei 2025), Leiden.'), { rapportnummer: 'TNO 2025 R11108' });
  assert.deepEqual(rapport('SER-advies 22/03, maart 2022, aan de minister van Sociale Zaken en Werkgelegenheid, Den Haag.'), { rapportnummer: '22/03' });
  assert.deepEqual(rapport('Rapport 2023-R101, juni 2023.'), { rapportnummer: '2023-R101' });
  assert.deepEqual(rapport('Rapport 2021-07, juni 2021.'), {}, 'kan ook jaar en maand zijn: niet raden (review P7)');
  assert.deepEqual(rapport('TNO-rapport over werkdruk in 2021, juni.'), {}, 'geen nummer: niets raden');
  assert.deepEqual(rapport('TNO-factsheet bij de Week van de werkstress 2026 (publicatiepagina 9 november 2026), 3 pagina\'s.'), {});
  assert.deepEqual(rapport('TNO en CBS, april 2026 (publicatiepagina 15 april 2026), Leiden/Heerlen.'), {});
  assert.deepEqual(rapport('Statistische Trends, CBS, publicatiedatum 21-10-2025 (online longread).'), {}, 'geen datum bij een rapport');
  // Andere soorten: niets
  r = leesStartDetails('CBS StatLine-tabel 80072NED, gewijzigd op 17-11-2026.', { soort: 'cijfers', jaar: 2026 });
  assert.deepEqual(r.velden, {});
  assert.equal(r.meldingen.length, 1);
  assert.deepEqual(leesStartDetails('', { soort: 'website' }), { velden: {}, meldingen: [] });
});

test('startcollectie (c): geen jaartal of datum als rapportnummer en geen webadres als naam van de website (review P7)', () => {
  const rapport = (tekst) => leesStartDetails(tekst, { soort: 'rapport', jaar: 2021, organisatie: 'TNO' });
  for (const tekst of [
    'Rapport 2023, Den Haag.', 'SER-advies 2022, maart 2022.', 'TNO-rapport 2021 (publicatiepagina 29 november 2021).',
    'Advies 3 november 2020, aan de minister.', 'Rapport 10-11-2026, Den Haag.', 'Rapport 10/11/2026, Den Haag.', 'Advies Maart 2022, SER.',
    'Rapport Den Haag 2023, intern.', 'TNO-rapport COVID-19, juni 2021.',
  ]) {
    const r = rapport(tekst);
    assert.deepEqual(r.velden, {}, tekst);
    assert.ok(r.meldingen.some((m) => m.includes('geen rapportnummer; niet overgenomen')), tekst);
    assert.ok(r.meldingen.some((m) => m.startsWith('Uit bron_details is niets overgenomen')), tekst);
  }
  assert.deepEqual(rapport('TNO-rapport 2e druk, 2021.').velden, {});
  // Wel: een letter direct voor de cijfers of één schuine streep (zoals in de startcollectie)
  assert.deepEqual(rapport('TNO-rapport TNO 2021 R11794 (publicatiepagina 29 november 2021).').velden, { rapportnummer: 'TNO 2021 R11794' });
  assert.deepEqual(rapport('SER-advies 22/03, maart 2022.').velden, { rapportnummer: '22/03' });
  // De naam van de website: geen webadres, geen "www", geen gewone woorden; niet als die gelijk is aan de auteur of de afkorting
  const web = (tekst, opties = {}) => leesStartDetails(tekst, { soort: 'website', jaar: 2026, organisatie: 'Ministerie van SZW', ...opties });
  for (const tekst of ['Webpagina op www.arboportaal.nl, onderdeel RI&E.', 'Webpagina op arboportaal.nl (Ministerie van SZW).',
    'Nieuwsbericht op www.cbs.nl, 3-4-2026.', 'Webpagina op de website van het ministerie, onderdeel RI&E.']) {
    const r = web(tekst);
    assert.equal(r.velden.sitenaam, undefined, tekst);
    assert.ok(r.meldingen.some((m) => m.includes('lijkt geen naam van een website')), tekst);
  }
  assert.deepEqual(web('Nieuwsbericht op www.cbs.nl, 3-4-2026.').velden, { datum: '2026-04-03' }, 'de datum blijft wel');
  assert.deepEqual(web('Webpagina op Arboportaal. Laatst gewijzigd volgens de paginametadata.').velden, { sitenaam: 'Arboportaal' }, 'een punt aan het eind van de zin');
  const cbs = { organisatie: 'Centraal Bureau voor de Statistiek', afkorting: 'CBS' };
  let r = web('Nieuwsbericht op CBS, 3-4-2026.', cbs);
  assert.deepEqual(r.velden, { datum: '2026-04-03' }, 'website = afkorting van de auteur: geen aparte naam');
  assert.ok(!r.meldingen.some((m) => m.includes('lijkt geen naam')));
  assert.deepEqual(web('Nieuwsbericht op Centraal Bureau voor de Statistiek, 3-4-2026.', cbs).velden, { datum: '2026-04-03' });
  // In de omgezette bron: de afkorting tussen haakjes telt mee, en APA noemt de website dan niet nog een keer
  r = normaliseerStartbron(startWebpagina({ jaar: 2026, bron_details: 'Nieuwsbericht op CBS, 3-4-2026.' }));
  assert.deepEqual(r.bron.details, { datum: '2026-04-03' }, 'besluit 7: een gedateerd nieuwsbericht zonder raadpleegdatum');
  assert.ok(apaVerwijzing(r.bron).startsWith('Centraal Bureau voor de Statistiek. (2026, 3 april). *Cao-lonen stijgen in 2025 met 5,0 procent*. https://'));
});

test('alle vaste onderwerpen samen mogen (LIMIETEN.onderwerpen volgt ONDERWERPEN; review P7)', () => {
  const alle = Object.keys(ONDERWERPEN);
  assert.equal(LIMIETEN.onderwerpen, alle.length);
  assert.equal(alle.length, 17);
  const bron = controleerBron({ soort: 'website', titel: 'Test', url: 'https://example.org', onderwerpen: alle });
  assert.deepEqual(bron.onderwerpen, alle);
  assert.throws(() => controleerBron({ soort: 'website', titel: 'Test', url: 'https://example.org', onderwerpen: [...alle, 'verzuim'] }),
    (e) => e.status === 400 && e.message === 'Kies onderwerpen uit de lijst.', 'meer dan er zijn kan niet');
  assert.throws(() => controleerBron({ soort: 'website', titel: 'Test', url: 'https://example.org', onderwerpen: ['astrologie'] }), (e) => e.status === 400);
  // Ook een startbron met alle onderwerpen houdt ze allemaal (niets stil ingekort)
  const r = normaliseerStartbron(startWebpagina({ onderwerpen: alle }));
  assert.deepEqual(r.bron.onderwerpen, alle);
  assert.deepEqual(controleerBron(r.bron).onderwerpen, alle);
});

test('startcollectie (c, d): bron_details en geraadpleegd in de omgezette bron', () => {
  // Webpagina: de datum van het nieuwsbericht, en dan geen raadpleegdatum (besluit 7, APA 7); de rest van bron_details wordt gemeld
  let r = normaliseerStartbron(startWebpagina());
  assert.deepEqual(r.fouten, []);
  assert.deepEqual(r.bron.details, { datum: '2025-12-31' });
  assert.equal(apaVerwijzing(r.bron), 'Centraal Bureau voor de Statistiek. (2025, 31 december). *Cao-lonen stijgen in 2025 met 5,0 procent*. '
    + 'https://www.cbs.nl/nl-nl/nieuws/2026/01/cao-lonen-stijgen-in-2025-met-5-0-procent');
  assert.ok(r.meldingen.some((m) => m.includes('de rest is niet overgenomen ("CBS-nieuwsbericht, 31-12-2025. Cao-lonen')));
  // Een datum in het record zelf gaat voor
  r = normaliseerStartbron(startWebpagina({ datum: '2025-12' }));
  assert.equal(r.bron.details.datum, '2025-12');
  // Rapport: rapportnummer; geraadpleegd valt stil weg (er is een jaar en geen veld)
  r = normaliseerStartbron({
    titel: 'Arbobalans 2024', auteurs: ['van den Heuvel, S. G.', 'Bouwens, L.', 'de Vroome, E. M. M.'], organisatie: 'TNO', jaar: 2025, soort: 'rapport', taal: 'nl',
    url: 'https://monitorarbeid.tno.nl/publicaties/arbobalans-2024/', onderwerpen: ['werkdruk-werkstress'], betrouwbaarheid: 'kennisinstituut', geraadpleegd: '2026-11-27',
    bron_details: 'TNO-rapport TNO 2025 R11108, mei 2025 (publicatiepagina 28 mei 2025), Leiden.',
  });
  assert.deepEqual(r.fouten, []);
  assert.deepEqual(r.bron.details, { rapportnummer: 'TNO 2025 R11108' });
  assert.ok(!r.meldingen.some((m) => m.includes('geraadpleegd')));
  assert.equal(apaVerwijzing(r.bron),
    'Heuvel, S. G. van den, Bouwens, L., & Vroome, E. M. M. de. (2025). *Arbobalans 2024* (Rapportnr. TNO 2025 R11108). TNO. https://monitorarbeid.tno.nl/publicaties/arbobalans-2024/');
  // Een rapport zonder jaar: geraadpleegd kan nergens heen; dat wordt gemeld
  r = normaliseerStartbron({ titel: 'R', organisatie: 'TNO', soort: 'rapport', url: 'https://x.nl', onderwerpen: ['methode'], geraadpleegd: '2026-11-27' });
  assert.ok(r.meldingen.some((m) => m.includes('"geraadpleegd" hoort niet bij de soort "rapport"')));
  // Cijfers (dataset): geraadpleegd blijft
  r = normaliseerStartbron(startWebpagina({ soort: 'dataset', titel: 'Ziekteverzuimpercentage', bron_details: 'CBS StatLine-tabel 80072NED, gewijzigd op 17-11-2026.' }));
  assert.equal(r.bron.soort, 'cijfers');
  assert.deepEqual(r.bron.details, { geraadpleegd: '2026-11-27' });
});

test('besluit 7 (P7): een raadpleegdatum alleen bij inhoud die verandert (APA 7)', () => {
  const geen = (r) => !Object.hasOwn(r.bron.details, 'geraadpleegd');
  // Gedateerd nieuwsbericht en een pagina met "Pagina bijgewerkt op": de datum, geen raadpleegdatum
  let r = normaliseerStartbron(startWebpagina());
  assert.equal(r.bron.jaar, 2025);
  assert.ok(geen(r));
  assert.ok(!apaVerwijzing(r.bron).includes('Geraadpleegd'));
  const ap = { titel: 'De AVG in het kort', organisatie: 'Autoriteit Persoonsgegevens', jaar: 2026, soort: 'website', taal: 'nl',
    url: 'https://www.autoriteitpersoonsgegevens.nl/themas/basis-avg/avg-algemeen/de-avg-in-het-kort', onderwerpen: ['privacy-ethiek'],
    betrouwbaarheid: 'overheid', geraadpleegd: '2026-11-27',
    bron_details: 'Webpagina van de Autoriteit Persoonsgegevens, thema Basis AVG > AVG algemeen. Pagina bijgewerkt op 16 november 2026. Vat artikel 5 AVG samen.' };
  r = normaliseerStartbron(ap);
  assert.deepEqual(r.bron.details, { datum: '2026-11-16' });
  assert.equal(apaVerwijzing(r.bron), 'Autoriteit Persoonsgegevens. (2026, 16 november). *De AVG in het kort*. https://www.autoriteitpersoonsgegevens.nl/themas/basis-avg/avg-algemeen/de-avg-in-het-kort');
  // Alleen een datum in de metadata (geen zichtbare datum): z.d. en wel een raadpleegdatum
  const nla = { ...ap, titel: 'Werkdruk', organisatie: 'Nederlandse Arbeidsinspectie', url: 'https://www.nlarbeidsinspectie.nl/onderwerpen/werkdruk',
    bron_details: 'Webpagina van de Nederlandse Arbeidsinspectie (Ministerie van SZW). Laatst gewijzigd 10 september 2026 volgens de paginametadata (geen zichtbare datum op de pagina).' };
  r = normaliseerStartbron(nla);
  assert.equal(r.bron.jaar, null);
  assert.deepEqual(r.bron.details, { geraadpleegd: '2026-11-27' });
  assert.equal(apaVerwijzing(r.bron), 'Nederlandse Arbeidsinspectie. (z.d.). *Werkdruk*. Geraadpleegd op 27 november 2026, van https://www.nlarbeidsinspectie.nl/onderwerpen/werkdruk');
  assert.equal(apaInTekst([{ bron: r.bron }]), '(Nederlandse Arbeidsinspectie, z.d.)');
  assert.ok(r.meldingen.some((m) => m.includes('krijgt "z.d."')));
  assert.equal(normaliseerStartbron({ ...nla, bron_details: 'Webpagina op Arboportaal. Geen zichtbare datum.' }).bron.jaar, null, 'ook zonder het woord metadata');
  // Een datum in het record zelf gaat voor: dan blijft het jaar en is er geen raadpleegdatum
  r = normaliseerStartbron({ ...nla, datum: '2026-09-10' });
  assert.equal(r.bron.jaar, 2026);
  assert.deepEqual(r.bron.details, { datum: '2026-09-10' });
  // Geen datum vermeld (z.d.) of alleen een jaar: wel een raadpleegdatum
  r = normaliseerStartbron({ ...nla, jaar: null, bron_details: 'Webpagina van de SER. Geen publicatiedatum vermeld (z.d.; geraadpleegd 27-11-2026).' });
  assert.equal(r.bron.jaar, null);
  assert.deepEqual(r.bron.details, { geraadpleegd: '2026-11-27' });
  r = normaliseerStartbron({ ...nla, bron_details: '' });
  assert.equal(r.bron.jaar, 2026, 'zonder bron_details raden we niets: het jaar blijft');
  assert.deepEqual(r.bron.details, { geraadpleegd: '2026-11-27' });
  // Cijfers (zoals een StatLine-tabel die elk kwartaal wordt bijgewerkt): altijd met raadpleegdatum, ook met een jaar
  r = normaliseerStartbron({ ...ap, soort: 'dataset', titel: 'Ziekteverzuimpercentage', organisatie: 'Centraal Bureau voor de Statistiek (CBS)',
    bron_details: 'CBS StatLine-tabel 80072NED, gewijzigd op 17-11-2026. Tabel wordt elk kwartaal bijgewerkt.' });
  assert.equal(r.bron.soort, 'cijfers');
  assert.equal(r.bron.jaar, 2026);
  assert.deepEqual(r.bron.details, { geraadpleegd: '2026-11-27' });
  assert.ok(apaVerwijzing(r.bron).includes('[Dataset]. Geraadpleegd op 27 november 2026, van https://'));
  // Wet en richtlijn: besluit 7 noemt ze niet, dus de raadpleegdatum uit het record blijft, ook met een eigen datum
  // (zoals vóór besluit 7; de geldende tekst van een wet verandert wel)
  const wet = { titel: 'Arbeidsomstandighedenwet', soort: 'wet', jaar: 1998, url: 'https://wetten.overheid.nl/BWBR0010346', onderwerpen: ['wet-regelgeving'], geraadpleegd: '2026-11-27' };
  assert.deepEqual(normaliseerStartbron(wet).bron.details, { geraadpleegd: '2026-11-27' });
  assert.deepEqual(normaliseerStartbron({ ...wet, datum: '1998-11-01' }).bron.details, { geraadpleegd: '2026-11-27', datum: '1998-11-01' });
  assert.deepEqual(normaliseerStartbron({ ...wet, soort: 'richtlijn', datum: '2024-03' }).bron.details, { geraadpleegd: '2026-11-27', datum: '2024-03' });
  assert.equal(apaVerwijzing(normaliseerStartbron({ ...wet, datum: '1998-11-01' }).bron),
    'Arbeidsomstandighedenwet. (1998, 1 november). Geraadpleegd op 27 november 2026, van https://wetten.overheid.nl/BWBR0010346');
  // Alleen bij een webpagina leidt een datum in de metadata tot z.d.
  assert.equal(leesStartDetails('Rapport, datum volgens de paginametadata.', { soort: 'rapport', jaar: 2021 }).zonderDatum, undefined);
});

test('Plak een verwijzing: een titel met ? en een ondertitel; "Geraadpleegd op … van" is een webpagina', () => {
  let r = leesApaVerwijzing('Taris, T. W. (2006). Is there a relationship between burnout and objective performance? A critical review of 16 studies. Work & Stress, 20(4), 316–334. doi:10.1080/02678370601065893');
  assert.equal(r.bron.soort, 'artikel');
  assert.equal(r.bron.titel, 'Is there a relationship between burnout and objective performance? A critical review of 16 studies');
  assert.deepEqual(r.bron.details, { tijdschrift: 'Work & Stress', jaargang: '20', nummer: '4', paginas: '316–334' });
  assert.equal(r.bron.doi, '10.1080/02678370601065893');
  // Zonder ondertitel blijft het zoals het was
  r = leesApaVerwijzing('Bakker, A. B. (2011). Why work? Work & Stress, 20(4), 316–334.');
  assert.equal(r.bron.titel, 'Why work?');
  assert.equal(r.bron.details.tijdschrift, 'Work & Stress');
  // Een afgekorte tijdschriftnaam wordt geen ondertitel
  r = leesApaVerwijzing('Bakker, A. B. (2011). Why work? J. Appl. Psychol., 20(4), 316–334.');
  assert.equal(r.bron.titel, 'Why work?');
  assert.equal(r.bron.details.tijdschrift, 'J. Appl. Psychol.');
  r = leesApaVerwijzing('Rijksoverheid. (z.d.). Werkdruk. Geraadpleegd op 3 maart 2025, van https://www.rijksoverheid.nl/werkdruk');
  assert.equal(r.bron.soort, 'website');
  assert.equal(r.bron.organisatie, 'Rijksoverheid');
  assert.equal(r.bron.details.geraadpleegd, '2025-03-03');
  assert.equal(r.bron.url, 'https://www.rijksoverheid.nl/werkdruk');
  assert.equal(r.bron.jaar, null);
  assert.ok(!r.ontbreekt.includes('Jaar'), '(z.d.) is herkend, dus het jaar ontbreekt niet');
});

test('vaste lijsten', () => {
  assert.equal(Object.keys(BRONSOORTEN).length, 11);
  assert.equal(Object.keys(ONDERWERPEN).length, 17, '12 sjablonen + 5 vakgebieden (wetgeving sinds P7)');
  assert.deepEqual(ONDERWERPEN.wetgeving, { naam: 'Wet- en regelgeving', sjablonen: [] });
  for (const soort of Object.keys(BRONSOORTEN)) assert.ok(Array.isArray(DETAILVELDEN[soort]), soort);
});

// ---------- Inlezen in een reeks (POST /bibliotheek/reeks): rekentijd binnen de gratis laag (FT-02) ----------

/** Vast zaad (LCG), zodat elke run dezelfde bronnen geeft. */
function lcg(zaad) {
  return () => {
    zaad = (zaad * 1664525 + 1013904223) % 4294967296;
    return zaad / 4294967296;
  };
}

/** De oude, lineaire controle (één keer de hele lijst per bron): de maat voor dubbelZoeker. */
function dubbeleLineair(bron, bestaande) {
  const doi = kaleDoi(bron?.doi);
  const titelJaar = `${normaliseer(bron?.titel)}|${Number.isInteger(bron?.jaar) ? bron.jaar : ''}`;
  for (const b of bestaande) if (doi && kaleDoi(b.doi) === doi) return b;
  if (normaliseer(bron?.titel)) {
    for (const b of bestaande) if (`${normaliseer(b.titel)}|${Number.isInteger(b.jaar) ? b.jaar : ''}` === titelJaar) return b;
  }
  if (bron?.citeersleutel) for (const b of bestaande) if (b.citeersleutel === bron.citeersleutel) return b;
  return null;
}

test('dubbelZoeker geeft hetzelfde als de lineaire controle (ook bij lege velden en hoofdletters)', () => {
  const r = lcg(42);
  const kies = (lijst) => lijst[Math.floor(r() * lijst.length)];
  const titels = ['Werkdruk in de zorg', 'Werkdruk in de Zorg!', 'werkdruk  in de zorg', 'Onboarding', '', 'Café-cultuur', 'Cafe cultuur'];
  const dois = ['', '', '10.1/A', '10.1/a', 'https://doi.org/10.1/a', 'doi:10.2/b', '10.2/B'];
  const maak = (i) => ({ id: i, titel: kies(titels), jaar: kies([2017, 2018, null, undefined]), doi: kies(dois), citeersleutel: kies(['', 'tno2023', 'cbs2024', null]) });
  const bestaande = Array.from({ length: 40 }, (_, i) => maak(i + 1));
  const zoeker = dubbelZoeker(bestaande);
  for (let i = 0; i < 400; i++) {
    const vraag = maak(1000 + i);
    assert.equal(zoeker.vind(vraag), dubbeleLineair(vraag, bestaande), JSON.stringify(vraag));
    assert.equal(dubbeleVan(vraag, bestaande), dubbeleLineair(vraag, bestaande));
  }
  // voegToe: een eerdere bron uit hetzelfde bestand telt mee
  const leeg = dubbelZoeker([]);
  assert.equal(leeg.vind({ titel: 'Nieuw', jaar: 2020 }), null);
  leeg.voegToe({ id: null, titel: 'Nieuw', jaar: 2020 });
  assert.deepEqual(leeg.vind({ titel: 'nieuw.', jaar: 2020 }), { id: null, titel: 'Nieuw', jaar: 2020 });
});

test('reeksDelen: hooguit 25 bronnen en hooguit MAX_REEKS_BYTES per deel', () => {
  assert.equal(MAX_PER_REEKS, 25);
  assert.ok(MAX_REEKS_BYTES < MAX_REEKS_VERZOEK);
  const klein = Array.from({ length: 60 }, (_, i) => ({ titel: `B${i}` }));
  const delen = reeksDelen(klein);
  assert.deepEqual(delen.map((d) => [d.vanaf, d.bronnen.length]), [[0, 25], [25, 25], [50, 10]]);
  assert.deepEqual(delen.flatMap((d) => d.bronnen), klein);
  // Grote bronnen (met veel letters met accent: meer bytes dan tekens) gaan in kleinere delen
  const groot = Array.from({ length: 30 }, (_, i) => ({ titel: `G${i}`, samenvatting: 'é'.repeat(4000), notities: 'x'.repeat(5000) }));
  const grootDelen = reeksDelen(groot);
  for (const d of grootDelen) {
    const bytes = new TextEncoder().encode(JSON.stringify({ bronnen: d.bronnen, dubbel: 'overslaan' })).length;
    assert.ok(bytes <= MAX_REEKS_VERZOEK, `${bytes} bytes`);
    assert.ok(d.bronnen.length <= 25);
  }
  assert.deepEqual(grootDelen.flatMap((d) => d.bronnen), groot);
  assert.ok(grootDelen.length >= 2);
  // Een bron die alleen al te groot is, staat in een eigen deel (de server meldt dan dat het verzoek te groot is)
  const reus = reeksDelen([{ titel: 'a' }, { titel: 'b', samenvatting: 'x'.repeat(600_000) }, { titel: 'c' }]);
  assert.deepEqual(reus.map((d) => [d.vanaf, d.bronnen.length]), [[0, 1], [1, 1], [2, 1]]);
  assert.deepEqual(reeksDelen([]), []);
});

test('planReeks: fouten, dubbele bronnen (bestaand en binnen het verzoek) en citeersleutels', () => {
  const bestaande = [
    { id: 7, doi: '10.1234/AAA', titel: 'Oud', jaar: 2020, citeersleutel: 'tno2023' },
    { id: 8, doi: '', titel: 'Werkdruk in de zorg', jaar: 2023, citeersleutel: 'jansen2023' },
  ];
  const bron = (titel, extra = {}) => ({ soort: 'rapport', titel, organisatie: 'TNO', jaar: 2023, ...extra });
  const r = planReeks([
    bron('Eerste', { doi: 'https://doi.org/10.1234/aaa' }), // dezelfde DOI als id 7
    bron('Werkdruk in de Zorg.'), // zelfde titel en jaar als id 8
    bron('Nieuw'),
    bron('nieuw!'), // dubbel binnen het verzoek
    { soort: 'rapport', titel: '' },
    bron('Ander'),
  ], bestaande);
  assert.deepEqual(r.overgeslagen, [
    { rij: 1, reden: 'Staat al in je bibliotheek.', bestaand_id: 7 },
    { rij: 2, reden: 'Staat al in je bibliotheek.', bestaand_id: 8 },
    { rij: 4, reden: 'Staat al in je bibliotheek.', bestaand_id: null },
    { rij: 5, reden: 'Vul de titel van de bron in.' },
  ]);
  assert.deepEqual(r.toevoegen.map((t) => [t.rij, t.citeersleutel]), [[3, 'tno2023b'], [6, 'tno2023c']]);
  // dubbel: 'toevoegen' slaat niets over dat geldig is
  const alles = planReeks([bron('Nieuw'), bron('Nieuw')], bestaande, { dubbel: 'toevoegen' });
  assert.deepEqual(alles.toevoegen.map((t) => t.citeersleutel), ['tno2023b', 'tno2023c']);
  assert.deepEqual(alles.overgeslagen, []);
});

test('FT-02: één verzoek van 25 bronnen tegen een volle bibliotheek (1.000 bronnen) kost een paar ms', () => {
  const r = lcg(20261127);
  const woorden = ('werkdruk verzuim medewerkers organisatie leiderschap onboarding betrokkenheid tevredenheid ontwikkeling ' +
    'loopbaan cultuur verandering thuiswerken hybride vitaliteit gezondheid stress herstel team leidinggevende évaluatie café').split(' ');
  const zin = (n) => Array.from({ length: n }, () => woorden[Math.floor(r() * woorden.length)]).join(' ');
  // De bibliotheek zoals SELECT id, doi, titel, jaar, citeersleutel FROM bronnen die teruggeeft
  const bestaande = Array.from({ length: 1000 }, (_, i) => ({
    id: i + 1, doi: i % 2 ? `10.1000/x${i}` : '', titel: `${zin(12)} ${i}`, jaar: 1990 + (i % 35), citeersleutel: `auteur${i}`,
  }));
  const nieuw = Array.from({ length: MAX_PER_REEKS }, (_, i) => ({
    soort: 'artikel', titel: `${zin(12)} nieuw ${i}`, jaar: 2020, taal: 'nl', doi: `10.2000/y${i}`,
    auteurs: [{ achternaam: 'Bakker', voorletters: 'A. B.' }, { achternaam: 'Vries', tussenvoegsel: 'de', voorletters: 'M.' }],
    details: { tijdschrift: 'Tijdschrift voor HRM', jaargang: '12', nummer: '3', paginas: '45-67' },
    samenvatting: zin(110), kernpunten: [zin(20), zin(20), zin(20)], trefwoorden: ['werkdruk', 'zorg', 'verzuim'], onderwerpen: ['werkdruk'],
  }));
  const body = JSON.stringify({ bronnen: nieuw, dubbel: 'overslaan' });
  assert.ok(body.length < MAX_REEKS_BYTES);
  const tijden = [];
  for (let i = 0; i < 11; i++) {
    const t0 = performance.now();
    const b = JSON.parse(body); // wat leesJson doet
    const plan = planReeks(b.bronnen, bestaande, { dubbel: b.dubbel });
    for (const t of plan.toevoegen) insertWaarden(t.schoon, { citeersleutel: t.citeersleutel, nu: '2026-11-27T12:00:00.000Z' });
    tijden.push(performance.now() - t0);
    assert.equal(plan.toevoegen.length, MAX_PER_REEKS);
  }
  const eerste = tijden[0];
  tijden.sort((a, b) => a - b);
  const mediaan = tijden[5];
  console.log(`# reeks van 25 tegen 1.000 bestaande: eerste keer ${eerste.toFixed(1)} ms; mediaan ${mediaan.toFixed(2)} ms`);
  assert.ok(mediaan < 6, `mediaan ${mediaan} ms`);
});
