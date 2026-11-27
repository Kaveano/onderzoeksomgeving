// Werkbank: de rekenkern (BOUWPLAN §3.7, K S5). Zuivere module, geen DOM, geen fetch.
// Draait in de browser op de hoofdthread: tussen de rekenstappen geeft hij de browser even de tijd (pauze), zodat
// het scherm bruikbaar blijft, en met een AbortSignal stopt hij ("Stoppen"). In Node draaien dezelfde functies
// (tests, prestaties).
//
// laad({ data, datasets, definities, bron, drempel }) → { variabelen (zonder waarden), n, lijsten, meldingen, … }
// voerUit(spec, { voortgang, signaal, streng, nu }) → Uitvoer (al beschermd)
// controleerIndeling(def, bron) → voorbeeld en meldingen voor de vensters "Variabelen maken"
// maakRekenkern() geeft een eigen exemplaar (de standaardfuncties delen er één).

import { DREMPEL, drempelVan, verbergReeks } from '../privacy.js';
import { bouwDataset, bronSleutel, metadata, REDEN } from './dataset.js';
import {
  pasDefinitiesToe, eigenschappenVan, maakSelectie, controleerSelectie, controleerNieuweIndeling, maakVariabele, voorwaardeTekst,
} from './transformaties.js';
import { leesDefinities, controleerSpec, specRefs, DefinitieFout, controleerDefinitie } from './definities.js';
import { PROCEDURES } from './procedures/index.js';
import { geweigerd } from './uitvoer.js';
import { ontbreektTekst } from './procedures/basis.js';
import { beschrijving } from './procedures/beschrijven.js';
import { cronbachAlpha } from '../statistiek.js';

/** Fout bij "Stoppen". */
export function stopFout() {
  const e = new Error('De berekening is gestopt.');
  e.name = 'AbortError';
  return e;
}

const vandaag = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

function alsMap(datasets) {
  if (!datasets) return new Map();
  if (datasets instanceof Map) return datasets;
  return new Map(datasets.filter(Boolean).map((d) => [d.id, d]));
}

