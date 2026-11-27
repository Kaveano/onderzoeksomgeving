// Werkbank: het variabelenmodel (D2 §3, BOUWPLAN §3.7). Zuivere module (geen DOM, geen fetch).
//
// Een gegevensbron (één vragenlijst, alle vragenlijsten onder elkaar, of één eigen dataset) wordt een tabel met
// één rij per respondent en één kolom per variabele. De waarden staan per variabele in een Float64Array
// (NaN = ontbrekend) met per rij de reden (Uint8Array, zie REDEN). Namen en codes zijn gelijk aan de
// SPSS-export (spssVariabeleNamen in export-bestanden.js), zodat je elke uitkomst in SPSS kunt nagaan.
//
// Wat er nooit in komt (PR-12): de datum van invullen, het volgnummer van de respondent en de tekst van open
// antwoorden. Een open vraag staat wel in de lijst, maar is niet te analyseren; codes bij een open vraag
// (pakket P5) worden 0/1-variabelen. Vragenlijsten met 1 tot 4 antwoorden doen nergens mee (regel R0).

import { bouwModel, schaalWaarde } from '../analyse-model.js';
import { spssVariabeleNamen } from '../export-bestanden.js';
import { spssNaam } from '../bestanden.js';
import { kolomSoort, isCodekolom, getalNotatie, alsGetal, verdachteKolommen } from '../inlees-regels.js';
import { DREMPEL } from '../privacy.js';
import { beschermIndeling } from './privacy-selectie.js';

/** Reden per rij: 0 geldig, 1 geen antwoord, 2 weet niet, 3 niet gevraagd (andere vragenlijst), 4 eigen
 *  ontbrekende code of niet ingedeeld, 5 te weinig vragen beantwoord voor een score (B7). */
export const REDEN = { GELDIG: 0, GEEN: 1, WEET_NIET: 2, NIET_GEVRAAGD: 3, EIGEN: 4, ONVOLLEDIG: 5 };
export const REDEN_LABELS = ['Geldig', 'Geen antwoord', 'Weet niet', 'Niet gevraagd', 'Ontbrekend', 'Te weinig vragen beantwoord'];

/** Groepen in de keuzelijsten, in deze volgorde (achtergrondkenmerken eerst, D2 §3.3). */
export const GROEPEN = {
  kenmerk: 'Achtergrondkenmerken',
  systeem: 'Vragenlijst en meetmoment',
  thema: "Thema's",
  meetpunt: 'Meetpunten',
  vraag: 'Vragen',
  code: 'Codes bij open vragen',
  dataset: 'Dataset',
  eigen: 'Eigen variabelen',
};

const WEET_NIET = 'weet_niet';
export const NIET_TE_ANALYSEREN = 'Niet te analyseren (onbekend vraagtype)';

/** Sleutel van een gegevensbron, voor het bewaren van een opgebouwde dataset. */
export function bronSleutel(bron) {
  if (!bron) return '';
  if (bron.soort === 'gestapeld') return `gestapeld:${bron.lijsten === 'alle' ? 'alle' : [...bron.lijsten].sort((a, b) => a - b).join(',')}`;
  return `${bron.soort}:${bron.id}`;
}

function nieuweVariabele(n, velden) {
  return {
    id: '',
    naam: '',
    label: '',
    bron: 'vraag',
    groep: 'vraag',
    soort: 'getal',
    meetniveau: 'interval',
    waarden: new Float64Array(n).fill(NaN),
    reden: new Uint8Array(n).fill(REDEN.GEEN),
    labels: [],
    bereik: null,
    kenmerk: null,
    groepering: false,
    analyseerbaar: true,
    reden_niet: null,
    waarschuwingen: [],
    leden: null,
    lid_van: null,
    wortel: null,
    ...velden,
  };
}

/** Zet de waarde van rij r. */
function zet(v, r, waarde) {
  v.waarden[r] = waarde;
  v.reden[r] = REDEN.GELDIG;
}

// ---------- Antwoordmogelijkheden van meerkeuzevragen (zoals spssGegevens) ----------

/**
 * Antwoordmogelijkheden van een stamvraag over alle vragenlijsten heen, precies zoals spssGegevens ze koppelt:
 * eerst op id (een kopie houdt dezelfde id's), dan op gelijke tekst als die tekst nog niet in deze vragenlijst
 * staat. Het label is dat van de eerste vragenlijst, met een latere nieuwe naam erachter ("A / B").
 */
