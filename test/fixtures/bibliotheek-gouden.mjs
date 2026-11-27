// De zeven gouden bronnen van D3 §8.1 (op nr. 1 na verzonnen titels), voor de tests van de bibliotheek.
export const A = (achternaam, voorl, tussenvoegsel = '') => ({ achternaam, tussenvoegsel, voorletters: voorl });

export const GOUDEN = {
  bakker: {
    citeersleutel: 'bakker2017', soort: 'artikel', auteurs: [A('Bakker', 'A. B.'), A('Demerouti', 'E.')], jaar: 2017, taal: 'en',
    titel: 'Job demands-resources theory: Taking stock and looking forward',
    details: { tijdschrift: 'Journal of Occupational Health Psychology', jaargang: '22', nummer: '3', paginas: '273-285' }, doi: '10.1037/ocp0000056',
  },
  cbs: {
    citeersleutel: 'cbs2024', soort: 'rapport', organisatie: 'Centraal Bureau voor de Statistiek', afkorting: 'CBS', jaar: 2024, taal: 'nl',
    titel: 'Voorbeeldrapport ziekteverzuim', url: 'https://www.cbs.nl/voorbeeld',
  },
  jansen: {
    citeersleutel: 'jansen2023', soort: 'rapport', auteurs: [A('Jansen', 'P.'), A('Vries', 'M.', 'de'), A('Bos', 'K. L.')], organisatie: 'TNO',
    jaar: 2023, taal: 'nl', titel: 'Werkdruk in de zorg', details: { rapportnummer: '2023-R101' }, url: 'https://example.org/r',
  },
  vries: {
    citeersleutel: 'vrieszd', soort: 'boek', auteurs: [A('Vries', 'J.', 'de')], jaar: null, taal: 'nl', titel: 'Praktisch HR-onderzoek',
    details: { druk: '3', uitgever: 'Boom' },
  },
  smit: {
    citeersleutel: 'smit2021', soort: 'hoofdstuk', auteurs: [A('Smit', 'A.')], jaar: 2021, taal: 'nl', titel: 'Onboarding als proces',
    details: { boektitel: 'Handboek HRM', redacteuren: [A('Kok', 'B.'), A('Berg', 'C.', 'van den')], paginas: '45-67', uitgever: 'Noordhoff' },
  },
  arboportaal: {
    citeersleutel: 'arboportaal2024', soort: 'website', organisatie: 'Arboportaal', jaar: 2024, taal: 'nl', titel: 'Werkdruk',
    url: 'https://www.arboportaal.nl/onderwerpen/werkdruk', details: { sitenaam: 'Arboportaal', datum: '2024-03-05', geraadpleegd: '2026-11-20' },
  },
  arbowet: {
    citeersleutel: 'arbeidsomstandighede1998', soort: 'wet', jaar: 1998, taal: 'nl', titel: 'Arbeidsomstandighedenwet',
    url: 'https://wetten.overheid.nl/BWBR0010346',
  },
};
