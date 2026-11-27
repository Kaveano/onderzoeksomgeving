// Gegevens van een onderzoek voor de schermen (alleen in de browser). Dit is de enige manier waarop een scherm
// aan de antwoorden komt (BOUWPLAN §3.2 en B3).
//
// Waarom: bij een groot onderzoek is de export al snel enkele megabytes. Elk scherm haalde hem tot nu toe opnieuw
// op, en de Worker moest hem elke keer in één keer opbouwen. Nu:
// - de kop (alles behalve de antwoorden) komt van GET .../export/data?zonder_inzendingen=1, met per vragenlijst
//   het aantal inzendingen en een controlegetal (inzendingen_stand);
// - de antwoorden komen in delen van GET .../export/inzendingen, per vragenlijst, en blijven in dit tabblad
//   bewaard (in het geheugen, nergens anders; weg bij vernieuwen of sluiten);
// - bij een volgende keer haalt de browser alleen de vragenlijsten opnieuw op waarvan het aantal of het
//   controlegetal veranderd is (een nieuwe inzending, ingelezen of gewiste antwoorden).
//
// Het resultaat (Export) is precies wat GET .../export/data geeft, plus het id van elke inzending (alleen voor de
// onderzoeker; het id is willekeurig en zegt niets over wie wanneer invulde). De inzendingen staan net als daar
// op (vragenlijst_id, datum, id). inzendingen_stand beschrijft de inzendingen die er werkelijk in zitten.
//
// Let op: de inzendingen (en hun antwoorden) worden gedeeld door alle schermen en zijn daarom bevroren
// (Object.freeze). Pas ze niet aan; maak een kopie als je iets wilt veranderen. De rest van de Export is
// bij elke aanroep nieuw en mag een scherm gerust aanvullen (zoals Afronden met de datasets).

import { api, ApiFout } from './api.js';
import { nlGetal } from './opmaak.js';

/** Boven zoveel inzendingen rekent het scherm Alle resultaten in de browser, niet op de server (B2). */
export const GROOT_ONDERZOEK = 1500;
/** Zelfde getal als in src/routes/export.js. */
export const CONTROLE_MODULUS = 2147483647;
const PER_DEEL = 1000;
// Zoveel onderzoeken blijven tegelijk bewaard (het laatst gebruikte blijft het langst).
const MAX_ONDERZOEKEN = 3;

const bewaard = new Map(); // onderzoek-id (tekst) → { lijsten: Map<vragenlijst_id, { aantal, controle, rijen }> }
const bezig = new Map(); // onderzoek-id (tekst) → lopende ophaalactie

/** "Gegevens laden: 2.000 van 5.000 antwoorden…" */
export function voortgangTekst(geladen, totaal) {
  return `Gegevens laden: ${nlGetal(geladen, 0)} van ${nlGetal(totaal, 0)} antwoorden…`;
}

/** Aantal en controlegetal van een reeks inzendingen (zoals inzendingen_stand van de server). */
export function standVan(rijen) {
  let controle = 0;
  for (const r of rijen) controle = (controle + (Number(r.id) % CONTROLE_MODULUS)) % CONTROLE_MODULUS;
  return { aantal: rijen.length, controle };
}

/** Aantal inzendingen dat deze browser van het onderzoek al heeft, of null als er nog niets is opgehaald. */
export function bekendAantal(onderzoekId) {
  const b = bewaard.get(String(onderzoekId));
  if (!b) return null;
  let n = 0;
  for (const l of b.lijsten.values()) n += l.aantal;
  return n;
}

/** Vergeet de bewaarde antwoorden van een onderzoek (na eigen wijzigingen: inlezen, wissen, coderen …). */
export function vergeetGegevens(onderzoekId) {
  bewaard.delete(String(onderzoekId));
}

function bevries(r) {
  const a = r.antwoorden;
  if (a && typeof a === 'object') {
    for (const w of Object.values(a)) if (w && typeof w === 'object') Object.freeze(w);
    Object.freeze(a);
  }
  return Object.freeze(r);
}

// Zelfde volgorde als export/data: datum, dan id (de datum is JJJJ-MM-DD, dus als tekst te vergelijken).
const opDatumEnId = (a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.id - b.id);

