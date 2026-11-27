// Verschilwacht (BOUWPLAN B9, K M6): waarschuwt voordat een meelezer twee uitkomsten kan vergelijken die maar
// 1 tot 4 respondenten verschillen. Uit zo'n verschil is af te leiden wat die paar personen hebben geantwoord.
//
// Wat een meelezer kan zien, via elke actieve deellink van het onderzoek:
// - de vastgelegde cijfers van elk gedeeld rapport: per vragenlijst het aantal respondenten (n) op de peildatum;
// - het live dashboard ("live"), als een actieve deellink de resultaten deelt: daar staat het huidige aantal.
// Een uitkomst van minder dan 5 respondenten toont nergens iets (PR-02); daarmee valt dus niets te vergelijken.
//
// Een waarschuwing (geen blokkade) komt bij:
// - een gesloten, gedeelde vragenlijst weer openzetten (vragenlijsten.js, vragenlijst-bewerken.js);
// - antwoorden inlezen in een gesloten, gedeelde vragenlijst (inlezen-kaart.js);
// - "Cijfers bijwerken" van een gedeeld rapport (P6, rapport-bewerken.js) – die gebruikt kleineVerschillen().
//
// De functies bovenaan zijn puur (geen DOM, geen server), zodat ze in Node te testen zijn.

import { api } from './api.js';
import { bevestig } from './ui.js';
import { DREMPEL } from './privacy.js';

export const WAARSCHUWING_OPENZETTEN = 'Let op: deze vragenlijst is gedeeld via een deellink. Als je hem weer openzet, kan een meelezer straks zien wat een paar nieuwe respondenten (minder dan 5) hebben geantwoord. Wacht liever tot er minstens 5 nieuwe antwoorden zijn, of trek de deellink tijdelijk in.';
export const WAARSCHUWING_INLEZEN = 'Let op: deze vragenlijst is gedeeld via een deellink. Als je deze antwoorden inleest, kan een meelezer straks zien wat een paar nieuwe respondenten (minder dan 5) hebben geantwoord. Wacht liever tot er minstens 5 nieuwe antwoorden zijn, of trek de deellink tijdelijk in.';

/**
 * Wat een meelezer via actieve deellinks van dit onderzoek kan zien.
 * @param deellinks GET /onderzoeken/:id/deellinks → deellinks ({ actief, naam, onderdelen: { dashboard, rapporten } })
 * @param rapporten GET /onderzoeken/:id/rapporten → rapporten ({ id, titel, lijsten_n: [{id, n}] })
 * @returns {{ live: boolean, links: string[], rapporten: { id, titel, lijsten: Map<vragenlijst_id, n> }[] }}
 */
export function gedeeldeStand(deellinks = [], rapporten = []) {
  const actief = deellinks.filter((l) => l && l.actief);
  const gedeeldeRapporten = new Set(actief.flatMap((l) => (l.onderdelen && l.onderdelen.rapporten) || []));
  return {
    live: actief.some((l) => l.onderdelen && l.onderdelen.dashboard === true),
    links: actief.map((l) => l.naam),
    rapporten: rapporten.filter((r) => gedeeldeRapporten.has(r.id)).map((r) => ({
      id: r.id,
      titel: r.titel,
      lijsten: new Map((r.lijsten_n || []).map((l) => [l.id, l.n])),
    })),
  };
}

/**
 * De uitkomsten die een meelezer van één vragenlijst kan zien, met hun aantal respondenten (alleen als dat
 * minstens d is: anders staat er niets in beeld).
 * @param huidigN het aantal inzendingen nu (wat het live dashboard toont)
 * @returns {{ bron: 'dashboard'|'rapport', titel: string|null, n: number }[]}
 */
export function zichtbareUitkomsten(stand, vragenlijstId, huidigN, d = DREMPEL) {
  const uit = [];
  if (stand.live && huidigN >= d) uit.push({ bron: 'dashboard', titel: null, n: huidigN });
  for (const r of stand.rapporten) {
    const n = r.lijsten.get(vragenlijstId);
    if (Number.isFinite(n) && n >= d) uit.push({ bron: 'rapport', titel: r.titel, n });
  }
  return uit;
}

/**
 * De zichtbare uitkomsten waarvan een nieuw aantal nieuwN maar 1 tot d−1 respondenten verschilt
 * (0 < nieuwN − n < d): daar is uit het verschil iets af te leiden over die paar personen.
 */
export function kleineVerschillen(stand, vragenlijstId, nieuwN, { huidigN = nieuwN, d = DREMPEL } = {}) {
  return zichtbareUitkomsten(stand, vragenlijstId, huidigN, d)
    .map((u) => ({ ...u, verschil: nieuwN - u.n }))
    .filter((u) => u.verschil > 0 && u.verschil < d);
}

/** Is er van deze vragenlijst iets te zien voor een meelezer (dan kan elke kleine aanvulling opvallen)? */
export function isGedeeld(stand, vragenlijstId, huidigN, d = DREMPEL) {
  return zichtbareUitkomsten(stand, vragenlijstId, huidigN, d).length > 0;
}

// ---------- In de browser ----------

/** Haalt de deellinks en rapporten van het onderzoek op (twee kleine verzoeken). */
export async function haalGedeeldeStand(onderzoekId) {
  const [{ deellinks }, { rapporten }] = await Promise.all([
    api.get(`/onderzoeken/${onderzoekId}/deellinks`),
    api.get(`/onderzoeken/${onderzoekId}/rapporten`),
  ]);
  return gedeeldeStand(deellinks, rapporten);
}

/**
 * Voor het openzetten van een gesloten vragenlijst. Geeft true als je door mag gaan (niet gedeeld, of je koos
 * "Toch openzetten"). Kan de controle niet worden gedaan (geen verbinding), dan gaat het gewoon door: het is een
 * waarschuwing, geen blokkade.
 * @param vragenlijst { id, status, aantal_inzendingen }
 */
export async function magOpenzetten(onderzoekId, vragenlijst) {
  if (vragenlijst.status === 'open') return true;
  let stand;
  try {
    stand = await haalGedeeldeStand(onderzoekId);
  } catch {
    return true;
  }
  if (!isGedeeld(stand, vragenlijst.id, Number(vragenlijst.aantal_inzendingen) || 0)) return true;
  return bevestig({ titel: 'Deze vragenlijst is gedeeld', tekst: WAARSCHUWING_OPENZETTEN, knop: 'Toch openzetten' });
}

/**
 * Voor het inlezen van `aantalNieuw` antwoorden in een vragenlijst. Alleen bij een gesloten vragenlijst die via een
 * deellink te zien is, en alleen als het nieuwe aantal 1 tot 4 verschilt van een uitkomst die een meelezer kan zien.
 * @param vragenlijst { id, status, aantal_inzendingen }
 */
export async function magInlezen(onderzoekId, vragenlijst, aantalNieuw) {
  if (vragenlijst.status === 'open' || !(aantalNieuw > 0)) return true;
  let stand;
  try {
    stand = await haalGedeeldeStand(onderzoekId);
  } catch {
    return true;
  }
  const huidigN = Number(vragenlijst.aantal_inzendingen) || 0;
  if (!kleineVerschillen(stand, vragenlijst.id, huidigN + aantalNieuw, { huidigN }).length) return true;
  return bevestig({ titel: 'Deze vragenlijst is gedeeld', tekst: WAARSCHUWING_INLEZEN, knop: 'Toch inlezen' });
}
