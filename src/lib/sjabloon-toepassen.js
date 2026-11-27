// Sjablonen samenvoegen, toepassen op een onderzoek en een onderzoek opslaan als sjabloon.
// Werkt met zo min mogelijk database-aanroepen (batches), vanwege de limiet
// van 50 aanroepen per verzoek op de gratis laag.

import { nuIso } from './db.js';
import { willekeurigeCode } from './auth.js';
import { SCHALEN, VRAAGTYPEN, CIJFERSCHALEN } from './schalen.js';
import { KENMERKEN, kenmerkVoorTekst } from '../../public/js/beheer/kenmerken.js';
import { Fout } from './http.js';
import { INTRO_ANONIEM } from '../sjablonen.js';

export const MAX_VRAGEN = 100;

// Zoveel opdrachten gaan er hooguit in één batch naar de database.
const MAX_PER_BATCH = 200;

export function vervang(tekst, bedrijf) {
  // "van {bedrijf}." met "Voorbeeld B.V." mag geen dubbele punt opleveren.
  // Vervangen via een functie, zodat tekens als $ in de bedrijfsnaam geen betekenis krijgen.
  return String(tekst ?? '')
    .replaceAll('{bedrijf}.', () => `${bedrijf.replace(/\.+$/, '')}.`)
    .replaceAll('{bedrijf}', () => bedrijf);
}

const sleutel = (s) => String(s ?? '').trim().toLowerCase();
const lijst = (x) => (Array.isArray(x) ? x : []);
const isAchtergrond = (naam) => sleutel(naam) === 'achtergrond';
const magKenmerkHebben = (type, meerdere) => (type === 'meerkeuze' && !meerdere) || type === 'janee';

/** schaal_soort zoals hij in de database komt: een schaal 1 tot 5, een cijferschaal of 'eens'. */
function schaalSoortVan(v) {
  if (v.type === 'schaal') return Object.hasOwn(SCHALEN, v.schaal_soort) ? v.schaal_soort : 'eens';
  if (v.type === 'cijfer') return Object.hasOwn(CIJFERSCHALEN, v.schaal_soort) ? v.schaal_soort : 'rapport';
  return 'eens';
}

export function standaardIntro(bedrijf) {
  return `${vervang('Fijn dat je mee wilt doen aan dit onderzoek van {bedrijf}.', bedrijf)} Het invullen duurt maar een paar minuten.\n\n${INTRO_ANONIEM}`;
}

export const STANDAARD_BEDANKT =
  'Hartelijk dank voor het invullen! Je antwoorden zijn anoniem opgeslagen. Je kunt dit venster nu sluiten.';

/** Zet een lijst labels om naar opties met vaste id's. */
export function optiesMetIds(labels) {
  return labels.map((label, i) => ({ id: `o${i + 1}`, label: String(label) }));
}

/** Lege sjablooninhoud (zelfde opbouw als de "inhoud" in src/sjablonen.js). */
export function legeInhoud() {
  return { vragenlijst: { titel: '', introtekst: '', bedanktekst: '' }, themas: [], vragen: [], acties: [] };
}

/**
 * Voegt de inhoud van één of meer sjablonen samen tot één inhoud. Dit is de enige plek waar
 * de regels voor samenvoegen staan; zowel het toepassen op een onderzoek als het voorbeeld
 * bij "Nieuw onderzoek" gebruiken deze functie.
 *
 * Regels:
 * - Thema's met dezelfde naam worden één thema (de eerste omschrijving blijft staan).
 * - Meetpunten met dezelfde naam binnen een thema komen er één keer in. Komt een meetpunt uit
 *   een later sjabloon al bij een ander thema voor (bijv. "Verzuimpercentage"), dan wordt het
 *   niet nog eens aangemaakt, tenzij er een vraag naar verwijst.
 * - Vragen met dezelfde tekst komen er één keer in.
 * - Een achtergrondkenmerk (zoals 'afdeling') komt één keer voor: geven twee sjablonen hetzelfde kenmerk bij
 *   verschillende vragen, dan houdt de eerste het en krijgt de latere vraag geen kenmerk ('' staat er dan niet in).
 * - Het thema "Achtergrond" en de vragen daarvan staan altijd achteraan.
 * - Acties met dezelfde tekst komen er één keer in.
 * - Hebben meerdere sjablonen vragen, dan blijft de titel van de vragenlijst leeg
 *   (bij het toepassen wordt dat de titel van het onderzoek).
 *
 * Met opties.bedrijf wordt {bedrijf} eerst vervangen door de bedrijfsnaam (bij het toepassen);
 * zonder blijft {bedrijf} staan. De functie leest niets uit de database en wijzigt de invoer niet.
 */