function bewaar(sleutel, waarde) {
  bewaard.delete(sleutel);
  bewaard.set(sleutel, waarde);
  while (bewaard.size > MAX_ONDERZOEKEN) bewaard.delete(bewaard.keys().next().value);
}

/** Alle inzendingen van één vragenlijst, in delen van hooguit 1.000 (of ongeveer 1,5 MB). */
async function haalLijst(sleutel, vragenlijstId, bijDeel) {
  const rijen = [];
  let na = 0;
  for (;;) {
    const deel = await api.get(`/onderzoeken/${sleutel}/export/inzendingen?vragenlijst=${vragenlijstId}&na=${na}&max=${PER_DEEL}`);
    for (const r of deel.inzendingen) rijen.push(bevries(r));
    bijDeel(deel.inzendingen.length);
    if (deel.volgende === null || deel.volgende === undefined) break;
    na = deel.volgende;
  }
  rijen.sort(opDatumEnId);
  return rijen;
}

async function haal(sleutel, { vers, voortgang }) {
  const kop = await api.get(`/onderzoeken/${sleutel}/export/data?zonder_inzendingen=1`);
  const eerder = vers ? null : bewaard.get(sleutel);
  const stand = [...(kop.inzendingen_stand || [])].sort((a, b) => a.vragenlijst_id - b.vragenlijst_id);
  const lijsten = new Map();
  const nodig = [];
  for (const s of stand) {
    const e = eerder && eerder.lijsten.get(s.vragenlijst_id);
    if (e && e.aantal === s.aantal && e.controle === s.controle) lijsten.set(s.vragenlijst_id, e);
    else if (!s.aantal) lijsten.set(s.vragenlijst_id, { aantal: 0, controle: 0, rijen: [] });
    else nodig.push(s);
  }
  const totaal = stand.reduce((n, s) => n + s.aantal, 0);
  let geladen = totaal - nodig.reduce((n, s) => n + s.aantal, 0);
  if (voortgang && nodig.length) voortgang(geladen, totaal);
  for (const s of nodig) {
    let rijen;
    try {
      rijen = await haalLijst(sleutel, s.vragenlijst_id, (n) => {
        geladen += n;
        if (voortgang) voortgang(Math.min(geladen, totaal), totaal);
      });
    } catch (e) {
      // Intussen verwijderd: dan zonder deze vragenlijst (de kop is dan ook al verouderd; volgende keer goed).
      if (e instanceof ApiFout && e.status === 404) continue;
      throw e;
    }
    // De stand van wat er echt binnen is (er kan intussen iets bij zijn gekomen): klopt die niet met de server,
    // dan wordt de vragenlijst de volgende keer opnieuw opgehaald.
    lijsten.set(s.vragenlijst_id, { ...standVan(rijen), rijen });
  }
  bewaar(sleutel, { lijsten });

  const inzendingen = [];
  const werkelijk = [];
  for (const s of stand) {
    const l = lijsten.get(s.vragenlijst_id);
    if (!l) continue;
    for (const r of l.rijen) inzendingen.push(r);
    werkelijk.push({ vragenlijst_id: s.vragenlijst_id, aantal: l.aantal, controle: l.controle });
  }
  return { ...kop, inzendingen_stand: werkelijk, inzendingen };
}

/**
 * De gegevens van een onderzoek (Export, zie boven).
 * vers: true haalt alle antwoorden opnieuw op, ook als ze al bewaard zijn.
 * voortgang(geladen, totaal): wordt aangeroepen tijdens het ophalen (aantallen inzendingen), alleen als er
 * antwoorden opgehaald moeten worden. Gebruik voortgangTekst() voor de tekst op het scherm.
 * Vragen twee schermen tegelijk hetzelfde onderzoek op, dan wacht de tweede op de eerste en haalt daarna
 * alleen de kop opnieuw op.
 */
export async function haalGegevens(onderzoekId, { vers = false, voortgang = null } = {}) {
  const sleutel = String(onderzoekId);
  while (bezig.has(sleutel)) await bezig.get(sleutel).catch(() => {});
  const taak = haal(sleutel, { vers, voortgang });
  bezig.set(sleutel, taak);
  try {
    return await taak;
  } finally {
    if (bezig.get(sleutel) === taak) bezig.delete(sleutel);
  }
}
