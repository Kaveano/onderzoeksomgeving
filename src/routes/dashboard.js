// Dashboard: respons, gemiddelden per thema, verdeling, verloop, eigen cijfers,
// open antwoorden en uitsplitsing.
//
// Privacy in de uitsplitsing:
// - een groep wordt alleen getoond als hij minstens DREMPEL respondenten heeft;
// - ook elk getal (gemiddelde per thema of per vraag) in een groep wordt alleen getoond
//   als minstens DREMPEL respondenten in die groep die vraag/dat thema beantwoordden;
// - kleine groepen en cellen worden zo nodig samen met de kleinste andere verborgen,
//   zodat ze niet uit het totaal zijn terug te rekenen;
// - thema- en vraaggetallen worden samen bekeken, zodat een verborgen getal ook niet uit
//   andere getallen van dezelfde groep is af te leiden;
// - gemiddelden per groep worden op 1 decimaal afgerond (zoals ze ook getoond worden).
//
// Rekenwerk: elke inzending wordt één keer doorlopen (gratis laag: 10 ms rekentijd per verzoek).

import { json } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { haalOnderzoek } from '../lib/db.js';
import { DREMPEL, SCHALEN, WEET_NIET } from '../lib/schalen.js';

const pct = (deel, geheel) => (geheel ? (deel / geheel) * 100 : null);
const deel = (som, n) => (n ? som / n : null);
const eenDecimaal = (x) => (x === null ? null : Math.round(x * 10) / 10);

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

/**
 * Telt in één doorloop alles wat het dashboard nodig heeft voor een set vragen en inzendingen.
 * Geeft per vraag tellingen en per thema/meetpunt (schaalvragen) som, aantal antwoorden en respondenten.
 */
function aggregeer(vragen, inzendingen) {
  const perVraag = vragen.map((q) => ({
    q,
    tellingen: [0, 0, 0, 0, 0],
    som: 0,
    n: 0,
    weetNiet: 0,
    ja: 0,
    nee: 0,
    opties: q.type === 'meerkeuze' ? new Map(JSON.parse(q.opties || '[]').map((o) => [o.id, 0])) : null,
    open: 0,
  }));
  const groepen = { thema: new Map(), meetpunt: new Map() };
  const groep = (soort, sleutel) => {
    let g = groepen[soort].get(sleutel);
    if (!g) {
      g = { som: 0, aantal: 0, respondenten: 0, laatst: -1 };
      groepen[soort].set(sleutel, g);
    }
    return g;
  };

  inzendingen.forEach((inz, r) => {
    const a = inz.a;
    for (const s of perVraag) {
      const w = a[s.q.id];
      if (w === undefined) continue;
      switch (s.q.type) {
        case 'schaal': {
          const x = schaalWaarde(w);
          if (x !== null) {
            s.tellingen[x - 1]++;
            s.som += x;
            s.n++;
            for (const g of [groep('thema', s.q.thema_id), s.q.meetpunt_id ? groep('meetpunt', s.q.meetpunt_id) : null]) {
              if (!g) continue;
              g.som += x;
              g.aantal++;
              if (g.laatst !== r) {
                g.laatst = r;
                g.respondenten++;
              }
            }
          } else if (w === WEET_NIET) s.weetNiet++;
          break;
        }
        case 'janee':
          if (w === 'ja') s.ja++;
          else if (w === 'nee') s.nee++;
          break;
        case 'meerkeuze': {
          const keuzes = Array.isArray(w) ? w : [w];
          let telt = false;
          for (const k of keuzes) {
            if (s.opties.has(k)) {
              s.opties.set(k, s.opties.get(k) + 1);
              telt = true;
            }
          }
          if (telt) s.n++;
          break;
        }
        case 'open':
          if (typeof w === 'string' && w) s.open++;
          break;
        default:
      }
    }
  });
  // Thema's en meetpunten met een schaalvraag die door minder dan DREMPEL personen is gescoord. Een gemiddelde
  // daarvan (ook opgeteld met andere vragenlijsten) zou zo'n kleine vraag voor een kijker terug te rekenen maken.
  const kleineThemas = new Set();
  const kleineMeetpunten = new Set();
  for (const s of perVraag) {
    if (s.q.type !== 'schaal' || !(s.n > 0 && s.n < DREMPEL)) continue;
    kleineThemas.add(s.q.thema_id);
    if (s.q.meetpunt_id) kleineMeetpunten.add(s.q.meetpunt_id);
  }
  return { perVraag, themas: groepen.thema, meetpunten: groepen.meetpunt, kleineThemas, kleineMeetpunten };
}