function mogelijkheden(perLijst, lijsten) {
  const mogelijk = [];
  const gelijk = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
  for (const l of lijsten) {
    const v = perLijst.get(l.id);
    if (!v) continue;
    const idsHier = new Set(v.opties.map((o) => o.id));
    for (const o of v.opties) {
      let m = mogelijk.find((x) => x.ids.has(o.id));
      if (!m) m = mogelijk.find((x) => x.labels.some((t) => gelijk(t, o.label)) && ![...x.ids].some((id) => idsHier.has(id)));
      if (!m) {
        mogelijk.push({ ids: new Set([o.id]), labels: [o.label], eersteId: o.id });
        continue;
      }
      m.ids.add(o.id);
      if (!m.labels.some((t) => gelijk(t, o.label))) m.labels.push(o.label);
    }
  }
  for (const m of mogelijk) m.label = m.labels.join(' / ');
  return mogelijk;
}

// ---------- Vragen per type (uitbreidbaar: een nieuw vraagtype breekt de werkbank nooit) ----------

/**
 * Per vraagtype: hoe de variabele eruitziet en hoe een antwoord een waarde wordt.
 * maak(stam, ctx) → variabele(n) (zonder waarden); waarde(v, q, antwoord, r) zet de waarde van rij r.
 * Een onbekend type wordt getoond als "Niet te analyseren (onbekend vraagtype)".
 */
export const VRAAGSOORTEN = {
  schaal: {
    maak(s, ctx) {
      const schalen = ctx.data.lijsten?.schalen || {};
      const labels = (schalen[s.ruw.schaal_soort] || schalen.eens || ['1', '2', '3', '4', '5'])
        .map((label, k) => ({ code: k + 1, label, bronwaarde: k + 1, bronwaarden: [k + 1] }));
      return [nieuweVariabele(ctx.n, { soort: 'getal', meetniveau: 'ordinaal', labels, bereik: { laag: 1, hoog: 5 } })];
    },
    waarde(v, q, a, r) {
      if (a === WEET_NIET) v.reden[r] = REDEN.WEET_NIET;
      else if (schaalWaarde(a) !== null) zet(v, r, a);
    },
  },
  janee: {
    maak(s, ctx) {
      return [nieuweVariabele(ctx.n, {
        soort: 'categorie',
        meetniveau: 'nominaal',
        labels: [{ code: 1, label: 'Ja', bronwaarde: 'ja', bronwaarden: ['ja'] }, { code: 0, label: 'Nee', bronwaarde: 'nee', bronwaarden: ['nee'] }],
      })];
    },
    waarde(v, q, a, r) {
      if (a === 'ja') zet(v, r, 1);
      else if (a === 'nee') zet(v, r, 0);
    },
  },
  meerkeuze: {
    maak(s, ctx) {
      s.mogelijk = mogelijkheden(s.perLijst, ctx.model.lijsten);
      if (!s.eerste.meerdere) {
        const labels = s.mogelijk.map((m, k) => ({ code: k + 1, label: m.label, bronwaarde: m.eersteId, bronwaarden: [...m.ids] }));
        const geordend = !!s.kenmerk?.geordend;
        return [nieuweVariabele(ctx.n, { soort: 'categorie', meetniveau: geordend ? 'ordinaal' : 'nominaal', labels })];
      }
      // Meerdere antwoorden: een set met per antwoordmogelijkheid een 0/1-variabele.
      const leden = s.mogelijk.map((m) => nieuweVariabele(ctx.n, {
        id: `v:${s.stam}:${m.eersteId}`,
        naam: ctx.namen.optie.get(`${s.stam}:${m.eersteId}`) || spssNaam(`v${s.stam}_${m.eersteId}`, ctx.gebruikt),
        label: `${s.label} – ${m.label}`,
        soort: 'categorie',
        meetniveau: 'nominaal',
        labels: [{ code: 1, label: 'Gekozen', bronwaarde: 1, bronwaarden: [1] }, { code: 0, label: 'Niet gekozen', bronwaarde: 0, bronwaarden: [0] }],
        optie: m,
      }));
      const set = nieuweVariabele(ctx.n, { soort: 'set', meetniveau: 'nominaal', labels: s.mogelijk.map((m, k) => ({ code: k + 1, label: m.label, bronwaarde: m.eersteId, bronwaarden: [...m.ids] })) });
      set.leden = leden.map((l) => l.id);
      for (const l of leden) l.lid_van = `v:${s.stam}`;
      return [set, ...leden];
    },
    waarde(v, q, a, r) {
      if (v.soort === 'set') {
        if (a !== undefined && a !== null) zet(v, r, 1);
        return;
      }
      if (v.optie) {
        if (a === undefined || a === null) return;
        if (!q.opties.some((o) => v.optie.ids.has(o.id))) {
          v.reden[r] = REDEN.NIET_GEVRAAGD;
          return;
        }
        const gekozen = (Array.isArray(a) ? a : [a]).filter((id) => q.opties.some((o) => o.id === id));
        zet(v, r, gekozen.some((id) => v.optie.ids.has(id)) ? 1 : 0);
        return;
      }
      if (a === undefined || a === null) return;
      const gekozen = (Array.isArray(a) ? a : [a]).filter((id) => q.opties.some((o) => o.id === id));
      if (gekozen.length !== 1) return;
      const k = v.labels.findIndex((l) => l.bronwaarden.includes(gekozen[0]));
      if (k >= 0) zet(v, r, v.labels[k].code);
    },
  },
  cijfer: {
    maak(s, ctx) {
      // Het bereik komt uit de cijferschalen van de export (B13): nooit een standaard van 0 tot 10.
      const schaal = ctx.data.lijsten?.cijferschalen?.[s.ruw.schaal_soort];
      if (!schaal || !Number.isInteger(schaal.min) || !Number.isInteger(schaal.max)) {
        return [nieuweVariabele(ctx.n, { soort: 'onbekend', analyseerbaar: false, reden_niet: 'Niet te analyseren (onbekende cijferschaal)' })];
      }
      const labels = [];
      for (let c = schaal.min; c <= schaal.max; c++) {
        const label = c === schaal.min && schaal.laag ? `${c} – ${schaal.laag}` : c === schaal.max && schaal.hoog ? `${c} – ${schaal.hoog}` : String(c);
        labels.push({ code: c, label, bronwaarde: c, bronwaarden: [c] });
      }
      return [nieuweVariabele(ctx.n, { soort: 'getal', meetniveau: 'interval', labels, bereik: { laag: schaal.min, hoog: schaal.max }, schaal_soort: s.ruw.schaal_soort })];
    },
    waarde(v, q, a, r) {
      if (!v.bereik) return;
      if (a === WEET_NIET) v.reden[r] = REDEN.WEET_NIET;
      else if (Number.isInteger(a) && a >= v.bereik.laag && a <= v.bereik.hoog) zet(v, r, a);
    },
  },
  open: {
    maak(s, ctx) {
      return [nieuweVariabele(ctx.n, { soort: 'tekst', meetniveau: 'nominaal', analyseerbaar: false, reden_niet: 'Open antwoorden zijn niet te analyseren. Codeer ze bij Open antwoorden; de codes komen hier als variabelen.' })];
    },
    waarde() { /* de tekst komt nooit in de werkbank */ },
  },
};

