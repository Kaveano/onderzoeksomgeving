// Werkbank → rapport (BOUWPLAN §3.7, de naad voor pakket P6). Zuivere module, geen DOM, geen fetch.
// Bij "Cijfers bijwerken" voert de rapporteditor de bewaarde analyses van een hoofdstuk opnieuw uit op de gegevens
// die hij al heeft, en legt hij de (al beschermde) blokken vast in feiten.analyses. De kijker krijgt alleen die
// blokken; er rekent nooit iets op de server.
//
// Altijd streng (B26 geldt alleen op het eigen scherm): ook bij meningsvragen zonder selectie verdwijnen aantallen
// van 1 tot 4, zodat kleinste_n van elke vastgelegde analyse minstens 5 is (controleerFeiten in P6).

import { maakRekenkern } from './rekenkern.js';
import { uitvoerNaarBlokken } from './uitvoer-tekst.js';
import { leesAnalyses } from './definities.js';
import { DREMPEL } from '../privacy.js';

/** Hoogstens zoveel tekens JSON per analyse in een rapport (D2 §9.2). */
export const MAX_ANALYSE_TEKENS = 60_000;
export const TE_GROOT = 'Deze uitkomst is te groot voor het rapport. Neem hem op via de Word-export als bijlage.';

/**
 * @param data      de export (gegevens.js)
 * @param datasets  de eigen datasets die analyses gebruiken: [{ id, naam, kolommen, rijen }] of een Map
 * @param definities werkbank_definities (uit de export of de GET-route)
 * @param analyses  werkbank_analyses-rijen (spec als tekst of object)
 * @returns FeitAnalyse[] = { id, titel, procedure, gegevens, peildatum, open, methoden, toetsen, kleinste_n, blokken }
 *                        | { id, titel, fout }
 */
export async function analysesVoorRapport(data, datasets, definities, analyses, { drempel = DREMPEL, peildatum } = {}) {
  const kern = maakRekenkern();
  kern.stel({ data, datasets, definities, drempel });
  const uit = [];
  for (const a of leesAnalyses(analyses)) {
    const u = await kern.voerUit(a.spec, { streng: true, nu: peildatum });
    if (u.geweigerd) {
      uit.push({ id: a.id, titel: a.titel, fout: u.onderdelen.find((o) => o.soort === 'melding')?.tekst || 'Deze analyse kon niet worden uitgevoerd.' });
      continue;
    }
    u.titel = a.titel;
    const { blokken, methoden, toetsen, kleinste_n } = uitvoerNaarBlokken(u, { notatie: 'rapport' });
    const feit = { id: a.id, titel: a.titel, procedure: a.procedure, gegevens: u.gegevens, peildatum, open: !!u.gegevens.open, methoden, toetsen, kleinste_n, blokken };
    uit.push(JSON.stringify(feit).length > MAX_ANALYSE_TEKENS ? { id: a.id, titel: a.titel, fout: TE_GROOT } : feit);
  }
  return uit;
}
