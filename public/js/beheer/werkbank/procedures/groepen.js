// Werkbank: groepen vergelijken – t-toets en variantieanalyse met post-hoc en rangtoetsen (D2 §5.2, §6.3).
// Zuivere module, geen DOM. Fase 5 voegt hier de gepaarde vergelijking (gepaard) aan toe.

import { isIndeling } from '../dataset.js';
import { welchT, cohensD, mannWhitney, anova as anovaToets, welchAnova, kruskalWallis, tCdf, tKwantiel, momenten, rangnummers, effectGrootte } from '../../statistiek.js';
import { ptukeyBoven, qtukey, normaalTweezijdig, bonferroni } from '../verdelingen.js';
import { tabel, cel, tekstCel, voeg, melding, sluitAf, methode } from '../uitvoer.js';
import {
  UITLEG_LEVENE, UITLEG_POSTHOC, ZIN_SIG_VERSCHIL, ZIN_GEEN_SIG_VERSCHIL, ZIN_SIG_GROEPEN, ZIN_GEEN_SIG_GROEPEN, LET_OP_VERSCHIL,
  g, apaZinnen, effectWoord, pWaarde,
} from '../uitvoer-tekst.js';
import { getalFout, begin, weiger, overlapFout, ordinaalMelding, variabelenUit } from './basis.js';
import { groepenVoor, beschrijving } from './beschrijven.js';

const ALFA = 0.05;
const eindig = (x) => typeof x === 'number' && Number.isFinite(x);
/** Alleen de eindige getallen (zoals statistiek.js: de rest telt niet mee). */
const schoon = (xs) => (Array.isArray(xs) || ArrayBuffer.isView(xs) ? Array.from(xs).filter(eindig) : []);
const schoneGroepen = (gs) => (Array.isArray(gs) ? gs.map(schoon) : []);
/** Geeft het object terug, of null als er ergens NaN of Infinity in een getal staat. */
function zonderNaN(x) {
  if (!x) return null;
  for (const w of Object.values(x)) if (typeof w === 'number' && !Number.isFinite(w)) return null;
  return x;
}

/** Toets van Levene: variantieanalyse op |y − midden van de groep| (midden: gemiddelde of mediaan). */
export function levene(ruw, midden = 'gemiddelde') {
  const groepen = schoneGroepen(ruw).filter((xs) => xs.length);
  if (groepen.length < 2) return null;
  const z = groepen.map((xs) => {
    const s = xs.slice().sort((a, b) => a - b);
    const n = s.length;
    const c = midden === 'mediaan' ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : momenten(xs).m;
    return xs.map((x) => Math.abs(x - c));
  });
  const r = anovaToets(z);
  return r ? zonderNaN({ f: r.f, df1: r.df1, df2: r.df2, p: r.p }) : null;
}

/** t-toets met gelijke spreiding (Student, gepoolde variantie); verschil = b − a. */
export function studentT(a, b) {
  const A = momenten(schoon(a));
  const B = momenten(schoon(b));
  if (A.n < 2 || B.n < 2) return null;
  const df = A.n + B.n - 2;
  const sp2 = (A.ss + B.ss) / df;
  if (!(sp2 > 0)) return null;
  const se = Math.sqrt(sp2 * (1 / A.n + 1 / B.n));
  const verschil = B.m - A.m;
  const t = verschil / se;
  const k = tKwantiel(0.975, df);
  const p = 2 * tCdf(-Math.abs(t), df);
  return zonderNaN({ t, df, p: Math.min(1, p), verschil, se, ciLaag: verschil - k * se, ciHoog: verschil + k * se });
}

/** Gemiddelde rang per groep (rangnummers over alle groepen samen). */
function gemiddeldeRangen(groepen) {
  const alles = groepen.flat();
  const { rangen, knopen } = rangnummers(alles);
  const uit = [];
  let start = 0;
  for (const xs of groepen) {
    let s = 0;
    for (let i = start; i < start + xs.length; i++) s += rangen[i];
    uit.push(xs.length ? s / xs.length : null);
    start += xs.length;
  }
  return { rangen: uit, knopen, n: alles.length };
}

