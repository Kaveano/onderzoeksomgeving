// Werkbank: gedeelde bouwstenen voor de procedures. Zuivere module, geen DOM.
// Elke procedure krijgt (ds, spec, ctx) met ctx = { d, selectie (of null), streng, nu, voortgang, pauze }:
// - ds: de dataset (dataset.js + transformaties.js);
// - selectie: { F, buren, tekst } van de gekozen selectie (regel D), of null voor iedereen;
// - streng: true bij het vastleggen in een rapport: dan worden ook bij meningsvragen zonder selectie de aantallen
//   1 tot 4 verborgen (B26 geldt alleen op het eigen scherm), zodat kleinste_n altijd minstens 5 is;
// - pauze(): geeft de browser even de tijd (en stopt bij "Stoppen"); voortgang(tekst) meldt hoe ver het is.

import { REDEN, isGetal } from '../dataset.js';
import { verdeelInGroepen, verbergReeks, DREMPEL } from '../../privacy.js';
import { selectieFout } from '../privacy-selectie.js';
import { controleerWortels, P_FILTER_REST, pFilterBuur } from '../transformaties.js';
import { maakUitvoer, geweigerd, melding } from '../uitvoer.js';
import { P_INDELING_ALS_GETAL, P_ORDINAAL, P_OPEN } from '../uitvoer-tekst.js';

/** 1 = rij heeft op alle variabelen een geldige waarde. */
export function geldigMasker(ds, variabelen) {
  const m = new Uint8Array(ds.n).fill(1);
  for (const v of variabelen) for (let r = 0; r < ds.n; r++) if (v.reden[r] !== REDEN.GELDIG) m[r] = 0;
  return m;
}

/** Rijen die in de basis en in de selectie zitten. */
export function inSelectie(basis, selectie) {
  if (!selectie) return basis;
  const m = new Uint8Array(basis.length);
  for (let r = 0; r < basis.length; r++) m[r] = basis[r] && selectie.F[r] ? 1 : 0;
  return m;
}

export const iedereen = (ds) => new Uint8Array(ds.n).fill(1);
export const tel = (m) => { let n = 0; for (let r = 0; r < m.length; r++) if (m[r]) n++; return n; };

/** Per rij het nummer van de beschermde groep van indeling v (−1 = geen geldige waarde of geen groep). */
export function groepVanRijen(ds, v) {
  const index = new Map(v.labels.map((l, i) => [l.code, i]));
  const groep = new Int32Array(ds.n).fill(-1);
  for (let r = 0; r < ds.n; r++) {
    if (v.reden[r] !== REDEN.GELDIG) continue;
    const i = index.get(v.waarden[r]);
    if (i !== undefined) groep[r] = v.beschermd.groepVan[i];
  }
  return groep;
}

/**
 * Welke groepen meedoen (strategie 'weglaten' van privacy.js): groepen onder d doen niet mee, en ook groepen die
 * door een andere regel (D, B6, B7) niet getoond mogen worden; telt wat verborgen blijft samen 1 tot d − 1, dan
 * gaat ook de kleinste meedoende groep eruit.
 * @returns {{ mee: number[], klein: number[], ookNiet: number[], uitgesloten: number[] }}
 */
export function kiesGroepen(aantallen, { extraVerborgen = 0, uitgesloten = [], d = DREMPEL } = {}) {
  const extra = extraVerborgen + aantallen.reduce((t, n, i) => t + (uitgesloten[i] ? n : 0), 0);
  const kandidaten = aantallen.map((n, i) => ({ sleutel: i, label: String(i), n })).filter((g) => !uitgesloten[g.sleutel]);
  const r = verdeelInGroepen(kandidaten, { d, strategie: 'weglaten', extraVerborgen: extra });
  return {
    mee: r.zichtbaar.map((z) => z.sleutel),
    klein: r.weggelaten.filter((w) => w.reden === 'klein').map((w) => w.sleutel),
    ookNiet: r.weggelaten.filter((w) => w.reden === 'terugrekenen').map((w) => w.sleutel),
    uitgesloten: aantallen.map((_, i) => i).filter((i) => uitgesloten[i]),
  };
}

/** De melding bij een selectie die regel D niet doorstaat. */
export function selectieMelding(fout) {
  return fout.soort === 'rest' ? P_FILTER_REST : pFilterBuur(fout.tekst);
}

/** Regel D voor het geheel; null of de tekst. */
export function selectieControle(ctx, basis) {
  const f = selectieFout(ctx.selectie, basis, ctx.d);
  return f ? selectieMelding(f) : null;
}

