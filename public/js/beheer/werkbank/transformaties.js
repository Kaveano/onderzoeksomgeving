// Werkbank: eigen variabelen en selecties uitrekenen uit hun definities (D2 §4). Zuivere module, geen DOM.
//
// De definities komen in afhankelijkheidsvolgorde aan de beurt (een eigen variabele kan op een andere eigen
// variabele bouwen); een kring geeft een duidelijke fout. Verwijderde indelingen en selecties (verwijderd_op)
// worden ook uitgerekend, maar alleen om mee te tellen bij de controle op terugrekenen (regel E); ze staan
// niet in de keuzelijsten.

import { DREMPEL } from '../privacy.js';
import { REDEN, werkTellingBij, pasEigenschappenToe, isGetal } from './dataset.js';
import { eigenRefs, refsVan, EIGENSCHAPPEN_NAAM } from './definities.js';
import { burenVan, controleerOverlap, telIn, verschilVeilig } from './privacy-selectie.js';
import { nlGetal } from '../opmaak.js';
import { P_FILTER_REST, pFilterBuur, pOverlap } from './uitvoer-tekst.js';

export { P_FILTER_REST, pFilterBuur, pOverlap };

export const FOUT_KRING = 'Deze variabelen verwijzen naar elkaar. Pas een van beide aan.';
export const foutOntbreekt = (naam) => `Deze variabele gebruikt een variabele die niet meer bestaat: “${naam}”. Pas hem aan of verwijder hem.`;

/** Getal met hooguit twee decimalen, zonder overbodige nullen: 4,5 · 2 · 1.250 */
export const kortGetal = (x) => nlGetal(x, 2).replace(/(,\d*?)0+$/, '$1').replace(/,$/, '');

const lijstTekst = (namen, woord = 'of') => {
  const q = namen.map((n) => `“${n}”`);
  return q.length <= 1 ? q.join('') : `${q.slice(0, -1).join(', ')} ${woord} ${q[q.length - 1]}`;
};

/** De definities die bij deze gegevensbron horen (de vragenlijsten: dataset_id null). */
export function definitiesVoorBron(definities, bron) {
  const datasetId = bron?.soort === 'dataset' ? bron.id : null;
  return (definities || []).filter((d) => (d.dataset_id ?? null) === datasetId);
}

/** De eigenschappen-definitie (meetniveau, omschrijving …) van een gegevensbron, of null. */
export function eigenschappenVan(definities, bron) {
  return definitiesVoorBron(definities, bron).find((d) => d.soort === 'eigenschappen' && !d.verwijderd) || null;
}

/** Volgorde waarin definities uitgerekend kunnen worden; definities op een kring komen in `kring`. */
function volgorde(defs) {
  const perId = new Map(defs.map((d) => [d.id, d]));
  const klaar = new Set();
  const bezig = new Set();
  const uit = [];
  const kring = new Set();
  const bezoek = (d, pad) => {
    if (klaar.has(d.id)) return;
    if (bezig.has(d.id)) {
      for (const id of pad.slice(pad.indexOf(d.id))) kring.add(id);
      return;
    }
    bezig.add(d.id);
    for (const r of eigenRefs(d.soort, d.definitie)) {
      const dep = perId.get(r);
      if (dep) bezoek(dep, [...pad, d.id]);
    }
    bezig.delete(d.id);
    klaar.add(d.id);
    uit.push(d);
  };
  for (const d of defs) bezoek(d, []);
  return { uit, kring };
}

function nieuw(ds, def, velden) {
  const n = ds.n;
  return {
    id: `w:${def.id}`,
    naam: def.naam,
    label: def.label || def.naam,
    bron: 'berekend',
    groep: 'eigen',
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
    definitie_id: def.id,
    definitie_soort: def.soort,
    verwijderd: !!def.verwijderd,
    wortel: `w:${def.id}`,
    ...velden,
  };
}

// Per categoriecode van een variabele: welke codes van de wortelvariabele erin zitten (regel E).
function dekkingVanCode(v, code) {
  if (v.dekking && v.dekking.has(code)) return v.dekking.get(code);
  return { soort: 'codes', codes: [code] };
}