/** Games-Howell voor één paar: verschil i − j, SE, df (Welch), p en 95%-interval. */
export function gamesHowellPaar(xi, xj, k, { begin: q0 = null } = {}) {
  const I = momenten(schoon(xi));
  const J = momenten(schoon(xj));
  if (I.n < 2 || J.n < 2) return null;
  const vi = I.ss / (I.n - 1) / I.n;
  const vj = J.ss / (J.n - 1) / J.n;
  const se = Math.sqrt(vi + vj);
  if (!(se > 0)) return null;
  const df = (vi + vj) ** 2 / ((vi * vi) / (I.n - 1) + (vj * vj) / (J.n - 1));
  const verschil = I.m - J.m;
  const q = (Math.abs(verschil) / se) * Math.SQRT2;
  const p = ptukeyBoven(q, k, df);
  const kritiek = qtukey(0.95, k, df, { begin: q0 });
  if (p === null || kritiek === null) return null;
  const marge = (kritiek / Math.SQRT2) * se;
  return zonderNaN({ verschil, se, df, p, ciLaag: verschil - marge, ciHoog: verschil + marge, kritiek });
}

/** Tukey HSD (Tukey–Kramer) voor één paar, met de gezamenlijke variantie binnen de groepen (msw, df = N − k). */
export function tukeyPaar(xi, xj, k, msw, dfw) {
  const I = momenten(schoon(xi));
  const J = momenten(schoon(xj));
  if (!I.n || !J.n || !(msw > 0) || !(dfw > 0)) return null;
  const se = Math.sqrt((msw / 2) * (1 / I.n + 1 / J.n));
  if (!(se > 0)) return null;
  const verschil = I.m - J.m;
  const p = ptukeyBoven(Math.abs(verschil) / se, k, dfw);
  const kritiek = qtukey(0.95, k, dfw);
  if (p === null || kritiek === null) return null;
  return zonderNaN({ verschil, se, p, ciLaag: verschil - kritiek * se, ciHoog: verschil + kritiek * se });
}

/** Dunn (paarsgewijs na Kruskal-Wallis), met correctie voor gelijke waarden; p tweezijdig (normaal). */
export function dunn(ruw) {
  const groepen = schoneGroepen(ruw).filter((xs) => xs.length);
  if (groepen.length < 2) return [];
  const { rangen, knopen, n } = gemiddeldeRangen(groepen);
  const basis = (n * (n + 1)) / 12 - knopen / (12 * (n - 1));
  const paren = [];
  for (let i = 0; i < groepen.length; i++) {
    for (let j = i + 1; j < groepen.length; j++) {
      const se = Math.sqrt(basis * (1 / groepen[i].length + 1 / groepen[j].length));
      const z = se > 0 && Number.isFinite(se) ? (rangen[i] - rangen[j]) / se : null;
      paren.push({ i, j, z, p: z === null ? null : normaalTweezijdig(z) });
    }
  }
  const m = paren.length;
  const bon = bonferroni(paren.map((x) => x.p), m);
  paren.forEach((x, k) => { x.pBonferroni = bon[k]; });
  return paren;
}

/** Klassieke variantieanalyse met de kwadratensommen, η² en ω². */
export function anovaTabel(ruw) {
  const groepen = schoneGroepen(ruw).filter((xs) => xs.length);
  if (groepen.length < 2) return null;
  const ms = groepen.map(momenten);
  const N = ms.reduce((t, x) => t + x.n, 0);
  const k = groepen.length;
  const totaalM = ms.reduce((t, x) => t + x.n * x.m, 0) / N;
  const ssb = ms.reduce((t, x) => t + x.n * (x.m - totaalM) ** 2, 0);
  const ssw = ms.reduce((t, x) => t + x.ss, 0);
  const sst = ssb + ssw;
  const dfb = k - 1;
  const dfw = N - k;
  const r = anovaToets(groepen);
  const msw = dfw > 0 ? ssw / dfw : null;
  const omega = r && msw !== null ? Math.max(0, (ssb - dfb * msw) / (sst + msw)) : null;
  const uit = { ssb, ssw, sst, dfb, dfw, msb: ssb / dfb, msw, f: r?.f ?? null, p: r?.p ?? null, eta2: r ? r.etaKwadraat : null, omega2: omega, N };
  for (const k2 of Object.keys(uit)) if (typeof uit[k2] === 'number' && !Number.isFinite(uit[k2])) uit[k2] = null;
  return uit;
}

function groepVanBronwaarde(w, bron) {
  const i = w.labels.findIndex((l) => String(l.bronwaarde) === String(bron) || (l.bronwaarden || []).some((x) => String(x) === String(bron)));
  return i < 0 ? -1 : w.beschermd.groepVan[i];
}

