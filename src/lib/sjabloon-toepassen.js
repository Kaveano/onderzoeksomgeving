// Sjablonen toepassen op een onderzoek en een onderzoek opslaan als sjabloon.
// Werkt met zo min mogelijk database-aanroepen (batches), vanwege de limiet
// van 50 aanroepen per verzoek op de gratis laag.

import { alle, nuIso, volgendeVolgorde } from './db.js';
import { willekeurigeCode } from './auth.js';
import { SCHALEN } from './schalen.js';
import { Fout } from './http.js';
import { INTRO_ANONIEM } from '../sjablonen.js';

export const MAX_VRAGEN = 100;

function vervang(tekst, bedrijf) {
  // "van {bedrijf}." met "Voorbeeld B.V." mag geen dubbele punt opleveren.
  return String(tekst || '')
    .replaceAll('{bedrijf}.', `${bedrijf.replace(/\.+$/, '')}.`)
    .replaceAll('{bedrijf}', bedrijf);
}

const sleutel = (s) => String(s).trim().toLowerCase();

export function standaardIntro(bedrijf) {
  return `${vervang('Fijn dat je mee wilt doen aan dit onderzoek van {bedrijf}.', bedrijf)} Het invullen duurt maar een paar minuten.\n\n${INTRO_ANONIEM}`;
}

export const STANDAARD_BEDANKT =
  'Hartelijk dank voor het invullen! Je antwoorden zijn anoniem opgeslagen. Je kunt dit venster nu sluiten.';

/** Zet een lijst labels om naar opties met vaste id's. */
export function optiesMetIds(labels) {
  return labels.map((label, i) => ({ id: `o${i + 1}`, label: String(label) }));
}

/** Alle vragen uit de sjablonen, zonder dubbele (zelfde tekst), achtergrondvragen achteraan. */
function verzamelVragen(inhouden, bedrijf) {
  const vragen = [];
  const gezien = new Set();
  for (const inhoud of inhouden) {
    for (const v of inhoud.vragen || []) {
      const tekst = vervang(v.tekst, bedrijf);
      if (gezien.has(sleutel(tekst))) continue;
      gezien.add(sleutel(tekst));
      vragen.push({ ...v, tekst, themaNaam: vervang(v.thema, bedrijf) });
    }
  }
  vragen.sort((a, b) => (sleutel(a.themaNaam) === 'achtergrond') - (sleutel(b.themaNaam) === 'achtergrond'));
  return vragen;
}

/** Weigert vooraf (vóór er iets wordt opgeslagen) als de sjablonen samen te veel vragen hebben. */
export function controleerSjablonen(inhouden, bedrijf) {
  const aantal = verzamelVragen(inhouden, bedrijf).length;
  if (aantal > MAX_VRAGEN) {
    throw new Fout(400, `De gekozen sjablonen hebben samen ${aantal} vragen; een vragenlijst kan er maximaal ${MAX_VRAGEN} hebben. Kies minder sjablonen.`);
  }
}

/**
 * Past één of meer sjablonen toe op een onderzoek.
 * - Thema's en meetpunten met dezelfde naam worden niet dubbel aangemaakt.
 * - Alle vragen komen samen in één nieuwe vragenlijst (gekoppeld aan meetmomentId).
 * - Acties die al bestaan (zelfde titel) worden overgeslagen.
 * Geeft het id van de nieuwe vragenlijst terug (of null als er geen vragen waren).
 */