export function maakRekenkern() {
  let invoer = { data: null, datasets: new Map(), definities: [], d: DREMPEL };
  let huidig = null; // de laatst geladen bron
  const opgebouwd = new Map(); // bronSleutel → ds

  function stel({ data, datasets = null, definities = null, drempel = DREMPEL } = {}) {
    // leesDefinities leest zowel de rijen uit de export (JSON als tekst) als al gelezen definities.
    invoer = { data, datasets: alsMap(datasets), definities: leesDefinities(definities ?? data?.werkbank_definities ?? []), d: drempelVan({ drempel }) };
    opgebouwd.clear();
  }

  /** De dataset van een bron (opgebouwd en met alle definities uitgerekend; bewaard tot de invoer verandert). */
  function datasetVan(bron) {
    const sleutel = bronSleutel(bron);
    if (opgebouwd.has(sleutel)) return opgebouwd.get(sleutel);
    const eig = eigenschappenVan(invoer.definities, bron);
    const ds = bouwDataset({
      data: invoer.data,
      dataset: bron.soort === 'dataset' ? invoer.datasets.get(bron.id) || null : null,
      bron,
      drempel: invoer.d,
      eigenschappen: eig?.definitie || null,
    });
    pasDefinitiesToe(ds, invoer.definities, { eigenschappen: eig?.definitie || null });
    opgebouwd.set(sleutel, ds);
    return ds;
  }

  /** Alles wat het scherm over een bron moet weten, zonder waarden per respondent. */
  function overzicht(ds) {
    const d = invoer.d;
    return {
      bron: ds.bron,
      n: ds.n,
      lijsten: ds.lijsten,
      uitgesloten: ds.uitgesloten,
      meldingen: ds.meldingen,
      fouten: ds.fouten || [],
      variabelen: ds.variabelen.map((v) => {
        const m = metadata(v);
        // Geldig (n): 1 tot 4 wordt × (D2 §11.3).
        m.geldig = v.telling.geldig > 0 && v.telling.geldig < d ? null : v.telling.geldig;
        m.verdeling = verdelingVoorLijst(v);
        return m;
      }),
      filters: [...(ds.filters?.values() || [])].map((f) => {
        const s = f.fout ? null : maakSelectie(ds, f.id);
        const c = s && !s.fout ? controleerSelectie(ds, s, d) : null;
        return { id: f.id, naam: f.naam, label: f.label, verwijderd: f.verwijderd, fout: f.fout || s?.fout || null, tekst: s?.tekst || '', n: c && c.ok ? c.n : null, ok: c ? c.ok : false, meldingen: c?.meldingen || [] };
      }),
    };
  }

  function laad({ data, datasets = null, definities = null, bron, drempel = DREMPEL }) {
    stel({ data, datasets, definities, drempel });
    huidig = bron;
    return overzicht(datasetVan(bron));
  }

  /** Na het bewaren van een definitie: alleen de definities opnieuw (de gegevens blijven). */
  function werkDefinitiesBij(definities) {
    invoer.definities = leesDefinities(definities);
    opgebouwd.clear();
    return huidig ? overzicht(datasetVan(huidig)) : null;
  }

  function naamVoorRef(ref) {
    if (ref.startsWith('w:')) {
      const def = invoer.definities.find((x) => x.id === Number(ref.slice(2)));
      if (def) return def.label || def.naam;
    }
    return ref;
  }

  /**
   * Voert een analyse uit. streng: ook bij meningsvragen zonder selectie kleine aantallen verbergen (voor
   * rapporten). Gooit alleen bij "Stoppen" (AbortError); alle andere problemen geven een Uitvoer met een melding.
   */
  async function voerUit(ruweSpec, { voortgang = null, signaal = null, streng = false, nu = vandaag() } = {}) {
    const basis = { procedure: ruweSpec?.procedure || 'onbekend', titel: 'Analyse', gegevens: { datum: nu }, spec: ruweSpec };
    let spec;
    try {
      spec = controleerSpec(ruweSpec);
    } catch (e) {
      if (e instanceof DefinitieFout) return geweigerd(basis, 'fout', e.message);
      throw e;
    }
    basis.spec = spec;
    const procedure = PROCEDURES[spec.procedure];
    if (!procedure) return geweigerd(basis, 'fout', 'Deze analyse kan de werkbank nog niet uitvoeren.');
    if (spec.bron.soort === 'dataset' && !invoer.datasets.has(spec.bron.id)) return geweigerd(basis, 'fout', 'Deze dataset bestaat niet (meer) of is nog niet geladen.');
    const ds = datasetVan(spec.bron);
    if (!ds.n) return geweigerd(basis, 'fout', ds.meldingen[0] || 'Er zijn nog geen antwoorden om te analyseren.');
    const ontbreekt = specRefs(spec).find((r) => !ds.perId.has(r));
    if (ontbreekt) return geweigerd(basis, 'fout', ontbreektTekst(naamVoorRef(ontbreekt)));
    let selectie = null;
    if (spec.filter !== null) {
      const s = maakSelectie(ds, spec.filter);
      if (s.fout) return geweigerd(basis, 'fout', s.fout);
      const c = controleerSelectie(ds, s, invoer.d);
      if (!c.ok) return geweigerd(basis, 'privacy', c.meldingen[0].tekst);
      selectie = s;
    }
    const pauze = async () => {
      if (signaal?.aborted) throw stopFout();
      await new Promise((klaar) => setTimeout(klaar, 0));
      if (signaal?.aborted) throw stopFout();
    };
    const ctx = { d: invoer.d, selectie, streng, nu, voortgang, pauze, signaal };
    await pauze();
    try {
      const u = await procedure.voerUit(ds, spec, ctx);
      return u;
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      // Een fout in de rekenkern zelf: liever een melding dan een kapot scherm.
      if (typeof console !== 'undefined') console.error(e);
      return geweigerd(basis, 'fout', 'Er ging iets mis bij het rekenen. Probeer een andere keuze, of meld het als het steeds gebeurt.');
    }
  }

  /**
   * Voorbeeld en controle bij het maken van een variabele of selectie (D2 §4): al beschermd.
   * def: { id?, soort, naam, label, definitie }. Geeft { ok, voorbeeld: [tekst], meldingen: [tekst] }.
   */
  function controleerIndeling(def, bron = huidig) {
    const d = invoer.d;
    let schoon;
    try {
      schoon = controleerDefinitie(def.soort, def.definitie);
    } catch (e) {
      if (e instanceof DefinitieFout) return { ok: false, voorbeeld: [], meldingen: [e.message] };
      throw e;
    }
    const ds = datasetVan(bron);
    const tijdelijk = { ...def, definitie: schoon, id: def.id ?? -1, verwijderd: false };
    const voorbeeld = [];
    const meldingen = [];
    const iedereen = ds.n;
    if (def.soort === 'filter') {
      const vorige = ds.filters;
      ds.filters = new Map(vorige);
      ds.filters.set(tijdelijk.id, { id: tijdelijk.id, naam: def.naam, label: def.label || def.naam, voorwaarden: schoon.voorwaarden, verwijderd: false });
      try {
        const s = maakSelectie(ds, tijdelijk.id);
        if (s.fout) return { ok: false, voorbeeld, meldingen: [s.fout] };
        const c = controleerSelectie(ds, s, d);
        voorbeeld.push(c.ok ? `Selectie: ${c.n.toLocaleString('nl-NL')} van ${iedereen.toLocaleString('nl-NL')} respondenten` : 'Selectie: niet te gebruiken');
        voorbeeld.push(s.tekst);
        meldingen.push(...c.meldingen.map((m) => m.tekst));
      } finally {
        ds.filters = vorige;
      }
      meldingen.push(...controleerNieuweIndeling(ds, tijdelijk, d));
      return { ok: !meldingen.length, voorbeeld, meldingen };
    }
    if (def.soort === 'eigenschappen') return { ok: true, voorbeeld, meldingen };
    const { v, tekst } = maakVariabele(ds, tijdelijk);
    if (tekst) return { ok: false, voorbeeld, meldingen: [tekst] };
    let geldig = 0;
    const xs = [];
    for (let r = 0; r < ds.n; r++) if (v.reden[r] === REDEN.GELDIG) { geldig++; xs.push(v.waarden[r]); }
    voorbeeld.push(geldig > 0 && geldig < d ? `Geldig: minder dan ${d} respondenten` : `Geldig: ${geldig.toLocaleString('nl-NL')} van ${iedereen.toLocaleString('nl-NL')} respondenten`);
    if (def.soort === 'bereken' && geldig >= d) {
      const b = beschrijving(xs);
      voorbeeld.push(`Gemiddelde ${b.gemiddelde.toLocaleString('nl-NL', { maximumFractionDigits: 2 })}; SD ${b.sd === null ? '–' : b.sd.toLocaleString('nl-NL', { maximumFractionDigits: 2 })}`);
      const items = schoon.variabelen.map((x) => (typeof x === 'string' ? { v: ds.perId.get(x), om: false } : { v: ds.perId.get(x.id), om: x.omscoren }));
      if (items.length >= 2 && ['gemiddelde', 'som'].includes(schoon.functie)) {
        const rijen = [];
        for (let r = 0; r < ds.n; r++) {
          if (!items.every((i) => i.v.reden[r] === REDEN.GELDIG)) continue;
          rijen.push(items.map((i) => (i.om ? i.v.bereik.laag + i.v.bereik.hoog - i.v.waarden[r] : i.v.waarden[r])));
        }
        const a = rijen.length >= 10 ? cronbachAlpha(rijen) : null;
        if (a) voorbeeld.push(`Cronbachs alfa van deze vragen: ${a.alpha.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${a.n} respondenten die alles beantwoordden)`);
      }
      const weg = v.reden.reduce((t, x) => t + (x === REDEN.ONVOLLEDIG ? 1 : 0), 0);
      if (weg > 0) voorbeeld.push(weg < d ? `Minder dan ${d} respondenten vielen weg omdat ze te weinig vragen beantwoordden. Met dit aantal toont de werkbank deze score niet naast het dashboard; kies een lager minimum of laat het zo.` : `${weg} respondenten vielen weg omdat ze te weinig vragen beantwoordden.`);
    }
    if (def.soort === 'hercoderen') {
      const index = new Map(v.labels.map((l, i) => [l.code, i]));
      const aantallen = v.labels.map(() => 0);
      for (let r = 0; r < ds.n; r++) if (v.reden[r] === REDEN.GELDIG) aantallen[index.get(v.waarden[r])]++;
      const weg = verbergReeks(aantallen, d);
      v.labels.forEach((l, i) => voorbeeld.push(`${l.label}: ${weg[i] ? (aantallen[i] === 0 ? '×' : `minder dan ${d}`) : aantallen[i].toLocaleString('nl-NL')}`));
      if (weg.some(Boolean)) voorbeeld.push('× = niet getoond. Groepen met minder dan 5 mensen worden bij analyses samengevoegd met andere.');
      meldingen.push(...controleerNieuweIndeling(ds, tijdelijk, d));
    }
    return { ok: !meldingen.length, voorbeeld, meldingen };
  }

  /** Waarden van een variabele, alleen voor het voorbeeld in een venster: de beschermde groepen met hun labels. */
  function variabele(id, bron = huidig) {
    const ds = datasetVan(bron);
    const v = ds.perId.get(id);
    return v ? metadata(v) : null;
  }

  /** Grenzen voor "gelijke groepen" (mediaan, tertielen, kwartielen) uit de huidige gegevens, afgerond. */
  function gelijkeGroepen(id, aantal, bron = huidig) {
    const ds = datasetVan(bron);
    const v = ds.perId.get(id);
    if (!v) return null;
    const xs = [];
    for (let r = 0; r < ds.n; r++) if (v.reden[r] === REDEN.GELDIG) xs.push(v.waarden[r]);
    if (xs.length < invoer.d * aantal) return null;
    xs.sort((a, b) => a - b);
    const decimalen = xs.every((x) => Number.isInteger(x)) ? 0 : xs.every((x) => Number.isInteger(x * 10)) ? 1 : 2;
    const f = 10 ** decimalen;
    const grenzen = [];
    for (let k = 1; k < aantal; k++) {
      const pos = (xs.length + 1) * (k / aantal);
      const laag = Math.min(xs.length, Math.max(1, Math.floor(pos)));
      const hoog = Math.min(xs.length, Math.ceil(pos));
      const w = xs[laag - 1] + (pos - laag) * (xs[hoog - 1] - xs[laag - 1]);
      const afgerond = Math.round(w * f) / f;
      if (!grenzen.includes(afgerond)) grenzen.push(afgerond);
    }
    return grenzen;
  }

  return {
    stel, laad, werkDefinitiesBij, voerUit, controleerIndeling, variabele, gelijkeGroepen,
    dataset: datasetVan,
    get drempel() { return invoer.d; },
    voorwaardeTekst: (vw, bron = huidig) => voorwaardeTekst(datasetVan(bron), vw),
  };
}

/** De verdeling voor de variabelenlijst (kolom "Waarden"): labels, of het bereik bij een getal. */
function verdelingVoorLijst(v) {
  if (v.labels.length && v.labels.length <= 12) return v.labels.map((l) => l.label).join(' · ');
  if (v.labels.length) return `${v.labels.length} waarden`;
  if (v.bereik) return `${v.bereik.laag} tot ${v.bereik.hoog}`;
  return '';
}

const standaard = maakRekenkern();
export const laad = (opties) => standaard.laad(opties);
export const voerUit = (spec, opties) => standaard.voerUit(spec, opties);
export const controleerIndeling = (def, bron) => standaard.controleerIndeling(def, bron);