function bereken(ds, def, items) {
  const dd = def.definitie;
  const k = items.length;
  const v = nieuw(ds, def, {});
  const n = ds.n;
  if (dd.functie === 'zscore') {
    const [{ v: x }] = items;
    let som = 0;
    let aantal = 0;
    for (let r = 0; r < n; r++) if (x.reden[r] === REDEN.GELDIG) { som += x.waarden[r]; aantal++; }
    const m = aantal ? som / aantal : NaN;
    let ss = 0;
    for (let r = 0; r < n; r++) if (x.reden[r] === REDEN.GELDIG) ss += (x.waarden[r] - m) ** 2;
    const sd = aantal > 1 ? Math.sqrt(ss / (aantal - 1)) : 0;
    for (let r = 0; r < n; r++) {
      if (x.reden[r] !== REDEN.GELDIG) v.reden[r] = x.reden[r];
      else if (sd > 0) { v.waarden[r] = (x.waarden[r] - m) / sd; v.reden[r] = REDEN.GELDIG; }
    }
    if (!(sd > 0)) v.waarschuwingen.push('Alle waarden zijn gelijk; een z-score is dan niet te berekenen.');
    return v;
  }
  if (dd.functie === 'verschil') {
    const [a, b] = items.map((i) => i.v);
    for (let r = 0; r < n; r++) {
      if (a.reden[r] === REDEN.GELDIG && b.reden[r] === REDEN.GELDIG) { v.waarden[r] = a.waarden[r] - b.waarden[r]; v.reden[r] = REDEN.GELDIG; }
      else v.reden[r] = a.reden[r] !== REDEN.GELDIG ? a.reden[r] : b.reden[r];
    }
    return v;
  }
  const min = dd.min_geldig ?? (dd.functie === 'gemiddelde' ? Math.ceil(k / 2) : dd.functie === 'som' ? k : 0);
  const zelfdeBereik = items.every((i) => i.v.bereik && i.v.bereik.laag === items[0].v.bereik.laag && i.v.bereik.hoog === items[0].v.bereik.hoog);
  if (dd.functie === 'gemiddelde' && zelfdeBereik) v.bereik = { ...items[0].v.bereik };
  for (let r = 0; r < n; r++) {
    let som = 0;
    let geldig = 0;
    let nietGevraagd = 0;
    let weetNiet = 0;
    for (const { v: x, omscoren } of items) {
      const rd = x.reden[r];
      if (rd === REDEN.GELDIG) {
        som += omscoren ? x.bereik.laag + x.bereik.hoog - x.waarden[r] : x.waarden[r];
        geldig++;
      } else if (rd === REDEN.NIET_GEVRAAGD) nietGevraagd++;
      else if (rd === REDEN.WEET_NIET) weetNiet++;
    }
    if (dd.functie === 'aantal_geldig') {
      if (nietGevraagd === k) v.reden[r] = REDEN.NIET_GEVRAAGD;
      else { v.waarden[r] = geldig; v.reden[r] = REDEN.GELDIG; }
      continue;
    }
    if (geldig >= Math.max(1, min)) {
      v.waarden[r] = dd.functie === 'som' ? som : som / geldig;
      v.reden[r] = REDEN.GELDIG;
    } else if (nietGevraagd === k) v.reden[r] = REDEN.NIET_GEVRAAGD;
    else if (geldig > 0) v.reden[r] = REDEN.ONVOLLEDIG; // B7: telt als weggevallen respondent
    else v.reden[r] = weetNiet > 0 ? REDEN.WEET_NIET : REDEN.GEEN;
  }
  if (dd.functie === 'gemiddelde' || dd.functie === 'som') v.score = true;
  return v;
}

