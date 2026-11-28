// Werkbank: de rekenkern (BOUWPLAN §3.7, K S5). Zuivere module, geen DOM, geen fetch.
// Draait in de browser op de hoofdthread: tussen de rekenstappen geeft hij de browser even de tijd (pauze), zodat
// het scherm bruikbaar blijft, en met een AbortSignal stopt hij ("Stoppen"). In Node draaien dezelfde functies
// (tests, prestaties).
//
// laad({ data, datasets, definities, bron, drempel }) → { variabelen (zonder waarden), n, lijsten, meldingen, … }
// voerUit(spec, { voortgang, signaal, streng, nu }) → Uitvoer (al beschermd)
// controleerIndeling(def, bron) → voorbeeld en meldingen voor de vensters "Variabelen maken"
// maakRekenkern() geeft een eigen exemplaar (de standaardfuncties delen er één).

import { DREMPEL, drempelVan, verbergReeks, VERBORGEN, VERBORGEN_UITLEG } from '../privacy.js';
import { bouwDataset, bronSleutel, metadata, REDEN, isAchtergrond } from './dataset.js';
import { metLijstBuren, verbergMet } from './privacy-selectie.js';
import {
  pasDefinitiesToe, eigenschappenVan, maakSelectie, controleerSelectie, controleerNieuweIndeling, maakVariabele, voorwaardeTekst,
} from './transformaties.js';
import { leesDefinities, controleerSpec, specRefs, DefinitieFout, controleerDefinitie } from './definities.js';
import { PROCEDURES } from './procedures/index.js';
import { geweigerd } from './uitvoer.js';
import { ontbreektTekst } from './procedures/basis.js';
import { beschrijving, selectieGroepenFout } from './procedures/beschrijven.js';
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
    ds.naamVanRef = naamVoorRef;
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
        // Geldig (n): 1 tot 4 wordt × (D2 §11.3). Bij een indeling ook als de beschermde verdeling (antwoorden plus
        // ontbrekende redenen, zoals de frequentietabel en het dashboard) iets verbergt: anders volgt een verborgen
        // aantal uit n min de zichtbare groepen.
        m.geldig = (v.telling.geldig > 0 && v.telling.geldig < d) || verdelingVerbergt(ds, v, d) ? null : v.telling.geldig;
        m.verdeling = verdelingVoorLijst(v);
        return m;
      }),
      filters: [...(ds.filters?.values() || [])].map((f) => {
        const s = f.fout ? null : maakSelectie(ds, f.id);
        const c = s && !s.fout ? controleerSelectie(ds, metBuren(ds, s), d) : null;
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

  /**
   * De naam van een variabele die (misschien) niet meer bestaat, voor de melding bij een bewaarde analyse (D2 §9.1):
   * de tekst van de vraag, de naam van het thema, meetpunt, de code of de kolom, of de omschrijving van een eigen
   * variabele (ook een verwijderde). Onbekend: null (de melding noemt dan geen naam, nooit een intern nummer).
   */
  function naamVoorRef(ref) {
    const data = invoer.data || {};
    const deel = String(ref).split(':');
    const soort = deel[0];
    const nr = Number(deel[1]);
    if (soort === 'w') {
      const def = invoer.definities.find((x) => x.id === nr);
      return def ? def.label || def.naam : null;
    }
    if (soort === 'v') {
      // v:<stam> of v:<stam>:<optie> (een antwoord van een vraag met meerdere antwoorden).
      const q = (data.vragen || []).find((x) => x.id === nr) || (data.vragen || []).find((x) => x.bron_vraag_id === nr);
      if (!q) return null;
      if (deel[2] === undefined) return q.tekst;
      let opties = [];
      try { opties = JSON.parse(q.opties || '[]'); } catch { opties = []; }
      const o = opties.find((x) => String(x.id) === deel[2]);
      return o ? `${q.tekst} – ${o.label}` : q.tekst;
    }
    if (soort === 't') return (data.themas || []).find((x) => x.id === nr)?.naam || null;
    if (soort === 'm') return (data.meetpunten || []).find((x) => x.id === nr)?.naam || null;
    if (soort === 'c') return (data.codes || []).find((x) => x.id === Number(String(deel[1]).split('@')[0]))?.naam || null;
    if (soort === 'sys') return deel[1] === 'meetmoment' ? 'Meetmoment' : 'Vragenlijst';
    if (soort === 'd') {
      for (const dset of invoer.datasets.values()) if (dset?.kolommen?.[nr] !== undefined) return String(dset.kolommen[nr]);
      return null;
    }
    return null;
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
      const c = controleerSelectie(ds, metBuren(ds, s), invoer.d);
      if (!c.ok) return geweigerd(basis, 'privacy', c.meldingen[0].tekst);
      selectie = s;
    }
    // Alle vragenlijsten onder elkaar: elke vragenlijst apart is een buur (regel D tussen bronnen). Wat je hier
    // ziet, mag nooit 1 tot 4 mensen verschillen van hetzelfde bij één vragenlijst.
    selectie = metBuren(ds, selectie);
    // P1: een selectie op een indeling mag geen groep losmaken die bij deze variabelen samen met andere verborgen blijft.
    if (selectie && !selectie.impliciet) {
      const fout = selectieGroepenFout(ds, { d: invoer.d, selectie: metBuren(ds, null), streng, nu }, selectie, specRefs(spec));
      if (fout) return geweigerd(basis, 'privacy', fout);
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
        const c = controleerSelectie(ds, metBuren(ds, s), d);
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
    if (def.soort !== 'hercoderen') voorbeeld.push(geldig > 0 && geldig < d ? `Geldig: minder dan ${d} respondenten` : `Geldig: ${geldig.toLocaleString('nl-NL')} van ${iedereen.toLocaleString('nl-NL')} respondenten`);
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
      // De groepen met hun aantallen, beschermd zoals een frequentietabel van een indeling: antwoorden en ontbrekende
      // redenen in één reeks (zoals het dashboard), en bij alle vragenlijsten onder elkaar ook tegenover elke
      // vragenlijst apart. Elke verborgen groep is ×, of hij nu leeg, klein of ter bescherming verborgen is (PR-22).
      // Is er iets verborgen, dan staat het aantal geldig er niet bij (anders volgt het verborgen aantal eruit).
      const { aantallen, verborgen, ietsWeg } = beschermdeGroepen(ds, v, d);
      if (!ietsWeg) voorbeeld.push(`Geldig: ${geldig.toLocaleString('nl-NL')} van ${iedereen.toLocaleString('nl-NL')} respondenten`);
      v.labels.forEach((l, i) => voorbeeld.push(`${l.label}: ${verborgen[i] ? VERBORGEN : aantallen[i].toLocaleString('nl-NL')}`));
      if (ietsWeg) voorbeeld.push(VERBORGEN_UITLEG, 'Kleine groepen worden bij analyses samengevoegd met andere.');
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

/** Bij een gestapelde bron (twee of meer vragenlijsten): de selectie met de buren "alleen/zonder vragenlijst k". */
function metBuren(ds, selectie) {
  return ds.bron?.soort === 'gestapeld' && ds.lijsten.length >= 2 ? metLijstBuren(selectie, ds.rijLijst, ds.lijsten) : selectie;
}

/** De buren "alleen/zonder vragenlijst k" van een gestapelde bron (zonder eigen selectie), of null. */
function lijstBurenVan(ds) {
  return ds.bron?.soort === 'gestapeld' && ds.lijsten.length >= 2 ? metLijstBuren(null, ds.rijLijst, ds.lijsten) : null;
}

/** Aantallen per categorie en per ontbrekende reden (zonder "Niet gevraagd": dat volgt uit de vragenlijsten). */
function tellingen(ds, v, masker = null) {
  const index = new Map(v.labels.map((l, i) => [l.code, i]));
  const cat = new Array(v.labels.length).fill(0);
  const mis = new Array(6).fill(0);
  for (let r = 0; r < ds.n; r++) {
    if (masker && !masker[r]) continue;
    if (v.reden[r] === REDEN.GELDIG) {
      const i = index.get(v.waarden[r]);
      if (i !== undefined) cat[i]++;
    } else mis[v.reden[r]]++;
  }
  const missend = mis.filter((_, reden) => reden > 0 && reden !== REDEN.NIET_GEVRAAGD);
  return { cat, missend };
}

/**
 * De groepen van een (nieuwe) indeling, beschermd voor het voorbeeld: categorieën plus ontbrekende redenen in één
 * reeks, met de vragenlijsten van een gestapelde bron als buren (regel D).
 * @returns {{ aantallen: number[], verborgen: boolean[] }} per categorie
 */
function beschermdeGroepen(ds, v, d) {
  const { cat, missend } = tellingen(ds, v);
  const reeks = [...cat, ...missend];
  const buren = lijstBurenVan(ds);
  const vooraf = reeks.map(() => false);
  const verschillen = [];
  for (const b of buren?.buren || []) {
    const t = tellingen(ds, v, b.masker);
    const verschil = [...t.cat, ...t.missend].map((x, i) => Math.abs(x - reeks[i]));
    verschil.forEach((x, i) => { if (x > 0 && x < d) vooraf[i] = true; });
    verschillen.push(verschil);
  }
  const weg = verbergMet(reeks, d, { vooraf, verschillen });
  return { aantallen: cat, verborgen: weg.slice(0, cat.length), ietsWeg: weg.some(Boolean) };
}

/**
 * Verbergt de beschermde verdeling van indeling v het aantal geldig? Dat is zo als de frequentietabel (zonder
 * selectie) het totaal geldig zou verbergen: bij een achtergrondvraag als er in de reeks antwoorden plus ontbrekende
 * redenen een ontbrekende reden verborgen is (zoals "Niet ingevuld" op het dashboard), bij een andere indeling als
 * een ontbrekende reden verborgen is. Bij een gestapelde bron geldt dat ook per vragenlijst.
 */
function verdelingVerbergt(ds, v, d) {
  if (!v.groepering || !v.labels.length || v.soort === 'set' || !v.analyseerbaar) return false;
  const achtergrond = isAchtergrond(v);
  const scopes = [null];
  const buren = lijstBurenVan(ds);
  for (const b of buren?.buren || []) scopes.push(b.masker);
  for (const masker of scopes) {
    const { cat, missend } = tellingen(ds, v, masker);
    if (!missend.length) continue;
    const weg = achtergrond ? verbergReeks([...cat, ...missend], d).slice(cat.length) : verbergReeks(missend, d);
    if (weg.some(Boolean)) return true;
  }
  return false;
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
