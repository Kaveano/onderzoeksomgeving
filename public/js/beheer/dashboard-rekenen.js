// Dashboard: het rekenwerk (zonder DOM en zonder database, dus voor de Worker, de browser en de tests).
// De server (src/routes/dashboard.js) haalt de rijen uit de database en roept dashboardUitRijen aan; de browser
// kan precies hetzelfde uitrekenen uit de export (rijenUitExport). Zo zijn de cijfers overal gelijk.
//
// Respons, gemiddelden per thema, verdeling, verloop, eigen cijfers, open antwoorden en uitsplitsing.
//
// Privacy (de regels zelf staan in privacy.js):
// - in de uitsplitsing wordt een groep alleen getoond als hij minstens DREMPEL respondenten heeft;
// - ook elk getal (gemiddelde per thema of per vraag) in een groep wordt alleen getoond
//   als minstens DREMPEL respondenten in die groep die vraag/dat thema beantwoordden;
// - kleine groepen en cellen worden zo nodig samen met de kleinste andere verborgen,
//   zodat ze niet uit het totaal zijn terug te rekenen;
// - thema- en vraaggetallen worden samen bekeken, zodat een verborgen getal ook niet uit
//   andere getallen van dezelfde groep is af te leiden;
// - gemiddelden per groep worden op 1 decimaal afgerond (zoals ze ook getoond worden);
// - achtergrondvragen (een kenmerk zoals afdeling, of een vraag om op uit te splitsen) zijn "beschermd": hun
//   verdeling over alle respondenten gaat door maskeerVerdeling, met "Niet ingevuld" erbij (K M2). Anders staat
//   "Anders: 1" gewoon in beeld, ook bij een meelezer.
//
// - een cijfervraag (0–10 aanbevelen/eNPS of rapportcijfer 1–10) telt NOOIT mee in een thema- of meetpuntgemiddelde;
//   hij heeft zijn eigen gemiddelde, eNPS en verdeling, en in de uitsplitsing een eigen kolom per groep, die apart
//   wordt onderdrukt (onderdrukKolom; niet gekoppeld aan de thema's).
//
// Rekenwerk: elke inzending wordt één keer doorlopen (gratis laag: 10 ms rekentijd per verzoek).

import { DREMPEL, LABEL_OVERIG, onderdrukAlles, onderdrukKolom, verdeelInGroepen, maskeerVerdeling, verbergReeks } from './privacy.js';

const WEET_NIET = 'weet_niet';

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

/** eNPS: 9–10 promotor, 7–8 passief, 0–6 criticaster (dezelfde grenzen als ENPS in src/lib/schalen.js). */
const PROMOTOR_VANAF = 9;
const CRITICASTER_TOT = 6;

/** Bereik van een cijfervraag uit de cijferschalen ({ nps: {min, max, …}, rapport: … }); null als onbekend. */
function cijferBereik(q, cijferschalen) {
  return (cijferschalen && (cijferschalen[q.schaal_soort] || cijferschalen.rapport)) || null;
}

/** eNPS uit de tellingen per cijfer (index = cijfer 0 tot 10). */
function enpsUit(tellingen, n) {
  if (!n) return null;
  let promotors = 0;
  let criticasters = 0;
  tellingen.forEach((aantal, waarde) => {
    if (waarde >= PROMOTOR_VANAF) promotors += aantal;
    else if (waarde <= CRITICASTER_TOT) criticasters += aantal;
  });
  const passief = n - promotors - criticasters;
  return {
    promotors,
    passief,
    criticasters,
    pct_promotors: pct(promotors, n),
    pct_passief: pct(passief, n),
    pct_criticasters: pct(criticasters, n),
    score: pct(promotors, n) - pct(criticasters, n),
  };
}

/** Achtergrondvraag: een kenmerk (afdeling, leeftijd …) of een vraag om op uit te splitsen, met één antwoord. */
export function isBeschermd(q) {
  return !!(q.kenmerk || q.uitsplitsen) && (q.type === 'janee' || (q.type === 'meerkeuze' && !q.meerdere_antwoorden));
}