function omscoren(ds, def, bron) {
  const { laag, hoog } = def.definitie.laag !== undefined ? def.definitie : bron.bereik;
  const v = nieuw(ds, def, {
    soort: bron.soort, meetniveau: bron.meetniveau, bereik: { laag, hoog }, wortel: bron.wortel || bron.id,
    groepering: bron.groepering, score: bron.score,
    labels: bron.labels.map((l) => ({ ...l, code: laag + hoog - l.code })).sort((a, b) => a.code - b.code),
  });
  if (bron.labels.length) {
    v.dekking = new Map(bron.labels.map((l) => [laag + hoog - l.code, dekkingVanCode(bron, l.code)]));
  } else {
    v.spiegel = { laag, hoog };
  }
  for (let r = 0; r < ds.n; r++) {
    v.reden[r] = bron.reden[r];
    if (bron.reden[r] === REDEN.GELDIG) v.waarden[r] = laag + hoog - bron.waarden[r];
  }
  return v;
}

/** Interval (wortelwaarden) van een grens-indeling: [van, tot), null = geen grens. */
function intervalVan(bron, van, tot) {
  if (bron.spiegel) {
    // x' = laag + hoog − x: een interval op x' is een gespiegeld interval op de wortel.
    const s = bron.spiegel.laag + bron.spiegel.hoog;
    return { soort: 'bereik', delen: [[tot === null ? null : s - tot, van === null ? null : s - van]] };
  }
  return { soort: 'bereik', delen: [[van, tot]] };
}

function hercoderen(ds, def, bron) {
  const dd = def.definitie;
  const v = nieuw(ds, def, { soort: 'categorie', groepering: true, wortel: bron.wortel || bron.id, dekking: new Map() });
  const n = ds.n;
  if (dd.manier === 'grenzen') {
    v.meetniveau = 'ordinaal';
    const g = dd.grenzen;
    v.labels = dd.labels.map((label, i) => ({ code: i + 1, label, bronwaarde: i + 1, bronwaarden: [i + 1] }));
    dd.labels.forEach((_, i) => v.dekking.set(i + 1, intervalVan(bron, i === 0 ? null : g[i - 1], i === g.length ? null : g[i])));
    for (let r = 0; r < n; r++) {
      if (bron.reden[r] !== REDEN.GELDIG) { v.reden[r] = bron.reden[r]; continue; }
      const x = bron.waarden[r];
      let i = 0;
      while (i < g.length && x >= g[i]) i++;
      v.waarden[r] = i + 1;
      v.reden[r] = REDEN.GELDIG;
    }
    return v;
  }
  v.meetniveau = 'nominaal';
  const groepVanCode = new Map();
  const groepen = dd.groepen.map((gr) => ({ ...gr, waardeSet: new Set(gr.waarden.map(String)) }));
  for (const l of bron.labels) {
    const gr = groepen.find((x) => l.bronwaarden.some((w) => x.waardeSet.has(String(w))) || x.waardeSet.has(String(l.bronwaarde)));
    if (gr) groepVanCode.set(l.code, gr.code);
  }
  v.labels = groepen.map((gr) => ({ code: gr.code, label: gr.label, bronwaarde: gr.code, bronwaarden: [gr.code] }));
  let overig = null;
  if (dd.rest === 'overig') {
    overig = Math.max(0, ...groepen.map((gr) => gr.code)) + 1;
    v.labels.push({ code: overig, label: 'Overig', bronwaarde: overig, bronwaarden: [overig] });
  }
  // Dekking per nieuwe groep: de wortelcodes van alle broncategorieën erin.
  for (const lab of v.labels) {
    const codes = [];
    for (const l of bron.labels) {
      const doel = groepVanCode.has(l.code) ? groepVanCode.get(l.code) : overig;
      if (doel !== lab.code) continue;
      const dk = dekkingVanCode(bron, l.code);
      if (dk.soort === 'codes') codes.push(...dk.codes);
    }
    v.dekking.set(lab.code, { soort: 'codes', codes });
  }
  for (let r = 0; r < n; r++) {
    if (bron.reden[r] !== REDEN.GELDIG) { v.reden[r] = bron.reden[r]; continue; }
    const doel = groepVanCode.has(bron.waarden[r]) ? groepVanCode.get(bron.waarden[r]) : overig;
    if (doel === null) v.reden[r] = REDEN.EIGEN; // niet ingedeeld
    else { v.waarden[r] = doel; v.reden[r] = REDEN.GELDIG; }
  }
  return v;
}