/** Statistiek voor één vraag, uit de geaggregeerde tellingen. */
function vraagStatistiek(s) {
  const q = s.q;
  const r = {
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
    const totaal = s.n + s.weetNiet;
    r.n = totaal;
    r.n_score = s.n;
    r.gemiddelde = deel(s.som, s.n);
    r.verdeling = labels.map((label, i) => ({ waarde: i + 1, label, aantal: s.tellingen[i], percentage: pct(s.tellingen[i], totaal) }));
    if (q.weet_niet) r.verdeling.push({ waarde: WEET_NIET, label: 'Weet niet / n.v.t.', aantal: s.weetNiet, percentage: pct(s.weetNiet, totaal) });
  } else if (q.type === 'janee') {
    const n = s.ja + s.nee;
    r.n = n;
    r.percentage_ja = pct(s.ja, n);
    r.verdeling = [
      { waarde: 'ja', label: 'Ja', aantal: s.ja, percentage: pct(s.ja, n) },
      { waarde: 'nee', label: 'Nee', aantal: s.nee, percentage: pct(s.nee, n) },
    ];
  } else if (q.type === 'meerkeuze') {
    r.n = s.n;
    // Bij meerdere antwoorden: percentage van respondenten (telt op tot meer dan 100%).
    r.verdeling = JSON.parse(q.opties || '[]').map((o) => ({
      waarde: o.id,
      label: o.label,
      aantal: s.opties.get(o.id),
      percentage: pct(s.opties.get(o.id), s.n),
    }));
  } else if (q.type === 'open') {
    r.n = s.open;
  }
  return r;
}

/**
 * Verbergt in één kolom (thema of vraag) de cellen met te weinig respondenten, en zo nodig
 * de kleinste andere cellen erbij, zodat de verborgen cellen samen minstens DREMPEL respondenten
 * tellen en niet uit het totaal ("Iedereen") zijn terug te rekenen.
 * Cellen zonder antwoorden (n = 0) gaan mee als er iets verborgen wordt; anders zou een "–"
 * verraden in welke groep de paar respondenten zitten. Geeft true als er iets veranderde.
 */
function onderdrukKolom(cellen) {
  const klein = cellen.filter((c) => c.verborgen || c.n < DREMPEL);
  if (!klein.some((c) => c.verborgen || c.n > 0)) return false;
  let veranderd = false;
  for (const c of klein) {
    if (!c.verborgen) {
      c.verborgen = true;
      veranderd = true;
    }
  }
  let samen = klein.reduce((t, c) => t + c.n, 0);
  const rest = cellen.filter((c) => !c.verborgen).sort((a, b) => a.n - b.n);
  while (samen < DREMPEL && rest.length) {
    const extra = rest.shift();
    extra.verborgen = true;
    veranderd = true;
    samen += extra.n;
  }
  return veranderd;
}

/**
 * Onderdrukt alle cellen van de uitsplitsing, ook over thema- en vraagkolommen heen:
 * is in een groep een vraag verborgen, dan ook het thema van die vraag (het themagemiddelde bevat
 * die vraag), en is een thema verborgen, dan ook de vragen van dat thema (anders is het thema
 * uit de vragen terug te rekenen). Herhaalt tot er niets meer verandert.
 */