export function voegSjablonenSamen(inhouden, { bedrijf = null } = {}) {
  const t = bedrijf === null ? (x) => String(x ?? '').trim() : (x) => vervang(x, bedrijf).trim();
  const bronnen = lijst(inhouden).filter((i) => i && typeof i === 'object');

  // Naar welke meetpunten verwijzen vragen? (thema|meetpunt)
  const gebruikt = new Set();
  for (const inhoud of bronnen) {
    for (const v of lijst(inhoud.vragen)) {
      if (v && v.meetpunt) gebruikt.add(`${sleutel(t(v.thema))}|${sleutel(t(v.meetpunt))}`);
    }
  }

  const themas = [];
  const themaMap = new Map();
  const zorgThema = (naam, omschrijving = '') => {
    const k = sleutel(naam);
    let thema = themaMap.get(k);
    if (!thema) {
      thema = { naam, omschrijving, meetpunten: [] };
      themaMap.set(k, thema);
      themas.push(thema);
    }
    return thema;
  };

  // 1. Thema's en meetpunten
  const namenEerder = new Set(); // meetpuntnamen uit eerdere sjablonen
  for (const inhoud of bronnen) {
    const namenNu = [];
    for (const th of lijst(inhoud.themas)) {
      if (!th || typeof th !== 'object') continue;
      const naam = t(th.naam);
      if (!naam) continue;
      const thema = zorgThema(naam, t(th.omschrijving));
      for (const m of lijst(th.meetpunten)) {
        if (!m || typeof m !== 'object') continue;
        const mNaam = t(m.naam);
        if (!mNaam) continue;
        const k = sleutel(mNaam);
        if (thema.meetpunten.some((x) => sleutel(x.naam) === k)) continue;
        if (namenEerder.has(k) && !gebruikt.has(`${sleutel(naam)}|${k}`)) continue;
        thema.meetpunten.push({ naam: mNaam, omschrijving: t(m.omschrijving), eenheid: String(m.eenheid ?? '').trim() });
        namenNu.push(k);
      }
    }
    for (const k of namenNu) namenEerder.add(k);
  }

  // 2. Vragen (zonder dubbele; een vraag met een onbekend thema krijgt dat thema erbij)
  const vragen = [];
  const gezien = new Set();
  const kenmerken = new Set();
  for (const inhoud of bronnen) {
    for (const v of lijst(inhoud.vragen)) {
      if (!v || typeof v !== 'object' || !Object.hasOwn(VRAAGTYPEN, v.type)) continue;
      const tekst = t(v.tekst);
      const themaNaam = t(v.thema);
      if (!tekst || !themaNaam || gezien.has(sleutel(tekst))) continue;
      gezien.add(sleutel(tekst));
      const thema = zorgThema(themaNaam);
      const meetpunt = v.meetpunt ? thema.meetpunten.find((m) => sleutel(m.naam) === sleutel(t(v.meetpunt))) : null;
      const meerdere = v.type === 'meerkeuze' && !!v.meerdere_antwoorden;
      let kenmerk = typeof v.kenmerk === 'string' && Object.hasOwn(KENMERKEN, v.kenmerk) && magKenmerkHebben(v.type, meerdere) ? v.kenmerk : '';
      if (kenmerk && !KENMERKEN[kenmerk].meerdere) {
        if (kenmerken.has(kenmerk)) kenmerk = '';
        else kenmerken.add(kenmerk);
      }
      vragen.push({
        thema: thema.naam,
        meetpunt: meetpunt ? meetpunt.naam : null,
        type: v.type,
        tekst,
        toelichting: t(v.toelichting),
        opties: v.type === 'meerkeuze'
          ? lijst(v.opties).map((o) => t(typeof o === 'string' ? o : o && o.label)).filter(Boolean)
          : [],
        schaal_soort: schaalSoortVan(v),
        meerdere_antwoorden: meerdere,
        verplicht: !!v.verplicht,
        weet_niet: (v.type === 'schaal' || v.type === 'cijfer') && !!v.weet_niet,
        uitsplitsen: !!v.uitsplitsen && !meerdere && (v.type === 'meerkeuze' || v.type === 'janee'),
        ...(kenmerk ? { kenmerk } : {}),
      });
    }
  }

  // 3. Achtergrond achteraan (de rest houdt zijn volgorde)
  themas.sort((a, b) => isAchtergrond(a.naam) - isAchtergrond(b.naam));
  vragen.sort((a, b) => isAchtergrond(a.thema) - isAchtergrond(b.thema));

  // 4. Acties
  const acties = [];
  const actieSleutels = new Set();
  for (const inhoud of bronnen) {
    for (const a of lijst(inhoud.acties)) {
      const titel = t(typeof a === 'string' ? a : a && a.titel);
      if (!titel || actieSleutels.has(sleutel(titel))) continue;
      actieSleutels.add(sleutel(titel));
      acties.push(titel);
    }
  }

  // 5. Teksten van de vragenlijst: van het eerste sjabloon dat ze heeft. Extra alinea's uit de
  // uitleg van de andere sjablonen (bijvoorbeeld de verwijzing naar de vertrouwenspersoon bij
  // sociale veiligheid) gaan mee, zodat belangrijke uitleg niet wegvalt bij combineren.
  const metVragen = bronnen.filter((i) => lijst(i.vragen).length).length;
  const metTeksten = bronnen.filter((i) => i.vragenlijst && typeof i.vragenlijst === 'object').map((i) => i.vragenlijst);
  const vl = metTeksten[0] || {};
  const alineas = (tekst) => t(tekst).split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const intro = alineas(vl.introtekst);
  const anoniem = t(INTRO_ANONIEM);
  const aanwezig = new Set(intro.map(sleutel));
  const extra = [];
  for (const ander of metTeksten.slice(1)) {
    // De eerste alinea (het doel van dat sjabloon) en de anonimiteitstekst slaan we over.
    for (const alinea of alineas(ander.introtekst).slice(1)) {
      if (alinea === anoniem || aanwezig.has(sleutel(alinea))) continue;
      aanwezig.add(sleutel(alinea));
      extra.push(alinea);
    }
  }
  if (extra.length) {
    const plek = intro.lastIndexOf(anoniem);
    if (plek >= 0) intro.splice(plek, 0, ...extra);
    else intro.push(...extra);
  }
  return {
    vragenlijst: {
      titel: metVragen > 1 ? '' : t(vl.titel),
      introtekst: intro.join('\n\n'),
      bedanktekst: t(vl.bedanktekst),
    },
    themas,
    vragen,
    acties,
  };
}