/**
 * Rekent één definitie (bereken, omscoren of hercoderen) uit, zonder hem aan ds toe te voegen.
 * @returns {{ v } | { tekst }} de variabele, of de reden waarom het niet kan.
 */
export function maakVariabele(ds, def) {
  const refs = refsVan(def.soort, def.definitie);
  const ontbreekt = refs.find((r) => !ds.perId.has(r));
  if (ontbreekt) return { tekst: foutOntbreekt(ontbreekt) };
  let v = null;
  if (def.soort === 'bereken') {
    const items = def.definitie.variabelen.map((x) => (typeof x === 'string' ? { v: ds.perId.get(x), omscoren: false } : { v: ds.perId.get(x.id), omscoren: !!x.omscoren }));
    const geenGetal = items.find((i) => !isGetal(i.v));
    const geenBereik = items.find((i) => i.omscoren && !i.v.bereik);
    if (geenGetal) return { tekst: `“${geenGetal.v.label}” is geen getal; die kun je niet in een score gebruiken.` };
    if (geenBereik) return { tekst: `“${geenBereik.v.label}” heeft geen vaste schaal; omscoren kan dan niet.` };
    v = bereken(ds, def, items);
  } else if (def.soort === 'omscoren') {
    const bron = ds.perId.get(def.definitie.variabele);
    if (!bron.bereik && def.definitie.laag === undefined) return { tekst: `“${bron.label}” heeft geen vaste schaal (zoals 1 tot 5); omscoren kan dan niet.` };
    v = omscoren(ds, def, bron);
  } else if (def.soort === 'hercoderen') {
    const bron = ds.perId.get(def.definitie.variabele);
    if (def.definitie.manier === 'grenzen' && !isGetal(bron)) return { tekst: `“${bron.label}” is geen getal; deel hem in op antwoorden in plaats van met grenzen.` };
    if (def.definitie.manier === 'categorieen' && !bron.labels.length) return { tekst: `“${bron.label}” heeft geen vaste antwoorden; deel hem in met grenzen.` };
    v = hercoderen(ds, def, bron);
  } else {
    return { tekst: 'Deze soort definitie maakt geen variabele.' };
  }
  if (def.definitie.uitleg) v.uitleg = def.definitie.uitleg;
  return { v };
}

/**
 * Rekent alle definities van deze bron uit en voegt de eigen variabelen (w:<id>) en selecties toe aan ds.
 * definities: [{ id, dataset_id, soort, naam, label, definitie, verwijderd }] (leesDefinities).
 * Zet ds.filters (Map id → selectie-definitie) en ds.fouten ([{ id, naam, tekst }]).
 */
export function pasDefinitiesToe(ds, definities, { eigenschappen = null } = {}) {
  ds.filters = new Map();
  ds.fouten = [];
  const defs = definitiesVoorBron(definities, ds.bron).filter((d) => d.soort !== 'eigenschappen' && (!d.verwijderd || d.soort === 'hercoderen' || d.soort === 'filter'));
  const { uit, kring } = volgorde(defs);
  const nieuweIds = new Set();
  for (const def of uit) {
    if (kring.has(def.id)) {
      ds.fouten.push({ id: def.id, naam: def.naam, tekst: FOUT_KRING, verwijderd: def.verwijderd });
      continue;
    }
    if (def.soort === 'filter') {
      ds.filters.set(def.id, { id: def.id, naam: def.naam, label: def.label || def.naam, voorwaarden: def.definitie.voorwaarden, verwijderd: !!def.verwijderd });
      const ontbreekt = refsVan('filter', def.definitie).find((r) => !ds.perId.has(r));
      if (ontbreekt) ds.filters.get(def.id).fout = foutOntbreekt(ontbreekt.startsWith('w:') ? `eigen variabele ${ontbreekt.slice(2)}` : ontbreekt);
      continue;
    }
    const { v, tekst } = maakVariabele(ds, def);
    if (tekst) {
      ds.fouten.push({ id: def.id, naam: def.naam, tekst, verwijderd: def.verwijderd });
      continue;
    }
    if (!v) continue;
    ds.variabelen.push(v);
    ds.perId.set(v.id, v);
    nieuweIds.add(v.id);
  }
  pasEigenschappenToe(ds, eigenschappen, nieuweIds);
  for (const id of nieuweIds) werkTellingBij(ds, ds.perId.get(id));
  return ds;
}

