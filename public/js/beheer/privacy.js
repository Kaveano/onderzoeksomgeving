// Privacy: de enige plek waar de regels voor het verbergen van kleine aantallen staan.
// Zuivere module (geen DOM, geen fetch): de Worker, de schermen en de tests gebruiken dezelfde code.
//
// De grens van 5 respondenten staat alleen hier. src/lib/schalen.js geeft hem door aan de server;
// geen instelling kan hem verlagen (drempelVan).
//
// De rekenregels (verbergReeks, onderdrukKolom, verdeelInGroepen, maskeerKruistabel, maskeerVerdeling, …)
// komen in deze module erbij; zie BOUWPLAN §3.1.

/** Minimaal aantal respondenten achter elk getal dat we laten zien. */
export const DREMPEL = 5;

/** Teken voor een verborgen cel in nieuwe uitvoer (Overzicht, werkbank, nieuwe rapporthoofdstukken). */
export const VERBORGEN = '×';

export const VERBORGEN_UITLEG = '× = niet getoond: minder dan 5 respondenten, of verborgen zodat een klein aantal niet terug te rekenen is.';

/** Naam van de samengevoegde groep kleine groepen. */
export const LABEL_OVERIG = 'Overige groepen samen';

/** De grens die echt geldt: een instelling mag hem verhogen, nooit verlagen. */
export const drempelVan = (instellingen) => Math.max(DREMPEL, Number(instellingen?.drempel) || DREMPEL);