// ---------- Opbouwen ----------

/**
 * Bouwt de dataset van één gegevensbron.
 * data: de export (gegevens.js); dataset: { id, naam, kolommen, rijen } bij bron.soort 'dataset';
 * bron: { soort: 'lijst', id } | { soort: 'gestapeld', lijsten: 'alle' | id[] } | { soort: 'dataset', id };
 * eigenschappen: { variabelen: { id: { meetniveau, label, ontbrekend, volgorde } } } (de definitie '~eigenschappen').
 * @returns {{ bron, sleutel, d, n, variabelen, perId: Map, lijsten, uitgesloten, meldingen, kwaliteit, rijLijst }}
 */
export function bouwDataset({ data, dataset = null, bron, drempel = DREMPEL, eigenschappen = null }) {
  const d = Math.max(DREMPEL, Number(drempel) || DREMPEL);
  const ds = bron.soort === 'dataset' ? bouwUitBestand(dataset, bron, d, eigenschappen) : bouwUitVragenlijsten(data, bron, d, eigenschappen);
  ds.sleutel = bronSleutel(bron);
  ds.d = d;
  for (const v of ds.variabelen) ds.perId.set(v.id, v);
  pasEigenschappenToe(ds, eigenschappen);
  for (const v of ds.variabelen) werkTellingBij(ds, v);
  return ds;
}

/** Zet meetniveau en omschrijving uit de eigenschappen (ook voor eigen variabelen, na het berekenen). */
export function pasEigenschappenToe(ds, eigenschappen, alleen = null) {
  const per = eigenschappen?.variabelen || {};
  for (const [id, e] of Object.entries(per)) {
    if (alleen && !alleen.has(id)) continue;
    const v = ds.perId.get(id);
    if (!v) continue;
    if (e.meetniveau && v.soort !== 'tekst' && v.soort !== 'set') {
      v.meetniveau = e.meetniveau;
      // Een kolom met codes die je zelf als getal aanmerkt, is geen indeling meer (B26 geldt voor indelingen).
      if (v.bron === 'dataset' && e.meetniveau === 'interval') v.groepering = false;
    }
    if (e.label) v.label = e.label;
  }
}