// ---------- Selecties ----------

const gelijkeWaarde = (labels, waarden) => {
  const set = new Set(waarden.map(String));
  return labels.filter((l) => set.has(String(l.bronwaarde)) || l.bronwaarden.some((w) => set.has(String(w))));
};

/** Omschrijving van één voorwaarde, bijvoorbeeld: “Afdeling” is “Verkoop” of “Service”. */
export function voorwaardeTekst(ds, vw) {
  if (vw.soort === 'kwaliteit') {
    return vw.regel === 'rechte_lijn'
      ? 'zonder respondenten die alle schaalvragen hetzelfde beantwoordden'
      : `alleen respondenten die minstens ${vw.min_pct}% van de vragen beantwoordden`;
  }
  const v = ds.perId.get(vw.variabele);
  const naam = v ? v.label : vw.variabele;
  if (vw.is || vw.niet) {
    const gekozen = v ? gelijkeWaarde(v.labels, vw.is || vw.niet).map((l) => l.label) : [];
    return `“${naam}” is ${vw.niet ? 'niet ' : ''}${gekozen.length ? lijstTekst(gekozen, vw.niet ? 'en' : 'of') : '(onbekend)'}`;
  }
  if (vw.van !== undefined && vw.tot !== undefined) return `“${naam}” van ${kortGetal(vw.van)} tot en met ${kortGetal(vw.tot)}`;
  if (vw.van !== undefined) return `“${naam}” is ${kortGetal(vw.van)} of meer`;
  return `“${naam}” is ${kortGetal(vw.tot)} of minder`;
}

/**
 * Vertaalt één voorwaarde naar rijen (1 = voldoet). Rijen zonder geldige waarde voldoen nooit.
 * eenheden: bij "is" en "niet" per beschermde groep een masker van de voorwaarde zonder die groep (regel D).
 */
export function voorwaardeMasker(ds, vw) {
  const n = ds.n;
  const masker = new Uint8Array(n);
  if (vw.soort === 'kwaliteit') {
    if (!ds.kwaliteit) return { fout: 'Deze voorwaarde kan alleen bij vragenlijsten.' };
    for (let r = 0; r < n; r++) {
      masker[r] = vw.regel === 'rechte_lijn' ? (ds.kwaliteit.rechteLijn[r] ? 0 : 1) : (ds.kwaliteit.beantwoordPct[r] >= vw.min_pct ? 1 : 0);
    }
    return { masker, eenheden: [] };
  }
  const v = ds.perId.get(vw.variabele);
  if (!v) return { fout: foutOntbreekt(vw.variabele) };
  if (vw.is || vw.niet) {
    const gekozen = gelijkeWaarde(v.labels, vw.is || vw.niet);
    const codes = new Set(gekozen.map((l) => l.code));
    const zit = (r) => v.reden[r] === REDEN.GELDIG && codes.has(v.waarden[r]);
    for (let r = 0; r < n; r++) masker[r] = v.reden[r] === REDEN.GELDIG && (vw.niet ? !zit(r) : zit(r)) ? 1 : 0;
    // Eenheden: de gekozen waarden per beschermde groep (een kleine categorie kies je nooit los).
    const eenheden = [];
    if (v.beschermd) {
      const index = new Map(v.labels.map((l, i) => [l.code, i]));
      const perGroep = new Map();
      for (const l of gekozen) {
        const g = v.beschermd.groepVan[index.get(l.code)];
        if (!perGroep.has(g)) perGroep.set(g, new Set());
        perGroep.get(g).add(l.code);
      }
      if (perGroep.size >= 2) {
        for (const [g, weg] of perGroep) {
          const m = new Uint8Array(n);
          for (let r = 0; r < n; r++) {
            if (v.reden[r] !== REDEN.GELDIG) continue;
            const c = v.waarden[r];
            const inRest = codes.has(c) && !weg.has(c);
            m[r] = (vw.niet ? !(inRest) : inRest) ? 1 : 0;
          }
          const groepNaam = g >= 0 ? v.beschermd.groepen[g].label : [...weg].map((c) => v.labels[index.get(c)].label).join(', ');
          eenheden.push({ masker: m, tekst: `“${groepNaam}” bij ${voorwaardeTekst(ds, vw)}` });
        }
      }
    }
    return { masker, eenheden };
  }
  for (let r = 0; r < n; r++) {
    if (v.reden[r] !== REDEN.GELDIG) continue;
    const x = v.waarden[r];
    masker[r] = (vw.van === undefined || x >= vw.van) && (vw.tot === undefined || x <= vw.tot) ? 1 : 0;
  }
  return { masker, eenheden: [] };
}