function onderdrukAlles(groepen, themaIds, schaalVragen) {
  let veranderd = true;
  while (veranderd) {
    veranderd = false;
    schaalVragen.forEach((_, i) => {
      if (onderdrukKolom(groepen.map((g) => g.vragen[i]))) veranderd = true;
    });
    for (const g of groepen) {
      themaIds.forEach((tid, t) => {
        const verborgenVraag = schaalVragen.some((q, i) => q.thema_id === tid && g.vragen[i].verborgen);
        if (verborgenVraag && !g.themas[t].verborgen) {
          g.themas[t].verborgen = true;
          veranderd = true;
        }
      });
    }
    themaIds.forEach((_, t) => {
      if (onderdrukKolom(groepen.map((g) => g.themas[t]))) veranderd = true;
    });
    for (const g of groepen) {
      themaIds.forEach((tid, t) => {
        if (!g.themas[t].verborgen) return;
        schaalVragen.forEach((q, i) => {
          if (q.thema_id === tid && !g.vragen[i].verborgen) {
            g.vragen[i].verborgen = true;
            veranderd = true;
          }
        });
      });
    }
  }
}

/** Uitsplitsing naar de antwoorden op één vraag (meerkeuze met één antwoord, of ja/nee). */
function uitsplitsing(vraag, lijstVragen, inzendingen, themaNamen) {
  const groepen = [];
  const perSleutel = new Map();
  const opties = vraag.type === 'janee' ? [['ja', 'Ja'], ['nee', 'Nee']] : JSON.parse(vraag.opties || '[]').map((o) => [o.id, o.label]);
  for (const [sleutel, label] of opties) {
    const g = { label, inz: [] };
    groepen.push(g);
    perSleutel.set(sleutel, g);
  }
  const leeg = { label: 'Niet ingevuld', inz: [] };
  for (const inz of inzendingen) (perSleutel.get(inz.a[vraag.id]) || leeg).inz.push(inz);
  if (leeg.inz.length) groepen.push(leeg);

  const metAntwoorden = groepen.filter((g) => g.inz.length > 0);
  const zichtbaar = metAntwoorden.filter((g) => g.inz.length >= DREMPEL);
  let klein = metAntwoorden.filter((g) => g.inz.length < DREMPEL);
  let ookGroteGroep = null;
  if (klein.length) {
    const kleinTotaal = klein.reduce((n, g) => n + g.inz.length, 0);
    if (kleinTotaal < DREMPEL && zichtbaar.length) {
      // Anders is de kleine groep terug te rekenen uit het totaal min de getoonde groepen.
      zichtbaar.sort((a, b) => a.inz.length - b.inz.length);
      ookGroteGroep = zichtbaar.shift();
      klein = [...klein, ookGroteGroep];
    }
  }

  const schaalVragen = lijstVragen.filter((q) => q.type === 'schaal');
  const themaIds = [...new Set(schaalVragen.map((q) => q.thema_id))];

  const uit = zichtbaar.map((g) => ({ label: g.label, verborgen: false, n: g.inz.length, inz: g.inz }));
  const volgorde = new Map(groepen.map((g, i) => [g.label, i]));
  uit.sort((a, b) => volgorde.get(a.label) - volgorde.get(b.label));

  let verborgenGroep = null;
  if (klein.length) {
    const samen = klein.flatMap((g) => g.inz);
    const namen = klein.map((g) => g.label);
    const kleineNamen = klein.filter((g) => g !== ookGroteGroep).map((g) => `"${g.label}"`).join(', ');
    if (samen.length >= DREMPEL && uit.length) {
      uit.push({
        label: 'Overige groepen samen',
        verborgen: false,
        n: samen.length,
        inz: samen,
        samengevoegd: namen,
        toelichting: ookGroteGroep
          ? `"${ookGroteGroep.label}" is samengevoegd met ${kleineNamen}, omdat die groep anders uit het totaal terug te rekenen is.`
          : `Groepen met minder dan ${DREMPEL} respondenten zijn samengevoegd.`,
      });
    } else {
      verborgenGroep = {
        label: uit.length ? 'Overige groepen samen' : 'Alle groepen',
        verborgen: true,
        samengevoegd: namen,
        reden: ookGroteGroep
          ? `Niet apart getoond: ${kleineNamen} heeft minder dan ${DREMPEL} respondenten en zou anders uit het totaal terug te rekenen zijn. Daarom is ook "${ookGroteGroep.label}" niet apart te zien.`
          : `Minder dan ${DREMPEL} respondenten per groep; niet getoond om de anonimiteit te beschermen.`,
      };
    }
  }

  // Getallen per groep, met de drempel per cel.
  for (const g of uit) {
    const agg = aggregeer(schaalVragen, g.inz);
    g.themas = themaIds.map((tid) => {
      const t = agg.themas.get(tid);
      return { thema_id: tid, naam: themaNamen.get(tid), n: t ? t.respondenten : 0, gemiddelde: t ? deel(t.som, t.aantal) : null };
    });
    g.vragen = agg.perVraag.map((s) => ({ vraag_id: s.q.id, n: s.n, gemiddelde: deel(s.som, s.n) }));
  }
  if (uit.length) onderdrukAlles(uit, themaIds, schaalVragen);
  for (const g of uit) {
    delete g.inz;
    for (const c of [...g.themas, ...g.vragen]) {
      if (c.verborgen) {
        c.gemiddelde = null;
        c.n = null;
      } else {
        c.gemiddelde = eenDecimaal(c.gemiddelde);
      }
    }
  }
  if (verborgenGroep) uit.push(verborgenGroep);
  return {
    vraag_id: vraag.id,
    tekst: vraag.tekst,
    drempel: DREMPEL,
    groepen: uit,
    uitleg_cel: `Een streepje met "<${DREMPEL}" betekent: te weinig respondenten in deze groep beantwoordden dit, dus niet getoond.`,
  };
}