export async function pasSjablonenToe(env, onderzoek, inhouden, { meetmomentId = null } = {}) {
  const bedrijf = onderzoek.bedrijfsnaam;
  const nu = nuIso();
  controleerSjablonen(inhouden, bedrijf);

  const [bestaandeThemas, bestaandeMeetpunten, bestaandeActies] = await env.DB.batch([
    env.DB.prepare('SELECT id, naam FROM themas WHERE onderzoek_id = ?').bind(onderzoek.id),
    env.DB.prepare(
      'SELECT m.id, m.naam, m.thema_id FROM meetpunten m JOIN themas t ON t.id = m.thema_id WHERE t.onderzoek_id = ?',
    ).bind(onderzoek.id),
    env.DB.prepare('SELECT titel FROM acties WHERE onderzoek_id = ?').bind(onderzoek.id),
  ]);

  const themaIds = new Map(bestaandeThemas.results.map((t) => [sleutel(t.naam), t.id]));
  const meetpuntIds = new Map(bestaandeMeetpunten.results.map((m) => [`${m.thema_id}|${sleutel(m.naam)}`, m.id]));
  const actieTitels = new Set(bestaandeActies.results.map((a) => sleutel(a.titel)));

  // 1. Thema's
  const nieuweThemas = [];
  for (const inhoud of inhouden) {
    for (const t of inhoud.themas || []) {
      const naam = vervang(t.naam, bedrijf);
      if (!themaIds.has(sleutel(naam)) && !nieuweThemas.some((n) => sleutel(n.naam) === sleutel(naam))) {
        nieuweThemas.push({ naam, omschrijving: vervang(t.omschrijving, bedrijf) });
      }
    }
  }
  if (nieuweThemas.length) {
    let volgorde = await volgendeVolgorde(env, 'themas', 'onderzoek_id', onderzoek.id);
    // Achtergrond altijd als laatste thema.
    nieuweThemas.sort((a, b) => (sleutel(a.naam) === 'achtergrond') - (sleutel(b.naam) === 'achtergrond'));
    const res = await env.DB.batch(
      nieuweThemas.map((t) =>
        env.DB.prepare('INSERT INTO themas (onderzoek_id, naam, omschrijving, volgorde) VALUES (?, ?, ?, ?) RETURNING id, naam')
          .bind(onderzoek.id, t.naam, t.omschrijving, volgorde++),
      ),
    );
    for (const r of res) themaIds.set(sleutel(r.results[0].naam), r.results[0].id);
  }

  // 2. Meetpunten. Een meetpunt met een naam die elders in het onderzoek al bestaat (bijv.
  // "Verzuimpercentage" in twee sjablonen) wordt niet nog eens aangemaakt, tenzij er vragen naar verwijzen.
  const nieuweMeetpunten = [];
  const meetpuntNamen = new Set(bestaandeMeetpunten.results.map((m) => sleutel(m.naam)));
  const gebruikt = new Set();
  for (const inhoud of inhouden) {
    for (const v of inhoud.vragen || []) {
      if (v.meetpunt) gebruikt.add(`${sleutel(vervang(v.thema, bedrijf))}|${sleutel(vervang(v.meetpunt, bedrijf))}`);
    }
  }
  for (const inhoud of inhouden) {
    for (const t of inhoud.themas || []) {
      const themaId = themaIds.get(sleutel(vervang(t.naam, bedrijf)));
      for (const m of t.meetpunten || []) {
        const naam = vervang(m.naam, bedrijf);
        const k = `${themaId}|${sleutel(naam)}`;
        if (meetpuntIds.has(k) || nieuweMeetpunten.some((n) => n.k === k)) continue;
        const elders = meetpuntNamen.has(sleutel(naam));
        if (elders && !gebruikt.has(`${sleutel(vervang(t.naam, bedrijf))}|${sleutel(naam)}`)) continue;
        meetpuntNamen.add(sleutel(naam));
        nieuweMeetpunten.push({ k, themaId, naam, omschrijving: vervang(m.omschrijving, bedrijf), eenheid: m.eenheid || '' });
      }
    }
  }
  if (nieuweMeetpunten.length) {
    const res = await env.DB.batch(
      nieuweMeetpunten.map((m, i) =>
        env.DB.prepare(
          'INSERT INTO meetpunten (thema_id, naam, omschrijving, eenheid, volgorde) VALUES (?, ?, ?, ?, ?) RETURNING id',
        ).bind(m.themaId, m.naam, m.omschrijving, m.eenheid, i + 1),
      ),
    );
    res.forEach((r, i) => meetpuntIds.set(nieuweMeetpunten[i].k, r.results[0].id));
  }

  // 3. Vragenlijst met alle vragen
  const vragen = verzamelVragen(inhouden, bedrijf);

  let vragenlijstId = null;
  if (vragen.length) {
    const eerste = inhouden.find((i) => i.vragenlijst) || {};
    const vl = eerste.vragenlijst || {};
    const titel = inhouden.filter((i) => (i.vragen || []).length).length > 1
      ? onderzoek.titel
      : vervang(vl.titel || onderzoek.titel, bedrijf);
    const vlRes = await env.DB.prepare(
      `INSERT INTO vragenlijsten (onderzoek_id, meetmoment_id, titel, introtekst, bedanktekst, code, status, aangemaakt_op)
       VALUES (?, ?, ?, ?, ?, ?, 'gesloten', ?) RETURNING id`,
    ).bind(
      onderzoek.id,
      meetmomentId,
      titel,
      vl.introtekst ? vervang(vl.introtekst, bedrijf) : standaardIntro(bedrijf),
      vl.bedanktekst ? vervang(vl.bedanktekst, bedrijf) : STANDAARD_BEDANKT,
      willekeurigeCode(16),
      nu,
    ).first();
    vragenlijstId = vlRes.id;

    const stmts = vragen.map((v, i) => {
      const themaId = themaIds.get(sleutel(v.themaNaam));
      const meetpuntId = v.meetpunt ? meetpuntIds.get(`${themaId}|${sleutel(vervang(v.meetpunt, bedrijf))}`) || null : null;
      const opties = v.type === 'meerkeuze' ? optiesMetIds((v.opties || []).map((o) => vervang(typeof o === 'string' ? o : o.label, bedrijf))) : [];
      const schaal = SCHALEN[v.schaal_soort] ? v.schaal_soort : 'eens';
      return env.DB.prepare(
        `INSERT INTO vragen (vragenlijst_id, thema_id, meetpunt_id, type, tekst, toelichting, opties, schaal_soort,
           meerdere_antwoorden, verplicht, weet_niet, uitsplitsen, volgorde)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        vragenlijstId,
        themaId,
        meetpuntId,
        v.type,
        v.tekst,
        vervang(v.toelichting, bedrijf),
        JSON.stringify(opties),
        schaal,
        v.meerdere_antwoorden ? 1 : 0,
        v.verplicht ? 1 : 0,
        v.weet_niet ? 1 : 0,
        v.uitsplitsen && !v.meerdere_antwoorden ? 1 : 0,
        i + 1,
      );
    });
    await env.DB.batch(stmts);
  }

  // 4. Acties
  const nieuweActies = [];
  for (const inhoud of inhouden) {
    for (const a of inhoud.acties || []) {
      const titel = vervang(typeof a === 'string' ? a : a.titel, bedrijf);
      if (!actieTitels.has(sleutel(titel))) {
        actieTitels.add(sleutel(titel));
        nieuweActies.push(titel);
      }
    }
  }
  if (nieuweActies.length) {
    const start = await volgendeVolgorde(env, 'acties', 'onderzoek_id', onderzoek.id);
    await env.DB.batch(
      nieuweActies.map((titel, i) =>
        env.DB.prepare(
          "INSERT INTO acties (onderzoek_id, titel, status, volgorde, aangemaakt_op) VALUES (?, ?, 'te_doen', ?, ?)",
        ).bind(onderzoek.id, titel, start + i, nu),
      ),
    );
  }

  return vragenlijstId;
}

/** Maakt sjablooninhoud van een onderzoek (bedrijfsnaam wordt weer {bedrijf}). */
export async function maakSjabloonInhoud(env, onderzoek, vragenlijstId = null) {
  const bedrijf = onderzoek.bedrijfsnaam;
  const terug = (t) => (bedrijf && bedrijf.length >= 2 ? String(t || '').replaceAll(bedrijf, '{bedrijf}') : String(t || ''));

  const themas = await alle(env, 'SELECT * FROM themas WHERE onderzoek_id = ? ORDER BY volgorde, id', onderzoek.id);
  const meetpunten = await alle(
    env,
    'SELECT m.* FROM meetpunten m JOIN themas t ON t.id = m.thema_id WHERE t.onderzoek_id = ? ORDER BY m.volgorde, m.id',
    onderzoek.id,
  );
  const lijsten = await alle(env, 'SELECT * FROM vragenlijsten WHERE onderzoek_id = ? ORDER BY id', onderzoek.id);
  const vl = vragenlijstId ? lijsten.find((l) => l.id === vragenlijstId) : lijsten[0];
  const vragen = vl
    ? await alle(env, 'SELECT * FROM vragen WHERE vragenlijst_id = ? ORDER BY volgorde, id', vl.id)
    : [];
  const acties = await alle(env, 'SELECT titel FROM acties WHERE onderzoek_id = ? ORDER BY volgorde, id', onderzoek.id);

  const themaNaam = new Map(themas.map((t) => [t.id, t.naam]));
  const meetpuntNaam = new Map(meetpunten.map((m) => [m.id, m.naam]));

  return {
    themas: themas.map((t) => ({
      naam: terug(t.naam),
      omschrijving: terug(t.omschrijving),
      meetpunten: meetpunten
        .filter((m) => m.thema_id === t.id)
        .map((m) => ({ naam: terug(m.naam), omschrijving: terug(m.omschrijving), eenheid: m.eenheid })),
    })),
    vragenlijst: vl ? { titel: terug(vl.titel), introtekst: terug(vl.introtekst), bedanktekst: terug(vl.bedanktekst) } : null,
    vragen: vragen.map((v) => ({
      thema: terug(themaNaam.get(v.thema_id)),
      meetpunt: v.meetpunt_id ? terug(meetpuntNaam.get(v.meetpunt_id)) : null,
      type: v.type,
      tekst: terug(v.tekst),
      toelichting: terug(v.toelichting),
      opties: JSON.parse(v.opties || '[]').map((o) => terug(o.label)),
      schaal_soort: v.schaal_soort,
      meerdere_antwoorden: !!v.meerdere_antwoorden,
      verplicht: !!v.verplicht,
      weet_niet: !!v.weet_niet,
      uitsplitsen: !!v.uitsplitsen,
    })),
    acties: acties.map((a) => terug(a.titel)),
  };
}