/**
 * Het soort antwoord van een vraag (een rij uit de tabel vragen): het type, bij een cijfervraag met de cijferschaal en
 * bij meerkeuze één of meer antwoorden. Vragen met dezelfde stamvraag (een gekopieerde vragenlijst) tellen alleen samen
 * als dit gelijk is: het type van een kopie kan nog veranderen zolang die geen antwoorden heeft, en een 9 als
 * rapportcijfer is geen 9 op een schaal van 1 tot 5 (BOUWPLAN §1.1: liever een ontbrekend getal dan een verkeerd).
 * De schaalsoort van een schaalvraag (eens, tevreden …) telt niet: het blijft 1 tot 5.
 */
export function vraagSoort(q) {
  if (q.type === 'cijfer') return `cijfer:${q.schaal_soort || ''}`;
  if (q.type === 'meerkeuze') return q.meerdere_antwoorden ? 'meerkeuze:meer' : 'meerkeuze:een';
  return String(q.type);
}

/**
 * Telt in één doorloop alles wat het dashboard nodig heeft voor een set vragen en inzendingen.
 * Geeft per vraag tellingen en per thema/meetpunt (schaalvragen) som, aantal antwoorden en respondenten.
 */
function aggregeer(vragen, inzendingen, cijferschalen = null) {
  const perVraag = vragen.map((q) => ({
    q,
    tellingen: q.type === 'cijfer' ? Array(11).fill(0) : [0, 0, 0, 0, 0],
    bereik: q.type === 'cijfer' ? cijferBereik(q, cijferschalen) : null,
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
        case 'cijfer':
          // Alleen in de eigen tellingen van de vraag; nooit in de groepen (thema's en meetpunten).
          if (s.bereik && Number.isInteger(w) && w >= s.bereik.min && w <= s.bereik.max && w <= 10) {
            s.tellingen[w]++;
            s.som += w;
            s.n++;
          } else if (w === WEET_NIET) s.weetNiet++;
          break;
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
function vraagStatistiek(s, SCHALEN) {
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
  } else if (q.type === 'cijfer') {
    const b = s.bereik || { min: 0, max: 10, laag: '', hoog: '' };
    const totaal = s.n + s.weetNiet;
    r.schaal_soort = q.schaal_soort;
    r.cijferschaal = { min: b.min, max: b.max, laag: b.laag, hoog: b.hoog };
    r.n = totaal;
    r.n_score = s.n;
    r.gemiddelde = deel(s.som, s.n);
    r.verdeling = [];
    for (let w = b.min; w <= b.max; w++) r.verdeling.push({ waarde: w, label: String(w), aantal: s.tellingen[w], percentage: pct(s.tellingen[w], totaal) });
    if (q.weet_niet) r.verdeling.push({ waarde: WEET_NIET, label: 'Weet niet / n.v.t.', aantal: s.weetNiet, percentage: pct(s.weetNiet, totaal) });
    if (q.schaal_soort === 'nps') r.enps = enpsUit(s.tellingen, s.n);
    // Rapportcijfer: het deel onvoldoendes (5 of lager), van wie een cijfer gaf.
    else r.pct_onvoldoende = pct(s.tellingen.slice(0, 6).reduce((t, x) => t + x, 0), s.n);
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
 * Een achtergrondvraag: de verdeling over alle respondenten van de vragenlijst, met "Niet ingevuld" erbij en
 * kleine aantallen verborgen (maskeerVerdeling). n wordt het aantal dat de vraag beantwoordde, of null als er
 * iets verborgen is. Het percentage ja (ja/nee-vraag) blijft alleen als er niets verborgen is.
 */
function beschermVerdeling(r, lijstN) {
  const m = maskeerVerdeling(r.verdeling, lijstN, DREMPEL);
  r.verdeling = m.verdeling;
  r.n = m.n_beantwoord;
  if (r.type === 'janee' && m.iets_verborgen) r.percentage_ja = null;
}

/** Uitsplitsing naar de antwoorden op één vraag (meerkeuze met één antwoord, of ja/nee). */
function uitsplitsing(vraag, lijstVragen, inzendingen, themaNamen, cijferschalen) {
  const groepen = [];
  const perSleutel = new Map();
  const opties = vraag.type === 'janee' ? [['ja', 'Ja'], ['nee', 'Nee']] : JSON.parse(vraag.opties || '[]').map((o) => [o.id, o.label]);
  for (const [sleutel, label] of opties) {
    const g = { sleutel, label, inz: [] };
    groepen.push(g);
    perSleutel.set(sleutel, g);
  }
  const leeg = { sleutel: null, label: 'Niet ingevuld', inz: [] };
  for (const inz of inzendingen) (perSleutel.get(inz.a[vraag.id]) || leeg).inz.push(inz);
  if (leeg.inz.length) groepen.push(leeg);

  // Welke groepen apart getoond worden, welke samen en welke niet: privacy.js (strategie 'samenvoegen').
  const indeling = verdeelInGroepen(groepen.map((g) => ({ sleutel: g.sleutel, label: g.label, n: g.inz.length })), { d: DREMPEL });
  const groepVan = new Map(groepen.map((g) => [g.sleutel, g]));

  const schaalVragen = lijstVragen.filter((q) => q.type === 'schaal');
  const themaIds = [...new Set(schaalVragen.map((q) => q.thema_id))];
  const cijferVragen = lijstVragen.filter((q) => q.type === 'cijfer');

  const uit = indeling.zichtbaar.map((z) => {
    const g = groepVan.get(z.sleutel);
    return { label: g.label, verborgen: false, n: g.inz.length, inz: g.inz };
  });

  let verborgenGroep = null;
  const nietApart = indeling.samengevoegd || indeling.verborgen;
  if (nietApart) {
    const klein = groepen.filter((g) => nietApart.sleutels.includes(g.sleutel));
    // Wat een lezer ziet, mag niet afhangen van hoe de respondenten over de niet-getoonde groepen verdeeld zijn
    // (PR-08). Daarom:
    // - de namen staan in de volgorde van de antwoordmogelijkheden (dus niet: eerst de kleine groepen);
    // - "Niet ingevuld" wordt nooit genoemd: alleen genoemd als iemand de vraag oversloeg, verraadt het dat een
    //   verborgen aantal 0 is. Een vaste zin zegt dat wie de vraag niet invulde, hier meetelt;
    // - één vaste uitleg, die niet zegt welke groep klein is en welke alleen ter bescherming meegaat.
    const namen = nietApart.labels.filter((_, i) => nietApart.sleutels[i] !== null);
    const nietIngevuldApart = indeling.zichtbaar.some((z) => z.sleutel === null);
    const metLeeg = (zin) => (nietIngevuldApart ? zin : `${zin} Ook wie deze vraag niet invulde, telt hier mee.`);
    if (indeling.samengevoegd) {
      const samen = klein.flatMap((g) => g.inz);
      uit.push({
        label: LABEL_OVERIG,
        verborgen: false,
        n: samen.length,
        inz: samen,
        samengevoegd: namen,
        toelichting: metLeeg(`Deze groepen zijn samengevoegd. Zo is geen groep van minder dan ${DREMPEL} respondenten te zien of terug te rekenen.`),
      });
    } else {
      verborgenGroep = {
        label: uit.length ? LABEL_OVERIG : 'Alle groepen',
        verborgen: true,
        samengevoegd: namen,
        reden: metLeeg(`Deze groepen zijn niet apart getoond. Zo is geen groep van minder dan ${DREMPEL} respondenten te zien of terug te rekenen.`),
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
    // Cijfervragen: één getal per cel (gemiddelde, en bij 0–10 de eNPS), los van de thema's.
    const cijferAgg = aggregeer(cijferVragen, g.inz, cijferschalen);
    g.cijfers = cijferAgg.perVraag.map((s) => ({
      vraag_id: s.q.id,
      n: s.n,
      gemiddelde: deel(s.som, s.n),
      enps: s.q.schaal_soort === 'nps' ? enpsUit(s.tellingen, s.n)?.score ?? null : null,
    }));
  }
  if (uit.length) onderdrukAlles(uit, themaIds, schaalVragen, DREMPEL);
  // Elke cijferkolom apart: kleine cellen weg, en zo nodig de kleinste andere erbij (niet terug te rekenen).
  if (uit.length) cijferVragen.forEach((_, i) => onderdrukKolom(uit.map((g) => g.cijfers[i]), DREMPEL));
  for (const g of uit) {
    delete g.inz;
    for (const c of [...g.themas, ...g.vragen, ...g.cijfers]) {
      if (c.verborgen) {
        c.gemiddelde = null;
        c.n = null;
        if ('enps' in c) c.enps = null;
      } else {
        c.gemiddelde = eenDecimaal(c.gemiddelde);
        if ('enps' in c && c.enps !== null) c.enps = Math.round(c.enps);
      }
    }
  }
  if (verborgenGroep) uit.push(verborgenGroep);
  return {
    vraag_id: vraag.id,
    tekst: vraag.tekst,
    drempel: DREMPEL,
    cijfervragen: cijferVragen.map((q) => ({ vraag_id: q.id, tekst: q.tekst, schaal_soort: q.schaal_soort })),
    groepen: uit,
    uitleg_cel: `Een streepje met "<${DREMPEL}" betekent: te weinig respondenten in deze groep beantwoordden dit, dus niet getoond.`,
  };
}

/**
 * Berekent alle dashboardgegevens van een onderzoek: precies wat GET /dashboard teruggeeft.
 * Ook gebruikt voor de alleen-lezen deellink (src/routes/delen.js), die er daarna nog onderdelen uit weglaat.
 * @param rijen { onderzoek, schalen (labels van de schalen 1–5), cijferschalen (bereik van de cijfervragen), themas, meetpunten, meetmomenten, vragenlijsten,
 *               vragen, inzendingen: { vragenlijst_id, datum, a: object }[], eigen_invoer } in de volgorde van de
 *               database (zie src/routes/dashboard.js; rijenUitExport zet de export in die volgorde).
 * @param keuze { vragenlijst, uitsplitsen }: id's (ook als tekst), of null.
 * Per vraag in selectie.vragen staat ook beschermd (achtergrondvraag); daarvan is de verdeling gemaskeerd.
 */
export function dashboardUitRijen(rijen, keuze = { vragenlijst: null, uitsplitsen: null }) {
  const onderzoek = rijen.onderzoek;
  const SCHALEN = rijen.schalen || {};
  const CIJFERSCHALEN = rijen.cijferschalen || {};

  const themas = rijen.themas;
  const themaNamen = new Map(themas.map((t) => [t.id, t.naam]));
  const meetpunten = rijen.meetpunten;
  const meetpuntInfo = new Map(meetpunten.map((m) => [m.id, m]));
  const meetmomenten = rijen.meetmomenten;
  const mmNamen = new Map(meetmomenten.map((m) => [m.id, m.naam]));
  const lijsten = rijen.vragenlijsten;
  const lijstInfo = new Map(lijsten.map((l) => [l.id, l]));
  const vragen = rijen.vragen;

  const inzPerLijst = new Map(lijsten.map((l) => [l.id, []]));
  for (const r of rijen.inzendingen) inzPerLijst.get(r.vragenlijst_id)?.push({ datum: r.datum, a: r.a });
  const vragenPerLijst = new Map(lijsten.map((l) => [l.id, []]));
  for (const q of vragen) vragenPerLijst.get(q.vragenlijst_id)?.push(q);

  // Eén doorloop per vragenlijst; alles hieronder rekent met deze tellingen.
  const aggPerLijst = new Map(lijsten.map((l) => [l.id, aggregeer(vragenPerLijst.get(l.id), inzPerLijst.get(l.id), CIJFERSCHALEN)]));
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
      const r = vraagStatistiek(s, SCHALEN);
      r.thema_naam = themaNamen.get(s.q.thema_id);
      const beschermd = isBeschermd(s.q);
      r.beschermd = beschermd;
      if (beschermd) beschermVerdeling(r, inz.length);
      if (s.q.type === 'schaal' || s.q.type === 'janee' || s.q.type === 'cijfer') {
        const perMm = new Map();
        // Het verloop is van de stamvraag, niet van deze ene vragenlijst: is de vraag in één van de bijdragende
        // vragenlijsten een achtergrondvraag (kenmerk of uitsplitsen), dan is het verloop beschermd, ook als je
        // het bekijkt vanuit een kopie zonder kenmerk. Anders staat het verborgen ja-aantal van die lijst in het
        // verloop van de kopie. Zo is het verloop vanuit elke vragenlijst hetzelfde.
        const beschermdVerloop = beschermd || (vragenPerStam.get(stam(s.q)) || [])
          .some((ander) => vraagSoort(ander) === vraagSoort(s.q) && isBeschermd(ander));
        for (const ander of vragenPerStam.get(stam(s.q)) || []) {
          const info = lijstInfo.get(ander.vragenlijst_id);
          const mmId = info?.meetmoment_id;
          if (!mmId) continue;
          // Alleen samentellen met een kopie van hetzelfde soort (type, en bij een cijfervraag dezelfde cijferschaal):
          // een kopie die daarna een ander type kreeg, telt niet mee in dit verloop.
          if (vraagSoort(ander) !== vraagSoort(s.q)) continue;
          const a = vraagAgg.get(ander.id);
          const p = perMm.get(mmId) || { som: 0, n: 0, ja: 0, janee: 0, klein: false, open: false, lijstN: 0, deelVerborgen: false, tellingen: Array(11).fill(0) };
          const lijstN = inzPerLijst.get(ander.vragenlijst_id).length;
          p.som += a.som;
          p.n += a.n;
          if (s.q.type === 'cijfer') a.tellingen.forEach((x, w) => { p.tellingen[w] += x; });
          p.ja += a.ja;
          p.janee += a.ja + a.nee;
          p.lijstN += lijstN;
          // Achtergrondvraag (ja/nee): is in één bijdragende vragenlijst iets van ja, nee of "Niet ingevuld" verborgen,
          // dan is dat getal uit dit punt min de andere (zichtbare) vragenlijsten terug te rekenen. Het samentellen
          // beschermt dus niet; elke vragenlijst moet op zich veilig zijn.
          if (beschermdVerloop && s.q.type === 'janee' && verbergReeks([a.ja, a.nee, lijstN - a.ja - a.nee], DREMPEL).some(Boolean)) {
            p.deelVerborgen = true;
          }
          // Per meetmoment kunnen meer vragenlijsten meetellen. Voor kijkers is van belang hoe klein de kleinste
          // bijdrage is (anders is die terug te rekenen) en of er een vragenlijst bij is die nog openstaat.
          const bijdrage = s.q.type === 'schaal' || s.q.type === 'cijfer' ? a.n : a.ja + a.nee;
          if (bijdrage > 0) {
            if (bijdrage < DREMPEL) p.klein = true;
            if (info.status === 'open') p.open = true;
          }
          perMm.set(mmId, p);
        }
        if (perMm.size > 1) {
          r.verloop = meetmomenten.filter((mm) => perMm.has(mm.id)).map((mm) => {
            const p = perMm.get(mm.id);
            if (s.q.type === 'schaal') return { meetmoment_id: mm.id, naam: mm.naam, gemiddelde: deel(p.som, p.n), n: p.n, klein: p.klein, open: p.open };
            if (s.q.type === 'cijfer') {
              const punt = { meetmoment_id: mm.id, naam: mm.naam, gemiddelde: deel(p.som, p.n), n: p.n, klein: p.klein, open: p.open };
              if (s.q.schaal_soort === 'nps') punt.enps_score = enpsUit(p.tellingen, p.n)?.score ?? null;
              return punt;
            }
            // Achtergrondvraag (ja/nee): het percentage ja per meetmoment is ook een verdeling. Alleen tonen als
            // ja, nee en "Niet ingevuld" daar elk 0 of minstens DREMPEL zijn (dezelfde regel als de verdeling),
            // samen en in elke bijdragende vragenlijst apart.
            if (beschermdVerloop && (p.deelVerborgen || verbergReeks([p.ja, p.janee - p.ja, p.lijstN - p.janee], DREMPEL).some(Boolean))) {
              return { meetmoment_id: mm.id, naam: mm.naam, percentage_ja: null, n: null, klein: true, open: p.open };
            }
            return { meetmoment_id: mm.id, naam: mm.naam, percentage_ja: pct(p.ja, p.janee), n: p.janee, klein: p.klein, open: p.open };
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
      uitsplitsing: uitsplitsVraag ? uitsplitsing(uitsplitsVraag, lv, inz, themaNamen, CIJFERSCHALEN) : null,
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
  for (const e of rijen.eigen_invoer) {
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

/** Boven zoveel antwoordcellen rekent "Alle resultaten" in de browser (zelfde grens als KIJK_MAX_CELLEN in delen.js). */
export const LOKAAL_BOVEN_CELLEN = 60_000;

/**
 * Rekent "Alle resultaten" beter in de browser dan op de server? De rekentijd van de server groeit met het aantal
 * antwoordcellen: per vragenlijst het aantal inzendingen × het aantal vragen, opgeteld over alle vragenlijsten
 * (het dashboard telt ze allemaal). Ja als er meer dan maxInzendingen inzendingen zijn, of meer dan maxCellen cellen.
 * @param vragenlijsten [{ aantal_inzendingen, aantal_vragen }] (zoals GET /onderzoeken/:id/vragenlijsten)
 */
export function rekenInBrowser(vragenlijsten, { maxInzendingen = 1500, maxCellen = LOKAAL_BOVEN_CELLEN } = {}) {
  let inzendingen = 0;
  let cellen = 0;
  for (const l of vragenlijsten || []) {
    const n = Number(l.aantal_inzendingen) || 0;
    inzendingen += n;
    cellen += n * (Number(l.aantal_vragen) || 0);
  }
  return inzendingen > maxInzendingen || cellen > maxCellen;
}

/**
 * Zet de export (GET .../export/data) om in de rijen voor dashboardUitRijen, in dezelfde volgorde als de
 * database ze aan het dashboard geeft. De antwoorden worden niet opnieuw ingelezen: het object gaat zo mee.
 */
export function rijenUitExport(data) {
  const themaVolgorde = new Map((data.themas || []).map((t) => [t.id, Number(t.volgorde) || 0]));
  return {
    onderzoek: data.onderzoek,
    schalen: data.lijsten?.schalen || {},
    cijferschalen: data.lijsten?.cijferschalen || {},
    themas: data.themas || [],
    // Het dashboard ordent meetpunten op de volgorde van hun thema, de export op hun eigen volgorde.
    meetpunten: [...(data.meetpunten || [])].sort((a, b) => (themaVolgorde.get(a.thema_id) ?? 0) - (themaVolgorde.get(b.thema_id) ?? 0)
      || (Number(a.volgorde) || 0) - (Number(b.volgorde) || 0) || a.id - b.id),
    meetmomenten: data.meetmomenten || [],
    vragenlijsten: data.vragenlijsten || [],
    vragen: (data.vragen || []).map((q) => (typeof q.opties === 'string' ? q : { ...q, opties: JSON.stringify(q.opties || []) })),
    inzendingen: (data.inzendingen || []).map((i) => ({ vragenlijst_id: i.vragenlijst_id, datum: i.datum, a: i.antwoorden })),
    eigen_invoer: data.eigen_invoer || [],
  };
}
