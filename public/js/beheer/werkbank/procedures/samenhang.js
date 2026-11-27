// Werkbank: correlatiematrix (Pearson en Spearman, paarsgewijs of lijstgewijs, Holm) (D2 §5.2).
// Zuivere module, geen DOM. Op een telefoon toont de weergave de paren als lijst (gesorteerd op |r|).

import { REDEN } from '../dataset.js';
import { pearson, spearman, effectGrootte } from '../../statistiek.js';
import { tweeWaardenRegel, selectieFout, weggevallenRegel } from '../privacy-selectie.js';
import { holm } from '../verdelingen.js';
import { tabel, cel, tekstCel, verborgenCel, voeg, melding, sluitAf, methode } from '../uitvoer.js';
import { ZIN_SIG_VERBAND, ZIN_GEEN_SIG_VERBAND, LET_OP_VERBAND, g, apaZinnen, effectWoord, P_WEGGEVALLEN } from '../uitvoer-tekst.js';
import { getalFout, begin, weiger, ordinaalMelding, variabelenUit, indelingAlsGetalFout, inSelectie, iedereen } from './basis.js';

const ALFA = 0.05;
const MIN_PAAR = 10;
const eindig = (x) => typeof x === 'number' && Number.isFinite(x);
const ster = (p) => (eindig(p) ? (p < 0.01 ? '**' : p < 0.05 ? '*' : undefined) : undefined);

