// Werkbank: welke procedures er zijn (BOUWPLAN §3.7, D2 §5.0). Zuivere module, geen DOM.
//
// Elke procedure: voerUit(ds, spec, ctx) → Uitvoer (mag async zijn; roep tussendoor `await ctx.pauze()` aan, dan
// blijft het scherm bruikbaar en werkt "Stoppen"). Een procedure gooit nooit bij een probleem met de gegevens:
// ze geeft een Uitvoer met een melding (zie uitvoer.js geweigerd). De privacyregels zijn al toegepast.
// De vorm van de spec (vakjes en opties) staat in ../definities.js (PROCEDURES); die controleert ook de server.
//
// Uitbreiden (fase 5 en 6 van pakket P4):
// - regressie   → procedures/regressie.js  export function regressie(ds, spec, ctx)   (matrix.js kleinsteKwadraten)
// - logistisch  → procedures/logistisch.js export function logistisch(ds, spec, ctx)  (matrix.js cholesky, P_LOGIT_CEL)
// - gepaard     → procedures/groepen.js    export function gepaard(ds, spec, ctx)
// - factoranalyse → procedures/schalen.js  export function factoranalyse(ds, spec, ctx) (matrix.js jacobiEigen)
// Voeg de functie hieronder toe aan PROCEDURES; het formulier (schermen/werkbank-formulieren.js) en "Mijn analyses"
// tonen dan vanzelf de nieuwe analyse, met de vakjes en opties uit definities.js. Zet de sleutels van de gebruikte
// methoden (METHODEN in BOUWPLAN §3.11, bijv. 'regressie', 'logistisch', 'gepaard-t', 'wilcoxon', 'pca', 'paf',
// 'varimax') met methode(u, …) in de uitvoer.

import { frequenties, beschrijvend, pergroep } from './beschrijven.js';
import { kruistabel, aanpassing } from './kruistabel.js';
import { ttoets, anova } from './groepen.js';
import { correlatie } from './samenhang.js';
import { betrouwbaarheid } from './schalen.js';

export const PROCEDURES = {
  frequenties: { voerUit: frequenties },
  beschrijvend: { voerUit: beschrijvend },
  pergroep: { voerUit: pergroep },
  kruistabel: { voerUit: kruistabel },
  aanpassing: { voerUit: aanpassing },
  ttoets: { voerUit: ttoets },
  anova: { voerUit: anova },
  correlatie: { voerUit: correlatie },
  betrouwbaarheid: { voerUit: betrouwbaarheid },
  // regressie: { voerUit: regressie },        fase 5
  // logistisch: { voerUit: logistisch },      fase 5
  // gepaard: { voerUit: gepaard },            fase 5
  // factoranalyse: { voerUit: factoranalyse }, fase 6
};

/** Is deze procedure al te gebruiken? */
export const beschikbaar = (sleutel) => Object.hasOwn(PROCEDURES, sleutel);
