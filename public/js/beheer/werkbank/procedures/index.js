// Werkbank: welke procedures er zijn (BOUWPLAN §3.7, D2 §5.0). Zuivere module, geen DOM.
//
// Elke procedure: voerUit(ds, spec, ctx) → Uitvoer (mag async zijn; roep tussendoor `await ctx.pauze()` aan, dan
// blijft het scherm bruikbaar en werkt "Stoppen"). Een procedure gooit nooit bij een probleem met de gegevens:
// ze geeft een Uitvoer met een melding (zie uitvoer.js geweigerd). De privacyregels zijn al toegepast.
// De vorm van de spec (vakjes en opties) staat in ../definities.js (PROCEDURES); die controleert ook de server.
//
// Een nieuwe analyse: zet de functie hieronder in PROCEDURES en beschrijf de vakjes en opties in definities.js; het
// formulier (schermen/werkbank-formulieren.js) en "Mijn analyses" tonen hem dan vanzelf. Zet de sleutels van de
// gebruikte methoden (METHODEN in BOUWPLAN §3.11) met methode(u, …) in de uitvoer.

import { frequenties, beschrijvend, pergroep } from './beschrijven.js';
import { kruistabel, aanpassing } from './kruistabel.js';
import { ttoets, anova, gepaard } from './groepen.js';
import { correlatie } from './samenhang.js';
import { betrouwbaarheid, factoranalyse } from './schalen.js';
import { regressie } from './regressie.js';
import { logistisch } from './logistisch.js';

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
  regressie: { voerUit: regressie },
  logistisch: { voerUit: logistisch },
  gepaard: { voerUit: gepaard },
  factoranalyse: { voerUit: factoranalyse },
};

/** Is deze procedure al te gebruiken? */
export const beschikbaar = (sleutel) => Object.hasOwn(PROCEDURES, sleutel);