/**
 * De selectie bij een filter-definitie, met haar buren (regel D).
 * @returns {{ id, naam, tekst, F, buren, n } | { fout }}
 */
export function maakSelectie(ds, filterId) {
  const f = ds.filters?.get(filterId);
  if (!f) return { fout: 'Deze selectie bestaat niet (meer). Kies een andere selectie.' };
  if (f.fout) return { fout: f.fout };
  const delen = [];
  for (const vw of f.voorwaarden) {
    const m = voorwaardeMasker(ds, vw);
    if (m.fout) return { fout: m.fout };
    delen.push({ ...m, tekst: voorwaardeTekst(ds, vw) });
  }
  const { F, buren } = burenVan(ds.n, delen);
  const tekst = delen.map((x) => x.tekst).join(' en ');
  return { id: f.id, naam: f.label || f.naam, tekst: tekst.charAt(0).toUpperCase() + tekst.slice(1), F, buren, n: telIn(new Uint8Array(ds.n).fill(1), F), voorwaarden: f.voorwaarden };
}

/**
 * Controle van een selectie op de hele bron (voorbeeld in het venster "Selectie maken"): zowel de selectie als
 * wat erbuiten valt moet 0 of minstens d mensen zijn, en elke buur moet 0 of minstens d verschillen.
 */
export function controleerSelectie(ds, selectie, d = DREMPEL) {
  const iedereen = new Uint8Array(ds.n).fill(1);
  const inF = telIn(iedereen, selectie.F);
  const meldingen = [];
  if (inF < d) meldingen.push({ soort: 'klein', tekst: `In deze selectie zitten minder dan ${d} mensen. Kies een ruimere selectie.` });
  for (const b of selectie.buren) {
    const inN = telIn(iedereen, b.masker);
    if (!verschilVeilig(inN, inF, d)) {
      meldingen.push(b.soort === 'iedereen' ? { soort: 'rest', tekst: P_FILTER_REST } : { soort: 'buur', tekst: pFilterBuur(b.tekst) });
      break;
    }
  }
  return { n: inF, totaal: ds.n, ok: !meldingen.length, meldingen };
}


// ---------- Regel E: indelingen van dezelfde wortelvariabele ----------

/** De wortel van een variabele (bij omscoren en indelen: de variabele waar het van komt). */
export const wortelVan = (ds, v) => (v.wortel && ds.perId.has(v.wortel) ? ds.perId.get(v.wortel) : v);

function codeIndex(v) {
  return new Map(v.labels.map((l, i) => [l.code, i]));
}

/**
 * Alle indelingen van wortelvariabele w (regel E): de beschermde groepen van w zelf, elke indeling (hercoderen) die
 * op w teruggaat (ook verwijderde) en elke voorwaarde van een selectie op w (binnen / buiten).
 * uitzondering: { definitieId } om een definitie die je aan het wijzigen bent over te slaan.
 */