export async function correlatie(ds, spec, ctx) {
  const titel = 'Correlatiematrix';
  const lijst = variabelenUit(ds, spec, 'variabelen');
  const methodeKeuze = spec.opties?.methode || 'pearson';
  const lijstgewijs = spec.opties?.ontbrekend === 'lijstgewijs';
  const metHolm = spec.opties?.holm === true;
  const u = begin(ds, spec, ctx, titel, `Variabelen: ${lijst.map((x) => x.v?.label || x.id).join(', ')}; ${methodeKeuze}; ${lijstgewijs ? 'lijstgewijs' : 'paarsgewijs'}`);
  const vars = [];
  for (const { v } of lijst) {
    const fout = getalFout(v);
    if (fout) voeg(u, melding('waarschuwing', fout));
    else vars.push(v);
  }
  if (vars.length < 2) return weiger(ds, spec, ctx, titel, 'fout', 'Kies minstens twee variabelen die als getal te gebruiken zijn.');
  const k = vars.length;
  const F = ctx.selectie ? ctx.selectie.F : null;
  // Lijstgewijs: alleen rijen met een geldige waarde op alle variabelen.
  let alleGeldig = null;
  if (lijstgewijs) {
    alleGeldig = new Uint8Array(ds.n).fill(1);
    for (const v of vars) for (let r = 0; r < ds.n; r++) if (v.reden[r] !== REDEN.GELDIG) alleGeldig[r] = 0;
  }
  // Per variabele: mag hij als getal (B26) en is B7 in orde?
  const uitgesloten = vars.map((v) => {
    const basis = inSelectie(alleGeldig || Uint8Array.from(v.reden, (x) => (x === REDEN.GELDIG ? 1 : 0)), ctx.selectie);
    const t = indelingAlsGetalFout(v, basis, ctx.d, F);
    if (t) return t;
    if (v.score && weggevallenRegel(v.reden, F || iedereen(ds), null, 1, ctx.d)[0]) return `“${v.label}”: ${P_WEGGEVALLEN}.`;
    return null;
  });
  for (const t of new Set(uitgesloten.filter(Boolean))) voeg(u, melding('privacy', t));
  const paren = [];
  const rpMatrix = Array.from({ length: k }, () => new Array(k).fill(null));
  let teller = 0;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      if (++teller % 40 === 0) {
        ctx.voortgang?.(`Bezig met rekenen… (paar ${teller} van ${(k * (k - 1)) / 2})`);
        await ctx.pauze();
      }
      const a = vars[i];
      const b = vars[j];
      const paar = { i, j, a: a.label, b: b.label, n: 0, r: null, p: null, rho: null, pRho: null, verborgen: false, teWeinig: false };
      paren.push(paar);
      if (uitgesloten[i] || uitgesloten[j]) { paar.verborgen = true; continue; }
      const geldigAlles = new Uint8Array(ds.n);
      for (let r = 0; r < ds.n; r++) geldigAlles[r] = (alleGeldig ? alleGeldig[r] : a.reden[r] === REDEN.GELDIG && b.reden[r] === REDEN.GELDIG) ? 1 : 0;
      const basis = inSelectie(geldigAlles, ctx.selectie);
      const xs = [];
      const ys = [];
      for (let r = 0; r < ds.n; r++) if (basis[r]) { xs.push(a.waarden[r]); ys.push(b.waarden[r]); }
      paar.n = xs.length;
      if (xs.length < MIN_PAAR) { paar.teWeinig = true; continue; }
      // Regel D per paar; een variabele met twee waarden in dit paar: elke waarde minstens d (regel C, B6).
      if (selectieFout(ctx.selectie, geldigAlles, ctx.d)) { paar.verborgen = true; continue; }
      if (tweeWaardenRegel(a.waarden, basis, null, 1, ctx.d)?.[0] || tweeWaardenRegel(b.waarden, basis, null, 1, ctx.d)?.[0]) { paar.verborgen = true; continue; }
      if (methodeKeuze !== 'spearman') {
        const pr = pearson(xs, ys);
        if (pr) { paar.r = pr.r; paar.p = pr.p; paar.df = pr.df; }
      }
      if (methodeKeuze !== 'pearson') {
        const sp = spearman(xs, ys);
        if (sp) { paar.rho = sp.rho; paar.pRho = sp.p; }
      }
    }
  }
  if (metHolm) {
    const hp = holm(paren.map((x) => x.p));
    const hr = holm(paren.map((x) => x.pRho));
    paren.forEach((x, i) => { x.pHolm = hp[i]; x.pRhoHolm = hr[i]; });
  }
  const zichtbaar = paren.filter((x) => !x.verborgen && !x.teWeinig && (eindig(x.r) || eindig(x.rho)));
  if (!zichtbaar.length) return weiger(ds, spec, ctx, titel, 'privacy', 'Geen enkel paar heeft genoeg respondenten (minstens 10) om een correlatie te tonen.');
  const pVan = (x, soort) => (soort === 'r' ? (metHolm ? x.pHolm : x.p) : (metHolm ? x.pRhoHolm : x.pRho));
  for (const x of paren) rpMatrix[x.i][x.j] = x;
  const matrix = (soort) => {
    const rijen = vars.map((v, i) => [tekstCel(v.label), ...vars.map((_, j) => {
      if (i === j) return cel(1, 'r');
      const x = i < j ? rpMatrix[i][j] : rpMatrix[j][i];
      if (x.verborgen) return verborgenCel('r');
      if (x.teWeinig) return tekstCel('·');
      const w = soort === 'r' ? x.r : x.rho;
      return cel(w, 'r', { ster: ster(pVan(x, soort)) });
    })]);
    const p = vars.map((v, i) => [tekstCel(v.label), ...vars.map((_, j) => {
      if (i === j) return tekstCel('');
      const x = i < j ? rpMatrix[i][j] : rpMatrix[j][i];
      if (x.verborgen) return verborgenCel('p');
      if (x.teWeinig) return tekstCel('·');
      return cel(pVan(x, soort), 'p');
    })]);
    const n = vars.map((v, i) => [tekstCel(v.label), ...vars.map((_, j) => {
      if (i === j) return tekstCel('');
      const x = i < j ? rpMatrix[i][j] : rpMatrix[j][i];
      return x.verborgen ? verborgenCel('aantal') : x.teWeinig ? tekstCel('·') : cel(x.n, 'aantal');
    })]);
    const naam = soort === 'r' ? 'Pearson' : 'Spearman';
    const lijstParen = paren.map((x) => ({ a: x.a, b: x.b, r: soort === 'r' ? x.r : x.rho, p: pVan(x, soort), n: x.n, ster: ster(pVan(x, soort)), verborgen: x.verborgen, teWeinig: x.teWeinig }));
    return [
      tabel(`correlatie-${soort}`, `Correlaties (${naam})`, ['', ...vars.map((v) => v.naam)], rijen, {
        weergave: 'matrix', maat: soort === 'r' ? 'r' : 'ρ', paren: lijstParen,
        voetnoten: [`* p < 0,05; ** p < 0,01 (tweezijdig${metHolm ? ', gecorrigeerd met Holm' : ''}). · = niet te berekenen (minder dan ${MIN_PAAR} respondenten met beide waarden).`, `Kolommen: ${vars.map((v) => `${v.naam} = ${v.label}`).join('; ')}.`],
      }),
      tabel(`correlatie-${soort}-p`, `p-waarden (${naam}${metHolm ? ', Holm' : ''})`, ['', ...vars.map((v) => v.naam)], p, { verborgenStandaard: true }),
      tabel(`correlatie-${soort}-n`, `Aantal respondenten per paar (${naam})`, ['', ...vars.map((v) => v.naam)], n, { verborgenStandaard: true }),
    ];
  };
  if (methodeKeuze !== 'spearman') { voeg(u, matrix('r')); methode(u, 'pearson'); }
  if (methodeKeuze !== 'pearson') { voeg(u, matrix('rho')); methode(u, 'spearman'); }
  if (metHolm) methode(u, 'holm');
  u.toetsen = zichtbaar.length * (methodeKeuze === 'beide' ? 2 : 1);
  u.gegevens.n = Math.max(...zichtbaar.map((x) => x.n));
  voeg(u, ordinaalMelding(vars));
  // Uitleg: de sterkste samenhang in woorden.
  const soort = methodeKeuze === 'spearman' ? 'rho' : 'r';
  const sterkste = zichtbaar.filter((x) => eindig(soort === 'r' ? x.r : x.rho)).sort((x, y) => Math.abs(soort === 'r' ? y.r : y.rho) - Math.abs(soort === 'r' ? x.r : x.rho))[0];
  if (sterkste) {
    const r = soort === 'r' ? sterkste.r : sterkste.rho;
    const p = pVan(sterkste, soort);
    const effect = effectGrootte(r, 'r');
    u.duiding.significant = p < ALFA;
    u.duiding.effect = effect;
    u.duiding.zinnen.push('Een correlatie loopt van −1 tot 1. Hoe verder van 0, hoe sterker de samenhang; een min betekent: als het ene hoger is, is het andere meestal lager.',
      effect === 'verwaarloosbaar'
        ? `Het sterkste verband is nog nauwelijks een verband: “${sterkste.a}” en “${sterkste.b}” (${soort === 'r' ? 'r' : 'ρ'} = ${g(r)}).`
        : `Het sterkste verband is tussen “${sterkste.a}” en “${sterkste.b}”: hoe hoger het een, hoe ${r > 0 ? 'hoger' : 'lager'} meestal het ander (verband: ${effectWoord(effect)}, ${soort === 'r' ? 'r' : 'ρ'} = ${g(r)}).`,
      p < ALFA ? ZIN_SIG_VERBAND : ZIN_GEEN_SIG_VERBAND, LET_OP_VERBAND);
    u.apa = apaZinnen((f) => (soort === 'r'
      ? `“${sterkste.a}” en “${sterkste.b}” hingen ${p < ALFA ? '' : 'niet significant '}samen, *r*(${f.df(sterkste.df)}) = ${f.begrensd(r)}; ${f.p(p)}.`
      : `“${sterkste.a}” en “${sterkste.b}” hingen ${p < ALFA ? '' : 'niet significant '}samen, *r*ₛ = ${f.begrensd(r)}; ${f.p(p)}; *n* = ${f.n(sterkste.n)}.`));
  }
  return sluitAf(u);
}