// ---------- t-toets ----------

export async function ttoets(ds, spec, ctx) {
  const titel = 't-toets voor onafhankelijke groepen';
  const deps = variabelenUit(ds, spec, 'afhankelijk');
  const [{ v: w } = {}] = variabelenUit(ds, spec, 'groep');
  if (!isIndeling(w)) return weiger(ds, spec, ctx, titel, 'fout', `“${w?.label || 'De groepsvariabele'}” is geen indeling met vaste groepen.`);
  const keuze = spec.opties?.groepen || [];
  let [ga, gb] = keuze.map((b) => groepVanBronwaarde(w, b));
  if (!keuze.length) [ga, gb] = [0, 1];
  if (!(ga >= 0) || !(gb >= 0) || ga === gb) return weiger(ds, spec, ctx, titel, 'fout', 'Kies twee verschillende groepen om te vergelijken.');
  const naamA = w.beschermd.groepen[ga].label;
  const naamB = w.beschermd.groepen[gb].label;
  const u = begin(ds, spec, ctx, titel, `Scores: ${deps.map((x) => x.v?.label || x.id).join(', ')}; groepen: “${naamA}” en “${naamB}” van ${w.label}`);
  const overlap = overlapFout(ds, ctx, [w]);
  if (overlap) return weiger(ds, spec, ctx, titel, 'privacy', overlap);
  const midden = spec.opties?.levene === 'mediaan' ? 'mediaan' : 'gemiddelde';
  const metMw = spec.opties?.nonparametrisch !== false;
  const statRijen = [];
  const leveneRijen = [];
  const tRijen = [];
  const dRijen = [];
  const mwRijen = [];
  let nMax = 0;
  let eerste = null;
  for (const { v } of deps) {
    await ctx.pauze();
    const fout = getalFout(v);
    if (fout) { voeg(u, melding('waarschuwing', fout)); continue; }
    const gr = groepenVoor(ds, ctx, v, w);
    if (gr.fout) { voeg(u, melding(gr.niveau, gr.fout)); continue; }
    voeg(u, gr.meldingen);
    if (!gr.mee.includes(ga) || !gr.mee.includes(gb)) {
      voeg(u, melding('privacy', `“${v.label}”: ${[ga, gb].filter((x) => !gr.mee.includes(x)).map((x) => `“${w.beschermd.groepen[x].label}”`).join(' en ')} kan niet meedoen (te weinig respondenten, of terug te rekenen).`));
      continue;
    }
    const a = gr.waarden[ga];
    const b = gr.waarden[gb];
    const A = beschrijving(a);
    const B = beschrijving(b);
    nMax = Math.max(nMax, a.length + b.length);
    statRijen.push([tekstCel(v.label), tekstCel(naamA), cel(A.n, 'aantal'), cel(A.gemiddelde, 'gem'), cel(A.sd, 'gem'), cel(A.se, 'gem')]);
    statRijen.push([tekstCel(''), tekstCel(naamB), cel(B.n, 'aantal'), cel(B.gemiddelde, 'gem'), cel(B.sd, 'gem'), cel(B.se, 'gem')]);
    const lev = levene([a, b], midden);
    leveneRijen.push([tekstCel(v.label), cel(lev?.f, 'stat'), cel(lev?.df1, 'df'), cel(lev?.df2, 'df'), cel(lev?.p, 'p')]);
    const st = studentT(a, b);
    const we = welchT(a, b);
    const seWelch = we ? Math.sqrt(momenten(a).ss / (a.length - 1) / a.length + momenten(b).ss / (b.length - 1) / b.length) : null;
    tRijen.push([tekstCel(v.label), tekstCel('Gelijke spreiding aangenomen'), cel(st?.t, 'stat'), cel(st?.df, 'df'), cel(st?.p, 'p'), cel(st?.verschil, 'gem'), cel(st?.se, 'gem'), tekstCel(st ? `${g(st.ciLaag)} tot ${g(st.ciHoog)}` : '–')]);
    tRijen.push([tekstCel(''), tekstCel('Gelijke spreiding niet aangenomen (Welch, aanbevolen)', { nadruk: true }), cel(we?.t, 'stat'), cel(we?.df, 'df'), cel(we?.p, 'p'), cel(we?.verschil, 'gem'), cel(seWelch, 'gem'), tekstCel(we ? `${g(we.ciLaag)} tot ${g(we.ciHoog)}` : '–')]);
    const d = cohensD(a, b);
    dRijen.push([tekstCel(v.label), cel(d?.d, 'stat'), cel(d?.g, 'stat'), tekstCel(d ? `${g(d.ciLaag)} tot ${g(d.ciHoog)}` : '–')]);
    let mw = null;
    if (metMw) {
      mw = mannWhitney(a, b);
      const { rangen } = gemiddeldeRangen([a, b]);
      mwRijen.push([tekstCel(v.label), cel(rangen[0], 'gem'), cel(rangen[1], 'gem'), cel(mw?.u, 'stat'), cel(mw?.z, 'stat'), cel(mw?.p, 'p'), cel(mw?.r, 'r')]);
    }
    u.toetsen += 1;
    if (!eerste && we) eerste = { v, A, B, we, d, mw, lev };
  }
  if (!statRijen.length) {
    const m = u.onderdelen.find((o) => o.soort === 'melding' && o.niveau !== 'info');
    return weiger(ds, spec, ctx, titel, m?.niveau || 'fout', m?.tekst || 'Er is niets te tonen.');
  }
  u.gegevens.n = nMax;
  voeg(u,
    tabel('groepsstatistieken', 'Groepsstatistieken', ['Score', 'Groep', 'N', 'Gemiddelde', 'SD', 'SE'], statRijen),
    tabel('levene', `Toets van Levene (op basis van ${midden === 'mediaan' ? 'de mediaan' : 'het gemiddelde'})`, ['Score', 'F', 'df1', 'df2', 'p'], leveneRijen, { uitleg: UITLEG_LEVENE }),
    tabel('ttoets', 't-toets voor onafhankelijke groepen', ['Score', 'Aanname', 't', 'df', 'p', 'Verschil', 'SE verschil', '95%-BI'], tRijen,
      { voetnoten: [`Verschil = “${naamB}” min “${naamA}”.`] }),
    tabel('effect', 'Effectgrootte', ['Score', 'Cohens d', 'Hedges’ g', '95%-BI van g'], dRijen),
    metMw ? tabel('mannwhitney', 'Toets van Mann-Whitney (rangnummers)', ['Score', `Gemiddelde rang “${naamA}”`, `Gemiddelde rang “${naamB}”`, 'U', 'z', 'p', 'r'], mwRijen,
      { voetnoten: ['z met continuïteitscorrectie; SPSS toont z zonder die correctie (verschil in de 2e of 3e decimaal).'] }) : null,
    ordinaalMelding(deps.map((x) => x.v).filter(Boolean)));
  methode(u, 'student', 'welch', 'levene', metMw ? 'mannwhitney' : null);
  if (eerste) {
    const { v, A, B, we, d, mw } = eerste;
    const significant = we.p < ALFA;
    const effect = d ? effectGrootte(d.g, 'g') : null;
    u.duiding.significant = significant;
    u.duiding.effect = effect;
    const richting = Math.abs(we.verschil) < 0.005 ? `“${naamA}” en “${naamB}” scoren gemiddeld ongeveer gelijk op “${v.label}”.`
      : `“${we.verschil > 0 ? naamB : naamA}” scoort gemiddeld ${g(Math.abs(we.verschil))} punt hoger op “${v.label}” dan “${we.verschil > 0 ? naamA : naamB}”.`;
    u.duiding.zinnen.push(richting, significant ? ZIN_SIG_VERSCHIL : ZIN_GEEN_SIG_VERSCHIL);
    if (effect) u.duiding.zinnen.push(`Het verschil is ${effectWoord(effect)} (Hedges' g = ${g(d.g)}).`);
    if (mw && (mw.p < ALFA) !== significant) u.duiding.zinnen.push(`De controle met rangnummers (Mann-Whitney, p = ${pWaarde(mw.p)}) komt op een andere conclusie uit. Wees daarom extra voorzichtig.`);
    u.duiding.zinnen.push(UITLEG_LEVENE, LET_OP_VERSCHIL);
    const hoger = we.verschil >= 0;
    u.apa = apaZinnen((f) => {
      const [h, l, Mh, Ml] = hoger ? [naamB, naamA, B, A] : [naamA, naamB, A, B];
      const werkwoord = significant ? `scoorde ${Math.abs(we.verschil) < 0.005 ? 'gelijk' : 'hoger'} op “${v.label}” dan` : `verschilde op “${v.label}” niet significant van`;
      const gTekst = d ? `; *g* = ${f.g(Math.abs(d.g))}, 95%-BI [${f.g(hoger ? d.ciLaag : -d.ciHoog)}; ${f.g(hoger ? d.ciHoog : -d.ciLaag)}]` : '';
      return `De groep “${h}” (*M* = ${f.g(Mh.gemiddelde)}; *SD* = ${f.g(Mh.sd)}) ${werkwoord} de groep “${l}” (*M* = ${f.g(Ml.gemiddelde)}; *SD* = ${f.g(Ml.sd)}), *t*(${f.df(we.df)}) = ${f.g(Math.abs(we.t))}; ${f.p(we.p)}${gTekst}.`;
    });
  }
  return sluitAf(u);
}