/** Weigert (vóór er iets wordt opgeslagen) als de samengevoegde inhoud te veel vragen heeft. */
export function controleerAantalVragen(samengevoegd, aantalSjablonen = 1) {
  const aantal = samengevoegd.vragen.length;
  if (aantal <= MAX_VRAGEN) return;
  throw new Fout(400, aantalSjablonen > 1
    ? `De gekozen sjablonen hebben samen ${aantal} vragen; een vragenlijst kan er maximaal ${MAX_VRAGEN} hebben. Kies minder sjablonen.`
    : `Dit sjabloon heeft ${aantal} vragen; een vragenlijst kan er maximaal ${MAX_VRAGEN} hebben.`);
}

/** Weigert vooraf als de sjablonen samen te veel vragen hebben. */
export function controleerSjablonen(inhouden, bedrijf) {
  controleerAantalVragen(voegSjablonenSamen(inhouden, { bedrijf }), inhouden.length);
}

/**
 * Past één of meer sjablonen toe op een onderzoek.
 * - De sjablonen worden eerst samengevoegd (zie voegSjablonenSamen).
 * - Thema's en meetpunten die al in het onderzoek staan (zelfde naam) worden niet dubbel aangemaakt.
 * - Alle vragen komen samen in één nieuwe vragenlijst (gekoppeld aan meetmomentId).
 * - Acties die al bestaan (zelfde titel) worden overgeslagen.
 * Twee database-aanroepen: één keer lezen wat er al is, één keer alles wegschrijven.
 * Geeft het id van de nieuwe vragenlijst terug (of null als er geen vragen waren).
 */
