// Vaste lijsten die zowel de server als de schermen gebruiken.

/** Antwoordschalen van 1 tot 5. */
export const SCHALEN = {
  eens: ['Helemaal oneens', 'Oneens', 'Neutraal', 'Eens', 'Helemaal eens'],
  tevreden: ['Zeer ontevreden', 'Ontevreden', 'Neutraal', 'Tevreden', 'Zeer tevreden'],
  frequentie: ['Nooit', 'Zelden', 'Soms', 'Vaak', 'Altijd'],
  kwaliteit: ['Zeer slecht', 'Slecht', 'Voldoende', 'Goed', 'Zeer goed'],
};

export const SCHAAL_NAMEN = {
  eens: 'Eens – oneens',
  tevreden: 'Tevreden – ontevreden',
  frequentie: 'Nooit – altijd',
  kwaliteit: 'Zeer slecht – zeer goed',
};

export const VRAAGTYPEN = {
  schaal: 'Schaal 1 tot 5',
  meerkeuze: 'Meerkeuze',
  janee: 'Ja / nee',
  open: 'Open tekst',
};

export const INVOERSOORTEN = {
  interview: 'Interview',
  observatie: 'Observatie',
  cijfer: 'Cijfer',
  document: 'Documentanalyse',
  overig: 'Overig',
};

export const STUKSOORTEN = {
  notitie: 'Notitie',
  bevindingen: 'Bevindingen',
  rapport: 'Rapport',
  overig: 'Overig',
};

export const ACTIESTATUSSEN = {
  te_doen: 'Te doen',
  bezig: 'Bezig',
  klaar: 'Klaar',
};

/**
 * Cijfervragen (vraagtype 'cijfer'; de soort staat in schaal_soort).
 * nps = 0 tot en met 10 (aanbevelen, eNPS); rapport = 1 tot en met 10 (rapportcijfer).
 * Een cijfervraag telt nooit mee in de gemiddelden van thema's of meetpunten.
 */
export const CIJFERSCHALEN = {
  nps: { min: 0, max: 10, laag: 'Zeer onwaarschijnlijk', hoog: 'Zeer waarschijnlijk', naam: 'Aanbevelen (0 tot 10)' },
  rapport: { min: 1, max: 10, laag: 'Zeer slecht', hoog: 'Uitstekend', naam: 'Rapportcijfer (1 tot 10)' },
};

/** eNPS: 9–10 promotor, 7–8 passief, 0–6 criticaster. */
export const ENPS = { promotorVanaf: 9, criticasterTot: 6 };

/** Minimaal aantal respondenten per groep voordat een uitsplitsing zichtbaar is (vastgelegd in privacy.js). */
export { DREMPEL } from '../../public/js/beheer/privacy.js';

export const WEET_NIET = 'weet_niet';