export function indelingenVan(ds, w, { uitzondering = null } = {}) {
  const n = ds.n;
  const uit = [];
  const geldig = (r) => w.reden[r] === REDEN.GELDIG;
  if (w.beschermd && w.labels.length) {
    const index = codeIndex(w);
    const groep = new Int32Array(n).fill(-1);
    for (let r = 0; r < n; r++) if (geldig(r)) groep[r] = w.beschermd.groepVan[index.get(w.waarden[r])] ?? -1;
    uit.push({
      naam: w.label,
      soort: 'wortel',
      groep,
      groepen: w.beschermd.groepen.map((g) => ({ label: g.label, dekking: { soort: 'codes', codes: g.categorieen.map((i) => w.labels[i].code) } })),
    });
  }
  for (const v of ds.variabelen) {
    if (v.definitie_soort !== 'hercoderen' || v.wortel !== w.id || v.definitie_id === uitzondering) continue;
    const index = codeIndex(v);
    const groep = new Int32Array(n).fill(-1);
    for (let r = 0; r < n; r++) if (geldig(r) && v.reden[r] === REDEN.GELDIG) groep[r] = index.get(v.waarden[r]) ?? -1;
    uit.push({ naam: v.label, soort: 'indeling', definitie_id: v.definitie_id, groep, groepen: v.labels.map((l) => ({ label: l.label, dekking: v.dekking?.get(l.code) || null })) });
  }
  for (const f of ds.filters?.values() || []) {
    if (f.id === uitzondering) continue;
    for (const vw of f.voorwaarden) {
      if (!vw.variabele) continue;
      const v = ds.perId.get(vw.variabele);
      if (!v || wortelVan(ds, v).id !== w.id) continue;
      const m = voorwaardeMasker(ds, vw);
      if (m.fout) continue;
      const groep = new Int32Array(n).fill(-1);
      for (let r = 0; r < n; r++) if (geldig(r)) groep[r] = m.masker[r] ? 0 : 1;
      uit.push({ naam: f.label || f.naam, soort: 'selectie', definitie_id: f.id, groep, groepen: [{ label: 'in de selectie', dekking: dekkingVanVoorwaarde(ds, v, vw, true) }, { label: 'buiten de selectie', dekking: dekkingVanVoorwaarde(ds, v, vw, false) }] });
    }
  }
  return uit;
}

function dekkingVanVoorwaarde(ds, v, vw, binnen) {
  if (vw.is || vw.niet) {
    const gekozen = new Set(gelijkeWaarde(v.labels, vw.is || vw.niet).map((l) => l.code));
    const erin = vw.is ? binnen : !binnen;
    const codes = [];
    for (const l of v.labels) if (gekozen.has(l.code) === erin) { const dk = dekkingVanCode(v, l.code); if (dk.soort === 'codes') codes.push(...dk.codes); }
    return { soort: 'codes', codes };
  }
  if (binnen) return { soort: 'bereik', delen: [[vw.van ?? null, vw.tot ?? null]], tot_en_met: true };
  const delen = [];
  if (vw.van !== undefined) delen.push([null, vw.van]);
  if (vw.tot !== undefined) delen.push([vw.tot, null]);
  return { soort: 'bereik', delen };
}

/** Beschrijving van het gebied in groep a dat niet in groep b zit (zonder aantallen), voor P_OVERLAP. */
function verschilTekst(w, a, b) {
  if (a?.soort === 'codes' && b?.soort === 'codes') {
    const inB = new Set(b.codes);
    const labels = a.codes.filter((c) => !inB.has(c)).map((c) => w.labels.find((l) => l.code === c)?.label).filter(Boolean);
    return labels.length ? `in ${lijstTekst(labels, 'en')}` : null;
  }
  if (a?.soort === 'bereik' && b?.soort === 'bereik' && a.delen.length === 1 && b.delen.length === 1) {
    const [a0, a1] = a.delen[0];
    const [b0, b1] = b.delen[0];
    const g = kortGetal;
    const delen = [];
    if ((a0 ?? -Infinity) < (b0 ?? -Infinity)) delen.push(a0 === null ? `lager dan ${g(b0)}` : `tussen ${g(a0)} en ${g(b0)}`);
    if ((a1 ?? Infinity) > (b1 ?? Infinity)) delen.push(a1 === null ? `vanaf ${g(b1)}` : `tussen ${g(b1)} en ${g(a1)}`);
    return delen.length ? delen.join(' en ') : null;
  }
  return null;
}