export async function pasSjablonenToe(env, onderzoek, inhouden, { meetmomentId = null } = {}) {
  const bedrijf = onderzoek.bedrijfsnaam;
  const nu = nuIso();
  const samen = voegSjablonenSamen(inhouden, { bedrijf });
  controleerAantalVragen(samen, inhouden.length);

  const [bestaandeThemas, bestaandeMeetpunten, bestaandeActies] = await env.DB.batch([
    env.DB.prepare('SELECT id, naam, volgorde FROM themas WHERE onderzoek_id = ?').bind(onderzoek.id),
    env.DB.prepare(
      'SELECT m.id, m.naam, m.thema_id, m.volgorde FROM meetpunten m JOIN themas t ON t.id = m.thema_id WHERE t.onderzoek_id = ?',
    ).bind(onderzoek.id),
    env.DB.prepare('SELECT titel, volgorde FROM acties WHERE onderzoek_id = ?').bind(onderzoek.id),
  ]);

  const themaIds = new Map(bestaandeThemas.results.map((th) => [sleutel(th.naam), th.id]));
  const meetpuntIds = new Map(bestaandeMeetpunten.results.map((m) => [`${m.thema_id}|${sleutel(m.naam)}`, m.id]));
  const meetpuntNamen = new Set(bestaandeMeetpunten.results.map((m) => sleutel(m.naam)));
  const actieTitels = new Set(bestaandeActies.results.map((a) => sleutel(a.titel)));
  const hoogste = (rijen) => rijen.reduce((max, r) => Math.max(max, r.volgorde || 0), 0);

  // Een thema of meetpunt dat in dezelfde batch wordt aangemaakt heeft nog geen id;
  // dan zoekt de database het op naam op.
  const THEMA_ID = 'COALESCE(?, (SELECT id FROM themas WHERE onderzoek_id = ? AND naam = ? ORDER BY id DESC LIMIT 1))';
  const themaParams = (naam) => [themaIds.get(sleutel(naam)) ?? null, onderzoek.id, naam];

  const opdrachten = [];

  // 1. Thema's
  let themaVolgorde = hoogste(bestaandeThemas.results);
  for (const th of samen.themas) {
    if (themaIds.has(sleutel(th.naam))) continue;
    opdrachten.push(
      env.DB.prepare('INSERT INTO themas (onderzoek_id, naam, omschrijving, volgorde) VALUES (?, ?, ?, ?)')
        .bind(onderzoek.id, th.naam, th.omschrijving, ++themaVolgorde),
    );
  }

  // 2. Meetpunten. Een meetpunt met een naam die elders in het onderzoek al bestaat (bijv.
  // "Verzuimpercentage") wordt niet nog eens aangemaakt, tenzij er vragen naar verwijzen.
  const gebruikt = new Set(samen.vragen.filter((v) => v.meetpunt).map((v) => `${sleutel(v.thema)}|${sleutel(v.meetpunt)}`));
  const nieuweMeetpunten = new Set(); // thema|meetpunt
  for (const th of samen.themas) {
    const themaId = themaIds.get(sleutel(th.naam)) ?? null;
    let volgorde = themaId === null ? 0 : hoogste(bestaandeMeetpunten.results.filter((m) => m.thema_id === themaId));
    for (const m of th.meetpunten) {
      const k = `${sleutel(th.naam)}|${sleutel(m.naam)}`;
      if (themaId !== null && meetpuntIds.has(`${themaId}|${sleutel(m.naam)}`)) continue;
      if (meetpuntNamen.has(sleutel(m.naam)) && !gebruikt.has(k)) continue;
      nieuweMeetpunten.add(k);
      opdrachten.push(
        env.DB.prepare(`INSERT INTO meetpunten (thema_id, naam, omschrijving, eenheid, volgorde) VALUES (${THEMA_ID}, ?, ?, ?, ?)`)
          .bind(...themaParams(th.naam), m.naam, m.omschrijving, m.eenheid, ++volgorde),
      );
    }
  }

  // 3. Vragenlijst met alle vragen
  let vragenlijstPlek = -1;
  if (samen.vragen.length) {
    const vl = samen.vragenlijst;
    const code = willekeurigeCode(16);
    vragenlijstPlek = opdrachten.length;
    opdrachten.push(
      env.DB.prepare(
        `INSERT INTO vragenlijsten (onderzoek_id, meetmoment_id, titel, introtekst, bedanktekst, code, status, aangemaakt_op)
         VALUES (?, ?, ?, ?, ?, ?, 'gesloten', ?) RETURNING id`,
      ).bind(
        onderzoek.id,
        meetmomentId,
        vl.titel || onderzoek.titel,
        vl.introtekst || standaardIntro(bedrijf),
        vl.bedanktekst || STANDAARD_BEDANKT,
        code,
        nu,
      ),
    );
    // Kenmerk: zoals in het sjabloon, of anders herkend aan de tekst (ook bij oudere en eigen sjablonen);
    // elk kenmerk hooguit één keer per vragenlijst (behalve 'overig').
    const kenmerkGebruikt = new Set(samen.vragen.map((v) => v.kenmerk).filter(Boolean));
    const kenmerkVan = (v) => {
      if (v.kenmerk) return v.kenmerk;
      const k = kenmerkVoorTekst(v.tekst);
      if (!k || !magKenmerkHebben(v.type, v.meerdere_antwoorden) || (!KENMERKEN[k].meerdere && kenmerkGebruikt.has(k))) return '';
      kenmerkGebruikt.add(k);
      return k;
    };
    samen.vragen.forEach((v, i) => {
      const themaId = themaIds.get(sleutel(v.thema)) ?? null;
      let meetpuntId = null;
      let meetpuntNaam = null;
      if (v.meetpunt) {
        if (themaId !== null) meetpuntId = meetpuntIds.get(`${themaId}|${sleutel(v.meetpunt)}`) ?? null;
        if (meetpuntId === null && nieuweMeetpunten.has(`${sleutel(v.thema)}|${sleutel(v.meetpunt)}`)) meetpuntNaam = v.meetpunt;
      }
      opdrachten.push(
        env.DB.prepare(
          `INSERT INTO vragen (vragenlijst_id, thema_id, meetpunt_id, type, tekst, toelichting, opties, schaal_soort,
             meerdere_antwoorden, verplicht, weet_niet, uitsplitsen, volgorde, kenmerk)
           VALUES ((SELECT id FROM vragenlijsten WHERE code = ?), ${THEMA_ID},
             COALESCE(?, (SELECT id FROM meetpunten WHERE thema_id = ${THEMA_ID} AND naam = ? ORDER BY id DESC LIMIT 1)),
             ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          code,
          ...themaParams(v.thema),
          meetpuntId,
          ...themaParams(v.thema),
          meetpuntNaam,
          v.type,
          v.tekst,
          v.toelichting,
          JSON.stringify(v.type === 'meerkeuze' ? optiesMetIds(v.opties) : []),
          v.schaal_soort,
          v.meerdere_antwoorden ? 1 : 0,
          v.verplicht ? 1 : 0,
          v.weet_niet ? 1 : 0,
          v.uitsplitsen ? 1 : 0,
          i + 1,
          kenmerkVan(v),
        ),
      );
    });
  }

  // 4. Acties
  let actieVolgorde = hoogste(bestaandeActies.results);
  for (const titel of samen.acties) {
    if (actieTitels.has(sleutel(titel))) continue;
    opdrachten.push(
      env.DB.prepare("INSERT INTO acties (onderzoek_id, titel, status, volgorde, aangemaakt_op) VALUES (?, ?, 'te_doen', ?, ?)")
        .bind(onderzoek.id, titel, ++actieVolgorde, nu),
    );
  }

  // Wegschrijven: meestal past alles in één batch (alles of niets).
  let vragenlijstId = null;
  for (let begin = 0; begin < opdrachten.length; begin += MAX_PER_BATCH) {
    const res = await env.DB.batch(opdrachten.slice(begin, begin + MAX_PER_BATCH));
    if (vragenlijstPlek >= begin && vragenlijstPlek < begin + MAX_PER_BATCH) {
      vragenlijstId = res[vragenlijstPlek - begin].results[0].id;
    }
  }
  return vragenlijstId;
}

/** Maakt sjablooninhoud van een onderzoek (bedrijfsnaam wordt weer {bedrijf}). */
export async function maakSjabloonInhoud(env, onderzoek, vragenlijstId = null) {
  const bedrijf = onderzoek.bedrijfsnaam;
  const terug = (t) => {
    let x = String(t || '');
    if (!bedrijf || bedrijf.length < 2) return x;
    if (bedrijf.endsWith('.')) {
      // "… van Voorbeeld B.V. Met …": de punt van "B.V." was ook de zinspunt.
      const esc = bedrijf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      x = x.replace(new RegExp(`${esc}(?=\\s+[A-ZÀ-Ý]|\\s*$)`, 'gm'), '{bedrijf}.');
    }
    return x.split(bedrijf).join('{bedrijf}');
  };

  const [themaRes, meetpuntRes, lijstRes, vraagRes, actieRes] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM themas WHERE onderzoek_id = ? ORDER BY volgorde, id').bind(onderzoek.id),
    env.DB.prepare(
      'SELECT m.* FROM meetpunten m JOIN themas t ON t.id = m.thema_id WHERE t.onderzoek_id = ? ORDER BY m.volgorde, m.id',
    ).bind(onderzoek.id),
    env.DB.prepare('SELECT * FROM vragenlijsten WHERE onderzoek_id = ? ORDER BY id').bind(onderzoek.id),
    // De vragen van de gekozen vragenlijst, of anders van de eerste vragenlijst van het onderzoek.
    env.DB.prepare(
      `SELECT * FROM vragen
       WHERE vragenlijst_id = COALESCE(?, (SELECT id FROM vragenlijsten WHERE onderzoek_id = ? ORDER BY id LIMIT 1))
       ORDER BY volgorde, id`,
    ).bind(vragenlijstId, onderzoek.id),
    env.DB.prepare('SELECT titel FROM acties WHERE onderzoek_id = ? ORDER BY volgorde, id').bind(onderzoek.id),
  ]);
  const themas = themaRes.results;
  const meetpunten = meetpuntRes.results;
  const lijsten = lijstRes.results;
  const vl = vragenlijstId ? lijsten.find((l) => l.id === vragenlijstId) : lijsten[0];
  const vragen = vl ? vraagRes.results : [];
  const acties = actieRes.results;

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
      ...(v.kenmerk ? { kenmerk: v.kenmerk } : {}),
    })),
    acties: acties.map((a) => terug(a.titel)),
  };
}
