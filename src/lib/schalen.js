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

/** Minimaal aantal respondenten per groep voordat een uitsplitsing zichtbaar is. */
export const DREMPEL = 5;

export const WEET_NIET = 'weet_niet';
