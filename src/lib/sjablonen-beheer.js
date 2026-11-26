// Sjablonen beheren: alle sjablonen staan in de database en zijn volledig aan te passen,
// ook de standaardsjablonen. De standaardsjablonen staan als "origineel" in de code
// (src/sjablonen.js en src/sjablonen-extra.js) en worden automatisch in de database gezet
// zodra de sjablonen voor het eerst worden opgevraagd.
//
// In de tabel "instellingen" staat onder 'sjablonen_geplaatst' welke standaardsjablonen al
// eens zijn geplaatst. Zo verschijnt een sjabloon dat later aan de code wordt toegevoegd
// vanzelf één keer, en komt een sjabloon dat je zelf hebt verwijderd niet ongevraagd terug.

import { Fout } from './http.js';
import * as validatie from './validatie.js';
import { nuIso } from './db.js';
import { SCHALEN, VRAAGTYPEN } from './schalen.js';
import { MAX_VRAGEN, legeInhoud } from './sjabloon-toepassen.js';
import { STANDAARD_SJABLONEN } from '../sjablonen.js';
import { EXTRA_SJABLONEN } from '../sjablonen-extra.js';

export const MAX_THEMAS = 40;
export const MAX_MEETPUNTEN = 30; // per thema
export const MAX_ACTIES = 100;
export const MAX_OPTIES = 30;
export const MAX_SJABLONEN = 200; // totaal in de database
export const MAX_SAMENVOEGEN = 10; // zoveel sjablonen tegelijk kiezen
const MAX_BYTES = 200_000;

const SLEUTEL_GEPLAATST = 'sjablonen_geplaatst';
const BESTAAT_NIET = 'Dit sjabloon bestaat niet (meer).';

// ---------- De standaardsjablonen uit de code ----------

/** Alle standaardsjablonen uit de code, in vaste volgorde en zonder dubbele id's. */
export const INGEBOUWD = [];
for (const s of [...STANDAARD_SJABLONEN, ...(Array.isArray(EXTRA_SJABLONEN) ? EXTRA_SJABLONEN : [])]) {
  if (!s || typeof s.id !== 'string' || !/^[A-Za-z0-9_-]{1,60}$/.test(s.id) || /^\d+$/.test(s.id)) continue;
  if (!s.inhoud || typeof s.inhoud !== 'object' || INGEBOUWD.some((x) => x.id === s.id)) continue;
  INGEBOUWD.push(s);
}

const origineelCache = new Map();

/** De versie uit de code van een standaardsjabloon, in dezelfde vorm als in de database. */
function origineel(bron) {
  if (!origineelCache.has(bron)) {
    const s = INGEBOUWD.find((x) => x.id === bron);
    let rij = null;
    if (s) {
      let inhoud;
      try {
        inhoud = controleerSjabloonInhoud(s.inhoud);
      } catch {
        inhoud = s.inhoud; // liever een sjabloon dat je nog moet nalopen dan geen sjabloon
      }
      rij = {
        naam: String(s.naam || s.id).trim().slice(0, 150),
        omschrijving: String(s.omschrijving || '').trim().slice(0, 1000),
        inhoud: JSON.stringify(inhoud),
      };
    }
    origineelCache.set(bron, rij);
  }
  return origineelCache.get(bron);
}

// ---------- Controle van de inhoud ----------

const sleutel = (s) => String(s ?? '').trim().toLowerCase();
const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isAan = (x) => x === true || x === 1 || x === '1' || x === 'true';
const fout = (melding) => new Fout(400, melding);

/**
 * Schone tekst, of een Fout zoals "Vraag 3: de vraag is te lang (maximaal 1000 tekens).".
 * wat = het veld met lidwoord ("de naam"); vul = hoe het veld heet in "vul … in" (standaard: wat).
 */
function tekst(waarde, waar, wat, { verplicht = false, max, vul = wat }) {
  if (waarde === undefined || waarde === null) {
    if (verplicht) throw fout(`${waar}: vul ${vul} in.`);
    return '';
  }
  if (typeof waarde !== 'string' && typeof waarde !== 'number') throw fout(`${waar}: ${wat} heeft een ongeldige waarde.`);
  // Onzichtbare stuurtekens weg (behalve tab en regeleinde).
  const t = String(waarde).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').trim();
  if (verplicht && !t) throw fout(`${waar}: vul ${vul} in.`);
  if (t.length > max) throw fout(`${waar}: ${wat} is te lang (maximaal ${max} tekens).`);
  return t;
}