// ---------- Variantieanalyse ----------

export async function anova(ds, spec, ctx) {
  const titel = 'Variantieanalyse (ANOVA)';
  const deps = variabelenUit(ds, spec, 'afhankelijk');
  const [{ v: w } = {}] = variabelenUit(ds, spec, 'factor');
  if (!isIndeling(w)) return weiger(ds, spec, ctx, titel, 'fout', `“${w?.label || 'De groepsvariabele'}” is geen indeling met vaste groepen.`);
  const u = begin(ds, spec, ctx, titel, `Scores: ${deps.map((x) => x.v?.label || x.id).join(', ')}; groepen: ${w.label}`);
  const overlap = overlapFout(ds, ctx, [w]);
  if (overlap) return weiger(ds, spec, ctx, titel, 'privacy', overlap);
  const posthoc = spec.opties?.posthoc || 'games-howell';
  const midden = spec.opties?.levene === 'mediaan' ? 'mediaan' : 'gemiddelde';
  const metKw = spec.opties?.nonparametrisch !== false;
  let nMax = 0;
  let iets = false;
  let eerste = null;
  for (const { v } of deps) {
    await ctx.pauze();
    const fout = getalFout(v);
    if (fout) { voeg(u, melding('waarschuwing', fout)); continue; }
    const gr = groepenVoor(ds, ctx, v, w);
    if (gr.fout) { voeg(u, melding(gr.niveau, gr.fout)); continue; }
    voeg(u, gr.meldingen);
    if (gr.mee.length < 2) { voeg(u, melding('privacy', `“${v.label}”: er zijn geen twee groepen met genoeg respondenten.`)); continue; }
    if (gr.mee.length > 12) { voeg(u, melding('waarschuwing', `“${v.label}”: meer dan 12 groepen. Deel de groepen eerst in (Indelen in groepen).`)); continue; }
    const namen = gr.mee.map((i) => gr.naam(i));
    const groepen = gr.mee.map((i) => gr.waarden[i]);
    const k = groepen.length;
    const b = groepen.map(beschrijving);
    const N = groepen.reduce((t, x) => t + x.length, 0);
    nMax = Math.max(nMax, N);
    iets = true;
    const alle = beschrijving(groepen.flat());
    voeg(u, tabel(`beschrijvend-${v.id}`, `“${v.label}” per “${w.label}”`, ['Groep', 'N', 'Gemiddelde', 'SD', 'SE', '95%-BI'],
      [...b.map((x, i) => [tekstCel(namen[i]), cel(x.n, 'aantal'), cel(x.gemiddelde, 'gem'), cel(x.sd, 'gem'), cel(x.se, 'gem'), tekstCel(eindig(x.ciLaag) ? `${g(x.ciLaag)} tot ${g(x.ciHoog)}` : '–')]),
        [tekstCel('Totaal', { nadruk: true }), cel(alle.n, 'aantal'), cel(alle.gemiddelde, 'gem'), cel(alle.sd, 'gem'), cel(alle.se, 'gem'), tekstCel(eindig(alle.ciLaag) ? `${g(alle.ciLaag)} tot ${g(alle.ciHoog)}` : '–')]]));
    const lev = levene(groepen, midden);
    voeg(u, tabel(`levene-${v.id}`, `Toets van Levene (op basis van ${midden === 'mediaan' ? 'de mediaan' : 'het gemiddelde'})`, ['Score', 'F', 'df1', 'df2', 'p'], [[tekstCel(v.label), cel(lev?.f, 'stat'), cel(lev?.df1, 'df'), cel(lev?.df2, 'df'), cel(lev?.p, 'p')]], { uitleg: UITLEG_LEVENE }));
    const at = anovaTabel(groepen) || { ssb: null, ssw: null, sst: null, dfb: null, dfw: null, msb: null, msw: null, f: null, p: null, eta2: null, omega2: null, N };
    voeg(u, tabel(`anova-${v.id}`, 'Variantieanalyse', ['Bron', 'Kwadratensom', 'df', 'Gemiddeld kwadraat', 'F', 'p'], [
      [tekstCel('Tussen groepen'), cel(at.ssb, 'stat'), cel(at.dfb, 'df'), cel(at.msb, 'stat'), cel(at.f, 'stat'), cel(at.p, 'p')],
      [tekstCel('Binnen groepen'), cel(at.ssw, 'stat'), cel(at.dfw, 'df'), cel(at.msw, 'stat'), tekstCel(''), tekstCel('')],
      [tekstCel('Totaal', { nadruk: true }), cel(at.sst, 'stat'), cel(at.N - 1, 'df'), tekstCel(''), tekstCel(''), tekstCel('')],
    ], { voetnoten: [`Effectgrootte: η² = ${g(at.eta2)}; ω² = ${g(at.omega2)}.`] }));
    const wa = welchAnova(groepen);
    voeg(u, tabel(`welch-${v.id}`, 'Toets van Welch (bij ongelijke spreiding)', ['Score', 'F', 'df1', 'df2', 'p'], [[tekstCel(v.label), cel(wa?.f, 'stat'), cel(wa?.df1, 'df'), cel(wa?.df2, 'df'), cel(wa?.p, 'p')]]));
    methode(u, 'anova', 'welchanova', 'levene');
    u.toetsen += 1;
    // Post-hoc (alleen over de getoonde groepen).
    const significantePairs = [];
    const paren = [];
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) paren.push([i, j]);
    if (posthoc === 'games-howell' || posthoc === 'beide') {
      const rijen = [];
      let q0 = null;
      for (let p = 0; p < paren.length; p++) {
        const [i, j] = paren[p];
        if (p % 3 === 0) {
          ctx.voortgang?.(`Bezig met rekenen… (post-hoc ${p + 1} van ${paren.length})`);
          await ctx.pauze();
        }
        const r = gamesHowellPaar(groepen[i], groepen[j], k, { begin: q0 });
        if (r) q0 = r.kritiek;
        rijen.push([tekstCel(namen[i]), tekstCel(namen[j]), cel(r?.verschil, 'gem'), cel(r?.se, 'gem'), cel(r?.p, 'p'), tekstCel(r ? `${g(r.ciLaag)} tot ${g(r.ciHoog)}` : '–')]);
        if (r && r.p < ALFA) significantePairs.push([namen[i], namen[j], r.verschil]);
      }
      voeg(u, tabel(`gh-${v.id}`, 'Post-hoc: Games-Howell', ['Groep I', 'Groep J', 'Verschil (I − J)', 'SE', 'p', '95%-BI'], rijen, { uitleg: UITLEG_POSTHOC }));
      methode(u, 'gameshowell');
      u.toetsen += paren.length;
    }
    if ((posthoc === 'tukey' || posthoc === 'beide') && at.msw > 0) {
      const rijen = [];
      for (let p = 0; p < paren.length; p++) {
        const [i, j] = paren[p];
        if (p % 5 === 0) await ctx.pauze();
        const r = tukeyPaar(groepen[i], groepen[j], k, at.msw, at.dfw);
        rijen.push([tekstCel(namen[i]), tekstCel(namen[j]), cel(r?.verschil, 'gem'), cel(r?.se, 'gem'), cel(r?.p, 'p'), tekstCel(r ? `${g(r.ciLaag)} tot ${g(r.ciHoog)}` : '–')]);
        if (posthoc === 'tukey' && r && r.p < ALFA) significantePairs.push([namen[i], namen[j], r.verschil]);
      }
      voeg(u, tabel(`tukey-${v.id}`, 'Post-hoc: Tukey HSD', ['Groep I', 'Groep J', 'Verschil (I − J)', 'SE', 'p', '95%-BI'], rijen, { uitleg: UITLEG_POSTHOC }));
      methode(u, 'tukey');
      if (posthoc === 'tukey') u.toetsen += paren.length;
    }
    let kw = null;
    if (metKw) {
      await ctx.pauze();
      kw = kruskalWallis(groepen);
      const { rangen } = gemiddeldeRangen(groepen);
      voeg(u, tabel(`kw-${v.id}`, 'Toets van Kruskal-Wallis (rangnummers)', ['Groep', 'N', 'Gemiddelde rang'],
        rangen.map((x, i) => [tekstCel(namen[i]), cel(groepen[i].length, 'aantal'), cel(x, 'gem')]),
        { voetnoten: [kw ? `H = ${g(kw.h)}; df = ${kw.df}; p = ${pWaarde(kw.p)}; ε² = ${g(kw.epsilonKwadraat)}.` : 'De toets is niet te berekenen (alle waarden gelijk).'] }));
      const du = dunn(groepen);
      voeg(u, tabel(`dunn-${v.id}`, 'Dunn (paarsgewijs, na Kruskal-Wallis)', ['Groep I', 'Groep J', 'z', 'p', 'p (Bonferroni)'],
        du.map((x) => [tekstCel(namen[x.i]), tekstCel(namen[x.j]), cel(x.z, 'stat'), cel(x.p, 'p'), cel(x.pBonferroni, 'p')])));
      methode(u, 'kruskal', 'dunn');
    }
    if (!eerste) eerste = { v, at, wa, kw, b, namen, significantePairs };
  }
  if (!iets) {
    const m = u.onderdelen.find((o) => o.soort === 'melding' && o.niveau !== 'info');
    return weiger(ds, spec, ctx, titel, m?.niveau || 'fout', m?.tekst || 'Er is niets te tonen.');
  }
  u.gegevens.n = nMax;
  voeg(u, ordinaalMelding(deps.map((x) => x.v).filter(Boolean)));
  if (eerste) {
    const { v, at, wa, kw, b, namen, significantePairs } = eerste;
    const toets = wa || at;
    const significant = eindig(toets.p) && toets.p < ALFA;
    const effect = effectGrootte(at.eta2, 'eta2');
    u.duiding.significant = significant;
    u.duiding.effect = effect;
    u.duiding.zinnen.push(significant ? ZIN_SIG_GROEPEN : ZIN_GEEN_SIG_GROEPEN);
    const volgorde = b.map((x, i) => ({ naam: namen[i], m: x.gemiddelde })).sort((p, q) => q.m - p.m);
    u.duiding.zinnen.push(`Bij “${v.label}” scoort “${volgorde[0].naam}” het hoogst (gemiddeld ${g(volgorde[0].m)}), het laagst “${volgorde[volgorde.length - 1].naam}” (gemiddeld ${g(volgorde[volgorde.length - 1].m)}).`);
    if (effect) u.duiding.zinnen.push(`De verschillen tussen de groepen zijn ${effectWoord(effect)} (eta² = ${g(at.eta2)}).`);
    if (significantePairs.length) {
      u.duiding.zinnen.push(UITLEG_POSTHOC, `Een duidelijk verschil is er tussen ${significantePairs.slice(0, 5).map(([a, c, dv]) => `“${dv > 0 ? a : c}” en “${dv > 0 ? c : a}” (${dv > 0 ? a : c} hoger)`).join(', ')}.`);
    } else if (posthoc !== 'geen') u.duiding.zinnen.push('De post-hoctoets vindt bij geen enkel paar groepen een duidelijk verschil.');
    if (kw && (kw.p < ALFA) !== significant) u.duiding.zinnen.push('Niet alle toetsen komen op dezelfde conclusie uit. Wees daarom extra voorzichtig.');
    u.duiding.zinnen.push(LET_OP_VERSCHIL);
    u.apa = apaZinnen((f) => (wa
      ? `Er was ${significant ? 'een' : 'geen significant'} verschil tussen de groepen in “${v.label}”, Welch *F*(${f.df(wa.df1)}; ${f.df(wa.df2)}) = ${f.g(wa.f)}; ${f.p(wa.p)}; η² = ${f.begrensd(at.eta2)}.`
      : `Er was ${significant ? 'een' : 'geen significant'} verschil tussen de groepen in “${v.label}”, *F*(${f.df(at.dfb)}; ${f.df(at.dfw)}) = ${f.g(at.f)}; ${f.p(at.p)}; η² = ${f.begrensd(at.eta2)}.`));
  }
  return sluitAf(u);
}