/** Zet een overtreding van controleerOverlap om in een melding voor de gebruiker (P_OVERLAP). */
export function overlapMelding(w, o, ikNaam = null) {
  const gP = o.P.groepen[o.g];
  const hQ = o.Q.groepen[o.h];
  const [klein, groot] = o.rest === 'g' ? [gP, hQ] : [hQ, gP];
  const waar = verschilTekst(w, klein.dekking, groot.dekking) || `tussen “${klein.label}” en “${groot.label}”`;
  const andere = ikNaam !== null ? (o.P.naam === ikNaam ? o.Q.naam : o.P.naam) : o.Q.naam;
  return pOverlap(andere, waar);
}

/**
 * Regel E bij het uitvoeren: alle indelingen van de wortels van deze variabelen mogen samen geen groepje van 1 tot
 * 4 mensen afbakenen. Geeft null of de melding.
 */
export function controleerWortels(ds, variabelen, d = DREMPEL) {
  const gezien = new Set();
  for (const v of variabelen) {
    if (!v) continue;
    const w = wortelVan(ds, v);
    if (gezien.has(w.id)) continue;
    gezien.add(w.id);
    const indelingen = indelingenVan(ds, w);
    if (indelingen.length < 2) continue;
    const fouten = controleerOverlap(indelingen, d);
    if (fouten.length) return overlapMelding(w, fouten[0]);
  }
  return null;
}

/**
 * Regel E bij het bewaren van een indeling of selectie: past de nieuwe (of gewijzigde) definitie bij de bestaande
 * indelingen van dezelfde wortel? def: { id?, soort: 'hercoderen'|'filter', naam, label, definitie }.
 * Geeft [melding] (leeg = in orde).
 */
export function controleerNieuweIndeling(ds, def, d = DREMPEL) {
  const tijdelijk = { ...def, id: def.id ?? -1, dataset_id: ds.bron.soort === 'dataset' ? ds.bron.id : null };
  const meldingen = [];
  if (def.soort === 'hercoderen') {
    const bron = ds.perId.get(def.definitie.variabele);
    if (!bron) return [foutOntbreekt(def.definitie.variabele)];
    const v = hercoderen(ds, tijdelijk, bron);
    const w = wortelVan(ds, v);
    const andere = indelingenVan(ds, w, { uitzondering: tijdelijk.id });
    const index = codeIndex(v);
    const groep = new Int32Array(ds.n).fill(-1);
    for (let r = 0; r < ds.n; r++) if (w.reden[r] === REDEN.GELDIG && v.reden[r] === REDEN.GELDIG) groep[r] = index.get(v.waarden[r]) ?? -1;
    const mij = { naam: def.label || def.naam, groep, groepen: v.labels.map((l) => ({ label: l.label, dekking: v.dekking.get(l.code) })) };
    for (const o of controleerOverlap([...andere, mij], d, { nieuw: andere.length })) meldingen.push(overlapMelding(w, o, mij.naam));
    return [...new Set(meldingen)].slice(0, 3);
  }
  if (def.soort === 'filter') {
    const vorige = ds.filters;
    ds.filters = new Map([...(vorige || new Map())].filter(([id]) => id !== tijdelijk.id));
    try {
      for (const vw of def.definitie.voorwaarden) {
        if (!vw.variabele) continue;
        const v = ds.perId.get(vw.variabele);
        if (!v) return [foutOntbreekt(vw.variabele)];
        const w = wortelVan(ds, v);
        const andere = indelingenVan(ds, w);
        const m = voorwaardeMasker(ds, vw);
        if (m.fout) return [m.fout];
        const groep = new Int32Array(ds.n).fill(-1);
        for (let r = 0; r < ds.n; r++) if (w.reden[r] === REDEN.GELDIG) groep[r] = m.masker[r] ? 0 : 1;
        const mij = { naam: def.label || def.naam, groep, groepen: [{ label: 'in de selectie', dekking: dekkingVanVoorwaarde(ds, v, vw, true) }, { label: 'buiten de selectie', dekking: dekkingVanVoorwaarde(ds, v, vw, false) }] };
        for (const o of controleerOverlap([...andere, mij], d, { nieuw: andere.length })) meldingen.push(overlapMelding(w, o, mij.naam));
      }
    } finally {
      ds.filters = vorige;
    }
    return [...new Set(meldingen)].slice(0, 3);
  }
  return meldingen;
}

export { EIGENSCHAPPEN_NAAM };