function lijstVan(waarde, melding) {
  if (waarde === undefined || waarde === null) return [];
  if (!Array.isArray(waarde)) throw fout(melding);
  return waarde;
}

const kort = (t, max = 60) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);

/**
 * Controleert de inhoud van een sjabloon streng en geeft een schone kopie terug in een vaste vorm:
 * { vragenlijst: {titel, introtekst, bedanktekst},
 *   themas: [{naam, omschrijving, meetpunten: [{naam, omschrijving, eenheid}]}],
 *   vragen: [{thema, meetpunt, type, tekst, toelichting, opties, schaal_soort, meerdere_antwoorden,
 *             verplicht, weet_niet, uitsplitsen}],
 *   acties: [tekst] }
 * Onbekende velden vallen weg. De vragen staan in de volgorde van de thema's (zo zien
 * respondenten ze ook). Bij een fout volgt een Fout (400) die het probleem benoemt.
 */
export function controleerSjabloonInhoud(ruw) {
  if (!isObject(ruw)) throw fout('De inhoud van het sjabloon ontbreekt of is ongeldig.');

  // Vragenlijst
  if (ruw.vragenlijst !== undefined && ruw.vragenlijst !== null && !isObject(ruw.vragenlijst)) {
    throw fout('Vragenlijst: de gegevens zijn ongeldig.');
  }
  const vl = ruw.vragenlijst || {};
  const vragenlijst = {
    titel: tekst(vl.titel, 'Vragenlijst', 'de titel', { max: 200 }),
    introtekst: tekst(vl.introtekst, 'Vragenlijst', 'de uitleg voor respondenten', { max: 5000 }),
    bedanktekst: tekst(vl.bedanktekst, 'Vragenlijst', 'de bedanktekst', { max: 2000 }),
  };

  // Thema's en meetpunten
  const ruweThemas = lijstVan(ruw.themas, "De lijst met thema's is ongeldig.");
  if (ruweThemas.length > MAX_THEMAS) {
    throw fout(`Een sjabloon kan maximaal ${MAX_THEMAS} thema's bevatten (nu ${ruweThemas.length}).`);
  }
  const themas = [];
  const themaMap = new Map();
  ruweThemas.forEach((t, i) => {
    const waar = `Thema ${i + 1}`;
    if (!isObject(t)) throw fout(`${waar}: de gegevens zijn ongeldig.`);
    const naam = tekst(t.naam, waar, 'de naam', { verplicht: true, max: 150, vul: 'een naam' });
    if (themaMap.has(sleutel(naam))) throw fout(`${waar}: de naam "${naam}" komt al voor. Geef elk thema een eigen naam.`);
    const metNaam = `Thema "${kort(naam)}"`;
    const ruweMeetpunten = lijstVan(t.meetpunten, `${metNaam}: de lijst met meetpunten is ongeldig.`);
    if (ruweMeetpunten.length > MAX_MEETPUNTEN) {
      throw fout(`${metNaam}: maximaal ${MAX_MEETPUNTEN} meetpunten per thema (nu ${ruweMeetpunten.length}).`);
    }
    const meetpunten = [];
    const meetpuntMap = new Map();
    ruweMeetpunten.forEach((m, j) => {
      const mWaar = `${metNaam}, meetpunt ${j + 1}`;
      if (!isObject(m)) throw fout(`${mWaar}: de gegevens zijn ongeldig.`);
      const mNaam = tekst(m.naam, mWaar, 'de naam', { verplicht: true, max: 150, vul: 'een naam' });
      if (meetpuntMap.has(sleutel(mNaam))) throw fout(`${metNaam}: het meetpunt "${mNaam}" staat er dubbel in.`);
      const meetpunt = {
        naam: mNaam,
        omschrijving: tekst(m.omschrijving, mWaar, 'de omschrijving', { max: 2000 }),
        eenheid: tekst(m.eenheid, mWaar, 'de eenheid', { max: 30 }),
      };
      meetpuntMap.set(sleutel(mNaam), meetpunt);
      meetpunten.push(meetpunt);
    });
    const thema = { naam, omschrijving: tekst(t.omschrijving, waar, 'de omschrijving', { max: 2000 }), meetpunten };
    themaMap.set(sleutel(naam), { thema, plek: i, meetpuntMap });
    themas.push(thema);
  });

  // Vragen
  const ruweVragen = lijstVan(ruw.vragen, 'De lijst met vragen is ongeldig.');
  if (ruweVragen.length > MAX_VRAGEN) {
    const teveel = ruweVragen.length - MAX_VRAGEN;
    throw fout(`Een sjabloon kan maximaal ${MAX_VRAGEN} vragen bevatten (nu ${ruweVragen.length}). Verwijder ${teveel} ${teveel === 1 ? 'vraag' : 'vragen'}.`);
  }
  const vragen = [];
  const teksten = new Map();
  ruweVragen.forEach((q, i) => {
    const waar = `Vraag ${i + 1}`;
    if (!isObject(q)) throw fout(`${waar}: de gegevens zijn ongeldig.`);
    const gevonden = typeof q.thema === 'string' ? themaMap.get(sleutel(q.thema)) : null;
    if (!gevonden) throw fout(`${waar}: kies een thema dat in het sjabloon staat.`);
    let meetpunt = null;
    if (q.meetpunt !== undefined && q.meetpunt !== null && q.meetpunt !== '') {
      const mp = typeof q.meetpunt === 'string' ? gevonden.meetpuntMap.get(sleutel(q.meetpunt)) : null;
      if (!mp) {
        throw fout(`${waar}: het meetpunt "${kort(String(q.meetpunt))}" staat niet bij het thema "${kort(gevonden.thema.naam)}". Kies een meetpunt van dat thema of geen meetpunt.`);
      }
      meetpunt = mp.naam;
    }
    if (typeof q.type !== 'string' || !Object.hasOwn(VRAAGTYPEN, q.type)) throw fout(`${waar}: kies een geldig vraagtype.`);
    const type = q.type;
    const vraagTekst = tekst(q.tekst, waar, 'de vraag', { verplicht: true, max: 1000 });
    if (teksten.has(sleutel(vraagTekst))) {
      throw fout(`${waar}: deze vraag staat er al in (vraag ${teksten.get(sleutel(vraagTekst))}). Elke vraag mag één keer voorkomen.`);
    }
    teksten.set(sleutel(vraagTekst), i + 1);

    let opties = [];
    if (type === 'meerkeuze') {
      const ruweOpties = lijstVan(q.opties, `${waar}: geef de antwoordmogelijkheden op als lijst.`);
      if (ruweOpties.length > 200) throw fout(`${waar}: maximaal ${MAX_OPTIES} antwoordmogelijkheden.`);
      const gezien = new Set();
      for (const o of ruweOpties) {
        const label = tekst(isObject(o) ? o.label : o, waar, 'een antwoordmogelijkheid', { max: 200 });
        if (!label) continue;
        if (gezien.has(sleutel(label))) throw fout(`${waar}: de antwoordmogelijkheid "${kort(label)}" staat er dubbel in.`);
        gezien.add(sleutel(label));
        opties.push(label);
      }
      if (opties.length < 2) throw fout(`${waar}: geef minimaal twee antwoordmogelijkheden op.`);
      if (opties.length > MAX_OPTIES) throw fout(`${waar}: maximaal ${MAX_OPTIES} antwoordmogelijkheden (nu ${opties.length}).`);
    }

    const meerdere = isAan(q.meerdere_antwoorden);
    if (meerdere && type !== 'meerkeuze') throw fout(`${waar}: meerdere antwoorden kan alleen bij een meerkeuzevraag.`);
    const weetNiet = isAan(q.weet_niet);
    if (weetNiet && type !== 'schaal') throw fout(`${waar}: het antwoord "weet niet" kan alleen bij een schaalvraag.`);
    const uitsplitsen = isAan(q.uitsplitsen);
    if (uitsplitsen && !((type === 'meerkeuze' && !meerdere) || type === 'janee')) {
      throw fout(`${waar}: uitsplitsing kan alleen bij een meerkeuzevraag met één antwoord of bij een ja/nee-vraag.`);
    }
    let schaal = 'eens';
    if (type === 'schaal' && q.schaal_soort !== undefined && q.schaal_soort !== null && q.schaal_soort !== '') {
      if (typeof q.schaal_soort !== 'string' || !Object.hasOwn(SCHALEN, q.schaal_soort)) throw fout(`${waar}: kies een geldige schaal.`);
      schaal = q.schaal_soort;
    }

    vragen.push({
      plek: gevonden.plek,
      vraag: {
        thema: gevonden.thema.naam,
        meetpunt,
        type,
        tekst: vraagTekst,
        toelichting: tekst(q.toelichting, waar, 'de toelichting', { max: 1000 }),
        opties,
        schaal_soort: schaal,
        meerdere_antwoorden: meerdere,
        verplicht: isAan(q.verplicht),
        weet_niet: weetNiet,
        uitsplitsen,
      },
    });
  });
  // In de volgorde van de thema's; binnen een thema blijft de volgorde zoals opgegeven.
  vragen.sort((a, b) => a.plek - b.plek);

  // Acties
  const ruweActies = lijstVan(ruw.acties, 'De lijst met acties is ongeldig.');
  if (ruweActies.length > MAX_ACTIES * 2) throw fout(`Een sjabloon kan maximaal ${MAX_ACTIES} acties bevatten.`);
  const acties = [];
  const actieSleutels = new Set();
  ruweActies.forEach((a, i) => {
    const titel = tekst(isObject(a) ? a.titel : a, `Actie ${i + 1}`, 'de tekst', { max: 300 });
    if (!titel) return; // lege regel
    if (actieSleutels.has(sleutel(titel))) throw fout(`Actie ${i + 1}: "${kort(titel)}" staat er al in. Verwijder de dubbele actie.`);
    actieSleutels.add(sleutel(titel));
    acties.push(titel);
  });
  if (acties.length > MAX_ACTIES) throw fout(`Een sjabloon kan maximaal ${MAX_ACTIES} acties bevatten (nu ${acties.length}).`);

  const uit = { vragenlijst, themas, vragen: vragen.map((x) => x.vraag), acties };
  if (new TextEncoder().encode(JSON.stringify(uit)).length > MAX_BYTES) {
    throw fout('Het sjabloon is te groot (maximaal 200 kB). Maak teksten korter of verwijder onderdelen.');
  }
  return uit;
}

