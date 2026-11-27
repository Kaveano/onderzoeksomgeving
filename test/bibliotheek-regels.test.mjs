// Tests voor bibliotheek-regels.js (BOUWPLAN §4 P5, criteria 1 en 2): APA-verwijzingen volgens de Nederlandse
// afspraken van B20, verwijzingen in de tekst, de literatuurlijst, namen lezen, citeersleutels, "Plak een
// verwijzing" en het omzetten van records van de startcollectie. Zuiver: geen server nodig.
// Uitvoeren: node --test test/bibliotheek-regels.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  OPMAAK, apaVerwijzing, apaInTekst, apaKort, sorteerLiteratuur, citeersleutelBasis, vrijeCiteersleutel, leesAuteur, voorletters,
  leesApaVerwijzing, normaliseerStartbron, normaliseer, paginaTekst, dubbeleVan, nlDatumKort, auteursRegel, CITEERSLEUTEL,
  BRONSOORTEN, DETAILVELDEN, ONDERWERPEN,
} from '../public/js/beheer/bibliotheek-regels.js';

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
  // D3 §8.1 gevallen 4, 6 en 7 ongewijzigd
  assert.equal(apaVerwijzing(GOUDEN.vries), 'Vries, J. de (z.d.). *Praktisch HR-onderzoek* (3e dr.). Boom.');
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
  assert.equal(apaVerwijzing({ ...GOUDEN.vries }, { suffix: 'b' }).slice(0, 26), 'Vries, J. de (z.d.-b). *Pr');
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
  assert.deepEqual(leesAuteur('De Vries, J.'), p('Vries', 'de', 'J.'));
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
  assert.equal(apaVerwijzing(r.bron), 'Vries, J. de (2019). *Praktisch HR-onderzoek* (3e dr.). Boom.');
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

test('vaste lijsten', () => {
  assert.equal(Object.keys(BRONSOORTEN).length, 11);
  assert.equal(Object.keys(ONDERWERPEN).length, 16);
  for (const soort of Object.keys(BRONSOORTEN)) assert.ok(Array.isArray(DETAILVELDEN[soort]), soort);
});
