// Bibliotheek in de browser: één keer ophalen, daarna alleen opnieuw als er iets veranderd is (BOUWPLAN §3.9).
// De lijst blijft in het geheugen van dit tabblad (niet in localStorage); bij elke keer openen vragen we met
// ?versie= of hij nog klopt. De server stuurt hem in delen (volgende); verandert de versie tijdens het ophalen,
// dan beginnen we één keer opnieuw.

import { api } from './api.js';

let bewaard = null; // { versie, start, bronnen, perSleutel, perId }
let bezig = null;

function maak(versie, start, bronnen) {
  const lijst = [...bronnen].sort((a, b) => a.id - b.id);
  return {
    versie, start, bronnen: lijst,
    perSleutel: new Map(lijst.map((b) => [b.citeersleutel, b])),
    perId: new Map(lijst.map((b) => [b.id, b])),
  };
}

async function haalAlles() {
  for (let poging = 0; poging < 2; poging++) {
    const eerste = await api.get('/bibliotheek?vanaf=0');
    const bronnen = [...eerste.bronnen];
    let volgende = eerste.volgende;
    let anders = false;
    while (volgende !== null && volgende !== undefined) {
      const deel = await api.get(`/bibliotheek?vanaf=${volgende}`);
      if (deel.versie !== eerste.versie) {
        anders = true;
        break;
      }
      bronnen.push(...deel.bronnen);
      volgende = deel.volgende;
    }
    if (!anders) return maak(eerste.versie, eerste.start, bronnen);
  }
  throw new Error('De bibliotheek veranderde tijdens het ophalen. Probeer het opnieuw.');
}

/**
 * De hele bibliotheek: { versie, start: { aantal, verborgen, totaal, versie, datum }, bronnen: [Bron],
 * perSleutel: Map<citeersleutel, Bron>, perId: Map<id, Bron> }. vers: true haalt alles opnieuw op.
 */
export async function haalBibliotheek({ vers = false } = {}) {
  if (bezig) return bezig;
  bezig = (async () => {
    if (bewaard && !vers) {
      const controle = await api.get(`/bibliotheek?versie=${bewaard.versie}`);
      if (controle.ongewijzigd) return bewaard;
    }
    bewaard = await haalAlles();
    return bewaard;
  })();
  try {
    return await bezig;
  } finally {
    bezig = null;
  }
}

/** Na een eigen wijziging: de volgende keer alles opnieuw ophalen. */
export function bibliotheekGewijzigd() {
  bewaard = null;
}

/** De bron bij een citeersleutel (voor verwijzingen in rapporten en vergelijkingswaarden), of null. */
export async function bronBijCiteersleutel(sleutel) {
  const b = await haalBibliotheek();
  return b.perSleutel.get(String(sleutel ?? '')) || null;
}