/** Naam en omschrijving van een sjabloon. */
export function controleerSjabloonGegevens(body) {
  return {
    naam: validatie.tekst(body.naam, 'Naam van het sjabloon', { verplicht: true, max: 150 }),
    omschrijving: validatie.tekst(body.omschrijving, 'Omschrijving', { max: 1000 }),
  };
}

// ---------- Standaardsjablonen in de database zetten ----------

function leesGeplaatst(rij) {
  try {
    const x = JSON.parse(rij ? rij.waarde : '[]');
    return Array.isArray(x) ? x.filter((y) => typeof y === 'string') : [];
  } catch {
    return [];
  }
}

const vraagGeplaatst = (env) => env.DB.prepare('SELECT waarde FROM instellingen WHERE sleutel = ?').bind(SLEUTEL_GEPLAATST);

const voegOrigineelToe = (env, s, nu) => {
  const o = origineel(s.id);
  // "WHERE NOT EXISTS": nooit twee keer hetzelfde standaardsjabloon, ook niet bij twee verzoeken tegelijk.
  return env.DB.prepare(
    `INSERT INTO sjablonen (naam, omschrijving, inhoud, aangemaakt_op, bron)
     SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM sjablonen WHERE bron = ?)`,
  ).bind(o.naam, o.omschrijving, o.inhoud, nu, s.id, s.id);
};