/** Telling op de hele bron en (bij een indeling) de beschermde groepen (regel A). */
export function werkTellingBij(ds, v) {
  const perReden = [0, 0, 0, 0, 0, 0];
  for (let r = 0; r < ds.n; r++) perReden[v.reden[r]]++;
  v.telling = { geldig: perReden[0], perReden };
  v.beschermd = null;
  if (v.labels.length && v.soort !== 'set' && v.soort !== 'tekst' && v.analyseerbaar) {
    const index = new Map(v.labels.map((l, i) => [l.code, i]));
    const aantallen = new Array(v.labels.length).fill(0);
    for (let r = 0; r < ds.n; r++) {
      if (v.reden[r] !== REDEN.GELDIG) continue;
      const i = index.get(v.waarden[r]);
      if (i !== undefined) aantallen[i]++;
    }
    v.aantallen = aantallen;
    // Een achtergrondvraag: wie hem oversloeg is een eigen groep "Niet ingevuld", net als op het dashboard (PR-05).
    const achtergrond = isAchtergrond(v);
    v.beschermd = beschermIndeling(aantallen, v.labels.map((l) => l.label), ds.d, { nietIngevuld: achtergrond ? perReden[REDEN.GEEN] : 0, achtergrond });
  }
}

/** Een achtergrondvraag uit een vragenlijst (kenmerk of uitsplitsvraag): "Niet ingevuld" telt als groep. */
export const isAchtergrond = (v) => v.bron === 'kenmerk';

/** Rij r van indeling v hoort bij de groep van "Niet ingevuld" (de vraag is overgeslagen en die groep is samengevoegd). */
export const inLeegGroep = (v, r) => v.reden[r] === REDEN.GEEN && (v.beschermd?.leegGroep ?? -1) >= 0;

function lijstNaam(l, mmNaam) {
  return l.meetmoment_id && mmNaam.has(l.meetmoment_id) ? `${l.titel} (${mmNaam.get(l.meetmoment_id)})` : l.titel;
}

