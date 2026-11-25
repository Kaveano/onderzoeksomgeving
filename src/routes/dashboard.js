// Dashboard: respons, gemiddelden per thema, verdeling, verloop, eigen cijfers,
// open antwoorden en uitsplitsing. Groepen met minder dan DREMPEL respondenten
// worden in een uitsplitsing nooit getoond.

import { json } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { haalOnderzoek } from '../lib/db.js';
import { DREMPEL, SCHALEN, WEET_NIET } from '../lib/schalen.js';

const rond = (x) => (x === null || x === undefined || Number.isNaN(x) ? null : Math.round(x * 100) / 100);
const pct = (deel, geheel) => (geheel ? Math.round((deel / geheel) * 1000) / 10 : null);

function schudden(lijst) {
  const a = [...lijst];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function schaalWaarde(a) {
  return Number.isInteger(a) && a >= 1 && a <= 5 ? a : null;
}

/** Gemiddelde (gepoold) per groep vragen over een set inzendingen. */
function gepoold(vragen, inzendingen) {
  let som = 0;
  let aantal = 0;
  let respondenten = 0;
  for (const inz of inzendingen) {
    let telt = false;
    for (const q of vragen) {
      const w = schaalWaarde(inz.a[q.id]);
      if (w !== null) {
        som += w;
        aantal++;
        telt = true;
      }
    }
    if (telt) respondenten++;
  }
  return { gemiddelde: aantal ? rond(som / aantal) : null, n: respondenten, antwoorden: aantal };
}

/** Statistiek voor één vraag. */
function vraagStatistiek(q, inzendingen) {
  const resultaat = {
    id: q.id,
    thema_id: q.thema_id,
    meetpunt_id: q.meetpunt_id,
    type: q.type,
    tekst: q.tekst,
    meerdere_antwoorden: !!q.meerdere_antwoorden,
    n: 0,
    verdeling: [],
  };
  if (q.type === 'schaal') {
    const labels = SCHALEN[q.schaal_soort] || SCHALEN.eens;
    const tellingen = [0, 0, 0, 0, 0];
    let weetNiet = 0;
    let som = 0;
    for (const inz of inzendingen) {
      const a = inz.a[q.id];
      const w = schaalWaarde(a);
      if (w !== null) {
        tellingen[w - 1]++;
        som += w;
      } else if (a === WEET_NIET) weetNiet++;
    }
    const n = tellingen.reduce((x, y) => x + y, 0);
    resultaat.n = n + weetNiet;
    resultaat.gemiddelde = n ? rond(som / n) : null;
    resultaat.n_score = n;
    resultaat.verdeling = labels.map((label, i) => ({ waarde: i + 1, label, aantal: tellingen[i], percentage: pct(tellingen[i], n + weetNiet) }));
    if (q.weet_niet) resultaat.verdeling.push({ waarde: WEET_NIET, label: 'Weet niet / n.v.t.', aantal: weetNiet, percentage: pct(weetNiet, n + weetNiet) });
  } else if (q.type === 'janee') {
    let ja = 0;
    let nee = 0;
    for (const inz of inzendingen) {
      if (inz.a[q.id] === 'ja') ja++;
      else if (inz.a[q.id] === 'nee') nee++;
    }
    resultaat.n = ja + nee;
    resultaat.percentage_ja = pct(ja, ja + nee);
    resultaat.verdeling = [
      { waarde: 'ja', label: 'Ja', aantal: ja, percentage: pct(ja, ja + nee) },
      { waarde: 'nee', label: 'Nee', aantal: nee, percentage: pct(nee, ja + nee) },
    ];
  } else if (q.type === 'meerkeuze') {
    const opties = JSON.parse(q.opties || '[]');
    const tel = new Map(opties.map((o) => [o.id, 0]));
    let n = 0;
    for (const inz of inzendingen) {
      const a = inz.a[q.id];
      const keuzes = Array.isArray(a) ? a : typeof a === 'string' ? [a] : [];
      let telt = false;
      for (const k of keuzes) {
        if (tel.has(k)) {
          tel.set(k, tel.get(k) + 1);
          telt = true;
        }
      }
      if (telt) n++;
    }
    resultaat.n = n;
    // Bij meerdere antwoorden: percentage van respondenten (telt op tot meer dan 100%).
    resultaat.verdeling = opties.map((o) => ({ waarde: o.id, label: o.label, aantal: tel.get(o.id), percentage: pct(tel.get(o.id), n) }));
  } else if (q.type === 'open') {
    resultaat.n = inzendingen.filter((inz) => typeof inz.a[q.id] === 'string' && inz.a[q.id]).length;
  }
  return resultaat;
}

/**
 * Deelt respondenten op in groepen volgens een uitsplitsvraag en verbergt
 * groepen onder de drempel. Kleine groepen worden samengevoegd tot
 * "Overige groepen samen"; is die ook te klein, dan gaat ook de kleinste
 * zichtbare groep erin op, zodat niets via aftrekken van het totaal te herleiden is.
 */
function uitsplitsing(vraag, vragenlijstVragen, inzendingen, themaNamen) {
  const groepen = [];
  const sleutelNaarGroep = new Map();
  if (vraag.type === 'janee') {
    for (const [w, label] of [['ja', 'Ja'], ['nee', 'Nee']]) {
      const g = { label, inz: [] };
      groepen.push(g);
      sleutelNaarGroep.set(w, g);
    }
  } else {
    for (const o of JSON.parse(vraag.opties || '[]')) {
      const g = { label: o.label, inz: [] };
      groepen.push(g);
      sleutelNaarGroep.set(o.id, g);
    }
  }
  const leeg = { label: 'Niet ingevuld', inz: [] };
  for (const inz of inzendingen) {
    const g = sleutelNaarGroep.get(inz.a[vraag.id]);
    (g || leeg).inz.push(inz);
  }
  if (leeg.inz.length) groepen.push(leeg);

  const metAntwoorden = groepen.filter((g) => g.inz.length > 0);
  let zichtbaar = metAntwoorden.filter((g) => g.inz.length >= DREMPEL);
  let klein = metAntwoorden.filter((g) => g.inz.length < DREMPEL);

  if (klein.length) {
    let kleinTotaal = klein.reduce((n, g) => n + g.inz.length, 0);
    if (kleinTotaal < DREMPEL && zichtbaar.length) {
      // Kleinste zichtbare groep erbij, anders is de kleine groep terug te rekenen.
      zichtbaar.sort((a, b) => a.inz.length - b.inz.length);
      const extra = zichtbaar.shift();
      klein = [...klein, extra];
      kleinTotaal += extra.inz.length;
    }
  }

  const schaalVragen = vragenlijstVragen.filter((q) => q.type === 'schaal');
  const themaIds = [...new Set(schaalVragen.map((q) => q.thema_id))];
  const resultaatGroep = (label, inz, extra = {}) => ({
    label,
    verborgen: false,
    n: inz.length,
    ...extra,
    themas: themaIds.map((tid) => ({
      thema_id: tid,
      naam: themaNamen.get(tid),
      ...gepoold(schaalVragen.filter((q) => q.thema_id === tid), inz),
    })),
    vragen: schaalVragen.map((q) => ({ vraag_id: q.id, ...gepoold([q], inz) })),
  });

  const uit = zichtbaar.map((g) => resultaatGroep(g.label, g.inz));
  // Volgorde van de antwoordopties aanhouden.
  const volgorde = new Map(groepen.map((g, i) => [g.label, i]));
  uit.sort((a, b) => volgorde.get(a.label) - volgorde.get(b.label));

  if (klein.length) {
    const samen = klein.flatMap((g) => g.inz);
    const namen = klein.map((g) => g.label);
    if (samen.length >= DREMPEL && uit.length) {
      uit.push(resultaatGroep('Overige groepen samen', samen, { samengevoegd: namen }));
    } else {
      uit.push({
        label: uit.length ? 'Overige groepen samen' : 'Alle groepen',
        verborgen: true,
        reden: `Minder dan ${DREMPEL} respondenten per groep; niet getoond om anonimiteit te beschermen.`,
        samengevoegd: namen,
      });
    }
  }
  return { vraag_id: vraag.id, tekst: vraag.tekst, drempel: DREMPEL, groepen: uit };
}

export async function dashboard({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  const onderzoek = await haalOnderzoek(env, onderzoekId);
  const url = new URL(request.url);

  const [themasR, meetpuntenR, meetmomentenR, lijstenR, vragenR, inzR, invoerR] = await env.DB.batch([
    env.DB.prepare('SELECT id, naam FROM themas WHERE onderzoek_id = ? ORDER BY volgorde, id').bind(onderzoekId),
    env.DB.prepare(
      'SELECT m.id, m.naam, m.eenheid, m.thema_id FROM meetpunten m JOIN themas t ON t.id = m.thema_id WHERE t.onderzoek_id = ? ORDER BY t.volgorde, m.volgorde, m.id',
    ).bind(onderzoekId),
    env.DB.prepare(
      "SELECT id, naam, datum FROM meetmomenten WHERE onderzoek_id = ? ORDER BY COALESCE(datum, '9999-12-31'), volgorde, id",
    ).bind(onderzoekId),
    env.DB.prepare(
      'SELECT id, titel, status, meetmoment_id, aantal_uitgenodigd FROM vragenlijsten WHERE onderzoek_id = ? ORDER BY id',
    ).bind(onderzoekId),
    env.DB.prepare(
      `SELECT q.* FROM vragen q JOIN vragenlijsten vl ON vl.id = q.vragenlijst_id JOIN themas t ON t.id = q.thema_id
       WHERE vl.onderzoek_id = ? ORDER BY t.volgorde, t.id, q.volgorde, q.id`,
    ).bind(onderzoekId),
    env.DB.prepare(
      'SELECT i.vragenlijst_id, i.datum, i.antwoorden FROM inzendingen i JOIN vragenlijsten vl ON vl.id = i.vragenlijst_id WHERE vl.onderzoek_id = ?',
    ).bind(onderzoekId),
    env.DB.prepare(
      'SELECT id, thema_id, meetpunt_id, meetmoment_id, soort, datum, titel, waarde, eenheid FROM eigen_invoer WHERE onderzoek_id = ? ORDER BY datum, id',
    ).bind(onderzoekId),
  ]);

  const themas = themasR.results;
  const themaNamen = new Map(themas.map((t) => [t.id, t.naam]));
  const meetpunten = meetpuntenR.results;
  const meetpuntInfo = new Map(meetpunten.map((m) => [m.id, m]));
  const meetmomenten = meetmomentenR.results;
  const mmNamen = new Map(meetmomenten.map((m) => [m.id, m.naam]));
  const lijsten = lijstenR.results;
  const vragen = vragenR.results;

  const inzPerLijst = new Map(lijsten.map((l) => [l.id, []]));
  for (const r of inzR.results) {
    let a = {};
    try {
      a = JSON.parse(r.antwoorden);
    } catch {
      /* beschadigde rij overslaan */
    }
    inzPerLijst.get(r.vragenlijst_id)?.push({ datum: r.datum, a });
  }
  const vragenPerLijst = new Map(lijsten.map((l) => [l.id, []]));
  for (const q of vragen) vragenPerLijst.get(q.vragenlijst_id)?.push(q);

  // 1. Respons per vragenlijst
  const respons = lijsten.map((l) => {
    const inz = inzPerLijst.get(l.id);
    const perDag = new Map();
    for (const i of inz) perDag.set(i.datum, (perDag.get(i.datum) || 0) + 1);
    return {
      vragenlijst_id: l.id,
      titel: l.titel,
      status: l.status,
      meetmoment_id: l.meetmoment_id,
      meetmoment_naam: mmNamen.get(l.meetmoment_id) || null,
      aantal: inz.length,
      aantal_uitgenodigd: l.aantal_uitgenodigd,
      percentage: l.aantal_uitgenodigd ? pct(inz.length, l.aantal_uitgenodigd) : null,
      per_dag: [...perDag.entries()].sort().map(([datum, aantal]) => ({ datum, aantal })),
    };
  });

  // 2. Gekozen vragenlijst
  let gekozen = null;
  const param = Number(url.searchParams.get('vragenlijst'));
  if (lijsten.some((l) => l.id === param)) gekozen = param;
  if (!gekozen) {
    const metAntwoorden = lijsten.filter((l) => inzPerLijst.get(l.id).length).map((l) => l.id);
    gekozen = metAntwoorden.length ? metAntwoorden[metAntwoorden.length - 1] : lijsten[0]?.id || null;
  }

  // Verloop per vraag via de "stamvraag" (bij gekopieerde vragenlijsten).
  const stam = (q) => q.bron_vraag_id || q.id;
  const lijstInfo = new Map(lijsten.map((l) => [l.id, l]));

  let selectie = null;
  if (gekozen) {
    const inz = inzPerLijst.get(gekozen);
    const lv = vragenPerLijst.get(gekozen);
    const schaalVragen = lv.filter((q) => q.type === 'schaal');
    const vraagStats = lv.map((q) => {
      const s = vraagStatistiek(q, inz);
      s.thema_naam = themaNamen.get(q.thema_id);
      if (q.type === 'schaal' || q.type === 'janee') {
        // Zelfde vraag in andere vragenlijsten, per meetmoment.
        const perMm = new Map();
        for (const ander of vragen) {
          if (stam(ander) !== stam(q)) continue;
          const l = lijstInfo.get(ander.vragenlijst_id);
          if (!l || !l.meetmoment_id) continue;
          if (!perMm.has(l.meetmoment_id)) perMm.set(l.meetmoment_id, []);
          perMm.get(l.meetmoment_id).push({ q: ander, inz: inzPerLijst.get(l.id) });
        }
        if (perMm.size > 1) {
          s.verloop = meetmomenten
            .filter((mm) => perMm.has(mm.id))
            .map((mm) => {
              const delen = perMm.get(mm.id);
              if (q.type === 'schaal') {
                let som = 0;
                let n = 0;
                for (const d of delen) {
                  for (const i of d.inz) {
                    const w = schaalWaarde(i.a[d.q.id]);
                    if (w !== null) {
                      som += w;
                      n++;
                    }
                  }
                }
                return { meetmoment_id: mm.id, naam: mm.naam, gemiddelde: n ? rond(som / n) : null, n };
              }
              let ja = 0;
              let n = 0;
              for (const d of delen) {
                for (const i of d.inz) {
                  if (i.a[d.q.id] === 'ja') ja++;
                  if (i.a[d.q.id] === 'ja' || i.a[d.q.id] === 'nee') n++;
                }
              }
              return { meetmoment_id: mm.id, naam: mm.naam, percentage_ja: pct(ja, n), n };
            });
        }
      }
      return s;
    });

    const themaIds = [...new Set(schaalVragen.map((q) => q.thema_id))];
    const meetpuntIds = [...new Set(schaalVragen.map((q) => q.meetpunt_id).filter(Boolean))];

    const open = lv
      .filter((q) => q.type === 'open')
      .map((q) => ({
        vraag_id: q.id,
        tekst: q.tekst,
        thema_naam: themaNamen.get(q.thema_id),
        antwoorden: schudden(inz.map((i) => i.a[q.id]).filter((a) => typeof a === 'string' && a)),
      }));

    const uitsplitsvragen = lv.filter((q) => q.uitsplitsen && (q.type === 'janee' || (q.type === 'meerkeuze' && !q.meerdere_antwoorden)));
    const uitsplitsId = Number(url.searchParams.get('uitsplitsen'));
    const uitsplitsVraag = uitsplitsvragen.find((q) => q.id === uitsplitsId) || null;

    selectie = {
      vragenlijst_id: gekozen,
      titel: lijstInfo.get(gekozen).titel,
      n: inz.length,
      klein: inz.length < DREMPEL,
      themas: themaIds.map((tid) => ({
        thema_id: tid,
        naam: themaNamen.get(tid),
        aantal_vragen: schaalVragen.filter((q) => q.thema_id === tid).length,
        ...gepoold(schaalVragen.filter((q) => q.thema_id === tid), inz),
      })),
      meetpunten: meetpuntIds.map((mid) => ({
        meetpunt_id: mid,
        naam: meetpuntInfo.get(mid)?.naam,
        thema_id: meetpuntInfo.get(mid)?.thema_id,
        ...gepoold(schaalVragen.filter((q) => q.meetpunt_id === mid), inz),
      })),
      vragen: vraagStats,
      open,
      uitsplitsvragen: uitsplitsvragen.map((q) => ({ id: q.id, tekst: q.tekst })),
      uitsplitsing: uitsplitsVraag ? uitsplitsing(uitsplitsVraag, lv, inz, themaNamen) : null,
    };
  }

  // 3. Verloop per thema en meetpunt over de meetmomenten
  const verloopThemas = [];
  const verloopMeetpunten = [];
  const perMeetmoment = meetmomenten.map((mm) => {
    const ls = lijsten.filter((l) => l.meetmoment_id === mm.id);
    return {
      mm,
      delen: ls.map((l) => ({ vragen: vragenPerLijst.get(l.id).filter((q) => q.type === 'schaal'), inz: inzPerLijst.get(l.id) })),
    };
  });
  const gepooldOver = (delen, filter) => {
    let som = 0;
    let n = 0;
    let respondenten = 0;
    for (const d of delen) {
      const r = gepoold(d.vragen.filter(filter), d.inz);
      if (r.antwoorden) {
        som += r.gemiddelde * r.antwoorden;
        n += r.antwoorden;
        respondenten += r.n;
      }
    }
    return { gemiddelde: n ? rond(som / n) : null, n: respondenten };
  };
  for (const t of themas) {
    const punten = perMeetmoment.map(({ mm, delen }) => ({ meetmoment_id: mm.id, naam: mm.naam, datum: mm.datum, ...gepooldOver(delen, (q) => q.thema_id === t.id) }));
    if (punten.some((p) => p.gemiddelde !== null)) verloopThemas.push({ thema_id: t.id, naam: t.naam, punten });
  }
  for (const m of meetpunten) {
    const punten = perMeetmoment.map(({ mm, delen }) => ({ meetmoment_id: mm.id, naam: mm.naam, datum: mm.datum, ...gepooldOver(delen, (q) => q.meetpunt_id === m.id) }));
    if (punten.some((p) => p.gemiddelde !== null)) {
      verloopMeetpunten.push({ meetpunt_id: m.id, naam: m.naam, thema_naam: themaNamen.get(m.thema_id), punten });
    }
  }

  // 4. Eigen cijfers (soort 'cijfer' met een waarde)
  const reeksen = new Map();
  const invoerTelling = { interview: 0, observatie: 0, cijfer: 0, document: 0, overig: 0 };
  for (const e of invoerR.results) {
    invoerTelling[e.soort] = (invoerTelling[e.soort] || 0) + 1;
    if (e.soort !== 'cijfer' || e.waarde === null) continue;
    const mp = e.meetpunt_id ? meetpuntInfo.get(e.meetpunt_id) : null;
    const sleutel = mp ? `m${mp.id}` : `t${e.thema_id}|${e.titel.toLowerCase()}`;
    if (!reeksen.has(sleutel)) {
      reeksen.set(sleutel, {
        meetpunt_id: mp ? mp.id : null,
        thema_id: e.thema_id,
        thema_naam: themaNamen.get(e.thema_id),
        naam: mp ? mp.naam : e.titel,
        eenheid: e.eenheid || (mp ? mp.eenheid : ''),
        punten: [],
      });
    }
    reeksen.get(sleutel).punten.push({
      id: e.id,
      datum: e.datum,
      waarde: e.waarde,
      titel: e.titel,
      meetmoment_naam: mmNamen.get(e.meetmoment_id) || null,
    });
  }

  return json({
    onderzoek: { id: onderzoek.id, bedrijfsnaam: onderzoek.bedrijfsnaam, titel: onderzoek.titel, status: onderzoek.status },
    drempel: DREMPEL,
    respons,
    selectie,
    verloop: {
      meetmomenten: meetmomenten.map((m) => ({ id: m.id, naam: m.naam, datum: m.datum })),
      themas: verloopThemas,
      meetpunten: verloopMeetpunten,
      zonder_meetmoment: lijsten.filter((l) => !l.meetmoment_id).map((l) => l.titel),
    },
    eigen_cijfers: [...reeksen.values()],
    eigen_invoer_telling: invoerTelling,
  });
}