/**
 * Zet standaardsjablonen die nog nooit zijn geplaatst in de database.
 * geplaatstRij = de rij uit "instellingen" (of null). Geeft true als er iets is toegevoegd.
 */
async function plaatsOntbrekende(env, geplaatstRij) {
  const geplaatst = leesGeplaatst(geplaatstRij);
  const nieuw = INGEBOUWD.filter((s) => !geplaatst.includes(s.id));
  if (!nieuw.length) return false;
  const nu = nuIso();
  await env.DB.batch([
    ...nieuw.map((s) => voegOrigineelToe(env, s, nu)),
    env.DB.prepare(
      'INSERT INTO instellingen (sleutel, waarde) VALUES (?, ?) ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde',
    ).bind(SLEUTEL_GEPLAATST, JSON.stringify([...geplaatst, ...nieuw.map((s) => s.id)])),
  ]);
  return true;
}

// ---------- Opzoeken ----------

/**
 * Leest een verwijzing naar een sjabloon. Geldig zijn: het nummer (12 of '12'), de oude vorm
 * 'eigen-12' en het kenmerk van een standaardsjabloon (bijv. 'medewerkerstevredenheid').
 */
function leesVerwijzing(ref) {
  if (typeof ref === 'number' && Number.isSafeInteger(ref) && ref > 0) return { id: ref };
  if (typeof ref === 'string' && ref.length <= 60) {
    const m = /^(?:eigen-)?(\d{1,15})$/.exec(ref.trim());
    if (m && Number(m[1]) > 0) return { id: Number(m[1]) };
    if (/^[A-Za-z0-9_-]{1,60}$/.test(ref)) return { bron: ref };
  }
  throw new Fout(400, 'Ongeldig sjabloon.');
}