function bouwUitVragenlijsten(data, bron, d) {
  const model = bouwModel(data);
  const namen = spssVariabeleNamen(data);
  const gebruikt = new Set(namen.gebruikt);
  const ruweVraag = new Map((data.vragen || []).map((q) => [q.id, q]));
  const mmNaam = new Map((data.meetmomenten || []).map((m) => [m.id, m.naam]));
  const status = new Map((data.vragenlijsten || []).map((l) => [l.id, l.status]));
  const kenmerken = data.lijsten?.kenmerken || {};
  const meldingen = [];

  let gekozen;
  if (bron.soort === 'lijst') gekozen = model.lijsten.filter((l) => l.id === bron.id);
  else if (bron.lijsten === 'alle') gekozen = model.lijsten;
  else gekozen = model.lijsten.filter((l) => bron.lijsten.includes(l.id));
  if (!gekozen.length) meldingen.push('Deze vragenlijst bestaat niet (meer).');

  // De inzendingen per vragenlijst, in de volgorde van de export (zo ook in bouwModel).
  const perLijst = new Map(gekozen.map((l) => [l.id, []]));
  for (const i of data.inzendingen || []) {
    const rijen = perLijst.get(i.vragenlijst_id);
    if (rijen && i.antwoorden && typeof i.antwoorden === 'object') rijen.push(i);
  }
  // Regel R0: een vragenlijst met 1 tot 4 antwoorden doet niet mee.
  const lijsten = [];
  const uitgesloten = [];
  for (const l of gekozen) {
    const n = perLijst.get(l.id).length;
    if (n > 0 && n < d) {
      uitgesloten.push({ id: l.id, titel: l.titel });
      meldingen.push(`De vragenlijst “${l.titel}” heeft minder dan ${d} antwoorden en doet niet mee.`);
    } else if (n > 0) {
      lijsten.push(l);
    }
  }
  const rijLijst = [];
  const inzendingen = [];
  lijsten.forEach((l, k) => {
    for (const i of perLijst.get(l.id)) {
      rijLijst.push(k);
      inzendingen.push(i);
    }
  });
  const n = inzendingen.length;
  const ctx = { data, model, namen, gebruikt, n };

  // Stamvragen in de volgorde van de export (eerste vragenlijst waarin ze voorkomen), alleen die in de bron.
  const stammen = [];
  const gezien = new Map();
  for (const l of model.lijsten) {
    for (const q of l.vragen) {
      if (!gezien.has(q.stam)) {
        const s = { stam: q.stam, eerste: q, perLijst: new Map() };
        gezien.set(q.stam, s);
        stammen.push(s);
      }
      const s = gezien.get(q.stam);
      if (!s.perLijst.has(l.id)) s.perLijst.set(l.id, q);
    }
  }
  const lijstIds = new Set(lijsten.map((l) => l.id));
  const variabelen = [];
  const systeem = [];
  const vragen = [];
  const kenmerkVars = [];

  if (bron.soort === 'gestapeld' && lijsten.length) {
    const v = nieuweVariabele(n, {
      id: 'sys:vragenlijst', naam: namen.systeem.vragenlijst, label: 'Vragenlijst', bron: 'systeem', groep: 'systeem',
      soort: 'categorie', meetniveau: 'nominaal', groepering: true,
      labels: model.lijsten.map((l, i) => ({ code: i + 1, label: lijstNaam(l, mmNaam), bronwaarde: l.id, bronwaarden: [l.id] })),
    });
    for (let r = 0; r < n; r++) zet(v, r, model.lijsten.indexOf(lijsten[rijLijst[r]]) + 1);
    systeem.push(v);
    if (namen.systeem.meetmoment) {
      const m = nieuweVariabele(n, {
        id: 'sys:meetmoment', naam: namen.systeem.meetmoment, label: 'Meetmoment', bron: 'systeem', groep: 'systeem',
        soort: 'categorie', meetniveau: 'ordinaal', groepering: true,
        labels: data.meetmomenten.map((mm, i) => ({ code: i + 1, label: mm.naam, bronwaarde: mm.id, bronwaarden: [mm.id] })),
      });
      for (let r = 0; r < n; r++) {
        const i = data.meetmomenten.findIndex((mm) => mm.id === lijsten[rijLijst[r]].meetmoment_id);
        if (i >= 0) zet(m, r, i + 1);
      }
      systeem.push(m);
    }
  }

  for (const s of stammen) {
    const inBron = [...s.perLijst.keys()].filter((id) => lijstIds.has(id));
    if (!inBron.length) continue;
    const eersteHier = s.perLijst.get(inBron[0]);
    s.ruw = ruweVraag.get(eersteHier.id) || {};
    s.label = eersteHier.tekst;
    // Achtergrondkenmerk: vragen.kenmerk (pakket P2); zonder kenmerk telt een uitsplitsvraag als indeling.
    let kenmerk = null;
    for (const id of inBron) {
      const k = ruweVraag.get(s.perLijst.get(id).id)?.kenmerk;
      if (typeof k === 'string' && k) {
        kenmerk = { sleutel: k, naam: kenmerken[k]?.naam || k, geordend: !!kenmerken[k]?.geordend };
        break;
      }
    }
    const isKeuze = s.eerste.type === 'janee' || (s.eerste.type === 'meerkeuze' && !s.eerste.meerdere);
    if (kenmerk && !isKeuze) kenmerk = null;
    if (!kenmerk && isKeuze && inBron.some((id) => s.perLijst.get(id).uitsplitsen)) kenmerk = { sleutel: 'uitsplitsing', naam: 'Indeling', geordend: false };
    s.kenmerk = kenmerk;
    const soort = VRAAGSOORTEN[s.eerste.type];
    const nieuw = soort ? soort.maak(s, ctx) : [nieuweVariabele(n, { soort: 'onbekend', analyseerbaar: false, reden_niet: NIET_TE_ANALYSEREN })];
    const [hoofd, ...leden] = nieuw;
    // Een vraag met meerdere antwoorden heeft in SPSS alleen namen per antwoord (v03_1, v03_2 …); de set heet v03.
    const naam = namen.vraag.get(s.stam) || (leden.length ? leden[0].naam.replace(/_\d+$/, '') : spssNaam(`vraag${s.stam}`, gebruikt));
    Object.assign(hoofd, {
      id: `v:${s.stam}`,
      naam,
      label: s.label,
      bron: kenmerk ? 'kenmerk' : 'vraag',
      groep: kenmerk ? 'kenmerk' : 'vraag',
      kenmerk,
      groepering: !!kenmerk,
      stam: s.stam,
      type: s.eerste.type,
      thema_id: s.eerste.thema_id,
      meetpunt_id: s.eerste.meetpunt_id,
      vraagIds: new Map(inBron.map((id) => [id, s.perLijst.get(id).id])),
    });
    for (const l of leden) Object.assign(l, { bron: 'vraag', groep: 'vraag', stam: s.stam, type: s.eerste.type, thema_id: s.eerste.thema_id });
    // Waarden: één doorgang over de rijen.
    if (soort) {
      const alle = [hoofd, ...leden];
      for (let r = 0; r < n; r++) {
        const l = lijsten[rijLijst[r]];
        const q = s.perLijst.get(l.id);
        if (!q) {
          for (const v of alle) v.reden[r] = REDEN.NIET_GEVRAAGD;
          continue;
        }
        const a = inzendingen[r].antwoorden[q.id];
        for (const v of alle) soort.waarde(v, q, a, r);
      }
    }
    (kenmerk ? kenmerkVars : vragen).push(hoofd, ...leden);
  }

  // Thema- en meetpuntscores (dezelfde regel als Analyse en SPSS: minstens de helft beantwoord).
  const scores = (soort, lijstVragen, id) => {
    const items = lijsten.map((l) => lijstVragen(l));
    if (!items.some((x) => x.length)) return null;
    const v = nieuweVariabele(n, { soort: 'getal', meetniveau: 'interval', bereik: { laag: 1, hoog: 5 } });
    const stamSets = items.filter((x) => x.length).map((x) => x.map((q) => q.stam).sort((a, b) => a - b).join(','));
    if (new Set(stamSets).size > 1) v.waarschuwingen.push(`De vragen van dit ${soort} verschillen per vragenlijst. De score is per vragenlijst berekend uit de vragen die daar stonden.`);
    for (let r = 0; r < n; r++) {
      const qs = items[rijLijst[r]];
      if (!qs.length) {
        v.reden[r] = REDEN.NIET_GEVRAAGD;
        continue;
      }
      const a = inzendingen[r].antwoorden;
      let somW = 0;
      let geldig = 0;
      let weetNiet = 0;
      for (const q of qs) {
        const x = schaalWaarde(a[q.id]);
        if (x !== null) {
          somW += x;
          geldig++;
        } else if (a[q.id] === WEET_NIET) weetNiet++;
      }
      if (geldig > 0 && geldig * 2 >= qs.length) zet(v, r, somW / geldig);
      else v.reden[r] = geldig > 0 ? REDEN.ONVOLLEDIG : weetNiet > 0 ? REDEN.WEET_NIET : REDEN.GEEN;
    }
    v.score = true;
    v.id = `${soort === 'thema' ? 't' : 'm'}:${id}`;
    return v;
  };
  const themaVars = [];
  for (const t of model.themas) {
    const v = scores('thema', (l) => l.vragen.filter((q) => q.type === 'schaal' && q.thema_id === t.id), t.id);
    if (!v) continue;
    Object.assign(v, { naam: namen.thema.get(t.id) || spssNaam('thema', gebruikt), label: t.naam, bron: 'thema', groep: 'thema', thema_id: t.id });
    themaVars.push(v);
  }
  const meetpuntVars = [];
  model.meetpunten.forEach((m, i) => {
    const v = scores('meetpunt', (l) => l.vragen.filter((q) => q.type === 'schaal' && q.meetpunt_id === m.id), m.id);
    if (!v) return;
    const naam = namen.meetpunt.get(m.id) || spssNaam(`meetpunt${String(i + 1).padStart(2, '0')}`, gebruikt);
    Object.assign(v, { naam, label: m.naam, bron: 'meetpunt', groep: 'meetpunt', meetpunt_id: m.id, thema_id: m.thema_id });
    meetpuntVars.push(v);
  });

  // Codes bij open vragen (pakket P5): 0/1 per (code, open vraag); leeg als de vraag niet beantwoord is.
  const codeVars = [];
  const codes = data.codes || [];
  const coderingen = data.coderingen || [];
  if (codes.length && coderingen.length) {
    const gecodeerd = new Set();
    const paren = new Map(); // `${code}@${stam}` → { code, stam }
    const stamVanVraag = new Map((data.vragen || []).map((q) => [q.id, q.bron_vraag_id || q.id]));
    for (const c of coderingen) {
      if (c.inzending_id === null || c.inzending_id === undefined) continue;
      gecodeerd.add(`${c.code_id}:${c.inzending_id}:${c.vraag_id}`);
      const stam = stamVanVraag.get(c.vraag_id);
      if (stam !== undefined) paren.set(`${c.code_id}@${stam}`, { code: c.code_id, stam });
    }
    for (const code of codes) {
      for (const s of stammen) {
        if (s.eerste.type !== 'open' || !paren.has(`${code.id}@${s.stam}`)) continue;
        if (![...s.perLijst.keys()].some((id) => lijstIds.has(id))) continue;
        const vraagNaam = namen.vraag.get(s.stam) || `v${s.stam}`;
        const v = nieuweVariabele(n, {
          id: `c:${code.id}@${s.stam}`,
          naam: spssNaam(`${vraagNaam}_${code.naam}`, gebruikt),
          label: `Code “${code.naam}” bij vraag “${s.label || s.eerste.tekst}”`,
          bron: 'code', groep: 'code', soort: 'categorie', meetniveau: 'nominaal', groepering: true, stam: s.stam,
          labels: [{ code: 1, label: 'Code gegeven', bronwaarde: 1, bronwaarden: [1] }, { code: 0, label: 'Geen code', bronwaarde: 0, bronwaarden: [0] }],
        });
        for (let r = 0; r < n; r++) {
          const q = s.perLijst.get(lijsten[rijLijst[r]].id);
          if (!q) {
            v.reden[r] = REDEN.NIET_GEVRAAGD;
            continue;
          }
          const a = inzendingen[r].antwoorden[q.id];
          if (typeof a === 'string' && a.trim()) zet(v, r, gecodeerd.has(`${code.id}:${inzendingen[r].id}:${q.id}`) ? 1 : 0);
        }
        codeVars.push(v);
      }
    }
  }

  variabelen.push(...kenmerkVars, ...systeem, ...themaVars, ...meetpuntVars, ...vragen, ...codeVars);

  // Kwaliteit per rij (voor de selecties "rechte lijn" en "minimaal beantwoord", K S9).
  const rechteLijn = new Uint8Array(n);
  const beantwoordPct = new Float64Array(n);
  const schaalPerLijst = lijsten.map((l) => l.vragen.filter((q) => q.type === 'schaal'));
  const geslotenPerLijst = lijsten.map((l) => l.vragen.filter((q) => q.type !== 'open'));
  for (let r = 0; r < n; r++) {
    const a = inzendingen[r].antwoorden;
    rechteLijn[r] = isRechteLijn(schaalPerLijst[rijLijst[r]], a) ? 1 : 0;
    const gesloten = geslotenPerLijst[rijLijst[r]];
    let beantwoord = 0;
    for (const q of gesloten) if (isBeantwoord(a[q.id])) beantwoord++;
    beantwoordPct[r] = gesloten.length ? (beantwoord / gesloten.length) * 100 : 100;
  }

  return {
    bron,
    n,
    variabelen,
    perId: new Map(),
    lijsten: lijsten.map((l, k) => ({
      id: l.id, titel: l.titel, naam: lijstNaam(l, mmNaam), meetmoment_id: l.meetmoment_id,
      n: rijLijst.filter((x) => x === k).length, open: status.get(l.id) === 'open',
    })),
    uitgesloten,
    meldingen,
    kwaliteit: { rechteLijn, beantwoordPct },
    rijLijst: Int32Array.from(rijLijst),
  };
}