export async function dashboard({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  const onderzoek = await haalOnderzoek(env, onderzoekId);
  const url = new URL(request.url);
  return json(await berekenDashboard(env, onderzoek, {
    vragenlijst: url.searchParams.get('vragenlijst'),
    uitsplitsen: url.searchParams.get('uitsplitsen'),
  }));
}

/**
 * Berekent alle dashboardgegevens van een onderzoek. Ook gebruikt voor de alleen-lezen
 * deellink (src/routes/delen.js), die er daarna nog onderdelen uit weglaat.
 */
export async function berekenDashboard(env, onderzoek, keuze = {}) {
  const onderzoekId = onderzoek.id;

  const [themasR, meetpuntenR, meetmomentenR, lijstenR, vragenR, inzR, invoerR] = await env.DB.batch([
    env.DB.prepare('SELECT id, naam FROM themas WHERE onderzoek_id = ? ORDER BY volgorde, id').bind(onderzoekId),
    env.DB.prepare(
      'SELECT m.id, m.naam, m.eenheid, m.thema_id FROM meetpunten m JOIN themas t ON t.id = m.thema_id WHERE t.onderzoek_id = ? ORDER BY t.volgorde, m.volgorde, m.id',
    ).bind(onderzoekId),
    env.DB.prepare('SELECT id, naam, datum FROM meetmomenten WHERE onderzoek_id = ? ORDER BY volgorde, id').bind(onderzoekId),
    env.DB.prepare(
      'SELECT id, titel, status, code, meetmoment_id, aantal_uitgenodigd FROM vragenlijsten WHERE onderzoek_id = ? ORDER BY id',
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
  const lijstInfo = new Map(lijsten.map((l) => [l.id, l]));
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

  // Eén doorloop per vragenlijst; alles hieronder rekent met deze tellingen.
  const aggPerLijst = new Map(lijsten.map((l) => [l.id, aggregeer(vragenPerLijst.get(l.id), inzPerLijst.get(l.id))]));
  const vraagAgg = new Map();
  for (const agg of aggPerLijst.values()) for (const s of agg.perVraag) vraagAgg.set(s.q.id, s);

  // 1. Respons per vragenlijst
  const respons = lijsten.map((l) => {
    const inz = inzPerLijst.get(l.id);
    const perDag = new Map();
    for (const i of inz) perDag.set(i.datum, (perDag.get(i.datum) || 0) + 1);
    return {
      vragenlijst_id: l.id,
      titel: l.titel,
      status: l.status,
      code: l.code,
      aantal_vragen: vragenPerLijst.get(l.id).length,
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
  const param = Number(keuze.vragenlijst);
  if (lijstInfo.has(param)) gekozen = param;
  if (!gekozen) {
    const metAntwoorden = lijsten.filter((l) => inzPerLijst.get(l.id).length).map((l) => l.id);
    gekozen = metAntwoorden.length ? metAntwoorden[metAntwoorden.length - 1] : lijsten[0]?.id || null;
  }

  // Dezelfde vraag in gekopieerde vragenlijsten herkennen via de "stamvraag".
  const stam = (q) => q.bron_vraag_id || q.id;
  const vragenPerStam = new Map();
  for (const q of vragen) {
    if (!vragenPerStam.has(stam(q))) vragenPerStam.set(stam(q), []);
    vragenPerStam.get(stam(q)).push(q);
  }

  let selectie = null;
  if (gekozen) {
    const inz = inzPerLijst.get(gekozen);
    const lv = vragenPerLijst.get(gekozen);
    const agg = aggPerLijst.get(gekozen);

    const vraagStats = agg.perVraag.map((s) => {
      const r = vraagStatistiek(s);
      r.thema_naam = themaNamen.get(s.q.thema_id);
      if (s.q.type === 'schaal' || s.q.type === 'janee') {
        const perMm = new Map();
        for (const ander of vragenPerStam.get(stam(s.q)) || []) {
          const info = lijstInfo.get(ander.vragenlijst_id);
          const mmId = info?.meetmoment_id;
          if (!mmId) continue;
          const a = vraagAgg.get(ander.id);
          const p = perMm.get(mmId) || { som: 0, n: 0, ja: 0, janee: 0, klein: false, open: false };
          p.som += a.som;
          p.n += a.n;
          p.ja += a.ja;
          p.janee += a.ja + a.nee;
          // Per meetmoment kunnen meer vragenlijsten meetellen. Voor kijkers is van belang hoe klein de kleinste
          // bijdrage is (anders is die terug te rekenen) en of er een vragenlijst bij is die nog openstaat.
          const bijdrage = s.q.type === 'schaal' ? a.n : a.ja + a.nee;
          if (bijdrage > 0) {
            if (bijdrage < DREMPEL) p.klein = true;
            if (info.status === 'open') p.open = true;
          }
          perMm.set(mmId, p);
        }
        if (perMm.size > 1) {
          r.verloop = meetmomenten.filter((mm) => perMm.has(mm.id)).map((mm) => {
            const p = perMm.get(mm.id);
            return s.q.type === 'schaal'
              ? { meetmoment_id: mm.id, naam: mm.naam, gemiddelde: deel(p.som, p.n), n: p.n, klein: p.klein, open: p.open }
              : { meetmoment_id: mm.id, naam: mm.naam, percentage_ja: pct(p.ja, p.janee), n: p.janee, klein: p.klein, open: p.open };
          });
        }
      }
      return r;
    });

    const schaalVragen = lv.filter((q) => q.type === 'schaal');
    const themaIds = [...new Set(schaalVragen.map((q) => q.thema_id))];
    const meetpuntIds = [...new Set(schaalVragen.map((q) => q.meetpunt_id).filter(Boolean))];

    const uitsplitsvragen = lv.filter((q) => q.uitsplitsen && (q.type === 'janee' || (q.type === 'meerkeuze' && !q.meerdere_antwoorden)));
    const uitsplitsVraag = uitsplitsvragen.find((q) => q.id === Number(keuze.uitsplitsen)) || null;

    selectie = {
      vragenlijst_id: gekozen,
      titel: lijstInfo.get(gekozen).titel,
      meetmoment_naam: mmNamen.get(lijstInfo.get(gekozen).meetmoment_id) || null,
      n: inz.length,
      klein: inz.length < DREMPEL,
      themas: themaIds.map((tid) => {
        const t = agg.themas.get(tid) || { som: 0, aantal: 0, respondenten: 0 };
        return {
          thema_id: tid,
          naam: themaNamen.get(tid),
          aantal_vragen: schaalVragen.filter((q) => q.thema_id === tid).length,
          gemiddelde: deel(t.som, t.aantal),
          n: t.respondenten,
          antwoorden: t.aantal,
        };
      }),
      meetpunten: meetpuntIds.map((mid) => {
        const m = agg.meetpunten.get(mid) || { som: 0, aantal: 0, respondenten: 0 };
        return {
          meetpunt_id: mid,
          naam: meetpuntInfo.get(mid)?.naam,
          thema_id: meetpuntInfo.get(mid)?.thema_id,
          gemiddelde: deel(m.som, m.aantal),
          n: m.respondenten,
          antwoorden: m.aantal,
        };
      }),
      vragen: vraagStats,
      open: lv
        .filter((q) => q.type === 'open')
        .map((q) => ({
          vraag_id: q.id,
          tekst: q.tekst,
          thema_naam: themaNamen.get(q.thema_id),
          antwoorden: schudden(inz.map((i) => i.a[q.id]).filter((a) => typeof a === 'string' && a)),
        })),
      uitsplitsvragen: uitsplitsvragen.map((q) => ({ id: q.id, tekst: q.tekst })),
      uitsplitsing: uitsplitsVraag ? uitsplitsing(uitsplitsVraag, lv, inz, themaNamen) : null,
    };
  }

  // 3. Verloop per thema en meetpunt over de meetmomenten (uit de tellingen per vragenlijst)
  const perMeetmoment = meetmomenten.map((mm) => ({
    mm,
    aggs: lijsten.filter((l) => l.meetmoment_id === mm.id).map((l) => ({ agg: aggPerLijst.get(l.id), open: l.status === 'open' })),
  }));
  // klein: een bijdragende vragenlijst heeft hier minder dan DREMPEL respondenten, of een vraag die door minder
  // dan DREMPEL personen is gescoord (dan is die uit het opgetelde punt terug te rekenen);
  // open: een bijdragende vragenlijst staat nog open. Beide zijn nodig om het punt voor kijkers veilig te tonen.
  const pool = (aggs, soort, sleutel) => {
    let som = 0;
    let aantal = 0;
    let respondenten = 0;
    let klein = false;
    let open = false;
    const kleineSleutels = soort === 'themas' ? 'kleineThemas' : 'kleineMeetpunten';
    for (const { agg: a, open: lijstOpen } of aggs) {
      const g = a[soort].get(sleutel);
      if (g) {
        som += g.som;
        aantal += g.aantal;
        respondenten += g.respondenten;
        if (g.respondenten > 0) {
          if (g.respondenten < DREMPEL || a[kleineSleutels].has(sleutel)) klein = true;
          if (lijstOpen) open = true;
        }
      }
    }
    return { gemiddelde: deel(som, aantal), n: respondenten, klein, open };
  };
  const verloopThemas = [];
  for (const t of themas) {
    const punten = perMeetmoment.map(({ mm, aggs }) => ({ meetmoment_id: mm.id, naam: mm.naam, datum: mm.datum, ...pool(aggs, 'themas', t.id) }));
    if (punten.some((p) => p.gemiddelde !== null)) verloopThemas.push({ thema_id: t.id, naam: t.naam, punten });
  }
  const verloopMeetpunten = [];
  for (const m of meetpunten) {
    const punten = perMeetmoment.map(({ mm, aggs }) => ({ meetmoment_id: mm.id, naam: mm.naam, datum: mm.datum, ...pool(aggs, 'meetpunten', m.id) }));
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

  return {
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
  };
}