const KOLOMMEN = 'id, bron, naam, omschrijving, inhoud, aangemaakt_op, bijgewerkt_op';

function vraagSjabloon(env, verwijzing) {
  return verwijzing.id
    ? env.DB.prepare(`SELECT ${KOLOMMEN} FROM sjablonen WHERE id = ?`).bind(verwijzing.id)
    : env.DB.prepare(`SELECT ${KOLOMMEN} FROM sjablonen WHERE bron = ? ORDER BY id LIMIT 1`).bind(verwijzing.bron);
}

/**
 * Haalt meerdere sjablonen in één keer op (in de gevraagde volgorde). Elk item is de rij uit
 * de database; 404 als er één niet bestaat. Zet zo nodig eerst de standaardsjablonen klaar.
 */
export async function haalSjablonen(env, refs) {
  const verwijzingen = refs.map(leesVerwijzing);
  const vraagAlles = () => env.DB.batch([vraagGeplaatst(env), ...verwijzingen.map((x) => vraagSjabloon(env, x))]);
  let res = await vraagAlles();
  if (await plaatsOntbrekende(env, res[0].results[0])) res = await vraagAlles();
  return res.slice(1).map((r) => {
    if (!r.results.length) throw new Fout(404, BESTAAT_NIET);
    return r.results[0];
  });
}

export async function haalSjabloon(env, ref) {
  return (await haalSjablonen(env, [ref]))[0];
}

/** De inhoud van een rij als object (een kapotte rij geeft een leeg sjabloon, geen fout). */
export function inhoudVan(rij) {
  try {
    const x = JSON.parse(rij.inhoud);
    return isObject(x) ? x : legeInhoud();
  } catch {
    return legeInhoud();
  }
}

function isGewijzigd(rij) {
  const o = rij.bron ? origineel(rij.bron) : null;
  return !!o && (rij.naam !== o.naam || rij.omschrijving !== o.omschrijving || rij.inhoud !== o.inhoud);
}

/** Zo gaat een sjabloon (met inhoud) naar de browser. */
export function sjabloonUit(rij) {
  return {
    id: rij.id,
    bron: rij.bron || null,
    naam: rij.naam,
    omschrijving: rij.omschrijving,
    standaard: !!rij.bron,
    gewijzigd: isGewijzigd(rij),
    herstelbaar: !!rij.bron && !!origineel(rij.bron),
    aangemaakt_op: rij.aangemaakt_op,
    bijgewerkt_op: rij.bijgewerkt_op || null,
    inhoud: inhoudVan(rij),
  };
}