/** Een antwoord telt als beantwoord: een getal, tekst, 'weet_niet' of een niet-lege keuze. */
function isBeantwoord(a) {
  if (a === undefined || a === null || a === '') return false;
  if (Array.isArray(a)) return a.length > 0;
  return true;
}

/** Minimum aantal schaalvragen voordat "alles hetzelfde" als rechte lijn telt (K S9). */
export const RECHTE_LIJN_MIN = 8;

/**
 * Rechte lijn (straight-lining): minstens 8 schaalvragen geldig beantwoord (1 tot 5), allemaal met hetzelfde
 * antwoord. "Weet niet" en lege antwoorden tellen niet mee. Ook bruikbaar voor het Overzicht (pakket P3).
 */
export function isRechteLijn(schaalvragen, antwoorden) {
  let eerste = null;
  let aantal = 0;
  for (const q of schaalvragen) {
    const x = schaalWaarde(antwoorden[q.id]);
    if (x === null) continue;
    if (eerste === null) eerste = x;
    else if (x !== eerste) return false;
    aantal++;
  }
  return aantal >= RECHTE_LIJN_MIN;
}

// ---------- Eigen dataset ----------

const leegCel = (w) => w === null || w === undefined || (typeof w === 'string' && w.trim() === '');

function bouwUitBestand(dataset, bron, d, eigenschappen) {
  const meldingen = [];
  if (!dataset || !Array.isArray(dataset.kolommen) || !Array.isArray(dataset.rijen)) {
    return { bron, n: 0, variabelen: [], perId: new Map(), lijsten: [], uitgesloten: [], meldingen: ['Deze dataset bestaat niet (meer).'], kwaliteit: null, rijLijst: new Int32Array(0) };
  }
  const n = dataset.rijen.length;
  const gebruikt = new Set();
  const verdacht = new Map(verdachteKolommen(dataset.kolommen, dataset.rijen.slice(0, 200), { metReden: true }).map((x) => [x.kolom, x.reden]));
  const per = eigenschappen?.variabelen || {};
  const variabelen = dataset.kolommen.map((kolom, j) => {
    const id = `d:${j}`;
    const ruw = dataset.rijen.map((rij) => rij[j]);
    const naam = spssNaam(kolom, gebruikt);
    const basis = { id, naam, label: String(kolom), bron: 'dataset', groep: 'dataset', kolom: j };
    if (verdacht.get(kolom) === 'persoon') {
      return nieuweVariabele(n, { ...basis, soort: 'tekst', analyseerbaar: false, reden_niet: 'Deze kolom lijkt namen of contactgegevens te bevatten; die gebruikt de werkbank niet.' });
    }
    const waarschuwingen = verdacht.get(kolom) === 'gezondheid'
      ? ["Deze kolom lijkt over gezondheid te gaan. Gebruik hiervoor 'Personeelsbestand voor HR-analytics'; dan worden alleen groepscijfers bewaard."] : [];
    const soort = kolomSoort(ruw);
    const ontbrekend = new Set((per[id]?.ontbrekend || []).map(Number));
    if (soort === 'getal') {
      const notatie = getalNotatie(ruw);
      const v = nieuweVariabele(n, { ...basis, soort: 'getal', meetniveau: 'interval', waarschuwingen });
      for (let r = 0; r < n; r++) {
        const x = leegCel(ruw[r]) ? null : alsGetal(ruw[r], notatie);
        if (x === null) continue;
        if (ontbrekend.has(x)) v.reden[r] = REDEN.EIGEN;
        else zet(v, r, x);
      }
      if (isCodekolom(ruw)) {
        // Een kolom met een paar gehele getallen (bijv. 1, 2, 3 voor afdeling): ook te gebruiken als indeling.
        const codes = [...new Set([...v.waarden].filter((x, r) => v.reden[r] === REDEN.GELDIG))].sort((a, b) => a - b);
        v.labels = codes.map((c) => ({ code: c, label: String(c).replace('.', ','), bronwaarde: c, bronwaarden: [c] }));
        v.soort = 'categorie';
        v.meetniveau = 'nominaal';
        v.groepering = true;
      }
      return v;
    }
    if (soort === 'categorie') {
      const sleutel = (w) => String(w).trim().toLowerCase();
      const eerste = new Map();
      for (const w of ruw) if (!leegCel(w) && !eerste.has(sleutel(w))) eerste.set(sleutel(w), String(w).trim());
      let volgorde = [...eerste.keys()].sort((a, b) => a.localeCompare(b, 'nl', { numeric: true }));
      const eigen = per[id]?.volgorde;
      if (Array.isArray(eigen) && eigen.length) {
        const gewenst = eigen.map((x) => String(x).toLowerCase()).filter((x) => eerste.has(x));
        volgorde = [...new Set([...gewenst, ...volgorde])];
      }
      const labels = volgorde.map((k, i) => ({ code: i + 1, label: eerste.get(k), bronwaarde: k, bronwaarden: [k] }));
      const code = new Map(volgorde.map((k, i) => [k, i + 1]));
      const v = nieuweVariabele(n, { ...basis, soort: 'categorie', meetniveau: 'nominaal', labels, groepering: true, waarschuwingen });
      for (let r = 0; r < n; r++) if (!leegCel(ruw[r])) zet(v, r, code.get(sleutel(ruw[r])));
      return v;
    }
    return nieuweVariabele(n, { ...basis, soort: 'tekst', analyseerbaar: false, reden_niet: soort === 'leeg' ? 'Deze kolom is leeg.' : 'Deze kolom bevat tekst met veel verschillende waarden; die is niet te analyseren.' });
  });
  return { bron, n, variabelen, perId: new Map(), lijsten: [], uitgesloten: [], meldingen, kwaliteit: null, rijLijst: new Int32Array(n), dataset: { id: dataset.id, naam: dataset.naam } };
}