/**
 * B26: een indeling (kenmerk, eigen indeling, vragenlijst, code …) als getal gebruiken mag alleen als haar
 * verdeling in de basis geen kleine groep heeft; anders volgen de aantallen uit gemiddelde, spreiding en vorm.
 */
export function indelingAlsGetalFout(v, basis, d = DREMPEL) {
  if (!v.groepering) return null;
  const tellingen = new Map();
  for (let r = 0; r < basis.length; r++) if (basis[r]) tellingen.set(v.waarden[r], (tellingen.get(v.waarden[r]) || 0) + 1);
  return verbergReeks([...tellingen.values()], d).some(Boolean) ? P_INDELING_ALS_GETAL(v.label) : null;
}

/** Kan v als getal? Anders de melding. */
export function getalFout(v) {
  if (!v) return 'Deze variabele bestaat niet (meer).';
  if (!isGetal(v)) return `“${v.label}” is geen getal. Kies een variabele met het meetniveau ordinaal of interval, of pas het meetniveau aan bij Variabelen.`;
  return null;
}

/** Omschrijving van de gegevensbron. */
export function bronTekst(ds) {
  if (ds.bron.soort === 'dataset') return `Dataset: ${ds.dataset?.naam || ''}`;
  if (ds.bron.soort === 'gestapeld') return 'Alle vragenlijsten samen';
  return ds.lijsten[0] ? `Vragenlijst: ${ds.lijsten[0].naam}` : 'Vragenlijst';
}

/** De basis van een Uitvoer (gegevens, titel, spec), met meldingen over open vragenlijsten. */
export function begin(ds, spec, ctx, titel, instellingen) {
  const u = maakUitvoer({
    procedure: spec.procedure,
    titel,
    gegevens: {
      bron: bronTekst(ds),
      selectie: ctx.selectie ? ctx.selectie.tekst : null,
      n: null,
      datum: ctx.nu,
      open: ds.lijsten.some((l) => l.open),
      instellingen,
    },
    spec,
  });
  for (const l of ds.lijsten) if (l.open) u.onderdelen.push(melding('info', P_OPEN(l.titel)));
  return u;
}

/** Een geweigerde uitvoer met dezelfde gegevens. */
export function weiger(ds, spec, ctx, titel, niveau, tekst) {
  const u = geweigerd({ procedure: spec.procedure, titel, gegevens: { bron: bronTekst(ds), selectie: ctx.selectie ? ctx.selectie.tekst : null, datum: ctx.nu, open: ds.lijsten.some((l) => l.open) }, spec }, niveau, tekst);
  return u;
}

/** Regel E voor de indelingen die deze analyse gebruikt (groepsvariabelen en selectievoorwaarden). */
export function overlapFout(ds, ctx, indelingen) {
  const vars = [...indelingen];
  if (ctx.selectie?.voorwaarden) for (const vw of ctx.selectie.voorwaarden) if (vw.variabele) vars.push(ds.perId.get(vw.variabele));
  return controleerWortels(ds, vars.filter(Boolean), ctx.d);
}

/** Melding als ordinale variabelen als getal worden gebruikt. */
export function ordinaalMelding(variabelen) {
  return variabelen.some((v) => v.meetniveau === 'ordinaal') ? melding('info', P_ORDINAAL) : null;
}

/** Waarden van rijen in een masker. */
export function waardenIn(v, masker) {
  const uit = [];
  for (let r = 0; r < masker.length; r++) if (masker[r]) uit.push(v.waarden[r]);
  return uit;
}

/** Waarden per groep (rijen in masker met groep ≥ 0). */
export function waardenPerGroep(v, masker, groep, aantal) {
  const uit = Array.from({ length: aantal }, () => []);
  for (let r = 0; r < masker.length; r++) if (masker[r] && groep[r] >= 0) uit[groep[r]].push(v.waarden[r]);
  return uit;
}

/** Variabelen uit een slot van de spec (één of meer ids). */
export function variabelenUit(ds, spec, slot) {
  const w = spec.variabelen?.[slot];
  const ids = w === undefined ? [] : Array.isArray(w) ? w : [w];
  return ids.map((id) => ({ id, v: ds.perId.get(id) || null }));
}

export const ontbreektTekst = (id) => `Deze analyse gebruikt een variabele die niet meer bestaat: “${id}”. Pas de analyse aan of verwijder hem.`;