// ---------- Overzicht ----------

// De aantallen telt de database zelf (scheelt rekentijd in de Worker). De inhoud komt alleen
// mee bij sjablonen die van een standaardsjabloon afkomen, om te zien of ze zijn aangepast.
const LIJST_SQL = `
  SELECT id, bron, naam, omschrijving, aangemaakt_op, bijgewerkt_op,
    CASE WHEN bron IS NOT NULL THEN inhoud END AS inhoud,
    CASE WHEN json_valid(inhoud) THEN COALESCE(json_array_length(inhoud, '$.themas'), 0) ELSE 0 END AS n_themas,
    CASE WHEN json_valid(inhoud) THEN COALESCE((
      SELECT SUM(CASE WHEN t.type = 'object' THEN json_array_length(t.value, '$.meetpunten') END)
      FROM json_each(inhoud, '$.themas') AS t
    ), 0) ELSE 0 END AS n_meetpunten,
    CASE WHEN json_valid(inhoud) THEN COALESCE(json_array_length(inhoud, '$.vragen'), 0) ELSE 0 END AS n_vragen,
    CASE WHEN json_valid(inhoud) THEN COALESCE(json_array_length(inhoud, '$.acties'), 0) ELSE 0 END AS n_acties
  FROM sjablonen`;

/** Alle sjablonen (zonder inhoud) plus de standaardsjablonen die nu ontbreken. */
export async function lijstSjablonen(env) {
  const vraagAlles = () => env.DB.batch([vraagGeplaatst(env), env.DB.prepare(LIJST_SQL)]);
  let res = await vraagAlles();
  if (await plaatsOntbrekende(env, res[0].results[0])) res = await vraagAlles();
  const rijen = res[1].results;

  const plek = (r) => {
    if (!r.bron) return INGEBOUWD.length + 1;
    const i = INGEBOUWD.findIndex((s) => s.id === r.bron);
    return i < 0 ? INGEBOUWD.length : i;
  };
  rijen.sort((a, b) => plek(a) - plek(b) || a.naam.localeCompare(b.naam, 'nl', { sensitivity: 'base' }) || a.id - b.id);

  const aanwezig = new Set(rijen.map((r) => r.bron).filter(Boolean));
  return {
    sjablonen: rijen.map((r) => ({
      id: r.id,
      bron: r.bron || null,
      naam: r.naam,
      omschrijving: r.omschrijving,
      standaard: !!r.bron,
      gewijzigd: isGewijzigd(r),
      herstelbaar: !!r.bron && !!origineel(r.bron),
      aangemaakt_op: r.aangemaakt_op,
      bijgewerkt_op: r.bijgewerkt_op || null,
      samenvatting: { themas: r.n_themas, meetpunten: r.n_meetpunten, vragen: r.n_vragen, acties: r.n_acties },
    })),
    ontbrekend: INGEBOUWD.filter((s) => !aanwezig.has(s.id)).map((s) => ({ bron: s.id, naam: origineel(s.id).naam })),
  };
}

// ---------- Aanmaken, wijzigen, verwijderen, terugzetten ----------

/**
 * Opdracht om een nieuw eigen sjabloon op te slaan (nog niet uitgevoerd, zodat de aanroeper
 * hem in een batch kan zetten). Weigert als het maximum aantal sjablonen is bereikt.
 * inhoudJson = de inhoud als JSON-tekst.
 */
export function opdrachtNieuwSjabloon(env, { naam, omschrijving }, inhoudJson) {
  return env.DB.prepare(
    `INSERT INTO sjablonen (naam, omschrijving, inhoud, aangemaakt_op)
     SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM sjablonen) < ? RETURNING id`,
  ).bind(naam, omschrijving, inhoudJson, nuIso(), MAX_SJABLONEN);
}

const VOL = `Je hebt het maximum van ${MAX_SJABLONEN} sjablonen bereikt. Verwijder eerst een sjabloon dat je niet meer gebruikt.`;

/** Slaat een nieuw eigen sjabloon op en geeft het id terug. */
export async function nieuwSjabloon(env, gegevens, inhoudJson) {
  const rij = await opdrachtNieuwSjabloon(env, gegevens, inhoudJson).first();
  if (!rij) throw new Fout(409, VOL);
  return rij.id;
}