// ---------- Voor het scherm ----------

/** De gegevens van een variabele zonder de waarden per respondent (voor keuzelijsten en de variabelenlijst). */
export function metadata(v) {
  const { waarden, reden, optie, aantallen, ...rest } = v;
  return {
    ...rest,
    vraagIds: v.vraagIds ? Object.fromEntries(v.vraagIds) : null,
    beschermd: v.beschermd ? { groepen: v.beschermd.groepen.map((g) => ({ label: g.label, labels: g.labels, samengevoegd: g.samengevoegd, metLeeg: !!g.metLeeg })), bruikbaar: v.beschermd.bruikbaar } : null,
  };
}

/** Kan een variabele als getal meedoen (gemiddelde, correlatie …)? Ordinaal of interval, of 0/1 (ja/nee). */
export function isGetal(v) {
  if (!v || !v.analyseerbaar || v.soort === 'tekst' || v.soort === 'set' || v.soort === 'onbekend') return false;
  if (v.meetniveau === 'ordinaal' || v.meetniveau === 'interval') return true;
  return v.labels.length === 2;
}

/** Kan een variabele als indeling (groepen) meedoen? Een categorie met minstens twee beschermde groepen. */
export function isIndeling(v) {
  return !!(v && v.analyseerbaar && v.soort !== 'set' && v.labels.length >= 2 && v.labels.length <= 60 && v.meetniveau !== 'interval' && v.beschermd);
}

/** Kan een variabele in een frequentietabel? Categorie, set, of een getal met hooguit 50 verschillende waarden. */
export function isVerdeling(v) {
  if (!v || !v.analyseerbaar || v.soort === 'tekst' || v.soort === 'onbekend') return false;
  return true;
}