/** Leest het id uit het resultaat van opdrachtNieuwSjabloon (in een batch); null als het vol was. */
export function nieuwSjabloonId(resultaat) {
  return resultaat.results.length ? resultaat.results[0].id : null;
}

/**
 * Wijzigt naam en omschrijving en (als inhoud is meegegeven) de inhoud.
 * Geeft terug hoe het sjabloon er nu voor staat (zonder de inhoud).
 */
export async function wijzigSjabloon(env, ref, { naam, omschrijving }, inhoud = null) {
  const verwijzing = leesVerwijzing(ref);
  const waar = verwijzing.id ? 'id = ?' : 'bron = ?';
  const wie = verwijzing.id || verwijzing.bron;
  const rij = inhoud === null
    ? await env.DB.prepare(`UPDATE sjablonen SET naam = ?, omschrijving = ?, bijgewerkt_op = ? WHERE ${waar} RETURNING ${KOLOMMEN}`)
      .bind(naam, omschrijving, nuIso(), wie).first()
    : await env.DB.prepare(`UPDATE sjablonen SET naam = ?, omschrijving = ?, inhoud = ?, bijgewerkt_op = ? WHERE ${waar} RETURNING ${KOLOMMEN}`)
      .bind(naam, omschrijving, JSON.stringify(inhoud), nuIso(), wie).first();
  if (!rij) throw new Fout(404, BESTAAT_NIET);
  return {
    id: rij.id,
    bron: rij.bron || null,
    standaard: !!rij.bron,
    gewijzigd: isGewijzigd(rij),
    herstelbaar: !!rij.bron && !!origineel(rij.bron),
    bijgewerkt_op: rij.bijgewerkt_op,
  };
}

export async function verwijderSjabloon(env, ref) {
  const verwijzing = leesVerwijzing(ref);
  const res = verwijzing.id
    ? await env.DB.prepare('DELETE FROM sjablonen WHERE id = ?').bind(verwijzing.id).run()
    : await env.DB.prepare('DELETE FROM sjablonen WHERE bron = ?').bind(verwijzing.bron).run();
  if (!res.meta.changes) throw new Fout(404, BESTAAT_NIET);
}

/** Zet een sjabloon dat van een standaardsjabloon afkomt terug naar de versie uit de code. */
export async function zetOrigineelTerug(env, ref) {
  const rij = await haalSjabloon(env, ref);
  const o = rij.bron ? origineel(rij.bron) : null;
  if (!o) throw new Fout(400, 'Dit is een eigen sjabloon; daar is geen originele versie van.');
  await env.DB.prepare('UPDATE sjablonen SET naam = ?, omschrijving = ?, inhoud = ?, bijgewerkt_op = NULL WHERE id = ?')
    .bind(o.naam, o.omschrijving, o.inhoud, rij.id).run();
  return rij.id;
}

/** Zet standaardsjablonen terug die nu niet (meer) in de database staan. Geeft de namen terug. */
export async function herstelStandaard(env) {
  const [geplaatstRes, aanwezigRes] = await env.DB.batch([
    vraagGeplaatst(env),
    env.DB.prepare('SELECT DISTINCT bron FROM sjablonen WHERE bron IS NOT NULL'),
  ]);
  const aanwezig = new Set(aanwezigRes.results.map((r) => r.bron));
  const ontbreekt = INGEBOUWD.filter((s) => !aanwezig.has(s.id));
  if (!ontbreekt.length) return [];
  const geplaatst = leesGeplaatst(geplaatstRes.results[0]);
  const nu = nuIso();
  await env.DB.batch([
    ...ontbreekt.map((s) => voegOrigineelToe(env, s, nu)),
    env.DB.prepare(
      'INSERT INTO instellingen (sleutel, waarde) VALUES (?, ?) ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde',
    ).bind(SLEUTEL_GEPLAATST, JSON.stringify([...new Set([...geplaatst, ...INGEBOUWD.map((s) => s.id)])])),
  ]);
  return ontbreekt.map((s) => origineel(s.id).naam);
}
